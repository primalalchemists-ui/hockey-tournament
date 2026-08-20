"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  BracketTeamView,
  ClassificationView,
} from "@/lib/data/postgres/playoff-engine";
import type { ClassificationSlot } from "@/lib/playoff/classification";
import { CellPopover } from "@/components/ui/cell-popover";
import { celebrationSectionId } from "@/lib/public/celebration";
import { pulse } from "@/lib/public/haptics";
import { CEREMONY, beamAtMs, glowAtMs } from "@/lib/public/ceremony-timing";
import { CELEBRATION_SEEN_EVENT } from "@/components/use-celebration";
import { CinematicBackdrop } from "@/components/playoff/cinematic-backdrop";
import { lockBodyScroll } from "@/lib/public/scroll-lock";
import {
  CELEBRATION_REQUEST_EVENT,
  FOCUS,
  IDLE_FOCUS,
  computeFocusTransform,
  isCeremonyDone,
  isFocusLayerActive,
  isRevealing,
  reduceFocus,
  shouldStartOnViewport,
  type CelebrationRequestDetail,
  type FocusTransform,
  type Rect,
} from "@/lib/public/cinematic-focus";
import {
  PODIUM_DROP_MS,
  PODIUM_HAPTIC_MS,
  PODIUM_IMPACT_MS,
  PODIUM_SHAKE_PX,
  REVEAL_DURATION_MS,
  STAGE_SHAKE_PX,
  buildPodiumStorageKey,
  buildRevealOrder,
  getImpactMs,
  getRevealTotalMs,
  hasSeenReveal,
  markRevealSeen,
} from "@/lib/public/podium-reveal";

type PodiumSectionProps = {
  tournamentId: string;
  scopeKey: string;
  /** null dopóki turniej nie został oficjalnie zakończony. */
  classification: ClassificationView | null;
  /** Sloty bez drużyn — puste podium przed zakończeniem. */
  skeleton: ClassificationSlot[];
  completionToken: string | null;
  backgroundUrl: string | null;
};

const MEDALS: Record<number, string> = {
  1: "/images/medals/gold.png",
  2: "/images/medals/silver.png",
  3: "/images/medals/bronze.png",
};

/* ==========================================================================
 * ELEMENTY
 * ======================================================================== */

/**
 * HERB NA PODIUM.
 *
 * Nazwa drużyny NIE jest już wypisana pod logo — scena ma być lekka,
 * a nazwy dokładały jej najwięcej ciężaru. Pełna nazwa jest dostępna
 * przez najechanie, klawiaturę albo dotknięcie, a czytnik ekranu zna ją
 * z etykiety razem z zajętym miejscem.
 */
function TeamLogo({
  team,
  size,
  position,
  interactive,
}: {
  team: BracketTeamView | null;
  size: "winner" | "lg" | "sm";
  position: number | null;
  /** Dymek budzi się dopiero po zakończeniu wjazdu tego miejsca. */
  interactive: boolean;
}) {
  // Hierarchia medalowa zaczyna sie juz na rozmiarze logo.
  const dimension =
    size === "winner"
      ? "h-14 w-14 xs:h-16 xs:w-16 sm:h-[4.5rem] sm:w-[4.5rem]"
      : size === "lg"
        ? "h-11 w-11 xs:h-12 xs:w-12 sm:h-14 sm:w-14"
        : "h-9 w-9";

  const badge = team?.logoUrl ? (
    <img
      src={team.logoUrl}
      alt=""
      className="h-full w-full rounded-2xl object-contain p-0.5"
    />
  ) : (
    <span className="text-sm font-semibold text-white/30">
      {team ? (team.logoText?.slice(0, 3) ?? team.name.slice(0, 3)) : "?"}
    </span>
  );

  const shell = `${dimension} flex items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/[0.07]`;

  if (!team) {
    return (
      <span aria-hidden="true" className={shell}>
        {badge}
      </span>
    );
  }

  return (
    <CellPopover
      testId="podium-team"
      disabled={!interactive}
      label={position ? `${position}. miejsce — ${team.name}` : team.name}
      content={team.name}
      className={`${shell} transition-colors hover:border-white/40`}
    >
      {badge}
    </CellPopover>
  );
}

/**
 * WARSTWY MIKROREAKCJI SCENY.
 *
 * Jeden element nie odtworzy trzech animacji tej samej właściwości
 * (`transform`), bo przy `fill-mode: both` wygrywa ostatnia. Dlatego każde
 * lądowanie dostaje własną, zagnieżdżoną warstwę — transformacje składają
 * się naturalnie, a każda wraca do zera, więc nic nie zostaje przesunięte.
 */
