"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { savePlayoffAssetAction } from "@/app/admin/actions";
import { MediaAssetPicker } from "@/components/admin/media-asset-picker";
import { MediaPreview } from "@/components/ui/media-preview";
import type { PlayoffAssetKind } from "@/lib/data/postgres/playoff-engine";

type PlayoffAssetManagerProps = {
  tournamentId: string;
  /** Tytuł turnieju, którego branding właśnie zmieniamy. */
  tournamentTitle: string;
  kind: PlayoffAssetKind;
  title: string;
  currentUrl: string | null;
};

/**
 * Nazwa pliku wprost z URL-a Cloudinary — bez dodatkowego zapytania
 * i bez zmian w kontrakcie read modelu.
 */
function assetFileName(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").pop() || url);
  } catch {
    return url.split("/").pop() || url;
  }
}

/**
 * Zarządzanie dekoracyjnym tłem sekcji play-off / podium.
 *
 * Korzysta z ISTNIEJĄCEGO uploadu Cloudinary (/api/admin/upload) —
 * nie tworzymy drugiego systemu przesyłania plików. Flow uploadu
 * pozostaje nietknięty; zmienia się wyłącznie warstwa prezentacji.
 */
export function PlayoffAssetManager({
  tournamentId,
  tournamentTitle,
  kind,
  title,
  currentUrl,
}: PlayoffAssetManagerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function persist(payload: Record<string, string>) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("tournamentId", tournamentId);
      formData.set("kind", kind);

      for (const [key, value] of Object.entries(payload)) {
        formData.set(key, value);
      }

      const result = await savePlayoffAssetAction({ error: null }, formData);
      setError(result.error);
    });
  }

  async function handleFile(file: File, displayName: string) {
    setStatus("uploading");
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Upload nie powiódł się");
      }

      setStatus("idle");

      persist({
        url: json.url,
        publicId: json.publicId ?? "",
        mimeType: file.type || "",
        // Nazwa podana przez administratora, nie techniczna z Cloudinary.
        fileName: displayName || json.name || "",
      });
    } catch (uploadError) {
      setStatus("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload nie powiódł się",
      );
    }
  }

  const isBusy = status === "uploading" || isPending;

  return (
    <>
      <MediaAssetPicker
        open={pickerOpen}
        title={title}
        /* Tła drabinki i podium dzielą jedną pulę grafik. */
        category="background"
        currentUrl={currentUrl ?? undefined}
        onCancel={() => setPickerOpen(false)}
        onSave={(asset) => {
          setPickerOpen(false);
          persist({
            url: asset.url,
            publicId: asset.publicId,
            mimeType: asset.mimeType,
            fileName: asset.fileName,
          });
        }}
        onUploadNew={handleFile}
      />

      <section className="ice-card flush-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="section-title">{title}</h2>

              {/* Stan widoczny od razu, bez wchodzenia w podgląd. */}
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  currentUrl
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200/70 text-slate-600",
                ].join(" ")}
              >
                {currentUrl ? "Dodano" : "Brak"}
              </span>
            </div>

            {/* Bez wielkiego info boxa — jedna linia kontekstu wystarczy. */}
            <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
              Grafiki turnieju:{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                {tournamentTitle}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={isBusy}
              className="btn btn-quiet"
            >
              <Pencil size={16} />
              {status === "uploading" ? "Wysyłanie..." : "Zmień"}
            </button>

            <button
              type="button"
              onClick={() => persist({ url: "" })}
              disabled={!currentUrl || isPending}
              className="btn btn-danger"
            >
              <Trash2 size={16} />
              Usuń
            </button>
          </div>
        </div>

        {/*
          Miejsce na komunikat jest zarezerwowane na stałe. Wiersz o stałej
          wysokości nie rozpycha karty w chwili, w której coś poszło nie tak.
        */}
        <p
          role="status"
          data-testid="playoff-asset-error"
          className="mt-3 h-4 truncate text-xs font-semibold text-rose-700"
        >
          {error}
        </p>

        {/*
          Kadr podglądu ma stałe wymiary niezależnie od tego, czy grafika
          jest, czy jej nie ma — podmiana tła nie rusza sekcji pod spodem.
        */}
        <div className="mt-4 flex items-center gap-3">
          <MediaPreview
            src={currentUrl || undefined}
            alt={title}
            ratio="7/4"
            emptyLabel="Brak"
            className="w-28 shrink-0 rounded-xl"
          />

          <p
            className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]"
            title={currentUrl ? assetFileName(currentUrl) : undefined}
          >
            {currentUrl
              ? assetFileName(currentUrl)
              : "Brak grafiki, sekcja używa tła domyślnego"}
          </p>
        </div>
      </section>
    </>
  );
}
