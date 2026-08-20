import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CelebrationButton } from "@/components/celebration-cta";
import { describeCelebrationCta } from "@/lib/public/celebration";

/**
 * KADR CEREMONII — kontrakt komponentów.
 *
 * Maszyna stanów ma własny plik testów; tutaj sprawdzamy, że warstwa
 * wizualna faktycznie się do niej podpina: jedno podium, jedna oś czasu,
 * podkładka w dokumencie, blokada strony i przycisk, który niczego nie
 * uruchamia na własną rękę.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const podium = source("components/playoff/podium-section.tsx");
const backdrop = source("components/playoff/cinematic-backdrop.tsx");
const button = source("components/celebration-cta.tsx");
const css = source("app/globals.css");

describe("A, M, N-P: przycisk", () => {
  it("A: nieobejrzana ceremonia zaprasza na celebrację i uruchamia kadr", () => {
    const cta = describeCelebrationCta({
      isCompleted: true,
      classificationComplete: true,
      seen: false,
      scopeKey: "A",
    });

    expect(cta.label).toBe("Zobacz celebrację");
    expect(cta.cinematic).toBe(true);
    expect(cta.targetId).toBe("celebration-A");
  });

  it("M/N: po obejrzeniu przycisk zmienia się i przestaje wołać kadr", () => {
    const cta = describeCelebrationCta({
      isCompleted: true,
      classificationComplete: true,
      seen: true,
      scopeKey: "A",
    });

    expect(cta.label).toBe("Zobacz klasyfikację");
    expect(cta.cinematic).toBe(false);
    // Kontrakt etykiet zostaje dokładnie taki, jaki był.
    expect(cta.shine).toBe(false);
  });

  it("O: obejrzana ceremonia to zwykłe przewinięcie do sekcji", () => {
    expect(button).toContain("if (!cta.cinematic) {");
    expect(button).toContain("scrollToTarget();");
    expect(button).toContain(
      'target.scrollIntoView({ behavior: "smooth", block: "start" })'
    );
  });

  it("P: przycisk nie zna choreografii i nie zapamiętuje ceremonii", () => {
    // Zero timerów, zero „obejrzane" — to należy wyłącznie do podium.
    expect(button).not.toContain("setTimeout");
    expect(button).not.toContain("markRevealSeen");
    expect(button).not.toContain("buildRevealOrder");
  });

  it("B: klik na nieobejrzanej ceremonii prosi o kadr, zamiast przewijać", () => {
    expect(button).toContain("CELEBRATION_REQUEST_EVENT");
    expect(button).toContain("requestCinematic()");

    // Kadr przyjeżdża do kibica — nie odwrotnie.
    const cinematicBranch = button.slice(button.indexOf("if (reducedMotion)"));
    expect(cinematicBranch).toContain("requestCinematic();");
  });

  it("zwykły przycisk wyników renderuje się bez zmian", () => {
    const html = renderToStaticMarkup(
      <CelebrationButton
        cta={{
          kind: "results",
          label: "Sprawdź wyniki",
          shine: false,
          targetId: "results-section",
          cinematic: false,
        }}
      />
    );

    expect(html).toContain('data-kind="results"');
    expect(html).toContain("Sprawdź wyniki");
  });
});

describe("4, 13: jedno podium, jedna oś czasu", () => {
  it("4: nie ma drugiej instancji podium ani klona w portalu", () => {
    const tabs = source("components/group-tabs.tsx");

    // Dokładnie jedno miejsce renderowania sekcji w całej aplikacji.
    expect(tabs.split("<PodiumSection").length - 1).toBe(1);
    // Sama sekcja nie portuje się nigdzie — przez portal idzie wyłącznie tło.
    expect(podium).not.toContain("createPortal");
    expect(backdrop).toContain("ModalPortal");
  });

  it("4: stan ceremonii ma jedno źródło prawdy", () => {
    expect(podium).toContain("useReducer(reduceFocus, IDLE_FOCUS)");
    // Koniec z parą niezależnych flag, które dało się rozjechać.
    expect(podium).not.toContain("setRevealed(");
    expect(podium).not.toContain("setCeremonyDone(");
  });

  it("13: choreografia i jej tempo pozostają nietknięte", () => {
    expect(podium).toContain("buildRevealOrder(entries)");
    expect(podium).toContain("getRevealTotalMs(revealOrder)");
    expect(podium).toContain('data-testid="podium-beam"');
    expect(podium).toContain('data-testid="podium-glow"');
    expect(podium).toContain('data-testid="podium-medal"');
    expect(podium).toContain('data-testid="podium-stage-shake"');
    expect(podium).toContain("PODIUM_HAPTIC_MS");
  });
});

describe("3, 12: bramka startu ceremonii", () => {
  it("3: odsłanianie czyta WYŁĄCZNIE fazę maszyny", () => {
    expect(podium).toContain("const revealed = isRevealing(focus)");
    expect(podium).toContain("const ceremonyDone = isCeremonyDone(focus)");
  });

  it("12: oddech po zatrzymaniu kadru poprzedza pierwsze miejsce", () => {
    const gate = podium.slice(podium.indexOf('if (phase === "focused")'));

    expect(gate).toContain("FOCUS.readyPauseMs");
    expect(gate).toContain('dispatch({ type: "READY" })');
  });

  it("liczniki ceremonii wiszą pod fazą, a nie pod danymi", () => {
    const sequence = podium.slice(
      podium.indexOf("const phase = focus.phase;"),
      podium.indexOf("}, [focus.phase, markSeen]);")
    );

    expect(sequence).toContain("totalRef.current");
    expect(sequence).toContain("impactsRef.current");
  });
});

describe("5, 14, 31: warstwa kadru", () => {
  it("5: sekcja zostawia podkładkę o swojej wysokości", () => {
    expect(podium).toContain('data-testid="podium-placeholder"');
    expect(podium).toContain("height: naturalRect.height");
  });

  it("5/6: przejazd to transformacja, nie teleport", () => {
    expect(podium).toContain("computeFocusTransform");
    expect(podium).toContain("translate3d(");
    expect(podium).toContain("FOCUS.easing");
    expect(podium).toContain("requestAnimationFrame");
  });

  it("14: blokada strony to ten sam helper, co w oknach panelu", () => {
    const dialog = source("components/ui/confirm-dialog.tsx");

    expect(podium).toContain("lockBodyScroll()");
    expect(dialog).toContain("lockBodyScroll()");
    expect(source("lib/public/scroll-lock.ts")).toContain(
      "body.style.paddingRight"
    );
  });

  it("31: drabinka warstw jest krótka i świadoma", () => {
    expect(css).toContain("--z-cinematic-backdrop: 40;");
    expect(css).toContain("--z-cinematic-stage: 45;");

    // Babelek kategorii ma zostać POD kadrem, okna panelu NAD nim.
    expect(source("components/public/category-switcher.tsx")).toContain("z-30");
    expect(source("components/ui/confirm-dialog.tsx")).toContain("z-[100]");
    // Zero absurdalnych warstw w rodzaju `z-index: 999999`.
    expect(css).not.toMatch(/z-index:\s*9{5,}/);
  });
});

describe("9, 10, 38, 39: tło", () => {
  it("9: przyciemnienie, nie czarny ekran", () => {
    const block = css.slice(css.indexOf(".cinematic-backdrop {"));

    expect(block).toContain("rgba(5, 10, 22, 0.42)");
    expect(block).toContain("rgba(5, 10, 22, 0.62)");
    expect(block).toContain("backdrop-filter: blur(9px)");
    // 39: winieta zbiera wzrok do środka — delikatnie, nie dramatycznie.
    expect(block).toContain("radial-gradient");
  });

  it("10: tło wchodzi i wychodzi płynnie, a nie przełącznikiem", () => {
    expect(css).toContain("@keyframes cinematic-backdrop-in");
    expect(css).toContain("@keyframes cinematic-backdrop-out");
    expect(backdrop).toContain("--backdrop-in-ms");
    expect(backdrop).toContain("--backdrop-out-ms");
  });

  it("38: to nie jest okno dialogowe panelu", () => {
    // Zero białej karty, krzyżyka i stopki z przyciskami.
    expect(backdrop).not.toContain("rounded-");
    expect(backdrop).not.toContain("bg-white");
    expect(podium).not.toContain("confirm-close");
    expect(podium).not.toContain("Anuluj");
  });
});

describe("15, 29, 30, 36, 37: interakcja i dostępność", () => {
  it("15/29/30: wskaźnik nie przechodzi pod kadr", () => {
    // Tło jest pełnoekranowe i NIE jest przezroczyste dla kliknięć.
    expect(backdrop).toContain("fixed inset-0");
    expect(backdrop).not.toContain("pointer-events-none");
  });

  it("36/37: klawiatura nie ucieka spod kadru i wraca po ceremonii", () => {
    const trap = podium.slice(podium.indexOf("const restoreScroll = lockBodyScroll()"));

    expect(trap).toContain("sectionRef.current?.focus({ preventScroll: true })");
    expect(trap).toContain('if (event.key !== "Tab") return;');
    expect(trap).toContain("node.contains(active)");
    expect(trap).toContain("previouslyFocused?.focus({ preventScroll: true })");
  });

  it("36: w kadrze sekcja jest modalna dla czytnika ekranu", () => {
    expect(podium).toContain('role={layerActive ? "dialog" : undefined}');
    expect(podium).toContain("aria-modal={layerActive ? true : undefined}");
    // Poza kadrem to zwykła sekcja strony — bez semantyki okna.
    expect(podium).toContain('aria-label="Klasyfikacja końcowa"');
  });

  it("W/X/Y: Escape kończy ruch, zapamiętuje i wyprowadza z kadru", () => {
    const escape = podium.slice(podium.indexOf('if (event.key === "Escape")'));

    expect(escape).toContain("markSeen();");
    expect(escape).toContain('dispatch({ type: "SKIP" })');
  });
});

describe("20, 28: zapamiętanie i odświeżanie", () => {
  it("20: znacznik obejrzenia zapisujemy po pełnym odsłonięciu", () => {
    const revealBlock = podium.slice(
      podium.indexOf('if (phase === "revealing")'),
      podium.indexOf('if (phase === "finalHold")')
    );

    expect(revealBlock).toContain("totalRef.current");
    expect(revealBlock).toContain("markSeen();");
    expect(revealBlock).toContain('dispatch({ type: "REVEALED" })');

    // W obsłudze żądania kadru nie ma ani śladu zapisu.
    const request = podium.slice(
      podium.indexOf("function onRequest(event: Event)"),
      podium.indexOf("window.addEventListener(CELEBRATION_REQUEST_EVENT")
    );
    expect(request).not.toContain("markSeen");
  });

  it("20: klucz pamięci pozostaje per turniej, grupa i finalizacja", () => {
    expect(podium).toContain("buildPodiumStorageKey({");
    expect(podium).toContain("tournamentId,");
    expect(podium).toContain("scopeKey,");
    expect(podium).toContain("completionToken,");
  });

  it("T/U/V: snapshot co 13 s nie ma jak przestawić ani jednego licznika", () => {
    /*
      Efekt sterujący sekwencją zależy WYŁĄCZNIE od fazy i od stabilnej
      referencji `markSeen`. Zmiana danych nie zmienia fazy, więc nie ma
      czego restartować — ani kadru, ani osi czasu, ani zapisu.
    */
    expect(podium).toContain("}, [focus.phase, markSeen]);");
    expect(podium).toContain("const markSeen = useCallback(");
    expect(podium).toContain("}, []);");

    // Token finalizacji nadal wyznacza tożsamość pamięci ceremonii.
    expect(podium).toContain("const storageKey =");
    expect(podium).toContain("isComplete && completionToken");
  });
});