function StageShake({
  impacts,
  animate,
  children,
}: {
  impacts: Array<{ position: number; atMs: number }>;
  animate: boolean;
  children: React.ReactNode;
}) {
  if (!animate || impacts.length === 0) {
    return <div data-testid="podium-stage">{children}</div>;
  }

  return impacts.reduce(
    (inner, impact) => (
      <div
        key={impact.position}
        data-testid="podium-stage-shake"
        data-position={impact.position}
        className="stage-impact"
        style={{
          animationDelay: `${impact.atMs}ms`,
          ["--stage-ms" as string]: `${CEREMONY.stageShakeMs}ms`,
          ["--stage-shake" as string]: `${STAGE_SHAKE_PX[impact.position] ?? 1}px`,
        }}
      >
        {inner}
      </div>
    ),
    <div data-testid="podium-stage">{children}</div>,
  );
}

/** Ton światła bierze się z medalu, nie z osobnej palety. */
const PODIUM_TONE: Record<number, string> = {
  1: "podium-tone-gold",
  2: "podium-tone-silver",
  3: "podium-tone-bronze",
};

/**
 * Wykończenie krążka: obwódka, połysk i osadzenie.
 *
 * Medale są grafikami, więc obrys powstaje z warstw `drop-shadow`
 * podążających za ich kształtem — patrz `.medal-*` w globals.css.
 */
const MEDAL_FINISH: Record<number, string> = {
  1: "medal-gold",
  2: "medal-silver",
  3: "medal-bronze",
};

