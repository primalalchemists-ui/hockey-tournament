import { describe, expect, it } from "vitest";

import {
  FOCUS,
  IDLE_FOCUS,
  computeFocusTransform,
  isCeremonyDone,
  isFocusLayerActive,
  isRevealing,
  reduceFocus,
  requiredVisibleRatio,
  shouldStartOnViewport,
  type FocusEvent,
  type FocusState,
} from "@/lib/public/cinematic-focus";

/**
 * MASZYNA KADRU CEREMONII.
 *
 * Cała sekwencja jest czysta i policzalna, więc nie trzeba udawać
 * przeglądarki, żeby udowodnić, że reveal nie ma prawa ruszyć przed
 * gotowym kadrem, a dwa wyzwalacze nie odpalą dwóch ceremonii.
 */

function run(start: FocusState, events: FocusEvent[]): FocusState {
  return events.reduce(reduceFocus, start);
}

const CTA: FocusEvent = {
  type: "REQUEST",
  source: "cta",
  reducedMotion: false,
};
const VIEWPORT: FocusEvent = {
  type: "REQUEST",
  source: "viewport",
  reducedMotion: false,
};

describe("B-F: droga przez przycisk", () => {
  it("B: klik wprowadza w kadr, a nie w ceremonię", () => {
    const state = reduceFocus(IDLE_FOCUS, CTA);

    expect(state).toEqual({ phase: "entering", source: "cta" });
    expect(isFocusLayerActive(state)).toBe(true);
  });

  it("C/D: w chwili kliknięcia ceremonia NIE leci", () => {
    /*
      To jest sedno całego etapu. `revealed` steruje każdym opóźnieniem CSS
      choreografii, więc dopóki `isRevealing` jest fałszem, żaden medal nie
      ma jak wystartować — ani w klatce kliknięcia, ani podczas przejazdu.
    */
    const entering = reduceFocus(IDLE_FOCUS, CTA);

    expect(isRevealing(entering)).toBe(false);
    expect(isCeremonyDone(entering)).toBe(false);
  });

  it("E: kadr najpierw staje, dopiero potem oddycha", () => {
    const focused = run(IDLE_FOCUS, [CTA, { type: "ENTERED" }]);

    expect(focused.phase).toBe("focused");
    // Kadr stoi — ceremonia nadal czeka.
    expect(isRevealing(focused)).toBe(false);
  });

  it("F: reveal rusza WYŁĄCZNIE po gotowym kadrze", () => {
    const revealing = run(IDLE_FOCUS, [
      CTA,
      { type: "ENTERED" },
      { type: "READY" },
    ]);

    expect(revealing.phase).toBe("revealing");
    expect(isRevealing(revealing)).toBe(true);
  });

  it("F: skrót na skróty nie istnieje — READY bez ENTERED nic nie robi", () => {
    const stuck = run(IDLE_FOCUS, [CTA, { type: "READY" }]);

    expect(stuck.phase).toBe("entering");
    expect(isRevealing(stuck)).toBe(false);
  });
});

describe("G, S, 26: jedna oś czasu", () => {
  it("G/S: obserwator nie dopisze drugiej ceremonii do trwającej", () => {
    const running = run(IDLE_FOCUS, [CTA, { type: "ENTERED" }]);

    // Żądanie z obserwatora w środku kadru jest po prostu odrzucane.
    expect(reduceFocus(running, VIEWPORT)).toBe(running);
  });

  it("S: przycisk nie przerwie ceremonii, która leci ze scrolla", () => {
    const natural = reduceFocus(IDLE_FOCUS, VIEWPORT);

    expect(natural).toEqual({ phase: "revealing", source: "viewport" });
    expect(reduceFocus(natural, CTA)).toBe(natural);
  });

  it("26: pierwszy zaakceptowany wyzwalacz blokuje drugi, w obie strony", () => {
    for (const [first, second] of [
      [CTA, VIEWPORT],
      [VIEWPORT, CTA],
    ] as const) {
      const after = reduceFocus(IDLE_FOCUS, first);

      expect(reduceFocus(after, second)).toBe(after);
    }
  });
});

