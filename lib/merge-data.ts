// lib/merge-data.ts
import { fallbackTournament } from "@/data/fallback-tournament";
import type { Tournament } from "@/types/tournament";

export function mergeTournamentData(airtableData?: Partial<Tournament> | null): Tournament {
  if (!airtableData) return fallbackTournament;

  return {
    ...fallbackTournament,
    ...airtableData,
    assets: {
      ...fallbackTournament.assets,
      ...airtableData.assets,
    },
    groups: airtableData.groups?.length ? airtableData.groups : fallbackTournament.groups,
  };
}