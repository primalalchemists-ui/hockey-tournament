import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import { StandingsTable } from "@/components/standings-table";
import { COLUMN_HELP, STANDINGS_COLUMNS } from "@/lib/public/column-help";
import type { StandingRow } from "@/types/tournament";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const ROW: StandingRow = {
  teamId: "t1",
  teamName: "Rekiny",
  position: 1,
  played: 3,
  wins: 2,
  draws: 1,
  losses: 0,
  points: 7,
  goalsFor: 9,
  goalsAgainst: 3,
  goalDifference: 6,
  isTieUnresolved: false,
  sourceOrder: 0,
};

describe("A: intro nie dotyka przewijania dokumentu", () => {
  const code = source("components/logo-intro.tsx");

  it("nie ustawia overflow na body ani html", () => {
    expect(code).not.toMatch(/document\.(body|documentElement)/);
    expect(code).not.toMatch(/overflow\s*[:=]/);
  });

  it("jest wyłącznie nakładką, nie blokuje interakcji", () => {
    expect(code).toContain("pointer-events-none");
    expect(code).toContain("fixed inset-0");
  });
});

describe("B: pasek przewijania jest zarezerwowany i ostylowany", () => {
  const css = source("app/globals.css");
  const htmlRule = css.slice(css.indexOf("html {"), css.indexOf("body {"));

  it("gutter jest stabilny od pierwszego paintu", () => {
    expect(htmlRule).toContain("scrollbar-gutter: stable");
    expect(htmlRule).toContain("overflow-y: scroll");
  });

  it("ma wygląd lodowy w obu silnikach", () => {
    // Firefox
    expect(htmlRule).toContain("scrollbar-color");
    // WebKit / Blink
    expect(css).toContain("html::-webkit-scrollbar-thumb");
    expect(css).toContain("html::-webkit-scrollbar-track");
  });
});

describe("C: intro to dokładnie trzy spokojne pulsy", () => {
  const code = source("components/logo-intro.tsx");

  it("ma trzy cykle i mieści się w ~2 s", () => {
    const cycles = Number(code.match(/PULSE_CYCLES = (\d+)/)?.[1]);
    const cycleMs = Number(code.match(/PULSE_CYCLE_MS = (\d+)/)?.[1]);
    const fadeMs = Number(code.match(/FADE_MS = (\d+)/)?.[1]);

    expect(cycles).toBe(3);

    const total = cycles * cycleMs + fadeMs;

    expect(total).toBeGreaterThanOrEqual(1700);
    expect(total).toBeLessThanOrEqual(2100);
  });

  it("logo jest wyraźnie większe niż wcześniejsze 96 px", () => {
    expect(code).toContain("h-28 w-auto sm:h-36");
  });

  it("przy prefers-reduced-motion intro praktycznie nie istnieje", () => {
    expect(code).toContain("reduced ? 0");
  });
});

describe("D/E/F: pomoc kolumn zamiast bloku legendy", () => {
  const html = renderToStaticMarkup(
    <StandingsTable groupKey="A" groupName="Grupa A" rows={[ROW]} />
  );

  it("D: osobny blok legendy zniknął z layoutu", () => {
    expect(html).not.toContain("Legenda");
    // Opis istnieje wylacznie jako etykieta dostepnosci przy skrocie,
    // nie jako osobny widoczny wiersz listy pod tabela.
    expect(html).not.toContain(">Mecze rozegrane<");
    expect(html).toContain('aria-label="M — Mecze rozegrane"');
  });

  it("E: mapa opisów pokrywa wszystkie skróty tabeli", () => {
    expect(STANDINGS_COLUMNS).toEqual(["M", "W", "R", "P", "Pkt", "G+", "G-", "Bil."]);

    for (const code of STANDINGS_COLUMNS) {
      expect(COLUMN_HELP[code]).toBeTruthy();
      expect(COLUMN_HELP[code].length).toBeGreaterThan(3);
    }
  });

  it("F: każdy skrót jest prawdziwym przyciskiem, nie samym hoverem", () => {
    const triggers = html.match(/data-testid="column-help"/g) ?? [];

    expect(triggers).toHaveLength(STANDINGS_COLUMNS.length);
    expect(html).toContain('type="button"');
    // Opis dociera do czytnika ekranu bez otwierania podpowiedzi.
    expect(html).toContain('aria-label="Pkt — Punkty"');
    expect(html).toContain('aria-label="Bil. — Różnica bramek"');
  });

  it("F: skróty są wyśrodkowane w nagłówkach", () => {
    const headerRow = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    const centered = headerRow.match(/text-center/g) ?? [];

    expect(centered.length).toBeGreaterThanOrEqual(STANDINGS_COLUMNS.length);
  });
});