describe("H-M: domknięcie", () => {
  it("H/I: po ceremonii kadr przytrzymuje wynik", () => {
    const held = run(IDLE_FOCUS, [
      CTA,
      { type: "ENTERED" },
      { type: "READY" },
      { type: "REVEALED" },
    ]);

    expect(held.phase).toBe("finalHold");
    expect(isCeremonyDone(held)).toBe(true);
    // Sekcja nadal stoi w kadrze — to jest ten moment na zobaczenie wyniku.
    expect(isFocusLayerActive(held)).toBe(true);
  });

  it("K/L: kadr się rozjeżdża, a sekcja wraca do dokumentu", () => {
    const exiting = run(IDLE_FOCUS, [
      CTA,
      { type: "ENTERED" },
      { type: "READY" },
      { type: "REVEALED" },
      { type: "HELD" },
    ]);

    expect(exiting.phase).toBe("exiting");
    expect(isFocusLayerActive(exiting)).toBe(true);

    const done = reduceFocus(exiting, { type: "EXITED" });

    expect(done.phase).toBe("finished");
    // Po wyjściu nie ma już żadnej warstwy — jest tylko stan końcowy.
    expect(isFocusLayerActive(done)).toBe(false);
    expect(isRevealing(done)).toBe(true);
    expect(isCeremonyDone(done)).toBe(true);
  });

  it("L: stan końcowy jest pochłaniający — nic go nie wznowi", () => {
    const done: FocusState = { phase: "finished", source: "cta" };

    expect(reduceFocus(done, CTA)).toBe(done);
    expect(reduceFocus(done, VIEWPORT)).toBe(done);
    expect(reduceFocus(done, { type: "SKIP" })).toBe(done);
  });
});

describe("Q-R: droga przez naturalny scroll", () => {
  it("Q: scroll NIE wprowadza w kadr", () => {
    const natural = reduceFocus(IDLE_FOCUS, VIEWPORT);

    expect(isFocusLayerActive(natural)).toBe(false);
  });

  it("R: ceremonia leci od razu i w miejscu", () => {
    const natural = reduceFocus(IDLE_FOCUS, VIEWPORT);

    expect(natural.phase).toBe("revealing");

    // Bez kadru nie ma przytrzymania ani wyjazdu — od razu stan końcowy.
    expect(reduceFocus(natural, { type: "REVEALED" }).phase).toBe("finished");
  });
});

describe("W-Z: Escape", () => {
  it("W/Y: Escape kończy ruch i wyprowadza z kadru", () => {
    const revealing = run(IDLE_FOCUS, [
      CTA,
      { type: "ENTERED" },
      { type: "READY" },
    ]);

    const skipped = reduceFocus(revealing, { type: "SKIP" });

    expect(skipped.phase).toBe("exiting");
    // Pełny wynik jest widoczny natychmiast, mimo przerwanej choreografii.
    expect(isRevealing(skipped)).toBe(true);
    expect(isCeremonyDone(skipped)).toBe(true);
  });

  it("W: Escape działa na każdym etapie kadru", () => {
    const phases: FocusState[] = [
      { phase: "entering", source: "cta" },
      { phase: "focused", source: "cta" },
      { phase: "revealing", source: "cta" },
      { phase: "finalHold", source: "cta" },
    ];

    for (const state of phases) {
      const skipped = reduceFocus(state, { type: "SKIP" });

      expect(skipped.phase).toBe("exiting");
      expect(isRevealing(skipped)).toBe(true);
    }
  });

  it("Escape przy ceremonii ze scrolla po prostu ją domyka", () => {
    const natural: FocusState = { phase: "revealing", source: "viewport" };

    expect(reduceFocus(natural, { type: "SKIP" }).phase).toBe("finished");
  });

  it("Z: po Escape nic nie startuje ponownie", () => {
    const after = run(IDLE_FOCUS, [
      CTA,
      { type: "ENTERED" },
      { type: "READY" },
      { type: "SKIP" },
      { type: "EXITED" },
    ]);

    expect(after.phase).toBe("finished");
    expect(reduceFocus(after, VIEWPORT)).toBe(after);
  });
});

