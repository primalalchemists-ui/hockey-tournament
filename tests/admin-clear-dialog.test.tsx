import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * OKNO „WYCZYSC".
 *
 * Operacja wysokiego ryzyka dostaje wlasne okno z ostrzezeniem — koniec
 * z natywnym „localhost:3000 says".
 *
 * WAZNE: `handleClearAll` czysci WYLACZNIE formularz. Do bazy nic nie
 * trafia, dopoki administrator nie kliknie „Zapisz", wiec tresc okna nie
 * moze mowic o operacji nieodwracalnej.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const shell = source("components/admin/admin-shell.tsx");
const dialog = source("components/ui/confirm-dialog.tsx");

describe("A-E: koniec natywnego okna", () => {
  it("A/B: panel nie uzywa juz confirm ani alert", () => {
    // W pliku zostaje wylacznie komentarz opisujacy usunieta implementacje.
    const code = shell
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith("*"))
      .join(String.fromCharCode(10));

    expect(code).not.toContain("window.confirm(");
    expect(code).not.toContain("window.alert(");
  });

  it("C: przycisk otwiera wlasne okno", () => {
    expect(shell).toContain('data-testid="admin-clear"');
    expect(shell).toContain("setClearOpen(true)");
    expect(shell).toContain("open={clearOpen}");
  });

  it("D: okno ma czytelny znak ostrzegawczy", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        icon="warning"
        tone="danger"
        title="Wyczyścić cały turniej?"
        confirmLabel="Wyczyść turniej"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <p>tresc</p>
      </ConfirmDialog>
    );

    // Okno zyje w portalu, wiec markup sprawdzamy w zrodle komponentu.
    expect(html).toBe("");
    expect(dialog).toContain('data-testid="confirm-warning-icon"');
    expect(dialog).toContain("AlertTriangle");
    // Ikona z biblioteki, nie emoji.
    expect(dialog).not.toContain("⚠");
  });

  it("E: tytul i przyciski po polsku", () => {
    expect(shell).toContain('title="Wyczyścić cały turniej?"');
    expect(shell).toContain('confirmLabel="Wyczyść turniej"');
    expect(shell).toContain('tone="danger"');
    expect(dialog).toContain('cancelLabel = "Anuluj"');
  });
});

describe("F-J: zachowanie", () => {
  it("F/G: anulowanie i Escape nie czyszcza formularza", () => {
    // Zamkniecie ustawia wylacznie stan okna...
    expect(shell).toContain("onCancel={() => setClearOpen(false)}");
    // ...a czyszczenie wisi pod potwierdzeniem.
    expect(shell).toContain("onConfirm={handleClearAll}");
    expect(dialog).toContain('event.key === "Escape"');
  });

  it("H: potwierdzenie wykonuje istniejaca operacje", () => {
    expect(shell).toContain("function handleClearAll()");
    expect(shell).toContain("setDraft({");
  });

  it("I: okno zamyka sie po wykonaniu, wiec nie da sie kliknac dwa razy", () => {
    expect(shell).toContain("setClearOpen(false);");
    expect(dialog).toContain("disabled={isBusy}");
  });

  it("J: semantyka czyszczenia bez zmian", () => {
    // Nadal wylacznie draft; pliki w Cloudinary zostaja nietkniete.
    expect(shell).toContain(
      "Świadomie NIE kolejkujemy tu usunięcia plików z Cloudinary"
    );
    expect(shell).not.toContain("clearTournamentAction");
  });

  it("tresc mowi prawde o tym, co sie stanie", () => {
    // Zmiany ida do bazy dopiero przy zapisie - i okno to mowi.
    expect(shell).toContain("Zmiany trafią do bazy dopiero po kliknięciu");
    expect(shell).toContain("Pliki wgrane do biblioteki grafik pozostaną");
    // Zadnych obietnic o nieodwracalnosci ani o zachowaniu ustawien.
    expect(shell).not.toContain("nie można cofnąć");
  });
});
