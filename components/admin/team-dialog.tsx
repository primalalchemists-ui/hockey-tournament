"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Upload, X } from "lucide-react";

import { ModalPortal } from "@/components/ui/modal-portal";
import { createSuggestionController } from "@/lib/logos/suggestion-controller";
import {
  listTeamLogosAction,
  proposeLogoNameAction,
  suggestTeamLogosAction,
  uploadTeamLogoAction,
  type LogoOption,
} from "@/app/admin/logo-actions";

export type TeamDraft = {
  name: string;
  logoUrl: string;
  logoAssetSlug: string;
};

type TeamDialogProps = {
  /** Komponent montowany jest dopiero przy otwarciu — patrz TeamManager. */
  initial: TeamDraft;
  mode: "edit" | "create";
  onCancel: () => void;
  onSave: (value: TeamDraft) => void;
};

/**
 * DIALOG DRUŻYNY — jedyne miejsce edycji nazwy i herbu.
 *
 * Herb pochodzi z globalnej biblioteki: ten sam plik obsługuje wszystkie
 * turnieje. Panel nigdy nie widzi UUID-a, public_id ani hasha — wyłącznie
 * nazwę i miniaturę.
 */
export function TeamDialog({ initial, mode, onCancel, onSave }: TeamDialogProps) {
  const [name, setName] = useState(initial.name);
  const [logo, setLogo] = useState<LogoOption | null>(
    initial.logoAssetSlug && initial.logoUrl
      ? {
          slug: initial.logoAssetSlug,
          name: initial.name,
          url: initial.logoUrl,
          thumbnailUrl: initial.logoUrl,
        }
      : null
  );
  /** Herb bez wpisu w bibliotece — historyczny upload sprzed migracji. */
  const [legacyUrl, setLegacyUrl] = useState(
    initial.logoAssetSlug ? "" : initial.logoUrl
  );

  const [view, setView] = useState<"team" | "library">("team");
  const [suggestions, setSuggestions] = useState<LogoOption[]>([]);
  const [isSuggested, setIsSuggested] = useState(false);

  const suggestions_controller = useRef(
    createSuggestionController<Awaited<ReturnType<typeof suggestTeamLogosAction>>>()
  );

  const logoRef = useRef(logo);
  const legacyRef = useRef(legacyUrl);

  useEffect(() => {
    logoRef.current = logo;
    legacyRef.current = legacyUrl;
  }, [logo, legacyUrl]);

  /*
    Podpowiedzi z biblioteki dla wpisywanej nazwy.

    Automatyczne zaznaczenie następuje WYŁĄCZNIE przy trafieniu pewnym:
    dokładna nazwa, znany alias albo jednoznaczna nazwa bazowa po
    odcięciu rozpoznanej końcówki „… 1 / … 2". Nic nie podmieniamy pod
    ręką administratora i nic nie kasujemy już wybranego herbu.
  */
  useEffect(() => {
    const trimmed = name.trim();

    // Pusta nazwa nie odpytuje serwera; listę zerujemy przy renderze.
    if (!trimmed) return;

    const timer = window.setTimeout(async () => {
      // Bilet numeruje żądanie; spóźniona odpowiedź zostanie odrzucona.
      const accept = suggestions_controller.current.begin(trimmed);
      const result = await suggestTeamLogosAction(trimmed);

      if (!accept(result)) return;

      setSuggestions(result.suggestions);

      /*
        Zaznaczamy automatycznie tylko trafienia PEWNE (exact / alias /
        jednoznaczna nazwa bazowa) i tylko wtedy, gdy nic jeszcze nie jest
        wybrane. Dopisanie „ 1" do rozpoznanej nazwy nie kasuje herbu —
        nic tutaj nie czyści już dokonanego wyboru.
      */
      if (result.autoSelect && !logoRef.current && !legacyRef.current) {
        setLogo(result.autoSelect);
        setIsSuggested(true);
      }
    }, 250);

    return () => window.clearTimeout(timer);
    // Podpowiedź reaguje na NAZWĘ; aktualny wybór czytamy przez ref.
  }, [name]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const previewUrl = logo?.url || legacyUrl;
  /** Podpowiedzi dotyczą aktualnej nazwy — pusta nazwa nie ma propozycji. */
  const visibleSuggestions = name.trim() ? suggestions : [];

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    onSave({
      name: trimmed,
      logoUrl: logo?.url ?? legacyUrl,
      logoAssetSlug: logo?.slug ?? "",
    });
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Nowa drużyna" : "Edytuj drużynę"}
        data-testid="team-dialog"
        className="dialog-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
      >
      <button
        type="button"
        aria-label="Zamknij"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      <div className="ice-scroll dialog-card relative z-10 flex max-h-[88dvh] w-full flex-col overflow-y-auto overscroll-contain rounded-3xl bg-white p-4 shadow-2xl sm:w-[34rem] sm:p-6">
        {view === "team" ? (
          <TeamView
            mode={mode}
            name={name}
            onNameChange={setName}
            previewUrl={previewUrl}
            logo={logo}
            isSuggested={isSuggested}
            onChangeLogo={() => setView("library")}
            onClearLogo={() => {
              setLogo(null);
              setLegacyUrl("");
              setIsSuggested(false);
            }}
            onCancel={onCancel}
            onSave={handleSave}
          />
        ) : (
          <LibraryView
            teamName={name}
            suggestions={visibleSuggestions}
            onBack={() => setView("team")}
            onPick={(picked) => {
              setLogo(picked);
              setLegacyUrl("");
              setIsSuggested(false);
              setView("team");
            }}
          />
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

/* ==========================================================================
 * WIDOK DRUŻYNY
 * ======================================================================== */

function TeamView({
  mode,
  name,
  onNameChange,
  previewUrl,
  logo,
  isSuggested,
  onChangeLogo,
  onClearLogo,
  onCancel,
  onSave,
}: {
  mode: "edit" | "create";
  name: string;
  onNameChange: (value: string) => void;
  previewUrl: string;
  logo: LogoOption | null;
  isSuggested: boolean;
  onChangeLogo: () => void;
  onClearLogo: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">
          {mode === "create" ? "Nowa drużyna" : "Edytuj drużynę"}
        </h2>

        {/* Standard okien: zamknięcie to ikona w prawym górnym rogu. */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Zamknij"
          data-testid="dialog-close"
          className="dialog-close inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={18} />
        </button>
      </div>

      <label className="block space-y-1">
        <span className="section-eyebrow">Nazwa drużyny</span>
        <input
          value={name}
          autoFocus
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="np. GKS Katowice 2"
          className="w-full rounded-2xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
        />
      </label>

      <div className="mt-5 space-y-2">
        <span className="section-eyebrow">Logo</span>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-[10px] font-semibold text-slate-400">
                BRAK
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {logo?.name ?? (previewUrl ? "Logo spoza biblioteki" : "Brak logo")}
            </p>

            {isSuggested && logo ? (
              <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Polecane
              </span>
            ) : null}
          </div>

          {previewUrl ? (
            <button
              type="button"
              onClick={onClearLogo}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
              title="Usuń logo"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <button type="button" onClick={onChangeLogo} className="btn btn-quiet w-full">
          {previewUrl ? "Zmień logo" : "Wybierz logo"}
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!name.trim()}
          className="btn btn-primary flex-1"
        >
          Zapisz
        </button>

        <button type="button" onClick={onCancel} className="btn btn-quiet">
          Anuluj
        </button>
      </div>
    </>
  );
}

/* ==========================================================================
 * WIDOK BIBLIOTEKI
 * ======================================================================== */

function LibraryView({
  teamName,
  suggestions,
  onBack,
  onPick,
}: {
  teamName: string;
  suggestions: LogoOption[];
  onBack: () => void;
  onPick: (logo: LogoOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<LogoOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadName, setUploadName] = useState("");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "reused" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      const result = await listTeamLogosAction(query);
      if (!cancelled) {
        setLibrary(result);
        setIsLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!teamName.trim()) return;

    // Nazwa nowego logo domyślnie bez końcówki wariantu ("… 2").
    proposeLogoNameAction(teamName).then(setUploadName);
  }, [teamName]);

  const suggestedSlugs = useMemo(
    () => new Set(suggestions.map((item) => item.slug)),
    [suggestions]
  );

  const rest = library.filter((item) => !suggestedSlugs.has(item.slug));

  async function handleUpload(file: File) {
    setUploadState("uploading");
    setUploadError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("canonicalName", uploadName.trim() || teamName.trim());

    const result = await uploadTeamLogoAction(
      { error: null, logo: null, reusedExisting: false },
      formData
    );

    if (result.error || !result.logo) {
      setUploadState("error");
      setUploadError(result.error ?? "Nie udało się wgrać logo.");
      return;
    }

    if (result.reusedExisting) {
      // Świadomy komunikat: nie powstała druga kopia pliku.
      setUploadState("reused");
      window.setTimeout(() => onPick(result.logo!), 900);
      return;
    }

    setUploadState("idle");
    onPick(result.logo);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">Wybierz logo</h2>

        <button type="button" onClick={onBack} className="btn btn-quiet px-4 text-xs">
          Wróć
        </button>
      </div>

      <label className="relative block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szukaj logo"
          className="w-full rounded-2xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-900"
        />
      </label>

      {suggestions.length > 0 ? (
        <section className="mt-4">
          <h3 className="section-eyebrow">Polecane</h3>
          <LogoGrid items={suggestions} onPick={onPick} />
        </section>
      ) : null}

      <section className="mt-4">
        <h3 className="section-eyebrow">Biblioteka</h3>

        {isLoading ? (
          <p className="mt-2 text-sm text-slate-500">Wczytywanie…</p>
        ) : rest.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Brak pasujących logotypów.</p>
        ) : (
          <LogoGrid items={rest} onPick={onPick} />
        )}
      </section>

      <section className="mt-6 space-y-2 border-t border-slate-200 pt-4">
        <h3 className="section-eyebrow">Wgraj nowe logo</h3>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500">Nazwa logo</span>
          <input
            value={uploadName}
            onChange={(event) => setUploadName(event.target.value)}
            placeholder="np. MMKS Podhale Nowy Targ"
            className="w-full rounded-2xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
          />
        </label>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;

            try {
              await handleUpload(file);
            } finally {
              input.value = "";
            }
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploadState === "uploading" || !uploadName.trim()}
          className="btn btn-quiet w-full"
        >
          <Upload size={16} />
          {uploadState === "uploading" ? "Wysyłanie…" : "Wgraj nowe logo"}
        </button>

        {uploadState === "reused" ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            To logo jest już w bibliotece — zaznaczam istniejące.
          </p>
        ) : null}

        {uploadError ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {uploadError}
          </p>
        ) : null}
      </section>
    </>
  );
}

function LogoGrid({
  items,
  onPick,
}: {
  items: LogoOption[];
  onPick: (logo: LogoOption) => void;
}) {
  return (
    <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.slug}>
          <button
            type="button"
            onClick={() => onPick(item)}
            data-testid="logo-option"
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-2 text-left transition hover:border-slate-400 hover:bg-slate-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={item.thumbnailUrl} alt="" className="h-full w-full object-contain" />
            </span>

            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
              {item.name}
            </span>

            <Check size={16} className="shrink-0 text-slate-300" />
          </button>
        </li>
      ))}
    </ul>
  );
}
