"use client";

import { useEffect, useRef, useState } from "react";
import type { Group, Match } from "@/types/tournament";
import { CampBanner } from "./camp-banner";

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

type PreviewState = {
  teamId: string;
  teamName: string;
  top: number;
  left: number;
};

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
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closePreview(event: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;

      const target = event.target as Node;
      if (!containerRef.current.contains(target)) {
        setPreview(null);
      }
    }

    document.addEventListener("mousedown", closePreview);
    document.addEventListener("touchstart", closePreview);

    return () => {
      document.removeEventListener("mousedown", closePreview);
      document.removeEventListener("touchstart", closePreview);
    };
  }, []);

  useEffect(() => {
    function handleViewportChange() {
      setPreview(null);
    }

    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  function handleTeamPreviewClick(
    event: React.MouseEvent<HTMLButtonElement>,
    teamId: string,
    teamName: string
  ) {
    const rect = event.currentTarget.getBoundingClientRect();

    const popupWidth = Math.min(240, window.innerWidth - 24);
    const desiredLeft = rect.left;
    const maxLeft = window.innerWidth - popupWidth - 12;
    const left = Math.max(12, Math.min(desiredLeft, maxLeft));
    const top = rect.bottom + 8;

    setPreview((prev) =>
      prev?.teamId === teamId
        ? null
        : {
            teamId,
            teamName,
            top,
            left,
          }
    );
  }

  return (
    <>
      <section
        ref={containerRef}
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
                    className="bg-[var(--surface-head)] px-2 py-3 text-center font-semibold text-[var(--text-secondary)]"
                  >
                    <div className="mx-auto flex w-20 flex-col items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
                        {team.logoUrl ? (
                          <img
                            src={team.logoUrl}
                            alt={team.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] font-semibold uppercase text-slate-600">
                            {team.logoText ?? "LOGO"}
                          </span>
                        )}
                      </div>
                    </div>
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
                  <td className="team-name px-3 py-2" style={NAME_COLUMN_STYLE}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
                        {rowTeam.logoUrl ? (
                          <img
                            src={rowTeam.logoUrl}
                            alt={rowTeam.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] font-semibold uppercase text-slate-600">
                            {rowTeam.logoText ?? "LOGO"}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        title={rowTeam.name}
                        onClick={(event) =>
                          handleTeamPreviewClick(event, rowTeam.id, rowTeam.name)
                        }
                        className="min-w-0 flex-1 rounded-md text-left transition hover:bg-white/70"
                      >
                        <span className="block truncate">{rowTeam.name}</span>
                      </button>
                    </div>
                  </td>

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
          NIERUCHOMA kolumna nazw.

          Wizualna kopia pierwszej kolumny tabeli, ułożona dokładnie nad nią.
          Przy pozycji 0 pokrywa się z oryginałem co do piksela, a podczas
          przewijania oryginał przejeżdża pod spodem — półprzezroczyste tło
          pokazuje, co właśnie minęliśmy.

          aria-hidden, bo prawdziwe dane są w tabeli; to warstwa wyłącznie
          prezentacyjna i nie przechwytuje kliknięć.
        */}
        <div
          aria-hidden="true"
          data-testid="matrix-name-column"
          className="pointer-events-none absolute left-0 top-0 z-10"
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
                "matrix-name-cell flex items-center gap-3 px-3",
                rowIndex % 2 === 0 ? "" : "matrix-name-cell-alt",
              ].join(" ")}
              style={{ height: `${ROW_HEIGHT_REM}rem` }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
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
              </div>

              <span className="team-name block truncate text-xs sm:text-sm">
                {rowTeam.name}
              </span>
            </div>
          ))}
        </div>
        </div>
      </section>

      {preview ? (
        <div
          className="fixed z-[9999] rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-medium text-white shadow-lg sm:hidden"
          style={{
            top: preview.top,
            left: preview.left,
            maxWidth: "240px",
          }}
        >
          {preview.teamName}
        </div>
      ) : null}
    </>
  );
}