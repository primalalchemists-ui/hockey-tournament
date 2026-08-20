import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CampBanner } from "@/components/camp-banner";
import {
  CAMP_DEFAULT_TITLE,
  describeCamp,
  isValidRegistrationUrl,
} from "@/lib/public/camp";

/**
 * USTAWIENIA CAMPU.
 *
 * Administrator ustala napis nad licznikiem i decyduje, czy zapisy sa
 * otwarte. Przy zamknietych zapisach przycisk „Zapisz sie" zostaje
 * w kompozycji, ale przestaje byc linkiem.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const FUTURE = "2027-01-01T10:00";

function render(props: {
  campTitle?: string;
  registrationEnabled?: boolean;
  signupLink?: string;
}) {
  return renderToStaticMarkup(
    <CampBanner
      date={FUTURE}
      campTitle={props.campTitle}
      registrationEnabled={props.registrationEnabled}
      signupLink={props.signupLink}
    />
  );
}

describe("A-C: naglowek sekcji", () => {
  it("A: brak wlasnego tytulu = dotychczasowy napis", () => {
    expect(describeCamp({}).title).toBe(CAMP_DEFAULT_TITLE);
    expect(render({})).toContain(CAMP_DEFAULT_TITLE);
  });

  it("B/C: wlasny tytul trafia na strone doslownie", () => {
    const html = render({ campTitle: "Zapisy od 31.08" });

    expect(html).toContain('data-testid="camp-title"');
    expect(html).toContain("Zapisy od 31.08");
    expect(html).not.toContain(CAMP_DEFAULT_TITLE);
  });

  it("same spacje traktujemy jak brak tytulu", () => {
    expect(describeCamp({ title: "   " }).title).toBe(CAMP_DEFAULT_TITLE);
  });

  it("napis nie jest juz zaszyty w komponencie", () => {
    const banner = source("components/camp-banner.tsx");

    expect(banner).toContain("{camp.title}");
    expect(banner).not.toMatch(/>\s*Najbliższy camp\s*</);
  });
});

describe("D-I: zapisy otwarte i zamkniete", () => {
  const url = "https://festiwalhokeja.pl/zapisy";

  it("D: wlaczone zapisy z poprawnym adresem = aktywny przycisk", () => {
    const camp = describeCamp({ registrationEnabled: true, registrationUrl: url });

    expect(camp.canRegister).toBe(true);
    expect(camp.registrationUrl).toBe(url);

    const html = render({ registrationEnabled: true, signupLink: url });

    expect(html).toContain('data-enabled="true"');
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("E/F: zamkniete zapisy zostawiaja przycisk, ale bez nawigacji", () => {
    const html = render({ registrationEnabled: false, signupLink: url });

    // Przycisk nadal jest czescia kompozycji...
    expect(html).toContain("Zapisz się");
    expect(html).toContain('data-enabled="false"');
    expect(html).toContain('aria-disabled="true"');

    // ...ale nie jest linkiem, wiec nie da sie go kliknac ani wytabowac.
    expect(html).not.toContain(`href="${url}"`);
    expect(html).toContain("camp-signup-closed");
  });

  it("E: zamkniety przycisk nie znika i nie jest przezroczysty", () => {
    const css = source("app/globals.css");
    const start = css.indexOf(".camp-signup-closed {");
    const block = css.slice(start, css.indexOf("}", start));

    expect(block).toContain("cursor: not-allowed");
    expect(block).not.toContain("opacity");
    expect(block).not.toContain("display: none");
  });

  it("G/H: wylaczenie nie kasuje zapisanego adresu", () => {
    const repository = source("lib/data/postgres/repository.ts");

    // Zapis przepisuje adres niezaleznie od stanu wlacznika.
    expect(repository).toContain("campSignupLink: tournament.campSignupLink");
    expect(repository).toContain(
      "campRegistrationEnabled: tournament.campRegistrationEnabled ?? true"
    );

    // Ponowne wlaczenie korzysta z tego samego adresu.
    expect(
      describeCamp({ registrationEnabled: true, registrationUrl: url }).registrationUrl
    ).toBe(url);
  });

  it("I: niepoprawny adres nie moze trafic do linku", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "zapisy.pl",
      "",
      "   ",
    ]) {
      expect(isValidRegistrationUrl(bad)).toBe(false);
      expect(
        describeCamp({ registrationEnabled: true, registrationUrl: bad }).canRegister
      ).toBe(false);
    }

    expect(isValidRegistrationUrl("http://example.com")).toBe(true);
    expect(isValidRegistrationUrl("https://example.com/x?y=1")).toBe(true);
  });

  it("I: panel pokazuje czytelny komunikat po polsku", () => {
    const admin = source("components/admin/admin-shell.tsx");

    expect(admin).toContain("CAMP_URL_ERROR");
    expect(source("lib/public/camp.ts")).toContain(
      "Podaj poprawny link do zapisów."
    );
  });
});

describe("panel: ustawienia campu", () => {
  const admin = source("components/admin/admin-shell.tsx");

  it("ma naglowek, wlacznik i warunkowe pole adresu", () => {
    expect(admin).toContain("Ustawienia campu");
    expect(admin).toContain("Nagłówek sekcji");
    expect(admin).toContain("Zapisy na camp są aktywne");
    expect(admin).toContain('data-testid="camp-registration-toggle"');

    // Pole adresu istnieje wylacznie przy wlaczonych zapisach.
    expect(admin).toContain("{campRegistrationEnabled ? (");
  });

  it("J: zmiana ustawien campu bumpuje publiczna rewizje", () => {
    const repository = source("lib/data/postgres/repository.ts");

    // Camp jedzie tym samym zapisem co reszta draftu panelu.
    expect(repository).toContain("bumpPublicRevisionStatement");
  });
});
