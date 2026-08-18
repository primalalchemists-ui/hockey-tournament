import type { Metadata } from "next";
import { headers } from "next/headers";
import { DataError } from "@/components/data-error";
import { TournamentShell } from "@/components/tournament-shell";
import { loadCurrentTournament } from "@/lib/data";
import { mergeTournamentData } from "@/lib/merge-data";

type SearchParams = Promise<{
  tab?: string;
  group?: string;
}>;

type HomePageProps = {
  searchParams: SearchParams;
};

function getBaseUrlFromHeaders(h: Headers) {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  if (!host) {
    return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  }

  return `${proto}://${host}`;
}

export async function generateMetadata({
  searchParams,
}: HomePageProps): Promise<Metadata> {
  const params = await searchParams;
  const h = await headers();
  const baseUrl = getBaseUrlFromHeaders(h);

  const tab = params.tab === "scorers" ? "scorers" : "live";

  const result = await loadCurrentTournament();

  if (result.status === "error") {
    return {
      title: "Wyniki live",
      description: "Trwa przywracanie połączenia z danymi turnieju.",
    };
  }

  const tournament = mergeTournamentData(
    result.status === "ok" ? result.tournament : null
  );

  const selectedGroup =
    tournament.groups.find((group) => group.key === params.group) ||
    tournament.groups[0];

  const title =
    tab === "scorers"
      ? `Strzelcy - ${tournament.title}`
      : `Wyniki live - ${tournament.title}`;

  const description =
    tab === "scorers"
      ? "TOP 5 najlepszych strzelców"
      : `TOP 5 • ${selectedGroup?.name || "Grupa"}`;

  const ogImageUrl = `${baseUrl}/api/og?tab=${tab}&group=${encodeURIComponent(
    selectedGroup?.key || ""
  )}`;

  const canonicalUrl =
    tab === "scorers"
      ? `${baseUrl}/?tab=scorers`
      : `${baseUrl}/?tab=live&group=${encodeURIComponent(selectedGroup?.key || "")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const result = await loadCurrentTournament();

  if (result.status === "error") {
    return <DataError />;
  }

  const tournament = mergeTournamentData(
    result.status === "ok" ? result.tournament : null
  );

  // Jeden spójny snapshot publiczny — ten sam kształt, który klient pobiera
  // później przy auto-odświeżaniu. Zero duplikacji reguł.
  let playoffState = null;
  let tournamentId: string | null = null;
  let revision = 0;

  if (result.status === "ok") {
    try {
      const { getPublicSnapshot } = await import(
        "@/lib/data/postgres/public-snapshot"
      );

      const snapshot = await getPublicSnapshot();

      if (snapshot) {
        playoffState = snapshot.playoffState;
        tournamentId = snapshot.tournamentId;
        revision = snapshot.revision;
      }
    } catch (error) {
      // Awaria sekcji pucharowej nie może wywrócić całej strony wyników.
      console.error("[public] snapshot failed:", error);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-0 py-4 sm:px-4 sm:py-6 lg:px-6">
        <TournamentShell
          tournament={tournament}
          structure={
            result.status === "ok" ? result.settings.structure : "groups"
          }
          playoffState={playoffState}
          tournamentId={tournamentId}
          revision={revision}
          initialTab={params.tab === "scorers" ? "scorers" : "live"}
          initialGroupKey={params.group}
        />
      </div>
    </main>
  );
}
