import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

// GroupTabs czyta URL — w teście renderu wystarczy atrapa nawigacji.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { GroupTabs } = await import("@/components/group-tabs");
const { scope } = await import("./helpers/view-fixtures");

import type { Group } from "@/types/tournament";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";

const RESULTS_CTA = {
  kind: "results" as const,
  label: "Sprawdź wyniki",
  shine: false,
  targetId: "results-section",
  cinematic: false,
};

const GROUP: Group = {
  key: "A",
  name: "Grupa A",
  teams: [
    { id: "t1", name: "Rekiny", logoText: "REK", sourceOrder: 0 },
    { id: "t2", name: "Wilki", logoText: "WIL", sourceOrder: 1 },
  ],
  matches: [
    {
      id: "m1",
      group: "A",
      homeTeamId: "t1",
      awayTeamId: "t2",
      homeScore: 3,
      awayScore: 1,
    },
  ],
};

function playoffState(
  overrides: Partial<PlayoffStateView> = {}
): PlayoffStateView {
  return {
    format: "group_playoff",
    phase: "semifinal",
    phaseLabel: "Półfinały",
    stage: { label: "Półfinały", tone: "semifinal" },
    groupStageFrozen: true,
    isCompleted: false,
    config: null,
    scopes: [scope()],
    bracketBackgroundUrl: null,
    podiumBackgroundUrl: null,
    completionToken: null,
    ...overrides,
  };
}

describe("J: turniej ligowy nie dostaje ŻADNEGO UI pucharowego", () => {
  const html = renderToStaticMarkup(
    <GroupTabs
      groups={[GROUP]}
      structure="groups"
      playoffState={null}
      tournamentId="t-1"
      celebration={RESULTS_CTA}
    />
  );

  it("renderuje ranking i wyniki", () => {
    expect(html).toContain("Ranking");
    expect(html).toContain("Wyniki");
  });

  it("nie renderuje drabinki, fazy ani podium", () => {
    expect(html).not.toContain("Faza play-off");
    expect(html).not.toContain("Klasyfikacja końcowa");
    expect(html).not.toContain('data-testid="bracket-scroll"');
  });
});

describe("format pucharowy dostaje komplet sekcji", () => {
  const html = renderToStaticMarkup(
    <GroupTabs
      groups={[GROUP]}
      structure="groups"
      playoffState={playoffState()}
      tournamentId="t-1"
      celebration={RESULTS_CTA}
    />
  );

  it("pokazuje fazę, drabinkę i podium jednocześnie", () => {
    expect(html).toContain("Półfinały");
    expect(html).toContain('data-testid="bracket-scroll"');
    expect(html).toContain("Klasyfikacja końcowa");
  });

  it("nie ujawnia UUID-ów w warstwie publicznej", () => {
    expect(html).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });
});

describe("K: prefers-reduced-motion jest obsłużony systemowo", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  it("globalny blok wyłącza animacje wejścia i pulsy", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");

    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(block).toContain(".ice-rise");
    expect(block).toContain(".live-pulse");
    expect(block).toContain(".live-ping");
    expect(block).toContain("animation-duration: 0.01ms !important");
  });

  it("podium respektuje ustawienie systemowe niezależnie od CSS", () => {
    const code = readFileSync(
      new URL("../components/playoff/podium-section.tsx", import.meta.url),
      "utf8"
    );

    expect(code).toContain("prefers-reduced-motion: reduce");
    expect(code).toContain("reducedMotion");
  });
});

describe("L: mechanika ceremonii pozostaje nietknięta", () => {
  const code = readFileSync(
    new URL("../components/playoff/podium-section.tsx", import.meta.url),
    "utf8"
  );

  it("klucz „obejrzane” nadal składa się z turnieju, puli i finalizacji", () => {
    expect(code).toContain("buildPodiumStorageKey({");
    expect(code).toContain("tournamentId,");
    expect(code).toContain("scopeKey,");
    expect(code).toContain("completionToken,");
  });

  it("ceremonia nadal startuje z IntersectionObserver, nie z nadejścia danych", () => {
    expect(code).toContain("new IntersectionObserver");
    // Próg dobrany tak, żeby wysoka sekcja też potrafiła go osiągnąć.
    expect(code).toContain("shouldStartOnViewport");
    expect(code).toContain("threshold: [0,");
  });

  it("„obejrzane” zapisujemy dopiero po pełnej ceremonii", () => {
    expect(code).toContain("getRevealTotalMs(revealOrder)");
    // markSeen zapisuje i ogłasza koniec ceremonii przyciskowi celebracji.
    expect(code).toContain("markRevealSeen(key)");
    expect(code).toContain("markSeen();");
  });
});

