"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Scorer, Team } from "@/types/tournament";

type TopScorerTickerProps = {
  scorers: Scorer[];
  teams: Team[];
  tickerMessage?: string;
  showTopScorerTicker?: boolean;
};

function goalsWord(goals: number) {
  if (goals === 1) return "gol";

  const lastDigit = goals % 10;
  const lastTwoDigits = goals % 100;

  if (lastTwoDigits >= 12 && lastTwoDigits <= 14) {
    return "goli";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "gole";
  }

  return "goli";
}

function ensureMessageEnding(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const endsWithEmoji =
    /[\p{Extended_Pictographic}\u2600-\u27BF]$/u.test(trimmed);
  const endsWithPunctuation = /[.!?…]$/u.test(trimmed);

  if (endsWithEmoji || endsWithPunctuation) {
    return trimmed;
  }

  return `${trimmed} 🏒`;
}

export function TopScorerTicker({
  scorers,
  teams,
  tickerMessage,
  showTopScorerTicker = true,
}: TopScorerTickerProps) {
  const topScorer = useMemo(() => {
    if (!scorers.length || !showTopScorerTicker) return null;

    return [...scorers].sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.playerName.localeCompare(b.playerName);
    })[0];
  }, [scorers, showTopScorerTicker]);

  const scorerData = useMemo(() => {
    if (!topScorer) return null;

    const team = teams.find((t) => t.id === topScorer.teamId);

    return {
      playerName: topScorer.playerName,
      jersey:
        typeof topScorer.jerseyNumber === "number"
          ? `#${topScorer.jerseyNumber}`
          : "",
      goals: topScorer.goals,
      goalsLabel: goalsWord(topScorer.goals),
      teamName: team?.shortName || team?.name || "Nieznana drużyna",
    };
  }, [topScorer, teams]);

  const adminMessage = useMemo(() => {
    return ensureMessageEnding(tickerMessage ?? "");
  }, [tickerMessage]);

  const segments = useMemo(() => {
    const items: { type: "admin" | "scorer" }[] = [];

    if (adminMessage) items.push({ type: "admin" });
    if (scorerData) items.push({ type: "scorer" });

    return items;
  }, [adminMessage, scorerData]);

  if (!segments.length) return null;

  const repeated = Array.from({ length: 6 }, (_, i) => ({
    id: `ticker-${i}`,
  }));

  return (
    <div className="relative overflow-hidden -mt-4 md:-mt-6 md:mr-0 md:ml-0 -ml-3 -mr-3 border-amber-300/40 bg-slate-950 py-1 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.55)]">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 sm:w-16 bg-gradient-to-r from-slate-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 sm:w-16 bg-gradient-to-l from-slate-950 to-transparent" />

      <motion.div
        className="flex w-max items-center whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 85,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {[...repeated, ...repeated].map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex items-center px-2 text-sm font-bold uppercase tracking-[0.08em] text-white sm:text-base"
          >
            {segments.map((segment, i) => (
              <div key={i} className="flex items-center">
                {segment.type === "admin" && (
                  <span className="flex items-center gap-2">
                    <span className="inline-block -translate-y-[1px]">📢</span>
                    <span>{adminMessage}</span>
                  </span>
                )}

                {segment.type === "scorer" && scorerData && (
                  <span className="flex items-center gap-2">
                    <span className="inline-block -translate-y-[2px]">👑</span>
                    <span>
                      KRÓL STRZELCÓW • {scorerData.playerName}{" "}
                      {scorerData.jersey} • {scorerData.goals}{" "}
                      {scorerData.goalsLabel} • {scorerData.teamName} 🔥
                    </span>
                  </span>
                )}

                {i < segments.length - 1 && (
                  <span className="mx-8 text-white/70">•</span>
                )}
              </div>
            ))}

            <span className="mx-10 text-white/50">•</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}