function Step({
  entry,
  label,
  heightClass,
  medalClass,
  revealed,
  delayMs,
  isWinner,
  reducedMotion,
  animate,
  interactive,
}: {
  entry: ClassificationView["entries"][number] | null;
  label: string;
  heightClass: string;
  /** Rozmiar medalu wynika z wysokości stopnia, nie jest wspólny. */
  medalClass: string;
  revealed: boolean;
  delayMs: number;
  isWinner: boolean;
  reducedMotion: boolean;
  /**
   * Czy ceremonia ODTWARZA SIĘ TERAZ.
   *
   * To nie to samo co `revealed`. Kibic, który widział już ceremonię, wchodzi
   * od razu w stan końcowy: wszystko jest odsłonięte (`revealed`), ale nic
   * się nie animuje. Bez tego rozróżnienia opadanie herbów, snopy światła
   * i uderzenia odtwarzały się przy KAŻDYM wejściu na stronę.
   */
  animate: boolean;
  interactive: boolean;
}) {
  const position = entry?.position ?? null;
  const medal = position ? MEDALS[position] : null;
  const tone = position ? PODIUM_TONE[position] : "";

  /*
    SEKWENCJA JEDNEGO MIEJSCA.

    herb opada (PODIUM_DROP_MS) → ląduje → stopień drga → snop światła
    gaśnie → zostaje spokojny blask. Każde miejsce ma własne opóźnienie,
    więc nic nie zapala się jednocześnie.
  */
  const impactMs = getImpactMs(delayMs);

  /*
    Snop jest około półtora raza szerszy od herbu tego miejsca — zwycięzca
    ma większe logo, więc i szerszy słup światła.
  */
  const beamWidth = isWinner ? "6.5rem" : "5rem";

  return (
    /*
      GEOMETRIA MOBILE.

      Slot dostaje bazę 0 i rośnie proporcjonalnie, więc trzy stopnie ZAWSZE
      dzielą dostępną szerokość sceny zamiast sumować swoje maksima.
      Zwycięzca jest odrobinę szerszy od pozostałych — hierarchia zostaje,
      a brązowy medal nie wychodzi już poza prawą krawędź.
    */
    <div
      data-testid="podium-step"
      data-position={position ?? label}
      className={[
        "flex min-w-0 basis-0 flex-col items-center gap-2 sm:gap-2.5",
        tone,
        isWinner
          ? "grow-[1.15] max-w-[8.5rem] sm:max-w-[9.5rem]"
          : "grow max-w-[7rem] sm:max-w-[9rem]",
      ].join(" ")}
    >
      <div
        data-testid="podium-logo"
        className={[
          "flex w-full min-w-0 flex-col items-center",
          animate ? "podium-drop" : "",
        ].join(" ")}
        style={
          animate
            ? {
                // Herb startuje NAD swoim miejscem i opada dokładnie na nie.
                animationDelay: `${delayMs}ms`,
                ["--drop-ms" as string]: `${PODIUM_DROP_MS}ms`,
              }
            : { opacity: revealed ? 1 : 0 }
        }
      >
        <TeamLogo
          team={entry?.team ?? null}
          size={isWinner ? "winner" : "lg"}
          position={position}
          interactive={interactive}
        />
      </div>

      <div
        data-testid={isWinner ? "podium-winner-step" : undefined}
        className={[
          "relative flex w-full items-center justify-center rounded-t-2xl border border-b-0 bg-gradient-to-b",
          heightClass,
          isWinner && revealed
            ? "border-amber-200/40 from-white/[0.18] to-white/[0.06]"
            : "border-white/15 from-white/[0.11] to-white/[0.04]",
          // Uderzenie dotyczy WYŁĄCZNIE tego stopnia — nigdy strony.
          animate ? "podium-impact" : "",
        ].join(" ")}
        style={
          animate
            ? {
                animationDelay: `${impactMs}ms`,
                ["--impact-ms" as string]: `${PODIUM_IMPACT_MS}ms`,
                ["--shake" as string]: `${PODIUM_SHAKE_PX[position ?? 3] ?? 1}px`,
              }
            : undefined
        }
      >
        {/* Świetlny grzbiet stopnia — głębia bez sztuczek 3D. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-0 h-px bg-white/25"
        />

        {/*
          Snop światła schodzi z góry dokładnie na ten stopień i wyprzedza
          lądowanie, żeby zdążył go oświetlić. Jest szerszy niż herb —
          ma go otaczać, a nie celować w niego punktowo.
        */}
        {animate && position ? (
          <span
            aria-hidden="true"
            data-testid="podium-beam"
            className="podium-beam"
            style={{
              animationDelay: `${beamAtMs(delayMs)}ms`,
              ["--beam-ms" as string]: `${CEREMONY.beamDurationMs}ms`,
              ["--beam-w" as string]: beamWidth,
            }}
          />
        ) : null}

        {/*
          Blask zapala się chwilę PO uderzeniu i narasta łagodnie — dzięki
          tej zwłoce platforma wygląda, jakby reagowała na lądowanie.
        */}
        {revealed && position ? (
          <span
            aria-hidden="true"
            data-testid="podium-glow"
            className="podium-glow absolute inset-0 rounded-t-2xl"
            style={
              animate
                ? {
                    animationDelay: `${glowAtMs(delayMs)}ms`,
                    ["--glow-ms" as string]: `${CEREMONY.glowFadeMs}ms`,
                  }
                : undefined
            }
          />
        ) : null}

        {medal && entry ? (
          <img
            src={medal}
            alt={`${entry.position}. miejsce`}
            data-testid="podium-medal"
            /*
              Medal jest wyśrodkowany w SWOIM stopniu (items-center +
              justify-center), a jego rozmiar wynika z wysokości tego
              stopnia — złoto największe, brąz najmniejsze.
            */
            className={`${medalClass} medal-finish ${MEDAL_FINISH[entry.position!] ?? ""} relative object-contain`}
          />
        ) : (
          <span className="stat-num relative text-lg font-bold text-white/45">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Miejsce spoza podium: numer i herb.
 *
 * Nazwy drużyn zostały stąd usunięte razem z tymi z podium — rząd
 * 4-N ma być lekkim domknięciem klasyfikacji, a nie drugą tabelą.
 * Pełna nazwa jest pod dotknięciem i pod focusem.
 */
function TailSlot({
  label,
  entry,
  revealed,
  delayMs,
  reducedMotion,
  interactive,
}: {
  label: string;
  entry: ClassificationView["entries"][number] | null;
  revealed: boolean;
  delayMs: number;
  reducedMotion: boolean;
  interactive: boolean;
}) {
  return (
    <li
      data-testid="podium-tail-slot"
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-1.5 py-2.5 backdrop-blur-[2px]"
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : "translateY(0.5rem)",
        transition: reducedMotion
          ? "opacity 160ms ease-out"
          : `opacity ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, transform ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms`,
      }}
    >
      <span className="stat-num text-xs font-bold text-white/45">{label}</span>

      <TeamLogo
        team={entry?.team ?? null}
        size="sm"
        position={entry?.position ?? null}
        interactive={interactive}
      />
    </li>
  );
}

/* ==========================================================================
 * SEKCJA
 * ======================================================================== */

/**
 * Odczyt strefy bezpiecznej w pikselach.
 *
 * `env(safe-area-inset-*)` nie da się przeczytać z JS-a wprost, więc arkusz
 * przepisuje je do zmiennych, a tutaj tylko je odbieramy. Brak wartości
 * (przeglądarka desktopowa) znaczy zero, nie błąd.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!query) return () => {};

  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotion(): boolean {
  return Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches);
}

function readSafeInset(name: string): number {
  if (typeof window === "undefined") return 0;

  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  const value = Number.parseFloat(raw);

  return Number.isFinite(value) ? value : 0;
}

export function PodiumSection({
  tournamentId,
  scopeKey,
  classification,
  skeleton,
  completionToken,
  backgroundUrl,
}: PodiumSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  /** Sama scena: tytuł i trzy stopnie. To ona decyduje o starcie ze scrolla. */
  const coreRef = useRef<HTMLDivElement | null>(null);
  /*
    Ograniczony ruch czytamy jako ZEWNĘTRZNE źródło, a nie przez efekt
    ustawiający stan. Migawka serwerowa mówi „pełny ruch", klient poprawia
    ją zaraz po hydracji — bez rozjazdu i bez kaskady renderów.
  */
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );

  /*
    JEDNA MASZYNA STANÓW NA CAŁĄ CEREMONIĘ.

    Wcześniej stały tu dwa niezależne `useState` (`revealed`, `ceremonyDone`).
    Kadr kinowy dokłada wejście, oddech, przytrzymanie i wyjazd — przy
    flagach skończyłoby się to kilkunastoma booleanami, które da się ustawić
    w niemożliwe kombinacje. Tu sekwencja jest zamknięta w redukcji i to ona
    rozstrzyga wyścig „przycisk kontra obserwator".
  */
  const [focus, dispatch] = useReducer(reduceFocus, IDLE_FOCUS);

  const revealed = isRevealing(focus);
  const ceremonyDone = isCeremonyDone(focus);

  /*
    CEREMONIA JEST JEDNORAZOWA — DLA KAŻDEGO KIBICA OSOBNO.

    Prawdziwa dekoracja odbywa się raz, więc i tutaj ma się odbyć raz.
    Wejście przez `ALREADY_SEEN` (czyli „ten kibic już to widział") jest
    jedyną drogą do stanu końcowego BEZ źródła wyzwolenia — i po niej nic
    się nie animuje.

    Wcześniej `revealed` samo w sobie włączało animacje, więc pełny stan
    końcowy odtwarzał całą choreografię przy każdym wejściu na stronę,
    przy każdym powrocie do zakładki i po każdym kliknięciu „Zobacz
    klasyfikację".
  */
  const alreadySeen = focus.phase === "finished" && focus.source === null;
  const animateCeremony = revealed && !reducedMotion && !alreadySeen;
  const layerActive = isFocusLayerActive(focus);

  /** Zmierzony prostokąt sekcji w dokumencie — baza dla FLIP-a i podkładki. */
  const [naturalRect, setNaturalRect] = useState<Rect | null>(null);
  const [transform, setTransform] = useState<FocusTransform | null>(null);
  /** Poprawka na wypadek przodka tworzącego własny kontener pozycjonowania. */
  const driftRef = useRef({ x: 0, y: 0 });

  const isComplete = Boolean(classification?.complete && completionToken);
  const entries = useMemo(
    () => (isComplete ? (classification?.entries ?? []) : []),
    [isComplete, classification],
  );

  const revealOrder = useMemo(() => buildRevealOrder(entries), [entries]);

  const delayFor = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of revealOrder) map.set(item.key, item.delayMs);
    return map;
  }, [revealOrder]);

  /*
    Czas trwania ceremonii jest LICZBĄ, a nie tablicą.

    To istotne: auto-odświeżanie co 13 s podmienia obiekt klasyfikacji,
    więc `revealOrder` dostaje nową tożsamość mimo identycznej treści.
    Gdy efekt poniżej zależał od tablicy, każde odświeżenie kasowało
    licznik ceremonii i zaczynało go od zera — a przy ceremonii dłuższej
    niż 6 s bywało, że „obejrzane" nie zapisywało się nigdy.
  */
  const revealTotalMs = getRevealTotalMs(revealOrder);

  /** Momenty lądowania medalistów — do krótkich impulsów wibracji. */
  const impacts = useMemo(
    () =>
      entries
        .filter((entry) => entry.position !== null && entry.position <= 3)
        .map((entry) => ({
          position: entry.position as number,
          atMs: getImpactMs(delayFor.get(entry.team.teamId) ?? 0),
        })),
    [entries, delayFor],
  );

  /** Te same momenty, których używa mikroreakcja całej sceny. */
  const stageImpacts = impacts;

  const storageKey =
    isComplete && completionToken
      ? buildPodiumStorageKey({ tournamentId, scopeKey, completionToken })
      : null;

  /*
    ODPORNOŚĆ NA AUTO-ODŚWIEŻANIE.

    Wszystko, czego potrzebują liczniki ceremonii, trzymamy w referencjach.
    Efekt sterujący sekwencją zależy WYŁĄCZNIE od fazy, więc snapshot co 13 s
    nie ma jak przestawić ani jednego licznika: zmiana danych nie zmienia
    fazy, a bez zmiany fazy efekt się nie uruchamia ponownie.
  */
  const impactsRef = useRef(impacts);
  const totalRef = useRef(revealTotalMs);
  const keyRef = useRef(storageKey);
  const reducedRef = useRef(reducedMotion);
  const sourceRef = useRef(focus.source);

  useEffect(() => {
    impactsRef.current = impacts;
    totalRef.current = revealTotalMs;
    keyRef.current = storageKey;
    reducedRef.current = reducedMotion;
    sourceRef.current = focus.source;
  }, [impacts, revealTotalMs, storageKey, reducedMotion, focus.source]);

  /** „Obejrzane" plus sygnał dla przycisku celebracji. */
  const markSeen = useCallback(() => {
    const key = keyRef.current;
    if (!key) return;

    markRevealSeen(key);
    window.dispatchEvent(new Event(CELEBRATION_SEEN_EVENT));
  }, []);

  /* --- ceremonia już oglądana ------------------------------------------ */

  useEffect(() => {
    if (!storageKey) return;
    if (!hasSeenReveal(storageKey)) return;

    // Pełny stan końcowy i od razu działające dymki — bez ceremonii.
    dispatch({ type: "ALREADY_SEEN" });
  }, [storageKey]);

  /* --- pomiar naturalnego miejsca sekcji -------------------------------- */

  const measure = useCallback((): Rect | null => {
    const node = sectionRef.current;
    if (!node) return null;

    const box = node.getBoundingClientRect();

    return {
      top: box.top,
      left: box.left,
      width: box.width,
      height: box.height,
    };
  }, []);

  /* --- żądanie kadru z przycisku celebracji ----------------------------- */

  useEffect(() => {
    function onRequest(event: Event) {
      const detail = (event as CustomEvent<CelebrationRequestDetail>).detail;

      // Przycisk prowadzi do podium OGLĄDANEJ grupy — nie do cudzej.
      if (detail?.scopeKey !== scopeKey) return;
      if (!keyRef.current) return;

      /*
        Pomiar MUSI się odbyć, zanim sekcja wyskoczy z dokumentu — potem
        jej naturalny prostokąt już nie istnieje.
      */
      const rect = measure();
      if (rect) setNaturalRect(rect);

      // Świeży FLIP zawsze startuje od zera — nigdy od kadru poprzedniej próby.
      setTransform(null);

      dispatch({
        type: "REQUEST",
        source: "cta",
        reducedMotion: reducedRef.current,
      });
    }

    window.addEventListener(CELEBRATION_REQUEST_EVENT, onRequest);
    return () =>
      window.removeEventListener(CELEBRATION_REQUEST_EVENT, onRequest);
  }, [scopeKey, measure]);

  /* --- naturalny scroll: ceremonia w miejscu ---------------------------- */

  useEffect(() => {
    if (!storageKey) return;
    if (hasSeenReveal(storageKey)) return;

    const node = coreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const start = shouldStartOnViewport({
            ratio: record.intersectionRatio,
            coreHeight: record.boundingClientRect.height,
            viewportHeight: window.innerHeight,
          });

          if (!start) continue;

          observer.disconnect();

          /*
            Jeśli kadr już jedzie, redukcja to żądanie ODRZUCI — obserwator
            nie ma prawa dopisać drugiej osi czasu do trwającej ceremonii.
          */
          dispatch({
            type: "REQUEST",
            source: "viewport",
            reducedMotion: reducedRef.current,
          });
          return;
        }
      },
      /*
        Gęsta drabinka progów: przy jednym progu przeglądarka nie zgłasza
        zmian pomiędzy nimi i adaptacyjna reguła nie miałaby czego czytać.
      */
      { threshold: [0, 0.25, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 1] },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [storageKey]);

  /* --- sekwencja: jedyny sterownik czasu -------------------------------- */

  useEffect(() => {
    const phase = focus.phase;

    if (phase === "idle" || phase === "finished") return;

    const timers: number[] = [];

    if (phase === "entering") {
      timers.push(
        window.setTimeout(() => dispatch({ type: "ENTERED" }), FOCUS.enterMs),
      );
    }

    if (phase === "focused") {
      // Oddech przed pierwszym miejscem — kadr już stoi.
      timers.push(
        window.setTimeout(
          () => dispatch({ type: "READY" }),
          FOCUS.readyPauseMs,
        ),
      );
    }

    if (phase === "revealing") {
      /*
        „Obejrzane" zapisujemy DOPIERO po pełnym odsłonięciu — zamknięcie
        strony w połowie pozwala zobaczyć ceremonię ponownie.
      */
      timers.push(
        window.setTimeout(() => {
          markSeen();
          dispatch({ type: "REVEALED" });
        }, totalRef.current),
      );

      /*
        Wibracja to WYŁĄCZNIE wzmocnienie lądowania medalisty. Każdy warunek
        bezpieczeństwa (brak API, ograniczony ruch, ukryta karta) kończy się
        ciszą, nigdy błędem.
      */
      for (const impact of impactsRef.current) {
        timers.push(
          window.setTimeout(() => {
            pulse(PODIUM_HAPTIC_MS[impact.position] ?? 0, {
              isLiveReveal: true,
              reducedMotion: reducedRef.current,
              documentVisible:
                typeof document === "undefined" ||
                document.visibilityState === "visible",
            });
          }, impact.atMs),
        );
      }
    }

    if (phase === "finalHold") {
      timers.push(
        window.setTimeout(() => dispatch({ type: "HELD" }), FOCUS.finalHoldMs),
      );
    }

    if (phase === "exiting") {
      timers.push(
        window.setTimeout(() => dispatch({ type: "EXITED" }), FOCUS.exitMs),
      );
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
    /*
      ZALEŻNOŚĆ JEST JEDNA I TO JEST CELOWE. Reszta wchodzi przez referencje,
      więc odświeżenie danych w trakcie ceremonii nie restartuje ani liczników,
      ani kadru, ani zapisu „obejrzane".
    */
  }, [focus.phase, markSeen]);

  /* --- ograniczony ruch: klik daje od razu stan końcowy ------------------ */

  useEffect(() => {
    if (focus.phase !== "finished") return;
    if (focus.source === null) return;

    // Wejście przez REQUEST z ograniczonym ruchem albo zwykłe domknięcie.
    markSeen();
  }, [focus.phase, focus.source, markSeen]);

  /* --- FLIP: przejazd na środek kadru ----------------------------------- */

  useLayoutEffect(() => {
    if (focus.phase !== "entering") return;

    const node = sectionRef.current;
    if (!node || !naturalRect) return;

    /*
      KOREKTA KONTENERA POZYCJONOWANIA.

      `position: fixed` liczy się względem viewportu tylko wtedy, gdy żaden
      przodek nie ma `transform`, `filter` ani `backdrop-filter`. Dziś łańcuch
      jest czysty, ale zamiast na to liczyć — mierzymy. Różnicę wyrównujemy
      jeszcze przed odmalowaniem klatki, więc start FLIP-a jest zawsze w tym
      samym miejscu, w którym sekcja stała w dokumencie.
    */
    const box = node.getBoundingClientRect();

    /*
      Dryf trzymamy w referencji i wliczamy do PRZESUNIĘCIA, zamiast
      przestawiać `top`/`left` przez stan. Przy czystym łańcuchu przodków
      jest zerowy i nic nie kosztuje; przy zabrudzonym kadr wraca na miejsce
      w tej samej klatce, w której i tak startuje ruch.
    */
    driftRef.current = {
      x: naturalRect.left - box.left,
      y: naturalRect.top - box.top,
    };

    const base = computeFocusTransform({
      rect: naturalRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      safeTop: readSafeInset("--safe-top"),
      safeBottom: readSafeInset("--safe-bottom"),
    });

    const next: FocusTransform = {
      ...base,
      translateX: base.translateX + driftRef.current.x,
      translateY: base.translateY + driftRef.current.y,
    };

    // Klatka zerowa FLIP-a to brak transformacji; ruch startuje w następnej.
    const frame = window.requestAnimationFrame(() => setTransform(next));

    return () => window.cancelAnimationFrame(frame);
  }, [focus.phase, naturalRect]);

  /* --- zmiana rozmiaru okna w trakcie kadru ----------------------------- */

  useEffect(() => {
    if (!layerActive) return;

    function recompute() {
      setNaturalRect((rect) => {
        if (!rect) return rect;

        setTransform(
          computeFocusTransform({
            rect,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            safeTop: readSafeInset("--safe-top"),
            safeBottom: readSafeInset("--safe-bottom"),
          }),
        );

        return rect;
      });
    }

    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);

    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, [layerActive]);

  /* --- blokada strony, klawiatura i focus -------------------------------- */

  useEffect(() => {
    if (!layerActive) return;

    const restoreScroll = lockBodyScroll();
    const previouslyFocused = document.activeElement as HTMLElement | null;

    sectionRef.current?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        // Koniec ruchu, pełny wynik. Ceremonia NIE wraca do „nieobejrzanej".
        markSeen();
        dispatch({ type: "SKIP" });
        return;
      }

      if (event.key !== "Tab") return;

      /*
        W kadrze nie ma formularza, więc nie budujemy pełnej pętli focusu.
        Wystarczy, że klawiatura nie ucieka na header, zakładki i przełącznik
        kategorii schowane pod przyciemnieniem.
      */
      const node = sectionRef.current;
      if (!node) return;

      const active = document.activeElement;
      if (!active || !node.contains(active)) {
        event.preventDefault();
        node.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [layerActive, markSeen]);

  /** Dymki z nazwami budzą się dopiero po ceremonii — patrz TeamLogo. */
  const interactive = ceremonyDone || reducedMotion;

  /* --- rozmieszczenie slotów ------------------------------------------- */

  const byPosition = new Map<number, ClassificationView["entries"][number]>();
  const sharedEntries: ClassificationView["entries"] = [];

  for (const entry of entries) {
    if (entry.shared || entry.position === null) sharedEntries.push(entry);
    else byPosition.set(entry.position, entry);
  }

  const podiumSlots = skeleton.filter(
    (slot) => slot.position !== null && slot.position <= 3,
  );
  const hasSharedTop = skeleton.some((slot) => slot.shared);
  const tailSlots = skeleton.filter(
    (slot) => slot.position !== null && slot.position > 3,
  );

  const stepFor = (position: number) => byPosition.get(position) ?? null;
  const delayOf = (entry: ClassificationView["entries"][number] | null) =>
    entry ? (delayFor.get(entry.team.teamId) ?? 0) : 0;

  /* --- kadr ------------------------------------------------------------- */

  /*
    PODKŁADKA.

    Sekcja wychodzi z przepływu dokumentu, więc bez zastępczej wysokości
    strona pod spodem zapadłaby się o kilkaset pikseli, a pasek przewijania
    skoczyłby w chwili, w której najbardziej ma stać nieruchomo.
  */
  const placeholder =
    layerActive && naturalRect ? (
      <div
        aria-hidden="true"
        data-testid="podium-placeholder"
        style={{ height: naturalRect.height }}
      />
    ) : null;

  /*
    ODWRÓCONY FLIP.

    Wyjście z kadru to po prostu BRAK przesunięcia — ta sama droga, tylko
    w drugą stronę. Liczymy to przy renderze zamiast kasować stan w efekcie:
    faza jest jedynym źródłem prawdy, więc nie ma czego rozjeżdżać.
  */
  const appliedTransform = focus.phase === "exiting" ? null : transform;

  const focusStyle: React.CSSProperties =
    layerActive && naturalRect
      ? {
          position: "fixed",
          top: naturalRect.top,
          left: naturalRect.left,
          width: naturalRect.width,
          margin: 0,
          zIndex: "var(--z-cinematic-stage)" as unknown as number,
          transformOrigin: "center center",
          transform: appliedTransform
            ? `translate3d(${appliedTransform.translateX}px, ${appliedTransform.translateY}px, 0) scale(${appliedTransform.scale})`
            : "translate3d(0, 0, 0) scale(1)",
          transition: `transform ${
            focus.phase === "exiting" ? FOCUS.exitMs : FOCUS.enterMs
          }ms ${FOCUS.easing}`,
          willChange: "transform",
        }
      : {};

  return (
    <>
      {placeholder}

      {layerActive ? <CinematicBackdrop phase={focus.phase} /> : null}

      <section
        ref={sectionRef}
        // Cel przewijania dla przycisku celebracji — osobny dla każdej grupy.
        id={celebrationSectionId(scopeKey)}
        data-testid="podium-section"
        data-focus-phase={focus.phase}
        data-focus-source={focus.source ?? "none"}
        /*
        W kadrze sekcja jest modalna ZACHOWANIEM (blokada strony, przechwycony
        wskaźnik, klawiatura zamknięta w środku), mimo że wyglądem pozostaje
        sceną transmisji, a nie oknem dialogowym. Czytnik ekranu ma o tym
        wiedzieć — stąd `role` i `aria-modal` wyłącznie na czas kadru.
      */
        role={layerActive ? "dialog" : undefined}
        aria-modal={layerActive ? true : undefined}
        tabIndex={layerActive ? -1 : undefined}
        className="flush-card relative overflow-hidden rounded-none border border-white/10 shadow-[0_1.5rem_3rem_-2rem_rgba(15,23,42,0.55)] outline-none sm:rounded-3xl"
        aria-label="Klasyfikacja końcowa"
        style={focusStyle}
      >
        <div
          className="absolute inset-0 bg-slate-900 bg-cover bg-center"
          style={
            backgroundUrl
              ? { backgroundImage: `url(${backgroundUrl})` }
              : undefined
          }
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(30,41,59,0.72),rgba(2,6,23,0.94))]"
          aria-hidden="true"
        />
        {/* Dolny scrim: nazwy i rzedy 4+ nigdy nie gina w artworku turnieju. */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-slate-950/85 to-transparent"
          aria-hidden="true"
        />

        <div className="relative px-4 py-6 sm:px-6 sm:py-8">
          {/*
          RDZEŃ SCENY — tytuł i trzy stopnie.

          To ten fragment, a nie cała sekcja, decyduje o starcie ceremonii
          przy naturalnym scrollu. Sekcja bywa wyższa niż ekran przez ogon
          klasyfikacji; gdyby próg liczył się od niej, na telefonie nie dałoby
          się go osiągnąć.
        */}
          <div ref={coreRef}>
            <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Klasyfikacja końcowa
            </h3>

            {/*
          Podium: 2 z lewej, 1 centralnie i najwyżej, 3 z prawej.

          `w-full` na rzędzie jest istotne: bez niego rząd przyjmował
          szerokość max-content trzech stopni i — wyśrodkowany — wystawał
          poza scenę, przez co brązowy medal był przycinany na telefonie.
        */}
            {/*
          MIKROREAKCJA SCENY.

          Każde lądowanie medalisty porusza CAŁYM wnętrzem sceny — trzy
          zagnieżdżone warstwy, bo jeden element nie umie odtworzyć trzech
          animacji tej samej właściwości. Transformacje się składają, a każda
          warstwa wraca do zera, więc nie zostaje żadne przesunięcie.

          Zakres jest świadomie ograniczony do tego kontenera: ani <body>,
          ani karta klasyfikacji nie drgają.
        */}
            <StageShake
              impacts={stageImpacts}
              animate={animateCeremony}
            >
              <div
                data-testid="podium-scene"
                className="mx-auto mt-6 flex w-full max-w-[34rem] items-end justify-center gap-2 sm:gap-5"
              >
                {podiumSlots.some((slot) => slot.position === 2) ? (
                  <Step
                    entry={stepFor(2)}
                    label="2"
                    heightClass="h-16 sm:h-20"
                    medalClass="h-8 w-8 sm:h-10 sm:w-10"
                    revealed={revealed}
                    delayMs={delayOf(stepFor(2))}
                    isWinner={false}
                    reducedMotion={reducedMotion}
                    animate={animateCeremony}
                    interactive={interactive}
                  />
                ) : null}

                <Step
                  entry={stepFor(1)}
                  label="1"
                  heightClass="h-24 sm:h-28"
                  medalClass="h-11 w-11 sm:h-14 sm:w-14"
                  revealed={revealed}
                  delayMs={delayOf(stepFor(1))}
                  isWinner
                  reducedMotion={reducedMotion}
                  animate={animateCeremony}
                  interactive={interactive}
                />

                {podiumSlots.some((slot) => slot.position === 3) ? (
                  <Step
                    entry={stepFor(3)}
                    label="3"
                    heightClass="h-12 sm:h-14"
                    medalClass="h-7 w-7 sm:h-8 sm:w-8"
                    revealed={revealed}
                    delayMs={delayOf(stepFor(3))}
                    isWinner={false}
                    reducedMotion={reducedMotion}
                    animate={animateCeremony}
                    interactive={interactive}
                  />
                ) : null}
              </div>
            </StageShake>
          </div>

          <div
            aria-hidden="true"
            className="mx-auto mt-0 h-px w-full max-w-[30rem] bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />

          {/* Miejsca dzielone — brak meczu o 3. miejsce. */}
          {hasSharedTop ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                3–4. miejsce
              </p>
              <ul className="mt-2 space-y-2">
                {(sharedEntries.length > 0 ? sharedEntries : [null, null]).map(
                  (entry, index) => (
                    <li
                      key={entry?.team.teamId ?? `shared-${index}`}
                      className="flex items-center gap-3 text-sm text-white"
                      style={{
                        opacity: revealed ? 1 : 0,
                        transform: revealed
                          ? "translateX(0)"
                          : "translateX(-1.25rem)",
                        transition: reducedMotion
                          ? "opacity 160ms ease-out"
                          : `opacity ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayOf(entry)}ms, transform ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayOf(entry)}ms`,
                      }}
                    >
                      {/* Miejsca dzielone czyta się jak zdanie, więc tu nazwa
                      zostaje — to nie jest scena podium. */}
                      <TeamLogo
                        team={entry?.team ?? null}
                        size="sm"
                        position={entry?.position ?? null}
                        interactive={interactive}
                      />
                      <span
                        className={[
                          "truncate",
                          entry ? "font-medium" : "font-semibold text-white/30",
                        ].join(" ")}
                      >
                        {entry ? entry.team.name : "?"}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}

          {/*
          MIEJSCA 4+ — jeden rząd w dolnej, ciemnej części sceny.

          Karty nie leżą na fizycznych stopniach podium: te należą do
          medalistów. Ogon dostaje własny pas niżej, dzięki czemu całość
          czyta się jak jedna scena, a nie lista kart pod obrazkiem.

          Liczba slotów pochodzi ze szkieletu klasyfikacji, nie z hardkodu.
          Przy większej liczbie drużyn rząd zawija się w kolejne linie.
        */}
          {tailSlots.length > 0 ? (
            <ul
              data-testid="podium-tail"
              className="mt-6 flex flex-wrap items-stretch justify-center gap-1.5 border-t border-white/10 pt-4 sm:gap-2.5"
            >
              {tailSlots.map((slot) => {
                const entry = stepFor(slot.position!);

                return (
                  <TailSlot
                    key={slot.position}
                    label={slot.label}
                    entry={entry}
                    revealed={revealed}
                    delayMs={delayOf(entry)}
                    reducedMotion={reducedMotion}
                    interactive={interactive}
                  />
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>
    </>
  );
}
