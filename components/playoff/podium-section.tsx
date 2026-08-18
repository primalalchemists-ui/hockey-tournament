"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  BracketTeamView,
  ClassificationView,
} from "@/lib/data/postgres/playoff-engine";
import type { ClassificationSlot } from "@/lib/playoff/classification";
import {
  REVEAL_DURATION_MS,
  buildPodiumStorageKey,
  buildRevealOrder,
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

function TeamLogo({
  team,
  size,
}: {
  team: BracketTeamView | null;
  size: "winner" | "lg" | "sm";
}) {
  // Hierarchia medalowa zaczyna sie juz na rozmiarze logo.
  const dimension =
    size === "winner"
      ? "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"
      : size === "lg"
        ? "h-12 w-12 sm:h-14 sm:w-14"
        : "h-9 w-9";

  if (team?.logoUrl) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
        className={`${dimension} rounded-2xl border border-white/20 bg-white/10 object-contain p-0.5`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${dimension} flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] text-lg font-semibold text-white/30`}
    >
      {team ? (team.logoText?.slice(0, 3) ?? team.name.slice(0, 3)) : "?"}
    </span>
  );
}

function Step({
  entry,
  label,
  heightClass,
  revealed,
  delayMs,
  isWinner,
  reducedMotion,
}: {
  entry: ClassificationView["entries"][number] | null;
  label: string;
  heightClass: string;
  revealed: boolean;
  delayMs: number;
  isWinner: boolean;
  reducedMotion: boolean;
}) {
  const medal = entry?.position ? MEDALS[entry.position] : null;

  return (
    <div className="flex w-full min-w-0 max-w-[8.5rem] flex-col items-center gap-2.5 sm:max-w-[9.5rem]">
      <div
        className="flex flex-col items-center gap-2.5"
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "translateX(0)" : "translateX(-1.5rem)",
          transition: reducedMotion
            ? "opacity 160ms ease-out"
            : `opacity ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, transform ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms`,
        }}
      >
        <TeamLogo team={entry?.team ?? null} size={isWinner ? "winner" : "lg"} />

        <p
          className={[
            "line-clamp-2 w-full break-words text-center leading-tight text-white",
            isWinner
              ? "text-sm font-bold sm:text-[15px]"
              : "text-[13px] font-semibold",
          ].join(" ")}
        >
          {entry ? entry.team.name : " "}
        </p>
      </div>

      <div
        className={[
          "relative flex w-full items-start justify-center rounded-t-2xl border border-b-0 bg-gradient-to-b pt-3 transition-shadow duration-700",
          heightClass,
          isWinner && revealed
            ? "border-amber-200/40 from-white/[0.18] to-white/[0.06] shadow-[0_0_2rem_-0.35rem_rgba(255,214,124,0.55)]"
            : "border-white/15 from-white/[0.11] to-white/[0.04]",
        ].join(" ")}
      >
        {/* Swietlny grzbiet stopnia — glebia bez sztuczek 3D. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-0 h-px bg-white/25"
        />

        {medal && entry ? (
          <img
            src={medal}
            alt={`${entry.position}. miejsce`}
            className={
              isWinner
                ? "h-9 w-9 object-contain sm:h-11 sm:w-11"
                : "h-8 w-8 object-contain sm:h-9 sm:w-9"
            }
          />
        ) : (
          <span className="stat-num text-lg font-bold text-white/45">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

function TailRow({
  label,
  entry,
  revealed,
  delayMs,
  reducedMotion,
}: {
  label: string;
  entry: ClassificationView["entries"][number] | null;
  revealed: boolean;
  delayMs: number;
  reducedMotion: boolean;
}) {
  return (
    <li
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2"
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateX(0)" : "translateX(-1.25rem)",
        transition: reducedMotion
          ? "opacity 160ms ease-out"
          : `opacity ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, transform ${REVEAL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms`,
      }}
    >
      <span className="stat-num w-8 shrink-0 text-center text-sm font-bold text-white/50">
        {label}.
      </span>
      <TeamLogo team={entry?.team ?? null} size="sm" />
      <span
        className={[
          "min-w-0 flex-1 truncate text-sm",
          entry ? "font-medium text-white" : "font-semibold text-white/30",
        ].join(" ")}
      >
        {entry ? entry.team.name : "?"}
      </span>
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
      return;
    }

    let timer: number | undefined;

    const observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return;

        observer.disconnect();
        setRevealed(true);

        if (reducedMotion) {
          markRevealSeen(storageKey);
          return;
        }

        // "Obejrzane" zapisujemy DOPIERO po zakończeniu animacji —
        // zamknięcie strony w połowie pozwala zobaczyć ceremonię ponownie.
        timer = window.setTimeout(
          () => markRevealSeen(storageKey),
          getRevealTotalMs(revealOrder)
        );
      },
      { threshold: 0.25 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [
    isComplete,
    completionToken,
    tournamentId,
    scopeKey,
    revealOrder,
    reducedMotion,
  ]);

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

        {/* Podium: 2 z lewej, 1 centralnie i najwyżej, 3 z prawej. */}
        <div className="mt-6 flex items-end justify-center gap-2.5 sm:gap-5">
          {podiumSlots.some((slot) => slot.position === 2) ? (
            <Step
              entry={stepFor(2)}
              label="2"
              heightClass="h-14 sm:h-16"
              revealed={revealed}
              delayMs={delayOf(stepFor(2))}
              isWinner={false}
              reducedMotion={reducedMotion}
            />
          ) : null}

          <Step
            entry={stepFor(1)}
            label="1"
            heightClass="h-20 sm:h-24"
            revealed={revealed}
            delayMs={delayOf(stepFor(1))}
            isWinner
            reducedMotion={reducedMotion}
          />

          {podiumSlots.some((slot) => slot.position === 3) ? (
            <Step
              entry={stepFor(3)}
              label="3"
              heightClass="h-10 sm:h-12"
              revealed={revealed}
              delayMs={delayOf(stepFor(3))}
              isWinner={false}
              reducedMotion={reducedMotion}
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
                  <TeamLogo team={entry?.team ?? null} size="sm" />
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

        {/* Miejsca 4+ — liczba slotów pochodzi ze szkieletu, nie z hardkodu. */}
        {tailSlots.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {tailSlots.map((slot) => {
              const entry = stepFor(slot.position!);

              return (
                <TailRow
                  key={slot.position}
                  label={slot.label}
                  entry={entry}
                  revealed={revealed}
                  delayMs={delayOf(entry)}
                  reducedMotion={reducedMotion}
                />
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
