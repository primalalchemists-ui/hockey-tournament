"use client";

import { useState } from "react";

import { MatchMatrix } from "@/components/match-matrix";
import { ScorersTable } from "@/components/scorers-table";
import { StandingsTable } from "@/components/standings-table";
import {
  GroupTransition,
  useGroupTransition,
} from "@/components/public/group-transition";
import { calculateStandings } from "@/lib/standings";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import type { Tournament } from "@/types/tournament";
import type { TournamentStructure } from "@/types/tournament-config";

/**
 * ARCHIWALNY TURNIEJ — spokojna strona wyników.
 *
 * Ten widok CELOWO nie korzysta z powłoki wydarzenia. Nie ma tu tickera,
 * hero bieżącego eventu, campu, przycisku celebracji ani odpytywania
 * serwera co 13 sekund. Klasyfikacja końcowa pojawia się od razu w stanie
 * finalnym — bez opadania, uderzeń, świateł i bez zapisywania czegokolwiek
 * w pamięci przeglądarki. To archiwum, nie ceremonia.
 *
 * Wspólne pozostają: tło, karty, typografia i tabele — żeby strona
 * wyglądała jak ta sama aplikacja.
 */

type ArchivedTournamentViewProps = {
  tournament: Tournament;
  structure: TournamentStructure;
  scorersEnabled: boolean;
  playoffState: PlayoffStateView | null;
};

export function ArchivedTournamentView({
  tournament,
  structure,
  scorersEnabled,
  playoffState,
}: ArchivedTournamentViewProps) {
  const groups = tournament.groups ?? [];
  const [activeKey, setActiveKey] = useState(groups[0]?.key ?? "");

  // To samo przejście co na stronie z bieżącymi wynikami — jedna implementacja.
  const { displayedKey, phase } = useGroupTransition(activeKey);

  const group = groups.find((item) => item.key === displayedKey) ?? groups[0];

  if (!group) return null;

  const scope = playoffState?.scopes.find(
    (item) => item.groupKey === group.key
  );

  /*
    Kolejność końcowa, jeśli turniej ją wyłonił; w przeciwnym razie zwykła
    tabela grupowa. Ta sama funkcja klasyfikacji co wszędzie indziej.
  */
  const rows = scope?.ranking?.length
    ? scope.ranking
    : calculateStandings(group);

  const allTeams = groups.flatMap((item) => item.teams);
  const scorers = tournament.scorers ?? [];
  const showScorers = scorersEnabled && scorers.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Selektor grup pojawia się WYŁĄCZNIE tam, gdzie grupy istnieją. */}
      {structure === "groups" && groups.length > 1 ? (
        <div
          data-testid="history-group-tabs"
          role="tablist"
          aria-label="Grupy turnieju"
          className="flex gap-2 overflow-x-auto px-4 sm:px-0"
        >
          {groups.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === activeKey}
              onClick={() => setActiveKey(item.key)}
              className={[
                "btn h-10 shrink-0 text-sm",
                // Przycisk reaguje na wybór natychmiast, treść po wygaszeniu.
                item.key === activeKey ? "btn-primary" : "btn-quiet",
              ].join(" ")}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      <GroupTransition phase={phase} contentKey={displayedKey}>
        <div className="space-y-4 sm:space-y-6">
          <StandingsTable
            groupKey={group.key}
            groupName={group.name}
            rows={rows}
            stage={null}
            celebration={null}
          />

          <MatchMatrix group={group} />

          {scope?.classification?.complete ? (
            <FinalClassification entries={scope.classification.entries} />
          ) : null}
        </div>
      </GroupTransition>

      {showScorers ? <ScorersTable scorers={scorers} teams={allTeams} /> : null}
    </div>
  );
}

/**
 * Statyczna klasyfikacja końcowa.
 *
 * Ta sama treść co na podium wydarzenia, ale bez ceremonii: lista miejsc
 * jest widoczna natychmiast i nic się nie animuje.
 */
function FinalClassification({
  entries,
}: {
  entries: NonNullable<PlayoffStateView["scopes"][number]["classification"]>["entries"];
}) {
  return (
    <section data-testid="history-classification" className="ice-card flush-card">
      <div className="ice-card-head">
        <p className="section-eyebrow">Wynik końcowy</p>
        <h2 className="section-title mt-0.5">Klasyfikacja końcowa</h2>
      </div>

      <ol className="divide-y divide-[var(--surface-line)]">
        {entries.map((entry) => (
          <li
            key={entry.team.teamId}
            className="flex items-center gap-3 px-4 py-2.5 sm:px-6"
          >
            <span className="stat-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--surface-border)] bg-white/80 text-sm font-bold text-slate-700">
              {entry.position ?? "?"}
            </span>

            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
              {entry.team.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.team.logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[9px] font-semibold uppercase text-slate-500">
                  {entry.team.logoText ?? "—"}
                </span>
              )}
            </span>

            <span className="team-name truncate text-sm">
              {entry.team.name}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
