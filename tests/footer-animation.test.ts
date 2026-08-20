import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * SYGNATURA STRONY — sanity check, nie audyt każdej klatki.
 *
 * Pilnujemy tylko tego, co naprawdę psuje sekcję: że animacja odpala się
 * RAZ, że nie wróciło scrubowanie przewijaniem i że finalny układ logo
 * z odbiciem w tafli został nietknięty.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const scene = source("components/public/footer-animation.tsx");
const banner = source("components/camp-banner.tsx");
const css = source("app/globals.css");

describe("jednorazowa animacja", () => {
  it("odpala się raz przez IntersectionObserver, bez scrolla", () => {
    expect(scene).toContain("new IntersectionObserver");
    expect(scene).toContain("observer.disconnect();");
    expect(scene).toContain("setPlayed(true)");

    // Koniec ze scroll-driven: zero scrubowania i zero odtwarzania wstecz.
    expect(scene).not.toContain("useScroll");
    expect(scene).not.toContain("scrollYProgress");
    expect(scene).not.toContain("useTransform");
  });

  it("stan końcowy zostaje sam z siebie", () => {
    // `fill-mode: both` trzyma ostatnią klatkę — bez dodatkowej klasy.
    expect(css).toContain('.powered-by-section[data-played="true"] .pb-logo');
    expect(css).toContain("pb-charge var(--pb-shake-ms) ease-out");
    expect(scene).toContain('data-played={played ? "true" : "false"}');
  });

  it("ograniczony ruch dostaje od razu stan końcowy", () => {
    expect(scene).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation: none;");
  });
});

describe("układ i assety", () => {
  it("poprzednie turnieje stoją POD sygnaturą", () => {
    const powered = banner.indexOf("<PoweredBySection />");
    const history = banner.indexOf("{previousTournaments}");

    expect(powered).toBeGreaterThan(0);
    expect(history).toBeGreaterThan(powered);
  });

  it("kazdy uzywany asset istnieje na dysku", () => {
    // Wariant sylwetki bywa podmieniany recznie — sprawdzamy to, co jest
    // FAKTYCZNIE uzyte, zamiast przypinac test do jednej nazwy pliku.
    const used = [...scene.matchAll(/"(\/[^"]+\.(?:webp|png))"/g)].map(
      (match) => match[1],
    );

    expect(used.length).toBeGreaterThanOrEqual(4);

    for (const path of new Set(used)) {
      expect(existsSync(new URL(`../public${path}`, import.meta.url))).toBe(
        true,
      );
    }

    expect(scene).toContain("/images/animation/hockey_puck.webp");
    expect(scene).toContain("/icons/festiwal-logo.png");
  });

  it("finalne logo zachowuje rozmiar i odbicie w tafli", () => {
    // Dokładnie te same wymiary co przed animacją.
    expect(scene).toContain(
      "h-[130px] w-[190px] sm:h-[155px] sm:w-[225px] lg:h-[185px] lg:w-[270px] xl:h-[210px] xl:w-[300px]",
    );
    // Odbicie: lustrzana kopia pod logo.
    expect(scene).toContain("scale-y-[-1]");
    expect(scene).toContain("opacity-20 blur-[2px]");
  });

  it("zawodnicy i krążek mają wspólne opacity", () => {
    expect(scene).toContain("playerOpacity: 0.9");
    expect(css).toContain("opacity: var(--pb-opacity)");
  });

  it("krążek zatrzymuje się nad głowami, wybuch niżej przy kijach", () => {
    // Krążek: wysokość sylwetki plus prześwit. Wybuch: nisko, przy kijach.
    expect(scene).toContain("${LAYOUT.playerSize} + ${LAYOUT.puckClearance}");
    expect(scene).toContain('collision: "2rem"');
  });

  it("animacja nie zmienia geometrii sekcji", () => {
    // Stary układ wrócił co do klasy: `pt-4`, `mt-4`, zero wysokości.
    expect(scene).toContain('className="powered-by-section relative pt-4"');
    expect(scene).toContain('className="pb-logo-shake mt-4"');
    // Filtrujemy komentarze — liczy sie kod, nie opis w docblocku.
    const code = scene
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith("*"))
      .join(String.fromCharCode(10));

    expect(code).not.toMatch(/h-\[\d+rem\]/);
    expect(code).not.toMatch(/min-h-/);
    expect(code).not.toContain("sticky");
    expect(code).not.toContain("dvh");

    // Warstwa animacji jest absolutna — zero wpływu na przepływ.
    expect(scene).toContain("pb-overlay pointer-events-none absolute inset-0");
  });

  it("odbicie napisu nie wyprzedza samego napisu", () => {
    // Lustrzana kopia ma wlasne wejscie, dostrojone do liter.
    expect(css).toContain("pb-echo-in var(--pb-echo-ms)");
    expect(css).toContain(".powered-by-section .pb-echo");
    expect(scene).toContain("echoAt:");
  });

  it("krążek leci razem z zawodnikami i poza przycieta warstwa", () => {
    // Wlasny, krotszy czas — krazek leci szybciej niz jada zawodnicy.
    expect(css).toContain("animation: pb-fall var(--pb-fall-ms)");
    // Krazek stoi obok warstwy, wiec nie jest przez nia przycinany.
    const overlay = scene.slice(
      scene.indexOf("function Overlay()"),
      scene.indexOf("function Player("),
    );
    expect(overlay).not.toContain("<Puck />");
  });

  it("wybuch nastepuje PO zetknieciu kijow", () => {
    // Wybuch rowny koncowi wjazdu — zero pauzy miedzy zetknieciem a energia.
    expect(scene).toContain("playersDelay: 420");
    expect(scene).toContain("enter: 850");
    expect(scene).toContain("impactAt: 1270");
  });
});
