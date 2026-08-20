export type GroupKey = string;

export type Team = {
  id: string;
  name: string;
  shortName?: string;
  logoText?: string;
  logoUrl?: string;
  logoName?: string;
  logoType?: string;
  logoPublicId?: string;
  /**
   * Slug logo z globalnej biblioteki (np. "gks-katowice").
   *
   * Świadomie NIE jest to UUID: identyfikatory bazy nie wychodzą poza
   * warstwę danych, a slug jest stabilny i czytelny w payloadzie panelu.
   * Puste = drużyna korzysta jeszcze z historycznego logo w logoUrl.
   */
  logoAssetSlug?: string;
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

export type Scorer = {
  id: string;
  playerName: string;
  jerseyNumber?: number;
  goals: number;
  teamId: string;
};

export type Group = {
  key: GroupKey;
  name: string;
  teams: Team[];
  matches: Match[];
};

export type TournamentAssets = {
  scheduleImage?: string;
  scheduleImageType?: string;
  scheduleImageName?: string;
  scheduleImagePublicId?: string;

  regulationImage?: string;
  regulationImageType?: string;
  regulationImageName?: string;
  regulationImagePublicId?: string;

  heroBannerImage?: string;
  heroBannerImageType?: string;
  heroBannerImageName?: string;
  heroBannerImagePublicId?: string;

  campBannerImage?: string;
  campBannerImageType?: string;
  campBannerImageName?: string;
  campBannerImagePublicId?: string;

  campPosterLeft?: string;
  campPosterLeftType?: string;
  campPosterLeftName?: string;
  campPosterLeftPublicId?: string;

  campPosterRight?: string;
  campPosterRightType?: string;
  campPosterRightName?: string;
  campPosterRightPublicId?: string;
};

export type Tournament = {
  id: string;
  title: string;
  groups: Group[];
  scorers: Scorer[];
  assets: TournamentAssets;
  campStartDate?: string;
  /** Adres zapisów na camp — używany, gdy zapisy są otwarte. */
  campSignupLink?: string;
  /** Nagłówek sekcji campu, np. „Zapisy od 31.08". */
  campTitle?: string;
  /**
   * Czy zapisy są otwarte. Gdy `false`, przycisk „Zapisz się" zostaje
   * na swoim miejscu, ale jest nieaktywny i donikąd nie prowadzi.
   */
  campRegistrationEnabled?: boolean;
  /** Kolor pinezek odliczania (`#RRGGBB`); puste = domyślny czerwony. */
  countdownPinColor?: string;
  tickerMessage?: string;
  showTopScorerTicker?: boolean;
};

export type StandingRow = {
  position: number;
  teamId: string;
  teamName: string;
  logoText?: string;
  logoUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  sourceOrder: number;

  isTieUnresolved?: boolean;
  tieWithTeamIds?: string[];
  tieNote?: string;
};

export type AirtableTournamentPayload = Partial<Tournament>;