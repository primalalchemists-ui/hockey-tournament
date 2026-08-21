import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * SPÓJNOŚĆ UX — okna, przyciski i teksty.
 *
 * Każde z tych okien powstawało osobno i osobno się rozjeżdżało: jedno
 * wjeżdżało od dołu, drugie stało na środku, jedno miało „×", drugie napis
 * „Zamknij", trzecie oba naraz. Dla użytkownika to nie jest kwestia gustu —
 * to znaczy, że ta sama czynność wymaga za każdym razem innego nawyku.
 *
 * Testy są tekstowe, bo pilnują decyzji, a nie renderu: nie chodzi o to,
 * że okno działa, tylko że wygląda i zachowuje się jak sąsiednie.
 */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * Komentarze opisują TAKŻE to, czego w kodzie już nie ma — „wcześniej było
 * `items-end`", „nie wołamy `alert()`". Test szukający wzorca w całym pliku
 * potknąłby się o własne uzasadnienie, więc patrzy wyłącznie na kod.
 */
const source = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Wszystkie okna modalne panelu — komplet, nie próbka. */
const MODALS = {
  "confirm-dialog": source("components/ui/confirm-dialog.tsx"),
  "media-asset-picker": source("components/admin/media-asset-picker.tsx"),
  "team-dialog": source("components/admin/team-dialog.tsx"),
  "tournament-settings-panel": source(
    "components/admin/tournament-settings-panel.tsx"
  ),
} as const;

const selector = source("components/admin/tournament-selector.tsx");
const share = source("components/ShareTableButton.tsx");
const globals = source("app/globals.css");

describe("13-16: pozycja i budowa okien", () => {
  it("13 — każde okno stoi na środku, na telefonie też", () => {
    for (const [name, code] of Object.entries(MODALS)) {
      expect(name && code).toContain("items-center justify-center");

      /*
        Wariant „bottom sheet" znikł całkowicie. Gdyby wrócił choć w jednym
        oknie, ta sama decyzja wyglądałaby inaczej zależnie od urządzenia.
      */
      expect(code).not.toContain("items-end");
      expect(code).not.toContain("sm:items-center");
      expect(code).not.toContain("items-stretch");
    }
  });

  it("14 — okno nigdy nie przerasta ekranu i przewija się w środku", () => {
    for (const code of Object.values(MODALS)) {
      expect(code).toContain("max-h-[88dvh]");
      expect(code).toContain("overflow-y-auto");
    }
  });

  it("15 — krzyzyk jest zawsze w prawym gornym rogu i ma etykiete", () => {
    for (const code of Object.values(MODALS)) {
      expect(code).toContain('aria-label="Zamknij"');
      expect(code).toContain("justify-between");
    }
  });

  it("16 — żadne okno nie dubluje zamknięcia napisem w stopce", () => {
    for (const [name, code] of Object.entries(MODALS)) {
      /*
        „Zamknij" wolno użyć wyłącznie jako etykiety dla czytnika ekranu.
        Jako widoczny tekst przycisku powielałby „×" tuż obok.
      */
      const visible = code.replace(/aria-label="Zamknij[^"]*"/g, "");
      expect(`${name}: ${visible}`).not.toContain(">Zamknij<");
      expect(visible).not.toContain('confirmLabel="Zamknij"');
      expect(visible).not.toContain('cancelLabel="Zamknij"');
    }
  });

  it("Anuluj zostaje tam, gdzie jest co porzucic", () => {
    // Picker trzyma niezapisany wybór — ma czego się wyprzeć.
    expect(MODALS["media-asset-picker"]).toContain(
      'data-testid="media-picker-cancel"'
    );

    // Okno „usuń albo archiwizuj" pyta o decyzję, nie zbiera danych.
    expect(selector).toContain("showCancel={false}");
    expect(MODALS["confirm-dialog"]).toContain("showCancel = true");
  });
});

