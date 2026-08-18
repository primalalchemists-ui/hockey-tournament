/**
 * SCALENIE POTWIERDZONYCH DUPLIKATÓW LOGOTYPÓW.
 *
 * Działa WYŁĄCZNIE na parach wypisanych niżej — żadnych wzorców, żadnego
 * skanowania, żadnego "usuń wszystko co wygląda podobnie". Każda para
 * została ręcznie zatwierdzona na podstawie raportu audytu.
 *
 * Kolejność jest istotna:
 *   1. walidacja (hash, dostępność pliku kanonicznego),
 *   2. przepięcie drużyn i aliasów na asset kanoniczny,
 *   3. usunięcie wiersza duplikatu z biblioteki,
 *   4. sprawdzenie ZERA referencji,
 *   5. dopiero wtedy usunięcie pliku z Cloudinary.
 *
 * Każdy niespełniony warunek przerywa obsługę TEJ pary i raportuje
 * BLOCKED. Nic nie jest usuwane "na wszelki wypadek".
 *
 *   npm run logos:dedupe -- --dry-run
 *   npm run logos:dedupe
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { teamLogoAliases, teamLogoAssets, teams } from "@/lib/db/schema";
import { normalizeTeamNameForLogoMatching } from "@/lib/logos/normalize";

const DRY_RUN = process.argv.includes("--dry-run");

/** Zatwierdzone pary: zostaje `keep`, znika `duplicate`. */
const PAIRS: Array<{ label: string; keep: string; duplicate: string }> = [
  {
    label: "NAPRZÓD JANÓW KATOWICE",
    keep: "tournaments/rabbit-cup/teams/a-1773357702149",
    duplicate: "tournaments/rabbit-cup/teams/b-1773405580668",
  },
  {
    label: "GKS KATOWICE",
    keep: "tournaments/rabbit-cup/teams/b-1773405648230",
    duplicate: "tournaments/rabbit-cup/teams/a-1773405076043",
  },
];

async function hashOf(url: string): Promise<string | null> {
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

async function assetByPublicId(publicId: string) {
  const rows = await getDb()
    .select()
    .from(teamLogoAssets)
    .where(eq(teamLogoAssets.cloudinaryPublicId, publicId))
    .limit(1);

  return rows[0] ?? null;
}

type Outcome = { label: string; status: "MERGED" | "BLOCKED" | "SKIPPED"; note: string };

async function processPair(pair: (typeof PAIRS)[number]): Promise<Outcome> {
  const db = getDb();

  const keep = await assetByPublicId(pair.keep);
  const duplicate = await assetByPublicId(pair.duplicate);

  if (!keep) {
    return { label: pair.label, status: "BLOCKED", note: "brak assetu kanonicznego w bibliotece" };
  }

  if (!duplicate) {
    return { label: pair.label, status: "SKIPPED", note: "duplikat już nie istnieje w bibliotece" };
  }

  if (keep.id === duplicate.id) {
    return { label: pair.label, status: "BLOCKED", note: "kanoniczny i duplikat to ten sam wiersz" };
  }

  // WARUNEK 1: identyczna zawartość, policzona teraz, a nie z pamięci.
  const [keepHash, duplicateHash] = await Promise.all([
    hashOf(keep.url),
    hashOf(duplicate.url),
  ]);

  if (!keepHash || !duplicateHash) {
    return { label: pair.label, status: "BLOCKED", note: "nie udało się pobrać pliku do porównania" };
  }

  if (keepHash !== duplicateHash) {
    return { label: pair.label, status: "BLOCKED", note: "pliki NIE są identyczne bajtowo" };
  }

  // WARUNEK 2: plik kanoniczny odpowiada poprawnie (sprawdzone wyżej przez hash).
  console.log(`\n${pair.label}`);
  console.log(`  zostaje: ${keep.canonicalName}  [${pair.keep}]`);
  console.log(`  scalany: ${duplicate.canonicalName}  [${pair.duplicate}]`);
  console.log(`  hash:    ${keepHash.slice(0, 16)}… (zgodny)`);

  const referencing = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.logoAssetId, duplicate.id));

  console.log(
    `  przepięcie drużyn: ${referencing.map((row) => row.name).join(", ") || "(brak)"}`
  );

  if (DRY_RUN) {
    return { label: pair.label, status: "MERGED", note: "próbnie — bez zapisu" };
  }

  // KROK 1: drużyny wskazują asset kanoniczny — razem z URL i public_id,
  // żeby odczyt bez biblioteki też dawał ten sam obraz.
  for (const team of referencing) {
    await db
      .update(teams)
      .set({
        logoAssetId: keep.id,
        logoUrl: keep.url,
        logoPublicId: keep.cloudinaryPublicId,
      })
      .where(eq(teams.id, team.id));
  }

  // KROK 2: aliasy duplikatu przechodzą na kanoniczny, bez kolizji.
  const existingAliases = await db
    .select({ normalizedAlias: teamLogoAliases.normalizedAlias })
    .from(teamLogoAliases);

  const taken = new Set(existingAliases.map((row) => row.normalizedAlias));
  const keepNormalized = keep.normalizedName;

  const duplicateAliases = await db
    .select()
    .from(teamLogoAliases)
    .where(eq(teamLogoAliases.logoAssetId, duplicate.id));

  for (const alias of duplicateAliases) {
    if (alias.normalizedAlias === keepNormalized) continue;

    await db
      .update(teamLogoAliases)
      .set({ logoAssetId: keep.id })
      .where(eq(teamLogoAliases.id, alias.id));
  }

  // Nazwa własna duplikatu ("GKS KATOWICE 1") staje się aliasem kanonicznego —
  // dzięki temu drużyna o tej nazwie nadal trafia dokładnie.
  const duplicateNameNormalized = normalizeTeamNameForLogoMatching(
    duplicate.canonicalName
  );

  if (
    duplicateNameNormalized !== keepNormalized &&
    !taken.has(duplicateNameNormalized)
  ) {
    await db.insert(teamLogoAliases).values({
      logoAssetId: keep.id,
      alias: duplicate.canonicalName,
      normalizedAlias: duplicateNameNormalized,
    });

    console.log(`  alias: „${duplicate.canonicalName}" → ${keep.canonicalName}`);
  }

  // KROK 3: wiersz duplikatu znika z biblioteki.
  await db.delete(teamLogoAssets).where(eq(teamLogoAssets.id, duplicate.id));

  return { label: pair.label, status: "MERGED", note: `przepięto ${referencing.length} drużyn` };
}

