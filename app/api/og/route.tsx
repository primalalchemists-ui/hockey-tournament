import { ImageResponse } from "next/og";
import { ShareOgCard } from "@/components/share-og-card";
import { getAirtableTournament } from "@/lib/airtable";
import { mergeTournamentData } from "@/lib/merge-data";
import { calculateStandings } from "@/lib/standings";
import { normalizeLogoUrlForServer } from "@/lib/share-preview";

export const runtime = "edge";

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
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "live";
  const groupKey = url.searchParams.get("group") || "";
  const baseUrl = url.origin;

  const airtableData = await getAirtableTournament();
  const tournament = mergeTournamentData(airtableData);

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
        extra: team?.shortName || "—",
        logoUrl: normalizeLogoUrlForServer(team?.logoUrl, baseUrl),
        logoText: team?.shortName || team?.logoText || "LOGO",
      };
    });

    return new ImageResponse(
      <ShareOgCard
        title="Strzelcy"
        subtitle="TOP 5 najlepszych strzelców"
        rows={rows}
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
    secondary: `Bramki ${row.goalsFor}:${row.goalsAgainst}`,
    value: row.points,
    extra:
      row.goalDifference > 0 ? `+${row.goalDifference}` : `${row.goalDifference}`,
    logoUrl: normalizeLogoUrlForServer(row.logoUrl, baseUrl),
    logoText: row.logoText ?? "LOGO",
  }));

  return new ImageResponse(
    <ShareOgCard
      title="Ranking"
      subtitle={`TOP 5 • ${selectedGroup?.name || "Grupa"}`}
      rows={rows}
    />,
    {
      width: 1200,
      height: 630,
    }
  );
}