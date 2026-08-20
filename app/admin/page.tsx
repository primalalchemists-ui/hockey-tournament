// app/admin/page.tsx
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminShell } from "@/components/admin/admin-shell";
import { TournamentSelector } from "@/components/admin/tournament-selector";
import type { CollectionMember } from "@/lib/data/postgres/collections";
import { DataError } from "@/components/data-error";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getTournamentRepository } from "@/lib/data";
import { mergeTournamentData } from "@/lib/merge-data";

type AdminPageProps = {
  searchParams: Promise<{ tournament?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const isAuthenticated = await isAdminAuthenticated();

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  const repository = getTournamentRepository();
  const params = await searchParams;

  let tournaments;

  try {
    tournaments = await repository.listTournaments();
  } catch (error) {
    console.error("[admin] listTournaments failed:", error);

    return (
      <DataError
        title="Nie można otworzyć panelu"
        description="Odczyt listy turniejów nie powiódł się. Odśwież stronę za chwilę."
      />
    );
  }

  // Który turniej edytujemy: jawny parametr z URL-a, a w razie jego braku
  // turniej wyświetlany publicznie. To NIE zmienia strony publicznej.
  const requestedId = params.tournament?.trim();
  const fallback =
    tournaments.find((item) => item.isCurrent) ?? tournaments[0] ?? null;
  const selectedId = requestedId || fallback?.id || "";

  if (!selectedId) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-2xl px-3 py-10 sm:px-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Brak turniejów</h1>
            <p className="mt-2 text-sm text-slate-600">
              W bazie nie ma jeszcze żadnego turnieju. Utwórz pierwszy, aby
              rozpocząć pracę.
            </p>
            <div className="mt-6">
              <TournamentSelector
                tournaments={[]}
                selectedId=""
                multiTournamentEnabled={repository.supportsMultipleTournaments}
              />
            </div>
          </section>
        </div>
      </main>
    );
  }

  const result = await repository.getTournamentById(selectedId);

  if (result.status === "error") {
    return (
      <DataError
        title="Nie można otworzyć panelu"
        description="Odczyt danych turnieju nie powiódł się. Panel został zablokowany, żeby zapis pustego draftu nie skasował istniejących wyników. Odśwież stronę za chwilę."
      />
    );
  }

  if (result.status === "empty") {
    return (
      <DataError
        title="Turniej nie istnieje"
        description="Wskazany turniej nie został znaleziony. Wróć do panelu i wybierz turniej z listy."
      />
    );
  }

  const tournament = mergeTournamentData(result.tournament);

  // Stan silnika pucharowego ładujemy TYLKO dla formatu group_playoff —
  // turniej ligowy nie dostaje ani faz, ani drabinki.
  let playoffState = null;

  if (
    result.settings.format === "group_playoff" &&
    repository.supportsMultipleTournaments
  ) {
    try {
      const { getPlayoffState } = await import(
        "@/lib/data/postgres/playoff-engine"
      );
      playoffState = await getPlayoffState(selectedId);
    } catch (error) {
      console.error("[admin] getPlayoffState failed:", error);
    }
  }

  /*
    Kategorie wydarzenia — wyłącznie metadane przełącznika. Nie dotykają
    turnieju wyświetlanego publicznie ani danych sportowych.
  */
  let collectionMembers: CollectionMember[] = [];
  let connectable: Array<{ id: string; title: string }> = [];

  try {
    const { getCollectionForTournament, listConnectableTournaments } =
      await import("@/lib/data/postgres/collections");

    collectionMembers =
      (await getCollectionForTournament(selectedId))?.members ?? [];
    connectable = await listConnectableTournaments(selectedId);
  } catch (error) {
    console.error("[admin] collections failed:", error);
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1400px] px-0 py-4 sm:px-4 sm:py-6 lg:px-6">
        <AdminShell
          // Remount przy zmianie turnieju: AdminShell trzyma draft w useState,
          // bez klucza przełączenie pokazałoby dane poprzedniego turnieju.
          key={selectedId}
          tournament={tournament}
          tournamentId={selectedId}
          tournaments={tournaments}
          multiTournamentEnabled={repository.supportsMultipleTournaments}
          settings={result.settings}
          playoffState={playoffState}
          collectionMembers={collectionMembers}
          connectableTournaments={connectable}
        />
      </div>
    </main>
  );
}
