/**
 * MARKA W STANIE ŁADOWANIA — jedno źródło prawdy.
 *
 * Ten sam wizual obsługuje dwa różne momenty:
 *
 *  1. krótkie intro przy pierwszym wejściu (components/logo-intro.tsx),
 *  2. granicę ładowania trasy publicznej (app/loading.tsx i strona historii).
 *
 * Wcześniej trasa `/` miała WŁASNY, zupełnie inny ekran: szare paski
 * skeletonu i trzy skaczące kropki. Przy nawigacji z archiwum z powrotem
 * na stronę główną kibic widział najpierw jego, a potem gotową stronę —
 * dwa różne języki wizualne w jednym przejściu. Dlatego wszystko publiczne
 * korzysta teraz z tego jednego komponentu.
 *
 * Komponent jest czysto prezentacyjny: bez timerów i bez stanu.
 */

const PULSE_CYCLE_MS = 580;

type BrandLoaderProps = {
  /**
   * Liczba pulsów. Intro odlicza dokładnie trzy i znika; granica ładowania
   * pulsuje, dopóki trasa nie będzie gotowa.
   */
  cycles?: number | "infinite";
  testId?: string;
};

export function BrandLoader({
  cycles = "infinite",
  testId = "brand-loader",
}: BrandLoaderProps) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      /*
        Tło z tokenu lodu, a nie białe — dzięki temu nie ma białego błysku
        przy wejściu i wyjściu ze stanu ładowania.
      */
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ice-base)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/festiwal-logo.png"
        alt=""
        className="h-28 w-auto sm:h-36"
        style={{
          animation: `intro-pulse ${PULSE_CYCLE_MS}ms ease-in-out ${cycles} both`,
        }}
      />
    </div>
  );
}

export const BRAND_LOADER_PULSE_MS = PULSE_CYCLE_MS;
