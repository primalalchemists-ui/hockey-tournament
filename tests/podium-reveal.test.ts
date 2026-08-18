import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REVEAL_DURATION_MS,
  buildPodiumStorageKey,
  buildRevealOrder,
  getRevealTotalMs,
  hasSeenReveal,
  markRevealSeen,
} from "@/lib/public/podium-reveal";
import { buildClassificationSkeleton } from "@/lib/playoff/classification";

/**
 * CEREMONIA PODIUM — kolejność, czas i zapamiętanie.
 * Czysta logika, bez DOM; komponent jest tylko nakładką.
 */

function entry(position: number | null, teamId: string, shared = false) {
  return { position, shared, team: { teamId } };
}

describe("kolejność odsłaniania", () => {
  it("F: dla 7 drużyn idzie 7 → 1", () => {
    const entries = [1, 2, 3, 4, 5, 6, 7].map((p) => entry(p, `t${p}`));

    expect(buildRevealOrder(entries).map((item) => item.key)).toEqual([
      "t7",
      "t6",
      "t5",
      "t4",
      "t3",
      "t2",
      "t1",
    ]);
  });

  it("G: jest generyczna dla dowolnego N", () => {
    for (const n of [2, 4, 5, 9, 16]) {
      const entries = Array.from({ length: n }, (_, i) => entry(i + 1, `t${i + 1}`));
      const order = buildRevealOrder(entries);

      expect(order).toHaveLength(n);
      expect(order[0].key).toBe(`t${n}`);
      expect(order[order.length - 1].key).toBe("t1");
    }
  });

  it("zwycięzca wchodzi jako ostatni i ma dodatkową pauzę", () => {
    const entries = [1, 2, 3].map((p) => entry(p, `t${p}`));
    const order = buildRevealOrder(entries);

    const winner = order[order.length - 1];
    const second = order[order.length - 2];

    expect(winner.key).toBe("t1");
    expect(winner.delayMs).toBeGreaterThan(second.delayMs);
  });

  it("miejsca dzielone wchodzą przed medalistami", () => {
    const entries = [
      entry(1, "t1"),
      entry(2, "t2"),
      entry(null, "t3", true),
      entry(null, "t4", true),
    ];

    const order = buildRevealOrder(entries).map((item) => item.key);

    expect(order.indexOf("t3")).toBeLessThan(order.indexOf("t1"));
    expect(order.indexOf("t4")).toBeLessThan(order.indexOf("t1"));
    expect(order[order.length - 1]).toBe("t1");
  });

  it("całość mieści się w oczekiwanym czasie (7 drużyn ~2,5-3 s)", () => {
    const entries = [1, 2, 3, 4, 5, 6, 7].map((p) => entry(p, `t${p}`));
    const total = getRevealTotalMs(buildRevealOrder(entries));

    expect(total).toBeGreaterThanOrEqual(2500);
    expect(total).toBeLessThanOrEqual(3000);
  });

  it("ogon ma szybszy rytm niż podium", () => {
    const entries = [1, 2, 3, 4, 5, 6, 7].map((p) => entry(p, `t${p}`));
    const order = buildRevealOrder(entries);
    const delay = new Map(order.map((item) => [item.key, item.delayMs]));

    // 7 → 6 (ogon) jest krótsze niż 3 → 2 (podium).
    expect(delay.get("t6")! - delay.get("t7")!).toBeLessThan(
      delay.get("t2")! - delay.get("t3")!
    );
  });

  it("pusta klasyfikacja nie generuje ceremonii", () => {
    expect(buildRevealOrder([])).toEqual([]);
    expect(getRevealTotalMs([])).toBe(0);
  });

  it("czas trwania pojedynczego wjazdu jest stały", () => {
    expect(REVEAL_DURATION_MS).toBeGreaterThan(0);
  });
});

