import { getAirtableConfig } from "./config";

export type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

export type AirtableAttachment = {
  id?: string;
  url: string;
  filename?: string;
  type?: string;
};

export class AirtableRequestError extends Error {
  readonly table: string;
  readonly status: number;

  constructor(table: string, status: number, detail?: string) {
    super(
      `Airtable request failed: ${table} ${status}${detail ? ` ${detail}` : ""}`
    );
    this.name = "AirtableRequestError";
    this.table = table;
    this.status = status;
  }
}

function getHeaders() {
  const { token } = getAirtableConfig();

  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getTableUrl(tableName: string) {
  const { baseId } = getAirtableConfig();

  if (!baseId) {
    throw new Error("Missing AIRTABLE_BASE_ID");
  }

  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

type FetchAllOptions = {
  /** Opcje cache przekazywane do fetch (Next Data Cache lub no-store). */
  requestInit?: RequestInit;
  /**
   * Zabezpieczenie przed nieskończoną pętlą paginacji.
   * 20 stron x 100 rekordów = 2000 rekordów na tabelę.
   */
  maxPages?: number;
};

/**
 * Pobiera WSZYSTKIE rekordy z tabeli, przechodząc przez paginację Airtable.
 *
 * Airtable zwraca maksymalnie 100 rekordów na stronę i kursor `offset`.
 * Poprzednia implementacja ignorowała `offset`, przez co rekordy powyżej
 * setnego cicho znikały z aplikacji.
 *
 * Jeśli wywołujący poda `maxRecords`, Airtable sam ogranicza wynik
 * i nie zwraca kursora — paginacja jest wtedy pomijana naturalnie.
 */
export async function airtableFetchAll<TFields>(
  tableName: string,
  params?: Record<string, string>,
  options?: FetchAllOptions
): Promise<AirtableRecord<TFields>[]> {
  const maxPages = options?.maxPages ?? 20;
  const records: AirtableRecord<TFields>[] = [];

  let offset: string | undefined;
  let page = 0;

  do {
    const searchParams = new URLSearchParams(params);
    if (offset) {
      searchParams.set("offset", offset);
    }

    const url = `${getTableUrl(tableName)}?${searchParams.toString()}`;

    const response = await fetch(url, {
      ...options?.requestInit,
      headers: getHeaders(),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AirtableRequestError(tableName, response.status, detail);
    }

    const json = (await response.json()) as {
      records?: AirtableRecord<TFields>[];
      offset?: string;
    };

    records.push(...(json.records ?? []));
    offset = json.offset;
    page += 1;
  } while (offset && page < maxPages);

  return records;
}

export async function airtableCreate<TFields extends Record<string, unknown>>(
  tableName: string,
  fields: TFields
) {
  const response = await fetch(getTableUrl(tableName), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ records: [{ fields }] }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AirtableRequestError(tableName, response.status, detail);
  }

  return response.json();
}

export async function airtableUpdate<TFields extends Record<string, unknown>>(
  tableName: string,
  recordId: string,
  fields: TFields
) {
  const response = await fetch(getTableUrl(tableName), {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AirtableRequestError(tableName, response.status, detail);
  }

  return response.json();
}

export async function airtableDelete(tableName: string, recordIds: string[]) {
  if (recordIds.length === 0) return;

  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);

    const searchParams = new URLSearchParams();
    batch.forEach((id) => searchParams.append("records[]", id));

    const response = await fetch(
      `${getTableUrl(tableName)}?${searchParams.toString()}`,
      {
        method: "DELETE",
        headers: getHeaders(),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AirtableRequestError(tableName, response.status, detail);
    }
  }
}
