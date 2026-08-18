"use client";

import type { BracketTeamView } from "@/lib/data/postgres/playoff-engine";

/**
 * DRUŻYNA W PANELU ADMINA — herb, nazwa, rozstawienie.
 *
 * Panel pokazywał wcześniej etykiety slotów („Miejsce 1 w grupie —
 * Miejsce 4 w grupie"). Po zamrożeniu uczestnicy są znani, więc
 * administrator ma widzieć to samo co kibic: herb i pełną nazwę.
 * Rozstawienie zostaje, ale jako mały badge OBOK nazwy, nie zamiast niej.
 */

type TeamBlockProps = {
  team: BracketTeamView | null;
  /** Wyrównanie do prawej dla gościa — score zostaje pośrodku. */
  align?: "start" | "end";
  /** Techniczny opis slotu; trafia wyłącznie do czytnika ekranu. */
  slotLabel?: string;
};

export function TeamBlock({ team, align = "start", slotLabel }: TeamBlockProps) {
  const isEnd = align === "end";

  if (!team) {
    /*
      Nieznany uczestnik to po prostu „?". Techniczny opis („Zwycięzca
      półfinału 1") zostaje w aria-label — semantyka bez szumu na ekranie.
    */
    return (
      <span
        className={[
          "flex min-w-0 flex-1 items-center gap-2",
          isEnd ? "justify-end" : "",
        ].join(" ")}
        aria-label={slotLabel}
        data-testid="admin-team-unknown"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-slate-400">
          ?
        </span>
        <span className="truncate text-sm text-slate-400">Nieznany</span>
      </span>
    );
  }

  return (
    <span
      className={[
        "flex min-w-0 flex-1 items-center gap-2",
        isEnd ? "flex-row-reverse text-right" : "",
      ].join(" ")}
      data-testid="admin-team"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logoUrl}
            alt=""
            className="h-full w-full object-cover"
            data-testid="admin-team-logo"
          />
        ) : (
          <span className="text-[9px] font-semibold uppercase text-slate-500">
            {team.logoText ?? "—"}
          </span>
        )}
      </span>

      <span className="flex min-w-0 items-center gap-1.5">
        {team.seed ? (
          <span
            data-testid="admin-team-seed"
            className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500"
            aria-label={`Rozstawienie ${team.seed}`}
          >
            {team.seed}
          </span>
        ) : null}

        <span className="team-name truncate text-sm">{team.name}</span>
      </span>
    </span>
  );
}
