/**
 * SEED BIBLIOTEKI LOGOTYPÓW Z ISTNIEJĄCYCH DANYCH.
 *
 * Co robi:
 *   - zakłada wiersz biblioteki dla KAŻDEGO istniejącego, unikalnego
 *     assetu Cloudinary używanego przez realne drużyny,
 *   - podpina drużyny do tych wierszy (teams.logo_asset_id),
 *   - zapamiętuje nazwy drużyn jako aliasy.
 *
 * Czego NIE robi — i to jest tu najważniejsze:
 *   - NIE wgrywa niczego do Cloudinary,
 *   - NIE zmienia public_id, nie przenosi i nie kasuje plików,
 *   - NIE scala duplikatów (te zostają w raporcie audytu),
 *   - NIE zmienia logo_url żadnej drużyny — każdy zespół zachowuje
 *     dokładnie ten sam obrazek co przed migracją.
 *
 * Jest idempotentny: kolejne uruchomienie nie tworzy duplikatów.
 *
 * Uruchomienie:
 *   npm run logos:seed -- --dry-run
 *   npm run logos:seed
 */

import { createHash } from "node:crypto";
import { eq, isNull } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { teamLogoAliases, teamLogoAssets, teams, tournaments } from "@/lib/db/schema";
import {
  detectSquadVariant,
  normalizeTeamNameForLogoMatching,
  slugifyLogoName,
  suggestCanonicalName,
} from "@/lib/logos/normalize";

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_HASH = process.argv.includes("--no-hash");

type Candidate = {
  key: string;
  url: string;
  publicId: string | null;
  teamNames: string[];
  teamIds: string[];
  contentHash: string | null;
};

async function hashRemoteFile(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    return createHash("sha256")
      .update(Buffer.from(await response.arrayBuffer()))
      .digest("hex");
  } catch {
    return null;
  }
}

async function main() {
  const db = getDb();

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      logoUrl: teams.logoUrl,
      logoPublicId: teams.logoPublicId,
      logoAssetId: teams.logoAssetId,
      tournamentTitle: tournaments.title,
    })
    .from(teams)
    .innerJoin(tournaments, eq(teams.tournamentId, tournaments.id))
    .orderBy(tournaments.title, teams.sourceOrder);

  const withLogo = rows.filter((row) => Boolean(row.logoUrl));

  // Tożsamością pliku jest public_id (albo URL, gdy public_id brak).
  const candidates = new Map<string, Candidate>();

  for (const row of withLogo) {
    const key = row.logoPublicId || row.logoUrl!;
    const candidate = candidates.get(key) ?? {
      key,
      url: row.logoUrl!,
      publicId: row.logoPublicId,
      teamNames: [],
      teamIds: [],
      contentHash: null,
    };

    candidate.teamNames.push(row.teamName);
    candidate.teamIds.push(row.teamId);
    candidates.set(key, candidate);
  }

  console.log(`drużyn z logo:      ${withLogo.length}`);
  console.log(`unikalnych assetów: ${candidates.size}`);
  console.log(DRY_RUN ? "TRYB: próbny (bez zapisu)" : "TRYB: zapis");
  console.log("");

  if (!SKIP_HASH) {
    for (const candidate of candidates.values()) {
      candidate.contentHash = await hashRemoteFile(candidate.url);
    }
  }

  /*
    Najpierw drużyny BEZ końcówki wariantu — dzięki temu "NAPRZÓD JANÓW
    KATOWICE" zajmuje swoją naturalną nazwę, a "… 2" dostaje własną,
    zamiast odwrotnie.
  */
  const ordered = [...candidates.values()].sort((a, b) => {
    const aVariant = detectSquadVariant(a.teamNames[0]).suffix ? 1 : 0;
    const bVariant = detectSquadVariant(b.teamNames[0]).suffix ? 1 : 0;
    return aVariant - bVariant;
  });

  await seed(db, ordered);
}

type Database = ReturnType<typeof getDb>;

/**
 * Dobiera wolną nazwę własną.
 *
 * Duplikaty bajtowe (np. dwa pliki GKS Katowice) NIE są scalane w tym
 * etapie — każdy plik dostaje własny wiersz, żeby żadna drużyna nie
 * zmieniła URL-a. Drugi w kolejności zachowuje pełną nazwę drużyny.
 */
function pickCanonicalName(
  candidate: Candidate,
  usedNormalized: Set<string>
): string {
  const preferred = suggestCanonicalName(candidate.teamNames[0]);

  if (!usedNormalized.has(normalizeTeamNameForLogoMatching(preferred))) {
    return preferred;
  }

  const full = candidate.teamNames[0].trim().replace(/\s+/g, " ");

  if (!usedNormalized.has(normalizeTeamNameForLogoMatching(full))) {
    return full;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidateName = `${preferred} (${index})`;
    if (!usedNormalized.has(normalizeTeamNameForLogoMatching(candidateName))) {
      return candidateName;
    }
  }

  return `${preferred} (${Date.now()})`;
}

