import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlayoffMatchRow } from "@/components/admin/playoff-match-row";
import type { BracketTeamView } from "@/lib/data/postgres/playoff-engine";
import type { MatchEditability } from "@/lib/playoff/editability";

/**
 * PANEL ADMINA - kontrakt renderu wiersza meczu.
 *
 * Dwie rzeczy z recznej proby generalnej: mecz spoza biezacego etapu nie
 * moze miec inputow, a wiersz ma pokazywac druzyny zamiast etykiet slotow
 * w rodzaju "Miejsce 1 w grupie".
 */

function team(name: string, seed: number | null, logo = true): BracketTeamView {
  return {
    teamId: name.toLowerCase(),
    name,
    logoUrl: logo ? `https://res.cloudinary.com/demo/${seed}.png` : null,
    logoText: name.slice(0, 3),
    seed,
  };
}

function renderRow(overrides: {
  editability: MatchEditability;
  home?: BracketTeamView | null;
  away?: BracketTeamView | null;
  homeScore?: number | null;
  awayScore?: number | null;
}) {
  return renderToStaticMarkup(
    <PlayoffMatchRow
      tournamentId="t1"
      match={{
        externalId: "po-A-semifinal-0",
        home: overrides.home === undefined ? team("UKS Zagłębie Sosnowiec 1", 1) : overrides.home,
        away: overrides.away === undefined ? team("GKS Katowice 1", 4) : overrides.away,
        homeLabel: "Zwycięzca półfinału 1",
        awayLabel: "Zwycięzca półfinału 2",
        homeScore: overrides.homeScore ?? null,
        awayScore: overrides.awayScore ?? null,
        editability: overrides.editability,
      }}
    />
  );
}

describe("L-P: druzyny zamiast etykiet slotow", () => {
  const html = renderRow({ editability: "editable" });

  it("L: wiersz pokazuje pelne nazwy druzyn", () => {
    expect(html).toContain("UKS Zagłębie Sosnowiec 1");
    expect(html).toContain("GKS Katowice 1");
    expect(html).not.toContain("Miejsce 1 w grupie");
  });

  it("M: herby sa renderowane, gdy druzyna je ma", () => {
    expect(html).toContain('data-testid="admin-team-logo"');
    expect(html).toContain("res.cloudinary.com");
  });

  it("N: rozstawienie jest malym badgem obok nazwy, nie zamiast niej", () => {
    expect(html).toContain('data-testid="admin-team-seed"');
    expect(html).toContain(">1<");
    expect(html).toContain(">4<");
  });

  it("O: znani uczestnicy przyszlego meczu tez maja nazwy", () => {
    const pending = renderRow({ editability: "pending" });

    expect(pending).toContain("UKS Zagłębie Sosnowiec 1");
    expect(pending).toContain("GKS Katowice 1");
  });

  it("P: nieznany uczestnik to czyste znaki zapytania", () => {
    const unknown = renderRow({
      editability: "pending",
      home: null,
      away: null,
    });

    expect(unknown).toContain('data-testid="admin-team-unknown"');
    expect(unknown).toContain(">?<");

    // Semantyka slotu zostaje wylacznie dla czytnika ekranu.
    expect(unknown).toContain('aria-label="Zwycięzca półfinału 1"');
    expect(unknown).not.toMatch(/>Zwycięzca półfinału 1</);
  });

  it("druzyna bez herbu pokazuje skrot nazwy", () => {
    const noLogo = renderRow({
      editability: "editable",
      home: team("Sandecja Nowy Sącz", 2, false),
    });

    expect(noLogo).toContain("San");
  });
});

describe("I-K: inputy tylko dla biezacego etapu", () => {
  it("J: przyszly mecz nie ma inputow ani przycisku zapisu", () => {
    const html = renderRow({ editability: "pending" });

    expect(html).toContain('data-editability="pending"');
    expect(html).not.toContain('data-testid="score-home"');
    expect(html).not.toContain('data-testid="playoff-save"');
    expect(html).toContain('data-testid="score-readonly"');
  });

  it("K: rozegrana runda pokazuje wynik bez przycisku", () => {
    const html = renderRow({
      editability: "completed",
      homeScore: 4,
      awayScore: 1,
    });

    expect(html).not.toContain('data-testid="playoff-save"');
    // Wynik rozbity na osobne liczby, zeby dalo sie je pokolorowac.
    expect(html).toContain('data-testid="score-home-value"');
    expect(html).toContain(">4<");
    expect(html).toContain(">1<");
  });

  it("I: biezacy etap ma inputy i przycisk", () => {
    const html = renderRow({ editability: "editable" });

    expect(html).toContain('data-testid="score-home"');
    expect(html).toContain('data-testid="score-away"');
    expect(html).toContain('data-testid="playoff-save"');
  });

  it("faza grupowa: drabinka jest wylacznie podgladem", () => {
    const html = renderRow({ editability: "locked", home: null, away: null });

    expect(html).not.toContain('data-testid="playoff-save"');
  });
});

describe("W/AA/AB: przycisk zapisu w renderze", () => {
  it("W: zapisany wynik startuje w stanie Zapisano", () => {
    const html = renderRow({
      editability: "editable",
      homeScore: 3,
      awayScore: 1,
    });

    expect(html).toContain('data-state="saved"');
    expect(html).toContain("Zapisano");
    expect(html).toContain("disabled");
  });

  it("AA: wymiary przycisku sa stale niezaleznie od stanu", () => {
    const empty = renderRow({ editability: "editable" });
    const saved = renderRow({
      editability: "editable",
      homeScore: 2,
      awayScore: 0,
    });

    // Ta sama klasa min-w i wysokosc w kazdym stanie - zero skokow layoutu.
    for (const html of [empty, saved]) {
      expect(html).toContain("min-w-[8.5rem]");
      expect(html).toContain("h-9");
    }
  });

  it("AB: nigdzie nie pojawiaja sie trzy kropki", () => {
    const html = renderRow({ editability: "editable" });

    expect(html).not.toContain(">...<");
  });
});
