import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CategorySwitcher } from "@/components/public/category-switcher";
import { TournamentHeader } from "@/components/tournament-header";

/**
 * DWA MIEJSCA PRZELACZNIKA KATEGORII.
 *
 * Na desktopie plaska kapsulka w gornym pasku, przy „Wyniki Live".
 * Na telefonie plywajacy babelek nad dolna krawedzia - z dala od tabeli
 * i od przycisku „Udostepnij".
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const switcher = source("components/public/category-switcher.tsx");
const header = source("components/tournament-header.tsx");
const shell = source("components/tournament-shell.tsx");
const standings = source("components/standings-table.tsx");

const CATEGORIES = [
  { tournamentId: "a", label: "U8", bubbleColor: "#D6A52A" },
  { tournamentId: "b", label: "U10", bubbleColor: "#1E3A5F" },
];

function render(variant: "inline" | "floating") {
  return renderToStaticMarkup(
    <CategorySwitcher
      variant={variant}
      categories={CATEGORIES}
      selectedTournamentId="a"
      isSwitching={false}
      onSelect={() => {}}
      error={null}
    />
  );
}

describe("K-P: wariant desktopowy", () => {
  const html = render("inline");

  it("K: kapsulka stoi obok „Wyniki Live", () => {
    const liveIndex = header.indexOf("Wyniki Live");
    const switcherIndex = header.indexOf("{categorySwitcher}");

    expect(switcherIndex).toBeGreaterThan(liveIndex);
    // Klaster informacyjny po lewej, nie przy ikonach spolecznosciowych.
    expect(switcherIndex).toBeLessThan(header.indexOf("instagram.com"));
  });

  it("L: na desktopie nic juz nie plywa nad trescia", () => {
    expect(html).toContain('data-variant="inline"');
    expect(html).toContain("relative hidden md:inline-flex");
    expect(html).not.toContain("fixed");
  });

  it("M: kapsulka jest plaska i kompaktowa", () => {
    // 32 px wysokosci i 12 px paddingu - pasuje do wysokosci paska.
    expect(html).toContain("h-8 min-w-[3.25rem] px-3 text-xs");
    expect(html).toContain("rounded-full");
  });

  it("N/O: kolor z ustawien i automatyczny kontrast zostaja", () => {
    expect(html).toContain("#D6A52A");
    expect(html).toContain('data-tone="dark"');
  });

  it("P: lista otwiera sie POD kapsulka", () => {
    expect(switcher).toContain('isFloating ? "bottom-full mb-2" : "top-full mt-2"');
    // Kotwica jest przy wyzwalaczu, nie przy krawedzi ekranu.
    expect(html).toContain("relative");
  });
});

describe("Q-W: wariant telefonowy", () => {
  const html = render("floating");

  it("Q/W: babelek nie stoi juz przy Rankingu ani przy „Udostepnij", () => {
    expect(standings).not.toContain("CategorySwitcher");
    // Przelacznik zyje w powloce, nie w naglowku tabeli.
    expect(shell).toContain('variant="floating"');
  });

  it("R/S/T: przyklejony do prawej, nad dolna krawedzia, ze strefa bezpieczna", () => {
    expect(html).toContain("fixed right-4");
    expect(html).toContain("env(safe-area-inset-bottom, 0px)");
    expect(html).toContain("5.25rem");
  });

  it("babelek ma pelny cel dotyku", () => {
    expect(html).toContain("h-11 min-w-[3.75rem] px-4");
  });

  it("U: lista rozwija sie W GORE", () => {
    const open = switcher.slice(switcher.indexOf("isFloating ?"));

    expect(open).toContain("bottom-full");
  });

  it("V: lista miesci sie w waskim ekranie", () => {
    expect(switcher).toContain("max-w-[calc(100vw-2rem)]");
    expect(switcher).toContain("max-h-[60vh]");
  });

  it("22: swiadomy z-index — nad trescia, pod oknami", () => {
    expect(html).toContain("z-30");
    // Okna modalne siedza na z-[100].
    expect(source("components/ui/confirm-dialog.tsx")).toContain("z-[100]");
  });
});

describe("X-AB: responsywnosc", () => {
  it("X/Y/Z: na danej szerokosci dziala dokladnie jeden wyzwalacz", () => {
    // Wariant telefonowy znika od `md`, desktopowy istnieje dopiero od `md`.
    expect(render("floating")).toContain("md:hidden");
    expect(render("inline")).toContain("hidden md:inline-flex");
  });

  it("AB: przejscie nastepuje na jednym, spojnym progu", () => {
    const floating = render("floating");
    const inline = render("inline");

    // Ten sam prog `md` (768 px) po obu stronach - zero luki i zero nakladania.
    expect(floating).toContain("md:hidden");
    expect(inline).toContain("md:inline-flex");
  });

  it("naglowek ma miejsce na kapsulke bez rozsypania sie", () => {
    expect(header).toContain("flex flex-row items-center justify-between gap-3");
  });

  it("bez kategorii nie zostaje puste miejsce", () => {
    const empty = renderToStaticMarkup(
      <CategorySwitcher
        variant="inline"
        categories={[]}
        selectedTournamentId="a"
        isSwitching={false}
        onSelect={() => {}}
        error={null}
      />
    );

    expect(empty).toBe("");
  });
});

describe("33: dostepnosc po zmianie miejsca", () => {
  it("oba warianty to przyciski z pelna semantyka", () => {
    for (const variant of ["inline", "floating"] as const) {
      const html = render(variant);

      expect(html).toContain('type="button"');
      expect(html).toContain('aria-haspopup="listbox"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain("Zmień kategorię turnieju. Aktualnie U8");
    }
  });
});

describe("naglowek nadal renderuje sie bez przelacznika", () => {
  it("brak kategorii nie psuje gornego paska", () => {
    const html = renderToStaticMarkup(
      <TournamentHeader
        title="Turniej"
        scorers={[]}
        teams={[]}
        plannedMatchCount={56}
        playedMatchCount={1}
        cta={{
          kind: "results",
          label: "Sprawdź wyniki",
          shine: false,
          targetId: "wyniki",
          cinematic: false,
        }}
      />
    );

    expect(html).toContain("Wyniki Live");
    expect(html).toContain('data-testid="match-progress"');
  });
});
