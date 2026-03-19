import { ImageResponse } from "next/og";
import { ShareOgCard } from "@/components/share-og-card";
import { getAirtableTournament } from "@/lib/airtable";
import { mergeTournamentData } from "@/lib/merge-data";
import { calculateStandings } from "@/lib/standings";
import { normalizeLogoUrlForServer } from "@/lib/share-preview";

export const runtime = "nodejs";

function getSortedScorers(
  scorers: Array<{
    id: string;
    playerName: string;
    goals: number;
    teamId: string;
  }>
) {
  return [...scorers].sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") || "live";
    const groupKey = url.searchParams.get("group") || "";
    const baseUrl = url.origin;

    const airtableData = await getAirtableTournament();
    const tournament = mergeTournamentData(airtableData);

    const bannerUrl = normalizeLogoUrlForServer(
      tournament.assets.heroBannerImage,
      baseUrl
    );

    if (tab === "scorers") {
      const allTeams = tournament.groups.flatMap((group) => group.teams);
      const teamMap = new Map(allTeams.map((team) => [team.id, team]));
      const sortedScorers = getSortedScorers(tournament.scorers ?? []);

      const rows = sortedScorers.slice(0, 5).map((scorer, index) => {
        const team = teamMap.get(scorer.teamId);

        return {
          position: index + 1,
          label: scorer.playerName,
          secondary: team?.name || "Brak drużyny",
          value: scorer.goals,
          logoUrl: normalizeLogoUrlForServer(team?.logoUrl, baseUrl),
          logoText: team?.shortName || team?.logoText || "LOGO",
        };
      });

      return new ImageResponse(
        <ShareOgCard
          mode="scorers"
          title="Strzelcy"
          subtitle="TOP 5 najlepszych strzelców"
          rows={rows}
          bannerUrl={bannerUrl}
        />,
        {
          width: 1200,
          height: 630,
        }
      );
    }

    const selectedGroup =
      tournament.groups.find((group) => group.key === groupKey) ||
      tournament.groups[0];

    const standings = selectedGroup ? calculateStandings(selectedGroup) : [];

    const rows = standings.slice(0, 5).map((row) => ({
      position: row.isTieUnresolved ? "?" : row.position,
      label: row.teamName,
      wins: row.wins,
      losses: row.losses,
      points: row.points,
      goals: `${row.goalsFor}:${row.goalsAgainst}`,
      logoUrl: normalizeLogoUrlForServer(row.logoUrl, baseUrl),
      logoText: row.logoText ?? "LOGO",
    }));

    return new ImageResponse(
      <ShareOgCard
        mode="ranking"
        title="Ranking"
        subtitle={`TOP 5 • ${selectedGroup?.name || "Grupa"}`}
        rows={rows}
        bannerUrl={bannerUrl}
      />,
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error("OG route error:", error);

    return new Response("OG image generation failed", {
      status: 500,
    });
  }
}