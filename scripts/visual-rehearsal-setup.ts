/**
 * SUN CUP U8 — VISUAL REHEARSAL.
 *
 * Kopia realnego SUN CUP U8 przeznaczona WYLACZNIE do ogladania oprawy
 * wizualnej: te same nazwy, te same herby, ta sama grafika hero i te same
 * tla sekcji - ale wlasny, kompletnie rozegrany turniej doprowadzony do
 * stanu "zakonczony", zeby dalo sie zobaczyc podium i cala ceremonie.
 *
 * Bezpieczenstwo:
 *   - realnego U8 skrypt wylacznie CZYTA,
 *   - zero uploadow do Cloudinary: assety sa wspoldzielone przez URL,
 *     a public_id kopii jest celowo pusty, zeby klon NIGDY nie mogl
 *     skasowac pliku nalezacego do prawdziwego turnieju,
 *   - herby drużyn to te same wpisy biblioteki (logoAssetSlug),
 *   - klon nigdy nie staje sie turniejem publicznym,
 *   - idempotentny: drugi przebieg nie tworzy kopii kopii.
 *
 *   npm run visual:setup -- --dry-run
 *   npm run visual:setup
 *   npm run visual:setup -- --force     (przebuduj mimo recznych zmian)
 */

import { and, eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { tournamentAssets, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  getPlayoffState,
  savePlayoffMatchResult,
} from "@/lib/data/postgres/playoff-engine";
import { parseTournamentSettings } from "@/types/tournament-config";
import type { Group, Match, Team, Tournament } from "@/types/tournament";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

export const SOURCE_SLUG = "sun-cup-2026-u8";
export const VISUAL_TITLE = "SUN CUP U8 — VISUAL REHEARSAL";
export const VISUAL_SLUG = "sun-cup-u8-visual-rehearsal";

/**
 * Deterministyczny round-robin: druzyna wyzej na liscie zawsze wygrywa,
 * a rozmiar zwyciestwa rosnie z roznica klasy. Zero remisow, wiec
 * rozstawienie 1..7 jest jednoznaczne w obu grupach.
 */
export function buildScoredRoundRobin(groupKey: string, teams: Team[]): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const gap = j - i;
      const strongerGoals = Math.min(2 + gap, 6);
      const weakerGoals = gap === 1 ? 1 : 0;
      const strongerAtHome = (i + j) % 2 === 0;

      const home = strongerAtHome ? teams[i] : teams[j];
      const away = strongerAtHome ? teams[j] : teams[i];

      result.push({
        id: `${groupKey}-${home.id}-${away.id}`,
        group: groupKey,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: strongerAtHome ? strongerGoals : weakerGoals,
        awayScore: strongerAtHome ? weakerGoals : strongerGoals,
      });
    }
  }

  return result;
}

/** Decyzja setupu - czysta funkcja, testowalna bez bazy. */
export function planVisualSetup(
  current: { phase: string } | null,
  force: boolean
): "create" | "rebuild" | "skip" {
  if (!current) return "create";
  if (force) return "rebuild";

  // Turniej doprowadzony do konca jest gotowy do ogladania - nie ruszamy.
  return "skip";
}

async function loadSource() {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, SOURCE_SLUG))
    .limit(1);

  if (!row) throw new Error(`Nie znaleziono turnieju ${SOURCE_SLUG}.`);

  const loaded = await postgresRepository.getTournamentById(row.id);

  if (loaded.status !== "ok") {
    throw new Error("Nie udalo sie odczytac realnego U8.");
  }

  const assets = await db
    .select()
    .from(tournamentAssets)
    .where(eq(tournamentAssets.tournamentId, row.id));

  return {
    row,
    settings: parseTournamentSettings({
      structure: row.structure,
      format: row.format,
      playoffConfig: row.playoffConfig ?? undefined,
      scorersEnabled: row.scorersEnabled,
    }),
    groups: loaded.tournament.groups ?? [],
    assets,
  };
}

/** Payload klonu: te same druzyny i herby, wlasny komplet wynikow. */
function buildClonePayload(sourceGroups: Group[]): Tournament {
  const groups: Group[] = sourceGroups.map((group) => {
    const teams: Team[] = group.teams.map((team, index) => ({
      ...team,
      sourceOrder: index + 1,
    }));

    return {
      key: group.key,
      name: group.name,
      teams,
      matches: buildScoredRoundRobin(group.key, teams),
    };
  });

  return {
    id: "ignored",
    title: VISUAL_TITLE,
    scorers: [],
    assets: {},
    groups,
  };
}

/**
 * Kopiuje referencje do grafik turnieju.
 *
 * public_id celowo zostaje PUSTY: klon wspoldzieli plik w Cloudinary,
 * ale nigdy nie jest jego wlascicielem, wiec usuniecie tla w klonie
 * nie moze skasowac oprawy prawdziwego SUN CUP.
 */
async function cloneAssets(
  targetId: string,
  assets: Array<{ kind: string; url: string; mimeType: string | null; fileName: string | null }>
) {
  const db = getDb();

  for (const asset of assets) {
    await db
      .insert(tournamentAssets)
      .values({
        tournamentId: targetId,
        kind: asset.kind,
        url: asset.url,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        publicId: null,
      })
      .onConflictDoUpdate({
        target: [tournamentAssets.tournamentId, tournamentAssets.kind],
        set: { url: asset.url, publicId: null },
      });
  }
}

