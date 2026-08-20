"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { FooterAnimation } from "@/components/public/footer-animation";
import { describeCamp, type CampPresentation } from "@/lib/public/camp";
import { describeCountdownPin } from "@/lib/public/color";
import { useEffect, useRef, useState } from "react";

type CampBannerProps = {
  date: string;
  signupLink?: string;
  /** Nagłówek sekcji; puste = historyczne „Najbliższy camp". */
  campTitle?: string;
  /** Czy zapisy są otwarte — decyduje o aktywności przycisku. */
  registrationEnabled?: boolean;
  bannerImage?: string;
  leftPosterImage?: string;
  rightPosterImage?: string;
  /** Sekcja poprzednich turniejów; renderowana przed „Powered by". */
  previousTournaments?: React.ReactNode;
  /** Kolor pinezek odliczania; puste = domyślny czerwony. */
  countdownPinColor?: string;
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
  campTitle,
  registrationEnabled,
  bannerImage,
  leftPosterImage,
  rightPosterImage,
  previousTournaments,
  countdownPinColor,
}: CampBannerProps) {
  /*
    Napis i stan zapisów pochodzą z ustawień turnieju — komponent niczego
    już nie zakłada. Patrz lib/public/camp.ts.
  */
  const camp = describeCamp({
    title: campTitle,
    registrationEnabled,
    registrationUrl: signupLink,
  });

  /*
    Jeden kolor bazowy → cztery zmienne CSS ustawione RAZ na sekcji.
    Pinezki (jest ich osiem) nie noszą własnych stylów inline.
  */
  const pin = describeCountdownPin(countdownPinColor);

  const pinStyle = {
    ["--pin-base" as string]: pin.base,
    ["--pin-highlight" as string]: pin.highlight,
    ["--pin-border" as string]: pin.border,
    ["--pin-shadow-soft" as string]: `${pin.shadow}59`,
  } as React.CSSProperties;
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

  /*
    LICZNIK A HYDRACJA.

    Render serwerowy i hydracja dzieją się w odstępie ułamka sekundy, więc
    `calculateTimeLeft()` w inicjalizatorze stanu daje po obu stronach inną
    liczbę sekund (np. 38 vs 39) — to była przyczyna błędu hydracji.

    Rozwiązanie jest celowo minimalne: same cyfry mają
    `suppressHydrationWarning`, bo ich rozbieżność wynika z upływu czasu
    i jest oczekiwana. Serwerowa wartość pokazuje się bez migotania,
    a pierwszy tik interwału (≤ 1 s) zrównuje ją z rzeczywistością.
  */
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

  /*
    SEKCJA JEST PO PROSTU WIDOCZNA.

    Wcześniej wjeżdżała na `whileInView` z `opacity: 0`. Wyglądało to
    nieźle przy powolnym przewijaniu, ale rozwalało skoki: przycisk
    „Zobacz klasyfikację" przewijał do sekcji, która była jeszcze
    przezroczysta, a wysokość strony zmieniała się w trakcie płynnego
    przewijania — na telefonie kończyło się to lądowaniem na pustym
    ekranie. Skok do konkretnego miejsca musi zastać gotową stronę.
  */
  return (
    <section
      style={pinStyle}
      data-testid="camp-section"
      className="mb-12"
    >
      {/*
        `overflow-x: clip` zamiast `overflow: hidden`.

        Powod jest jeden: `hidden` tworzy kontener przewijania, a wtedy
        `position: sticky` w sygnaturze na dole strony przestaje sie czepiac
        ekranu. `clip` przycina dokladnie tak samo, ale kontenera nie tworzy.
      */}
      <div className="overflow-x-clip pb-10">
        <div className="flex flex-col gap-6 lg:gap-8">
          <div className="relative aspect-[16/8] w-full overflow-hidden border-amber-300/40 shadow-[0_26px_80px_-30px_rgba(15,23,42,0.4)] sm:aspect-[16/7] md:border lg:aspect-[16/5.2]">
            <Image
              src={bannerSrc}
              alt="Najbliższy obóz"
              fill
              priority
              sizes="(min-width: 1400px) 1400px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/18" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/22 via-transparent to-black/12" />
          </div>

          <div className="flex flex-col gap-4 lg:hidden">
            <PosterCardMobile src={leftPosterSrc} alt="Plakat lewy" />
            <PosterCardMobile src={rightPosterSrc} alt="Plakat prawy" />
          </div>

          <div className="hidden lg:grid lg:grid-cols-[300px_minmax(0,1fr)_300px] lg:items-start lg:gap-5 xl:grid-cols-[320px_minmax(0,1fr)_320px] xl:gap-6">
            <div className="ml-8">
              <PosterCardDesktop
                src={leftPosterSrc}
                alt="Plakat lewy"
                rotation="-rotate-6"
              />
            </div>

            <CenterContent
              timeLeft={timeLeft}
              camp={camp}
              scrollToTop={scrollToTop}
              desktop
            />

            <div className="mr-8">
              <PosterCardDesktop
                src={rightPosterSrc}
                alt="Plakat prawy"
                rotation="rotate-6"
              />
            </div>
          </div>

          <div className="lg:hidden">
            <CenterContent
              timeLeft={timeLeft}
              camp={camp}
              scrollToTop={scrollToTop}
            />
          </div>

          {/*
            KOLEJNOŚĆ DOŁU STRONY.

            Sygnatura „Powered by" siedzi zaraz pod zapisami, a poprzednie
            turnieje zamykają stronę — są najmniej istotne, więc idą na
            sam koniec. Sekcja historii przychodzi z serwera; camp nic
            o niej nie wie poza tym, gdzie ma ją postawić.
          */}
          <PoweredBySection />

          {previousTournaments}
        </div>
      </div>
    </section>
  );
}

