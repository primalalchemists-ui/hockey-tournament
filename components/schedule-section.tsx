// components/schedule-section.tsx
export function ScheduleSection({ imageUrl }: { imageUrl: string }) {
  const hasImage = Boolean(imageUrl);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Harmonogram</h2>
      </div>

      <div className="p-3 sm:p-4 md:p-6">
        {hasImage ? (
          <img
            src={imageUrl}
            alt="Harmonogram turnieju"
            className="w-full rounded-2xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
            PLACEHOLDER — schedule image
          </div>
        )}
      </div>
    </section>
  );
}