describe("N-P, AI-AL: ceremonia obejrzana i ograniczony ruch", () => {
  it("N/P: obejrzana ceremonia wchodzi wprost w stan końcowy", () => {
    const seen = reduceFocus(IDLE_FOCUS, { type: "ALREADY_SEEN" });

    expect(seen).toEqual({ phase: "finished", source: null });
    expect(isFocusLayerActive(seen)).toBe(false);
    expect(isRevealing(seen)).toBe(true);
  });

  it("P: obejrzana ceremonia nie da się odtworzyć żadną drogą", () => {
    const seen = reduceFocus(IDLE_FOCUS, { type: "ALREADY_SEEN" });

    expect(reduceFocus(seen, CTA)).toBe(seen);
    expect(reduceFocus(seen, VIEWPORT)).toBe(seen);
  });

  it("AI/AJ/AK: ograniczony ruch dostaje wynik od razu, bez kadru", () => {
    const reduced = reduceFocus(IDLE_FOCUS, {
      type: "REQUEST",
      source: "cta",
      reducedMotion: true,
    });

    expect(reduced.phase).toBe("finished");
    // Zero kadru, zero czekania na pełną oś czasu, pełne podium na ekranie.
    expect(isFocusLayerActive(reduced)).toBe(false);
    expect(isRevealing(reduced)).toBe(true);
    expect(isCeremonyDone(reduced)).toBe(true);
  });

  it("AL: ograniczony ruch przy naturalnym scrollu zachowuje się tak samo", () => {
    const reduced = reduceFocus(IDLE_FOCUS, {
      type: "REQUEST",
      source: "viewport",
      reducedMotion: true,
    });

    expect(reduced.phase).toBe("finished");
  });
});

describe("24: próg naturalnego scrolla", () => {
  it("scena mieszcząca się w ekranie musi być widoczna praktycznie cała", () => {
    const ratio = requiredVisibleRatio({
      coreHeight: 400,
      viewportHeight: 800,
    });

    expect(ratio).toBe(0.98);
    // Ćwierć sceny to zdecydowanie za mało, żeby uznać, że ktoś doscrollował.
    expect(
      shouldStartOnViewport({ ratio: 0.25, coreHeight: 400, viewportHeight: 800 })
    ).toBe(false);
    expect(
      shouldStartOnViewport({ ratio: 1, coreHeight: 400, viewportHeight: 800 })
    ).toBe(true);
  });

  it("scena wyższa niż ekran dostaje próg OSIĄGALNY", () => {
    // iPhone: scena 900 px, ekran 600 px — 100% nigdy nie zapadnie.
    const ratio = requiredVisibleRatio({
      coreHeight: 900,
      viewportHeight: 600,
    });

    const maxReachable = 600 / 900;

    expect(ratio).toBeLessThan(maxReachable);
    expect(ratio).toBeGreaterThan(0.5);
    expect(
      shouldStartOnViewport({ ratio: maxReachable, coreHeight: 900, viewportHeight: 600 })
    ).toBe(true);
  });

  it("próg nigdy nie jest nieosiągalny, nawet dla absurdalnych proporcji", () => {
    for (const coreHeight of [400, 800, 1600, 4000, 20000]) {
      const viewportHeight = 600;
      const ratio = requiredVisibleRatio({ coreHeight, viewportHeight });
      const reachable = Math.min(1, viewportHeight / coreHeight);

      expect(ratio).toBeLessThanOrEqual(reachable);
    }
  });

  it("zdegenerowane wymiary nie odpalają ceremonii", () => {
    expect(
      shouldStartOnViewport({ ratio: 1, coreHeight: 0, viewportHeight: 0 })
    ).toBe(true);
    expect(
      shouldStartOnViewport({ ratio: 0.9, coreHeight: 0, viewportHeight: 800 })
    ).toBe(false);
  });
});

