type RegulationSectionProps = {
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
};

function getExtensionFromFileType(fileType: string) {
  if (fileType.includes("pdf")) return "pdf";
  if (fileType.includes("png")) return "png";
  if (fileType.includes("jpeg")) return "jpg";
  if (fileType.includes("jpg")) return "jpg";
  if (fileType.includes("webp")) return "webp";
  if (fileType.includes("gif")) return "gif";
  return "";
}

function ensureDownloadFileName(fileName: string, fileType: string) {
  const trimmed = fileName.trim() || "file";

  if (trimmed.includes(".")) {
    return trimmed;
  }

  const extension = getExtensionFromFileType(fileType);

  if (!extension) {
    return trimmed;
  }

  return `${trimmed}.${extension}`;
}

function buildDownloadUrl(fileUrl: string, fileName: string) {
  const params = new URLSearchParams({
    url: fileUrl,
    filename: fileName,
  });

  return `/api/download?${params.toString()}`;
}

export function RegulationSection({
  fileUrl,
  fileType,
  fileName,
}: RegulationSectionProps) {
  const safeFileUrl = fileUrl ?? "";
  const safeFileType = fileType ?? "";
  const safeFileName = fileName ?? "";
  const normalizedFileName = safeFileName.toLowerCase();
  const hasFile = Boolean(safeFileUrl);

  const isImage =
    safeFileType.startsWith("image/") ||
    normalizedFileName.endsWith(".png") ||
    normalizedFileName.endsWith(".jpg") ||
    normalizedFileName.endsWith(".jpeg") ||
    normalizedFileName.endsWith(".webp") ||
    normalizedFileName.endsWith(".gif");

  const isPdf =
    safeFileType === "application/pdf" || normalizedFileName.endsWith(".pdf");

  const downloadFileName = "regulamin.pdf";

  const downloadUrl = hasFile
    ? buildDownloadUrl(safeFileUrl, downloadFileName)
    : "";

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
          <div className="flex justify-center bg-white p-2 sm:p-4">
            <img
              src={safeFileUrl}
              alt="Regulamin turnieju"
              className="h-auto max-w-full rounded-2xl object-contain"
            />
          </div>
        ) : isPdf ? (
          <div className="space-y-4 p-4 sm:p-6">
            <div className="rounded-2xl">
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <a
                  href={safeFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Otwórz PDF
                </a>

                <a
                  href={downloadUrl}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Pobierz plik
                </a>
              </div>
            </div>

            <div className="hidden md:block">
              <iframe
                src={safeFileUrl}
                title="Regulamin turnieju"
                className="h-[85vh] w-full rounded-2xl border border-slate-200"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4 sm:p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <p className="text-sm font-medium text-slate-900">
                Ten plik nie ma bezpośredniego podglądu w aplikacji.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <a
                  href={safeFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Otwórz plik
                </a>

                <a
                  href={downloadUrl}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Pobierz plik
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}