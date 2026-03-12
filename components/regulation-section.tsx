type RegulationSectionProps = {
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
};

export function RegulationSection({
  fileUrl,
  fileType,
  fileName,
}: RegulationSectionProps) {
  const safeFileUrl = fileUrl ?? "";
  const safeFileType = fileType ?? "";
  const safeFileName = (fileName ?? "").toLowerCase();
  const hasFile = Boolean(safeFileUrl);

  const isImage =
    safeFileType.startsWith("image/") ||
    safeFileName.endsWith(".png") ||
    safeFileName.endsWith(".jpg") ||
    safeFileName.endsWith(".jpeg") ||
    safeFileName.endsWith(".webp") ||
    safeFileName.endsWith(".gif");

  const isPdf =
    safeFileType === "application/pdf" ||
    safeFileName.endsWith(".pdf");

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Regulamin</h2>
      </div>

      <div className="w-full">
        {!hasFile ? (
          <div className="flex min-h-[300px] items-center justify-center text-sm font-medium text-slate-500">
            PLACEHOLDER — regulation file
          </div>
        ) : isImage ? (
          <div className="flex justify-center">
            <img
              src={safeFileUrl}
              alt="Regulamin turnieju"
              className="max-h-[90vh] max-w-full object-contain"
            />
          </div>
        ) : isPdf ? (
          <iframe
            src={safeFileUrl}
            title="Regulamin turnieju"
            className="h-[90vh] w-full"
          />
        ) : (
          <iframe
            src={safeFileUrl}
            title="Regulamin turnieju"
            className="h-[90vh] w-full"
          />
        )}
      </div>
    </section>
  );
}