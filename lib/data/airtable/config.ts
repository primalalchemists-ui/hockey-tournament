export function getAirtableConfig() {
  return {
    baseId: process.env.AIRTABLE_BASE_ID,
    token: process.env.AIRTABLE_TOKEN,
    tables: {
      tournaments: process.env.AIRTABLE_TOURNAMENTS_TABLE ?? "Tournaments",
      teams: process.env.AIRTABLE_TEAMS_TABLE ?? "Teams",
      matches: process.env.AIRTABLE_MATCHES_TABLE ?? "Matches",
      scorers: process.env.AIRTABLE_SCORERS_TABLE ?? "Scorers",
    },
  };
}

export function isAirtableConfigured() {
  const { baseId, token } = getAirtableConfig();
  return Boolean(baseId && token);
}
