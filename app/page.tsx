// app/page.tsx
// import { CampBanner } from "@/components/camp-banner";
import { TournamentShell } from "@/components/tournament-shell";
import { getAirtableTournament } from "@/lib/airtable";
import { mergeTournamentData } from "@/lib/merge-data";

export default async function HomePage() {
  const airtableData = await getAirtableTournament();
  const tournament = mergeTournamentData(airtableData);

  return (
    <main className="min-h-screen ">
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <TournamentShell tournament={tournament} />
        {/* <CampBanner
          date="2026-07-01T10:00:00"
          signupLink="https://festiwalhokeja.com/zapisz-sie/"
        /> */}
      </div>
    </main>
  );
}