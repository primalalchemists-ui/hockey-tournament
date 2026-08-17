import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AirtableRequestError,
  airtableFetchAll,
} from "@/lib/data/airtable/client";

const originalEnv = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.AIRTABLE_BASE_ID = "appTest";
  process.env.AIRTABLE_TOKEN = "tokenTest";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe("airtableFetchAll — paginacja", () => {
  it("pobiera wszystkie strony, przekazując kursor offset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ records: [{ id: "r1", fields: {} }], offset: "off1" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ records: [{ id: "r2", fields: {} }], offset: "off2" })
      )
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: "r3", fields: {} }] }));

    vi.stubGlobal("fetch", fetchMock);

    const records = await airtableFetchAll("Matches");

    expect(records.map((record) => record.id)).toEqual(["r1", "r2", "r3"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).not.toContain("offset=");
    expect(urls[1]).toContain("offset=off1");
    expect(urls[2]).toContain("offset=off2");
  });

  it("wykonuje jedno zapytanie, gdy nie ma kursora (regresja limitu 100)", async () => {
    const records = Array.from({ length: 100 }, (_, index) => ({
      id: `r${index}`,
      fields: {},
    }));

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ records }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await airtableFetchAll("Matches")).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("zatrzymuje się na limicie stron zamiast pętlić w nieskończoność", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ records: [{ id: "r", fields: {} }], offset: "always" })
      );

    vi.stubGlobal("fetch", fetchMock);

    await airtableFetchAll("Matches", undefined, { maxPages: 4 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("zachowuje parametry zapytania na każdej stronie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [], offset: "off1" }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }));

    vi.stubGlobal("fetch", fetchMock);

    await airtableFetchAll("Teams", { filterByFormula: '{slug}="x"' });

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("filterByFormula=");
    }
  });
});

describe("airtableFetchAll — błędy", () => {
  it("rzuca AirtableRequestError zamiast po cichu zwracać pustą listę", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "RATE_LIMIT" }, 429))
    );

    await expect(airtableFetchAll("Matches")).rejects.toBeInstanceOf(
      AirtableRequestError
    );
  });

  it("niesie kod statusu i nazwę tabeli", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "NOT_FOUND" }, 404))
    );

    await expect(airtableFetchAll("Teams")).rejects.toMatchObject({
      name: "AirtableRequestError",
      status: 404,
      table: "Teams",
    });
  });
});
