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
import { TournamentOperationError } from "@/lib/data/types";
import type { GroupResultInput, MediaAsset } from "@/lib/data/types";
import { isMediaCategory, type MediaCategory } from "@/lib/media/categories";
import type { OperationIssueReport } from "@/lib/playoff/validation";
import type { ReopenImpact } from "@/lib/data/postgres/playoff-engine";
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
  /**
   * Czytelna dla człowieka postać błędu: lista meczów z nazwami i herbami.
   * Obecna tylko tam, gdzie silnik ją zbudował — panel woli ją od `error`.
   */
  details?: OperationIssueReport | null;
};

function toMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Operacja nie powiodła się.";
}

/** Błąd operacji razem ze strukturą, jeśli silnik ją dostarczył. */
function toActionError(error: unknown): TournamentActionState {
  return {
    error: toMessage(error),
    details:
      error instanceof TournamentOperationError ? (error.details ?? null) : null,
  };
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
    // Checkbox nieodhaczony w ogóle nie trafia do FormData.
    scorersEnabled: getString(formData, "scorersEnabled") === "true",
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
      scorersEnabled: settings.scorersEnabled,
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

  let slug: string | null = null;

  try {
    const repository = getTournamentRepository();

    await repository.setTournamentArchived(tournamentId, archived);

    // Slug potrzebny WYŁĄCZNIE do odświeżenia właściwej strony historii.
    const summaries = await repository.listTournaments();
    slug = summaries.find((item) => item.id === tournamentId)?.slug ?? null;
  } catch (error) {
    return toActionError(error);
  }

  /*
    Archiwizacja i przywrócenie zmieniają DWA publiczne widoki: karuzelę
    „Poprzednie turnieje" na stronie głównej oraz samą stronę wyników
    archiwalnych, która po przywróceniu przestaje być dostępna.
  */
  revalidatePath("/admin");
  revalidatePath("/");
  if (slug) revalidatePath(`/turnieje/${slug}`);

  return { error: null };
}

/**
 * Usuwa turniej TRWALE, razem z danymi należącymi wyłącznie do niego.
 *
 * Operacji nie da się cofnąć, więc panel proponuje obok niej archiwizację —
 * to samo okno, dwa różne wyjścia.
 */
export async function deleteTournamentAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");

  if (!tournamentId) {
    return { error: "Brak identyfikatora turnieju." };
  }

  let slug: string | null = null;

  try {
    const repository = getTournamentRepository();

    /*
      Slug czytamy PRZED usunięciem — po nim nie ma już czego pytać,
      a strona archiwalna tego turnieju wymaga odświeżenia.
    */
    const summaries = await repository.listTournaments();
    slug = summaries.find((item) => item.id === tournamentId)?.slug ?? null;

    await repository.deleteTournamentPermanently(tournamentId);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/admin");
  revalidatePath("/");
  if (slug) revalidatePath(`/turnieje/${slug}`);

  return { error: null };
}

/**
 * ZAPIS SAMYCH WYNIKÓW — wąska ścieżka dla przycisku przy tabeli.
 *
 * Zwraca powód niepowodzenia zamiast go rzucać, bo panel ma go POKAZAĆ.
 * Samo słowo „Błąd" nie mówi, czy zerwało sieć, wygasła sesja, czy faza
 * grupowa jest zamrożona — a każda z tych sytuacji wymaga czego innego.
 */
export async function saveGroupResultsAction(
  tournamentId: string,
  results: GroupResultInput[]
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sesja wygasła. Zaloguj się ponownie w drugiej karcie." };
  }

  if (!tournamentId) {
    return { error: "Brak identyfikatora turnieju." };
  }

  try {
    await getTournamentRepository().saveGroupResults(tournamentId, results);
  } catch (error) {
    console.error("[admin] saveGroupResults failed:", error);
    return { error: toMessage(error) };
  }

  revalidatePath("/");
  revalidatePath("/admin");

  return { error: null };
}

