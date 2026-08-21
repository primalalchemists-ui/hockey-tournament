"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * SYGNATURA STRONY — „Powered by".
 *
 * GEOMETRIA SEKCJI JEST NIETYKALNA.
 *
 * Ta sekcja miała dobre wymiary, zanim ktokolwiek pomyślał o animacji:
 * `pt-4`, wyśrodkowana kolumna, napis z odbiciem, logo `130 → 210 px`
 * z `mt-4` i lustrzanym odbiciem w tafli. Wszystko to zostało przywrócone
 * co do klasy — sekcja NIE ma własnej wysokości, `min-height`, `sticky`
 * ani ścieżki przewijania. Jej wysokość wynika wyłącznie z treści,
 * dokładnie jak przed animacją.
 *
 * Animacja jest WARSTWĄ: `absolute inset-0` nad tą sekcją. Zawodnicy,
 * krążek i wybuch nie istnieją w przepływie dokumentu, więc nie mogą
 * urosnąć strony ani o piksel.
 *
 * JEDNORAZOWO. Obserwator odpala scenę, gdy sekcja jest realnie widoczna,
 * i rozłącza się. Nie ma scrubowania, nie ma odtwarzania wstecz, nie ma
 * powtórek przy przewijaniu w tę i z powrotem.
 *
 * STAN KOŃCOWY to dokładnie stara sekcja: napis „Powered by" z odbiciem
 * i logo z odbiciem. Znikają wyłącznie rzeczy tymczasowe — zawodnicy,
 * krążek i energia starcia.
 */

/* ==========================================================================
 * POKRĘTŁA
 * ======================================================================== */

/** CZAS — milisekundy od chwili odpalenia. Kolejność jest tu święta. */
const TIMING = {
  /*
    RYTM: NAJPIERW KRĄŻEK, POTEM UDERZENIE.

    Krążek startuje jako pierwszy i przez pierwsze cztery dziesiąte sekundy
    jest na scenie sam — to on otwiera scenę. Zawodnicy ruszają z krawędzi
    dopiero wtedy i dojeżdżają na jego lądowanie.

    Tempo jest CELOWO spokojniejsze niż wcześniej: przy krótszych czasach
    ktoś, kto widzi to pierwszy raz, nie zdążył zarejestrować, co się stało.
  */

  /** Lot krążka: z dużej wysokości, ale czytelny. Startuje natychmiast. */
  puckFall: 1150,
  puckDelay: 0,

  /** Zawodnicy ruszają, gdy krążek jest już wyraźnie w kadrze. */
  playersDelay: 420,
  /**
   * Jak długo jadą z krawędzi do środka. Mniej = szybciej.
   *
   * Podniesione z 850 ms razem ze zmianą startu: sylwetka wyjeżdża teraz
   * zza krawędzi, więc pokonuje o ~100 px dłuższą drogę. Bez tej korekty
   * ruch byłby szybszy niż wcześniej, mimo niezmienionego czasu.
   */
  enter: 980,

  /**
   * WYBUCH.
   *
   * Równy `playersDelay + enter` i to jest CELOWE: energia rozbłyska w tej
   * samej klatce, w której kije się stykają. Każda większa wartość daje
   * pauzę — zawodnicy stoją nieruchomo i czekają na wybuch.
   *
   * Krążek ląduje ODROBINĘ wcześniej (`puckDelay + puckFall` < `impactAt`),
   * bo ma być na miejscu, zanim zawodnicy się o niego zetną — a nie
   * dolatywać do gotowego wybuchu.
   */
  impactAt: 1400,
  burst: 460,
  vanish: 260,

  /** Napis powstaje z energii. */
  textAt: 1600,
  letterStep: 55,
  letter: 380,
  /** Odbicie napisu wchodzi RAZEM z literami, nie przed nimi. */
  echoAt: 1850,
  echo: 400,
  /** Logo wyłania się z tego samego środka. */
  logoAt: 2350,
  logo: 800,
  /** Krótkie naładowanie energią. */
  shakeAt: 3000,
  shake: 400,
} as const;

