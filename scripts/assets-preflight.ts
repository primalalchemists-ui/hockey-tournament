/**
 * PREFLIGHT przed rehostem assetów do Cloudinary.
 *
 * Tylko odczyt. Nie modyfikuje ani Postgresa, ani Cloudinary, ani Airtable.
 * Nie wypisuje żadnych sekretów.
 *
 * Uruchomienie: npm run assets:preflight
 */

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";
import { getDb } from "@/lib/db/client";
import { teams, tournamentAssets, tournaments } from "@/lib/db/schema";
import { isAirtableAssetUrl, isCloudinaryUrl } from "@/lib/assets/naming";

loadEnvFile();

export type AssetRef = {
  /** Skąd pochodzi rekord — decyduje o tabeli do aktualizacji. */
  source: "team" | "tournament_asset";
  /** UUID wiersza w Postgresie. */
  rowId: string;
  /** Czytelny identyfikator do public_id i logów. */
  label: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  publicId: string | null;
};

export async function collectAssetRefs(tournamentId: string) {
  const db = getDb();

  const [teamRows, assetRows] = await db.batch([
    db
      .select({
        id: teams.id,
        externalId: teams.externalId,
        name: teams.name,
        logoUrl: teams.logoUrl,
        logoName: teams.logoName,
        logoType: teams.logoType,
        logoPublicId: teams.logoPublicId,
      })
      .from(teams)
      .where(eq(teams.tournamentId, tournamentId)),
    db
      .select()
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, tournamentId)),
  ]);

  const refs: AssetRef[] = [];

  for (const row of teamRows) {
    if (!row.logoUrl) continue;

    refs.push({
      source: "team",
      rowId: row.id,
      label: `team/${row.externalId}`,
      url: row.logoUrl,
      fileName: row.logoName,
      mimeType: row.logoType,
      publicId: row.logoPublicId,
    });
  }

  for (const row of assetRows) {
    refs.push({
      source: "tournament_asset",
      rowId: row.id,
      label: `asset/${row.kind}`,
      url: row.url,
      fileName: row.fileName,
      mimeType: row.mimeType,
      publicId: row.publicId,
    });
  }

  return refs;
}

export async function getActiveTournamentRow() {
  const rows = await getDb()
    .select({ id: tournaments.id, slug: tournaments.slug, title: tournaments.title })
    .from(tournaments)
    .where(eq(tournaments.isCurrent, true))
    .limit(1);

  return rows[0] ?? null;
}

async function main() {
  console.log("=== KONFIGURACJA ===");

  const required = [
    "DATABASE_URL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];

  let missing = 0;

  for (const key of required) {
    const present = Boolean(process.env[key]?.trim());
    if (!present) missing += 1;
    console.log(`  ${key.padEnd(26)} ${present ? "jest" : "BRAK"}`);
  }

  if (missing > 0) {
    throw new Error(`Brakuje ${missing} wymaganych zmiennych środowiskowych.`);
  }

  const tournament = await getActiveTournamentRow();

  if (!tournament) {
    throw new Error("Brak aktywnego turnieju w PostgreSQL. Uruchom: npm run db:import");
  }

  console.log(`\n=== TURNIEJ ===\n  slug=${tournament.slug} title="${tournament.title}"`);

  const refs = await collectAssetRefs(tournament.id);

  const airtableRefs = refs.filter((ref) => isAirtableAssetUrl(ref.url));
  const cloudinaryRefs = refs.filter((ref) => isCloudinaryUrl(ref.url));
  const otherRefs = refs.filter(
    (ref) => !isAirtableAssetUrl(ref.url) && !isCloudinaryUrl(ref.url)
  );

  console.log("\n=== REKORDY ASSETÓW W POSTGRESIE ===");
  console.log(`  łącznie:                 ${refs.length}`);
  console.log(`  wskazujące na Airtable:  ${airtableRefs.length}`);
  console.log(`  już na Cloudinary:       ${cloudinaryRefs.length}`);
  console.log(`  inne:                    ${otherRefs.length}`);
  console.log(`  z zapisanym public_id:   ${refs.filter((r) => r.publicId).length}`);

  const byUrl = new Map<string, AssetRef[]>();
  for (const ref of airtableRefs) {
    const list = byUrl.get(ref.url) ?? [];
    list.push(ref);
    byUrl.set(ref.url, list);
  }

  console.log(`\n  unikalne URL-e do przeniesienia: ${byUrl.size}`);

  for (const [url, group] of byUrl) {
    if (group.length > 1) {
      console.log(
        `    ten sam URL w ${group.length} rekordach: ${group.map((r) => r.label).join(", ")}`
      );
      void url;
    }
  }

  if (airtableRefs.length === 0) {
    console.log("\nNic do przeniesienia — wszystkie assety są już poza Airtable.");
    return;
  }

  console.log("\n=== DOSTĘPNOŚĆ ŹRÓDEŁ (HTTP + hash zawartości) ===");

  const hashes = new Map<string, string[]>();
  const unavailable: Array<{ label: string; status: string }> = [];

  for (const [url, group] of byUrl) {
    const label = group.map((r) => r.label).join("+");

    try {
      const response = await fetch(url);

      if (!response.ok) {
        unavailable.push({ label, status: `HTTP ${response.status}` });
        console.log(`  ${label.padEnd(26)} NIEDOSTĘPNY (HTTP ${response.status})`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());
      const hash = createHash("sha256").update(buffer).digest("hex");

      const list = hashes.get(hash) ?? [];
      list.push(label);
      hashes.set(hash, list);

      const sensible =
        contentType.startsWith("image/") || contentType === "application/pdf";

      console.log(
        `  ${label.padEnd(26)} ok  ${String(buffer.length).padStart(8)} B  ` +
          `${contentType}${sensible ? "" : "  <-- NIETYPOWY CONTENT-TYPE"}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      unavailable.push({ label, status: message });
      console.log(`  ${label.padEnd(26)} BŁĄD: ${message}`);
    }
  }

  const duplicateContent = [...hashes.values()].filter((list) => list.length > 1);

  console.log("\n=== DEDUPLIKACJA ===");
  console.log(`  unikalnych URL-i:            ${byUrl.size}`);
  console.log(`  unikalnych plików (sha256):  ${hashes.size}`);

  if (duplicateContent.length) {
    console.log("  identyczna zawartość w:");
    for (const list of duplicateContent) {
      console.log(`    ${list.join(", ")}`);
    }
  } else {
    console.log("  brak plików o identycznej zawartości");
  }

  if (unavailable.length) {
    console.log("\n=== STOP: NIEDOSTĘPNE ASSETY ===");
    for (const item of unavailable) {
      console.log(`  ${item.label}: ${item.status}`);
    }
    throw new Error(
      `${unavailable.length} assetów jest niedostępnych — nie zaczynaj częściowej migracji.`
    );
  }

  console.log("\nPREFLIGHT OK — wszystkie źródła odpowiadają.");
}

if (process.argv[1]?.includes("assets-preflight")) {
  main().catch((error) => {
    console.error("\nPREFLIGHT NIEUDANY:", error.message);
    process.exit(1);
  });
}
