"use client";

import type { Group, Match } from "@/types/tournament";
import { CellPopover } from "@/components/ui/cell-popover";

/*
  KOLUMNA DRUŻYN BEZ PRZYKLEJANIA.

  Sticky w komórkach tabeli drgało przy przewijaniu w bok mimo kolejnych
  poprawek (backdrop-filter, transformy, border-collapse). Zamiast zgadywać
  dalej — kolumna nazw NIE jest już przyklejana. To nieruchoma nakładka
  ułożona nad tabelą, więc przeglądarka nie ma czego przesuwać co klatkę.

  Efekt uboczny jest tym, o który prosiliście: przewijana treść przejeżdża
  POD półprzezroczystą kolumną, więc widać, że tabela jest przesunięta.

  Stałe wysokości trzymają nakładkę w idealnej osi z wierszami tabeli.
*/
const NAME_COLUMN_REM = 9;
const HEAD_HEIGHT_REM = 4;
const ROW_HEIGHT_REM = 3.5;

const NAME_COLUMN_STYLE: React.CSSProperties = {
  width: `${NAME_COLUMN_REM}rem`,
  minWidth: `${NAME_COLUMN_REM}rem`,
  maxWidth: `${NAME_COLUMN_REM}rem`,
};

/*
  Nakładka jest o WŁOS szersza niż kolumna tabeli.

  Przy pierwszym przesunięciu w bok zaokrąglenie subpikselowe zostawiało
  na styku kolumn cienki pasek przewijanej treści. Jeden dodatkowy piksel
  zakrywa szczelinę i pierwsza kolumna działa jak ściana.
*/
const NAME_COLUMN_OVERLAY_STYLE: React.CSSProperties = {
  width: `calc(${NAME_COLUMN_REM}rem + 1px)`,
};

type MatchMatrixProps = {
  group: Group;
};

type ResultTone = "neutral" | "win" | "draw" | "loss";

function findMatch(group: Group, teamAId: string, teamBId: string): Match | null {
  return (
    group.matches.find(
      (item) =>
        (item.homeTeamId === teamAId && item.awayTeamId === teamBId) ||
        (item.homeTeamId === teamBId && item.awayTeamId === teamAId)
    ) ?? null
  );
}

function getResultTone(match: Match | null, rowTeamId: string): ResultTone {
  if (!match) return "neutral";

  const isRowHome = match.homeTeamId === rowTeamId;
  const scored = isRowHome ? match.homeScore : match.awayScore;
  const conceded = isRowHome ? match.awayScore : match.homeScore;

  if (scored > conceded) return "win";
  if (scored < conceded) return "loss";
  return "draw";
}

function getResultClasses(tone: ResultTone) {
  if (tone === "win") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (tone === "loss") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (tone === "draw") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-[var(--surface-border)] bg-white/60 text-slate-600";
}

function getDisplayScore(match: Match | null, rowTeamId: string) {
  if (!match) return null;

  const isRowHome = match.homeTeamId === rowTeamId;
  const leftScore = isRowHome ? match.homeScore : match.awayScore;
  const rightScore = isRowHome ? match.awayScore : match.homeScore;

  return `${leftScore} : ${rightScore}`;
}

