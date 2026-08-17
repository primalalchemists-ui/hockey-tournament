/**
 * REHOST assetów z Airtable do Cloudinary.
 *
 * Uruchomienie:
 *   npm run assets:rehost -- --dry-run     (nic nie wgrywa, tylko plan)
 *   npm run assets:rehost                  (wykonanie)
 *
 * Gwarancje:
 *  - IDEMPOTENTNY: rekordy wskazujące już na Cloudinary są pomijane, a
 *    public_id jest deterministyczny (`overwrite: true`), więc powtórka nie
 *    tworzy drugiej kopii pliku.
 *  - WZNAWIALNY: każdy asset jest przetwarzany niezależnie; baza jest
 *    aktualizowana DOPIERO po udanym uploadzie tego konkretnego assetu.
 *    Przerwanie w połowie zostawia spójny stan mieszany, a kolejne
 *    uruchomienie dokańcza resztę.
 *  - NIE dotyka Airtable. NIE kasuje niczego z Cloudinary.
 *
 * Zmieniane są wyłącznie kolumny `url` i `public_id`. `mime_type`/`file_name`
 * zostają nietknięte — sterują zachowaniem UI (np. podglądem PDF).
 */

import { eq } from "drizzle-orm";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { loadEnvFile } from "@/lib/db/load-env";
import { getDb } from "@/lib/db/client";
import { teams, tournamentAssets } from "@/lib/db/schema";
import {
  buildTeamLogoPublicId,
  buildTournamentAssetPublicId,
  isAirtableAssetUrl,
  isCloudinaryUrl,
} from "@/lib/assets/naming";

import { collectAssetRefs, getActiveTournamentRow, type AssetRef } from "./assets-preflight";

loadEnvFile();

/**
 * Konfiguracja Cloudinary jest ustawiana TUTAJ, a nie brana z
 * lib/cloudinary.ts. Tamten moduł konfiguruje się w momencie importu, a w
 * ESM importy wykonują się przed ciałem modułu — czyli zanim loadEnvFile()
 * zdąży wypełnić process.env. W aplikacji problemu nie ma, bo Next.js ładuje
 * .env przed jakimkolwiek modułem.
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isDryRun = process.argv.includes("--dry-run");

const ALLOWED_CONTENT_TYPES = [/^image\//, /^application\/pdf$/];

function isSensibleContentType(contentType: string) {
  return ALLOWED_CONTENT_TYPES.some((pattern) => pattern.test(contentType));
}

function publicIdFor(ref: AssetRef, tournamentSlug: string) {
  if (ref.source === "team") {
    // label ma postać "team/<externalId>"
    return buildTeamLogoPublicId(tournamentSlug, ref.label.slice("team/".length));
  }

  return buildTournamentAssetPublicId(
    tournamentSlug,
    ref.label.slice("asset/".length)
  );
}

async function downloadAsset(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`pobranie nie powiodło się: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!isSensibleContentType(contentType)) {
    throw new Error(`nieoczekiwany content-type: "${contentType}"`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("pobrany plik jest pusty");
  }

  return { buffer, contentType };
}

function uploadToCloudinary(buffer: Buffer, publicId: string) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          public_id: publicId,
          resource_type: "auto",
          // Deterministyczny public_id + overwrite => brak duplikatów
          // przy ponownym uruchomieniu.
          overwrite: true,
          invalidate: true,
          use_filename: false,
          unique_filename: false,
        },
        (error, result) => {
          if (error) reject(error);
          else if (!result) reject(new Error("pusta odpowiedź Cloudinary"));
          else resolve(result);
        }
      )
      .end(buffer);
  });
}

async function persist(ref: AssetRef, secureUrl: string, publicId: string) {
  const db = getDb();

  if (ref.source === "team") {
    await db
      .update(teams)
      .set({ logoUrl: secureUrl, logoPublicId: publicId })
      .where(eq(teams.id, ref.rowId));
    return;
  }

  await db
    .update(tournamentAssets)
    .set({ url: secureUrl, publicId })
    .where(eq(tournamentAssets.id, ref.rowId));
}

async function main() {
  const tournament = await getActiveTournamentRow();

  if (!tournament) {
    throw new Error("Brak aktywnego turnieju w PostgreSQL.");
  }

  console.log(`Turniej: ${tournament.slug}`);
  console.log(isDryRun ? "TRYB: dry-run (bez uploadu i bez zapisu)\n" : "TRYB: wykonanie\n");

  const refs = await collectAssetRefs(tournament.id);

  const todo = refs.filter((ref) => isAirtableAssetUrl(ref.url));
  const alreadyDone = refs.filter((ref) => isCloudinaryUrl(ref.url));
  const unknown = refs.filter(
    (ref) => !isAirtableAssetUrl(ref.url) && !isCloudinaryUrl(ref.url)
  );

  console.log(`assety łącznie:        ${refs.length}`);
  console.log(`do przeniesienia:      ${todo.length}`);
  console.log(`już na Cloudinary:     ${alreadyDone.length} (pomijane)`);

  if (unknown.length) {
    console.log(`o nieznanym źródle:    ${unknown.length}`);
    for (const ref of unknown) console.log(`   ${ref.label}`);
  }

  if (todo.length === 0) {
    console.log("\nNic do zrobienia — wszystkie assety są już poza Airtable.");
    return;
  }

  console.log("");

  const succeeded: string[] = [];
  const failed: Array<{ label: string; reason: string }> = [];

  for (const ref of todo) {
    const publicId = publicIdFor(ref, tournament.slug);

    try {
      const { buffer, contentType } = await downloadAsset(ref.url);

      if (isDryRun) {
        console.log(
          `  [plan] ${ref.label.padEnd(26)} -> ${publicId}  ` +
            `(${buffer.length} B, ${contentType})`
        );
        succeeded.push(ref.label);
        continue;
      }

      const uploaded = await uploadToCloudinary(buffer, publicId);

      if (!uploaded.secure_url) {
        throw new Error("Cloudinary nie zwrócił secure_url");
      }

      // Zapis do bazy DOPIERO po potwierdzonym uploadzie tego assetu.
      await persist(ref, uploaded.secure_url, uploaded.public_id);

      console.log(`  OK     ${ref.label.padEnd(26)} -> ${uploaded.public_id}`);
      succeeded.push(ref.label);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`  BŁĄD   ${ref.label.padEnd(26)} ${reason}`);
      failed.push({ label: ref.label, reason });
    }
  }

  console.log(`\nudane: ${succeeded.length} / ${todo.length}`);

  if (failed.length) {
    console.log(`nieudane: ${failed.length}`);
    for (const item of failed) {
      console.log(`  ${item.label}: ${item.reason}`);
    }
    throw new Error(
      "Część assetów nie została przeniesiona. Uruchom skrypt ponownie — " +
        "pominie już przeniesione i dokończy resztę."
    );
  }

  console.log("Wszystkie assety przeniesione.");
}

main().catch((error) => {
  console.error("\nREHOST NIEUDANY:", error.message);
  process.exit(1);
});