describe("23, 24: naturalny scroll", () => {
  it("Q: scroll nie wprowadza w kadr — źródło jest jawne", () => {
    const observer = podium.slice(
      podium.indexOf("const observer = new IntersectionObserver"),
      podium.indexOf("observer.observe(node);")
    );

    expect(observer).toContain('source: "viewport"');
    expect(observer).not.toContain('source: "cta"');
  });

  it("24: próg liczy się od SCENY, nie od całej sekcji z ogonem", () => {
    expect(podium).toContain("const node = coreRef.current;");
    expect(podium).toContain("coreHeight: record.boundingClientRect.height");
    expect(podium).toContain("viewportHeight: window.innerHeight");
    expect(podium).toContain("shouldStartOnViewport");
  });

  it("24: stary próg 20 procent czegokolwiek zniknął", () => {
    expect(podium).not.toContain('rootMargin: "0px 0px -20% 0px"');
    expect(podium).toContain("threshold: [0,");
  });
});

describe("8, 32, 33, 34: rozmiar i zmiana okna", () => {
  it("8/33: kadr nie rozciąga podium na cały ekran", () => {
    // Skala jest ograniczona z góry przez jedynkę — patrz `computeFocusTransform`.
    const focus = source("lib/public/cinematic-focus.ts");
    expect(focus).toContain("const scale = Math.min(");
    expect(focus.slice(focus.indexOf("const scale = Math.min("))).toMatch(
      /Math\.min\(\s*1,/
    );
    expect(podium).not.toContain("w-screen");
    expect(podium).not.toContain("h-screen");
  });

  it("32: kadr nie jest scrollowalnym oknem", () => {
    const style = podium.slice(podium.indexOf("const focusStyle"));

    expect(style).not.toContain("overflow-y-auto");
    expect(style).not.toContain("max-h-[");
  });

  it("34: zmiana rozmiaru okna przelicza kadr zamiast go gubić", () => {
    expect(podium).toContain('window.addEventListener("resize", recompute)');
    expect(podium).toContain('window.addEventListener("orientationchange", recompute)');
  });

  it("7: strefy bezpieczne są odczytywalne z JavaScriptu", () => {
    expect(css).toContain("--safe-top: env(safe-area-inset-top, 0px);");
    expect(css).toContain("--safe-bottom: env(safe-area-inset-bottom, 0px);");
    expect(podium).toContain('readSafeInset("--safe-top")');
    expect(podium).toContain('readSafeInset("--safe-bottom")');
  });
});

describe("35, 40, 51: czego nie ruszamy", () => {
  it("35: ograniczony ruch nie dostaje ani kadru, ani czekania", () => {
    expect(button).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)")');
    expect(podium).toContain("useSyncExternalStore");
  });

  it("40: zero dźwięku", () => {
    for (const file of [podium, backdrop, button]) {
      expect(file).not.toContain("new Audio");
      expect(file).not.toContain("play()");
      expect(file).not.toContain(".mp3");
    }
  });

  it("51: geometria sceny i hierarchia medali bez zmian", () => {
    expect(podium).toContain('data-testid="podium-scene"');
    expect(podium).toContain("mx-auto mt-6 flex w-full max-w-[34rem] items-end justify-center");
    expect(podium).toContain('heightClass="h-24 sm:h-28"');
    expect(podium).toContain('heightClass="h-16 sm:h-20"');
    expect(podium).toContain('heightClass="h-12 sm:h-14"');
    expect(podium).toContain('data-testid="podium-tail"');
  });

  it("AD: babelek kategorii nie przebija się przez kadr", () => {
    const bubble = source("components/public/category-switcher.tsx");

    // 30 < 40: przyciemnienie zawsze wyżej niż pływający przycisk.
    expect(bubble).toContain("fixed right-4 z-30");
    expect(css).toContain("--z-cinematic-backdrop: 40;");
  });
});

describe("łańcuch przodków sekcji zostaje czysty", () => {
  it("nic nad podium nie tworzy własnego kontenera pozycjonowania", () => {
    /*
      `position: fixed` liczy się względem ekranu tylko wtedy, gdy żaden
      przodek nie ma `transform`, `filter` ani `backdrop-filter`. Kadr ma
      awaryjną korektę dryfu, ale jej istnienie nie jest pozwoleniem na
      zabrudzenie łańcucha — stąd ten test.
    */
    const shell = source("components/tournament-shell.tsx");
    const tabs = source("components/group-tabs.tsx");

    expect(shell).toContain('<div className="space-y-4 sm:space-y-6">');
    expect(tabs).toContain('<section className="space-y-4">');

    // Przejście między grupami transformuje tylko w trakcie zmiany grupy.
    const transition = source("components/public/group-transition.tsx");
    expect(transition).toContain('phase === "out" ? "translateY(-2px)" : undefined');

    expect(podium).toContain("driftRef.current");
  });
});