export function MatchMatrix({ group }: MatchMatrixProps) {
  return (
    <>
      <section
        className="ice-card-solid flush-card rounded-none sm:rounded-3xl"
        id="results-section"
      >
        <div className="ice-card-head">
          <div className="flex justify-between">
            <h2 className="section-title">Wyniki</h2>
          </div>
        </div>

        <div className="relative">
        <div className="ice-scroll overflow-x-auto pb-4">
          <table className="matrix-table w-full text-xs sm:text-sm">
            <thead className="w-full">
              <tr style={{ height: `${HEAD_HEIGHT_REM}rem` }}>
                <th
                  className="px-3 py-3 text-left font-semibold text-[var(--text-secondary)]"
                  style={NAME_COLUMN_STYLE}
                />

                {group.teams.map((team) => (
                  <th
                    key={team.id}
                    scope="col"
                    className="bg-[var(--surface-head)] px-2 py-3 text-center font-semibold text-[var(--text-secondary)]"
                  >
                    {/*
                      Kolumny są podpisane WYŁĄCZNIE herbem, więc sam herb
                      musi umieć powiedzieć, czyj jest — kliknięcie rozwija
                      nazwę drużyny.
                    */}
                    <span className="mx-auto flex w-20 flex-col items-center gap-2">
                      <CellPopover
                        testId="matrix-column-team"
                        label={team.name}
                        content={team.name}
                        placement="start"
                        align="below"
                        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70 transition hover:border-slate-400"
                      >
                        {team.logoUrl ? (
                          <img
                            src={team.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] font-semibold uppercase text-slate-600">
                            {team.logoText ?? "LOGO"}
                          </span>
                        )}
                      </CellPopover>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {group.teams.map((rowTeam, rowIndex) => (
                <tr
                  key={rowTeam.id}
                  className={rowIndex % 2 === 0 ? "" : "bg-[var(--surface-alt)]"}
                  style={{ height: `${ROW_HEIGHT_REM}rem` }}
                >
                  {/*
                    Komórka trzyma SZEROKOŚĆ kolumny i etykietę wiersza dla
                    czytnika ekranu. Widoczna, klikalna nazwa żyje w nakładce
                    poniżej — to ona nie ucieka przy przewijaniu w bok.
                  */}
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-normal"
                    style={NAME_COLUMN_STYLE}
                  >
                    <span className="sr-only">{rowTeam.name}</span>
                  </th>

                  {group.teams.map((colTeam, colIndex) => {
                    const isSame = rowTeam.id === colTeam.id;
                    const match = findMatch(group, rowTeam.id, colTeam.id);
                    const tone = isSame ? "neutral" : getResultTone(match, rowTeam.id);
                    const isLastCol = colIndex === group.teams.length - 1;
                    const displayScore = getDisplayScore(match, rowTeam.id);

                    return (
                      <td
                        key={colTeam.id}
                        className={
                          isLastCol ? "py-2 pl-2 pr-4 text-center" : "px-2 py-2 text-center"
                        }
                      >
                        <div
                          className={[
                            "stat-num mx-auto flex min-h-10 min-w-14 flex-col items-center justify-center rounded-xl border text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] sm:text-sm",
                            isSame
                              ? "border-[var(--surface-border)] bg-white/40 text-slate-400"
                              : getResultClasses(tone),
                          ].join(" ")}
                        >
                          {isSame ? "-" : displayScore ?? "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          NIERUCHOMA, INTERAKTYWNA kolumna nazw.

          Nie jest już kopią ozdobną: to jedyna widoczna warstwa z nazwami
          i jedyna, którą da się kliknąć. Wcześniej przepuszczała zdarzenia
          wskaźnika na spód, więc po przewinięciu w bok dotyk trafiał
          w komórki wyników, a nazwa rozwijała się tylko przy skrajnie
          lewej pozycji tabeli.

          Semantykę wiersza niesie ukryty nagłówek `th scope="row"` w tabeli,
          więc czytnik ekranu nie słyszy nazwy dwa razy.
        */}
        <div
          data-testid="matrix-name-column"
          className="absolute left-0 top-0 z-10"
          style={NAME_COLUMN_OVERLAY_STYLE}
        >
          <div
            className="matrix-name-head"
            style={{ height: `${HEAD_HEIGHT_REM}rem` }}
          />

          {group.teams.map((rowTeam, rowIndex) => (
            <div
              key={rowTeam.id}
              className={[
                "matrix-name-cell flex items-center gap-2 px-3",
                rowIndex % 2 === 0 ? "" : "matrix-name-cell-alt",
              ].join(" ")}
              style={{ height: `${ROW_HEIGHT_REM}rem` }}
            >
              {/*
                Herb i nazwa rozwijają pełną nazwę drużyny — tak samo jak
                skróty kolumn w Rankingu. Na wąskim ekranie nazwa jest
                ucięta, więc to jedyny sposób, żeby ją w całości zobaczyć.
              */}
              <CellPopover
                testId="matrix-team"
                onlyWhenTruncated
                label={rowTeam.name}
                content={rowTeam.name}
                className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-white/70"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
                  {rowTeam.logoUrl ? (
                    <img
                      src={rowTeam.logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] font-semibold uppercase text-slate-600">
                      {rowTeam.logoText ?? "LOGO"}
                    </span>
                  )}
                </span>

                <span
                  data-truncate
                  className="team-name block truncate text-xs sm:text-sm"
                >
                  {rowTeam.name}
                </span>
              </CellPopover>
            </div>
          ))}
        </div>
        </div>
      </section>

    </>
  );
}