import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlayoffMatchRow } from "@/components/admin/playoff-match-row";
import type { BracketTeamView } from "@/lib/data/postgres/playoff-engine";
import type { MatchEditability } from "@/lib/playoff/editability";

/**
 * CZYTELNOSC ROZSTRZYGNIETEGO MECZU.
 *
 * Sam zapis "2 : 3" kazal analizowac cyfry. Zwyciezca dostaje delikatna
 * zielona obwodke, a wyniki - kolory: zielony i czerwony.
 */

function team(name: string): BracketTeamView {
  return {
    teamId: name.toLowerCase(),
    name,
    logoUrl: null,
    logoText: name.slice(0, 3),
    seed: null,
  };
}

function render(options: {
  homeScore: number | null;
  awayScore: number | null;
  editability?: MatchEditability;
}) {
  return renderToStaticMarkup(
    <PlayoffMatchRow
      tournamentId="t1"
      match={{
        externalId: "po-A-semifinal-0",
        home: team("Alfa"),
        away: team("Beta"),
        homeLabel: "Zwycięzca 1",
        awayLabel: "Zwycięzca 2",
        homeScore: options.homeScore,
        awayScore: options.awayScore,
        editability: options.editability ?? "completed",
      }}
    />
  );
}

/** Wyciaga znaczniki stron w kolejnosci: gospodarz, gosc. */
function outcomes(html: string): string[] {
  return [...html.matchAll(/data-outcome="([a-z]+)"/g)].map(
    (match) => match[1]
  );
}

describe("AD-AL: zwyciezca i przegrany", () => {
  it("AD: wygrana lewej strony podswietla lewa strone", () => {
    const html = render({ homeScore: 3, awayScore: 1 });

    expect(outcomes(html)).toEqual(["win", "loss"]);
    expect(html).toContain("border-emerald-300");
    expect(html).toContain("bg-emerald-50/70");
  });

  it("AE: wygrana prawej strony podswietla prawa strone", () => {
    const html = render({ homeScore: 1, awayScore: 3 });

    // Zero zalozen o gospodarzu - liczy sie wylacznie wynik.
    expect(outcomes(html)).toEqual(["loss", "win"]);
  });

  it("AF/AG/AH: wyniki dostaja kolor i sa wyrazniejsze", () => {
    const html = render({ homeScore: 2, awayScore: 3 });

    const home = html.slice(html.indexOf('data-testid="score-home-value"'));
    const away = html.slice(html.indexOf('data-testid="score-away-value"'));

    // Przegrany na czerwono, zwyciezca na zielono - te same tokeny co matryca.
    expect(home.slice(0, 120)).toContain("text-rose-700");
    expect(away.slice(0, 120)).toContain("text-emerald-700");
    expect(html).toContain("font-bold");
  });

  it("AI: przegrany NIE dostaje czerwonej obwodki", () => {
    const html = render({ homeScore: 1, awayScore: 4 });

    expect(html).not.toContain("border-rose");
    expect(html).not.toContain("bg-rose-50");
  });

  it("AJ: mecz bez wyniku pozostaje neutralny", () => {
    const html = render({ homeScore: null, awayScore: null });

    expect(outcomes(html)).toEqual(["neutral", "neutral"]);
    expect(html).not.toContain("border-emerald-300");
  });

  it("AK: remis nie wylania falszywego zwyciezcy", () => {
    const html = render({ homeScore: 2, awayScore: 2 });

    expect(outcomes(html)).toEqual(["neutral", "neutral"]);
    expect(html).not.toContain("text-emerald-700");
  });

  it("AL/32: stan czytelnosci dziala takze w wierszu edytowalnym", () => {
    const html = render({ homeScore: 5, awayScore: 2, editability: "editable" });

    // To jest czytelnosc, a nie sygnal edycji - dziala w obu trybach.
    expect(outcomes(html)).toEqual(["win", "loss"]);
    expect(html).toContain('data-testid="playoff-save"');
  });
});
