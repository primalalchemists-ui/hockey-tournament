export function LegendTable() {
  const items = [
    { key: "M", label: "Mecze rozegrane" },
    { key: "W", label: "Wygrane" },
    { key: "R", label: "Remisy" },
    { key: "P", label: "Przegrane" },
    { key: "Pkt", label: "Punkty" },
    { key: "G+", label: "Bramki zdobyte" },
    { key: "G-", label: "Bramki stracone" },
    { key: "Bil.", label: "Różnica bramek (G+ minus G-)" },
    // {
    //   key: "?",
    //   label:
    //     "Remis nierozstrzygnięty po zastosowaniu wszystkich kryteriów tabeli — o kolejności decydują rzuty karne.",
    // },
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h3 className="text-lg font-semibold text-slate-900">
          Legenda kolumn tabeli
        </h3>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                {item.key}
              </span>

              <span className="text-sm text-slate-700">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}