type DataErrorProps = {
  title?: string;
  description?: string;
};

/**
 * Ekran awarii warstwy danych.
 *
 * Kluczowe: przy błędzie odczytu NIE renderujemy pustego turnieju.
 * Pusta tabela wygląda jak prawdziwy stan turnieju i wprowadza kibiców
 * w błąd, a w panelu admina groziła zapisaniem pustego draftu na bazie.
 */
export function DataError({
  title = "Chwilowy problem z danymi",
  description = "Nie udało się pobrać danych turnieju. Odśwież stronę za chwilę. Wyniki nie zostały utracone.",
}: DataErrorProps) {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-2xl px-3 py-10 sm:px-4">
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-amber-900">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            {description}
          </p>
        </section>
      </div>
    </main>
  );
}