describe("6: krawędź rankingu na telefonie", () => {
  const html = renderToStaticMarkup(
    <StandingsTable groupKey="A" groupName="Grupa A" rows={[ROW]} />
  );

  it("tabela żyje we własnym kontrolowanym scrollerze", () => {
    expect(html).toContain('data-testid="edge-scroller"');
    expect(html).toContain("overflow-x-auto");
  });

  it("maska krawędzi znika, gdy nie ma już czego przewijać", () => {
    const css = source("app/globals.css");

    expect(css).toContain(".edge-scroller.fade-end");
    expect(css).toContain(".edge-scroller.fade-start");

    const code = source("components/ui/edge-scroller.tsx");

    // Klasa wygaszenia zależy od realnej pozycji przewijania.
    expect(code).toContain("scrollWidth - node.clientWidth");
    expect(code).toContain("atEnd");
  });
});

describe("G: kolumna drużyn nie może drgać", () => {
  const code = source("components/match-matrix.tsx");
  const css = source("app/globals.css");

  it("nie używa już position: sticky ani sztuczek kompozytora", () => {
    // Sticky w komorkach tabeli drgalo mimo kolejnych poprawek —
    // kolumna nazw jest teraz NIERUCHOMA nakladka.
    // Sam komentarz moze wspominac o sticky; licza sie klasy.
    const classNames = code.match(/className={?"[^"]*"/g) ?? [];

    expect(classNames.some((value) => value.includes("sticky"))).toBe(false);
    expect(code).not.toContain("position: sticky");
    expect(code).not.toContain("translateZ");
    expect(code).not.toContain("will-change");
    expect(code).not.toContain("backface-visibility");
  });

  it("nakładka jest jedyną widoczną i klikalną kolumną nazw", () => {
    expect(code).toContain('data-testid="matrix-name-column"');
    // Semantykę wiersza niesie ukryty nagłówek w tabeli, nie nakładka.
    expect(code).toContain('scope="row"');
  });

  it("wysokości nakładki i wierszy tabeli pochodzą z tych samych stałych", () => {
    expect(code).toContain("HEAD_HEIGHT_REM");
    expect(code).toContain("ROW_HEIGHT_REM");
    // Kazda stala uzyta po obu stronach: w tabeli i w nakladce.
    expect(code.match(/HEAD_HEIGHT_REM/g) ?? []).toHaveLength(3);
    expect(code.match(/ROW_HEIGHT_REM/g) ?? []).toHaveLength(3);
  });

  it("wiersze z nazwami są nieprzezroczyste — bez poświaty pod spodem", () => {
    const rows = css.slice(
      css.indexOf(".matrix-name-cell {"),
      css.indexOf(".btn {")
    );

    // Zadnej alfy w wierszach: przewijana tresc nie moze przebijac
    // przez logo i nazwe druzyny.
    expect(rows).not.toContain("rgba(");
    expect(rows).not.toContain("backdrop-filter");
    expect(rows).not.toContain("box-shadow");
    expect(rows).not.toContain("border");
  });

  it("cała kolumna jest ścianą — również górne pole", () => {
    const head = css.slice(
      css.indexOf(".matrix-name-head {"),
      css.indexOf(".matrix-name-cell {")
    );

    // Prześwitujące herby wprowadzały szum wizualny, nie informację.
    expect(head).not.toContain("rgba(");
  });

  it("nakładka jest o piksel szersza niż kolumna tabeli", () => {
    // Bez tego przy pierwszym przesunieciu widac pasek przewijanej tresci.
    expect(code).toContain("NAME_COLUMN_OVERLAY_STYLE");
    expect(code).toContain("rem + 1px");
  });

  it("karta z tabelą nie rozmywa tła", () => {
    expect(code).toContain("ice-card-solid");

    const rule = css.slice(
      css.indexOf(".ice-card-solid {"),
      css.indexOf(".matrix-table {")
    );

    expect(rule).not.toContain("backdrop-filter");
  });
});

describe("H/I: hero", () => {
  const code = source("components/tournament-header.tsx");

  it("H: banner wypełnia kadr na każdym breakpoincie", () => {
    expect(code).toContain('aspect-[16/7]');
    expect(code).toContain('className="object-cover"');
    // Bez wysokiej jakosci optymalizator zmiekczal stylizowany tekst.
    expect(code).toContain("quality={95}");
    // Zadnego contain ani drugiej, rozmytej warstwy.
    expect(code).not.toContain("object-contain");
    expect(code).not.toContain("hero-backdrop");
    expect(code).not.toContain("blur-2xl");
  });

  it("H: proporcje sa stale, wiec hero nie przesuwa tresci", () => {
    expect(code).not.toContain("aspect-[3/2]");
    expect(code).not.toContain("aspect-[16/9]");
  });

  it("I: hero nie wciąga już nawigacji pod siebie", () => {
    // Ujemny margines nagłówka nakładał treść na banner.
    expect(code).not.toContain("-mb-10");
    expect(code).toContain('className="ice-rise space-y-6 md:mb-4"');
  });
});

describe("J: przyciski bez tandetnych efektów", () => {
  const css = source("app/globals.css");
  const files = [
    "components/tournament-header.tsx",
    "components/camp-banner.tsx",
    "components/tournament-shell.tsx",
    "components/group-tabs.tsx",
    "components/ShareTableButton.tsx",
    "components/admin/playoff-asset-manager.tsx",
  ];

  it.each(files)("%s nie podnosi ani nie skaluje kontrolek", (file) => {
    const code = source(file);

    expect(code).not.toMatch(/hover:-?translate|hover:scale|whileHover|active:scale/);
  });

  it("wspólny styl przycisku zmienia tylko kolory, obwódkę i cień", () => {
    // Caly blok przyciskow: od naglowka sekcji do nastepnej sekcji CSS.
    const rule = css.slice(
      css.indexOf(".btn {"),
      css.indexOf("OBJASNIENIA SKROTOW KOLUMN")
    );

    expect(rule).not.toContain("transform");
    expect(rule).toContain("min-height: 2.75rem");
    expect(rule).toContain("box-shadow");
  });

  it("focus-visible jest globalny i widoczny", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 2px solid var(--accent)");
  });
});

