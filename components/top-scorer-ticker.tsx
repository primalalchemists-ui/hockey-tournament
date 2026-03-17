"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Scorer, Team } from "@/types/tournament";

type TopScorerTickerProps = {
  scorers: Scorer[];
  teams: Team[];
};

/**
 * Poprawna polska odmiana słowa "gol"
 */
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

export function TopScorerTicker({
  scorers,
  teams,
}: TopScorerTickerProps) {
  const topScorer = useMemo(() => {
    if (!scorers.length) return null;

    return [...scorers].sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.playerName.localeCompare(b.playerName);
    })[0];
  }, [scorers]);

  if (!topScorer) return null;

  const team = teams.find((t) => t.id === topScorer.teamId);

  const teamName =
    team?.shortName ||
    team?.name ||
    "Nieznana drużyna";

  const jersey =
    typeof topScorer.jerseyNumber === "number"
      ? `#${topScorer.jerseyNumber}`
      : "";

  const goalsLabel = goalsWord(topScorer.goals);

  const message = `👑 KRÓL STRZELCÓW • ${topScorer.playerName} ${jersey} • ${topScorer.goals} ${goalsLabel} • ${teamName} 🔥`;

  const repeated = Array.from({ length: 8 }, (_, i) => ({
    id: `${topScorer.id}-${i}`,
    text: message,
  }));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300/40 bg-slate-950 py-3 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.55)]">
      
      {/* gradient mask */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-slate-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-slate-950 to-transparent" />

      <motion.div
        className="flex w-max items-center gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 55, // wolniejszy pasek
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {[...repeated, ...repeated].map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex items-center gap-3 px-2 text-sm font-bold uppercase tracking-[0.08em] text-white sm:text-base"
          >
            <span>{item.text}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}