import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Czysta logika tokenu sesji admina — bez cookies, bez Next.js.
 * Wydzielona z lib/admin-auth.ts, żeby dała się przetestować jednostkowo.
 */

export const ADMIN_COOKIE_NAME = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const TOKEN_VERSION = "v1";

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Porównanie odporne na atak czasowy, bezpieczne dla różnych długości. */
export function safeEquals(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) {
    // Nadal wykonujemy porównanie, żeby nie ujawniać długości czasem odpowiedzi.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;

  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  secret: string | null | undefined,
  now = Date.now()
): boolean {
  if (!token || !secret) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [version, expiresAtRaw, signature] = parts;
  if (version !== TOKEN_VERSION) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt * 1000 <= now) return false;

  const payload = `${version}.${expiresAtRaw}`;
  return safeEquals(signature, sign(payload, secret));
}