/** UKŁAD WARSTWY ANIMACJI. Nic z tego nie dotyka geometrii sekcji. */
const LAYOUT = {
  /** Wspólne opacity zawodników i krążka. */
  playerOpacity: 0.9,
  /** Wysokość sylwetki — obie strony dostają tę samą. */
  playerSize: "clamp(6rem, 24vw, 9rem)",
  /**
   * Ile PONAD krawędź sceny odsunięta jest sylwetka na starcie.
   *
   * Sam punkt startu liczy się z szerokości sylwetki, nie z procenta
   * szerokości sekcji — inaczej „50%" stawiało ŚRODEK grafiki na krawędzi
   * i na desktopie widać było przyciętą połowę zawodnika, zanim ruszył.
   *
   * Na OBU szerokościach sylwetka startuje w całości za krawędzią sceny
   * i dopiero z niej wyjeżdża. Te wartości odsuwają ją dodatkowo —
   * większa = dalej od środka, czyli dłuższy rozbieg poza kadrem.
   */
  startGapMobile: "1rem",
  startGapDesktop: "1rem",
  /**
   * Gdzie zatrzymują się kije — jak głęboko zawodnicy wjeżdżają na siebie.
   *
   * Mniejsza liczba = mocniejsze zwarcie. Desktop dostaje mniej, bo przy tej
   * samej wartości procentowej szeroki ekran zostawiał między sylwetkami
   * kilkadziesiąt pikseli luzu.
   */
  meetMobile: "6%",
  meetDesktop: "3%",
  /** Rozmiar krążka. */
  puckSize: "clamp(1.1rem, 4vw, 1.6rem)",
  /**
   * Z jak wysoka spada.
   *
   * Krążek NIE siedzi w przyciętej warstwie — leci nad sekcją, przez pustą
   * przestrzeń pod odliczaniem, więc może startować wysoko.
   */
  puckFrom: "-24rem",
  /** Ile krążek zatrzymuje się NAD głowami. Stąd oddech w chwili starcia. */
  puckClearance: "1rem",
  /** Wysokość przecięcia kijów nad linią lodu. */
  collision: "2rem",
  /** Średnica rdzenia wybuchu — zwarta, nie zasłania sekcji. */
  burstSize: "clamp(7rem, 28vw, 10rem)",
} as const;

/**
 * Wyrównanie skali sylwetek.
 *
 * Assety mają różne proporcje kadru, więc przy tej samej wysokości pudełka
 * jeden zawodnik wychodził większy. Współczynnik zrównuje wysokość samych
 * POSTACI, nie wysokość plików.
 */
/*
  Prawy zawodnik jest odniesieniem (1), lewy dostaje korektę.

  Same pomiary (masa alfy, wysokość kadru) dawały niemal równe wartości,
  ale lewa sylwetka jest w głębszym wykroku — przy tej samej wysokości
  pudełka jej głowa i tors zajmują mniej i czyta się jako mniejsza. Stąd
  podbicie ponad to, co wychodzi z liczb.
*/
const PLAYER_SCALE = { left: 1.08, right: 1 } as const;
const PLAYER_ASPECT = { left: 1.38, right: 1.295 } as const;
const PLAYER_SRC = {
  left: "/images/animation/left_player--1.webp",
  right: "/images/animation/right_player--1.webp",
} as const;

/** Iskry o stałych kątach — osiem sztuk, bez generatora. */
const SPARKS = [-22, 18, 62, 118, 162, 205, 248, 305] as const;

/** Kłęby dymu: przesunięcie od rdzenia, rozmiar i opóźnienie. */
const SMOKE = [
  { x: 0, y: -6, size: 1, delay: 0 },
  { x: -42, y: -22, size: 0.7, delay: 80 },
  { x: 40, y: -16, size: 0.76, delay: 55 },
  { x: -22, y: 16, size: 0.58, delay: 130 },
  { x: 26, y: 20, size: 0.54, delay: 100 },
] as const;