describe("krawędź rankingu nie pokazuje połówek kolumn", () => {
  const css = source("app/globals.css");

  it("wygaszenie kończy się przed samą krawędzią", () => {
    const rule = css.slice(
      css.indexOf(".edge-scroller.fade-end {"),
      css.indexOf(".edge-scroller.fade-start {")
    );

    // Ostatni pasek jest CALKOWICIE przezroczysty, wiec wchodzaca
    // kolumna nie wystaje przy brzegu.
    expect(rule).toContain("transparent calc(100% - 0.75rem)");
    expect(rule).not.toContain("transparent 100%");
  });

  it("maska znika, gdy nie ma już czego przewijać", () => {
    const code = source("components/ui/edge-scroller.tsx");

    expect(code).toContain("atEnd ?");
    expect(code).toContain("fade-end");
  });
});

describe("pełna szerokość na telefonie", () => {
  const css = source("app/globals.css");

  it("strona publiczna i panel mają ten sam kontener", () => {
    const publicPage = source("app/page.tsx");
    const adminPage = source("app/admin/page.tsx");
    const container = 'max-w-[1400px] px-0 py-4 sm:px-4 sm:py-6 lg:px-6';

    expect(publicPage).toContain(container);
    expect(adminPage).toContain(container);
  });

  it("nawigacja też idzie na całą szerokość, bez zaokrągleń", () => {
    const shell = source("components/tournament-shell.tsx");
    const groups = source("components/group-tabs.tsx");

    expect(shell).toContain("ice-panel flush-card");
    expect(groups).toContain("ice-panel flush-card");
  });

  it("panel nie zostawia zaokrągleń z utility Tailwinda", () => {
    const admin = source("components/admin/admin-shell.tsx");

    // rounded-3xl z warstwy utilities wygrywalo z .flush-card,
    // wiec w panelu musi byc responsywne.
    expect(admin).not.toContain("ice-surface flush-card rounded-3xl");
    expect(admin).toContain("ice-surface flush-card sm:rounded-3xl");
  });

  it("pasek herbów w panelu ma ten sam ton co front", () => {
    const admin = source("components/admin/editable-match-matrix.tsx");
    const front = source("components/match-matrix.tsx");
    const strip = "bg-[var(--surface-head)] px-2 py-3 text-center font-semibold";

    expect(front).toContain(strip);
    expect(admin).toContain(strip);
  });

  it("karty schodzą do krawędzi tylko poniżej breakpointu sm", () => {
    // Regula zyje na koncu warstwy komponentow — kolejnosc ma znaczenie.
    const rule = css.slice(css.indexOf("@media (max-width: 639px)"));

    expect(rule).toContain(".flush-card");
    expect(rule).toContain("border-radius: 0");
    expect(rule).toContain("border-left-width: 0");
  });

  it("nic nie wystaje poza viewport ujemnym marginesem", () => {
    const files = [
      "components/tournament-header.tsx",
      "components/top-scorer-ticker.tsx",
    ];

    for (const file of files) {
      const code = source(file);

      expect(code).not.toMatch(/-m[xlr]-[0-9]/);
    }
  });

  it("panel wpisywania wyników przesuwa się jak front", () => {
    const admin = source("components/admin/editable-match-matrix.tsx");

    expect(admin).toContain('data-testid="matrix-name-column"');
    expect(admin).toContain("NAME_COLUMN_OVERLAY_STYLE");
    expect(admin).toContain("matrix-name-cell");
  });
});

