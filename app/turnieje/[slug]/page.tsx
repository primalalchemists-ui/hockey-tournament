import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchivedTournamentView } from "@/components/history/archived-tournament-view";
import { mergeTournamentData } from "@/lib/merge-data";

type HistoryPageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * PUBLICZNA STRONA WYNIKÓW ARCHIWALNYCH.
 *
 * WIDOCZNOŚĆ MA JEDEN WARUNEK: `archived_at IS NOT NULL`. Turniej aktywny,
 * przygotowywany albo zakończony, ale jeszcze niezarchiwizowany, jest tu
 * nie do odróżnienia od nieistniejącego — i tak ma być, bo publikacja
 * historii to osobna, jawna decyzja organizatora.
 *
 * To NIE jest druga wersja strony wydarzenia: bez tickera, bez hero
 * bieżącego eventu, bez campu, bez celebracji i bez odpytywania co 13 s.
 */

/*
  Dane archiwalne są praktycznie statyczne. Godzinna rewalidacja wystarcza,
  a archiwizacja i przywrócenie i tak jawnie odświeżają tę ścieżkę.
*/
export const revalidate = 3600;

async function loadArchived(slug: string) {
  const { findArchivedTournamentIdBySlug } = await import(
    "@/lib/data/postgres/public-history"
  );

  const id = await findArchivedTournamentIdBySlug(slug);
  if (!id) return null;

  const { postgresRepository } = await import(
    "@/lib/data/postgres/repository"
  );

  const result = await postgresRepository.getTournamentById(id);
  if (result.status !== "ok") return null;

  const { getPlayoffState } = await import(
    "@/lib/data/postgres/playoff-engine"
  );

  const playoffState =
    result.settings.format === "group_playoff"
      ? await getPlayoffState(id).catch(() => null)
      : null;

  return {
    tournament: mergeTournamentData(result.tournament),
    settings: result.settings,
    playoffState,
  };
}

export async function generateMetadata({
  params,
}: HistoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadArchived(slug);

  if (!data) {
    return { title: "Nie znaleziono turnieju | Festiwal Hokeja" };
  }

  const title = `${data.tournament.title} — wyniki | Festiwal Hokeja`;

  return {
    title,
    description: `Wyniki turnieju ${data.tournament.title}.`,
    openGraph: {
      title,
      description: `Wyniki turnieju ${data.tournament.title}.`,
    },
  };
}

export default async function ArchivedTournamentPage({
  params,
}: HistoryPageProps) {
  const { slug } = await params;
  const data = await loadArchived(slug);

  if (!data) notFound();

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-0 py-4 sm:px-4 sm:py-6 lg:px-6">
        <header className="px-4 py-6 sm:px-0">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            ← Powrót do aktualnych wyników
          </Link>

          <p className="section-eyebrow mt-4">Wyniki turnieju</p>
          <h1 className="section-title mt-1 text-2xl text-slate-900 sm:text-3xl">
            {data.tournament.title}
          </h1>
        </header>

        <ArchivedTournamentView
          tournament={data.tournament}
          structure={data.settings.structure}
          scorersEnabled={data.settings.scorersEnabled}
          playoffState={data.playoffState}
        />
      </div>
    </main>
  );
}
