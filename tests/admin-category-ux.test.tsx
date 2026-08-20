import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CategoryBubblePreview,
  CountdownPinPreview,
} from "@/components/admin/color-previews";
import { PlayoffMatchRow } from "@/components/admin/playoff-match-row";
import type { BracketTeamView } from "@/lib/data/postgres/playoff-engine";

/**
 * PORZADKI W PANELU.
 *
 * Kategorie dostaja wlasna zakladke, camp traci sciane objasnien,
 * a rozstrzygniety mecz od razu pokazuje, kto wygral.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const shell = source("components/admin/admin-shell.tsx");
const settings = source("components/admin/category-switcher-settings.tsx");
const dialog = source("components/ui/confirm-dialog.tsx");
const picker = source("components/admin/color-picker.tsx");

describe("A-D: zakladka Kategorie", () => {
  it("A: Kategorie sa zakladka najwyzszego poziomu", () => {
    expect(shell).toContain('{ key: "categories", label: "Kategorie" }');
    expect(shell).toContain('effectiveTab === "categories"');
  });

  it("B: przelacznik zniknal z Camp i bannery", () => {
    const campStart = shell.indexOf('if (effectiveTab === "camp")');
    const campEnd = shell.indexOf('if (effectiveTab === "categories")');
    const camp = shell.slice(campStart, campEnd);

    expect(camp).not.toContain("CategorySwitcherSettings");
  });

  it("C/D: pozostale zakladki bez zmian", () => {
    for (const label of [
      "Tabela",
      "Harmonogram",
      "Regulamin",
      "Camp i bannery",
      "Pasek info",
    ]) {
      expect(shell).toContain(`label: "${label}"`);
    }
  });
});

describe("A-F: dodawanie dzieje sie inline", () => {
  it("C/D/E: klikniecie dodawania nie otwiera okna", () => {
    // Zero overlaya, zero blokady przewijania, zero focus trapa.
    expect(settings).not.toContain("ConnectDialog");
    expect(settings).not.toContain("AddCategoryDialog");
    expect(settings).not.toContain('size="form"');

    // Jedyny ConfirmDialog dotyczy usuwania.
    expect(settings.split("<ConfirmDialog").length - 1).toBe(1);
  });

  it("B/F: panel dodawania pojawia sie w tresci strony", () => {
    expect(settings).toContain('data-testid="category-add-open"');
    expect(settings).toContain('data-testid="category-add-panel"');
    expect(settings).toContain("setIsAdding(true)");
  });

  it("A: sekcja nie blokuje przewijania strony", () => {
    expect(settings).not.toContain("overflow-hidden");
    expect(settings).not.toContain("max-h-[88dvh]");
  });
});

describe("G-L/41: akcja serwerowa bez bledu transition", () => {
  it("J/41: formularze wysylaja akcje przez prawdziwy submit", () => {
    /*
      TU BYL BLAD. Akcja z useActionState byla wolana recznie
      (`action(form)`) z obslugi klikniecia w oknie modalnym, czyli poza
      transition — stad "An async function with useActionState was called
      outside of a transition".
    */
    expect(settings).toContain("action={action}");
    expect(settings).toContain("action={save}");
    expect(settings).toContain("action={move}");

    // Zaden dispatch nie jest wolany recznie z handlera klikniecia.
    expect(settings).not.toMatch(/onClick=\{\(\) => \w+\(form\)\}/);
    expect(settings).not.toContain("action(form)");
  });

  it("usuwanie idzie ukrytym formularzem, nie recznym wywolaniem", () => {
    expect(settings).toContain("removeFormRef.current?.requestSubmit()");
    expect(settings).toContain("<form ref={removeFormRef} action={remove}");
  });

  it("G/H: pierwsze polaczenie ustawia obie kategorie", () => {
    expect(settings).toContain("isFirstConnection");
    expect(settings).toContain('name="currentLabel"');
    expect(settings).toContain('name="currentColor"');
    expect(settings).toContain('name="targetLabel"');
    expect(settings).toContain('name="targetTournamentId"');
  });

  it("K/20: panel zamyka sie dopiero po potwierdzeniu z serwera", () => {
    expect(settings).toContain("if (members.length !== seenCount)");
    expect(settings).toContain("setIsAdding(false)");
  });

  it("stan oczekiwania pochodzi z formularza", () => {
    expect(settings).toContain("useFormStatus");
    expect(settings).toContain('busyLabel="Dodawanie…"');
  });
});

