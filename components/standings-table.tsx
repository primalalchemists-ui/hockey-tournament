"use client";

import { ShareTableButton } from "@/components/ShareTableButton";
import { CelebrationButton } from "@/components/celebration-cta";
import type { CelebrationCta } from "@/lib/public/celebration";
import { CellPopover } from "@/components/ui/cell-popover";
import { ColumnHelp } from "@/components/ui/column-help";
import { EdgeScroller } from "@/components/ui/edge-scroller";
import { STANDINGS_COLUMNS } from "@/lib/public/column-help";
import type { StandingRow } from "@/types/tournament";

type StandingsTableProps = {
  groupKey: string;
  groupName: string;
  rows: StandingRow[];
  /**
   * Etap turnieju — wyłącznie dla formatu z play-offem.
   * Zwykła liga nie dostaje sztucznej „Fazy grupowej".
   */
  stage?: { label: string; tone: string } | null;
  /**
   * Przycisk celebracji — pokazywany WYŁĄCZNIE na telefonie.
   * Na desktopie tę rolę pełni istniejące CTA w hero, więc drugi duży
   * przycisk przy tabeli byłby zbędnym powtórzeniem.
   */
  celebration?: CelebrationCta | null;
};

function renderPositionBadge(row: StandingRow, positionsEstablished: boolean) {
  /*
    ZANIM PADNIE PIERWSZY WYNIK, MIEJSCA NIE ISTNIEJĄ.

    Kolejność wierszy przed pierwszym meczem wynika wyłącznie z kolejności
    wprowadzenia drużyn — przyznawanie za nią medali byłoby nieprawdą
    sportową. Do czasu pierwszego rozegranego meczu każde miejsce to „?".
  */
  if (!positionsEstablished) {
    /*
      Zamiast szarego placeholdera: stonowany, ciemnozłoty stan
      „wszystko jest jeszcze możliwe". Przed pierwszym gwizdkiem każda
      drużyna może sięgnąć po złoto — i tak ma to wyglądać.

      To NIE jest medal: dużo ciemniejszy i spokojniejszy niż złoto po
      zakończeniu turnieju, statyczny, bez pulsowania.
    */
    return (
      <span
        data-testid="rank-unresolved"
        title="Miejsce zostanie wyłonione po pierwszych meczach"
        className="unresolved-rank flex h-9 w-9 items-center justify-center rounded-full text-base font-bold"
      >
        ?
      </span>
    );
  }

  if (row.isTieUnresolved) {
    /*
      Pozycja nierozstrzygnięta mimo rozegranych meczów — ten sam język
      wizualny, bo domena nadal nie zna odpowiedzi.
    */
    return (
      <span
        data-testid="rank-unresolved"
        title={row.tieNote ?? "Miejsce nierozstrzygnięte"}
        className="unresolved-rank flex h-9 w-9 items-center justify-center rounded-full text-base font-bold"
      >
        ?
      </span>
    );
  }

  if (row.position === 1) {
    return (
      <img
        src="/images/medals/gold.png"
        alt="1 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (row.position === 2) {
    return (
      <img
        src="/images/medals/silver.png"
        alt="2 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (row.position === 3) {
    return (
      <img
        src="/images/medals/bronze.png"
        alt="3 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  return (
    <span className="stat-num flex h-9 w-9 items-center justify-center rounded-full border border-[var(--surface-border)] bg-white/80 text-sm font-bold text-slate-700">
      {row.position}
    </span>
  );
}

export function StandingsTable({
  groupName,
  rows,
  stage = null,
  celebration = null,
}: StandingsTableProps) {
  /*
    Tabela ma sportowe podstawy dopiero wtedy, gdy ktokolwiek zagrał.
    Dotyczy tak samo ligi, jak i formatu z play-offem.
  */
  const positionsEstablished = rows.some((row) => row.played > 0);

  const unresolvedRows = rows.filter((row) => row.isTieUnresolved);

  const uniqueNotes = Array.from(
    new Set(
      unresolvedRows
        .map((row) => row.tieNote)
        .filter((note): note is string => Boolean(note))
    )
  );

  return (
    <section className="ice-card flush-card">
      <div className="ice-card-head">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="section-title">Ranking</h2>

            {/*
              Etap turnieju mieszka W NAGŁÓWKU rankingu, a nie w osobnej
              karcie pod tabelą — jest informacją o stanie tych wyników.
            */}
            {stage ? (
              <span
                data-testid="stage-badge"
                className={`stage-badge stage-${stage.tone}`}
              >
                Etap turnieju: {stage.label}
              </span>
            ) : null}

          </div>

          <ShareTableButton shareText={`Sprawdź ranking grupy ${groupName}`} />
        </div>

        {celebration?.kind === "celebration" ? (
          <div className="mt-3 md:hidden">
            {/* Na telefonie ten sam przycisk co w hero, ale z wygodniejszym
                celem dotyku — hero jest tu poza zasięgiem kciuka. */}
            <CelebrationButton
              cta={celebration}
              className="h-12 w-full justify-center text-base"
            />
          </div>
        ) : null}

        {/*
          WYJAŚNIENIE REMISU W SLOCIE O STAŁEJ WYSOKOŚCI.

          Wcześniej był to bursztynowy kafel pojawiający się i znikający
          zależnie od tego, czy któraś pozycja jest nierozstrzygnięta —
          a to zmienia się przy KAŻDYM wpisanym wyniku. Karta rankingu raz
          rosła, raz malała o kilkadziesiąt pikseli, więc macierz pod nią
          podskakiwała dokładnie wtedy, gdy ktoś w nią celował palcem.

          Slot istnieje zawsze i ma stałą wysokość. Pusty nic nie pokazuje,
          pełny mieści jedną linię; komplet treści zostaje w `title`, gdyby
          wyjaśnień było kilka naraz.
        */}
        <p
          data-testid="tie-notes"
          title={uniqueNotes.join(" · ") || undefined}
          className="mt-2 h-5 truncate text-xs font-medium text-amber-800"
        >
          {uniqueNotes.join(" · ")}
        </p>
      </div>

      <EdgeScroller label="Tabela rankingu, przewijana w poziomie">
        <table className="ice-table min-w-full">
          <thead>
            <tr>
              <th className="text-center">Poz.</th>
              <th className="text-left">Drużyna</th>
              {/*
                Znaczenie skrótu żyje NA nagłówku kolumny, nie w osobnym
                bloku legendy pod tabelą.
              */}
              {STANDINGS_COLUMNS.map((code) => (
                <th key={code} className="text-center">
                  <ColumnHelp code={code} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.teamId}>
                <td className="text-center">
                  <div className="flex justify-center">
                    {renderPositionBadge(row, positionsEstablished)}
                  </div>
                </td>

                <td>
                  <div className="flex min-w-[11rem] items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
                      {row.logoUrl ? (
                        <img
                          src={row.logoUrl}
                          alt={row.teamName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold uppercase text-slate-600">
                          {row.logoText ?? "LOGO"}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-col">
                      {/*
                        Nazwa drużyny działa tak samo jak skrót kolumny:
                        kliknięcie (albo najechanie na desktopie) pokazuje
                        pełną nazwę. Na wąskim ekranie nazwa bywa ucięta,
                        więc kibic zawsze może ją rozwinąć.
                      */}
                      <CellPopover
                        testId="team-name"
                        onlyWhenTruncated
                        label={row.teamName}
                        className="team-name block max-w-[10rem] truncate text-left sm:max-w-none"
                        content={row.teamName}
                      >
                        {row.teamName}
                      </CellPopover>

                      {row.isTieUnresolved && row.tieNote && (
                        <span className="text-xs font-medium text-amber-700">
                          O miejscu decydują rzuty karne
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                <td className="text-center">{row.played}</td>
                <td className="text-center">{row.wins}</td>
                <td className="text-center">{row.draws}</td>
                <td className="text-center">{row.losses}</td>
                <td className="stat-key text-center">{row.points}</td>
                <td className="text-center">{row.goalsFor}</td>
                <td className="text-center">{row.goalsAgainst}</td>
                <td className="text-center font-semibold">{row.goalDifference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </EdgeScroller>
    </section>
  );
}