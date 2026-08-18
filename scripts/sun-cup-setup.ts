/**
 * REALNE DANE: SUN CUP 2026 — U8 i U10.
 *
 * To NIE są fixtures. Skrypt tworzy prawdziwe turnieje, drużyny i pełne
 * terminarze round-robin, a logotypy dobiera WYŁĄCZNIE z istniejącej
 * biblioteki — nic nie wgrywa do Cloudinary.
 *
 * Zasady bezpieczeństwa:
 *   - idempotentny: drugi przebieg nie tworzy duplikatów,
 *   - NIE nadpisuje ręcznie wybranego logo (manual > automat),
 *   - NIE ustawia żadnego turnieju jako publicznego,
 *   - nie dotyka Rabbit Cupa.
 *
 *   npm run suncup:setup -- --dry-run
 *   npm run suncup:setup
 */

import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { teamLogoAssets, teams, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { matchTeamNameToLogos } from "@/lib/logos/matching";
import {
  normalizeTeamNameForLogoMatching,
  suggestCanonicalName,
} from "@/lib/logos/normalize";
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";

const DRY_RUN = process.argv.includes("--dry-run");

/* ==========================================================================
 * SKŁADY — przepisane dosłownie, bez poprawek stylistycznych
 * ======================================================================== */

const U8_GROUP_A = [
  "UKS Zagłębie Sosnowiec 1",
  "MOSM Tychy Tyskie Lwy 1",
  "BS Polonia Bytom 1",
  "GKS Katowice 1",
  "Naprzód Janów Katowice 1",
  "KH Dębica",
  "MMKS Podhale Nowy Targ",
];

const U8_GROUP_B = [
  "UKS Zagłębie Sosnowiec 2",
  "MOSM Tychy Tyskie Lwy 2",
  "GKS Katowice 2",
  "BS Polonia Bytom 2",
  "Naprzód Janów Katowice 2",
  "Sandecja Nowy Sącz",
  "HKS Mińskie Jetsiki",
];

const U10_GROUP_A = [
  "GKS Katowice 1",
  "UKH Unia Oświęcim",
  "BS Polonia Bytom 1",
  "MOSM Tychy Tyskie Lwy",
  "Naprzód Janów Katowice 1",
  "AH Legia Warszawa",
  "ŁKH Łódź",
  "KH Dębica 1",
  "MKS Sokoły Toruń",
  "UKS Niedźwiadki Sanok",
];

const U10_GROUP_B = [
  "GKS Katowice 2",
  "Kojotki Naprzód Janów Katowice",
  "BS Polonia Bytom 2",
  "MUKS Orlik Opole",
  "UKS Zagłębie Sosnowiec 2",
  "Atomówki GKS Tychy",
  "Naprzód Janów Katowice 2",
  "KH Dębica 2",
  "Sandecja Nowy Sącz",
  "PTH Koziołki Poznań",
];

const U8_SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "group_playoff",
  playoffConfig: {
    qualifiedTeamCount: 4,
    thirdPlaceMatch: true,
    placementMode: "placement_group",
    tieBreaker: "penalties",
  },
  scorersEnabled: false,
};

const U10_SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "league",
  playoffConfig: null,
  scorersEnabled: false,
};

/* ==========================================================================
 * BUDOWA PAYLOADU
 * ======================================================================== */

type LibraryEntry = {
  slug: string;
  canonicalName: string;
  normalizedName: string;
  normalizedAliases: string[];
};

type Assignment = { team: string; logo: string | null; matchType: string };

/** Stabilny, czytelny identyfikator domenowy drużyny. */
function teamExternalId(groupKey: string, name: string): string {
  return `${groupKey.toLowerCase()}-${normalizeTeamNameForLogoMatching(name).replace(/ /g, "-")}`;
}

/** Pełny round-robin: każdy z każdym dokładnie raz, bez wyników. */
function buildRoundRobin(groupKey: string, teamIds: string[]): Match[] {
  const matches: Match[] = [];

  for (let home = 0; home < teamIds.length; home += 1) {
    for (let away = home + 1; away < teamIds.length; away += 1) {
      matches.push({
        id: `${groupKey}-${teamIds[home]}-${teamIds[away]}`,
        group: groupKey,
        homeTeamId: teamIds[home],
        awayTeamId: teamIds[away],
        // Terminarz, nie wyniki: nic nie zostało rozegrane.
        homeScore: null as unknown as number,
        awayScore: null as unknown as number,
      });
    }
  }

  return matches;
}

