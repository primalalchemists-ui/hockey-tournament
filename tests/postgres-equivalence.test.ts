import fs from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { airtableRepository } from "@/lib/data/airtable/repository";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { buildTournament } from "@/lib/data/airtable/mappers";
import { mergeTournamentData } from "@/lib/merge-data";
import { calculateStandings } from "@/lib/standings";
import type { Tournament } from "@/types/tournament";

import {
  normalizeStandings,
  normalizeTournament,
} from "./helpers/normalize-tournament";
import { getRabbitCupId, loadRabbitCup } from "./helpers/rabbit-cup";

/**
 * RÓWNOWAŻNOŚĆ ADAPTERÓW — najważniejszy test tego etapu.
 *
 * Po przełączeniu DATA_SOURCE=postgres użytkownik musi zobaczyć dokładnie
 * to samo, co widzi dziś na Airtable.
 *
 * Wymaga DATABASE_URL oraz zaimportowanych danych (npm run db:import).
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAirtable = Boolean(
  process.env.AIRTABLE_BASE_ID && process.env.AIRTABLE_TOKEN
);

const fixturePath = path.join(process.cwd(), "fixtures", "airtable-raw.json");
const hasFixture = fs.existsSync(fixturePath);

describe.skipIf(!hasDatabase)("Postgres — odczyt aktywnego turnieju", () => {
  let fromPostgres: Tournament;

  beforeAll(async () => {
    const result = await loadRabbitCup();

    if (result.status !== "ok") {
      throw new Error(
        `Postgres nie zwrócił turnieju (status: ${result.status}). ` +
          "Uruchom najpierw: npm run db:import"
      );
    }

    fromPostgres = mergeTournamentData(result.tournament);
  });

  it("zwraca kompletny turniej", () => {
    expect(fromPostgres.groups.length).toBeGreaterThan(0);
    expect(
      fromPostgres.groups.every((group) => group.teams.length > 0)
    ).toBe(true);
  });

  it("nie ujawnia wewnętrznych UUID-ów w modelu domenowym", () => {
    const uuidPattern =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    expect(uuidPattern.test(JSON.stringify(fromPostgres))).toBe(false);
  });
});

describe.skipIf(!hasDatabase || !hasFixture)(
  "GOLDEN MASTER — standings z Postgresa vs zapisany wzorzec",
  () => {
    it("daje identyczną klasyfikację dla każdej grupy", async () => {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

      const golden = mergeTournamentData(buildTournament(fixture));
      const result = await loadRabbitCup();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;

      const fromPostgres = mergeTournamentData(result.tournament);

      expect(fromPostgres.groups.map((group) => group.key)).toEqual(
        golden.groups.map((group) => group.key)
      );

      for (const goldenGroup of golden.groups) {
        const postgresGroup = fromPostgres.groups.find(
          (group) => group.key === goldenGroup.key
        );

        expect(postgresGroup).toBeDefined();
        if (!postgresGroup) continue;

        expect(normalizeStandings(calculateStandings(postgresGroup))).toEqual(
          normalizeStandings(calculateStandings(goldenGroup))
        );
      }
    });

    it("zachowuje kolejność i komplet meczów w każdej grupie", async () => {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
      const golden = mergeTournamentData(buildTournament(fixture));

      const result = await loadRabbitCup();
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;

      const fromPostgres = mergeTournamentData(result.tournament);

      for (const goldenGroup of golden.groups) {
        const postgresGroup = fromPostgres.groups.find(
          (group) => group.key === goldenGroup.key
        )!;

        expect(postgresGroup.matches).toEqual(goldenGroup.matches);
        expect(postgresGroup.teams.map((team) => team.id)).toEqual(
          goldenGroup.teams.map((team) => team.id)
        );
        expect(postgresGroup.teams.map((team) => team.sourceOrder)).toEqual(
          goldenGroup.teams.map((team) => team.sourceOrder)
        );
      }
    });
  }
);

describe.skipIf(!hasDatabase || !hasAirtable)(
  "RÓWNOWAŻNOŚĆ — Airtable vs Postgres na żywo",
  () => {
    it("oba adaptery zwracają semantycznie identyczny turniej", async () => {
      /*
        Airtable zna WYŁĄCZNIE historyczny Rabbit Cup, więc porównanie musi
        adresować go wprost. Wcześniej test brał „turniej publiczny" i po
        przełączeniu strony w panelu porównywał SUN CUP z Rabbit Cupem.
      */
      const [airtableResult, postgresResult] = await Promise.all([
        airtableRepository.getCurrentTournament(),
        loadRabbitCup(),
      ]);

      expect(airtableResult.status).toBe("ok");
      expect(postgresResult.status).toBe("ok");

      if (airtableResult.status !== "ok" || postgresResult.status !== "ok") {
        return;
      }

      const fromAirtable = normalizeTournament(
        mergeTournamentData(airtableResult.tournament)
      );
      const fromPostgres = normalizeTournament(
        mergeTournamentData(postgresResult.tournament)
      );

      expect(fromPostgres).toEqual(fromAirtable);
    });

    it("oba adaptery dają identyczne standings", async () => {
      const [airtableResult, postgresResult] = await Promise.all([
        airtableRepository.getCurrentTournament(),
        loadRabbitCup(),
      ]);

      if (airtableResult.status !== "ok" || postgresResult.status !== "ok") {
        throw new Error("Któryś adapter nie zwrócił turnieju");
      }

      const fromAirtable = mergeTournamentData(airtableResult.tournament);
      const fromPostgres = mergeTournamentData(postgresResult.tournament);

      for (const airtableGroup of fromAirtable.groups) {
        const postgresGroup = fromPostgres.groups.find(
          (group) => group.key === airtableGroup.key
        );

        expect(postgresGroup).toBeDefined();
        if (!postgresGroup) continue;

        expect(normalizeStandings(calculateStandings(postgresGroup))).toEqual(
          normalizeStandings(calculateStandings(airtableGroup))
        );
      }
    });
  }
);
