/**
 * CINEMATIC FOCUS — czysta maszyna stanów, bez Reacta i bez DOM.
 *
 * Ceremonia podium ma dwie drogi wejścia i one nie mogą się mieszać:
 *
 *   1. kibic klika „Zobacz celebrację" → sekcja wyjeżdża na środek ekranu,
 *      tło ciemnieje, i DOPIERO wtedy rusza istniejąca choreografia,
 *   2. kibic normalnie doscrollował → ceremonia leci w miejscu,
 *      bez przyciemniania i bez przenoszenia sekcji.
 *
 * Sekwencja jest deterministyczna, a nie splotem kilkunastu flag. Dzięki
 * temu „reveal nie może wystartować przed gotowym kadrem" jest własnością
 * maszyny, a nie obietnicą w komentarzu.
 */

/* ==========================================================================
 * TEMPO
 * ======================================================================== */

export const FOCUS = {
  /** Wejście tła: ciemnienie i rozmycie. */
  backdropMs: 320,
  /** Przejazd sekcji na środek kadru. */
  enterMs: 620,
  /**
   * Oddech po zatrzymaniu kadru: „okej, patrz tutaj".
   * Bez niego pierwsze miejsce wjeżdża w trakcie hamowania kamery.
   */
  readyPauseMs: 260,
  /** Ile finalne podium zostaje w centrum, zanim kadr się rozjedzie. */
  finalHoldMs: 900,
  /** Powrót sekcji na swoje miejsce w dokumencie. */
  exitMs: 540,
  /** Ten sam motion token, którym jedzie cała ceremonia. */
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/* ==========================================================================
 * STAN
 * ======================================================================== */

export type FocusPhase =
  /** Nic się nie dzieje — podium czeka. */
  | "idle"
  /** Tło gaśnie, sekcja jedzie na środek. */
  | "entering"
  /** Kadr stoi. Ceremonia JESZCZE nie ruszyła. */
  | "focused"
  /** Choreografia leci. */
  | "revealing"
  /** Złoto wybrzmiało — moment na zobaczenie wyniku. */
  | "finalHold"
  /** Sekcja wraca na swoje miejsce w dokumencie. */
  | "exiting"
  /** Stan końcowy: wszystko odsłonięte, zero ruchu. */
  | "finished";

/** Kto uruchomił ceremonię. Od tego zależy, czy w ogóle jest kadr. */
export type TriggerSource = "cta" | "viewport";

export type FocusState = {
  phase: FocusPhase;
  source: TriggerSource | null;
};

export type FocusEvent =
  | { type: "REQUEST"; source: TriggerSource; reducedMotion: boolean }
  /** Ceremonia była już oglądana — wchodzimy od razu w stan końcowy. */
  | { type: "ALREADY_SEEN" }
  | { type: "ENTERED" }
  | { type: "READY" }
  | { type: "REVEALED" }
  | { type: "HELD" }
  | { type: "EXITED" }
  /** Escape: koniec ruchu, pełny wynik, bez powtórki. */
  | { type: "SKIP" };

export const IDLE_FOCUS: FocusState = { phase: "idle", source: null };

/**
 * PIERWSZY ZAAKCEPTOWANY WYZWALACZ WYGRYWA.
 *
 * Kibic może być tuż przy podium (obserwator prawie odpalił) i w tej samej
 * chwili kliknąć przycisk. Odrzucenie każdego żądania spoza `idle` jest
 * JEDYNYM miejscem, w którym ta wyścigówka się rozstrzyga — nie ma drugiego
 * zabezpieczenia rozsypanego po komponencie.
 */
export function reduceFocus(state: FocusState, event: FocusEvent): FocusState {
  switch (event.type) {
    case "ALREADY_SEEN":
      return { phase: "finished", source: null };

    case "REQUEST": {
      if (state.phase !== "idle") return state;

      /*
        OGRANICZONY RUCH.

        Nie każemy nikomu czekać ośmiu sekund na „ceremonię bez animacji".
        Klik od razu daje pełny, statyczny wynik — i tyle.
      */
      if (event.reducedMotion) {
        return { phase: "finished", source: event.source };
      }

      // Naturalny scroll nie ma kadru: ceremonia leci w miejscu.
      if (event.source === "viewport") {
        return { phase: "revealing", source: "viewport" };
      }

      return { phase: "entering", source: "cta" };
    }

    case "ENTERED":
      return state.phase === "entering"
        ? { ...state, phase: "focused" }
        : state;

    case "READY":
      return state.phase === "focused"
        ? { ...state, phase: "revealing" }
        : state;

    case "REVEALED": {
      if (state.phase !== "revealing") return state;

      // Bez kadru nie ma z czego wychodzić — ceremonia po prostu się kończy.
      return state.source === "cta"
        ? { ...state, phase: "finalHold" }
        : { ...state, phase: "finished" };
    }

    case "HELD":
      return state.phase === "finalHold"
        ? { ...state, phase: "exiting" }
        : state;

    case "EXITED":
      return state.phase === "exiting"
        ? { ...state, phase: "finished" }
        : state;

    case "SKIP": {
      if (state.phase === "idle" || state.phase === "finished") return state;

      /*
        Escape kończy RUCH, nie ceremonię: wynik jest pełny i zapamiętany.
        Kadr rozjeżdża się płynnie, bo nagłe zniknięcie wygląda jak awaria.
      */
      return state.source === "cta"
        ? { ...state, phase: "exiting" }
        : { ...state, phase: "finished" };
    }

    default:
      return state;
  }
}

/* ==========================================================================
 * ODCZYTY
 * ======================================================================== */

/** Czy sekcja jest wyjęta z dokumentu i stoi w kadrze. */
export function isFocusLayerActive(state: FocusState): boolean {
  if (state.source !== "cta") return false;

  return (
    state.phase === "entering" ||
    state.phase === "focused" ||
    state.phase === "revealing" ||
    state.phase === "finalHold" ||
    state.phase === "exiting"
  );
}

/**
 * BRAMKA CEREMONII.
 *
 * `revealed` steruje wszystkimi opóźnieniami CSS choreografii. Skoro
 * zapala się dopiero od `revealing`, to reveal FIZYCZNIE nie może ruszyć
 * wcześniej — ani w chwili kliknięcia, ani w trakcie przejazdu kadru.
 */
export function isRevealing(state: FocusState): boolean {
  return (
    state.phase === "revealing" ||
    state.phase === "finalHold" ||
    state.phase === "exiting" ||
    state.phase === "finished"
  );
}

/** Ceremonia wybrzmiała: dymki z nazwami wracają do życia. */
export function isCeremonyDone(state: FocusState): boolean {
  return (
    state.phase === "finalHold" ||
    state.phase === "exiting" ||
    state.phase === "finished"
  );
}

/* ==========================================================================
 * WIDOCZNOŚĆ PRZY NATURALNYM SCROLLU
 * ======================================================================== */

/**
 * Wymagana widoczność sceny, żeby uznać, że kibic NAPRAWDĘ doscrollował.
 *
 * Poprzedni próg (dowolny piksel sekcji przy dolnej krawędzi) odpalał
 * ceremonię, zanim ktokolwiek zobaczył podium. Chcemy pełnej sceny — ale
 * na niskim telefonie scena bywa wyższa niż ekran i próg 100% nigdy by nie
 * zapadł. Dlatego wymaganie SKALUJE SIĘ do tego, ile w ogóle da się
 * pokazać, i nigdy nie jest nieosiągalne.
 */
export function requiredVisibleRatio(input: {
  coreHeight: number;
  viewportHeight: number;
}): number {
  const { coreHeight, viewportHeight } = input;

  if (coreHeight <= 0 || viewportHeight <= 0) return 1;

  // Scena mieści się w ekranie: żądamy jej praktycznie w całości.
  if (coreHeight <= viewportHeight) return 0.98;

  /*
    Scena wyższa niż ekran. Maksimum osiągalne to `viewport / core`;
    bierzemy z tego 92%, więc zostaje zapas na zaokrąglenia przeglądarki,
    a próg NIGDY nie jest nieosiągalny.

    Świadomie nie ma tu podłogi w rodzaju „minimum 60%". Przy scenie trzy
    razy wyższej niż ekran taka podłoga byłaby matematycznie nie do
    przeskoczenia i ceremonia nie odpaliłaby się nigdy — a niski procent
    bardzo wysokiej sceny i tak znaczy, że wypełnia ona cały ekran.
  */
  return Math.min(0.98, (viewportHeight / coreHeight) * 0.92);
}

export function shouldStartOnViewport(input: {
  /** Widoczna część sceny (0-1). */
  ratio: number;
  /** Wysokość samej sceny podium: tytuł i stopnie. */
  coreHeight: number;
  viewportHeight: number;
}): boolean {
  return input.ratio >= requiredVisibleRatio(input);
}

/* ==========================================================================
 * GEOMETRIA KADRU
 * ======================================================================== */

export type Rect = { top: number; left: number; width: number; height: number };

export type FocusTransform = {
  translateX: number;
  translateY: number;
  scale: number;
};

/** Oddech przy krawędziach ekranu — telefon ciaśniej niż desktop. */
export const FOCUS_MARGIN_PX = { mobile: 10, desktop: 32 } as const;

/**
 * FLIP: z miejsca w dokumencie na środek kadru.
 *
 * Skala nigdy nie przekracza 1 — podium ma stanąć w centrum, a nie urosnąć
 * na 1920 do rozmiaru billboardu. Skurczyć się może, jeśli inaczej nie
 * zmieściłoby się w ekranie.
 */
export function computeFocusTransform(input: {
  rect: Rect;
  viewportWidth: number;
  viewportHeight: number;
  /** Strefy bezpieczne: pasek przeglądarki, notch, home indicator. */
  safeTop?: number;
  safeBottom?: number;
}): FocusTransform {
  const { rect, viewportWidth, viewportHeight } = input;

  if (rect.width <= 0 || rect.height <= 0) {
    return { translateX: 0, translateY: 0, scale: 1 };
  }

  const margin =
    viewportWidth < 640 ? FOCUS_MARGIN_PX.mobile : FOCUS_MARGIN_PX.desktop;

  const safeTop = input.safeTop ?? 0;
  const safeBottom = input.safeBottom ?? 0;

  const availableWidth = Math.max(0, viewportWidth - margin * 2);
  const availableHeight = Math.max(
    0,
    viewportHeight - safeTop - safeBottom - margin * 2,
  );

  const scale = Math.min(
    1,
    availableWidth / rect.width,
    availableHeight / rect.height,
  );

  // Środek kadru z uwzględnieniem stref bezpiecznych — nie samo „50%".
  const targetCenterX = viewportWidth / 2;
  const targetCenterY = safeTop + (viewportHeight - safeTop - safeBottom) / 2;

  return {
    translateX: targetCenterX - (rect.left + rect.width / 2),
    translateY: targetCenterY - (rect.top + rect.height / 2),
    // Podłoga chroni przed absurdem, gdyby sekcja była gigantyczna.
    scale: Math.max(0.5, scale),
  };
}

/** Zdarzenie, którym przycisk celebracji prosi podium o kadr. */
export const CELEBRATION_REQUEST_EVENT = "celebration-request";

export type CelebrationRequestDetail = { scopeKey: string };
