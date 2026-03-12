// app/page.tsx
import { TournamentShell } from "@/components/tournament-shell";
import { getAirtableTournament } from "@/lib/airtable";
import { mergeTournamentData } from "@/lib/merge-data";

export default async function HomePage() {
  const airtableData = await getAirtableTournament();
  const tournament = mergeTournamentData(airtableData);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <TournamentShell tournament={tournament} />
      </div>
    </main>
  );
}