/**
 * AUDYT ISTNIEJĄCYCH LOGOTYPÓW DRUŻYN.
 *
 * WYŁĄCZNIE ODCZYT. Skrypt nie zapisuje niczego w bazie, nie dotyka
 * Cloudinary i niczego nie kasuje. Jego jedynym produktem jest raport.
 *
 * Uruchomienie:
 *   npm run logos:audit          (z pobraniem plików i policzeniem hashy)
 *   npm run logos:audit -- --no-hash
 */

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

import { getDb } from "@/lib/db/client";
import { teams, tournaments } from "@/lib/db/schema";
import {
  normalizeTeamNameForLogoMatching,
  suggestCanonicalName,
} from "@/lib/logos/normalize";

type Usage = {
  tournamentTitle: string;
  teamName: string;
  teamExternalId: string;
};

type AssetGroup = {
  url: string;
  publicId: string | null;
  usages: Usage[];
  contentHash: string | null;
  hashError: string | null;
};

loadEnvFile();

const WITH_HASH = !process.argv.includes("--no-hash");

/** Skraca URL do postaci nadającej się do raportu — bez tokenów i kluczy. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

async function hashRemoteFile(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const db = getDb();

  const rows = await db
    .select({
      tournamentTitle: tournaments.title,
      teamName: teams.name,
      teamExternalId: teams.externalId,
      logoUrl: teams.logoUrl,
      logoPublicId: teams.logoPublicId,
      logoAssetId: teams.logoAssetId,
    })
    .from(teams)
    .innerJoin(tournaments, eq(teams.tournamentId, tournaments.id))
    .orderBy(tournaments.title, teams.sourceOrder);

  const withLogo = rows.filter((row) => Boolean(row.logoUrl));

  console.log("=".repeat(70));
  console.log("AUDYT LOGOTYPÓW — TYLKO ODCZYT");
  console.log("=".repeat(70));
  console.log(`drużyn łącznie:        ${rows.length}`);
  console.log(`drużyn z logo:         ${withLogo.length}`);
  console.log(`bez logo:              ${rows.length - withLogo.length}`);
  console.log(
    `już w bibliotece:      ${rows.filter((row) => row.logoAssetId).length}`
  );

  // Grupujemy po public_id (albo URL, gdy public_id brak) — to jest
  // TOŻSAMOŚĆ PLIKU w Cloudinary, niezależna od nazwy drużyny.
  const groups = new Map<string, AssetGroup>();

  for (const row of withLogo) {
    const key = row.logoPublicId || row.logoUrl!;
    const group = groups.get(key) ?? {
      url: row.logoUrl!,
      publicId: row.logoPublicId,
      usages: [],
      contentHash: null,
      hashError: null,
    };

    group.usages.push({
      tournamentTitle: row.tournamentTitle,
      teamName: row.teamName,
      teamExternalId: row.teamExternalId,
    });

    groups.set(key, group);
  }

  console.log(`unikalnych assetów:    ${groups.size}`);
  console.log("");

  if (WITH_HASH) {
    console.log("Liczenie SHA-256 (pobieranie plików, bez zapisu)...");

    for (const group of groups.values()) {
      try {
        group.contentHash = await hashRemoteFile(group.url);
      } catch (error) {
        group.hashError = error instanceof Error ? error.message : "błąd";
      }
    }
    console.log("");
  }

  await report(groups);
}

async function report(groups: Map<string, AssetGroup>) {
  console.log("-".repeat(70));
  console.log("KANDYDACI DO BIBLIOTEKI");
  console.log("-".repeat(70));

  const byHash = new Map<string, AssetGroup[]>();

  for (const group of groups.values()) {
    const canonical = suggestCanonicalName(group.usages[0].teamName);
    const tournamentTitles = [
      ...new Set(group.usages.map((usage) => usage.tournamentTitle)),
    ];

    console.log("");
    console.log(`nazwa własna (propozycja): ${canonical}`);
    console.log(`public_id:                 ${group.publicId ?? "(brak)"}`);
    console.log(`plik:                      ${shortUrl(group.url)}`);
    console.log(
      `używa (drużyny):           ${group.usages
        .map((usage) => usage.teamName)
        .join(", ")}`
    );
    console.log(`używa (turnieje):          ${tournamentTitles.join(", ")}`);
    console.log(
      `hash:                      ${
        group.contentHash
          ? `${group.contentHash.slice(0, 16)}… (exact)`
          : group.hashError
            ? `niedostępny (${group.hashError})`
            : "nieliczony"
      }`
    );

    if (group.contentHash) {
      const list = byHash.get(group.contentHash) ?? [];
      list.push(group);
      byHash.set(group.contentHash, list);
    }
  }

  console.log("");
  console.log("-".repeat(70));
  console.log("DUPLIKATY (identyczna zawartość, różne public_id)");
  console.log("-".repeat(70));

  const duplicates = [...byHash.values()].filter((list) => list.length > 1);

  if (duplicates.length === 0) {
    console.log("Nie znaleziono duplikatów bajtowych.");
  }

  for (const list of duplicates) {
    console.log("");
    console.log(
      `kandydat: ${suggestCanonicalName(list[0].usages[0].teamName)}`
    );

    list.forEach((group, index) => {
      console.log(
        `  ${index === 0 ? "ZOSTAW " : "DUPLIKAT"} public_id=${
          group.publicId ?? "(brak)"
        } używane przez: ${group.usages.map((u) => u.teamName).join(", ")}`
      );
    });

    console.log("  rekomendacja: przepiąć referencje na pierwszy asset;");
    console.log("  USUNIĘCIE dopiero po osobnej, świadomej decyzji.");
  }

  console.log("");
  console.log("Ten skrypt niczego nie zmienił: 0 zapisów, 0 usunięć.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
