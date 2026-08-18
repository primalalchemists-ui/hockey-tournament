import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { teamLogoAliases, teamLogoAssets, teams } from "@/lib/db/schema";
import {
  normalizeTeamNameForLogoMatching,
  slugifyLogoName,
} from "@/lib/logos/normalize";
import {
  matchTeamNameToLogos,
  searchLogos,
  type LogoMatchResult,
} from "@/lib/logos/matching";

/**
 * BIBLIOTEKA LOGOTYPÓW — warstwa danych.
 *
 * Świadomie BEZ znacznika "server-only": ten moduł jest importowany przez
 * repozytorium, a repozytorium używają też skrypty CLI (import danych,
 * seed, setup SUN CUP). Granicą klient/serwer jest lib/data/index.ts.
 *
 * Wszystko, co panel widzi o logo, przechodzi przez ten moduł. Panel NIGDY
 * nie dostaje UUID-a ani surowego public_id: tożsamością na zewnątrz jest
 * `slug`, a obrazek dostaje w gotowej, małej wersji.
 */

/** Kształt widziany przez panel — bez UUID, bez public_id, bez hasha. */
export type LogoLibraryItem = {
  slug: string;
  canonicalName: string;
  normalizedName: string;
  normalizedAliases: string[];
  /** Pełny URL — używany po przypisaniu do drużyny. */
  url: string;
  /** Mały podgląd do listy w dialogu. */
  thumbnailUrl: string;
};

/**
 * Miniatura z transformacji Cloudinary — bez ruszania oryginału.
 * Dla adresów spoza Cloudinary zwracamy URL bez zmian.
 */
export function toThumbnailUrl(url: string): string {
  if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) return url;

  // .../upload/<transformacje>/<public_id>
  return url.replace(
    "/upload/",
    "/upload/c_fit,w_96,h_96,q_auto,f_auto/"
  );
}

function toItem(
  asset: typeof teamLogoAssets.$inferSelect,
  aliases: string[]
): LogoLibraryItem {
  return {
    slug: asset.slug,
    canonicalName: asset.canonicalName,
    normalizedName: asset.normalizedName,
    normalizedAliases: aliases,
    url: asset.url,
    thumbnailUrl: toThumbnailUrl(asset.url),
  };
}

/** Cała biblioteka z aliasami — dwa zapytania, bez N+1. */
export async function listLogoLibrary(): Promise<LogoLibraryItem[]> {
  const db = getDb();

  const [assets, aliases] = await Promise.all([
    db.select().from(teamLogoAssets).orderBy(teamLogoAssets.canonicalName),
    db.select().from(teamLogoAliases),
  ]);

  const byAsset = new Map<string, string[]>();
  for (const alias of aliases) {
    const list = byAsset.get(alias.logoAssetId) ?? [];
    list.push(alias.normalizedAlias);
    byAsset.set(alias.logoAssetId, list);
  }

  return assets.map((asset) => toItem(asset, byAsset.get(asset.id) ?? []));
}

export async function searchLogoLibrary(query: string) {
  return searchLogos(query, await listLogoLibrary());
}

/** Propozycje dla nazwy drużyny — patrz lib/logos/matching.ts. */
export async function suggestLogosForTeamName(
  teamName: string
): Promise<LogoMatchResult<LogoLibraryItem>> {
  return matchTeamNameToLogos(teamName, await listLogoLibrary());
}

/* ==========================================================================
 * ZAPIS
 * ======================================================================== */

export type UpsertLogoInput = {
  canonicalName: string;
  url: string;
  cloudinaryPublicId: string | null;
  contentHash: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
};

/** Wynik dodania logo — panel musi wiedzieć, czy powstał nowy plik. */
export type UpsertLogoResult = {
  item: LogoLibraryItem;
  /** true, gdy identyczny obraz/nazwa były już w bibliotece. */
  reusedExisting: boolean;
};

/**
 * Rezerwuje wolny slug.
 *
 * NIGDY nie nadpisujemy cudzego assetu: jeśli slug jest zajęty przez inny
 * herb, dokładamy bezpieczny sufiks. Kolizja nazw to nie powód, żeby
 * skasować czyjś plik.
 */