/**
 * Dobiera logo z biblioteki.
 *
 * Automatycznie TYLKO pewne trafienia (exact / alias / jednoznaczna nazwa
 * bazowa). Fuzzy nie przypisujemy — lepiej zostawić drużynę bez herbu
 * i zgłosić ją do ręcznego uzupełnienia niż wstawić cudzy.
 */
function pickLogo(
  teamName: string,
  library: LibraryEntry[]
): { slug: string | null; matchType: string } {
  const result = matchTeamNameToLogos(teamName, library);

  if (!result.autoSelect) return { slug: null, matchType: "none" };

  return {
    slug: result.autoSelect.logo.slug,
    matchType: result.autoSelect.matchType,
  };
}

function buildGroup(
  key: string,
  name: string,
  names: string[],
  library: LibraryEntry[],
  keepExistingLogo: Map<string, string>,
  assignments: Assignment[]
): Group {
  const domainTeams: Team[] = names.map((teamName, index) => {
    const id = teamExternalId(key, teamName);

    // RĘCZNY WYBÓR MA PIERWSZEŃSTWO: jeżeli drużyna ma już przypisany
    // herb, kolejny przebieg go nie rusza.
    const existing = keepExistingLogo.get(id);
    const picked = existing
      ? { slug: existing, matchType: "manual" }
      : pickLogo(teamName, library);

    assignments.push({
      team: teamName,
      logo: picked.slug,
      matchType: picked.matchType,
    });

    return {
      id,
      name: teamName,
      shortName: teamName,
      logoText: "LOGO",
      logoUrl: "",
      logoAssetSlug: picked.slug ?? undefined,
      sourceOrder: index + 1,
    };
  });

  return {
    key,
    name,
    teams: domainTeams,
    matches: buildRoundRobin(
      key,
      domainTeams.map((team) => team.id)
    ),
  };
}

/* ==========================================================================
 * WYKONANIE
 * ======================================================================== */

async function loadLibrary(): Promise<LibraryEntry[]> {
  const db = getDb();
  const { teamLogoAliases } = await import("@/lib/db/schema");

  const [assets, aliases] = await Promise.all([
    db.select().from(teamLogoAssets),
    db.select().from(teamLogoAliases),
  ]);

  return assets.map((asset) => ({
    slug: asset.slug,
    canonicalName: asset.canonicalName,
    normalizedName: asset.normalizedName,
    normalizedAliases: aliases
      .filter((alias) => alias.logoAssetId === asset.id)
      .map((alias) => alias.normalizedAlias),
  }));
}

/** Mapa external_id -> slug już przypisanego herbu (ochrona ręcznych wyborów). */
async function existingLogoAssignments(
  tournamentId: string
): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ externalId: teams.externalId, slug: teamLogoAssets.slug })
    .from(teams)
    .innerJoin(teamLogoAssets, eq(teams.logoAssetId, teamLogoAssets.id))
    .where(eq(teams.tournamentId, tournamentId));

  return new Map(rows.map((row) => [row.externalId, row.slug]));
}

/** Znajduje turniej po slugu ALBO po tytule — obsługuje zmianę nazwy. */
async function findTournament(slugs: string[]) {
  const rows = await getDb().select().from(tournaments);

  return (
    rows.find((row) => slugs.includes(row.slug)) ??
    rows.find((row) => row.title.toUpperCase().includes("SUN CUP 2026") &&
      !/U8|U10/i.test(row.title)) ??
    null
  );
}