describe("panel — układ i modal ustawień", () => {
  const shell = source("components/admin/admin-shell.tsx");
  const modal = source("components/admin/tournament-settings-panel.tsx");
  const selector = source("components/admin/tournament-selector.tsx");

  it("na telefonie akcje wskakują na samą górę kolumny", () => {
    // Kolejnosc w kodzie sluzy desktopowi; na telefonie decyduje `order`.
    expect(shell).toContain("order-first flex flex-col gap-2 lg:order-none");
    expect(shell).toContain("flex flex-col gap-3 lg:flex-row");
  });

  it("na desktopie wszystko mieści się w jednej linii", () => {
    // Lewa strona: tozsamosc i operacje. Prawa: akcje zapisu.
    expect(shell).toContain("lg:flex-row lg:flex-nowrap");
    expect(shell).toContain("lg:items-center lg:justify-between");
    // Rzedy selektora rozpuszczaja sie w te linie.
    expect(selector).toContain("lg:contents");
  });

  it("opis konfiguracji stoi po selektorze, przed tytułem", () => {
    const tournament = shell.indexOf("<TournamentSelector");
    const summary = shell.indexOf("describeSettings(settings)");
    const title = shell.indexOf("<EditableTournamentHeader");

    expect(tournament).toBeLessThan(summary);
    expect(summary).toBeLessThan(title);
  });

  it("na telefonie rzędy trzymają się lewej krawędzi", () => {
    // Zadnego wysrodkowania — naglowek ma sie zgadzac z tytulem nizej.
    expect(selector).not.toContain("justify-center");
    expect(shell).not.toContain("items-center gap-3 sm:flex-row");
  });

  it("operacje na turnieju stoją w jednym rzędzie pod selektorem", () => {
    expect(selector).toContain("extraActions");
    // Archiwizuj i Ustawienia w tym samym rzedzie.
    expect(selector.indexOf("Archiwizuj")).toBeLessThan(
      selector.indexOf("{extraActions}")
    );
  });

  it("ustawienia otwierają się jako pełny ekran na telefonie", () => {
    expect(modal).toContain('data-testid="settings-modal"');
    expect(modal).toContain("fixed inset-0");
    expect(modal).toContain("items-stretch justify-center sm:items-center");
    // Zadnego dymka przyczepionego do przycisku.
    expect(modal).not.toContain("absolute right-0 top-full");
  });

  it("na desktopie to wyśrodkowany modal na rozmytym tle", () => {
    expect(modal).toContain("backdrop-blur-sm");
    expect(modal).toContain("sm:w-[34rem]");
    expect(modal).toContain("sm:rounded-3xl");
  });

  it("modal jest dostępny: rola, etykieta i Escape", () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.key === "Escape"');
  });
});