async function seed(db: Database, candidates: Candidate[]) {
  const existingAssets = await db.select().from(teamLogoAssets);

  const assetByPublicId = new Map(
    existingAssets
      .filter((asset) => asset.cloudinaryPublicId)
      .map((asset) => [asset.cloudinaryPublicId!, asset])
  );
  const assetByUrl = new Map(existingAssets.map((asset) => [asset.url, asset]));

  const usedNormalized = new Set(
    existingAssets.map((asset) => asset.normalizedName)
  );
  const usedSlugs = new Set(existingAssets.map((asset) => asset.slug));
  // Hash jest unikalny w bazie: duplikat bajtowy dostaje NULL i czeka
  // na świadomą decyzję o scaleniu.
  const usedHashes = new Set(
    existingAssets
      .map((asset) => asset.contentHash)
      .filter((hash): hash is string => Boolean(hash))
  );

  let created = 0;
  let reused = 0;
  let linkedTeams = 0;
  let aliases = 0;
  let duplicateHashes = 0;

  for (const candidate of candidates) {
    const existing =
      (candidate.publicId ? assetByPublicId.get(candidate.publicId) : null) ??
      assetByUrl.get(candidate.url) ??
      null;

    let assetId = existing?.id ?? null;
    let canonicalName = existing?.canonicalName ?? "";

    if (existing) {
      reused += 1;
    } else {
      canonicalName = pickCanonicalName(candidate, usedNormalized);

      const normalized = normalizeTeamNameForLogoMatching(canonicalName);
      let slug = slugifyLogoName(canonicalName);

      for (let index = 2; usedSlugs.has(slug); index += 1) {
        slug = `${slugifyLogoName(canonicalName)}-${index}`;
      }

      const hashIsFree =
        candidate.contentHash && !usedHashes.has(candidate.contentHash);

      if (candidate.contentHash && !hashIsFree) duplicateHashes += 1;

      console.log(
        `+ ${canonicalName}  [${candidate.teamNames.join(", ")}]${
          candidate.contentHash && !hashIsFree ? "  (duplikat bajtowy)" : ""
        }`
      );

      if (!DRY_RUN) {
        const [row] = await db
          .insert(teamLogoAssets)
          .values({
            canonicalName,
            normalizedName: normalized,
            slug,
            url: candidate.url,
            cloudinaryPublicId: candidate.publicId,
            contentHash: hashIsFree ? candidate.contentHash : null,
          })
          .returning();

        assetId = row.id;
      }

      usedNormalized.add(normalized);
      usedSlugs.add(slug);
      if (hashIsFree && candidate.contentHash) usedHashes.add(candidate.contentHash);

      created += 1;
    }

    if (DRY_RUN || !assetId) continue;

    // Powiązanie drużyn — logo_url zostaje nietknięty.
    for (const teamId of candidate.teamIds) {
      await db
        .update(teams)
        .set({ logoAssetId: assetId })
        .where(eq(teams.id, teamId));

      linkedTeams += 1;
    }

    // Nazwy drużyn jako aliasy: następnym razem trafimy dokładnie.
    for (const teamName of new Set(candidate.teamNames)) {
      const normalizedAlias = normalizeTeamNameForLogoMatching(teamName);

      if (!normalizedAlias) continue;
      if (normalizedAlias === normalizeTeamNameForLogoMatching(canonicalName)) {
        continue;
      }

      const taken = await db
        .select({ id: teamLogoAliases.id })
        .from(teamLogoAliases)
        .where(eq(teamLogoAliases.normalizedAlias, normalizedAlias))
        .limit(1);

      if (taken.length > 0) continue;

      const collides = await db
        .select({ id: teamLogoAssets.id })
        .from(teamLogoAssets)
        .where(eq(teamLogoAssets.normalizedName, normalizedAlias))
        .limit(1);

      if (collides.length > 0) continue;

      await db.insert(teamLogoAliases).values({
        logoAssetId: assetId,
        alias: teamName.trim().replace(/\s+/g, " "),
        normalizedAlias,
      });

      aliases += 1;
    }
  }

  const orphans = await db
    .select({ count: teams.id })
    .from(teams)
    .where(isNull(teams.logoAssetId));

  console.log("");
  console.log(`nowe wpisy biblioteki:    ${created}`);
  console.log(`istniejące (bez zmian):   ${reused}`);
  console.log(`podpiętych drużyn:        ${linkedTeams}`);
  console.log(`dodanych aliasów:         ${aliases}`);
  console.log(`duplikaty bajtowe:        ${duplicateHashes} (hash pozostaje pusty)`);
  console.log(`drużyn bez biblioteki:    ${orphans.length}`);
  console.log("");
  console.log("Cloudinary: 0 uploadów, 0 zmian nazw, 0 usunięć.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
