// app/admin/page.tsx
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminShell } from "@/components/admin/admin-shell";
import { DataError } from "@/components/data-error";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { loadActiveTournament } from "@/lib/data";
import { mergeTournamentData } from "@/lib/merge-data";

export default async function AdminPage() {
  const isAuthenticated = await isAdminAuthenticated();

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  const result = await loadActiveTournament();

  // Krytyczne: przy błędzie odczytu NIE wolno pokazać pustego draftu.
  // Zapis takiego draftu skasowałby wszystkie drużyny i mecze w bazie.
  if (result.status === "error") {
    return (
      <DataError
        title="Nie można otworzyć panelu"
        description="Odczyt danych turnieju nie powiódł się. Panel został zablokowany, żeby zapis pustego draftu nie skasował istniejących wyników. Odśwież stronę za chwilę."
      />
    );
  }

  const tournament = mergeTournamentData(
    result.status === "ok" ? result.tournament : null
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <AdminShell tournament={tournament} />
      </div>
    </main>
  );
}