describe("wpisywanie wyników", () => {
  const admin = source("components/admin/editable-match-matrix.tsx");

  it("edytowalna jest DOLNA połowa matrixa", () => {
    expect(admin).toContain("const isEditable = rowIndex > colIndex;");
    expect(admin).not.toContain("rowIndex < colIndex");
  });

  it("tabela wyników nie jest zaokrąglona na telefonie", () => {
    const front = source("components/match-matrix.tsx");
    const flush = "flush-card rounded-none sm:rounded-3xl";

    expect(front).toContain(flush);
    expect(admin).toContain(flush);
  });
});

describe("spójny rytm nagłówków sekcji", () => {
  const css = source("app/globals.css");

  it("nagłówek karty ma jedną wysokość niezależnie od przycisku", () => {
    const rule = css.slice(
      css.indexOf(".ice-card-head {"),
      css.indexOf(".section-title {")
    );

    // Wysokosc musi pomiescic przycisk .btn (2.75rem) razem z paddingiem,
    // zeby „Ranking + Udostepnij" i samo „Wyniki" mialy identyczna wysokosc.
    expect(rule).toContain("min-height: 4.25rem");
    expect(rule).toContain("padding: 0.75rem 1rem");
    expect(rule).toContain("justify-content: center");
  });

  it("przycisk w nagłówku stoi po prawej stronie tytułu", () => {
    for (const file of [
      "components/standings-table.tsx",
      "components/admin/team-manager.tsx",
      "components/admin/scorers-manager.tsx",
    ]) {
      const code = source(file);
      const head = code.indexOf("ice-card-head");
      const row = code.indexOf("items-center justify-between", head);

      // Rzad z tytulem i akcja jest WEWNATRZ naglowka, nie zamiast niego.
      expect(row).toBeGreaterThan(head);
      expect(code).not.toContain("ice-card-head flex-row");
    }
  });

  it("wszystkie karty używają tego samego prymitywu nagłówka", () => {
    const files = [
      "components/standings-table.tsx",
      "components/match-matrix.tsx",
      "components/scorers-table.tsx",
      "components/schedule-section.tsx",
      "components/regulation-section.tsx",
      "components/playoff/placement-section.tsx",
      "components/admin/team-manager.tsx",
      "components/admin/scorers-manager.tsx",
      "components/admin/standing-table.tsx",
      "components/admin/editable-match-matrix.tsx",
      "components/ui/card.tsx",
    ];

    for (const file of files) {
      const code = source(file);

      expect(code).toContain("ice-card-head");
      // Zaden naglowek nie ma juz wlasnego, recznego paddingu.
      expect(code).not.toContain("border-b border-slate-200 px-4 py-4");
    }
  });
});

