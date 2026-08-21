"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, FileText, Plus, X } from "lucide-react";

import { ModalPortal } from "@/components/ui/modal-portal";
import { MediaPreview } from "@/components/ui/media-preview";
import { lockBodyScroll } from "@/lib/public/scroll-lock";
import { listMediaAction } from "@/app/admin/actions";
import type { MediaAsset } from "@/lib/data/types";
import {
  MEDIA_CATEGORIES,
  previewVariantFor,
  type MediaCategory,
} from "@/lib/media/categories";

/**
 * WSPÓLNY WYBÓR PLIKU — jedno okno dla wszystkich mediów w panelu.
 *
 * Wcześniej każde pole miało dwie akcje: „Zmień" i „Wybierz z biblioteki".
 * Admin musiał z góry wiedzieć, czy plik już istnieje — a zwykle nie
 * wiedział, więc wgrywał go po raz kolejny.
 *
 * DWIE DROGI, JEDNO ZATWIERDZENIE.
 *
 * Można wskazać plik z biblioteki albo wgrać nowy. Obie drogi kończy ten sam
 * przycisk „Zapisz" i dopiero on cokolwiek zmienia. Kliknięcie kafelka tylko
 * zaznacza, wskazanie pliku z dysku tylko go odkłada — dzięki temu „Anuluj"
 * i „×" naprawdę mają co porzucić, a trafienie palcem w kafelek podczas
 * przewijania nie podmienia grafiki na stronie turnieju.
 *
 * KOLEJNOŚĆ PRZY NOWYM PLIKU JEST DOWOLNA. Można najpierw wpisać nazwę,
 * a można najpierw wybrać plik. „Wybierz plik" nigdy nie jest zablokowane;
 * kompletu danych pilnuje dopiero „Zapisz".
 */

export type MediaAssetPickerProps = {
  open: boolean;
  title: string;
  category: MediaCategory;
  /** Adres pliku aktualnie przypisanego do pola. */
  currentUrl?: string;
  onCancel: () => void;
  /** Zatwierdzony wybór — dopiero tutaj pole dostaje nowy plik. */
  onSave: (asset: MediaAsset) => void;
  /** Wgranie nowego pliku istniejącą ścieżką uploadu pola. */
  onUploadNew: (file: File, displayName: string) => Promise<void>;
};