describe("17-20: teksty i CTA", () => {
  it("17 — okno usuwania mówi krótko: skutek i wyjście awaryjne", () => {
    expect(selector).toContain("Usunięcie jest nieodwracalne.");
    expect(selector).toContain("Możesz też zachować turniej");

    // Poprzednia ściana tekstu zniknęła.
    expect(selector).not.toContain("Usunięcie zabiera wyniki, terminarz");
    expect(selector).not.toContain("Herby drużyn i grafiki używane");
  });

  it("18 — przyciski nazywają czynność, nie kategorię", () => {
    expect(selector).toContain('confirmLabel="Usuń trwale"');
    expect(selector).toContain('label: "Archiwizuj"');
    // „Przenieś do archiwum" mówiło to samo dwa razy dłużej.
    expect(selector).not.toContain('label: "Przenieś do archiwum"');
  });

  it("19 — akcja nieodwracalna jest oznaczona jako taka", () => {
    expect(selector).toContain('tone="danger"');
    expect(selector).toContain('icon="warning"');

    // Focus siada na wyjściu bez konsekwencji, nie na „Usuń trwale".
    expect(MODALS["confirm-dialog"]).toContain(
      "(cancelRef.current ?? closeRef.current)?.focus()"
    );
  });

  it("20 — natywny alert zniknął z aplikacji", () => {
    expect(share).not.toContain("alert(");
    // Odpowiedź pojawia się tam, gdzie padło kliknięcie.
    expect(share).toContain('data-testid="share-copy-error"');
    expect(share).toContain("Nie udało się skopiować linku.");
    expect(share).toContain('role="status"');
  });
});

describe("21: ruch", () => {
  it("okna otwierają się jednym ruchem, opisanym w jednym miejscu", () => {
    expect(globals).toContain("--motion-dialog-in: 180ms");
    expect(globals).toContain("@keyframes dialog-card-in");

    // Wyjście z 0.98 — okno pojawia się, a nie przyjeżdża.
    expect(globals).toContain("transform: scale(0.98)");

    // Ten sam ruch obejmuje oba używane pudełka okna.
    expect(globals).toContain(".dialog-backdrop > .dialog-card,");
    expect(globals).toContain(".dialog-backdrop > .ice-surface");
  });

  it("karty w siatce wchodzą z drobnym przesunięciem, nie defiladą", () => {
    const picker = MODALS["media-asset-picker"];

    expect(picker).toContain("animationDelay");
    // Opóźnienie ma sufit — przy 40 plikach ostatni nie może czekać sekundy.
    expect(picker).toContain("Math.min(index, 8) * 14");
  });

  it("wyłączony ruch nie znaczy niewidoczne okno", () => {
    // Blok dotyczący OKIEN, nie ostatni blok w pliku.
    const start = globals.indexOf(".dialog-backdrop > .ice-surface,");
    const reduced = globals.slice(start);

    expect(reduced).toContain(".dialog-backdrop");
    expect(reduced).toContain("animation: none");
    /*
      `both` utrwala klatkę początkową, więc samo `animation: none`
      zostawiłoby okno przezroczyste. Stan końcowy musi być jawny.
    */
    expect(reduced).toContain("opacity: 1");
    expect(reduced).toContain("transform: none");
  });
});

describe("30B: animacje poza zakresem pozostają nietknięte", () => {
  /*
    Ceremonia podium i „Powered by" mają własny, świadomie przesadzony język
    ruchu. Ten pass dotyczy interfejsu roboczego i nie ma prawa ich dotknąć.
  */
  const podium = source("components/playoff/podium-section.tsx");
  const backdrop = source("components/playoff/cinematic-backdrop.tsx");
  const footer = source("components/public/footer-animation.tsx");

  it("kadr kinowy i podium nie korzystają z tokenów okien", () => {
    for (const code of [podium, backdrop, footer]) {
      expect(code).not.toContain("dialog-card");
      expect(code).not.toContain("--motion-dialog-in");
      expect(code).not.toContain("media-card");
    }
  });

  it("podium zachowało własną maszynę stanu i jednorazowość", () => {
    expect(podium).toContain("const alreadySeen =");
    expect(podium).toContain("animateCeremony");
  });

  it("animacja stopki nadal odpala się raz", () => {
    expect(footer).toContain("IntersectionObserver");
    expect(footer).toContain("data-played");
  });
});