describe("okna modalne wychodzą poza kartę, z której je otwarto", () => {
  const dialog = source("components/admin/team-dialog.tsx");
  const settings = source("components/admin/tournament-settings-panel.tsx");
  const portal = source("components/ui/modal-portal.tsx");

  it("dialog drużyny i ustawienia renderują się przez portal", () => {
    // .ice-surface ma backdrop-filter, a to tworzy kontener pozycjonowania
    // dla position: fixed — bez portalu okno zostawało uwięzione w karcie.
    for (const code of [dialog, settings]) {
      expect(code).toContain("<ModalPortal>");
      expect(code).toContain("@/components/ui/modal-portal");
    }
  });

  it("portal montuje się w body", () => {
    expect(portal).toContain("createPortal(children, document.body)");
  });

  it("okno przykrywa cały ekran i rozmywa całe tło", () => {
    for (const code of [dialog, settings]) {
      expect(code).toContain("fixed inset-0");
      expect(code).toContain("backdrop-blur-sm");
      // Wyśrodkowane na desktopie, pełny ekran na telefonie.
      expect(code).toContain("items-stretch justify-center sm:items-center");
    }
  });
});

describe("miejsca w tabeli przed pierwszym meczem", () => {
  const code = source("components/standings-table.tsx");

  it("bez rozegranego meczu tabela nie przyznaje medali", () => {
    // Kolejność wierszy przed startem wynika z kolejności wprowadzenia
    // drużyn — medal za to byłby nieprawdą sportową.
    expect(code).toContain("const positionsEstablished = rows.some((row) => row.played > 0)");
    expect(code).toContain("if (!positionsEstablished)");

    const badge = code.indexOf("function renderPositionBadge");
    const guard = code.indexOf("if (!positionsEstablished)", badge);
    const gold = code.indexOf("gold.png", badge);

    // Znak zapytania wyprzedza jakikolwiek medal.
    expect(guard).toBeLessThan(gold);
  });

  it("nazwa drużyny rozwija się kliknięciem, tak jak skrót kolumny", () => {
    expect(code).toContain("<CellPopover");
    expect(code).toContain('testId="team-name"');

    const popover = source("components/ui/cell-popover.tsx");

    // Ten sam prymityw obsługuje skróty kolumn i nazwy drużyn.
    expect(source("components/ui/column-help.tsx")).toContain("CellPopover");
    expect(popover).toContain('event.pointerType === "mouse"');
    expect(popover).toContain('event.key === "Escape"');
    expect(popover).toContain("aria-label");
  });

  it("klasyfikacja końcowa nie jest zaokrąglona na telefonie", () => {
    const podium = source("components/playoff/podium-section.tsx");

    expect(podium).toContain("rounded-none");
    expect(podium).toContain("sm:rounded-3xl");
    expect(podium).toContain("flush-card");
  });
});

