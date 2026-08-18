"use client";

import {
  groupIssuesByGroup,
  ISSUE_REASON_LABELS,
  type IssueTeam,
  type OperationIssueReport,
} from "@/lib/playoff/validation";

/**
 * BŁĄD OPERACJI PO LUDZKU.
 *
 * Zamiast „po-B-semifinal-0: brak wyniku" administrator dostaje listę
 * konkretnych meczów: herb, pełna nazwa, kontra, herb, pełna nazwa —
 * pogrupowanych po grupach, tak jak wyglądają w panelu.
 *
 * Identyfikatory techniczne zostają w silniku i w logach serwera.
 */

type OperationErrorProps = {
  /** Zapasowy tekst — używany, gdy błąd nie niesie struktury. */
  message: string | null;
  details?: OperationIssueReport | null;
};

function IssueTeamBlock({ team }: { team: IssueTeam | null }) {
  if (!team) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-rose-300 text-xs font-semibold text-rose-400">
          ?
        </span>
        <span className="truncate text-sm text-rose-700">Nieznany</span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-rose-200 bg-white">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[9px] font-semibold uppercase text-rose-500">
            {team.logoText ?? "—"}
          </span>
        )}
      </span>

      <span className="truncate text-sm font-semibold text-rose-900">
        {team.name}
      </span>
    </span>
  );
}

export function OperationError({ message, details }: OperationErrorProps) {
  if (!message && !details) return null;

  if (!details) {
    return (
      <p
        data-testid="operation-error"
        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
      >
        {message}
      </p>
    );
  }

  return (
    <div
      data-testid="operation-error"
      role="alert"
      className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"
    >
      <div>
        <p className="text-sm font-bold text-rose-900">{details.title}</p>
        <p className="text-xs text-rose-700">{details.hint}</p>
      </div>

      {groupIssuesByGroup(details.matches).map((group) => (
        <div key={group.groupName} className="space-y-1.5">
          <p className="section-eyebrow text-rose-600">{group.groupName}</p>

          {group.matches.map((match, index) => (
            <div
              key={`${match.roundLabel}-${index}`}
              data-testid="operation-error-match"
              /*
                Na wąskim ekranie drużyny układają się jedna pod drugą —
                długie nazwy klubów nie mogą rozepchnąć okna błędu.
              */
              className="flex flex-col gap-1 rounded-xl border border-rose-200/70 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <IssueTeamBlock team={match.home} />

              <span className="shrink-0 text-xs font-semibold uppercase text-rose-400">
                vs
              </span>

              <IssueTeamBlock team={match.away} />

              <span className="shrink-0 text-xs text-rose-600 sm:ml-auto">
                {match.roundLabel} · {ISSUE_REASON_LABELS[match.reason]}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
