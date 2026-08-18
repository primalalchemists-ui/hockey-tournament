type PhaseBannerProps = {
  phaseLabel: string;
  isCompleted: boolean;
};

/**
 * Status aktualnej fazy turnieju.
 *
 * Etykieta pochodzi WYŁĄCZNIE z read modelu (TournamentPhase) —
 * frontend niczego nie wylicza samodzielnie.
 *
 * SECONDARY: to pasek statusu, nie sekcja wyników. Celowo NIE jest
 * pełną kartą — nie może wizualnie konkurować z rankingiem i drabinką.
 */
export function PhaseBanner({ phaseLabel, isCompleted }: PhaseBannerProps) {
  return (
    <section
      className={[
        "mx-3 flex items-center gap-2.5 rounded-full border px-4 py-2 sm:mx-0",
        isCompleted
          ? "border-emerald-300/70 bg-emerald-50/80"
          : "border-[var(--surface-border)] bg-[var(--surface-quiet)]",
      ].join(" ")}
      aria-label="Aktualna faza turnieju"
    >
      <span
        aria-hidden="true"
        className={[
          "h-2 w-2 shrink-0 rounded-full",
          isCompleted ? "bg-emerald-500" : "bg-sky-500",
        ].join(" ")}
      />

      <span className="section-eyebrow shrink-0">Faza</span>

      <span
        className={[
          "min-w-0 truncate text-sm font-semibold",
          isCompleted ? "text-emerald-800" : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        {isCompleted ? "Turniej zakończony" : phaseLabel}
      </span>
    </section>
  );
}