/**
 * Usuwa plik z Cloudinary — dopiero po udowodnieniu, że NIKT go nie używa.
 * Każdy warunek jest sprawdzany osobno i wypisywany, żeby dało się to
 * zweryfikować w raporcie.
 */
async function deleteDuplicateFile(publicId: string): Promise<Outcome> {
  const db = getDb();

  const stillInLibrary = await assetByPublicId(publicId);

  if (stillInLibrary) {
    return { label: publicId, status: "BLOCKED", note: "nadal jest wierszem biblioteki" };
  }

  const teamRefs = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.logoPublicId, publicId));

  if (teamRefs.length > 0) {
    return {
      label: publicId,
      status: "BLOCKED",
      note: `nadal używany przez ${teamRefs.length} drużyn`,
    };
  }

  const urlRefs = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.logoUrl, publicId));

  if (urlRefs.length > 0) {
    return { label: publicId, status: "BLOCKED", note: "nadal wskazywany URL-em" };
  }

  console.log(`  referencje: 0 drużyn, 0 wierszy biblioteki — można usunąć`);

  if (DRY_RUN) {
    return { label: publicId, status: "SKIPPED", note: "próbnie — plik NIE usunięty" };
  }

  const cloudinary = (await import("@/lib/cloudinary")).default;

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  return {
    label: publicId,
    status: result.result === "ok" ? "MERGED" : "BLOCKED",
    note: `Cloudinary: ${result.result}`,
  };
}

async function main() {
  console.log(DRY_RUN ? "TRYB: próbny (bez zapisu i bez usuwania)" : "TRYB: wykonanie");
  console.log(`zatwierdzone pary: ${PAIRS.length}`);

  const merges: Outcome[] = [];
  const deletes: Outcome[] = [];

  for (const pair of PAIRS) {
    const outcome = await processPair(pair);
    merges.push(outcome);

    if (outcome.status !== "MERGED") {
      console.log(`  BLOCKED/SKIPPED: ${outcome.note} — plik NIE zostanie usunięty`);
      continue;
    }

    deletes.push(await deleteDuplicateFile(pair.duplicate));
  }

  console.log("\n" + "=".repeat(64));
  console.log("SCALENIA");
  for (const item of merges) console.log(`  ${item.status.padEnd(8)} ${item.label} — ${item.note}`);

  console.log("USUNIĘCIA W CLOUDINARY");
  if (deletes.length === 0) console.log("  (żadnych)");
  for (const item of deletes) console.log(`  ${item.status.padEnd(8)} ${item.label} — ${item.note}`);

  const remaining = await getDb().select({ id: teamLogoAssets.id }).from(teamLogoAssets);
  console.log(`\nwierszy biblioteki po operacji: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
