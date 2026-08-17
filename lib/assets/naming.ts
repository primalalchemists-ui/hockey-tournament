/**
 * Rozpoznawanie źródła assetu i deterministyczna konwencja `public_id`
 * dla Cloudinary.
 *
 * Czysty moduł (bez IO) — używany przez skrypty rehostu, walidację i testy.
 */

export const AIRTABLE_ASSET_HOST = "airtableusercontent.com";

export function isAirtableAssetUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.includes(AIRTABLE_ASSET_HOST));
}

export function isCloudinaryUrl(url: string | null | undefined): boolean {
  return Boolean(url && /^https:\/\/res\.cloudinary\.com\//.test(url));
}

/**
 * Cloudinary dopuszcza w public_id litery, cyfry, `-`, `_` i `/`.
 * Wszystko inne sprowadzamy do `-`, żeby identyfikator był przewidywalny
 * i stabilny między uruchomieniami.
 */
export function sanitizeIdSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

export const ASSET_ROOT_FOLDER = "tournaments";

/**
 * Logo drużyny.
 *
 * Konwencja: tournaments/<slug>/teams/<external_id>
 *
 * Świadoma decyzja: public_id jest per REKORD, a nie per unikalna zawartość
 * pliku. Dwie drużyny mogą mieć bajtowo identyczne logo (ten sam klub w
 * grupie A i B), ale współdzielenie jednego obiektu Cloudinary sprzęgłoby je
 * ze sobą — istniejący panel kasuje assety po public_id, więc podmiana logo
 * jednej drużyny zepsułaby logo drugiej.
 */
export function buildTeamLogoPublicId(
  tournamentSlug: string,
  teamExternalId: string
): string {
  return [
    ASSET_ROOT_FOLDER,
    sanitizeIdSegment(tournamentSlug),
    "teams",
    sanitizeIdSegment(teamExternalId),
  ].join("/");
}

/** Asset turnieju: tournaments/<slug>/assets/<kind> */
export function buildTournamentAssetPublicId(
  tournamentSlug: string,
  kind: string
): string {
  return [
    ASSET_ROOT_FOLDER,
    sanitizeIdSegment(tournamentSlug),
    "assets",
    sanitizeIdSegment(kind),
  ].join("/");
}
