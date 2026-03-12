// app/admin/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminSession, destroyAdminSession } from "@/lib/admin-auth";
import { saveAdminDraft } from "@/lib/airtable-admin";
import type { Tournament } from "@/types/tournament";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loginAdminAction(formData: FormData) {
  const password = getString(formData, "password");

  if (!process.env.ADMIN_PASSWORD) {
    throw new Error("Brak ADMIN_PASSWORD w env");
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    throw new Error("Nieprawidłowe hasło");
  }

  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdminAction() {
  await destroyAdminSession();
  redirect("/admin");
}

export async function saveAdminDraftAction(formData: FormData) {
  const payloadRaw = getString(formData, "payload");

  if (!payloadRaw) {
    throw new Error("Brak payload do zapisu");
  }

  let payload: Tournament;

  try {
    payload = JSON.parse(payloadRaw) as Tournament;
  } catch {
    throw new Error("Nieprawidłowy JSON payload");
  }

  await saveAdminDraft(payload);

  revalidatePath("/");
  revalidatePath("/admin");
}