function CenterContent({
  timeLeft,
  camp,
  scrollToTop,
  desktop = false,
}: {
  timeLeft: TimeLeft;
  camp: CampPresentation;
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
      <div className="relative mx-auto w-fit">
        <h2
          data-testid="camp-title"
          className="text-[1.6rem] font-black uppercase tracking-[0.08em] text-slate-950 sm:text-[2rem] lg:text-[2.45rem] xl:text-[2.8rem]"
        >
          {camp.title}
        </h2>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-full mt-1 w-full scale-y-[-1] select-none overflow-hidden opacity-20 blur-[1.5px]"
        >
          <div className="bg-clip-text text-[1.6rem] font-black uppercase tracking-[0.08em] text-transparent sm:text-[2rem] lg:text-[2.45rem] xl:text-[2.8rem]">
            {camp.title}
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-nowrap items-start justify-center gap-2 sm:gap-3 lg:gap-2.5 xl:gap-3">
        <FlipCountdownCard value={timeLeft.days} label="dni" />
        <FlipCountdownCard value={timeLeft.hours} label="godz" />
        <FlipCountdownCard value={timeLeft.minutes} label="min" />
        <StaticCountdownCard value={timeLeft.seconds} label="sek" />
      </div>

      <div className="mt-7 flex flex-row items-center justify-center gap-3">
        {/*
          Przy zamkniętych zapisach przycisk NIE znika — zostaje częścią
          kompozycji, ale przestaje być linkiem. Element <span> nie ma
          href-a, więc nie da się go kliknąć ani osiągnąć z klawiatury.
        */}
        {camp.canRegister ? (
          <a
            data-testid="camp-signup"
            data-enabled="true"
            href={camp.registrationUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary min-w-[150px] sm:min-w-[170px]"
          >
            Zapisz się
          </a>
        ) : (
          <span
            data-testid="camp-signup"
            data-enabled="false"
            aria-disabled="true"
            className="btn btn-primary camp-signup-closed min-w-[150px] sm:min-w-[170px]"
          >
            Zapisz się
          </span>
        )}

        <button
          type="button"
          onClick={scrollToTop}
          className="btn btn-quiet min-w-[150px] sm:min-w-[170px]"
        >
          Wróć do góry
        </button>
      </div>
    </div>
  );
}

/**
 * SYGNATURA STRONY.
 *
 * Sekcja stoi dokladnie tam, gdzie stala: na samym dole, zaraz za
 * poprzednimi turniejami. Zmienil sie wylacznie sposob, w jaki sie pojawia —
 * napis i logo powstaja teraz z energii zderzenia zawodnikow, sterowanej
 * przewijaniem.
 */
function PoweredBySection() {
  return <FooterAnimation />;
}

function PosterCardMobile({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-full">
      <div className="relative mx-auto aspect-[4/6] w-full max-w-[420px] overflow-hidden rounded-[24px] border border-slate-200 bg-transparent shadow-[0_22px_50px_-22px_rgba(15,23,42,0.45)]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 640px) 420px, 100vw"
          className="object-contain"
        />
      </div>
    </div>
  );
}

function PosterCardDesktop({
  src,
  alt,
  rotation,
}: {
  src: string;
  alt: string;
  rotation: string;
}) {
  return (
    <div className={`mx-auto w-full ${rotation} px-3 md:px-0`}>
      <div className="relative aspect-[4/6] w-full overflow-hidden rounded-[24px] border border-slate-200 bg-transparent shadow-[0_22px_50px_-22px_rgba(15,23,42,0.45)]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1280px) 320px, 300px"
          className="object-contain"
        />
      </div>
    </div>
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
      <span
        data-testid="countdown-pin"
        className="countdown-pin absolute left-2 top-2 z-20 h-3 w-3 rounded-full"
      />
      <span
        data-testid="countdown-pin"
        className="countdown-pin absolute right-2 top-2 z-20 h-3 w-3 rounded-full"
      />

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
                suppressHydrationWarning
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
      <span
        data-testid="countdown-pin"
        className="countdown-pin absolute left-2 top-2 z-20 h-3 w-3 rounded-full"
      />
      <span
        data-testid="countdown-pin"
        className="countdown-pin absolute right-2 top-2 z-20 h-3 w-3 rounded-full"
      />

      <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-[#fffdf8] px-2 pb-3 pt-5 shadow-[0_14px_34px_-18px_rgba(15,23,42,0.35)]">
        <div className="absolute left-0 right-0 top-[46%] z-10 h-px bg-slate-200" />

        <div className="relative flex min-h-[92px] flex-col items-center justify-center sm:min-h-[96px] lg:min-h-[100px]">
          <div
            suppressHydrationWarning
            className="flex h-[44px] w-full items-center justify-center text-[2rem] font-black leading-none text-slate-950 sm:h-[48px] sm:text-[2.2rem] lg:text-[2.35rem]"
          >
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