describe("M-Q: wiele kategorii", () => {
  it("M/P: kolejna kategoria to jednoczlonowy formularz inline", () => {
    // Ustawienia istniejacych czlonkow nie sa pokazywane ponownie.
    expect(settings).toContain("isFirstConnection ? (");
    expect(settings).toContain('"Dodawany turniej" : "Nowa kategoria"');
  });

  it("N/O/Q: zaden limit liczby kategorii nie istnieje", () => {
    expect(settings).not.toMatch(/length\s*[<>=]=?\s*2/);
    expect(settings).toContain("members.map(");
  });

  it("R: jeden globalny przycisk dodawania pod lista", () => {
    expect(settings).toContain("+ Dodaj turniej");
    expect(settings.split("+ Dodaj turniej").length - 1).toBe(1);
  });

  it("AE: komunikat o braku kandydatow dopiero po otwarciu panelu", () => {
    expect(settings).toContain("Brak dostępnych turniejów do dodania.");
    // Domyslny stan sekcji nie straszy ograniczeniami.
    const beforePanel = settings.slice(0, settings.indexOf("function AddMemberPanel"));
    expect(beforePanel).not.toContain("Brak dostępnych");
  });

  it("24: picker koloru jest domyslnie zwiniety", () => {
    expect(settings).toContain("<details");
    expect(settings).toContain("<summary");
  });
});

describe("S-X: podglad koloru we wlasciwym kontekscie", () => {
  const bubble = renderToStaticMarkup(
    <CategoryBubblePreview label="U8" color="#D6A52A" />
  );

  it("S/V/W: kategoria pokazuje publiczny babelek", () => {
    expect(bubble).toContain('data-testid="category-preview"');
    expect(bubble).toContain("category-bubble");
    expect(bubble).toContain(">U8<");
    expect(bubble).toContain("#D6A52A");
  });

  it("X: kolor tekstu dobiera sie automatycznie", () => {
    expect(bubble).toContain('data-tone="dark"');

    const navy = renderToStaticMarkup(
      <CategoryBubblePreview label="U10" color="#1E3A5F" />
    );
    expect(navy).toContain('data-tone="light"');
  });

  it("T: ustawienia kategorii NIE pokazuja kartki odliczania", () => {
    expect(settings).not.toContain("CountdownPinPreview");
    expect(settings).not.toContain("pin-color-preview");
    // Picker sam z siebie nie wozi juz zadnego podgladu.
    expect(picker).not.toContain("countdown-pin");
  });

  it("U: ustawienia campu nadal pokazuja kartke odliczania", () => {
    const countdown = renderToStaticMarkup(
      <CountdownPinPreview color="#EF4444" />
    );

    expect(countdown).toContain('data-testid="pin-color-preview"');
    expect(countdown).toContain("countdown-pin");
    expect(shell).toContain("<CountdownPinPreview color={color} />");
  });
});

describe("Y-AC: mniej gadania w ustawieniach campu", () => {
  it("Y: znikla podpowiedz o domyslnym naglowku", () => {
    expect(shell).not.toContain("Puste pole =");
    expect(shell).not.toContain("Możesz wpisać np.");
  });

  it("Z: znikl akapit o zamknietych zapisach", () => {
    expect(shell).not.toContain("Zapisy są zamknięte. Przycisk");
    expect(shell).not.toContain("Zapisany link nie znika");
  });

  it("AA/AB/AC: komunikaty bledow i sama funkcja zostaja", () => {
    expect(shell).toContain("CAMP_URL_ERROR");
    expect(shell).toContain("Zapisy na camp są aktywne");
    expect(shell).toContain("Nagłówek sekcji");
    expect(shell).toContain("Link do zapisów");
  });
});