/**
 * Rozgrywa caly play-off wedlug z gory ustalonego scenariusza.
 *
 * Grupa A: faworyci utrzymuja pozycje.
 * Grupa B: rozstawiona czworka wygrywa polfinal i caly turniej - dzieki
 *          temu widac, ze podium pokazuje RZECZYWISTY wynik, a nie
 *          zamrozona tabele grupowa.
 */
async function playPlayoff(tournamentId: string) {
  await completeGroupStage(tournamentId);

  const afterFreeze = await getPlayoffState(tournamentId);

  for (const scope of afterFreeze.scopes) {
    const semifinals = scope.rounds.find((round) => round.kind === "semifinal");
    if (!semifinals) continue;

    const upset = scope.groupKey === "B";

    // Polfinal 1-4: w grupie B wygrywa gospodarz slabszy w tabeli.
    await savePlayoffMatchResult({
      tournamentId,
      matchExternalId: semifinals.matches[0].externalId,
      homeScore: upset ? 2 : 4,
      awayScore: upset ? 3 : 1,
    });

    await savePlayoffMatchResult({
      tournamentId,
      matchExternalId: semifinals.matches[1].externalId,
      homeScore: 3,
      awayScore: 2,
    });
  }

  await completeCurrentRound(tournamentId);

  const afterSemis = await getPlayoffState(tournamentId);

  for (const scope of afterSemis.scopes) {
    const final = scope.rounds.find((round) => round.kind === "final");
    const third = scope.rounds.find((round) => round.kind === "third_place");

    if (final) {
      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: final.matches[0].externalId,
        homeScore: scope.groupKey === "B" ? 3 : 4,
        awayScore: scope.groupKey === "B" ? 2 : 1,
      });
    }

    if (third) {
      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: third.matches[0].externalId,
        homeScore: scope.groupKey === "B" ? 5 : 1,
        awayScore: scope.groupKey === "B" ? 0 : 2,
      });
    }

    // Minigrupa: wyzej rozstawiony wygrywa, wiec miejsca 5-7 sa czytelne.
    for (const match of scope.placement?.matches ?? []) {
      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: match.externalId,
        homeScore: 3,
        awayScore: 1,
      });
    }
  }

  await completeTournament(tournamentId);
}

async function main() {
  const db = getDb();
  const source = await loadSource();

  const [existing] = await db
    .select({ id: tournaments.id, phase: tournaments.phase, isCurrent: tournaments.isCurrent })
    .from(tournaments)
    .where(eq(tournaments.slug, VISUAL_SLUG))
    .limit(1);

  const plan = planVisualSetup(existing ?? null, FORCE);

  console.log("=".repeat(64));
  console.log(VISUAL_TITLE);
  console.log("=".repeat(64));
  console.log(`zrodlo:  ${SOURCE_SLUG} (tylko odczyt)`);
  console.log(`grupy:   ${source.groups.map((g) => `${g.key}:${g.teams.length}`).join(", ")}`);
  console.log(`assety:  ${source.assets.map((a) => a.kind).join(", ") || "(brak)"}`);

  if (plan === "skip" && existing) {
    console.log("");
    console.log(`klon juz istnieje (faza: ${existing.phase}) - nic nie zmieniam.`);
    console.log("Aby przebudowac od zera: npm run visual:setup -- --force");
    return;
  }

  if (DRY_RUN) {
    console.log("");
    console.log(`plan: ${plan}`);
    console.log("dry-run: nic nie zapisano.");
    return;
  }

  let targetId = existing?.id ?? "";

  if (plan === "rebuild" && existing) {
    // Pelna przebudowa: kasujemy TYLKO klon, nigdy zrodlo.
    await db.delete(tournaments).where(
      and(eq(tournaments.id, existing.id), eq(tournaments.slug, VISUAL_SLUG))
    );
    targetId = "";
  }

  if (!targetId) {
    const created = await postgresRepository.createTournament({
      title: VISUAL_TITLE,
      settings: source.settings,
    });

    targetId = created.id;
  }

  await postgresRepository.saveTournament(targetId, buildClonePayload(source.groups));
  await cloneAssets(targetId, source.assets);
  await playPlayoff(targetId);

  const state = await getPlayoffState(targetId);

  const [after] = await db
    .select({ slug: tournaments.slug, phase: tournaments.phase, isCurrent: tournaments.isCurrent })
    .from(tournaments)
    .where(eq(tournaments.id, targetId))
    .limit(1);

  console.log("");
  console.log(`id:                  ${targetId}`);
  console.log(`slug:                ${after.slug}`);
  console.log(`faza:                ${after.phase}`);
  console.log(`wyswietlany:         ${after.isCurrent ? "TAK" : "nie"}`);
  console.log(`completion token:    ${state.completionToken ?? "(brak)"}`);
  console.log(`Cloudinary uploads:  0`);

  for (const scope of state.scopes) {
    console.log("");
    console.log(`${scope.groupName} — klasyfikacja koncowa:`);

    for (const entry of scope.classification?.entries ?? []) {
      console.log(`  ${entry.position}. ${entry.team.name}`);
    }
  }

  console.log("");
  console.log("Klon NIE zostal ustawiony jako wyswietlany publicznie.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
