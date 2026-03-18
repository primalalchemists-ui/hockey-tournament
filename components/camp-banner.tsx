"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type CampBannerProps = {
  date: string;
  signupLink?: string;
  bannerImage?: string;
  leftPosterImage?: string;
  rightPosterImage?: string;
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function CampBanner({
  date,
  signupLink = "#",
  bannerImage,
  leftPosterImage,
  rightPosterImage,
}: CampBannerProps) {
  const calculateTimeLeft = (): TimeLeft => {
    const difference = new Date(date).getTime() - new Date().getTime();

    if (!date || Number.isNaN(new Date(date).getTime()) || difference <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / (1000 * 60)) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [date]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const bannerSrc = bannerImage || "/images/oboz.jpg";
  const leftPosterSrc = leftPosterImage || "/images/lato.jpg";
  const rightPosterSrc = rightPosterImage || "/images/wiosna.jpg";

  return (
    <motion.section
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7 }}
      className="mb-12"
    >
      <div className="overflow-hidden pb-10">
        <div className="flex flex-col gap-6 lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            <div className="relative aspect-[16/8] w-full overflow-hidden  md:border border-amber-300/40 shadow-[0_26px_80px_-30px_rgba(15,23,42,0.4)] sm:aspect-[16/7] lg:aspect-[16/5.2]">
              <Image
                src={bannerSrc}
                alt="Najbliższy obóz"
                fill
                priority
                className="object-cover"
              />
              <div className="absolute inset-0 bg-black/18" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/22 via-transparent to-black/12" />
            </div>
          </motion.div>

          <div className="flex flex-col gap-4 lg:hidden">
            <PosterCardMobile
              src={leftPosterSrc}
              alt="Plakat lewy"
              delay={0.12}
            />
            <PosterCardMobile
              src={rightPosterSrc}
              alt="Plakat prawy"
              delay={0.18}
            />
          </div>

          <div className="hidden lg:grid lg:grid-cols-[300px_minmax(0,1fr)_300px] lg:items-start lg:gap-5 xl:grid-cols-[320px_minmax(0,1fr)_320px] xl:gap-6">
            <div className="ml-8">
              <PosterCardDesktop
                src={leftPosterSrc}
                alt="Plakat lewy"
                rotation="-rotate-6"
                delay={0.12}
              />
            </div>

            <CenterContent
              timeLeft={timeLeft}
              signupLink={signupLink}
              scrollToTop={scrollToTop}
              desktop
            />

            <div className="mr-8">
              <PosterCardDesktop
                src={rightPosterSrc}
                alt="Plakat prawy"
                rotation="rotate-6"
                delay={0.18}
              />
            </div>
          </div>

          <div className="lg:hidden">
            <CenterContent
              timeLeft={timeLeft}
              signupLink={signupLink}
              scrollToTop={scrollToTop}
            />
          </div>

          <PoweredBySection />
        </div>
      </div>
    </motion.section>
  );
}

