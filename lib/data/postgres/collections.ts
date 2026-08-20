import "server-only";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  tournamentCollectionMembers,
  tournamentCollections,
  tournaments,
} from "@/lib/db/schema";
import { TournamentOperationError } from "@/lib/data/types";
import { normalizeColorToHex } from "@/lib/public/color";
import {
  DEFAULT_BUBBLE_COLOR,
  MAX_CATEGORY_LABEL,
  normalizeCategoryLabel,
} from "@/lib/public/tournament-collection";

/**
 * KOLEKCJE TURNIEJÓW — kilka kategorii jednego wydarzenia.
 *
 * ZASADA NADRZĘDNA: kolekcja NIE DOTYKA `is_current`. To, który turniej
 * widzi kibic po wejściu na stronę, pozostaje wyłączną decyzją administratora
 * i jest rozstrzygane przy świeżym wejściu. Przełącznik kategorii zmienia
 * jedynie lokalny widok bieżącej sesji.
 *
 * Kolekcja nie dotyka też danych sportowych ani archiwum — trzyma wyłącznie
 * metadane prezentacyjne: etykietę, kolor i kolejność.
 */

export type CollectionMember = {
  tournamentId: string;
  title: string;
  label: string;
  bubbleColor: string;
  sortOrder: number;
  /** Wyłącznie dla panelu — informacja, nie sterowanie. */
  isCurrent: boolean;
  isArchived: boolean;
};

export type TournamentCollectionView = {
  collectionId: string;
  members: CollectionMember[];
};

/** Lekki model dla publicznego przełącznika — bez drużyn i meczów. */
export type PublicCategory = {
  tournamentId: string;
  label: string;
  bubbleColor: string;
};

async function readMembers(collectionId: string): Promise<CollectionMember[]> {
  const rows = await getDb()
    .select({
      tournamentId: tournamentCollectionMembers.tournamentId,
      label: tournamentCollectionMembers.label,
      bubbleColor: tournamentCollectionMembers.bubbleColor,
      sortOrder: tournamentCollectionMembers.sortOrder,
      title: tournaments.title,
      isCurrent: tournaments.isCurrent,
      archivedAt: tournaments.archivedAt,
    })
    .from(tournamentCollectionMembers)
    .innerJoin(
      tournaments,
      eq(tournaments.id, tournamentCollectionMembers.tournamentId)
    )
    .where(eq(tournamentCollectionMembers.collectionId, collectionId))
    .orderBy(
      asc(tournamentCollectionMembers.sortOrder),
      asc(tournamentCollectionMembers.label)
    );

  return rows.map((row) => ({
    tournamentId: row.tournamentId,
    title: row.title,
    label: row.label,
    bubbleColor: row.bubbleColor,
    sortOrder: row.sortOrder,
    isCurrent: row.isCurrent,
    isArchived: row.archivedAt !== null,
  }));
}

/** Kolekcja turnieju wraz ze WSZYSTKIMI członkami — widok panelu. */
export async function getCollectionForTournament(
  tournamentId: string
): Promise<TournamentCollectionView | null> {
  const rows = await getDb()
    .select({ collectionId: tournamentCollectionMembers.collectionId })
    .from(tournamentCollectionMembers)
    .where(eq(tournamentCollectionMembers.tournamentId, tournamentId))
    .limit(1);

  const collectionId = rows[0]?.collectionId;
  if (!collectionId) return null;

  return { collectionId, members: await readMembers(collectionId) };
}

/**
 * Kategorie widoczne publicznie dla danego turnieju.
 *
 * Zwraca `null`, gdy przełącznik nie ma sensu: brak kolekcji albo mniej niż
 * dwie kategorie nadające się do pokazania. Zarchiwizowane turnieje są
 * odfiltrowane — ich miejsce jest w sekcji „Poprzednie turnieje".
 */
export async function getPublicCategories(
  tournamentId: string
): Promise<PublicCategory[] | null> {
  const collection = await getCollectionForTournament(tournamentId);
  if (!collection) return null;

  const eligible = collection.members.filter((member) => !member.isArchived);

  if (eligible.length < 2) return null;
  if (!eligible.some((member) => member.tournamentId === tournamentId)) {
    return null;
  }

  return eligible.map((member) => ({
    tournamentId: member.tournamentId,
    label: member.label,
    bubbleColor: member.bubbleColor,
  }));
}

/**
 * GRANICA PUBLIKACJI.
 *
 * Sam fakt znajomości UUID nie wystarcza, żeby odczytać turniej publicznie.
 * Wolno czytać wyłącznie turniej wyświetlany globalnie ALBO niezarchiwizowanego
 * członka tej samej kolekcji. Wszystko inne (szkice, cudze kolekcje, archiwum)
 * jest niedostępne.
 */
