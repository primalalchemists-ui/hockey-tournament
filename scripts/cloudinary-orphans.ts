/**
 * AUDYT OSIEROCONYCH PLIKÓW W CLOUDINARY — WYŁĄCZNIE ODCZYT.
 *
 * Zestawia zawartość foldera `tournaments` z referencjami w bazie:
 * tournament_assets, teams (logo) i biblioteka logotypów.
 *
 * Skrypt NICZEGO nie usuwa i nie zmienia. Jego produktem jest lista
 * kandydatów do sprzątnięcia po świadomej decyzji użytkownika.
 *
 *   npm run assets:orphans
 */

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { teamLogoAssets, teams, tournamentAssets } from "@/lib/db/schema";

type CloudinaryResource = {
  public_id: string;
  created_at: string;
  bytes: number;
};

async function listFolder(prefix: string): Promise<CloudinaryResource[]> {
  const cloudinary = (await import("@/lib/cloudinary")).default;
  const collected: CloudinaryResource[] = [];

  let cursor: string | undefined;

  do {
    const page = await cloudinary.api.resources({
      type: "upload",
      prefix,
      max_results: 500,
      next_cursor: cursor,
    });

    collected.push(...(page.resources as CloudinaryResource[]));
    cursor = page.next_cursor;
  } while (cursor);

  return collected;
}

async function main() {
  const db = getDb();

  const [assetRows, teamRows, libraryRows] = await Promise.all([
    db
      .select({ publicId: tournamentAssets.publicId, url: tournamentAssets.url })
      .from(tournamentAssets),
    db.select({ publicId: teams.logoPublicId, url: teams.logoUrl }).from(teams),
    db
      .select({
        publicId: teamLogoAssets.cloudinaryPublicId,
        url: teamLogoAssets.url,
      })
      .from(teamLogoAssets),
  ]);

  const referenced = new Set<string>();

  for (const row of [...assetRows, ...teamRows, ...libraryRows]) {
    if (row.publicId) referenced.add(row.publicId);

    // Część historycznych rekordów ma tylko URL — wyciągamy z niego public_id.
    if (row.url) {
      const match = row.url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i);
      if (match) referenced.add(match[1]);
    }
  }

  const resources = await listFolder("tournaments");

  console.log("=".repeat(68));
  console.log("AUDYT CLOUDINARY — TYLKO ODCZYT");
  console.log("=".repeat(68));
  console.log(`plików w folderze tournaments: ${resources.length}`);
  console.log(`referencji w bazie:            ${referenced.size}`);
  console.log("");

  const orphans = resources.filter(
    (resource) => !referenced.has(resource.public_id)
  );

  console.log(`KANDYDACI NA OSIEROCONE: ${orphans.length}`);
  console.log("");

  for (const orphan of orphans.sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  )) {
    console.log(
      `  ${orphan.public_id.padEnd(46)} ${orphan.created_at.slice(0, 19)}  ${Math.round(
        orphan.bytes / 1024
      )} KB`
    );
  }

  console.log("");
  console.log("Nic nie zostało usunięte. 0 zapisów, 0 delete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
