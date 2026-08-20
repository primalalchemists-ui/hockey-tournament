import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CategorySwitcher } from "@/components/public/category-switcher";

/**
 * PUBLICZNY PRZELACZNIK KATEGORII.
 *
 * Wybor jest LOKALNY dla sesji: nie zmienia turnieju wyswietlanego
 * globalnie i nie jest nigdzie zapisywany.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const switcher = source("components/public/category-switcher.tsx");
const hook = source("components/use-public-auto-refresh.ts");
const shell = source("components/tournament-shell.tsx");

const CATEGORIES = [
  { tournamentId: "a", label: "U8", bubbleColor: "#D6A52A" },
  { tournamentId: "b", label: "U10", bubbleColor: "#1E3A5F" },
];

function render(overrides?: {
  categories?: typeof CATEGORIES;
  selected?: string | null;
}) {
  return renderToStaticMarkup(
    <CategorySwitcher
      categories={overrides?.categories ?? CATEGORIES}
      selectedTournamentId={
        overrides?.selected === undefined ? "a" : overrides.selected
      }
      isSwitching={false}
      onSelect={() => {}}
      error={null}
    />
  );
}

describe("N-Q/BD-BE: babelek", () => {
  const html = render();

  it("N/O: bez dwoch kategorii babelek sie nie pojawia", () => {
    expect(render({ categories: [] })).toBe("");
    expect(render({ categories: [CATEGORIES[0]] })).toBe("");
  });

  it("P/Q: przy dwoch kategoriach widac etykiete ogladanej", () => {
    expect(html).toContain('data-testid="category-bubble"');
    expect(html).toContain(">U8<");
    // Sama etykieta, bez pelnej nazwy turnieju.
    expect(html).not.toContain("SUN CUP");
  });

  it("BD/BE: babelek to przycisk z poprawna semantyka", () => {
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Zmień kategorię turnieju. Aktualnie U8");
  });

  it("BB/BC: kolor tekstu dobiera sie sam do tla", () => {
    // Zloto -> ciemny tekst, granat -> jasny.
    expect(html).toContain('data-tone="dark"');

    const navy = render({ selected: "b" });
    expect(navy).toContain('data-tone="light"');
  });

  it("kapsulka przyjmuje etykiety roznej dlugosci", () => {
    // Szerokosc wynika z tresci; min-w tylko pilnuje sensownego minimum.
    expect(switcher).toContain("min-w-[3.75rem]");
    expect(switcher).toContain("min-w-[3.25rem]");
    // Zero sztywnego kola 44x44.
    expect(switcher).not.toContain("h-11 w-11 rounded-full");
  });
});

describe("BF-BJ/55: popover", () => {
  it("BF/BG/BH: Escape, klik poza i powrot focusu", () => {
    expect(switcher).toContain('event.key !== "Escape"');
    expect(switcher).toContain("pointerdown");
    expect(switcher).toContain("bubbleRef.current?.focus()");
  });

  it("BI: kazda kategoria jest osiagalna z klawiatury", () => {
    expect(switcher).toContain('role="listbox"');
    expect(switcher).toContain('role="option"');
    expect(switcher).toContain("aria-selected");
    expect(switcher).toContain('aria-current');
  });

  it("BM: dluga lista przewija sie wewnatrz, nie rozpycha ekranu", () => {
    expect(switcher).toContain("max-h-[60vh]");
    expect(switcher).toContain("overflow-y-auto");
  });

  it("BJ: bez ruchu popover pojawia sie natychmiast", () => {
    expect(switcher).toContain("motion-safe:animate-");
  });

  it("brak autoplay i pulsowania", () => {
    expect(switcher).not.toContain("setInterval");

    const css = source("app/globals.css");
    const start = css.indexOf(".category-bubble {");
    const block = css.slice(start, css.indexOf("}", start));

    expect(block).not.toContain("infinite");
    expect(block).not.toContain("animation:");
  });
});

describe("BK/BO/60: pozycja", () => {
  it("BK/BO: babelek stoi przy prawej i nad dolna krawedzia", () => {
    expect(switcher).toContain("fixed right-4");
    // Wysoko ponad paskiem przegladarki, z uwzglednieniem strefy bezpiecznej.
    expect(switcher).toContain(
      'bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))"'
    );
  });

  it("BN/V: przelacznik nie tworzy poziomego przewijania strony", () => {
    // Zero szerokosci wymuszonej na dokumencie...
    expect(switcher).not.toContain("w-screen");
    // ...a lista sama przycina sie do szerokosci ekranu.
    expect(switcher).toContain("max-w-[calc(100vw-2rem)]");
  });
});

describe("AA-AF/AG-AI: cel odpytywania i brak zapisu wyboru", () => {
  it("AA/AB: polling idzie za WYBRANA kategoria", () => {
    expect(hook).toContain("const [targetId, setTargetId] = useState");
    expect(hook).toContain("versionUrl(targetId)");
    expect(hook).toContain("snapshotUrl(targetId)");
    expect(hook).toContain("}, [targetId]);");
  });

  it("AC: zadanie poprzedniej kategorii jest przerywane", () => {
    // Sprzatanie efektu wola controller.stop(), ktore abortuje request.
    expect(hook).toContain("controller.stop()");
  });

  it("AD/AE: focus i powrot do karty tez dotycza wybranej kategorii", () => {
    expect(hook).toContain("visibilitychange");
    expect(hook).toContain('window.addEventListener("focus"');
  });

  it("AG/AI: wybor kategorii NIE jest nigdzie zapisywany", () => {
    for (const file of [switcher, hook, shell]) {
      expect(file).not.toContain("localStorage");
      expect(file).not.toContain("sessionStorage");
      expect(file).not.toContain("document.cookie");
    }
  });

  it("T/32: przelaczenie nie przeladowuje strony ani nie nawiguje", () => {
    expect(switcher).not.toContain("location.reload");
    expect(switcher).not.toContain("router.push");
    expect(hook).not.toContain("location.reload");
  });

  it("K/U: przelacznik nie dotyka turnieju wyswietlanego globalnie", () => {
    for (const file of [switcher, hook, shell]) {
      expect(file).not.toContain("setCurrentTournament");
    }
  });

  it("39: widok wymienia sie atomowo, po pelnym snapshocie", () => {
    expect(hook).toContain("applyRef.current(snapshot)");
    expect(hook).toContain("setTargetId(snapshot.tournamentId)");
  });

  it("38: nieudane przelaczenie zostawia poprzednia kategorie", () => {
    expect(hook).toContain("return false;");
    expect(shell).toContain("Nie udało się wczytać tej kategorii.");
  });
});

describe("AX/51: gdzie przelacznika NIE ma", () => {
  it("AX: strona archiwalna nie renderuje przelacznika", () => {
    const history = source("components/history/archived-tournament-view.tsx");
    const route = source("app/turnieje/[slug]/page.tsx");

    expect(history).not.toContain("CategorySwitcher");
    expect(route).not.toContain("CategorySwitcher");
  });

  it("panel admina nie renderuje publicznego babelka", () => {
    const admin = source("components/admin/admin-shell.tsx");

    // Panel ma WYLACZNIE konfiguracje, nigdy publicznego babelka.
    expect(admin).toContain("CategorySwitcherSettings");
    expect(admin).not.toContain("components/public/category-switcher");
  });
});