export function MediaAssetPicker({
  open,
  title,
  category,
  currentUrl,
  onCancel,
  onSave,
  onUploadNew,
}: MediaAssetPickerProps) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  /*
    DWA RÓŻNE BŁĘDY, DWA RÓŻNE MIEJSCA.

    Nieudane wczytanie biblioteki dotyczy OBSZARU Z PLIKAMI i da się je
    ponowić bez zamykania okna. Nieudany zapis dotyczy stopki. Wcześniej
    dzieliły jeden komunikat, więc awaria listy zostawiała pusty prostokąt
    i zdanie w rogu, którego nie dało się w żaden sposób obsłużyć.
  */
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** Puste wymagane pole: obwódka, focus i drgnienie — nigdy nowy wiersz. */
  const [nameInvalid, setNameInvalid] = useState(false);
  const [shake, setShake] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const nameErrorId = useId();

  const definition = MEDIA_CATEGORIES[category];

  useEffect(() => {
    if (!open) return;

    let active = true;
    setAssets(null);
    setLibraryFailed(false);
    setStatus(null);
    setSelectedUrl(currentUrl ?? null);
    setIsAdding(false);
    setDisplayName("");
    setPendingFile(null);
    setNameInvalid(false);

    listMediaAction(category)
      .then((rows) => {
        if (active) setAssets(rows);
      })
      .catch(() => {
        if (active) setLibraryFailed(true);
      });

    return () => {
      active = false;
    };
  }, [open, category, currentUrl, attempt]);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    // Strona pod oknem stoi — także na iOS. Patrz lib/public/scroll-lock.
    const restoreScroll = lockBodyScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        // Escape zachowuje się jak „Anuluj": porzuca niezapisany wybór.
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([type="file"]), [tabindex]:not([tabindex="-1"])'
      );
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
      restoreRef.current?.focus();
    };
  }, [open, onCancel]);

  /** Zwraca uwagę na pole, nie zmieniając wysokości okna. */
  function reportMissingName() {
    setNameInvalid(true);
    nameRef.current?.focus();

    // Wygaszenie i ponowne włączenie — inaczej druga próba nie drgnie.
    setShake(false);
    window.requestAnimationFrame(() => setShake(true));
  }

  async function handleSave() {
    if (isSaving) return;

    if (isAdding) {
      if (!pendingFile) return;

      if (!displayName.trim()) {
        reportMissingName();
        return;
      }

      setIsSaving(true);
      setStatus(null);

      try {
        await onUploadNew(pendingFile, displayName.trim());
        // Plik jest już przypisany do pola — nie ma po co wracać do listy.
        onCancel();
      } catch {
        setStatus("Nie udało się wgrać pliku.");
      } finally {
        setIsSaving(false);
      }

      return;
    }

    const chosen = assets?.find((asset) => asset.url === selectedUrl);
    if (chosen) onSave(chosen);
  }

  if (!open) return null;

  const selected = assets?.find((asset) => asset.url === selectedUrl) ?? null;

  const canSave = isAdding
    ? pendingFile !== null
    : Boolean(selected) && selected?.url !== currentUrl;

  return (
    <ModalPortal>
      <div
        className="dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        onClick={(event) => {
          if (event.target === event.currentTarget && !isSaving) onCancel();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="media-picker"
          className="dialog-card flex max-h-[88dvh] w-full max-w-[42rem] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h2>

            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              aria-label="Zamknij"
              data-testid="dialog-close"
              className="dialog-close inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {/*
            OBSZAR Z PLIKAMI MA SWOJE MIEJSCE OD PIERWSZEJ KLATKI.

            Wysokość bierze się z `--media-library-h`, nie z liczby plików,
            więc nadejście listy z serwera nie rusza ani przycisku „Dodaj
            nowy", ani stopki. Przewija się wyłącznie ten prostokąt: okno
            nie rośnie w dół, choćby plików było czterdzieści.
          */}
          <div className="min-h-0 shrink-0 px-5 pt-4">
            <div
              data-testid="media-library-area"
              className="media-library-area ice-scroll relative overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
            >
              {!assets && !libraryFailed ? (
                /* Loader w TYM SAMYM prostokącie — zero zmiany wymiarów. */
                <span
                  data-testid="media-library-loader"
                  className="media-fade absolute inset-0 flex items-center justify-center text-slate-400"
                >
                  <span className="spinner spinner-lg" aria-hidden="true" />
                  <span className="sr-only">Wczytywanie plików</span>
                </span>
              ) : null}

              {libraryFailed ? (
                /*
                  Awaria listy nie zamyka okna i nie wymaga zaczynania od nowa.
                  Ponowienie odpala ten sam odczyt — najczęstsza przyczyna to
                  chwilowa utrata połączenia.
                */
                <div
                  data-testid="media-library-error"
                  className="media-fade absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center"
                >
                  <p className="text-sm font-semibold text-rose-700">
                    Nie udało się wczytać plików.
                  </p>

                  <button
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                    data-testid="media-library-retry"
                    className="btn btn-quiet"
                  >
                    Spróbuj ponownie
                  </button>
                </div>
              ) : null}

              {assets && assets.length === 0 ? (
                <p
                  data-testid="media-picker-empty"
                  className="media-fade absolute inset-0 flex items-center justify-center text-sm text-slate-500"
                >
                  Brak zapisanych plików
                </p>
              ) : null}

              {assets && assets.length > 0 ? (
              <ul
                data-testid="media-picker-grid"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                {assets.map((asset, index) => {
                  const isSelected = !isAdding && asset.url === selectedUrl;
                  const variant = previewVariantFor(category, asset.mimeType);

                  return (
                    <li
                      key={asset.url}
                      className="media-card"
                      /* Ledwie wyczuwalne wejście siatki, nie defilada. */
                      style={{ animationDelay: `${Math.min(index, 8) * 14}ms` }}
                    >
                      <button
                        type="button"
                        data-testid="media-picker-item"
                        data-selected={isSelected ? "true" : "false"}
                        data-variant={variant}
                        aria-pressed={isSelected}
                        onClick={() => {
                          // Powrót do biblioteki porzuca zaczęty upload.
                          setIsAdding(false);
                          setNameInvalid(false);
                          setSelectedUrl(asset.url);
                        }}
                        className={[
                          "relative block w-full overflow-hidden rounded-2xl border-2 bg-white text-left",
                          "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                          isSelected
                            ? "border-slate-900 ring-2 ring-slate-900/15"
                            : "border-slate-200 hover:border-slate-400",
                        ].join(" ")}
                      >
                        {isSelected ? (
                          <span className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                            <Check size={14} />
                          </span>
                        ) : null}

                        {variant === "image" ? (
                          <MediaPreview
                            src={asset.url}
                            alt=""
                            ratio="4/3"
                            fit="contain"
                            emptyLabel=""
                            testId="media-picker-thumb"
                            className="rounded-none"
                          />
                        ) : (
                          /* Dokument dostaje kartę, nie zepsutą miniaturkę. */
                          <span
                            className="flex flex-col items-center justify-center gap-1.5 bg-slate-50 text-slate-500"
                            style={{ aspectRatio: "4/3" }}
                          >
                            <FileText size={26} />
                            <span className="text-[11px] font-semibold uppercase">
                              {asset.mimeType.includes("pdf") ? "PDF" : "Plik"}
                            </span>
                          </span>
                        )}

                        <span className="block truncate px-2 py-1.5 text-xs font-semibold text-slate-700">
                          {asset.fileName || "Bez nazwy"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              ) : null}
            </div>
          </div>

          {/*
            Dodawanie stoi POZA przewijanym prostokątem, więc nie ucieka
            razem z listą i nie zmienia jej wysokości.
          */}
          <div className="shrink-0 px-5 pb-4 pt-3">
            {isAdding ? (
              <div className="media-fade space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nazwa
                  </span>

                  <input
                    ref={nameRef}
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      // Poprawianie kasuje błąd od razu, bez czekania na zapis.
                      if (nameInvalid) setNameInvalid(false);
                    }}
                    onAnimationEnd={() => setShake(false)}
                    aria-invalid={nameInvalid}
                    aria-describedby={nameInvalid ? nameErrorId : undefined}
                    data-testid="media-picker-name"
                    data-invalid={nameInvalid ? "true" : "false"}
                    placeholder="np. Regulamin SUN CUP U8"
                    className={[
                      "w-full rounded-2xl border px-3 py-2.5 text-sm outline-none",
                      "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                      shake ? "field-shake" : "",
                      nameInvalid
                        ? "border-rose-500 ring-2 ring-rose-500/25"
                        : "border-slate-300 focus:border-slate-900",
                    ].join(" ")}
                  />
                </label>

                {/*
                  Komunikat wyłącznie dla czytnika ekranu. Widoczny blok pod
                  polem rozpychałby okno dokładnie w chwili, w której trzeba
                  trafić w „Zapisz".
                */}
                <p
                  id={nameErrorId}
                  role="alert"
                  data-testid="media-picker-name-error"
                  className="sr-only"
                >
                  {nameInvalid ? "Podaj nazwę." : ""}
                </p>

                <input
                  ref={fileRef}
                  type="file"
                  accept={definition.accept}
                  className="hidden"
                  onChange={(event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0] ?? null;

                    if (file) setPendingFile(file);
                    // Ten sam plik da się wybrać ponownie po pomyłce.
                    input.value = "";
                  }}
                />

                {/*
                  Wiersz ma stałą wysokość: nazwa wybranego pliku wchodzi
                  w gotowe miejsce, więc przyciski nie uciekają w dół.
                */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={isSaving}
                    data-testid="media-picker-upload"
                    className="btn btn-quiet shrink-0"
                  >
                    Wybierz plik
                  </button>

                  <p
                    data-testid="media-picker-file"
                    className={[
                      "min-w-0 flex-1 truncate text-sm",
                      pendingFile
                        ? "font-semibold text-slate-800"
                        : "text-slate-400",
                    ].join(" ")}
                  >
                    {pendingFile ? pendingFile.name : "Nie wybrano pliku"}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(true);
                  setSelectedUrl(null);
                }}
                data-testid="media-picker-add"
                className="btn btn-quiet w-full justify-center"
              >
                <Plus size={16} />
                {definition.addNewLabel}
              </button>
            )}
          </div>

          {/*
            STOPKA OD LEWEJ: najpierw zatwierdzenie, potem porzucenie.
            To okno EDYCYJNE, więc „Anuluj" ma tu realną robotę — istnieje
            niezapisany wybór, który trzeba móc odrzucić.

            Komunikat o błędzie dzieli wiersz z przyciskami. Wysokość wiersza
            wyznaczają przyciski, więc pojawienie się tekstu niczego nie rusza.
          */}
          <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || isSaving}
              data-testid="media-picker-save"
              className="btn btn-primary h-11 min-w-[8rem] shrink-0 justify-center"
            >
              {isSaving ? "Zapisywanie…" : "Zapisz"}
            </button>

            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              data-testid="media-picker-cancel"
              className="btn btn-quiet h-11 shrink-0 justify-center"
            >
              Anuluj
            </button>

            <p
              role="status"
              data-testid="media-picker-error"
              className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-rose-700"
            >
              {status}
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