describe("po intro strona jest spokojna", () => {
  it("zakładki turnieju nie animują pierwszego wejścia treści", () => {
    const code = readFileSync(
      new URL("../components/tournament-shell.tsx", import.meta.url),
      "utf8"
    );

    // Animujemy PRZEŁĄCZANIE, nie pierwsze pojawienie się strony.
    expect(code).toContain('<AnimatePresence mode="wait" initial={false}>');
  });

  it("zmiana grupy przechodzi jako jeden blok, bez animacji na starcie", () => {
    const code = readFileSync(
      new URL("../components/group-tabs.tsx", import.meta.url),
      "utf8"
    );

    /*
      Grupy przeszły z AnimatePresence na własny, sterowany stan przejścia:
      pierwsza faza to „idle", więc pierwszy render nie animuje niczego,
      a wejście pojawia się dopiero po realnym kliknięciu użytkownika.
      Patrz tests/group-transition.test.tsx.
    */
    expect(code).toContain("useGroupTransition(activeGroup)");
    expect(code).toContain("<GroupTransition phase={groupPhase}");
    expect(code).not.toContain("AnimatePresence");
  });

  it("nagłówek wchodzi jednym ruchem, nie elementem po elemencie", () => {
    const code = readFileSync(
      new URL("../components/tournament-header.tsx", import.meta.url),
      "utf8"
    );

    expect(code).toContain("ice-rise");
    // Zero indywidualnych opóźnień dzieci nagłówka.
    expect(code).not.toContain("delay");
    expect(code).not.toContain("motion.");
  });

  it("banner campa wchodzi jako jeden blok", () => {
    const code = readFileSync(
      new URL("../components/camp-banner.tsx", import.meta.url),
      "utf8"
    );

    // Jedyny motion wrapper wejścia to sama sekcja (plus flip licznika).
    expect(code.match(/whileInView/g) ?? []).toHaveLength(1);
    expect(code).not.toContain("delay:");
  });
});

describe("V/W: etap turnieju mieszka przy Rankingu", () => {
  const html = renderToStaticMarkup(
    <GroupTabs
      groups={[GROUP]}
      structure="groups"
      playoffState={playoffState()}
      tournamentId="t-1"
      celebration={RESULTS_CTA}
    />
  );

  it("V: plakietka etapu jest w nagłówku Rankingu", () => {
    expect(html).toContain('data-testid="stage-badge"');
    expect(html).toContain("Etap turnieju: Półfinały");

    // Plakietka stoi przed tabelą, w tej samej karcie co tytuł „Ranking".
    const ranking = html.indexOf("Ranking");
    const badge = html.indexOf('data-testid="stage-badge"');
    const table = html.indexOf("<table");

    expect(ranking).toBeLessThan(badge);
    expect(badge).toBeLessThan(table);
  });

  it("W: osobna karta fazy zniknęła z układu", () => {
    expect(html).not.toContain("Aktualna faza");
    expect(html).not.toContain("AKTUALNA FAZA");
  });

  it("ton plakietki odpowiada etapowi", () => {
    expect(html).toContain("stage-semifinal");
  });

  it("liga nie dostaje sztucznej plakietki etapu", () => {
    const league = renderToStaticMarkup(
      <GroupTabs
        groups={[GROUP]}
        structure="groups"
        playoffState={null}
        tournamentId="t-1"
        celebration={RESULTS_CTA}
      />
    );

    expect(league).not.toContain('data-testid="stage-badge"');
  });
});

describe("tabela bez rozegranych meczów", () => {
  it("pokazuje znaki zapytania zamiast miejsc i medali", () => {
    const html = renderToStaticMarkup(
      <GroupTabs
        groups={[
          {
            ...GROUP,
            // Turniej rozpisany, ale jeszcze nierozegrany.
            matches: [],
          },
        ]}
        structure="groups"
        playoffState={playoffState()}
        tournamentId="t-1"
        celebration={RESULTS_CTA}
      />
    );

    expect(html).toContain("Miejsce zostanie wyłonione po pierwszych meczach");
    expect(html).not.toContain("gold.png");
    expect(html).not.toContain("silver.png");
    expect(html).not.toContain("bronze.png");
  });

  it("po pierwszym wyniku miejsca i medale wracają", () => {
    const html = renderToStaticMarkup(
      <GroupTabs
        groups={[GROUP]}
        structure="groups"
        playoffState={playoffState()}
        tournamentId="t-1"
        celebration={RESULTS_CTA}
      />
    );

    expect(html).toContain("gold.png");
    expect(html).not.toContain("Miejsce zostanie wyłonione");
  });
});
