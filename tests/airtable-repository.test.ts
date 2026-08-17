import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { airtableRepository } from "@/lib/data/airtable/repository";

const originalEnv = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Odpowiada na podstawie nazwy tabeli w URL-u. */
function routeFetch(routes: Record<string, unknown>, status = 200) {
  return vi.fn(async (input: unknown) => {
    const url = String(input);

    for (const [table, body] of Object.entries(routes)) {
      if (url.includes(`/${table}?`)) {
        return jsonResponse(body, status);
      }
    }

    return jsonResponse({ records: [] });
  });
}

const activeTournament = {
  records: [
    {
      id: "recT",
      fields: { slug: "cup", title: "Puchar", isActive: true },
    },
  ],
};

beforeEach(() => {
  process.env.AIRTABLE_BASE_ID = "appTest";
  process.env.AIRTABLE_TOKEN = "tokenTest";
  process.env.AIRTABLE_TOURNAMENTS_TABLE = "Tournaments";
  process.env.AIRTABLE_TEAMS_TABLE = "Teams";
  process.env.AIRTABLE_MATCHES_TABLE = "Matches";
  process.env.AIRTABLE_SCORERS_TABLE = "Scorers";

  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe("airtableRepository.getCurrentTournament", () => {
  it("zwraca status 'ok' z danymi turnieju", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        Tournaments: activeTournament,
        Teams: {
          records: [
            { id: "r1", fields: { group: "A", teamId: "a1", name: "A1", sourceOrder: 1 } },
            { id: "r2", fields: { group: "A", teamId: "a2", name: "A2", sourceOrder: 2 } },
          ],
        },
        Matches: {
          records: [
            {
              id: "m1",
              fields: {
                group: "A",
                matchId: "A-a1-a2",
                homeTeamId: "a1",
                awayTeamId: "a2",
                homeScore: 2,
                awayScore: 1,
              },
            },
          ],
        },
        Scorers: { records: [] },
      })
    );

    const result = await airtableRepository.getCurrentTournament();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.tournament.id).toBe("cup");
    expect(result.tournament.groups?.[0].teams).toHaveLength(2);
    expect(result.tournament.groups?.[0].matches).toHaveLength(1);
  });

  it("zwraca status 'empty' gdy nie ma aktywnego turnieju", async () => {
    vi.stubGlobal("fetch", routeFetch({ Tournaments: { records: [] } }));

    expect(await airtableRepository.getCurrentTournament()).toEqual({
      status: "empty",
    });
  });

  it("zwraca status 'empty' gdy aktywny turniej nie ma sluga", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        Tournaments: { records: [{ id: "recT", fields: { isActive: true } }] },
      })
    );

    expect(await airtableRepository.getCurrentTournament()).toEqual({
      status: "empty",
    });
  });

  it("zwraca status 'error' przy 429 — NIE udaje pustego turnieju", async () => {
    // To jest scenariusz z audytu: rate limit w trakcie turnieju
    // dawał kibicom pustą tabelę bez żadnego komunikatu.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "RATE_LIMIT" }, 429))
    );

    const result = await airtableRepository.getCurrentTournament();

    expect(result.status).toBe("error");
  });

  it("zwraca status 'error' gdy padnie zapytanie o mecze", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("/Tournaments?")) return jsonResponse(activeTournament);
        if (url.includes("/Matches?")) return jsonResponse({ error: "boom" }, 500);
        return jsonResponse({ records: [] });
      })
    );

    const result = await airtableRepository.getCurrentTournament();

    expect(result.status).toBe("error");
  });

  it("zwraca status 'error' przy braku konfiguracji Airtable", async () => {
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_TOKEN;

    const result = await airtableRepository.getCurrentTournament();

    expect(result.status).toBe("error");
  });
});
