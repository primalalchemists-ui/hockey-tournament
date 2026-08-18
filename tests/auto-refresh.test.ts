import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_REFRESH_INTERVAL_MS,
  createAutoRefreshController,
  resolveSelectedGroupKey,
} from "@/lib/public/auto-refresh";

/**
 * Logika auto-odświeżania — czysta, bez Reacta i bez DOM.
 * Hook jest tylko nakładką, więc to tutaj żyje cała mechanika.
 */

type Snap = { value: string };

function makeDeps(overrides: {
  versions: Array<{ tournamentId: string | null; revision: number }>;
  snapshot?: () => Promise<{
    tournamentId: string;
    revision: number;
    snapshot: Snap;
  }>;
  initial?: { tournamentId: string | null; revision: number };
}) {
  const versionCalls: number[] = [];
  const snapshotCalls: number[] = [];
  const received: Snap[] = [];
  const errors: unknown[] = [];

  let versionIndex = 0;

  const deps = {
    initial: overrides.initial ?? { tournamentId: "t1", revision: 1 },
    fetchVersion: vi.fn(async () => {
      versionCalls.push(Date.now());
      const value =
        overrides.versions[Math.min(versionIndex, overrides.versions.length - 1)];
      versionIndex += 1;
      return value;
    }),
    fetchSnapshot: vi.fn(async () => {
      snapshotCalls.push(Date.now());

      if (overrides.snapshot) return overrides.snapshot();

      return {
        tournamentId: "t1",
        revision: 2,
        snapshot: { value: "fresh" },
      };
    }),
    onSnapshot: (snap: Snap) => received.push(snap),
    onError: (error: unknown) => errors.push(error),
  };

  return { deps, versionCalls, snapshotCalls, received, errors };
}

describe("interwał", () => {
  it("jest jedną czytelną stałą w rozsądnym zakresie", () => {
    expect(PUBLIC_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(12_000);
    expect(PUBLIC_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(15_000);
  });
});

describe("wykrywanie zmian", () => {
  it("N: brak zmiany wersji → ZERO pełnych pobrań", async () => {
    const { deps, snapshotCalls, received } = makeDeps({
      versions: [{ tournamentId: "t1", revision: 1 }],
    });

    const controller = createAutoRefreshController(deps);

    await controller.check();
    await controller.check();
    await controller.check();

    expect(deps.fetchVersion).toHaveBeenCalledTimes(3);
    expect(snapshotCalls).toHaveLength(0);
    expect(received).toHaveLength(0);
  });

  it("O: zmiana wersji → DOKŁADNIE jedno pełne pobranie", async () => {
    const { deps, snapshotCalls, received } = makeDeps({
      versions: [
        { tournamentId: "t1", revision: 2 },
        { tournamentId: "t1", revision: 2 },
        { tournamentId: "t1", revision: 2 },
      ],
    });

    const controller = createAutoRefreshController(deps);

    await controller.check();
    await controller.check();
    await controller.check();

    expect(snapshotCalls).toHaveLength(1);
    expect(received).toEqual([{ value: "fresh" }]);
    expect(controller.getCurrent().revision).toBe(2);
  });

  it("M: zmiana turnieju wykrywana po tournamentId, nie po wersji", async () => {
    // Nowy turniej może mieć NIŻSZĄ wersję — sam identyfikator musi wystarczyć.
    const { deps, snapshotCalls } = makeDeps({
      initial: { tournamentId: "t1", revision: 42 },
      versions: [{ tournamentId: "t2", revision: 0 }],
      snapshot: async () => ({
        tournamentId: "t2",
        revision: 0,
        snapshot: { value: "inny-turniej" },
      }),
    });

    const controller = createAutoRefreshController(deps);
    await controller.check();

    expect(snapshotCalls).toHaveLength(1);
    expect(controller.getCurrent()).toEqual({
      tournamentId: "t2",
      revision: 0,
    });
  });
});

describe("odporność na błędy", () => {
  it("P: nieudane pełne pobranie NIE podnosi lokalnej wersji", async () => {
    const { deps, errors, received } = makeDeps({
      versions: [{ tournamentId: "t1", revision: 5 }],
      snapshot: async () => {
        throw new Error("network down");
      },
    });

    const controller = createAutoRefreshController(deps);

    await controller.check();

    expect(errors).toHaveLength(1);
    expect(received).toHaveLength(0);
    // wersja lokalna bez zmian => kolejny cykl spróbuje ponownie
    expect(controller.getCurrent().revision).toBe(1);

    await controller.check();
    expect(deps.fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it("nieudane odpytanie o wersję nie psuje stanu", async () => {
    const deps = {
      initial: { tournamentId: "t1", revision: 1 },
      fetchVersion: vi.fn(async () => {
        throw new Error("offline");
      }),
      fetchSnapshot: vi.fn(),
      onSnapshot: vi.fn(),
      onError: vi.fn(),
    };

    const controller = createAutoRefreshController(deps);
    await controller.check();

    expect(deps.fetchSnapshot).not.toHaveBeenCalled();
    expect(deps.onSnapshot).not.toHaveBeenCalled();
    expect(controller.getCurrent().revision).toBe(1);
  });
});

describe("brak nakładających się żądań", () => {
  it("S: drugi check w trakcie trwania pierwszego jest pomijany", async () => {
    const deferred: {
      resolve?: (value: { tournamentId: string; revision: number }) => void;
    } = {};

    const pending = new Promise<{ tournamentId: string; revision: number }>(
      (resolve) => {
        deferred.resolve = resolve;
      }
    );

    const deps = {
      initial: { tournamentId: "t1", revision: 1 },
      fetchVersion: vi.fn(() => pending),
      fetchSnapshot: vi.fn(),
      onSnapshot: vi.fn(),
      onError: vi.fn(),
    };

    const controller = createAutoRefreshController(deps);

    const first = controller.check();
    expect(controller.isBusy()).toBe(true);

    // kolejne wywołania (timer + focus + visibility) nie startują nowego cyklu
    await controller.check();
    await controller.check();

    expect(deps.fetchVersion).toHaveBeenCalledTimes(1);

    deferred.resolve!({ tournamentId: "t1", revision: 1 });
    await first;

    expect(controller.isBusy()).toBe(false);

    await controller.check();
    expect(deps.fetchVersion).toHaveBeenCalledTimes(2);
  });

  it("stop() przerywa i blokuje kolejne cykle", async () => {
    const { deps } = makeDeps({ versions: [{ tournamentId: "t1", revision: 9 }] });

    const controller = createAutoRefreshController(deps);
    controller.stop();

    await controller.check();

    expect(deps.fetchVersion).not.toHaveBeenCalled();
  });
});

describe("zachowanie wybranej grupy", () => {
  it("T: wybór kibica jest zachowany po odświeżeniu", () => {
    expect(resolveSelectedGroupKey("B", ["A", "B"])).toBe("B");
  });

  it("U: nieistniejąca grupa resetuje się do pierwszej dostępnej", () => {
    expect(resolveSelectedGroupKey("B", ["A"])).toBe("A");
    expect(resolveSelectedGroupKey("__main__", ["A", "B"])).toBe("A");
  });

  it("brak poprzedniego wyboru → pierwsza grupa", () => {
    expect(resolveSelectedGroupKey(undefined, ["A", "B"])).toBe("A");
  });

  it("brak grup → undefined", () => {
    expect(resolveSelectedGroupKey("A", [])).toBeUndefined();
  });
});