export async function isPubliclyReadable(tournamentId: string): Promise<boolean> {
  const db = getDb();

  const currentRows = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.isCurrent, true))
    .limit(1);

  const currentId = currentRows[0]?.id;
  if (!currentId) return false;
  if (currentId === tournamentId) return true;

  const categories = await getPublicCategories(currentId);
  if (!categories) return false;

  return categories.some((item) => item.tournamentId === tournamentId);
}

/* ==========================================================================
 * ZAPIS — wylacznie metadane prezentacyjne
 * ======================================================================== */

type MemberInput = {
  tournamentId: string;
  label: string;
  bubbleColor: string;
};

function requireLabel(input: string): string {
  const label = normalizeCategoryLabel(input);

  if (!label) {
    throw new TournamentOperationError(
      `Etykieta kategorii jest wymagana i moze miec maksymalnie ${MAX_CATEGORY_LABEL} znakow.`
    );
  }

  return label;
}

function requireColor(input: string): string {
  return normalizeColorToHex(input) ?? DEFAULT_BUBBLE_COLOR;
}

/** Turniej nadajacy sie do dolaczenia: istnieje i nie jest w innej kolekcji. */
export async function listConnectableTournaments(tournamentId: string) {
  const db = getDb();

  const rows = await db
    .select({
      id: tournaments.id,
      title: tournaments.title,
      memberId: tournamentCollectionMembers.id,
    })
    .from(tournaments)
    .leftJoin(
      tournamentCollectionMembers,
      eq(tournamentCollectionMembers.tournamentId, tournaments.id)
    )
    .where(
      and(
        ne(tournaments.id, tournamentId),
        // Zarchiwizowane naleza do historii, nie do przelacznika.
        isNull(tournaments.archivedAt)
      )
    )
    .orderBy(asc(tournaments.title));

  // Turniej nalezacy juz do JAKIEJKOLWIEK kolekcji nie jest wybieralny -
  // scalanie wydarzen to osobna, swiadoma decyzja, nie efekt uboczny.
  return rows
    .filter((row) => !row.memberId)
    .map((row) => ({ id: row.id, title: row.title }));
}

/**
 * Sprząta wydarzenia, które straciły wszystkich członków.
 *
 * Usunięcie turnieju kasuje jego członkostwo kaskadą, ale sama kolekcja
 * zostałaby pustym rekordem. Nikomu się nie pokazuje, więc to wyłącznie
 * higiena — wołana przy operacjach, które i tak dotykają kolekcji.
 */
export async function pruneEmptyCollections(): Promise<number> {
  const rows = await getDb().execute<{ id: string }>(sql`
    delete from tournament_collections c
    where not exists (
      select 1 from tournament_collection_members m where m.collection_id = c.id
    )
    returning c.id
  `);

  const deleted = (rows as unknown as { rows?: unknown[] }).rows ?? [];

  return Array.isArray(deleted) ? deleted.length : 0;
}

