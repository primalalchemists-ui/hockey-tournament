import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { OperationError } from "@/components/admin/operation-error";
import type { OperationIssueReport } from "@/lib/playoff/validation";

/**
 * BLAD WALIDACJI PO LUDZKU.
 *
 * Regresja z recznej proby: administrator zobaczyl "po-B-semifinal-0:
 * brak wyniku" zamiast dwoch konkretnych meczow grupy B.
 */

function issueTeam(name: string, seed: number) {
  return {
    name,
    logoUrl: `https://res.cloudinary.com/demo/${seed}.png`,
    logoText: name.slice(0, 3),
    seed,
  };
}

const REPORT: OperationIssueReport = {
  title: "Nie można zakończyć etapu: półfinały",
  hint: "Uzupełnij wyniki poniższych meczów:",
  matches: [
    {
      groupName: "Grupa B",
      roundLabel: "Półfinały",
      home: issueTeam("UKS Zagłębie Sosnowiec 2", 1),
      away: issueTeam("BS Polonia Bytom 2", 4),
      reason: "missing_result",
    },
    {
      groupName: "Grupa B",
      roundLabel: "Półfinały",
      home: issueTeam("MOSM Tychy Tyskie Lwy 2", 2),
      away: issueTeam("GKS Katowice 2", 3),
      reason: "missing_result",
    },
  ],
};

const html = renderToStaticMarkup(
  <OperationError message="zapasowy tekst" details={REPORT} />
);

describe("Q-V: czytelny blad walidacji", () => {
  it("Q/R: brak identyfikatorow technicznych", () => {
    expect(html).not.toContain("po-B-semifinal-0");
    expect(html).not.toContain("matchId");
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("S: mecze pogrupowane po grupie, naglowek raz", () => {
    expect(html).toContain("Grupa B");
    expect(html.split("Grupa B").length - 1).toBe(1);
    expect(html.split('data-testid="operation-error-match"').length - 1).toBe(2);
  });

  it("T: pelne nazwy obu druzyn", () => {
    expect(html).toContain("UKS Zagłębie Sosnowiec 2");
    expect(html).toContain("BS Polonia Bytom 2");
    expect(html).toContain("MOSM Tychy Tyskie Lwy 2");
    expect(html).toContain("GKS Katowice 2");
  });

  it("U: herby, gdy sa dostepne", () => {
    expect(html).toContain("res.cloudinary.com");
  });

  it("V: na waskim ekranie druzyny ukladaja sie w pionie", () => {
    expect(html).toContain("flex-col");
    expect(html).toContain("sm:flex-row");
    // Dlugie nazwy nie moga rozepchnac okna bledu.
    expect(html).toContain("truncate");
  });

  it("naglowek i podpowiedz pochodza z silnika", () => {
    expect(html).toContain("Nie można zakończyć etapu: półfinały");
    expect(html).toContain("Uzupełnij wyniki poniższych meczów:");
    expect(html).toContain("brak wyniku");
  });

  it("bez struktury pokazuje zwykly komunikat", () => {
    const plain = renderToStaticMarkup(
      <OperationError message="Turniej jest już zakończony." />
    );

    expect(plain).toContain("Turniej jest już zakończony.");
  });

  it("nieznany uczestnik nie wywraca komunikatu", () => {
    const withUnknown = renderToStaticMarkup(
      <OperationError
        message="x"
        details={{
          ...REPORT,
          matches: [
            {
              groupName: "Grupa A",
              roundLabel: "Finał",
              home: null,
              away: null,
              reason: "unknown_participants",
            },
          ],
        }}
      />
    );

    expect(withUnknown).toContain(">?<");
    expect(withUnknown).toContain("nieznani uczestnicy");
  });
});