describe("klucz zapamiętania ceremonii", () => {
  it("L: grupy A i B mają OSOBNE klucze", () => {
    const a = buildPodiumStorageKey({
      tournamentId: "t-1",
      scopeKey: "A",
      completionToken: "2026-08-22T10:00:00.000Z",
    });
    const b = buildPodiumStorageKey({
      tournamentId: "t-1",
      scopeKey: "B",
      completionToken: "2026-08-22T10:00:00.000Z",
    });

    expect(a).not.toBe(b);
  });

  it("K: różne turnieje mają osobne klucze", () => {
    const first = buildPodiumStorageKey({
      tournamentId: "t-1",
      scopeKey: "A",
      completionToken: "x",
    });
    const second = buildPodiumStorageKey({
      tournamentId: "t-2",
      scopeKey: "A",
      completionToken: "x",
    });

    expect(first).not.toBe(second);
  });

  it("Q: nowa finalizacja daje NOWY klucz — reveal pokaże się ponownie", () => {
    const before = buildPodiumStorageKey({
      tournamentId: "t-1",
      scopeKey: "A",
      completionToken: "2026-08-22T10:00:00.000Z",
    });
    const after = buildPodiumStorageKey({
      tournamentId: "t-1",
      scopeKey: "A",
      completionToken: "2026-08-22T11:30:00.000Z",
    });

    expect(before).not.toBe(after);
  });

  it("ten sam turniej, pula i finalizacja dają stabilny klucz", () => {
    const input = {
      tournamentId: "t-1",
      scopeKey: "A",
      completionToken: "2026-08-22T10:00:00.000Z",
    };

    expect(buildPodiumStorageKey(input)).toBe(buildPodiumStorageKey(input));
  });
});

describe("storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("J: zapamiętana ceremonia nie odtwarza się ponownie", () => {
    const store = new Map<string, string>();

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });

    const key = "podiumRevealSeen:t:A:token";

    expect(hasSeenReveal(key)).toBe(false);
    markRevealSeen(key);
    expect(hasSeenReveal(key)).toBe(true);
  });

  it("M: nowy użytkownik (pusty storage) nadal dostaje ceremonię", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    });

    expect(hasSeenReveal("podiumRevealSeen:t:A:token")).toBe(false);
  });

  it("P: awaria storage nie wywraca podium", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      },
    });

    // Brak storage => traktujemy jak "nieoglądane" i nie rzucamy.
    expect(() => hasSeenReveal("k")).not.toThrow();
    expect(hasSeenReveal("k")).toBe(false);
    expect(() => markRevealSeen("k")).not.toThrow();
  });
});

/* ==========================================================================
 * SZKIELET PUSTEGO PODIUM
 * ======================================================================== */

describe("szkielet klasyfikacji (puste podium)", () => {
  it("D: 7 drużyn / top4 / mecz o 3. miejsce / minigrupa → sloty 1-7", () => {
    const slots = buildClassificationSkeleton({
      teamCount: 7,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
    });

    expect(slots.map((slot) => slot.label)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(slots.every((slot) => !slot.shared)).toBe(true);
  });

  it("nie hardkoduje 7 — 9 drużyn daje sloty 1-9", () => {
    const slots = buildClassificationSkeleton({
      teamCount: 9,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
    });

    expect(slots).toHaveLength(9);
    expect(slots[slots.length - 1].label).toBe("9");
  });

  it("R: bez meczu o 3. miejsce szkielet pokazuje 3–4, nie brązowy medal", () => {
    const slots = buildClassificationSkeleton({
      teamCount: 7,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: false,
      placementMode: "placement_group",
    });

    const shared = slots.filter((slot) => slot.shared);

    expect(shared).toHaveLength(2);
    expect(shared.every((slot) => slot.label === "3–4")).toBe(true);
    // Żaden slot nie obiecuje pewnego trzeciego miejsca.
    expect(slots.some((slot) => slot.position === 3)).toBe(false);
  });

  it("placementMode=none kończy klasyfikację na drabince", () => {
    const slots = buildClassificationSkeleton({
      teamCount: 7,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "none",
    });

    expect(slots.map((slot) => slot.label)).toEqual(["1", "2", "3", "4"]);
  });

  it("drabinka 2-drużynowa daje tylko finał", () => {
    const slots = buildClassificationSkeleton({
      teamCount: 6,
      qualifiedTeamCount: 2,
      thirdPlaceMatch: false,
      placementMode: "none",
    });

    expect(slots.map((slot) => slot.label)).toEqual(["1", "2"]);
  });

  it("nie generuje slotów ponad liczbę drużyn", () => {
    const slots = buildClassificationSkeleton({
      teamCount: 4,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
    });

    expect(slots).toHaveLength(4);
  });
});
