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

  await getTournamentRepository().saveTournament(payload);
  await deleteCloudinaryAssets(deletePublicIds);

  revalidatePath("/");
  revalidatePath("/admin");
}
