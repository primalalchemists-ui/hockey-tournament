import { afterEach, describe, expect, it, vi } from "vitest";

import { getTournamentRepository } from "@/lib/data";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { resetDbCache } from "@/lib/db/client";
import { MissingDatabaseUrlError, requireDatabaseUrl } from "@/lib/db/env";

const originalDataSource = process.env.DATA_SOURCE;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDataSource === undefined) {
    delete process.env.DATA_SOURCE;
  } else {
    process.env.DATA_SOURCE = originalDataSource;
  }

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  resetDbCache();
  vi.restoreAllMocks();
});

describe("przełącznik DATA_SOURCE", () => {
  it("domyślnie (brak zmiennej) wybiera Airtable", () => {
    delete process.env.DATA_SOURCE;
    expect(getTournamentRepository().name).toBe("airtable");
  });

  it("pusta wartość również wybiera Airtable", () => {
    process.env.DATA_SOURCE = "";
    expect(getTournamentRepository().name).toBe("airtable");
  });

  it('"airtable" wybiera Airtable', () => {
    process.env.DATA_SOURCE = "airtable";
    expect(getTournamentRepository().name).toBe("airtable");
  });

  it('"postgres" wybiera PostgreSQL', () => {
    process.env.DATA_SOURCE = "postgres";
    expect(getTournamentRepository().name).toBe("postgres");
  });

  it("ignoruje wielkość liter i białe znaki", () => {
    process.env.DATA_SOURCE = "  POSTGRES  ";
    expect(getTournamentRepository().name).toBe("postgres");
  });

  it("nieznana wartość powoduje jawny błąd, nie cichy fallback", () => {
    process.env.DATA_SOURCE = "mysql";
    expect(() => getTournamentRepository()).toThrow(/Nieznana wartość DATA_SOURCE/);
  });
});

describe("brak DATABASE_URL", () => {
  it("requireDatabaseUrl rzuca typowanym błędem", () => {
    delete process.env.DATABASE_URL;
    resetDbCache();

    expect(() => requireDatabaseUrl()).toThrow(MissingDatabaseUrlError);
  });

  it("pusty DATABASE_URL traktowany jest jak brak", () => {
    process.env.DATABASE_URL = "   ";
    resetDbCache();

    expect(() => requireDatabaseUrl()).toThrow(MissingDatabaseUrlError);
  });

  it("repozytorium Postgres zwraca kontrolowany status 'error', nie wywala aplikacji", async () => {
    delete process.env.DATABASE_URL;
    resetDbCache();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await postgresRepository.getCurrentTournament();

    expect(result.status).toBe("error");
    if (result.status !== "error") return;

    expect(result.message).toContain("DATABASE_URL");
  });

  it("brak DATABASE_URL nie wpływa na adapter Airtable", () => {
    delete process.env.DATABASE_URL;
    process.env.DATA_SOURCE = "airtable";

    expect(() => getTournamentRepository()).not.toThrow();
    expect(getTournamentRepository().name).toBe("airtable");
  });
});
