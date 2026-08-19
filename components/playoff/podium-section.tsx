"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  BracketTeamView,
  ClassificationView,
} from "@/lib/data/postgres/playoff-engine";
import type { ClassificationSlot } from "@/lib/playoff/classification";
import { CellPopover } from "@/components/ui/cell-popover";
import { celebrationSectionId } from "@/lib/public/celebration";
import { pulse } from "@/lib/public/haptics";
import { CELEBRATION_SEEN_EVENT } from "@/components/use-celebration";
import {
  PODIUM_BEAM_MS,
  PODIUM_DROP_MS,
  PODIUM_HAPTIC_MS,
  PODIUM_IMPACT_MS,
  PODIUM_SHAKE_PX,
  REVEAL_DURATION_MS,
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

/** Ton światła bierze się z medalu, nie z osobnej palety. */
const PODIUM_TONE: Record<number, string> = {
  1: "podium-tone-gold",
  2: "podium-tone-silver",
  3: "podium-tone-bronze",
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
  const animate = revealed && !reducedMotion;

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

        {/* Snop światła schodzi z góry dokładnie na ten stopień. */}
        {animate && position ? (
          <span
            aria-hidden="true"
            data-testid="podium-beam"
            className="podium-beam"
            style={{
              animationDelay: `${impactMs - PODIUM_BEAM_MS * 0.55}ms`,
              ["--beam-ms" as string]: `${PODIUM_BEAM_MS}ms`,
            }}
          />
        ) : null}

        {/* Blask medalu zapala się DOPIERO po własnym uderzeniu. */}
        {revealed && position ? (
          <span
            aria-hidden="true"
            data-testid="podium-glow"
            className="podium-glow absolute inset-0 rounded-t-2xl"
            style={
              reducedMotion ? undefined : { animationDelay: `${impactMs}ms` }
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
            className={`${medalClass} relative object-contain`}
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

export function PodiumSection({
  tournamentId,
  scopeKey,
  classification,
  skeleton,
  completionToken,
  backgroundUrl,
}: PodiumSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ceremonyDone, setCeremonyDone] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const isComplete = Boolean(classification?.complete && completionToken);
  const entries = useMemo(
    () => (isComplete ? (classification?.entries ?? []) : []),
    [isComplete, classification]
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
    [entries, delayFor]
  );

  const impactsRef = useRef(impacts);

  useEffect(() => {
    impactsRef.current = impacts;
  }, [impacts]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReducedMotion(Boolean(query?.matches));
  }, []);

  /**
   * Ceremonia startuje dopiero, gdy podium wejdzie w pole widzenia —
   * nie w momencie otrzymania danych. Kibic wysoko na stronie
   * nie „przegapia” finału.
   */
  useEffect(() => {
    if (!isComplete || !completionToken) return;

    const node = sectionRef.current;
    if (!node) return;

    const storageKey = buildPodiumStorageKey({
      tournamentId,
      scopeKey,
      completionToken,
    });

    if (hasSeenReveal(storageKey)) {
      setRevealed(true);
      // Ceremonia już była: pełny stan końcowy i od razu działające dymki.
      setCeremonyDone(true);
      return;
    }

    const timers: number[] = [];

    function markSeen(key: string) {
      markRevealSeen(key);
      setCeremonyDone(true);
      // Przycisk celebracji słucha tego zdarzenia i przestaje zapraszać.
      window.dispatchEvent(new Event(CELEBRATION_SEEN_EVENT));
    }

    const observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return;

        observer.disconnect();
        setRevealed(true);

        if (reducedMotion) {
          markSeen(storageKey);
          return;
        }

        // "Obejrzane" zapisujemy DOPIERO po zakończeniu animacji —
        // zamknięcie strony w połowie pozwala zobaczyć ceremonię ponownie.
        timers.push(
          window.setTimeout(() => markSeen(storageKey), revealTotalMs)
        );

        /*
          Wibracja to WYŁĄCZNIE wzmocnienie lądowania medalisty. Każdy
          warunek bezpieczeństwa (brak API, ograniczony ruch, ukryta
          karta) kończy się ciszą, nigdy błędem.
        */
        for (const impact of impactsRef.current) {
          timers.push(
            window.setTimeout(() => {
              pulse(PODIUM_HAPTIC_MS[impact.position] ?? 0, {
                isLiveReveal: true,
                reducedMotion,
                documentVisible:
                  typeof document === "undefined" ||
                  document.visibilityState === "visible",
              });
            }, impact.atMs)
          );
        }
      },
      /*
        Sekcja bywa wyższa niż ekran, więc próg 25% jej powierzchni bywa
        nieosiągalny. Wystarczy, że kibic realnie dotarł do klasyfikacji:
        widoczny fragment przy dolnej krawędzi ekranu uruchamia ceremonię,
        ale nie kilka ekranów wcześniej.
      */
      { threshold: 0, rootMargin: "0px 0px -20% 0px" }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [
    isComplete,
    completionToken,
    tournamentId,
    scopeKey,
    revealTotalMs,
    reducedMotion,
  ]);

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
    (slot) => slot.position !== null && slot.position <= 3
  );
  const hasSharedTop = skeleton.some((slot) => slot.shared);
  const tailSlots = skeleton.filter(
    (slot) => slot.position !== null && slot.position > 3
  );

  const stepFor = (position: number) => byPosition.get(position) ?? null;
  const delayOf = (entry: ClassificationView["entries"][number] | null) =>
    entry ? (delayFor.get(entry.team.teamId) ?? 0) : 0;

  return (
    <section
      ref={sectionRef}
      // Cel przewijania dla przycisku celebracji — osobny dla każdej grupy.
      id={celebrationSectionId(scopeKey)}
      className="flush-card relative overflow-hidden rounded-none border border-white/10 shadow-[0_1.5rem_3rem_-2rem_rgba(15,23,42,0.55)] sm:rounded-3xl"
      aria-label="Klasyfikacja końcowa"
    >
      <div
        className="absolute inset-0 bg-slate-900 bg-cover bg-center"
        style={
          backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined
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
        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">
          Klasyfikacja końcowa
        </h3>

        {/*
          Podium: 2 z lewej, 1 centralnie i najwyżej, 3 z prawej.

          `w-full` na rzędzie jest istotne: bez niego rząd przyjmował
          szerokość max-content trzech stopni i — wyśrodkowany — wystawał
          poza scenę, przez co brązowy medal był przycinany na telefonie.
        */}
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
              interactive={interactive}
            />
          ) : null}
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
              {(sharedEntries.length > 0
                ? sharedEntries
                : [null, null]
              ).map((entry, index) => (
                <li
                  key={entry?.team.teamId ?? `shared-${index}`}
                  className="flex items-center gap-3 text-sm text-white"
                  style={{
                    opacity: revealed ? 1 : 0,
                    transform: revealed ? "translateX(0)" : "translateX(-1.25rem)",
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
              ))}
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
  );
}