/** Pliki pasujące do danego pola — do wyboru bez ponownego uploadu. */
export async function listMediaAction(
  category: MediaCategory
): Promise<MediaAsset[]> {
  await requireAdmin();

  if (!isMediaCategory(category)) return [];

  try {
    return await getTournamentRepository().listMediaLibrary(category);
  } catch (error) {
    /*
      Bez tego wpisu w logu okno mówiło tylko „nie udało się", a powód
      zostawał po stronie serwera. Rzucamy dalej — klient ma pokazać stan
      błędu z możliwością ponowienia, a nie udawać pustą bibliotekę.
    */
    console.error("[admin] listMediaLibrary failed:", category, error);
    throw error;
  }
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
    return toActionError(error);
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
    return toActionError(error);
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
    return toActionError(error);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

/**
 * Podgląd skutków cofnięcia — do okna potwierdzenia w panelu.
 *
 * Tekst modala MUSI opisywać rzeczywiste zachowanie silnika, więc
 * pochodzi z tej samej funkcji, która potem wykonuje operację.
 */
export async function describeReopenAction(
  tournamentId: string
): Promise<
  | { ok: true; impact: ReopenImpact }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const { describeReopen } = await import(
      "@/lib/data/postgres/playoff-engine"
    );

    return { ok: true, impact: await describeReopen(tournamentId) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
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
    return toActionError(error);
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

/* ==========================================================================
 * KATEGORIE WYDARZENIA
 * ======================================================================== */

/**
 * Połączenie turniejów w jedno wydarzenie.
 *
 * ŻADNA z tych operacji nie zmienia turnieju wyświetlanego publicznie —
 * `is_current` pozostaje wyłączną decyzją administratora podejmowaną
 * w selektorze turniejów.
 */
export async function connectTournamentsAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const currentId = getString(formData, "tournamentId");
  const targetId = getString(formData, "targetTournamentId");

  if (!currentId || !targetId) {
    return { error: "Wybierz turniej, z którym chcesz połączyć." };
  }

  try {
    const { connectTournaments, getCollectionForTournament } = await import(
      "@/lib/data/postgres/collections"
    );

    /*
      Dodanie TRZECIEJ i kolejnej kategorii nie każe administratorowi
      przepisywać ustawień turnieju, w którym stoi — jego etykietę i kolor
      bierzemy z istniejącego członkostwa.
    */
    const existing = (await getCollectionForTournament(currentId))?.members.find(
      (member) => member.tournamentId === currentId
    );

    await connectTournaments({
      members: [
        {
          tournamentId: currentId,
          label: getString(formData, "currentLabel") || existing?.label || "",
          bubbleColor:
            getString(formData, "currentColor") || existing?.bubbleColor || "",
        },
        {
          tournamentId: targetId,
          label: getString(formData, "targetLabel"),
          bubbleColor: getString(formData, "targetColor"),
        },
      ],
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}

/** Zmiana etykiety i koloru jednej kategorii. */
export async function updateCategoryAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { updateCollectionMember } = await import(
      "@/lib/data/postgres/collections"
    );

    await updateCollectionMember({
      tournamentId,
      label: getString(formData, "label"),
      bubbleColor: getString(formData, "bubbleColor"),
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}

/** Zmiana kolejności kategorii na przełączniku. */
export async function moveCategoryAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  const direction = getString(formData, "direction") === "up" ? -1 : 1;

  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { moveCollectionMember } = await import(
      "@/lib/data/postgres/collections"
    );

    await moveCollectionMember({ tournamentId, direction });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}

/** Usunięcie turnieju z przełącznika. Sam turniej zostaje nietknięty. */
export async function removeCategoryAction(
  _prevState: TournamentActionState,
  formData: FormData
): Promise<TournamentActionState> {
  await requireAdmin();

  const tournamentId = getString(formData, "tournamentId");
  if (!tournamentId) return { error: "Brak identyfikatora turnieju." };

  try {
    const { removeCollectionMember } = await import(
      "@/lib/data/postgres/collections"
    );

    await removeCollectionMember(tournamentId);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}
