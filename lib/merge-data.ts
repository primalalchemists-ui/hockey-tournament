import { fallbackTournament } from "@/data/fallback-tournament";
import type { Tournament } from "@/types/tournament";

const ENABLE_FALLBACK = false;

function createEmptyTournament(): Tournament {
  return {
    id: "empty-tournament",
    title: "Nowy turniej",
    assets: {
      scheduleImage: "",
      scheduleImageType: "",
      scheduleImageName: "",
      regulationImage: "",
      regulationImageType: "",
      regulationImageName: "",
    },
    groups: [],
  };
}

export function mergeTournamentData(
  airtableData?: Partial<Tournament> | null
): Tournament {
  if (!airtableData) {
    return ENABLE_FALLBACK ? fallbackTournament : createEmptyTournament();
  }

  if (!ENABLE_FALLBACK) {
    return {
      ...createEmptyTournament(),
      ...airtableData,
      assets: {
        ...createEmptyTournament().assets,
        ...airtableData.assets,
      },
      groups: airtableData.groups ?? [],
    };
  }

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