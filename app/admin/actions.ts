"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAdminSession,
  destroyAdminSession,
  requireAdmin,
} from "@/lib/admin-auth";
import { safeEquals } from "@/lib/admin-session";
import { getTournamentRepository } from "@/lib/data";
import { deleteCloudinaryAssets } from "@/lib/cloudinary";
import type { Tournament } from "@/types/tournament";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export type AdminLoginState = {
  error: string | null;
};

export async function loginAdminAction(
  _prevState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const password = getString(formData, "password");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return { error: "Brak ADMIN_PASSWORD w env" };
  }

  if (!safeEquals(password, expected)) {
    return { error: "Nieprawidłowe hasło" };
  }

  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdminAction() {
  await destroyAdminSession();
  redirect("/admin");
}

export async function saveAdminDraftAction(formData: FormData) {
  // Server action jest publicznie wywoływalna — autoryzacja MUSI być tutaj,
  // a nie tylko w komponencie renderującym panel.
  await requireAdmin();

  const payloadRaw = getString(formData, "payload");
  const deleteRaw = getString(formData, "deletePublicIds");
  const tournamentId = getString(formData, "tournamentId");

  // Bez jawnego identyfikatora zapis się nie odbywa. To jest bezpiecznik
  // przeciwko dawnemu zachowaniu, w którym storage sam wybierał turniej
  // i potrafił nadpisać cudze dane.
  if (!tournamentId) {
    throw new Error("Brak identyfikatora turnieju do zapisu");
  }

  if (!payloadRaw) {
    throw new Error("Brak payload do zapisu");
  }

  let payload: Tournament;
  let deletePublicIds: string[] = [];

  try {
    payload = JSON.parse(payloadRaw) as Tournament;
  } catch {
    throw new Error("Nieprawidłowy JSON payload");
  }

  if (deleteRaw) {
    try {
      deletePublicIds = JSON.parse(deleteRaw) as string[];
    } catch {
      deletePublicIds = [];
    }
  }

  await getTournamentRepository().saveTournament(tournamentId, payload);
  await deleteCloudinaryAssets(deletePublicIds);

  // Publiczna strona pokazuje tylko turniej oznaczony jako wyświetlany,
  // ale nie wiemy tutaj, czy edytowany turniej nim jest — odświeżamy oba.
  revalidatePath("/");
  revalidatePath("/admin");
}

/* ==========================================================================
 * CYKL ŻYCIA TURNIEJU
 * ======================================================================== */

export type TournamentActionState = {
  error: string | null;
};

function toMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Operacja nie powiodła się.";
}

/**
 * Tworzy nowy, PUSTY turniej i przełącza na niego panel.
 * Nowy turniej NIE staje się automatycznie wyświetlany publicznie.
 */
export async function createTournamentAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const title = getString(formData, "title");

  if (!title) {
    return { error: "Podaj nazwę turnieju." };
  }

  let created: { id: string };

  try {
    created = await getTournamentRepository().createTournament(title);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/admin");
  redirect(`/admin?tournament=${created.id}`);
}

/** Przełącza turniej wyświetlany publicznie. Operacja atomowa w bazie. */
export async function setCurrentTournamentAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");

  if (!tournamentId) {
    return { error: "Brak identyfikatora turnieju." };
  }

  try {
    await getTournamentRepository().setCurrentTournament(tournamentId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");

  return { error: null };
}

/** Archiwizuje lub przywraca turniej. Niczego nie kasuje. */
export async function setTournamentArchivedAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  const archived = getString(formData, "archived") === "true";

  if (!tournamentId) {
    return { error: "Brak identyfikatora turnieju." };
  }

  try {
    await getTournamentRepository().setTournamentArchived(
      tournamentId,
      archived
    );
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/admin");

  return { error: null };
}
