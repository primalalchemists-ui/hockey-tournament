/**
 * Walidacja assetów po rehoście. Tylko odczyt.
 * Uruchomienie: npm run assets:validate
 */

import { loadEnvFile } from "@/lib/db/load-env";
import {
  AIRTABLE_ASSET_HOST,
  isAirtableAssetUrl,
  isCloudinaryUrl,
} from "@/lib/assets/naming";

import { collectAssetRefs, getActiveTournamentRow } from "./assets-preflight";

loadEnvFile();

async function main() {
  const tournament = await getActiveTournamentRow();

  if (!tournament) {
    throw new Error("Brak aktywnego turnieju w PostgreSQL.");
  }

  const refs = await collectAssetRefs(tournament.id);

  const airtable = refs.filter((ref) => isAirtableAssetUrl(ref.url));
  const cloudinary = refs.filter((ref) => isCloudinaryUrl(ref.url));
  const https = refs.filter((ref) => ref.url.startsWith("https://"));
  const withPublicId = refs.filter((ref) => Boolean(ref.publicId));

  console.log("=== A. ŹRÓDŁA URL-i ===");
  console.log(`  rekordów assetów:            ${refs.length}`);
  console.log(`  zawierających ${AIRTABLE_ASSET_HOST}:  ${airtable.length}`);
  console.log(`  na res.cloudinary.com:       ${cloudinary.length}`);
  console.log(`  po HTTPS:                    ${https.length}`);
  console.log(`  z zapisanym public_id:       ${withPublicId.length}`);

  console.log("\n=== B. WALIDACJA HTTP ===");

  let ok = 0;
  const broken: Array<{ label: string; status: string }> = [];

  for (const ref of refs) {
    try {
      const response = await fetch(ref.url, { method: "GET" });

      if (response.ok) {
        ok += 1;
      } else {
        broken.push({ label: ref.label, status: `HTTP ${response.status}` });
      }
    } catch (error) {
      broken.push({
        label: ref.label,
        status: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`  dostępne: ${ok} / ${refs.length}`);

  for (const item of broken) {
    console.log(`  NIEDOSTĘPNY ${item.label}: ${item.status}`);
  }

  console.log("\n=== C. KONWENCJA public_id ===");
  const badPublicId = refs.filter(
    (ref) => !ref.publicId?.startsWith(`tournaments/${tournament.slug}/`)
  );
  console.log(
    badPublicId.length === 0
      ? `  wszystkie public_id w tournaments/${tournament.slug}/**`
      : `  NIEZGODNE: ${badPublicId.map((r) => r.label).join(", ")}`
  );

  const problems =
    airtable.length +
    broken.length +
    badPublicId.length +
    (https.length !== refs.length ? 1 : 0) +
    (withPublicId.length !== refs.length ? 1 : 0);

  if (problems > 0) {
    throw new Error(`Walidacja wykryła ${problems} problemów.`);
  }

  console.log("\nWALIDACJA OK — assety są w całości niezależne od Airtable.");
}

main().catch((error) => {
  console.error("\nWALIDACJA NIEUDANA:", error.message);
  process.exit(1);
});
