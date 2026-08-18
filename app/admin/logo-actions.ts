"use server";

import { createHash } from "node:crypto";
import type { UploadApiResponse } from "cloudinary";

import { requireAdmin } from "@/lib/admin-auth";
import cloudinary from "@/lib/cloudinary";
import {
  findLogoByContentHash,
  listLogoLibrary,
  reserveLogoSlug,
  suggestLogosForTeamName,
  upsertLogoAsset,
} from "@/lib/data/postgres/logo-library";
import { searchLogos } from "@/lib/logos/matching";
import { slugifyLogoName, suggestCanonicalName } from "@/lib/logos/normalize";

/**
 * AKCJE BIBLIOTEKI LOGOTYPÓW.
 *
 * Panel dostaje wyłącznie dane prezentacyjne: nazwę, slug i miniaturę.
 * UUID, public_id i hash zostają po stronie serwera.
 */

/** Kształt wysyłany do przeglądarki. */
export type LogoOption = {
  slug: string;
  name: string;
  thumbnailUrl: string;
  url: string;
};

export type LogoSuggestions = {
  /** Trafienie pewne — panel może je zaznaczyć samo. */
  autoSelect: LogoOption | null;
  /** Propozycje do sekcji „Polecane”. */
  suggestions: LogoOption[];
};

function toOption(item: {
  slug: string;
  canonicalName: string;
  thumbnailUrl: string;
  url: string;
}): LogoOption {
  return {
    slug: item.slug,
    name: item.canonicalName,
    thumbnailUrl: item.thumbnailUrl,
    url: item.url,
  };
}

export async function listTeamLogosAction(query: string): Promise<LogoOption[]> {
  await requireAdmin();

  const library = await listLogoLibrary();
  const filtered = query.trim() ? searchLogos(query, library) : library;

  return filtered.map(toOption);
}

export async function suggestTeamLogosAction(
  teamName: string
): Promise<LogoSuggestions> {
  await requireAdmin();

  if (!teamName.trim()) return { autoSelect: null, suggestions: [] };

  const result = await suggestLogosForTeamName(teamName);

  return {
    autoSelect: result.autoSelect ? toOption(result.autoSelect.logo) : null,
    suggestions: result.suggestions.map((match) => toOption(match.logo)),
  };
}

/** Propozycja nazwy dla nowego logo — bez końcówki wariantu drużyny. */
export async function proposeLogoNameAction(teamName: string): Promise<string> {
  await requireAdmin();
  return suggestCanonicalName(teamName);
}

export type UploadLogoState = {
  error: string | null;
  logo: LogoOption | null;
  /** true = obraz już był w bibliotece, nowy plik NIE powstał. */
  reusedExisting: boolean;
};

/**
 * Dodanie logo do biblioteki.
 *
 * OSZCZĘDNOŚĆ MIEJSCA jest tu głównym celem:
 *   1. liczymy SHA-256 pliku ZANIM cokolwiek wyślemy,
 *   2. jeśli taka zawartość już jest w bibliotece — zwracamy istniejący
 *      asset i nie dotykamy Cloudinary,
 *   3. dopiero nowa zawartość trafia na serwer plików.
 *
 * public_id jest deterministyczny: team-logos/<slug-nazwy>. Kolizja nazwy
 * NIGDY nie nadpisuje cudzego pliku — bierzemy wolny sufiks, a
 * `overwrite: false` jest dodatkowym bezpiecznikiem po stronie Cloudinary.
 */
export async function uploadTeamLogoAction(
  _prevState: UploadLogoState,
  formData: FormData
): Promise<UploadLogoState> {
  await requireAdmin();

  const file = formData.get("file");
  const rawName = String(formData.get("canonicalName") ?? "").trim();

  if (!(file instanceof File)) {
    return { error: "Nie wybrano pliku.", logo: null, reusedExisting: false };
  }

  if (!rawName) {
    return { error: "Podaj nazwę logo.", logo: null, reusedExisting: false };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  // 1. Ten sam plik już w bibliotece — zero uploadu.
  const known = await findLogoByContentHash(contentHash);

  if (known) {
    return { error: null, logo: toOption(known), reusedExisting: true };
  }

  try {
    const slug = await reserveLogoSlug(rawName);
    const publicId = `team-logos/${slug}`;

    const upload = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            public_id: publicId,
            resource_type: "image",
            // Bezpiecznik: istniejący plik pod tym public_id zostaje.
            overwrite: false,
            unique_filename: false,
            use_filename: false,
          },
          (error, result) => {
            if (error) reject(error);
            else if (!result) reject(new Error("Pusta odpowiedź Cloudinary"));
            else resolve(result);
          }
        )
        .end(buffer);
    });

    const { item, reusedExisting } = await upsertLogoAsset({
      canonicalName: rawName,
      url: upload.secure_url,
      cloudinaryPublicId: upload.public_id,
      contentHash,
      width: upload.width ?? null,
      height: upload.height ?? null,
      format: upload.format ?? null,
    });

    return { error: null, logo: toOption(item), reusedExisting };
  } catch (error) {
    console.error("[logo-library] upload failed:", error);

    return {
      error:
        error instanceof Error ? error.message : "Nie udało się wgrać logo.",
      logo: null,
      reusedExisting: false,
    };
  }
}

/** Podgląd docelowego public_id — używany w testach konwencji nazw. */
export async function previewLogoPublicIdAction(name: string): Promise<string> {
  await requireAdmin();
  return `team-logos/${slugifyLogoName(name)}`;
}
