// types/tournament.ts
export type GroupKey = string;

export type Team = {
  id: string;
  name: string;
  shortName?: string;
  logoText: string;
  sourceOrder: number;
};

export type Match = {
  id: string;
  group: GroupKey;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

export type Group = {
  key: GroupKey;
  name: string;
  teams: Team[];
  matches: Match[];
};

export type TournamentAssets = {
  scheduleImage: string;
  regulationImage: string;
};

export type Tournament = {
  id: string;
  title: string;
  groups: Group[];
  assets: TournamentAssets;
};

export type StandingRow = {
  position: number;
  teamId: string;
  teamName: string;
  logoText: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  sourceOrder: number;
};

export type AirtableTournamentPayload = Partial<Tournament>;