import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  connectTournaments,
  getCollectionForTournament,
  getPublicCategories,
  isPubliclyReadable,
  listConnectableTournaments,
  moveCollectionMember,
  pruneEmptyCollections,
  removeCollectionMember,
  updateCollectionMember,
} from "@/lib/data/postgres/collections";
import { TournamentOperationError } from "@/lib/data/types";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * KOLEKCJE TURNIEJOW na prawdziwej bazie.
 *
 * Najwazniejszy niezmiennik: laczenie kategorii NIGDY nie zmienia turnieju
 * wyswietlanego publicznie ani danych sportowych.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function createFixture(name: string) {
  const created = await postgresRepository.createTournament({
    title: `Vitest Collection ${name}`,
    settings: {
      structure: "groups",
      format: "league",
      playoffConfig: null,
      scorersEnabled: false,
    },
  });

  return created;
}

async function isCurrent(id: string) {
  const [row] = await getDb()
    .select({ isCurrent: tournaments.isCurrent })
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);

  return row.isCurrent;
}

async function revisionOf(id: string) {
  const [row] = await getDb()
    .select({ revision: tournaments.publicRevision })
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);

  return row.revision;
}

let originalCurrentId: string | null = null;
let a = { id: "", slug: "" };
let b = { id: "", slug: "" };
let c = { id: "", slug: "" };
let d = { id: "", slug: "" };

