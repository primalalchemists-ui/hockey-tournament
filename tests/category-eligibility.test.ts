import { describe, expect, it } from "vitest";
import { afterAll, beforeAll } from "vitest";

import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  connectTournaments,
  getCollectionForTournament,
  listConnectableTournaments,
  pruneEmptyCollections,
  removeCollectionMember,
} from "@/lib/data/postgres/collections";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * KTORY TURNIEJ MOZNA DOLACZYC DO WYDARZENIA.
 *
 * Filtr jest waski celowo: turniej nalezy najwyzej do jednego wydarzenia,
 * a zarchiwizowane naleza do historii, nie do przelacznika.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function createFixture(name: string) {
  return postgresRepository.createTournament({
    title: `Vitest Eligibility ${name}`,
    settings: {
      structure: "groups",
      format: "league",
      playoffConfig: null,
      scorersEnabled: false,
    },
  });
}

describe.skipIf(!hasDatabase)("Z-AE: lista kandydatow", () => {
  let originalCurrent: string | null = null;
  let base = { id: "", slug: "" };
  let free = { id: "", slug: "" };
  let archived = { id: "", slug: "" };
  let takenA = { id: "", slug: "" };
  let takenB = { id: "", slug: "" };

  beforeAll(async () => {
    originalCurrent = await readCurrentTournamentId();

    base = await createFixture("Base");
    free = await createFixture("Free");
    archived = await createFixture("Archived");
    takenA = await createFixture("TakenA");
    takenB = await createFixture("TakenB");

    await postgresRepository.setTournamentArchived(archived.id, true);

    // Osobne wydarzenie, do ktorego nalezą dwa inne turnieje.
    await connectTournaments({
      members: [
        { tournamentId: takenA.id, label: "OPEN", bubbleColor: "#111827" },
        { tournamentId: takenB.id, label: "PRO", bubbleColor: "#111827" },
      ],
    });
  });

  afterAll(async () => {
    try {
      await removeCollectionMember(takenA.id);
      await removeCollectionMember(takenB.id);
      await deleteOwnFixtures("vitest-eligibility", originalCurrent);
      await pruneEmptyCollections();
    } finally {
      await restoreCurrentTournament(originalCurrent);
    }
  });

  it("AD: wolny turniej jest kandydatem", async () => {
    const ids = (await listConnectableTournaments(base.id)).map(
      (item) => item.id
    );

    expect(ids).toContain(free.id);
  });

  it("AA: turniej nie moze polaczyc sie sam ze soba", async () => {
    const ids = (await listConnectableTournaments(base.id)).map(
      (item) => item.id
    );

    expect(ids).not.toContain(base.id);
  });

  it("Z: zarchiwizowany turniej jest odfiltrowany", async () => {
    const ids = (await listConnectableTournaments(base.id)).map(
      (item) => item.id
    );

    expect(ids).not.toContain(archived.id);
  });

  it("AC: czlonek innego wydarzenia jest odfiltrowany", async () => {
    const ids = (await listConnectableTournaments(base.id)).map(
      (item) => item.id
    );

    expect(ids).not.toContain(takenA.id);
    expect(ids).not.toContain(takenB.id);
  });

  it("AB: czlonek TEGO SAMEGO wydarzenia nie pojawia sie ponownie", async () => {
    await connectTournaments({
      members: [
        { tournamentId: base.id, label: "U8", bubbleColor: "#D6A52A" },
        { tournamentId: free.id, label: "U10", bubbleColor: "#3978C7" },
      ],
    });

    const ids = (await listConnectableTournaments(base.id)).map(
      (item) => item.id
    );

    expect(ids).not.toContain(free.id);
    expect((await getCollectionForTournament(base.id))?.members).toHaveLength(2);

    await removeCollectionMember(free.id);
  });
});