export async function reserveLogoSlug(
  canonicalName: string,
  excludeAssetId?: string
): Promise<string> {
  const db = getDb();
  const base = slugifyLogoName(canonicalName);

  const taken = await db
    .select({ slug: teamLogoAssets.slug, id: teamLogoAssets.id })
    .from(teamLogoAssets)
    .where(sql`${teamLogoAssets.slug} like ${base + "%"}`);

  const used = new Set(
    taken.filter((row) => row.id !== excludeAssetId).map((row) => row.slug)
  );

  if (!used.has(base)) return base;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${base}-${Date.now()}`;
}

/** Szuka assetu o identycznej zawartości pliku. */
export async function findLogoByContentHash(
  contentHash: string
): Promise<LogoLibraryItem | null> {
  const db = getDb();

  const rows = await db
    .select()
    .from(teamLogoAssets)
    .where(eq(teamLogoAssets.contentHash, contentHash))
    .limit(1);

  if (rows.length === 0) return null;

  const aliases = await db
    .select({ normalizedAlias: teamLogoAliases.normalizedAlias })
    .from(teamLogoAliases)
    .where(eq(teamLogoAliases.logoAssetId, rows[0].id));

  return toItem(
    rows[0],
    aliases.map((row) => row.normalizedAlias)
  );
}

/** Szuka assetu po nazwie własnej (po normalizacji). */
export async function findLogoByName(
  canonicalName: string
): Promise<LogoLibraryItem | null> {
  const db = getDb();
  const normalized = normalizeTeamNameForLogoMatching(canonicalName);

  const rows = await db
    .select()
    .from(teamLogoAssets)
    .where(eq(teamLogoAssets.normalizedName, normalized))
    .limit(1);

  if (rows.length === 0) return null;

  const aliases = await db
    .select({ normalizedAlias: teamLogoAliases.normalizedAlias })
    .from(teamLogoAliases)
    .where(eq(teamLogoAliases.logoAssetId, rows[0].id));

  return toItem(
    rows[0],
    aliases.map((row) => row.normalizedAlias)
  );
}

/**
 * Dodaje logo do biblioteki albo zwraca istniejące.
 *
 * Kolejność sprawdzania jest istotna dla oszczędności miejsca:
 *   1. identyczna zawartość pliku (hash) — ten sam obraz pod inną nazwą,
 *   2. identyczna nazwa własna — ten sam klub.
 */
export async function upsertLogoAsset(
  input: UpsertLogoInput
): Promise<UpsertLogoResult> {
  const db = getDb();

  if (input.contentHash) {
    const existing = await findLogoByContentHash(input.contentHash);
    if (existing) return { item: existing, reusedExisting: true };
  }

  const byName = await findLogoByName(input.canonicalName);
  if (byName) return { item: byName, reusedExisting: true };

  const canonicalName = input.canonicalName.trim().replace(/\s+/g, " ");
  const slug = await reserveLogoSlug(canonicalName);

  const [created] = await db
    .insert(teamLogoAssets)
    .values({
      canonicalName,
      normalizedName: normalizeTeamNameForLogoMatching(canonicalName),
      slug,
      url: input.url,
      cloudinaryPublicId: input.cloudinaryPublicId,
      contentHash: input.contentHash,
      width: input.width ?? null,
      height: input.height ?? null,
      format: input.format ?? null,
    })
    .returning();

  return { item: toItem(created, []), reusedExisting: false };
}

/**
 * Zapamiętuje wariant nazwy prowadzący do danego herbu.
 *
 * Wywoływane WYŁĄCZNIE po świadomym przypisaniu logo do drużyny — nigdy
 * przy samym podpowiadaniu. Nazwa, która jest już nazwą własną innego
 * assetu, nigdy nie stanie się aliasem: to zniszczyłoby dokładne trafienia.
 */
export async function learnAlias(
  logoSlug: string,
  teamName: string
): Promise<"created" | "exists" | "skipped"> {
  const db = getDb();
  const normalized = normalizeTeamNameForLogoMatching(teamName);

  if (!normalized) return "skipped";

  const [asset] = await db
    .select({ id: teamLogoAssets.id, normalizedName: teamLogoAssets.normalizedName })
    .from(teamLogoAssets)
    .where(eq(teamLogoAssets.slug, logoSlug))
    .limit(1);

  if (!asset) return "skipped";
  if (asset.normalizedName === normalized) return "exists";

  // Nazwa własna innego herbu nie może zostać przejęta jako alias.
  const collidingAsset = await db
    .select({ id: teamLogoAssets.id })
    .from(teamLogoAssets)
    .where(
      and(
        eq(teamLogoAssets.normalizedName, normalized),
        ne(teamLogoAssets.id, asset.id)
      )
    )
    .limit(1);

  if (collidingAsset.length > 0) return "skipped";

  const existing = await db
    .select({ id: teamLogoAliases.id, logoAssetId: teamLogoAliases.logoAssetId })
    .from(teamLogoAliases)
    .where(eq(teamLogoAliases.normalizedAlias, normalized))
    .limit(1);

  if (existing.length > 0) {
    // Alias zajęty przez inny herb — nie przepinamy go po cichu.
    return existing[0].logoAssetId === asset.id ? "exists" : "skipped";
  }

  await db.insert(teamLogoAliases).values({
    logoAssetId: asset.id,
    alias: teamName.trim().replace(/\s+/g, " "),
    normalizedAlias: normalized,
  });

  return "created";
}

/** Mapa slug -> id, potrzebna przy zapisie drużyn. */
export async function resolveLogoAssetIds(
  slugs: string[]
): Promise<Map<string, { id: string; url: string; publicId: string | null }>> {
  const unique = [...new Set(slugs.filter(Boolean))];
  const map = new Map<string, { id: string; url: string; publicId: string | null }>();

  if (unique.length === 0) return map;

  const rows = await getDb()
    .select({
      id: teamLogoAssets.id,
      slug: teamLogoAssets.slug,
      url: teamLogoAssets.url,
      publicId: teamLogoAssets.cloudinaryPublicId,
    })
    .from(teamLogoAssets)
    .where(inArray(teamLogoAssets.slug, unique));

  for (const row of rows) {
    map.set(row.slug, { id: row.id, url: row.url, publicId: row.publicId });
  }

  return map;
}

/** Ile drużyn korzysta z danego assetu — do audytu i raportów. */
export async function countTeamsUsingLibrary(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(isNotNull(teams.logoAssetId));

  return rows[0]?.count ?? 0;
}
