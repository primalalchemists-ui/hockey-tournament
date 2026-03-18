"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Group, Scorer, Team } from "@/types/tournament";
import { TopScorerTicker } from "@/components/top-scorer-ticker";

type TournamentHeaderProps = {
  title: string;
  scorers: Scorer[];
  teams: Team[];
  groups: Group[];
  heroBannerImage?: string;
  tickerMessage?: string;
  showTopScorerTicker?: boolean;
  onHeroReady?: () => void;
};

function matchesWord(count: number) {
  if (count === 1) return "mecz";

  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 12 && lastTwoDigits <= 14) {
    return "meczów";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "mecze";
  }

  return "meczów";
}

export function TournamentHeader({
  title,
  scorers,
  teams,
  groups,
  heroBannerImage,
  tickerMessage,
  showTopScorerTicker,
  onHeroReady,
}: TournamentHeaderProps) {
  const [heroLoaded, setHeroLoaded] = useState(false);
  const notifiedRef = useRef(false);

  const scrollToResults = () => {
    const section = document.getElementById("results-section");

    if (!section) return;

    const offset = 0;
    const top = section.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top,
      behavior: "smooth",
    });
  };

  const heroImageSrc = heroBannerImage || "/images/unknown.jpeg";

  const totalScheduledMatches = groups.reduce((sum, group) => {
    const teamsCount = group.teams.length;
    const matchesInGroup = (teamsCount * (teamsCount - 1)) / 2;
    return sum + matchesInGroup;
  }, 0);

  const playedMatches = groups.reduce((sum, group) => {
    return sum + group.matches.length;
  }, 0);

  const remainingMatches = Math.max(0, totalScheduledMatches - playedMatches);
  const remainingMatchesLabel = matchesWord(remainingMatches);

  useEffect(() => {
    if (!heroLoaded || notifiedRef.current) return;
    notifiedRef.current = true;
    onHeroReady?.();
  }, [heroLoaded, onHeroReady]);

  return (
    <header className="space-y-6 -mb-10 md:mb-4">
      {heroLoaded ? (
        <TopScorerTicker
          scorers={scorers}
          teams={teams}
          tickerMessage={tickerMessage}
          showTopScorerTicker={showTopScorerTicker}
        />
      ) : null}

      <div className="flex flex-col gap-4 flex-row items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 md:px-4 md:py-2 text-xs font-semibold text-slate-600 shadow-sm"
        >
          <span className="relative flex h-2.5 w-2.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-red-400"
              animate={{
                scale: [1, 1.8, 1],
                opacity: [0.8, 0, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />

            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>

          Wyniki Live
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.35 }}
          className="rounded-full border border-white/20 bg-black/55 py-1 px-2 text-center text-xs font-bold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-md sm:px-5 sm:text-sm"
        >
          🏒 <span className="text-amber-400">{remainingMatches}</span> {remainingMatchesLabel}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center gap-4"
        >
          <motion.a
            href="https://www.instagram.com/festiwal_hokeja/"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ y: -2, scale: 1.06 }}
            className="cursor-pointer"
          >
            <Image
              src="/icons/instagram.svg"
              alt="Instagram"
              width={30}
              height={30}
            />
          </motion.a>

          <motion.a
            href="https://www.facebook.com/festiwalhokeja"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ y: -2, scale: 1.06 }}
            className="cursor-pointer"
          >
            <Image
              src="/icons/facebook.svg"
              alt="Facebook"
              width={30}
              height={30}
            />
          </motion.a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.2 }}
        className="relative mb-10 sm:my-10 overflow-hidden -mr-3 -ml-3 border border-slate-200 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] md:m-0"
      >
        <div className="relative aspect-[16/7] w-full">
          <Image
            src={heroImageSrc}
            alt={title}
            fill
            priority
            className="object-cover"
            onLoad={() => setHeroLoaded(true)}
          />

          <div className="absolute inset-0 bg-black/20" />

          <div className="absolute inset-0 flex items-end justify-center pb-12">
            <motion.button
              onClick={scrollToResults}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-full hidden md:block bg-white px-8 py-2 text-lg font-semibold text-slate-900 shadow-xl transition hover:bg-slate-100"
            >
              Sprawdź wyniki
            </motion.button>
          </div>
        </div>
      </motion.div>
    </header>
  );
}