function CenterContent({
  timeLeft,
  signupLink,
  scrollToTop,
  desktop = false,
}: {
  timeLeft: TimeLeft;
  signupLink: string;
  scrollToTop: () => void;
  desktop?: boolean;
}) {
  return (
    <div
      className={`text-center ${
        desktop
          ? "px-0 pt-10 pb-2"
          : "px-1 pt-1 pb-2 sm:px-2"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="relative mx-auto w-fit"
      >
        <h2 className="text-[1.6rem] font-black uppercase tracking-[0.08em] text-slate-950 sm:text-[2rem] lg:text-[2.45rem] xl:text-[2.8rem]">
          Najbliższy camp
        </h2>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-full mt-1 w-full scale-y-[-1] select-none overflow-hidden opacity-20 blur-[1.5px]"
        >
          <div className="bg-clip-text text-[1.6rem] font-black uppercase tracking-[0.08em] text-transparent sm:text-[2rem] lg:text-[2.45rem] xl:text-[2.8rem]">
            Najbliższy camp
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.22 }}
        className="mt-7 flex flex-nowrap items-start justify-center gap-2 sm:gap-3 lg:gap-2.5 xl:gap-3"
      >
        <FlipCountdownCard value={timeLeft.days} label="dni" />
        <FlipCountdownCard value={timeLeft.hours} label="godz" />
        <FlipCountdownCard value={timeLeft.minutes} label="min" />
        <StaticCountdownCard value={timeLeft.seconds} label="sek" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-7 flex flex-row items-center justify-center gap-3"
      >
        <motion.a
          href={signupLink || "#"}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ y: -2, scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex min-w-[150px] items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgba(15,23,42,0.55)] transition hover:bg-slate-800 sm:min-w-[170px] sm:px-7"
        >
          Zapisz się
        </motion.a>

        <motion.button
          type="button"
          onClick={scrollToTop}
          whileHover={{ y: -2, scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex min-w-[150px] items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 sm:min-w-[170px] sm:px-7"
        >
          Wróć do góry
        </motion.button>
      </motion.div>
    </div>
  );
}

function PoweredBySection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay: 0.2 }}
      className="pt-4"
    >
      <div className="flex flex-col items-center justify-center text-center">
        <ReflectiveLabel text="Powered by" />

        <motion.div
          whileHover={{ y: -2, scale: 1.02 }}
          transition={{ duration: 0.2 }}
          className="relative mt-4"
        >
          <div className="relative h-[130px] w-[190px] sm:h-[155px] sm:w-[225px] lg:h-[185px] lg:w-[270px] xl:h-[210px] xl:w-[300px]">
            <Image
              src="/icons/festiwal-logo.png"
              alt="Festiwal Hokeja"
              fill
              className="object-contain"
            />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 overflow-hidden opacity-20 blur-[2px]"
          >
            <div className="relative h-[85px] w-[140px] scale-y-[-1] sm:h-[100px] sm:w-[165px] lg:h-[120px] lg:w-[195px] xl:h-[132px] xl:w-[215px]">
              <Image
                src="/icons/festiwal-logo.png"
                alt=""
                fill
                className="object-contain"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
function ReflectiveLabel({ text }: { text: string }) {
  return (
    <div className="relative w-fit">
      <div className="text-lg font-semibold tracking-[0.08em] text-slate-700 sm:text-xl">
        {text}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-full mt-1 w-full scale-y-[-1] select-none overflow-hidden opacity-20 blur-[1.6px]"
      >
        <div className="text-lg font-semibold tracking-[0.08em] text-slate-700 sm:text-xl">
          {text}
        </div>
      </div>
    </div>
  );
}
function PosterCardMobile({
  src,
  alt,
  delay,
}: {
  src: string;
  alt: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay }}
      className="w-full"
    >
      <div className="relative mx-auto aspect-[4/6] w-full max-w-[420px] overflow-hidden rounded-[24px] border border-slate-200 bg-transparent shadow-[0_22px_50px_-22px_rgba(15,23,42,0.45)]">
        <Image src={src} alt={alt} fill className="object-contain" />
      </div>
    </motion.div>
  );
}

function PosterCardDesktop({
  src,
  alt,
  rotation,
  delay,
}: {
  src: string;
  alt: string;
  rotation: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay }}
      className={`mx-auto w-full ${rotation} px-3 md:px-0`}
    >
      <div className="relative aspect-[4/6] w-full overflow-hidden rounded-[24px] border border-slate-200 bg-transparent shadow-[0_22px_50px_-22px_rgba(15,23,42,0.45)]">
        <Image src={src} alt={alt} fill className="object-contain" />
      </div>
    </motion.div>
  );
}

function FlipCountdownCard({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const displayValue = String(value ?? 0).padStart(2, "0");
  const prevValue = usePrevious(displayValue);
  const hasChanged = prevValue !== undefined && prevValue !== displayValue;

  return (
    <div className="relative w-[72px] sm:w-[82px] lg:w-[88px] xl:w-[94px]">
      <span className="absolute left-2 top-2 z-20 h-3 w-3 rounded-full border border-red-700 bg-red-500 shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />
      <span className="absolute right-2 top-2 z-20 h-3 w-3 rounded-full border border-red-700 bg-red-500 shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />

      <div
        className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-[#fffdf8] px-2 pb-3 pt-5 shadow-[0_14px_34px_-18px_rgba(15,23,42,0.35)]"
        style={{ perspective: 900 }}
      >
        <div className="absolute left-0 right-0 top-[46%] z-10 h-px bg-slate-200" />

        <div className="relative flex min-h-[92px] flex-col items-center justify-center sm:min-h-[96px] lg:min-h-[100px]">
          <div className="relative h-[44px] w-full sm:h-[48px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={displayValue}
                initial={hasChanged ? { rotateX: -90, opacity: 0 } : false}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={hasChanged ? { rotateX: 90, opacity: 0 } : undefined}
                transition={{ duration: 0.45, ease: "easeInOut" }}
                style={{ transformOrigin: "center center" }}
                className="absolute inset-0 flex items-center justify-center text-[2rem] font-black leading-none text-slate-950 sm:text-[2.2rem] lg:text-[2.35rem]"
              >
                {displayValue}
              </motion.div>
            </AnimatePresence>
          </div>

          <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function StaticCountdownCard({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const displayValue = String(value ?? 0).padStart(2, "0");

  return (
    <div className="relative w-[72px] sm:w-[82px] lg:w-[88px] xl:w-[94px]">
      <span className="absolute left-2 top-2 z-20 h-3 w-3 rounded-full border border-red-700 bg-red-500 shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />
      <span className="absolute right-2 top-2 z-20 h-3 w-3 rounded-full border border-red-700 bg-red-500 shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />

      <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-[#fffdf8] px-2 pb-3 pt-5 shadow-[0_14px_34px_-18px_rgba(15,23,42,0.35)]">
        <div className="absolute left-0 right-0 top-[46%] z-10 h-px bg-slate-200" />

        <div className="relative flex min-h-[92px] flex-col items-center justify-center sm:min-h-[96px] lg:min-h-[100px]">
          <div className="flex h-[44px] w-full items-center justify-center text-[2rem] font-black leading-none text-slate-950 sm:h-[48px] sm:text-[2.2rem] lg:text-[2.35rem]">
            {displayValue}
          </div>

          <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}