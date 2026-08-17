/**
 * Eksport aktualnych danych turnieju z Airtable do fixtures/.
 *
 * Uruchomienie:  npm run fixtures:export
 *
 * Zapisuje SUROWE rekordy Airtable (przed mapowaniem), dzięki czemu testy
 * golden-master przechodzą przez tę samą ścieżkę mapowania co produkcja.
 *
 * Bezpieczeństwo:
 *  - nie zapisuje żadnych sekretów ani wartości zmiennych środowiskowych,
 *  - podpisane URL-e załączników Airtable są redagowane (wygasają i zawierają
 *    tokeny dostępu) — w ich miejsce trafia stabilny placeholder.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const fixturesDir = path.join(projectRoot, "fixtures");

function loadEnvFile() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

const TABLES = {
  tournaments: process.env.AIRTABLE_TOURNAMENTS_TABLE ?? "Tournaments",
  teams: process.env.AIRTABLE_TEAMS_TABLE ?? "Teams",
  matches: process.env.AIRTABLE_MATCHES_TABLE ?? "Matches",
  scorers: process.env.AIRTABLE_SCORERS_TABLE ?? "Scorers",
};

if (!BASE_ID || !TOKEN) {
  console.error(
    "Brak AIRTABLE_BASE_ID lub AIRTABLE_TOKEN. Uzupełnij .env i spróbuj ponownie."
  );
  process.exit(1);
}

async function fetchAll(table, params = {}) {
  const records = [];
  let offset;
  let pages = 0;

  do {
    const search = new URLSearchParams(params);
    if (offset) search.set("offset", offset);

    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(
      table
    )}?${search.toString()}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Airtable ${table} ${response.status}: ${detail}`);
    }

    const json = await response.json();
    records.push(...(json.records ?? []));
    offset = json.offset;
    pages += 1;
  } while (offset && pages < 50);

  return { records, pages };
}

const ATTACHMENT_FIELDS = new Set([
  "logo",
  "scheduleImage",
  "regulationImage",
  "heroBannerImage",
  "campBannerImage",
  "campPosterLeft",
  "campPosterRight",
]);

/**
 * Zamienia podpisane URL-e Airtable na stabilny, nieaktywny placeholder.
 *
 * Załącznik jest przepisywany od zera, a nie kopiowany — Airtable dokłada
 * zagnieżdżone `thumbnails.*.url`, które również są podpisanymi adresami.
 * Zachowujemy wyłącznie pola, z których faktycznie korzysta mapper.
 */
function redactAttachments(records) {
  return records.map((record) => {
    const fields = { ...record.fields };

    for (const [key, value] of Object.entries(fields)) {
      if (!ATTACHMENT_FIELDS.has(key) || !Array.isArray(value)) continue;

      fields[key] = value.map((attachment, index) => ({
        id: `att-fixture-${index}`,
        url: `https://fixture.invalid/${encodeURIComponent(
          attachment?.filename ?? `${key}-${index}`
        )}`,
        filename: attachment?.filename,
        type: attachment?.type,
      }));
    }

    return { id: record.id, fields };
  });
}

async function main() {
  const tournaments = await fetchAll(TABLES.tournaments, {
    filterByFormula: "{isActive}=TRUE()",
    maxRecords: "1",
  });

  const tournamentRecord = tournaments.records[0];

  if (!tournamentRecord) {
    console.error("Brak aktywnego turnieju w Airtable — nie ma czego wyeksportować.");
    process.exit(1);
  }

  const slug = tournamentRecord.fields.slug;

  if (!slug) {
    console.error("Aktywny turniej nie ma pola slug.");
    process.exit(1);
  }

  const teams = await fetchAll(TABLES.teams, {
    filterByFormula: `{tournamentSlug}="${slug}"`,
    "sort[0][field]": "group",
    "sort[0][direction]": "asc",
    "sort[1][field]": "sourceOrder",
    "sort[1][direction]": "asc",
  });

  const matches = await fetchAll(TABLES.matches, {
    filterByFormula: `{tournamentSlug}="${slug}"`,
    "sort[0][field]": "group",
    "sort[0][direction]": "asc",
  });

  const scorers = await fetchAll(TABLES.scorers, {
    filterByFormula: `{tournamentSlug}="${slug}"`,
    "sort[0][field]": "goals",
    "sort[0][direction]": "desc",
    "sort[1][field]": "playerName",
    "sort[1][direction]": "asc",
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Surowe rekordy Airtable. URL-e zalacznikow zredagowane. Bez sekretow.",
    slug,
    tournamentRecord: redactAttachments([tournamentRecord])[0],
    teamRecords: redactAttachments(teams.records),
    matchRecords: redactAttachments(matches.records),
    scorerRecords: redactAttachments(scorers.records),
  };

  fs.mkdirSync(fixturesDir, { recursive: true });

  const outputPath = path.join(fixturesDir, "airtable-raw.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("Zapisano:", path.relative(projectRoot, outputPath));
  console.log(`  slug:     ${slug}`);
  console.log(`  teams:    ${teams.records.length} (stron: ${teams.pages})`);
  console.log(`  matches:  ${matches.records.length} (stron: ${matches.pages})`);
  console.log(`  scorers:  ${scorers.records.length} (stron: ${scorers.pages})`);

  if (teams.pages > 1 || matches.pages > 1 || scorers.pages > 1) {
    console.log(
      "\n  UWAGA: któraś tabela przekroczyła 100 rekordów — poprzednia wersja kodu gubiła nadmiar."
    );
  }
}

main().catch((error) => {
  console.error("Eksport nie powiódł się:", error.message);
  process.exit(1);
});