describe("tabela wyników: nazwy i herby są klikalne", () => {
  const code = source("components/match-matrix.tsx");

  it("kolumna nazw przechwytuje kliknięcia także po przewinięciu", () => {
    /*
      Nakładka była `pointer-events-none`, więc po przesunięciu tabeli
      w bok dotyk trafiał w komórki wyników — rozwinięcie nazwy działało
      tylko przy skrajnie lewej pozycji.
    */
    expect(code).not.toContain("pointer-events-none");
    expect(code).toContain('testId="matrix-team"');
  });

  it("herb w nagłówku kolumny mówi, czyj jest", () => {
    expect(code).toContain('testId="matrix-column-team"');
    // Dymek rozwija się w prawo, żeby nie schować się pod kolumną nazw.
    expect(code).toContain('placement="start"');
  });

  it("nazwa wiersza zostaje dostępna dla czytnika ekranu", () => {
    // Nakładka jest widoczna, semantykę wiersza niesie ukryty nagłówek.
    expect(code).toContain('scope="row"');
    expect(code).toContain('<span className="sr-only">{rowTeam.name}</span>');
    // Żadnego interaktywnego elementu w warstwie ukrytej przed czytnikiem.
    expect(code).not.toContain('aria-hidden="true"');
  });

  it("wszystkie trzy miejsca używają jednego prymitywu", () => {
    const popover = source("components/ui/cell-popover.tsx");

    expect(code).toContain("CellPopover");
    expect(source("components/standings-table.tsx")).toContain("CellPopover");
    expect(source("components/ui/column-help.tsx")).toContain("CellPopover");
    expect(popover).toContain('placement === "start"');
  });
});

describe("dymki nie gubią się pod krawędzią", () => {
  const css = source("app/globals.css");
  const popover = source("components/ui/cell-popover.tsx");

  it("kierunek dymka jest stylem inline, nie klasą CSS", () => {
    /*
      Warianty pozycji jako klasy zależały od kolejności reguł w arkuszu
      i od tego, czy bundler zdążył przebudować CSS. Styl inline wygrywa
      zawsze — ta sama lekcja, co przy zaokrągleniach kart.
    */
    expect(popover).toContain('top: "calc(100% + 0.375rem)"');
    expect(popover).toContain('bottom: "calc(100% + 0.375rem)"');
    expect(popover).not.toContain("column-help-popover-below");
    expect(popover).not.toContain("column-help-popover-start");

    const rule = css.slice(
      css.indexOf(".column-help-popover {"),
      css.indexOf(".column-help-code")
    );

    // W arkuszu zostaje sam wygląd.
    expect(rule).not.toContain("top:");
    expect(rule).not.toContain("bottom:");
    expect(rule).toContain("background: #0f172a");
  });

  it("nagłówki otwierają w dół, wiersze w górę", () => {
    // Nad nagłówkiem jest już tylko krawędź karty; pod ostatnim wierszem
    // kończy się karta — stąd dwa różne kierunki.
    expect(source("components/ui/column-help.tsx")).toContain('align="below"');
    expect(source("components/match-matrix.tsx")).toContain('align="below"');

    const standings = source("components/standings-table.tsx");
    const teamName = standings.indexOf('testId="team-name"');
    const nextProp = standings.indexOf("label=", teamName);

    // Wiersz nie deklaruje align — korzysta z domyślnego „above".
    expect(standings.slice(teamName, nextProp)).not.toContain("align=");
  });

  it("pełna, widoczna nazwa nie dostaje dymka", () => {
    expect(popover).toContain("onlyWhenTruncated");
    expect(popover).toContain("scrollWidth > target.clientWidth");
    // Hover, klik i focus są nieaktywne, dopóki tekst się mieści.
    expect(popover).toContain("isTruncated && setOpen");
    expect(popover).toContain("open && isTruncated");
  });

  it("pomiar trafia w element, który faktycznie ucina tekst", () => {
    expect(popover).toContain('querySelector<HTMLElement>("[data-truncate]")');
    expect(source("components/match-matrix.tsx")).toContain("data-truncate");
  });

  it("nazwy drużyn korzystają z pomiaru, skróty kolumn nie", () => {
    expect(source("components/standings-table.tsx")).toContain("onlyWhenTruncated");
    expect(source("components/match-matrix.tsx")).toContain("onlyWhenTruncated");

    // Skrót „Pkt" ma być wyjaśniany zawsze — nie jest ucięty, tylko krótki.
    expect(source("components/ui/column-help.tsx")).not.toContain(
      "onlyWhenTruncated"
    );
  });
});
