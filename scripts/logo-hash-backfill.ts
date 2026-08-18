/**
 * UZUPEŁNIENIE SHA-256 DLA ISTNIEJĄCYCH LOGOTYPÓW.
 *
 * Po scaleniu duplikatów dwa assety kanoniczne miały pusty content_hash
 * (hash należał wcześniej do skasowanego bliźniaka). Bez niego ponowne
 * wgranie tego samego pliku utworzyłoby kopię zamiast trafić w istniejący
 * wiersz — czyli dokładnie to, czemu biblioteka ma zapobiegać.
 *
 * Skrypt POBIERA pliki i liczy hash. Nie wgrywa, nie usuwa i nie zmienia
 * niczego poza kolumną content_hash.
 *
 *   npm run logos:hash -- --dry-run
 *   npm run logos:hash
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { teamLogoAssets } from "@/lib/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

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

async function main() {
  const db = getDb();
  const assets = await db.select().from(teamLogoAssets);

  console.log(DRY_RUN ? "TRYB: próbny" : "TRYB: zapis");
  console.log(`assetów w bibliotece: ${assets.length}`);

  const hashes = new Map<string, string>();
  const conflicts: string[] = [];
  let filled = 0;
  let unreachable = 0;

  for (const asset of assets) {
    const hash = asset.contentHash ?? (await hashOf(asset.url));

    if (!hash) {
      unreachable += 1;
      console.log(`  ! ${asset.canonicalName} — nie udało się pobrać pliku`);
      continue;
    }

    const owner = hashes.get(hash);

    if (owner && owner !== asset.canonicalName) {
      // Dwa RÓŻNE wiersze o identycznej zawartości = decyzja użytkownika,
      // nie automatu. Zatrzymujemy się i raportujemy.
      conflicts.push(`${owner} == ${asset.canonicalName}`);
      continue;
    }

    hashes.set(hash, asset.canonicalName);

    if (asset.contentHash) continue;

    console.log(`  + ${asset.canonicalName} → ${hash.slice(0, 16)}…`);

    if (!DRY_RUN) {
      await db
        .update(teamLogoAssets)
        .set({ contentHash: hash, updatedAt: new Date() })
        .where(eq(teamLogoAssets.id, asset.id));
    }

    filled += 1;
  }

  const after = await db.select().from(teamLogoAssets);
  const withHash = after.filter((asset) => asset.contentHash).length;

  console.log("");
  console.log(`uzupełniono:        ${filled}`);
  console.log(`niedostępne pliki:  ${unreachable}`);
  console.log(`z hashem:           ${withHash}/${after.length}`);

  if (conflicts.length > 0) {
    console.log("");
    console.log("KONFLIKT — identyczna zawartość w różnych wierszach:");
    for (const conflict of conflicts) console.log(`  ${conflict}`);
    console.log("Nie scalam ich automatycznie. Potrzebna decyzja użytkownika.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