describe.skipIf(!hasDatabase)("A-I: model kolekcji", () => {
  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    a = await createFixture("Alfa");
    b = await createFixture("Beta");
    c = await createFixture("Gamma");
    d = await createFixture("Delta");
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-collection", originalCurrentId);
      // Kasowanie turnieju zdejmuje czlonkostwo kaskada; pusty rekord
      // wydarzenia nie moze zostac w bazie po testach.
      await pruneEmptyCollections();
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("B/D/E/F: dwa turnieje tworza wydarzenie z etykietami i kolorami", async () => {
    await connectTournaments({
      members: [
        { tournamentId: a.id, label: "U8", bubbleColor: "#D6A52A" },
        { tournamentId: b.id, label: "U10", bubbleColor: "rgb(57, 120, 199)" },
      ],
    });

    const collection = await getCollectionForTournament(a.id);

    expect(collection?.members).toHaveLength(2);
    expect(collection?.members.map((m) => m.label)).toEqual(["U8", "U10"]);
    // Kolor zapisany kanonicznie, niezaleznie od formatu wejscia.
    expect(collection?.members[1].bubbleColor).toBe("#3978C7");
    expect(collection?.members.map((m) => m.sortOrder)).toEqual([0, 1]);
  });

  it("A: turniej nalezy najwyzej do jednej kolekcji", async () => {
    // Druga, niezalezna para tworzy wlasne wydarzenie...
    const e = await createFixture("Epsilon");
    const f = await createFixture("Zeta");

    await connectTournaments({
      members: [
        { tournamentId: e.id, label: "OPEN", bubbleColor: "#111827" },
        { tournamentId: f.id, label: "PRO", bubbleColor: "#111827" },
      ],
    });

    // ...a proba spiecia dwoch ROZNYCH wydarzen jest odrzucana.
    await expect(
      connectTournaments({
        members: [
          { tournamentId: a.id, label: "U8", bubbleColor: "#111827" },
          { tournamentId: e.id, label: "OPEN", bubbleColor: "#111827" },
        ],
      })
    ).rejects.toThrow(TournamentOperationError);

    // Kazdy turniej nadal ma dokladnie jedno wydarzenie.
    const first = await getCollectionForTournament(a.id);
    const second = await getCollectionForTournament(e.id);

    expect(first?.collectionId).not.toBe(second?.collectionId);

    // Ani jeden, ani drugi nie jest wybieralny dla pozostalych.
    const connectable = await listConnectableTournaments(a.id);
    expect(connectable.map((item) => item.id)).not.toContain(e.id);

    await removeCollectionMember(e.id);
    await removeCollectionMember(f.id);
  });

  it("G: dwie identyczne etykiety sa odrzucane", async () => {
    await expect(
      updateCollectionMember({
        tournamentId: b.id,
        label: "U8",
        bubbleColor: "#3978C7",
      })
    ).rejects.toThrow(TournamentOperationError);
  });

  it("C: wydarzenie obsluguje wiecej niz dwie kategorie", async () => {
    await connectTournaments({
      members: [
        { tournamentId: a.id, label: "U8", bubbleColor: "#D6A52A" },
        { tournamentId: c.id, label: "U12", bubbleColor: "#7C3AED" },
      ],
    });

    await connectTournaments({
      members: [
        { tournamentId: a.id, label: "U8", bubbleColor: "#D6A52A" },
        { tournamentId: d.id, label: "U14", bubbleColor: "#38BDF8" },
      ],
    });

    const collection = await getCollectionForTournament(a.id);

    expect(collection?.members.map((m) => m.label)).toEqual([
      "U8",
      "U10",
      "U12",
      "U14",
    ]);
  });

  it("F: kolejnosc da sie zmienic i jest deterministyczna", async () => {
    await moveCollectionMember({ tournamentId: d.id, direction: -1 });

    const collection = await getCollectionForTournament(a.id);

    expect(collection?.members.map((m) => m.label)).toEqual([
      "U8",
      "U10",
      "U14",
      "U12",
    ]);
    expect(collection?.members.map((m) => m.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("H: usuniecie z wydarzenia NIE kasuje turnieju", async () => {
    await removeCollectionMember(d.id);

    const loaded = await postgresRepository.getTournamentById(d.id);

    expect(loaded.status).toBe("ok");
    expect(await getCollectionForTournament(d.id)).toBeNull();
  });

  it("I: zejscie do jednej kategorii rozwiazuje wydarzenie", async () => {
    await removeCollectionMember(b.id);
    await removeCollectionMember(c.id);

    // Zostalby sam turniej A - przelacznik z jedna opcja nie ma sensu.
    expect(await getCollectionForTournament(a.id)).toBeNull();

    // Po rozwiazaniu nie zostaje pusty rekord wydarzenia.
    expect(await pruneEmptyCollections()).toBe(0);
  });
});

describe.skipIf(!hasDatabase)("J-M/AU-AV/BP-BT: bezpieczenstwo i granica publikacji", () => {
  let originalCurrent: string | null = null;
  let one = { id: "", slug: "" };
  let two = { id: "", slug: "" };
  let outsider = { id: "", slug: "" };

  beforeAll(async () => {
    originalCurrent = await readCurrentTournamentId();

    one = await createFixture("Public One");
    two = await createFixture("Public Two");
    outsider = await createFixture("Outsider");

    await connectTournaments({
      members: [
        { tournamentId: one.id, label: "U8", bubbleColor: "#D6A52A" },
        { tournamentId: two.id, label: "U10", bubbleColor: "#3978C7" },
      ],
    });

    await postgresRepository.setCurrentTournament(one.id);
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-collection", originalCurrent);
      await pruneEmptyCollections();
    } finally {
      await restoreCurrentTournament(originalCurrent);
    }
  });

  it("J/K/L: laczenie kategorii nie zmienia turnieju wyswietlanego", async () => {
    expect(await isCurrent(one.id)).toBe(true);
    expect(await isCurrent(two.id)).toBe(false);

    await updateCollectionMember({
      tournamentId: two.id,
      label: "U10",
      bubbleColor: "#3978C7",
    });
    await moveCollectionMember({ tournamentId: two.id, direction: -1 });

    // Zadna operacja na kolekcji nie dotyka is_current.
    expect(await isCurrent(one.id)).toBe(true);
    expect(await isCurrent(two.id)).toBe(false);

    const publicOnes = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true));

    expect(publicOnes).toHaveLength(1);
  });

  it("P: obie kategorie sa widoczne publicznie", async () => {
    const categories = await getPublicCategories(one.id);

    expect(categories).toHaveLength(2);
    expect(categories?.map((item) => item.label).sort()).toEqual(["U10", "U8"]);
  });

  it("BQ: czlonek tego samego wydarzenia jest publicznie czytelny", async () => {
    expect(await isPubliclyReadable(one.id)).toBe(true);
    expect(await isPubliclyReadable(two.id)).toBe(true);
  });

  it("BP/BS/BT: obcy turniej NIE jest publicznie czytelny", async () => {
    // Sama znajomosc UUID nie wystarcza.
    expect(await isPubliclyReadable(outsider.id)).toBe(false);
  });

  it("AU/AV/BR: zarchiwizowana kategoria znika z przelacznika", async () => {
    await postgresRepository.setTournamentArchived(two.id, true);

    // Zostaje jedna dostepna kategoria - przelacznik nie ma sensu.
    expect(await getPublicCategories(one.id)).toBeNull();
    expect(await isPubliclyReadable(two.id)).toBe(false);

    // Relacja przetrwala, wiec przywrocenie wraca do stanu sprzed archiwum.
    const collection = await getCollectionForTournament(one.id);
    expect(collection?.members).toHaveLength(2);
    expect(
      collection?.members.find((m) => m.tournamentId === two.id)?.isArchived
    ).toBe(true);
  });

  it("AW: przywrocenie z archiwum wraca do przelacznika", async () => {
    await postgresRepository.setTournamentArchived(two.id, false);

    const categories = await getPublicCategories(one.id);

    expect(categories).toHaveLength(2);
    expect(await isPubliclyReadable(two.id)).toBe(true);
  });

  it("zmiana metadanych podnosi wersje publiczna obu kategorii", async () => {
    const before = [await revisionOf(one.id), await revisionOf(two.id)];

    await updateCollectionMember({
      tournamentId: two.id,
      label: "U10A",
      bubbleColor: "#3978C7",
    });

    const after = [await revisionOf(one.id), await revisionOf(two.id)];

    // Monotonicznie w gore, nigdy reset.
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeGreaterThan(before[1]);
  });
});
