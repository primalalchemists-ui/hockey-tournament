"use client";

import { useEffect, useRef, useState } from "react";
import type { Group, Match } from "@/types/tournament";
import { CampBanner } from "./camp-banner";

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

  return "border-slate-200 bg-slate-50 text-slate-700";
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
        className="rounded-3xl border border-slate-200 bg-white shadow-sm"
        id="results-section"
      >
        <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="flex justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Wyniki</h2>
          </div>
        </div>

        <div className="overflow-x-auto pb-4">
          <table className="w-full border-collapse p-16 text-xs sm:text-sm">
            <thead className="w-full">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-600"></th>

                {group.teams.map((team) => (
                  <th
                    key={team.id}
                    className="bg-slate-50 px-2 py-3 text-center font-semibold text-slate-600"
                  >
                    <div className="mx-auto flex w-20 flex-col items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
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
                  className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                >
                  <td
                    className={[
                      "sticky left-0 z-30 px-3 py-3 font-medium text-slate-900",
                      "overflow-hidden isolate will-change-transform [transform:translateZ(0)] [backface-visibility:hidden]",
                      "max-w-35 md:max-w-fit",
                      rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "relative z-10 flex items-center gap-3",
                        "will-change-transform [transform:translateZ(0)] [backface-visibility:hidden]",
                        rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
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
                        className="min-w-0 text-left"
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
                            "mx-auto flex min-h-10 flex-col items-center justify-center rounded-xl border text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
                            isSame
                              ? "border-slate-200 bg-slate-100 text-slate-400"
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