describe("AA-AH: geometria kadru", () => {
  const section = { top: 2400, left: 40, width: 1320, height: 520 };

  it("AF/AG/AH: na każdym desktopie środek sceny to środek ekranu", () => {
    for (const viewportWidth of [1280, 1440, 1920]) {
      const t = computeFocusTransform({
        rect: section,
        viewportWidth,
        viewportHeight: 900,
      });

      const centerX = section.left + section.width / 2 + t.translateX;
      const centerY = section.top + section.height / 2 + t.translateY;

      expect(centerX).toBeCloseTo(viewportWidth / 2, 5);
      expect(centerY).toBeCloseTo(450, 5);
    }
  });

  it("AH: podium nie rośnie na 1920 — skala nigdy nie przekracza 1", () => {
    const t = computeFocusTransform({
      rect: { top: 3000, left: 700, width: 500, height: 300 },
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    expect(t.scale).toBe(1);
  });

  it("AA: na 390 px scena mieści się w szerokości z marginesem", () => {
    const mobile = { top: 1800, left: 0, width: 390, height: 620 };

    const t = computeFocusTransform({
      rect: mobile,
      viewportWidth: 390,
      viewportHeight: 780,
    });

    const width = mobile.width * t.scale;

    // Zostaje oddech przy obu krawędziach — zero poziomego wyjścia poza ekran.
    expect(width).toBeLessThanOrEqual(390 - 20);
    expect(width).toBeGreaterThan(340);
  });

  it("AE: strefy bezpieczne przesuwają środek, a nie tylko obcinają", () => {
    const rect = { top: 1000, left: 0, width: 390, height: 400 };

    const plain = computeFocusTransform({
      rect,
      viewportWidth: 390,
      viewportHeight: 780,
    });

    const safe = computeFocusTransform({
      rect,
      viewportWidth: 390,
      viewportHeight: 780,
      safeTop: 60,
      safeBottom: 34,
    });

    // Notch u góry jest większy niż pasek u dołu, więc środek schodzi niżej.
    expect(safe.translateY).toBeGreaterThan(plain.translateY);

    const centerY = rect.top + rect.height / 2 + safe.translateY;

    expect(centerY).toBeGreaterThan(60);
    expect(centerY).toBeLessThan(780 - 34);
  });

  it("wysoka scena kurczy się, zamiast wychodzić poza ekran", () => {
    const tall = { top: 500, left: 20, width: 350, height: 1400 };

    const t = computeFocusTransform({
      rect: tall,
      viewportWidth: 390,
      viewportHeight: 700,
    });

    expect(t.scale).toBeLessThan(1);
    expect(tall.height * t.scale).toBeLessThanOrEqual(700);
  });

  it("34: zerowy prostokąt nie wywraca liczenia", () => {
    expect(
      computeFocusTransform({
        rect: { top: 0, left: 0, width: 0, height: 0 },
        viewportWidth: 1440,
        viewportHeight: 900,
      })
    ).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });
});

describe("11, 17, 18: tempo", () => {
  it("wejście, przytrzymanie i wyjście mieszczą się w zamówionych widełkach", () => {
    expect(FOCUS.backdropMs).toBeGreaterThanOrEqual(280);
    expect(FOCUS.backdropMs).toBeLessThanOrEqual(420);

    expect(FOCUS.enterMs).toBeGreaterThanOrEqual(500);
    expect(FOCUS.enterMs).toBeLessThanOrEqual(750);

    expect(FOCUS.readyPauseMs).toBeGreaterThanOrEqual(200);
    expect(FOCUS.readyPauseMs).toBeLessThanOrEqual(350);

    expect(FOCUS.finalHoldMs).toBeGreaterThanOrEqual(700);
    expect(FOCUS.finalHoldMs).toBeLessThanOrEqual(1100);

    expect(FOCUS.exitMs).toBeGreaterThanOrEqual(450);
    expect(FOCUS.exitMs).toBeLessThanOrEqual(650);
  });

  it("11: krzywa jest tą samą krzywą, którą jedzie cała ceremonia", () => {
    expect(FOCUS.easing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    // Zero sprężyn i zero przeskoku poza cel.
    expect(FOCUS.easing).not.toContain("spring");
  });
});