/** Podnosi wersje publiczna wszystkich czlonkow kolekcji. */
async function bumpCollectionMembers(collectionId: string) {
  const db = getDb();

  const rows = await db
    .select({ tournamentId: tournamentCollectionMembers.tournamentId })
    .from(tournamentCollectionMembers)
    .where(eq(tournamentCollectionMembers.collectionId, collectionId));

  const ids = rows.map((row) => row.tournamentId);
  if (ids.length === 0) return;

  /*
    Zmiana etykiety albo koloru jest zmiana publiczna dla KAZDEJ kategorii
    wydarzenia - kolekcje sa male, wiec jeden zbiorczy bump jest prostszy
    niz osobna infrastruktura wersjonowania kolekcji.
  */
  await db
    .update(tournaments)
    .set({
      publicRevision: sql`${tournaments.publicRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(tournaments.id, ids));
}

/**
 * Laczy turnieje w jedno wydarzenie.
 *
 * Nie dotyka `is_current`, `archived_at` ani danych sportowych - powstaje
 * wylacznie relacja i metadane przelacznika.
 */
export async function connectTournaments(input: {
  members: MemberInput[];
}): Promise<string> {
  const db = getDb();

  if (input.members.length < 2) {
    throw new TournamentOperationError(
      "Do polaczenia potrzebne sa co najmniej dwa turnieje."
    );
  }

  const labels = input.members.map((member) => requireLabel(member.label));

  if (new Set(labels).size !== labels.length) {
    throw new TournamentOperationError("Etykiety kategorii musza byc rozne.");
  }

  const existing = await Promise.all(
    input.members.map((member) =>
      getCollectionForTournament(member.tournamentId)
    )
  );

  const collections = [
    ...new Set(existing.filter(Boolean).map((item) => item!.collectionId)),
  ];

  if (collections.length > 1) {
    throw new TournamentOperationError(
      "Te turnieje naleza juz do roznych wydarzen. Najpierw usun jeden z nich z przelacznika."
    );
  }

  let collectionId = collections[0];

  if (!collectionId) {
    const [created] = await db
      .insert(tournamentCollections)
      .values({})
      .returning({ id: tournamentCollections.id });

    collectionId = created.id;
  }

  const current = await readMembers(collectionId);
  let nextOrder = current.length;

  for (const [index, member] of input.members.entries()) {
    if (current.some((item) => item.tournamentId === member.tournamentId)) {
      continue;
    }

    await db.insert(tournamentCollectionMembers).values({
      collectionId,
      tournamentId: member.tournamentId,
      label: labels[index],
      bubbleColor: requireColor(member.bubbleColor),
      sortOrder: nextOrder,
    });

    nextOrder += 1;
  }

  await bumpCollectionMembers(collectionId);

  return collectionId;
}

/** Zmiana etykiety i koloru pojedynczej kategorii. */
export async function updateCollectionMember(input: {
  tournamentId: string;
  label: string;
  bubbleColor: string;
}) {
  const db = getDb();

  const collection = await getCollectionForTournament(input.tournamentId);

  if (!collection) {
    throw new TournamentOperationError("Ten turniej nie nalezy do wydarzenia.");
  }

  const label = requireLabel(input.label);

  const clash = collection.members.some(
    (member) =>
      member.label === label && member.tournamentId !== input.tournamentId
  );

  if (clash) {
    throw new TournamentOperationError(
      "Taka etykieta jest juz uzyta w tym wydarzeniu."
    );
  }

  await db
    .update(tournamentCollectionMembers)
    .set({ label, bubbleColor: requireColor(input.bubbleColor) })
    .where(eq(tournamentCollectionMembers.tournamentId, input.tournamentId));

  await bumpCollectionMembers(collection.collectionId);
}

/** Przesuniecie kategorii w kolejnosci przelacznika. */
export async function moveCollectionMember(input: {
  tournamentId: string;
  direction: -1 | 1;
}) {
  const db = getDb();

  const collection = await getCollectionForTournament(input.tournamentId);
  if (!collection) return;

  const index = collection.members.findIndex(
    (member) => member.tournamentId === input.tournamentId
  );

  const target = index + input.direction;
  if (index === -1 || target < 0 || target >= collection.members.length) return;

  const ordered = [...collection.members];
  const [moved] = ordered.splice(index, 1);
  ordered.splice(target, 0, moved);

  // Numerujemy od zera, zeby kolejnosc byla zawsze deterministyczna.
  for (const [position, member] of ordered.entries()) {
    await db
      .update(tournamentCollectionMembers)
      .set({ sortOrder: position })
      .where(eq(tournamentCollectionMembers.tournamentId, member.tournamentId));
  }

  await bumpCollectionMembers(collection.collectionId);
}

/**
 * Usuniecie turnieju z przelacznika.
 *
 * Turniej ZOSTAJE w systemie razem z calymi danymi - znika wylacznie
 * mozliwosc przelaczenia sie do niego. Kolekcja z jedna kategoria nie ma
 * sensu, wiec rozpada sie w calosci.
 */
export async function removeCollectionMember(tournamentId: string) {
  const db = getDb();

  const collection = await getCollectionForTournament(tournamentId);
  if (!collection) return;

  const affected = collection.members.map((member) => member.tournamentId);

  await db
    .delete(tournamentCollectionMembers)
    .where(eq(tournamentCollectionMembers.tournamentId, tournamentId));

  const remaining = await readMembers(collection.collectionId);

  if (remaining.length < 2) {
    await db
      .delete(tournamentCollectionMembers)
      .where(
        eq(tournamentCollectionMembers.collectionId, collection.collectionId)
      );

    await db
      .delete(tournamentCollections)
      .where(eq(tournamentCollections.id, collection.collectionId));
  }

  await pruneEmptyCollections();

  // Odswiezamy WSZYSTKICH bylych czlonkow, lacznie z tym, ktory odszedl.
  await db
    .update(tournaments)
    .set({
      publicRevision: sql`${tournaments.publicRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(tournaments.id, affected));
}
