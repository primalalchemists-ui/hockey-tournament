// lib/admin-auth.ts
import "server-only";

import { cookies } from "next/headers";

import {
  ADMIN_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./admin-session";

/**
 * Sekret do podpisywania sesji.
 *
 * Preferowany jest dedykowany ADMIN_SESSION_SECRET. Jeśli go nie ma,
 * używamy ADMIN_PASSWORD — dzięki temu wdrożenie nie wymaga nowej zmiennej
 * środowiskowej, a zmiana hasła automatycznie unieważnia stare sesje.
 */
function getSessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || null;
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();

  return verifySessionToken(
    cookieStore.get(ADMIN_COOKIE_NAME)?.value,
    getSessionSecret()
  );
}

/**
 * Bramka dla każdej operacji modyfikującej dane.
 * Rzuca wyjątek — server action / route handler nie wykona się dalej.
 */
export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error("Brak autoryzacji administratora");
  }
}

export async function createAdminSession() {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("Brak ADMIN_PASSWORD / ADMIN_SESSION_SECRET w env");
  }

  const cookieStore = await cookies();

  cookieStore.set(ADMIN_COOKIE_NAME, createSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}
