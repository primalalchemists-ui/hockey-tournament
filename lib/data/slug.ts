/**
 * Slug turnieju generowany z tytułu.
 *
 * Współdzielony przez adapter Airtable i Postgres, żeby oba storage'e
 * wyprodukowały dokładnie ten sam slug dla tego samego tytułu.
 *
 * UWAGA: w Airtable slug jest jednocześnie kluczem relacyjnym, więc zmiana
 * tytułu osierocała dane. W Postgresie slug jest wyłącznie prezentacyjny —
 * tożsamość turnieju trzyma niezmienne `tournaments.id`.
 */
export function slugifyTournamentTitle(title: string) {
  const slug = title
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "nowy-turniej";
}