async function setupTournament(input: {
  label: string;
  slugs: string[];
  title: string;
  settings: TournamentSettings;
  groups: Array<{ key: string; name: string; names: string[] }>;
  library: LibraryEntry[];
  reuseEmptyRecord: boolean;
}) {
  const db = getDb();
  const assignments: Assignment[] = [];

  const existing = input.reuseEmptyRecord
    ? await findTournament(input.slugs)
    : (await db.select().from(tournaments)).find((row) =>
        input.slugs.includes(row.slug)
      ) ?? null;

  let tournamentId = existing?.id ?? "";

  console.log(`\n${"=".repeat(64)}\n${input.label}`);

  if (existing) {
    console.log(`  rekord istnieje: ${existing.title} (${existing.slug})`);
  } else {
    console.log("  brak rekordu — zostanie utworzony");
  }

  if (DRY_RUN) {
    for (const group of input.groups) {
      buildGroup(group.key, group.name, group.names, input.library, new Map(), assignments);
    }
    return { tournamentId, assignments };
  }

  if (!tournamentId) {
    const created = await postgresRepository.createTournament({
      title: input.title,
      settings: input.settings,
    });
    tournamentId = created.id;
  }

  // Konfiguracja przez repozytorium — walidacja i bump wersji w komplecie.
  await postgresRepository.updateTournamentSettings(tournamentId, {
    title: input.title,
    format: input.settings.format,
    playoffConfig: input.settings.playoffConfig ?? undefined,
    scorersEnabled: input.settings.scorersEnabled,
  });

  const keepExisting = await existingLogoAssignments(tournamentId);

  const payload: Tournament = {
    id: tournamentId,
    title: input.title,
    scorers: [],
    assets: {
      scheduleImage: "",
      scheduleImageType: "",
      scheduleImageName: "",
      regulationImage: "",
      regulationImageType: "",
      regulationImageName: "",
    },
    groups: input.groups.map((group) =>
      buildGroup(
        group.key,
        group.name,
        group.names,
        input.library,
        keepExisting,
        assignments
      )
    ),
  };

  await postgresRepository.saveTournament(tournamentId, payload);

  return { tournamentId, assignments };
}

function report(label: string, assignments: Assignment[]) {
  console.log(`\n${label} — dopasowanie logotypów`);

  const missing: string[] = [];

  for (const item of assignments) {
    if (item.logo) {
      console.log(`  ✓ ${item.team.padEnd(34)} → ${item.logo}  (${item.matchType})`);
    } else {
      console.log(`  ✗ ${item.team.padEnd(34)} → BRAK LOGO`);
      missing.push(item.team);
    }
  }

  return missing;
}

async function main() {
  console.log(DRY_RUN ? "TRYB: próbny (bez zapisu)" : "TRYB: zapis");

  const library = await loadLibrary();
  console.log(`logotypów w bibliotece: ${library.length}`);

  const u8 = await setupTournament({
    label: "SUN CUP 2026 — U8",
    slugs: ["sun-cup-2026-u8", "sun-cup-2026"],
    title: "SUN CUP 2026 — U8",
    settings: U8_SETTINGS,
    library,
    reuseEmptyRecord: true,
    groups: [
      { key: "A", name: "Grupa A", names: U8_GROUP_A },
      { key: "B", name: "Grupa B", names: U8_GROUP_B },
    ],
  });

  const u10 = await setupTournament({
    label: "SUN CUP 2026 — U10",
    slugs: ["sun-cup-2026-u10"],
    title: "SUN CUP 2026 — U10",
    settings: U10_SETTINGS,
    library,
    reuseEmptyRecord: false,
    groups: [
      { key: "A", name: "Grupa A", names: U10_GROUP_A },
      { key: "B", name: "Grupa B", names: U10_GROUP_B },
    ],
  });

  const missingU8 = report("U8", u8.assignments);
  const missingU10 = report("U10", u10.assignments);

  /*
    Braki grupujemy po KLUBIE, nie po drużynie.

    "KH Dębica", "KH Dębica 1" i "KH Dębica 2" to jeden herb — po wgraniu
    go raz biblioteka dopasuje pozostałe warianty sama. Lista pokazuje
    realną liczbę PLIKÓW do wgrania, a nie liczbę drużyn.
  */
  const missingTeams = [...new Set([...missingU8, ...missingU10])].sort();
  const byClub = new Map<string, string[]>();

  for (const team of missingTeams) {
    const club = suggestCanonicalName(team);
    byClub.set(club, [...(byClub.get(club) ?? []), team]);
  }

  console.log("");
  console.log("=".repeat(64));
  console.log("BRAKUJĄCE LOGOTYPY — do ręcznego wgrania w panelu:");

  if (byClub.size === 0) console.log("  (żadnych)");

  for (const [club, variants] of [...byClub.entries()].sort()) {
    const usedBy = variants.length > 1 ? `  (obsłuży: ${variants.join(", ")})` : "";
    console.log(`  • ${club}${usedBy}`);
  }

  console.log("");
  console.log(
    `plików do wgrania: ${byClub.size} (drużyn bez herbu: ${missingTeams.length})`
  );

  console.log("");
  console.log("Cloudinary: 0 uploadów. Żaden turniej nie został ustawiony jako publiczny.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