const POWERED_BY = "Powered by";

/* ==========================================================================
 * SEKCJA
 * ======================================================================== */

export function FooterAnimation() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [played, setPlayed] = useState(false);

  /*
    JEDEN STRZAŁ, I TO DOPIERO GDY WIDAĆ.

    Próg 0,5 znaczy: połowa sekcji musi być w kadrze. Przy niższym progu
    animacja potrafiła przelecieć, zanim kibic w ogóle na nią spojrzał.
    Obserwator rozłącza się przy pierwszym trafieniu, a flaga nigdy nie
    wraca do fałszu — przewijanie w tę i z powrotem niczego nie wznowi.
    Powtórka jest tylko po odświeżeniu strony.
  */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;

    // Ograniczony ruch dostaje stan końcowy od razu: samo logo z odbiciem.
    if (reduced) {
      setPlayed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return;

        observer.disconnect();
        setPlayed(true);
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    /*
      DOKŁADNIE STARY UKŁAD: `pt-4`, wyśrodkowana kolumna, `mt-4` nad logo.
      Doszło wyłącznie `relative`, żeby warstwa animacji miała się o co
      zaczepić — to jedyna zmiana geometrii i nie zmienia ona rozmiaru.
    */
    <div
      ref={sectionRef}
      data-testid="footer-animation"
      data-played={played ? "true" : "false"}
      className="powered-by-section relative pt-4"
      style={
        {
          "--pb-opacity": LAYOUT.playerOpacity,
          "--pb-start-gap-mobile": LAYOUT.startGapMobile,
          "--pb-start-gap-desktop": LAYOUT.startGapDesktop,
          "--pb-meet-mobile": LAYOUT.meetMobile,
          "--pb-meet-desktop": LAYOUT.meetDesktop,
          "--pb-puck-from": LAYOUT.puckFrom,
          "--pb-enter-ms": `${TIMING.enter}ms`,
          "--pb-enter-at": `${TIMING.playersDelay}ms`,
          "--pb-fall-ms": `${TIMING.puckFall}ms`,
          "--pb-fall-at": `${TIMING.puckDelay}ms`,
          "--pb-vanish-ms": `${TIMING.vanish}ms`,
          "--pb-vanish-at": `${TIMING.impactAt}ms`,
          "--pb-burst-ms": `${TIMING.burst}ms`,
          "--pb-burst-at": `${TIMING.impactAt}ms`,
          "--pb-letter-ms": `${TIMING.letter}ms`,
          "--pb-logo-ms": `${TIMING.logo}ms`,
          "--pb-logo-at": `${TIMING.logoAt}ms`,
          "--pb-shake-ms": `${TIMING.shake}ms`,
          "--pb-shake-at": `${TIMING.shakeAt}ms`,
          "--pb-echo-ms": `${TIMING.echo}ms`,
          "--pb-echo-at": `${TIMING.echoAt}ms`,
        } as React.CSSProperties
      }
    >
      <Overlay />

      {/*
        Krążek stoi POZA przyciętą warstwą — leci z góry, przez pustą
        przestrzeń pod odliczaniem, więc widać cały jego lot.
      */}
      <Puck />

      <div className="flex flex-col items-center justify-center text-center">
        <PoweredByLabel />

        {/*
          LOGO — dokładnie to, co było tu przed animacją.

          Rozmiary, `mt-4` i odbicie w tafli są przepisane jeden do jednego
          z poprzedniej, statycznej wersji. Ruch siedzi na dwóch osobnych
          opakowaniach (drgnięcie i wyłonienie), bo obie animacje ruszają
          `transform` i na jednym elemencie kasowałyby się nawzajem.
        */}
        <div className="pb-logo-shake mt-4">
          <div className="pb-logo relative" data-testid="footer-logo">
            <div className="relative h-[130px] w-[190px] sm:h-[155px] sm:w-[225px] lg:h-[185px] lg:w-[270px] xl:h-[210px] xl:w-[300px]">
              <Image
                src="/icons/festiwal-logo.png"
                alt="Festiwal Hokeja"
                fill
                sizes="(min-width: 1280px) 300px, (min-width: 1024px) 270px, (min-width: 640px) 225px, 190px"
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
                  sizes="(min-width: 1280px) 215px, (min-width: 1024px) 195px, (min-width: 640px) 165px, 140px"
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * WARSTWA ANIMACJI
 * ======================================================================== */

/**
 * Wszystko, co tymczasowe, żyje TUTAJ.
 *
 * `absolute inset-0` — zero wpływu na przepływ dokumentu. `overflow: clip`
 * przycina sylwetki wjeżdżające zza krawędzi i krążek spadający z góry,
 * ale NIE dotyka logo ani jego odbicia, bo te są poza tą warstwą.
 */
function Overlay() {
  return (
    <div
      aria-hidden="true"
      data-testid="footer-overlay"
      className="pb-overlay pointer-events-none absolute inset-0 overflow-clip"
    >
      <Player side="left" />
      <Player side="right" />
      <Burst />
    </div>
  );
}

function Player({ side }: { side: "left" | "right" }) {
  const height = `calc(${LAYOUT.playerSize} * ${PLAYER_SCALE[side]})`;
  const width = `calc(${height} * ${PLAYER_ASPECT[side]})`;

  return (
    /*
      PUDEŁKO NA CAŁĄ SZEROKOŚĆ WARSTWY — i to nie jest ozdobnik.

      `translateX` w procentach liczy się od szerokości WŁASNEGO elementu,
      nie rodzica. Gdy przesuwana była sama sylwetka, „74%" znaczyło ~100 px
      zamiast trzech czwartych sekcji i zawodnicy startowali praktycznie na
      środku. Skoro przesuwamy pudełko rozpięte na całą warstwę, procenty
      odnoszą się wreszcie do szerokości sceny.
    */
    <div
      data-testid="footer-player"
      data-side={side}
      className={`pb-player pb-player--${side} absolute inset-x-0 bottom-0 flex justify-center`}
      /*
        Połowa szerokości TEJ sylwetki. Punkt startu liczy się względem
        krawędzi sceny plus/minus ta wartość, więc grafika zawsze wchodzi
        w kadr w całości — nigdy przycięta w połowie.
      */
      style={{ ["--pb-half" as string]: `calc(${width} / 2)` }}
    >
      {/* Grafiki są już skierowane do środka — żadnego odbicia w poziomie. */}
      <div
        className="pb-player-body relative shrink-0"
        style={{ height, width }}
      >
        <Image
          src={PLAYER_SRC[side]}
          alt=""
          fill
          sizes="(min-width: 1024px) 220px, 30vw"
          className="object-contain object-bottom"
        />
      </div>
    </div>
  );
}

function Puck() {
  return (
    <div
      data-testid="footer-puck"
      aria-hidden="true"
      className="pb-puck pointer-events-none absolute left-1/2"
      /*
        Krążek zatrzymuje się PONAD głowami — o wysokość sylwetki plus
        prześwit. W chwili starcia widać wyraźny oddech między nim
        a zawodnikami, zamiast trzech grafik w jednym punkcie.
      */
      style={{
        bottom: `calc(${LAYOUT.playerSize} + ${LAYOUT.puckClearance})`,
      }}
    >
      {/* Znikanie siedzi na osobnym elemencie — patrz `pb-vanish` w CSS. */}
      <div
        className="pb-puck-body relative"
        style={{
          height: LAYOUT.puckSize,
          width: `calc(${LAYOUT.puckSize} * 1.372)`,
        }}
      >
        <Image
          src="/images/animation/hockey_puck.webp"
          alt=""
          fill
          sizes="32px"
          className="object-contain"
        />
      </div>
    </div>
  );
}

/**
 * ENERGIA STARCIA.
 *
 * Zwarty rdzeń, pierścień, osiem iskier i chmura lodowego pyłu. Rdzeń jest
 * biało-cyanowy, obrzeża biorą kolory od obu zawodników. Energia sportowa,
 * nie eksplozja: bez ognia i bez kuli zasłaniającej pół sekcji.
 */
function Burst() {
  return (
    <div
      data-testid="footer-impact"
      className="absolute left-1/2 h-0 w-0"
      // Kije krzyżują się nisko, tuż nad linią lodu — tam wybucha.
      style={{ bottom: LAYOUT.collision }}
    >
      {SMOKE.map((puff) => (
        <span
          key={`${puff.x}:${puff.y}`}
          className="pb-smoke impact-smoke absolute left-0 top-0 block rounded-full"
          style={{
            height: `calc(${LAYOUT.burstSize} * 0.72)`,
            width: `calc(${LAYOUT.burstSize} * 0.72)`,
            ["--pb-x" as string]: `${puff.x}px`,
            ["--pb-y" as string]: `${puff.y}px`,
            ["--pb-size" as string]: puff.size,
            animationDelay: `calc(var(--pb-burst-at) + ${puff.delay}ms)`,
          }}
        />
      ))}

      <span
        className="pb-flash impact-flash absolute left-0 top-0 block rounded-full"
        style={{ height: LAYOUT.burstSize, width: LAYOUT.burstSize }}
      />

      <span
        className="pb-ring impact-ring absolute left-0 top-0 block rounded-full"
        style={{
          height: `calc(${LAYOUT.burstSize} * 0.4)`,
          width: `calc(${LAYOUT.burstSize} * 0.4)`,
        }}
      />

      {SPARKS.map((angle) => (
        <span
          key={angle}
          className="absolute left-0 top-0 block h-0 w-0"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span className="pb-spark impact-spark absolute left-0 top-0 block h-[2px] w-[clamp(0.6rem,2.5vw,1rem)] rounded-full" />
        </span>
      ))}
    </div>
  );
}

/**
 * „POWERED BY".
 *
 * Napis kondensuje się z energii litera po literze i ZOSTAJE — jest częścią
 * stanu końcowego, dokładnie jak w statycznej wersji sekcji.
 *
 * Znaczniki są przepisane jeden do jednego ze starego `ReflectiveLabel` —
 * ta sama typografia, ten sam odstęp, to samo odbicie.
 */
function PoweredByLabel() {
  return (
    <div className="pb-label relative w-fit" data-testid="footer-powered-by">
      <div className="text-lg font-semibold tracking-[0.08em] text-slate-700 sm:text-xl">
        {[...POWERED_BY].map((char, index) => (
          <span
            key={index}
            className="pb-letter inline-block whitespace-pre"
            // Litery wchodzą kolejno, ze stałym odstępem — nic losowego.
            style={{
              animationDelay: `${TIMING.textAt + index * TIMING.letterStep}ms`,
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/*
        Odbicie NIE może wyprzedzać napisu.

        Wcześniej była to zwykła statyczna kopia, więc lustrzane „Powered by"
        stało pod spodem, zanim jakakolwiek litera zdążyła się pojawić.
        Teraz ma własne wejście, dostrojone do liter.
      */}
      <div
        aria-hidden="true"
        className="pb-echo pointer-events-none absolute left-0 top-full mt-1 w-full scale-y-[-1] select-none overflow-hidden blur-[1.6px]"
      >
        <div className="text-lg font-semibold tracking-[0.08em] text-slate-700 sm:text-xl">
          {POWERED_BY}
        </div>
      </div>
    </div>
  );
}
