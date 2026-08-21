import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * OKNA POTWIERDZENIA.
 *
 * Natywne `window.confirm` wygladalo jak alert systemowy, mowilo technicznym
 * jezykiem i nie dalo sie go opisac dla czytnika ekranu. Zastapione jednym
 * wspolnym dialogiem: ustawienie turnieju publicznego i cofniecie fazy.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const selector = source("components/admin/tournament-selector.tsx");
const panel = source("components/admin/playoff-panel.tsx");
const dialog = source("components/ui/confirm-dialog.tsx");

/*
  Okno mieszka w portalu do <body>, więc w renderze serwerowym świadomie
  nie powstaje — inaczej pojawiłoby się w HTML-u przed hydracją. Dlatego
  jego strukturę sprawdzamy w źródle komponentu, a nie w markupie.
*/
const html = renderToStaticMarkup(
  <ConfirmDialog
    open
    title="Zmienić wyświetlany turniej?"
    confirmLabel="Ustaw jako wyświetlany"
    onConfirm={() => {}}
    onCancel={() => {}}
  >
    <p>Aktualnie na stronie</p>
  </ConfirmDialog>
);

describe("AY-BA: koniec okien systemowych", () => {
  it("AZ/BA: panel nie uzywa juz confirm ani alert", () => {
    for (const file of [selector, panel]) {
      expect(file).not.toContain("window.confirm");
      expect(file).not.toContain("window.alert");
    }
  });

  it("AY/BE: oba przeplywy korzystaja z jednego dialogu", () => {
    expect(selector).toContain("<ConfirmDialog");
    expect(panel).toContain("<ConfirmDialog");
  });
});

describe("BB-BD: zmiana wyswietlanego turnieju", () => {
  it("BB: widac turniej obecny i ten po zmianie", () => {
    expect(selector).toContain("Aktualnie na stronie:");
    expect(selector).toContain("{currentTitle}");
    expect(selector).toContain("Po zmianie:");
    expect(selector).toContain("{selected.title}");
  });

  it("okno nie renderuje sie po stronie serwera", () => {
    // Portal do <body> istnieje wylacznie w przegladarce.
    expect(html).toBe("");
  });

  it("BB: jezyk jest ludzki, nie techniczny", () => {
    expect(selector).toContain(
      "Od tej chwili odwiedzający stronę wyników zobaczą wybrany"
    );
    expect(selector).not.toContain("is_current");
  });

  it("BC/BD: anulowanie tylko zamyka, potwierdzenie wysyla formularz", () => {
    expect(selector).toContain("onCancel={() => setConfirmCurrent(false)}");
    expect(selector).toContain("setCurrentFormRef.current?.requestSubmit()");
  });
});

describe("BF-BI: cofniecie fazy", () => {
  it("BF: widac faze biezaca i docelowa", () => {
    // Jedna, drobna linia zamiast powtarzania tej samej informacji.
    expect(panel).toContain("Aktualnie: {state.phaseLabel}");
    expect(panel).toContain("po cofnięciu:");
    expect(panel).toContain("impact?.targetLabel");
  });

  it("BG: konsekwencje pochodza z realnego zachowania silnika", () => {
    // Ten sam describeReopen, ktory potem wykonuje operacje.
    expect(panel).toContain("describeReopenAction(tournamentId)");
    expect(panel).toContain("resultsToDiscard: impact.resultsToDiscard");
    expect(panel).toContain("removesBracket: impact.removesBracket");

    // Tresc powstaje w czystym helperze, nie w komponencie.
    expect(panel).toContain("getRewindConfirmationCopy({");
    expect(panel).toContain("rewindCopy.lines.map");
  });

  it("BH/BI: anulowanie nic nie robi, potwierdzenie cofa faze", () => {
    expect(panel).toContain("onCancel={() => setReopenOpen(false)}");
    expect(panel).toContain("reopenFormRef.current?.requestSubmit()");
  });

  it("operacja kasujaca ma ostrzegawczy, ale spokojny ton", () => {
    expect(panel).toContain('tone="danger"');
    expect(panel).toContain('confirmLabel="Cofnij fazę"');
  });
});

describe("BJ-BO: dostepnosc i uklad", () => {
  it("dialog jest opisany dla czytnika ekranu", () => {
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("aria-labelledby={titleId}");
  });

  it("BJ: Escape zamyka bez wykonania akcji", () => {
    expect(dialog).toContain('event.key === "Escape"');
    expect(dialog).toContain("onCancel()");
  });

  it("BK: Tab nie wychodzi poza okno", () => {
    expect(dialog).toContain('event.key !== "Tab"');
    expect(dialog).toContain("first.focus()");
    expect(dialog).toContain("last.focus()");
  });

  it("BL: focus wraca na przycisk, ktory otworzyl okno", () => {
    expect(dialog).toContain("restoreRef.current = document.activeElement");
    expect(dialog).toContain("restoreRef.current?.focus()");
  });

  it("BK: Enter nie potwierdza przypadkiem operacji kasujacej", () => {
    /*
      Focus startuje na akcji bezpiecznej. Gdy okno nie ma „Anuluj" — bo
      oferuje dwie realne odpowiedzi zamiast rezygnacji — tę rolę przejmuje
      „×", ale nigdy przycisk kasujacy.
    */
    expect(dialog).toContain("(cancelRef.current ?? closeRef.current)?.focus()");
  });

  it("BM: tlo jest przygaszone i rozmyte", () => {
    expect(dialog).toContain("backdrop-blur-sm");
    expect(dialog).toContain("bg-slate-950/55");
  });

  it("BN: otwarcie okna nie przesuwa strony", () => {
    /*
      Rekompensata paska przewijania mieszka teraz w jednym helperze,
      wspolnym z kadrem ceremonii podium — okno tylko go wola.
    */
    const lock = source("lib/public/scroll-lock.ts");

    expect(dialog).toContain("lockBodyScroll()");
    expect(lock).toContain(
      "window.innerWidth - document.documentElement.clientWidth"
    );
    expect(lock).toContain("body.style.paddingRight");
  });

  it("BO: na telefonie akcje ida w pionie i maja pelny cel dotyku", () => {
    expect(dialog).toContain("flex-col-reverse");
    expect(dialog).toContain("sm:flex-row");
    expect(dialog).toContain("h-11");

    /*
      Okno stoi na SRODKU na kazdym ekranie. Wczesniejszy wariant przyklejal
      sie na telefonie do dolnej krawedzi, wiec ta sama decyzja wygladala
      inaczej zaleznie od urzadzenia — jeden uklad znaczy jeden nawyk.
    */
    expect(dialog).toContain("items-center justify-center");
    expect(dialog).not.toContain("items-end");
  });

  it("okno zyje w portalu, wiec nie zamyka go rozmycie karty", () => {
    expect(dialog).toContain("ModalPortal");
  });
});
