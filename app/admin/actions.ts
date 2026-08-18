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
import { parseTournamentSettings } from "@/types/tournament-config";
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
/** Wyciąga i waliduje konfigurację turnieju z formularza panelu. */
function readSettingsFromForm(formData: FormData) {
  const format = getString(formData, "format");

  return parseTournamentSettings({
    structure: getString(formData, "structure"),
    format,
    playoffConfig:
      format === "group_playoff"
        ? {
            qualifiedTeamCount: Number(getString(formData, "qualifiedTeamCount")),
            thirdPlaceMatch: getString(formData, "thirdPlaceMatch") === "true",
            placementMode: getString(formData, "placementMode"),
            tieBreaker: "penalties",
          }
        : undefined,
  });
}

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
    // Turniej powstaje od razu z kompletną, zwalidowaną konfiguracją —
    // nie ma stanu pośredniego "utworzony, ale jeszcze nieskonfigurowany".
    created = await getTournamentRepository().createTournament({
      title,
      settings: readSettingsFromForm(formData),
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/admin");
  redirect(`/admin?tournament=${created.id}`);
}

/** Edycja nazwy i konfiguracji istniejącego turnieju. */
export async function updateTournamentSettingsAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");

  if (!tournamentId) {
    return { error: "Brak identyfikatora turnieju." };
  }

  try {
    const settings = readSettingsFromForm(formData);

    await getTournamentRepository().updateTournamentSettings(tournamentId, {
      title: getString(formData, "title"),
      structure: settings.structure,
      format: settings.format,
      playoffConfig: settings.playoffConfig ?? undefined,
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");

  return { error: null };
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

/* ==========================================================================
 * SILNIK FAZY PUCHAROWEJ
 * ======================================================================== */

/** Zamyka fazę grupową: snapshot + drabinka + minigrupa, w jednej transakcji. */
export async function completeGroupStageAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { completeGroupStage } = await import(
      "@/lib/data/postgres/playoff-engine"
    );
    await completeGroupStage(tournamentId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

/** Zamyka bieżącą rundę pucharową i aktywuje kolejną. */
export async function completeCurrentRoundAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { completeCurrentRound } = await import(
      "@/lib/data/postgres/playoff-engine"
    );
    await completeCurrentRound(tournamentId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

/** Ostateczne zamknięcie turnieju — wymaga kompletu wyników. */
export async function completeTournamentAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { completeTournament } = await import(
      "@/lib/data/postgres/playoff-engine"
    );
    await completeTournament(tournamentId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

/**
 * Cofnięcie do poprzedniej fazy.
 * Kasowanie wpisanych wyników wymaga jawnego potwierdzenia z UI.
 */
export async function reopenPreviousPhaseAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { reopenPreviousPhase } = await import(
      "@/lib/data/postgres/playoff-engine"
    );

    await reopenPreviousPhase({
      tournamentId,
      confirmDataLoss: getString(formData, "confirmDataLoss") === "true",
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

/** Zapis wyniku meczu pucharowego lub minigrupy (remis niedozwolony). */
export async function savePlayoffScoreAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  const matchExternalId = getString(formData, "matchExternalId");

  if (!tournamentId || !matchExternalId) {
    return { error: "Brak identyfikatora meczu." };
  }

  const homeRaw = getString(formData, "homeScore");
  const awayRaw = getString(formData, "awayScore");

  const clear = homeRaw === "" && awayRaw === "";

  try {
    const { savePlayoffMatchResult } = await import(
      "@/lib/data/postgres/playoff-engine"
    );

    await savePlayoffMatchResult({
      tournamentId,
      matchExternalId,
      homeScore: clear ? null : Number(homeRaw),
      awayScore: clear ? null : Number(awayRaw),
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

/** Zapis / usunięcie dekoracyjnego tła sekcji play-off lub podium. */
export async function savePlayoffAssetAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  const kind = getString(formData, "kind");

  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  if (kind !== "playoff_bracket_background" && kind !== "podium_background") {
    return { error: "Nieznany rodzaj grafiki." };
  }

  const url = getString(formData, "url");

  try {
    const { setPlayoffAsset } = await import(
      "@/lib/data/postgres/playoff-engine"
    );

    await setPlayoffAsset({
      tournamentId,
      kind,
      asset: url
        ? {
            url,
            publicId: getString(formData, "publicId") || null,
            mimeType: getString(formData, "mimeType") || null,
            fileName: getString(formData, "fileName") || null,
          }
        : null,
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}
