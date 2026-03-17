"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { Scorer, Team } from "@/types/tournament";
import { TopScorerTicker } from "@/components/top-scorer-ticker";

type TournamentHeaderProps = {
  title: string;
  scorers: Scorer[];
  teams: Team[];
  heroBannerImage?: string;
};

export function TournamentHeader({
  title,
  scorers,
  teams,
  heroBannerImage,
}: TournamentHeaderProps) {
  const scrollToResults = () => {
    const section = document.getElementById("results-section");

    if (!section) return;

    const offset = -20;
    const top = section.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top,
      behavior: "smooth",
    });
  };

  const heroImageSrc = heroBannerImage || "/images/unknown.jpeg";

  return (
    <header className="space-y-6">
      <div className="flex flex-col gap-4 flex-row items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm"
        >
          <span className="relative flex h-2.5 w-2.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-green-400"
              animate={{
                scale: [1, 1.6, 1],
                opacity: [0.8, 0, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />

            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>

          Live tournament
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center gap-4"
        >
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
        </motion.div>
      </div>

      <TopScorerTicker scorers={scorers} teams={teams} />

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.2 }}
        className="relative my-10 overflow-hidden -mr-3 -ml-3 border border-slate-200 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] md:m-0 md:rounded-[28px]"
      >
        <div className="relative aspect-[16/7] w-full">
          <Image
            src={heroImageSrc}
            alt={title}
            fill
            priority
            className="object-cover"
          />

          <div className="absolute inset-0 bg-black/20" />

          <div className="absolute inset-0 flex items-end justify-center pb-10">
            <motion.button
              onClick={scrollToResults}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-full hidden md:block bg-white px-8 py-4 text-lg font-semibold text-slate-900 shadow-xl transition hover:bg-slate-100"
            >
              Sprawdź wyniki
            </motion.button>
          </div>
        </div>
      </motion.div>
    </header>
  );
}