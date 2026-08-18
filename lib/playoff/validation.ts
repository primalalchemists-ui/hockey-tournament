/**
 * CZYTELNE BŁĘDY OPERACJI — czysta struktura danych, zero IO i zero DOM.
 *
 * Administrator dostawał wcześniej komunikat w rodzaju:
 *
 *   po-B-semifinal-0: brak wyniku
 *
 * To jest identyfikator techniczny, przydatny w logach, ale w hali nikomu
 * nie mówi, którego meczu brakuje. Silnik nadal używa stabilnych ID
 * wewnętrznie — natomiast na zewnątrz oddaje strukturę, z której UI składa
 * komunikat z herbami i pełnymi nazwami drużyn.
 */

export type IssueTeam = {
  name: string;
  logoUrl: string | null;
  logoText: string | null;
  /** Rozstawienie z zamrożonej tabeli; null gdy nieznane. */
  seed: number | null;
};

export type IssueReason = "missing_result" | "draw" | "unknown_participants";

export type IssueMatch = {
  groupName: string;
  roundLabel: string;
  /** null = uczestnik nie jest jeszcze znany (pokazujemy „?"). */
  home: IssueTeam | null;
  away: IssueTeam | null;
  reason: IssueReason;
};

export type OperationIssueReport = {
  /** Nagłówek okna błędu, np. „Nie można zakończyć półfinałów". */
  title: string;
  /** Zdanie pod nagłówkiem, np. „Uzupełnij wyniki poniższych meczów:". */
  hint: string;
  matches: IssueMatch[];
};

export const ISSUE_REASON_LABELS: Record<IssueReason, string> = {
  missing_result: "brak wyniku",
  draw: "remis jest niedozwolony",
  unknown_participants: "nieznani uczestnicy",
};

/** Mecze pogrupowane po grupie — dokładnie tak, jak render ich oczekuje. */
export function groupIssuesByGroup(
  matches: IssueMatch[]
): Array<{ groupName: string; matches: IssueMatch[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, IssueMatch[]>();

  for (const match of matches) {
    if (!byGroup.has(match.groupName)) {
      byGroup.set(match.groupName, []);
      order.push(match.groupName);
    }

    byGroup.get(match.groupName)!.push(match);
  }

  return order.map((groupName) => ({
    groupName,
    matches: byGroup.get(groupName)!,
  }));
}

/**
 * Zapasowy tekst komunikatu.
 *
 * Używany tam, gdzie struktura nie dojedzie (np. log serwera), więc też
 * nie może zawierać identyfikatorów technicznych.
 */
export function describeIssueReport(report: OperationIssueReport): string {
  const lines = report.matches.map((match) => {
    const home = match.home?.name ?? "?";
    const away = match.away?.name ?? "?";

    return `${match.groupName} · ${match.roundLabel}: ${home} — ${away} (${ISSUE_REASON_LABELS[match.reason]})`;
  });

  return [report.title, report.hint, ...lines].join("\n");
}
