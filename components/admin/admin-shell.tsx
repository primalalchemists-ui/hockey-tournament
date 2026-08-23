"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  logoutAdminAction,
  saveAdminDraftAction,
  saveGroupResultsAction,
} from "@/app/admin/actions";
import { CampBanner } from "@/components/camp-banner";
import { MediaPreview } from "@/components/ui/media-preview";
import { CategorySwitcherSettings } from "@/components/admin/category-switcher-settings";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MediaAssetPicker } from "@/components/admin/media-asset-picker";
import type { MediaAsset } from "@/lib/data/types";
import type { MediaCategory } from "@/lib/media/categories";
import { ColorPicker } from "@/components/admin/color-picker";
import { CountdownPinPreview } from "@/components/admin/color-previews";
import {
  CAMP_DEFAULT_TITLE,
  CAMP_URL_ERROR,
  isValidRegistrationUrl,
} from "@/lib/public/camp";
import { EditableGroupTabs } from "@/components/admin/editable-group-tabs";
import { ScorersManager } from "@/components/admin/scorers-manager";
import { EditableTournamentHeader } from "@/components/admin/editable-tournament-header";
import { RegulationSection } from "@/components/regulation-section";
import { ScheduleSection } from "@/components/schedule-section";
import { TournamentSelector } from "@/components/admin/tournament-selector";
import {
  TournamentSettingsPanel,
  describeSettings,
} from "@/components/admin/tournament-settings-panel";
import { PlayoffPanel } from "@/components/admin/playoff-panel";
import { PlayoffAssetManager } from "@/components/admin/playoff-asset-manager";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import type { CollectionMember } from "@/lib/data/postgres/collections";
import type { TournamentSummary } from "@/lib/data/types";
import type { TournamentSettings } from "@/types/tournament-config";
import type { Tournament } from "@/types/tournament";

type MainTab =
  | "live"
  | "schedule"
  | "regulation"
  | "scorers"
  | "camp"
  | "categories"
  | "ticker";

type AdminShellProps = {
  tournament: Tournament;
  /** UUID edytowanego turnieju — jawnie przekazywany do każdego zapisu. */
  tournamentId: string;
  tournaments: TournamentSummary[];
  multiTournamentEnabled: boolean;
  settings: TournamentSettings;
  /** null dla turniejów ligowych — silnik pucharowy ich nie dotyczy. */
  playoffState: PlayoffStateView | null;
  /** Kategorie tego samego wydarzenia; puste = turniej samodzielny. */
  collectionMembers: CollectionMember[];
  /** Turnieje, które można jeszcze dołączyć do wydarzenia. */
  connectableTournaments: Array<{ id: string; title: string }>;
};

const mainTabs: Array<{ key: MainTab; label: string }> = [
  { key: "live", label: "Tabela" },
  { key: "scorers", label: "Strzelcy" },
  { key: "schedule", label: "Harmonogram" },
  { key: "regulation", label: "Regulamin" },
  { key: "camp", label: "Camp i bannery" },
  /*
    Kategorie to osobny system konfiguracji, nie dodatek do campu.
    Wcześniej mieszkały wewnątrz „Camp i bannery" i były nie do znalezienia.
  */
  { key: "categories", label: "Kategorie" },
  { key: "ticker", label: "Pasek info" },
];

const TICKER_SEPARATOR = " • ";

function cloneTournament(tournament: Tournament): Tournament {
  return JSON.parse(JSON.stringify(tournament)) as Tournament;
}

function normalizeScore(value: string) {
  const raw = value.trim();

  if (!raw) return null;
  if (!raw.includes(":")) return null;

  const [leftRaw, rightRaw] = raw.split(":").map((item) => item.trim());
  const leftScore = Number(leftRaw);
  const rightScore = Number(rightRaw);

  if (!Number.isFinite(leftScore) || !Number.isFinite(rightScore)) {
    return null;
  }

  return { leftScore, rightScore };
}

function createTeamId(groupKey: string) {
  return `${groupKey.toLowerCase()}-${Date.now()}`;
}

function createMatchId(
  groupKey: string,
  homeTeamId: string,
  awayTeamId: string,
) {
  return `${groupKey}-${homeTeamId}-${awayTeamId}`;
}

/**
 * PODPIS WYNIKÓW — do wykrywania, czy jest co zapisywać.
 *
 * Porównywanie całych obiektów meczów jest zawodne: kolejność w tablicy
 * bywa inna po każdym wczytaniu, a ta sama para może być zapisana raz jako
 * A–B, raz jako B–A. Podpis sprowadza wynik do postaci niezależnej od
 * jednego i drugiego, więc „bez zmian" naprawdę znaczy bez zmian, a nie
 * „przetasowało się w tablicy".
 */
function resultsSignature(tournament: Tournament): string {
  const entries = tournament.groups.flatMap((group) =>
    group.matches
      .filter(
        (match) =>
          typeof match.homeScore === "number" &&
          typeof match.awayScore === "number"
      )
      .map((match) => {
        const [first, second] = [match.homeTeamId, match.awayTeamId].sort();
        const flipped = first !== match.homeTeamId;

        const firstScore = flipped ? match.awayScore : match.homeScore;
        const secondScore = flipped ? match.homeScore : match.awayScore;

        return `${group.key}|${first}|${second}|${firstScore}:${secondScore}`;
      })
  );

  return entries.sort().join("|#|");
}

function createScorerId() {
  return `scorer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ==========================================================================
 * POLA MEDIÓW
 * ======================================================================== */

/**
 * Wszystkie pola panelu, w których ustawia się plik.
 *
 * Jedna tabela zamiast sześciu wariantów kodu: każde pole mówi, jaką ma
 * kategorię (czyli co wolno w nie wstawić), skąd czytać obecny plik i jak
 * zapisać wybrany. Picker jest wspólny i nic o polach nie wie.
 */
type MediaFieldKey =
  | "schedule"
  | "regulation"
  | "hero_banner"
  | "camp_banner"
  | "camp_poster_left"
  | "camp_poster_right";

type AssetsDraft = Tournament["assets"];

const MEDIA_FIELDS: Record<
  MediaFieldKey,
  {
    title: string;
    category: MediaCategory;
    current: (assets: AssetsDraft) => string;
    assign: (assets: AssetsDraft, asset: MediaAsset) => void;
  }
> = {
  schedule: {
    title: "Harmonogram",
    category: "schedule",
    current: (assets) => assets.scheduleImage ?? "",
    assign: (assets, asset) => {
      assets.scheduleImage = asset.url;
      assets.scheduleImageName = asset.fileName;
      assets.scheduleImageType = asset.mimeType;
      assets.scheduleImagePublicId = asset.publicId;
    },
  },
  regulation: {
    title: "Regulamin",
    category: "regulation",
    current: (assets) => assets.regulationImage ?? "",
    assign: (assets, asset) => {
      assets.regulationImage = asset.url;
      assets.regulationImageName = asset.fileName;
      assets.regulationImageType = asset.mimeType;
      assets.regulationImagePublicId = asset.publicId;
    },
  },
  hero_banner: {
    title: "Banner turnieju",
    category: "hero_banner",
    current: (assets) => assets.heroBannerImage ?? "",
    assign: (assets, asset) => {
      assets.heroBannerImage = asset.url;
      assets.heroBannerImageName = asset.fileName;
      assets.heroBannerImageType = asset.mimeType;
      assets.heroBannerImagePublicId = asset.publicId;
    },
  },
  camp_banner: {
    title: "Banner campa",
    category: "camp_banner",
    current: (assets) => assets.campBannerImage ?? "",
    assign: (assets, asset) => {
      assets.campBannerImage = asset.url;
      assets.campBannerImageName = asset.fileName;
      assets.campBannerImageType = asset.mimeType;
      assets.campBannerImagePublicId = asset.publicId;
    },
  },
  camp_poster_left: {
    title: "Lewy plakat",
    category: "camp_poster",
    current: (assets) => assets.campPosterLeft ?? "",
    assign: (assets, asset) => {
      assets.campPosterLeft = asset.url;
      assets.campPosterLeftName = asset.fileName;
      assets.campPosterLeftType = asset.mimeType;
      assets.campPosterLeftPublicId = asset.publicId;
    },
  },
  camp_poster_right: {
    title: "Prawy plakat",
    category: "camp_poster",
    current: (assets) => assets.campPosterRight ?? "",
    assign: (assets, asset) => {
      assets.campPosterRight = asset.url;
      assets.campPosterRightName = asset.fileName;
      assets.campPosterRightType = asset.mimeType;
      assets.campPosterRightPublicId = asset.publicId;
    },
  },
};

export function AdminShell({
  tournament,
  tournamentId,
  tournaments,
  multiTournamentEnabled,
  settings,
  playoffState,
  collectionMembers,
  connectableTournaments,
}: AdminShellProps) {
  const [draft, setDraft] = useState<Tournament>(() =>
    cloneTournament(tournament),
  );
  const [activeTab, setActiveTab] = useState<MainTab>("live");

  /*
    Turniej bez klasyfikacji strzelców nie pokazuje ich edytora.
    Kod pozostaje nietknięty — Rabbit Cup z niego korzysta.
  */
  const visibleTabs = mainTabs.filter(
    (tab) => tab.key !== "scorers" || settings.scorersEnabled,
  );

  const effectiveTab: MainTab =
    activeTab === "scorers" && !settings.scorersEnabled ? "live" : activeTab;
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [clearOpen, setClearOpen] = useState(false);

  /*
    ZAPIS WYNIKÓW MA WŁASNY STAN.

    Dzieli go z górnym przyciskiem tylko tyle, że oba zapisują. Powód
    niepowodzenia trzymamy jako tekst, bo ma trafić na ekran przy tabeli —
    samo słowo „Błąd" nie mówi, czy zerwało sieć, wygasła sesja, czy faza
    grupowa jest zamrożona.
  */
  const [resultsSave, setResultsSave] = useState<{
    status: "idle" | "saving" | "saved" | "error";
    message: string | null;
  }>({ status: "idle", message: null });

  /*
    Podpis wyników w postaci, w jakiej są w bazie. Wszystko, co się od niego
    różni, czeka na zapis; wszystko, co się zgadza, jest już zapisane.
    Po udanym zapisie podpis się przesuwa i przycisk znów gaśnie.
  */
  const [savedResults, setSavedResults] = useState(() =>
    resultsSignature(tournament)
  );

  /*
    WYBÓR PLIKU — jedno okno na wszystkie pola.

    Każde pole otwiera ten sam picker; różni je wyłącznie kategoria,
    aktualny plik i miejsce, w które trafia wynik.
  */
  /** Które pole media ma otwarty wybór pliku. */
  const [mediaField, setMediaField] = useState<MediaFieldKey | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [deletePublicIds, setDeletePublicIds] = useState<string[]>([]);
  const [separatorCopied, setSeparatorCopied] = useState(false);

  useEffect(() => {
    if (saveStatus !== "saved") return;

    const timeout = window.setTimeout(() => {
      setSaveStatus("idle");
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

  useEffect(() => {
    if (!separatorCopied) return;

    const timeout = window.setTimeout(() => {
      setSeparatorCopied(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [separatorCopied]);

  function queueDelete(publicId?: string) {
    if (!publicId) return;

    setDeletePublicIds((prev) => {
      if (prev.includes(publicId)) return prev;
      return [...prev, publicId];
    });
  }

  function updateDraft(updater: (prev: Tournament) => Tournament) {
    setDraft((prev) => updater(cloneTournament(prev)));
    setSaveStatus("idle");

    /*
      Komunikat o BŁĘDZIE zostaje na ekranie aż do kolejnej próby zapisu.
      Wcześniej gasł przy pierwszym dotknięciu pola, więc ostrzeżenie
      „nic się nie zapisało" znikało dokładnie wtedy, gdy człowiek wracał
      do wpisywania — i o niczym się nie dowiadywał.
    */
    setResultsSave((prev) =>
      prev.status === "saved" ? { status: "idle", message: null } : prev
    );
  }

  async function uploadFileToCloudinary(file: File) {
    setUploadStatus("uploading");

    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    const json = await response.json();

    if (!response.ok) {
      setUploadStatus("error");
      throw new Error(json.error || "Upload failed");
    }

    setUploadStatus("idle");

    return json as {
      url: string;
      name: string;
      type: string;
      format?: string;
      publicId?: string;
    };
  }

  async function handleCopySeparator() {
    try {
      await navigator.clipboard.writeText(TICKER_SEPARATOR);
      setSeparatorCopied(true);
    } catch (error) {
      console.error(error);
      setSeparatorCopied(false);
    }
  }

  function handleChangeTitle(value: string) {
    updateDraft((prev) => {
      prev.title = value;
      return prev;
    });
  }

  function handleChangeTickerMessage(value: string) {
    updateDraft((prev) => {
      prev.tickerMessage = value;
      return prev;
    });
  }

  function handleToggleShowTopScorerTicker(value: boolean) {
    updateDraft((prev) => {
      prev.showTopScorerTicker = value;
      return prev;
    });
  }

  function handleAddGroup() {
    updateDraft((prev) => {
      // Przy jednej wspólnej tabeli nie ma czego dodawać — pula już istnieje.
      if (settings.structure === "single") return prev;

      const nextIndex = prev.groups.length + 1;
      const key = String.fromCharCode(64 + nextIndex);

      prev.groups.push({
        key,
        name: `Grupa ${key}`,
        teams: [],
        matches: [],
      });

      return prev;
    });
  }

  function handleRemoveGroup(groupKey: string) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);

      if (group) {
        /*
          Herby NIE są kasowane razem z grupą: należą do wspólnej
          biblioteki i mogą być używane przez inne drużyny i turnieje.
        */
        prev.scorers = prev.scorers.filter(
          (scorer) => !group.teams.some((team) => team.id === scorer.teamId),
        );
      }

      prev.groups = prev.groups.filter((group) => group.key !== groupKey);
      return prev;
    });
  }

  function handleCreateTeam(
    groupKey: string,
    draft: { name: string; logoUrl: string; logoAssetSlug: string },
  ) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      if (!group) return prev;

      const teamId = createTeamId(groupKey);
      const nextIndex = group.teams.length + 1;

      group.teams.push({
        id: teamId,
        name: draft.name,
        shortName: draft.name,
        logoText: "LOGO",
        logoUrl: draft.logoUrl,
        logoName: "",
        logoType: "",
        // Wybór z biblioteki — warstwa danych podmieni URL i public_id
        // na te z assetu, więc nie duplikujemy pliku.
        logoAssetSlug: draft.logoAssetSlug || undefined,
        sourceOrder: nextIndex,
      });

      return prev;
    });
  }

  function handleSaveTeam(
    groupKey: string,
    teamId: string,
    draft: { name: string; logoUrl: string; logoAssetSlug: string },
  ) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      const team = group?.teams.find((item) => item.id === teamId);
      if (!team) return prev;

      team.name = draft.name;
      team.shortName = draft.name;
      team.logoUrl = draft.logoUrl;
      team.logoAssetSlug = draft.logoAssetSlug || undefined;

      /*
        ŚWIADOMIE nie kolejkujemy tu usunięcia starego pliku z Cloudinary.
        Logo należy do współdzielonej biblioteki — ten sam herb może być
        używany przez inną drużynę i inny turniej.
      */
      return prev;
    });
  }

  function handleRemoveTeam(groupKey: string, teamId: string) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      if (!group) return prev;

      // Usunięcie drużyny nie kasuje herbu — patrz komentarz wyżej.
      group.teams = group.teams.filter((team) => team.id !== teamId);
      group.matches = group.matches.filter(
        (match) => match.homeTeamId !== teamId && match.awayTeamId !== teamId,
      );
      prev.scorers = prev.scorers.filter((scorer) => scorer.teamId !== teamId);

      return prev;
    });
  }

  async function handleUploadSchedule(file: File, displayName: string) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.scheduleImagePublicId);

      prev.assets.scheduleImage = uploaded.url;
      prev.assets.scheduleImageName = displayName || uploaded.name;
      prev.assets.scheduleImageType =
        file.type === "application/pdf"
          ? "application/pdf"
          : file.type || "image/*";
      prev.assets.scheduleImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadRegulation(file: File, displayName: string) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.regulationImagePublicId);

      prev.assets.regulationImage = uploaded.url;
      prev.assets.regulationImageName = displayName || uploaded.name;
      prev.assets.regulationImageType =
        file.type === "application/pdf"
          ? "application/pdf"
          : file.type || "image/*";
      prev.assets.regulationImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadHeroBanner(file: File, displayName: string) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.heroBannerImagePublicId);

      prev.assets.heroBannerImage = uploaded.url;
      prev.assets.heroBannerImageName = displayName || uploaded.name;
      prev.assets.heroBannerImageType = file.type || "image/*";
      prev.assets.heroBannerImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  /**
   * Przypisuje plik WYBRANY Z BIBLIOTEKI.
   *
   * Świadomie nie kolejkujemy tu usunięcia poprzedniego pliku z Cloudinary:
   * przy wyborze z biblioteki poprzedni plik może być używany przez inny
   * turniej, a skasowanie go zepsułoby tamtą stronę.
   */
  /** Wgranie nowego pliku — istniejąca ścieżka uploadu każdego pola. */
  const MEDIA_UPLOADERS: Record<
    MediaFieldKey,
    (file: File, displayName: string) => Promise<void>
  > =
    {
      schedule: handleUploadSchedule,
      regulation: handleUploadRegulation,
      hero_banner: handleUploadHeroBanner,
      camp_banner: handleUploadCampBanner,
      camp_poster_left: handleUploadCampPosterLeft,
      camp_poster_right: handleUploadCampPosterRight,
    };

  function applyLibraryAsset(field: MediaFieldKey, asset: MediaAsset) {
    updateDraft((prev) => {
      const target = MEDIA_FIELDS[field].assign;
      target(prev.assets, asset);
      return prev;
    });

    setMediaField(null);
  }

  async function handleUploadCampBanner(file: File, displayName: string) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.campBannerImagePublicId);

      prev.assets.campBannerImage = uploaded.url;
      prev.assets.campBannerImageName = displayName || uploaded.name;
      prev.assets.campBannerImageType = file.type || "image/*";
      prev.assets.campBannerImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadCampPosterLeft(file: File, displayName: string) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.campPosterLeftPublicId);

      prev.assets.campPosterLeft = uploaded.url;
      prev.assets.campPosterLeftName = displayName || uploaded.name;
      prev.assets.campPosterLeftType = file.type || "image/*";
      prev.assets.campPosterLeftPublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadCampPosterRight(file: File, displayName: string) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.campPosterRightPublicId);

      prev.assets.campPosterRight = uploaded.url;
      prev.assets.campPosterRightName = displayName || uploaded.name;
      prev.assets.campPosterRightType = file.type || "image/*";
      prev.assets.campPosterRightPublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  function handleRemoveScheduleFile() {
    updateDraft((prev) => {
      queueDelete(prev.assets.scheduleImagePublicId);

      prev.assets.scheduleImage = "";
      prev.assets.scheduleImageType = "";
      prev.assets.scheduleImageName = "";
      prev.assets.scheduleImagePublicId = "";
      return prev;
    });
  }

  function handleRemoveRegulationFile() {
    updateDraft((prev) => {
      queueDelete(prev.assets.regulationImagePublicId);

      prev.assets.regulationImage = "";
      prev.assets.regulationImageType = "";
      prev.assets.regulationImageName = "";
      prev.assets.regulationImagePublicId = "";
      return prev;
    });
  }

  function handleRemoveHeroBannerFile() {
    updateDraft((prev) => {
      queueDelete(prev.assets.heroBannerImagePublicId);

      prev.assets.heroBannerImage = "";
      prev.assets.heroBannerImageType = "";
      prev.assets.heroBannerImageName = "";
      prev.assets.heroBannerImagePublicId = "";
      return prev;
    });
  }

  function handleRemoveCampBannerFile() {
    updateDraft((prev) => {
      queueDelete(prev.assets.campBannerImagePublicId);

      prev.assets.campBannerImage = "";
      prev.assets.campBannerImageType = "";
      prev.assets.campBannerImageName = "";
      prev.assets.campBannerImagePublicId = "";
      return prev;
    });
  }

  function handleRemoveCampPosterLeftFile() {
    updateDraft((prev) => {
      queueDelete(prev.assets.campPosterLeftPublicId);

      prev.assets.campPosterLeft = "";
      prev.assets.campPosterLeftType = "";
      prev.assets.campPosterLeftName = "";
      prev.assets.campPosterLeftPublicId = "";
      return prev;
    });
  }

  function handleRemoveCampPosterRightFile() {
    updateDraft((prev) => {
      queueDelete(prev.assets.campPosterRightPublicId);

      prev.assets.campPosterRight = "";
      prev.assets.campPosterRightType = "";
      prev.assets.campPosterRightName = "";
      prev.assets.campPosterRightPublicId = "";
      return prev;
    });
  }

  /*
    Widoczność pola z adresem zależy od włącznika, a nie odwrotnie —
    dlatego stan czytamy w jednym miejscu.
  */
  const campRegistrationEnabled = draft.campRegistrationEnabled ?? true;
  const campUrlError =
    campRegistrationEnabled && !isValidRegistrationUrl(draft.campSignupLink);

  function handleChangeCampStartDate(value: string) {
    updateDraft((prev) => {
      prev.campStartDate = value;
      return prev;
    });
  }

  function handleChangeCampSignupLink(value: string) {
    updateDraft((prev) => {
      prev.campSignupLink = value;
      return prev;
    });
  }

  function handleChangeCampTitle(value: string) {
    updateDraft((prev) => {
      prev.campTitle = value;
      return prev;
    });
  }

  function handleChangeCountdownPinColor(value: string) {
    updateDraft((prev) => {
      prev.countdownPinColor = value;
      return prev;
    });
  }

  function handleToggleCampRegistration(value: boolean) {
    updateDraft((prev) => {
      /*
        Wyłączenie zapisów NIE kasuje adresu — administrator włącza je
        później jednym kliknięciem, bez wpisywania linku od nowa.
      */
      prev.campRegistrationEnabled = value;
      return prev;
    });
  }

  function handleAddScorer() {
    updateDraft((prev) => {
      const allTeams = prev.groups.flatMap((group) => group.teams);
      const firstTeamId = allTeams[0]?.id ?? "";

      prev.scorers.push({
        id: createScorerId(),
        playerName: "",
        jerseyNumber: undefined,
        goals: 0,
        teamId: firstTeamId,
      });

      return prev;
    });
  }

  function handleRemoveScorer(scorerId: string) {
    updateDraft((prev) => {
      prev.scorers = prev.scorers.filter((scorer) => scorer.id !== scorerId);
      return prev;
    });
  }

  function handleUpdateScorer(
    scorerId: string,
    field: "playerName" | "jerseyNumber" | "goals" | "teamId",
    value: string,
  ) {
    updateDraft((prev) => {
      const scorer = prev.scorers.find((item) => item.id === scorerId);
      if (!scorer) return prev;

      if (field === "playerName") {
        scorer.playerName = value;
      }

      if (field === "teamId") {
        scorer.teamId = value;
      }

      if (field === "jerseyNumber") {
        scorer.jerseyNumber = value.trim() === "" ? undefined : Number(value);
      }

      if (field === "goals") {
        scorer.goals =
          value.trim() === "" ? 0 : Math.max(0, Number(value) || 0);
      }

      return prev;
    });
  }

  function handleUpdateCell(
    groupKey: string,
    teamAId: string,
    teamBId: string,
    value: string,
  ) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      if (!group) return prev;

      const orderedIds = [teamAId, teamBId].sort();
      const canonicalHomeTeamId = orderedIds[0];
      const canonicalAwayTeamId = orderedIds[1];

      const existingMatch = group.matches.find(
        (match) =>
          (match.homeTeamId === canonicalHomeTeamId &&
            match.awayTeamId === canonicalAwayTeamId) ||
          (match.homeTeamId === canonicalAwayTeamId &&
            match.awayTeamId === canonicalHomeTeamId),
      );

      const parsed = normalizeScore(value);

      if (!parsed) {
        if (existingMatch) {
          group.matches = group.matches.filter(
            (match) => match.id !== existingMatch.id,
          );
        }
        return prev;
      }

      const isSameOrientation =
        teamAId === canonicalHomeTeamId && teamBId === canonicalAwayTeamId;

      const homeScore = isSameOrientation
        ? parsed.leftScore
        : parsed.rightScore;
      const awayScore = isSameOrientation
        ? parsed.rightScore
        : parsed.leftScore;

      if (existingMatch) {
        existingMatch.homeTeamId = canonicalHomeTeamId;
        existingMatch.awayTeamId = canonicalAwayTeamId;
        existingMatch.homeScore = homeScore;
        existingMatch.awayScore = awayScore;
        return prev;
      }

      group.matches.push({
        id: createMatchId(groupKey, canonicalHomeTeamId, canonicalAwayTeamId),
        group: groupKey,
        homeTeamId: canonicalHomeTeamId,
        awayTeamId: canonicalAwayTeamId,
        homeScore,
        awayScore,
      });

      return prev;
    });
  }

  function handleClearAll() {
    /*
      Potwierdzenie należy do okna — patrz `clearOpen` i ConfirmDialog niżej.
      Wcześniej stało tu natywne `window.confirm`, które w przeglądarce
      wygląda jak alert systemowy i nie ma nic wspólnego z resztą panelu.
    */

    // Świadomie NIE kolejkujemy tu usunięcia plików z Cloudinary.
    // Wyczyszczenie draftu bywa pomyłką, a skasowanie assetów jest
    // nieodwracalne — logotypy i pliki zostają, można je podpiąć ponownie.

    setDraft({
      ...draft,
      title: "Nowy turniej",
      groups: [],
      scorers: [],
      campStartDate: "",
      campSignupLink: "",
      campTitle: "",
      campRegistrationEnabled: true,
      countdownPinColor: "",
      tickerMessage: "",
      showTopScorerTicker: true,
      assets: {
        scheduleImage: "",
        scheduleImageType: "",
        scheduleImageName: "",
        regulationImage: "",
        regulationImageType: "",
        regulationImageName: "",
        heroBannerImage: "",
        heroBannerImageType: "",
        heroBannerImageName: "",
        campBannerImage: "",
        campBannerImageType: "",
        campBannerImageName: "",
        campPosterLeft: "",
        campPosterLeftType: "",
        campPosterLeftName: "",
        campPosterRight: "",
        campPosterRightType: "",
        campPosterRightName: "",
      },
    });

    setSaveStatus("idle");
    setClearOpen(false);
  }

  /**
   * Zapis WYŁĄCZNIE wyników fazy grupowej.
   *
   * Wysyła płaską listę wyników zamiast całego turnieju, więc nie jest
   * w stanie skasować drużyny, grupy ani grafiki — a to właśnie te operacje
   * potrafiły zabrać wyniki kaskadą. Idą wyniki ze WSZYSTKICH grup, żeby
   * przełączanie zakładek nie miało znaczenia dla tego, co zostanie zapisane.
   */
  function handleSaveResults() {
    if (resultsLocked || !resultsDirty) return;

    const signature = resultsSignature(draft);
    setResultsSave({ status: "saving", message: null });

    startTransition(async () => {
      const results = draft.groups.flatMap((group) =>
        group.matches
          .filter(
            (match) =>
              typeof match.homeScore === "number" &&
              typeof match.awayScore === "number"
          )
          .map((match) => ({
            groupKey: group.key,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
          }))
      );

      try {
        const result = await saveGroupResultsAction(tournamentId, results);

        if (result.error) {
          setResultsSave({ status: "error", message: result.error });
          return;
        }

        // Dopiero potwierdzony zapis przesuwa punkt odniesienia.
        setSavedResults(signature);
        setResultsSave({ status: "saved", message: null });
      } catch (error) {
        console.error(error);
        setResultsSave({
          status: "error",
          message: "Brak połączenia. Wyniki NIE zostały zapisane.",
        });
      }
    });
  }

  function handleSave() {
    setSaveStatus("saving");

    startTransition(async () => {
      try {
        const formData = new FormData();
        // Zapis zawsze wskazuje turniej jawnie — nigdy nie polega na tym,
        // który turniej storage uzna za "aktywny".
        formData.set("tournamentId", tournamentId);
        formData.set("payload", JSON.stringify(draft));
        formData.set("deletePublicIds", JSON.stringify(deletePublicIds));

        await saveAdminDraftAction(formData);

        setDeletePublicIds([]);
        // Górny przycisk zapisuje też wyniki, więc dolny nie ma już co wysyłać.
        setSavedResults(resultsSignature(draft));
        setSaveStatus("saved");
      } catch (error) {
        console.error(error);
        setSaveStatus("error");
      }
    });
  }

  /*
    BLOKADA WYNIKÓW = TA SAMA REGUŁA CO NA SERWERZE.

    `assertGroupResultsEditable` przepuszcza zapis wyłącznie w fazie grupowej.
    Powtarzamy ten warunek tutaj, żeby przycisk był wyłączony ZANIM ktoś
    wpisze partię wyników — a nie żeby serwer odmówił po fakcie.

    Turniej ligowy nie ma silnika pucharowego i nigdy nie opuszcza fazy
    grupowej, więc brak `playoffState` znaczy „edycja otwarta".
  */
  const resultsLocked = playoffState
    ? playoffState.phase !== "group_stage"
    : false;

  /*
    Aktywny przycisk ma znaczyć „jest co zapisać". Przycisk, który świeci
    zawsze, przestaje cokolwiek komunikować — a tutaj ma być sygnałem, że
    coś czeka w pamięci przeglądarki i jeszcze nie dotarło do bazy.

    Powrót do poprzedniej wartości też gasi przycisk, bo wtedy naprawdę
    nie ma czego wysyłać.
  */
  const resultsDirty = resultsSignature(draft) !== savedResults;

  const allTeams = draft.groups.flatMap((group) => group.teams);

  // Struktura jest zablokowana, gdy turniej ma już treść sportową.
  const hasSportingData =
    draft.groups.length > 1 ||
    draft.groups.some(
      (group) => group.teams.length > 0 || group.matches.length > 0,
    );

  const tickerPreview = useMemo(() => {
    const message = (draft.tickerMessage ?? "").trim();
    const hasScorer = draft.showTopScorerTicker !== false;

    if (message && hasScorer) {
      return `${message} 🏒 • 👑 KRÓL STRZELCÓW • PRZYKŁADOWY ZAWODNIK #15 • 6 GOLI • PRZYKŁADOWA DRUŻYNA 🔥`;
    }

    if (message) {
      return `${message} 🏒`;
    }

    if (hasScorer) {
      return "👑 KRÓL STRZELCÓW • PRZYKŁADOWY ZAWODNIK #15 • 6 GOLI • PRZYKŁADOWA DRUŻYNA 🔥";
    }

    return "Pasek będzie ukryty, bo nie ma komunikatu i król strzelców jest wyłączony.";
  }, [draft.tickerMessage, draft.showTopScorerTicker]);

  /*
    BEZ `useMemo`.

    Ta tablica zależności nigdy nie była prawdziwa: wnętrze czyta kilkadziesiąt
    wartości i funkcji, z których wymieniono osiem. Taki „memo" nie tyle
    przyspieszał, ile obiecywał świeżość, której nie dowoził — i przy każdym
    dołożeniu pola trzeba było zgadywać, czy trafia do listy.

    React Compiler memoizuje to drzewo sam, na podstawie faktycznych odczytów.
    Ręczna lista może mu w tym wyłącznie przeszkodzić, co właśnie robiła.
  */
  const content = ((): React.ReactNode => {
    if (effectiveTab === "schedule") {
      return (
        <section className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMediaField("schedule")}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Pencil size={16} />
              Zmień harmonogram
            </button>

            <button
              type="button"
              onClick={handleRemoveScheduleFile}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
            >
              <Trash2 size={16} />
              Usuń
            </button>
          </div>

          <ScheduleSection
            fileUrl={draft.assets.scheduleImage}
            fileType={draft.assets.scheduleImageType}
            fileName={draft.assets.scheduleImageName}
          />
        </section>
      );
    }

    if (effectiveTab === "regulation") {
      return (
        <section className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMediaField("regulation")}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Pencil size={16} />
              Zmień regulamin
            </button>

            <button
              type="button"
              onClick={handleRemoveRegulationFile}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
            >
              <Trash2 size={16} />
              Usuń
            </button>
          </div>

          <RegulationSection
            fileUrl={draft.assets.regulationImage}
            fileType={draft.assets.regulationImageType}
            fileName={draft.assets.regulationImageName}
          />
        </section>
      );
    }

    if (effectiveTab === "camp") {
      return (
        <section className="space-y-6">
          <section className="space-y-4 ice-surface flush-card sm:rounded-3xl p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Banner główny
              </h2>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMediaField("hero_banner")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Pencil size={16} />
                  Zmień banner
                </button>

                <button
                  type="button"
                  onClick={handleRemoveHeroBannerFile}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                >
                  <Trash2 size={16} />
                  Usuń
                </button>
              </div>
            </div>

            <MediaPreview
              src={draft.assets.heroBannerImage}
              alt="Banner główny"
              emptyLabel="Brak bannera głównego"
              ratio="16/7"
            />
          </section>

          <section className="space-y-4 ice-surface flush-card p-4 shadow-sm sm:rounded-3xl sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Ustawienia campu
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="camp-title"
                  className="text-sm font-semibold text-slate-700"
                >
                  Nagłówek sekcji
                </label>
                <input
                  id="camp-title"
                  type="text"
                  value={draft.campTitle ?? ""}
                  onChange={(event) =>
                    handleChangeCampTitle(event.target.value)
                  }
                  placeholder={CAMP_DEFAULT_TITLE}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Data startu campa
                </label>
                <input
                  type="datetime-local"
                  value={draft.campStartDate ?? ""}
                  onChange={(event) =>
                    handleChangeCampStartDate(event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                data-testid="camp-registration-toggle"
                checked={campRegistrationEnabled}
                onChange={(event) =>
                  handleToggleCampRegistration(event.target.checked)
                }
                className="h-5 w-5 rounded border-slate-300"
              />
              Zapisy na camp są aktywne
            </label>

            {campRegistrationEnabled ? (
              <div className="space-y-2">
                <label
                  htmlFor="camp-signup"
                  className="text-sm font-semibold text-slate-700"
                >
                  Link do zapisów
                </label>
                <input
                  id="camp-signup"
                  type="url"
                  value={draft.campSignupLink ?? ""}
                  onChange={(event) =>
                    handleChangeCampSignupLink(event.target.value)
                  }
                  placeholder="https://..."
                  aria-invalid={campUrlError ? "true" : undefined}
                  className={[
                    "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
                    campUrlError
                      ? "border-rose-300 focus:border-rose-500"
                      : "border-slate-300 focus:border-slate-900",
                  ].join(" ")}
                />
                {campUrlError ? (
                  <p
                    data-testid="camp-url-error"
                    className="text-xs font-medium text-rose-700"
                  >
                    {CAMP_URL_ERROR}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3 border-t border-[var(--surface-line)] pt-4">
              <p className="section-eyebrow">Kolor pinezek odliczania</p>

              <ColorPicker
                value={draft.countdownPinColor ?? ""}
                onChange={handleChangeCountdownPinColor}
                renderPreview={(color) => <CountdownPinPreview color={color} />}
              />
            </div>
          </section>

          <section className="space-y-4 ice-surface flush-card sm:rounded-3xl p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Banner campa
              </h2>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMediaField("camp_banner")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Pencil size={16} />
                  Zmień banner campa
                </button>

                <button
                  type="button"
                  onClick={handleRemoveCampBannerFile}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                >
                  <Trash2 size={16} />
                  Usuń
                </button>
              </div>
            </div>

            <MediaPreview
              src={draft.assets.campBannerImage}
              alt="Banner campa"
              emptyLabel="Brak bannera campa"
              ratio="16/6"
            />
          </section>

          <section className="space-y-4 ice-surface flush-card sm:rounded-3xl p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Plakaty campa
            </h2>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMediaField("camp_poster_left")}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <Pencil size={16} />
                    Zmień lewy plakat
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveCampPosterLeftFile}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                  >
                    <Trash2 size={16} />
                    Usuń
                  </button>
                </div>

                <MediaPreview
                  src={draft.assets.campPosterLeft}
                  alt="Lewy plakat"
                  emptyLabel="Brak lewego plakatu"
                  ratio="4/6"
                />
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMediaField("camp_poster_right")}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <Pencil size={16} />
                    Zmień prawy plakat
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveCampPosterRightFile}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                  >
                    <Trash2 size={16} />
                    Usuń
                  </button>
                </div>

                <MediaPreview
                  src={draft.assets.campPosterRight}
                  alt="Prawy plakat"
                  emptyLabel="Brak prawego plakatu"
                  ratio="4/6"
                />
              </div>
            </div>
          </section>

          {playoffState ? (
            <>
              <PlayoffAssetManager
                tournamentId={tournamentId}
                tournamentTitle={draft.title}
                kind="playoff_bracket_background"
                title="Tło drabinki play-off"
                currentUrl={playoffState.bracketBackgroundUrl}
              />
              <PlayoffAssetManager
                tournamentId={tournamentId}
                tournamentTitle={draft.title}
                kind="podium_background"
                title="Tło podium"
                currentUrl={playoffState.podiumBackgroundUrl}
              />
            </>
          ) : null}

          <section className="space-y-4 ice-surface flush-card sm:rounded-3xl p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Podgląd sekcji campa
            </h2>

            <CampBanner
              date={draft.campStartDate ?? ""}
              signupLink={draft.campSignupLink || ""}
              campTitle={draft.campTitle}
              registrationEnabled={draft.campRegistrationEnabled}
              countdownPinColor={draft.countdownPinColor}
              bannerImage={draft.assets.campBannerImage}
              leftPosterImage={draft.assets.campPosterLeft}
              rightPosterImage={draft.assets.campPosterRight}
            />
          </section>
        </section>
      );
    }

    if (effectiveTab === "categories") {
      /*
        Osobna zakładka: przełącznik kategorii jest niezależnym systemem
        konfiguracji, a nie dodatkiem do sekcji campu.
      */
      return (
        <CategorySwitcherSettings
          tournamentId={tournamentId}
          title={draft.title}
          members={collectionMembers}
          connectable={connectableTournaments}
        />
      );
    }

    if (effectiveTab === "ticker") {
      return (
        <section className="space-y-4 ice-surface flush-card sm:rounded-3xl p-4 shadow-sm sm:p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Pasek info</h2>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Separator</p>
              <p className="mt-1 text-sm text-slate-600">
                Użyj tego między fragmentami komunikatu:{" "}
                <span className="font-bold">{TICKER_SEPARATOR}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopySeparator}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              {separatorCopied ? <Check size={16} /> : <Copy size={16} />}
              {separatorCopied ? "Skopiowano" : "Kopiuj separator"}
            </button>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={draft.showTopScorerTicker ?? true}
              onChange={(event) =>
                handleToggleShowTopScorerTicker(event.target.checked)
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm font-semibold text-slate-800">
              Pokaż króla strzelców
            </span>
          </label>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">
              Treść komunikatu
            </label>
            <textarea
              value={draft.tickerMessage ?? ""}
              onChange={(event) =>
                handleChangeTickerMessage(event.target.value)
              }
              placeholder={`Np. Zapraszamy na finały o 17:30${TICKER_SEPARATOR}Wstęp wolny${TICKER_SEPARATOR}Partner wydarzenia: Festiwal Hokeja`}
              rows={5}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">
              Podgląd:
            </p>
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white overflow-x-auto whitespace-nowrap">
              {tickerPreview}
            </div>
          </div>
        </section>
      );
    }

    if (effectiveTab === "scorers") {
      return (
        <ScorersManager
          scorers={draft.scorers ?? []}
          teams={allTeams}
          onAddScorer={handleAddScorer}
          onRemoveScorer={handleRemoveScorer}
          onUpdateScorer={handleUpdateScorer}
        />
      );
    }

    return (
      <>
        {playoffState ? (
          <div className="mb-4">
            <PlayoffPanel tournamentId={tournamentId} state={playoffState} />
          </div>
        ) : null}

        <EditableGroupTabs
          structure={settings.structure}
          groups={draft.groups}
          onAddGroup={handleAddGroup}
          onRemoveGroup={handleRemoveGroup}
          onCreateTeam={handleCreateTeam}
          onRemoveTeam={handleRemoveTeam}
          onSaveTeam={handleSaveTeam}
          onUpdateCell={handleUpdateCell}
          onSaveResults={handleSaveResults}
          resultsSaveState={resultsSave}
          resultsLocked={resultsLocked}
          resultsDirty={resultsDirty}
        />
      </>
    );
  })();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/*
        DESKTOP: jedna linia — tożsamość i operacje przy lewej krawędzi,
        akcje zapisu przy prawej.
        TELEFON: kolumna w kolejności akcje → turniej → operacje → opis,
        wszystko wyrównane do lewej krawędzi, tak jak tytuł niżej.

        Rzędy selektora są na desktopie `display: contents`, więc wpadają
        do tej samej linii zamiast tworzyć własne wiersze.
      */}
      <header className="space-y-3 px-3 sm:px-0 lg:space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-4">
          <div className="space-y-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:items-center lg:gap-2 lg:space-y-0">
            <TournamentSelector
              tournaments={tournaments}
              selectedId={tournamentId}
              multiTournamentEnabled={multiTournamentEnabled}
              extraActions={
                multiTournamentEnabled ? (
                  <TournamentSettingsPanel
                    tournamentId={tournamentId}
                    title={draft.title}
                    settings={settings}
                    hasSportingData={hasSportingData}
                  />
                ) : null
              }
            />

            {multiTournamentEnabled ? (
              <div className="flex lg:contents">
                <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                  {describeSettings(settings)}
                </span>
              </div>
            ) : null}
          </div>

          {/* Na telefonie akcje idą na samą górę. */}
          <div className="order-first flex flex-col gap-2 lg:order-none lg:shrink-0 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                data-testid="admin-clear"
                className="btn btn-danger"
              >
                Wyczyść
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="btn btn-primary"
              >
                Zapisz
              </button>

              <form action={logoutAdminAction}>
                <button type="submit" className="btn btn-quiet">
                  Wyloguj
                </button>
              </form>
            </div>

            <div className="h-5 text-sm font-medium lg:text-right">
              {isPending ? (
                <span className="text-slate-600">Zapisywanie...</span>
              ) : uploadStatus === "uploading" ? (
                <span className="text-slate-600">Dodawanie...</span>
              ) : saveStatus === "saved" ? (
                <span className="text-emerald-700">Zapisano</span>
              ) : saveStatus === "error" || uploadStatus === "error" ? (
                <span className="text-rose-700">Błąd</span>
              ) : (
                <span className="invisible">Placeholder</span>
              )}
            </div>
          </div>
        </div>

        <EditableTournamentHeader
          title={draft.title}
          onChangeTitle={handleChangeTitle}
        />
      </header>

      <nav className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 ice-surface flush-card p-2 shadow-sm sm:rounded-3xl">
          {visibleTabs.map((tab) => {
            const isActive = tab.key === effectiveTab;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-2xl px-4 py-3 text-sm font-semibold whitespace-nowrap transition sm:px-5",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={effectiveTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>

      {/*
        WYCZYSZCZENIE FORMULARZA.

        Treść mówi dokładnie to, co robi kod: opróżnia FORMULARZ, a do bazy
        nic nie trafia, dopóki nie klikniesz „Zapisz". Świadomie nie obiecuję
        „operacji nieodwracalnej" ani „zachowania ustawień" — jedno i drugie
        byłoby nieprawdą wobec `handleClearAll`.
      */}
      {mediaField ? (
        <MediaAssetPicker
          open
          title={MEDIA_FIELDS[mediaField].title}
          category={MEDIA_FIELDS[mediaField].category}
          currentUrl={MEDIA_FIELDS[mediaField].current(draft.assets)}
          onCancel={() => setMediaField(null)}
          onSave={(asset) => applyLibraryAsset(mediaField, asset)}
          onUploadNew={(file, displayName) =>
            MEDIA_UPLOADERS[mediaField](file, displayName)
          }
        />
      ) : null}

      <ConfirmDialog
        open={clearOpen}
        tone="danger"
        icon="warning"
        title="Wyczyścić cały turniej?"
        confirmLabel="Wyczyść turniej"
        busyLabel="Wyczyszczanie…"
        onCancel={() => setClearOpen(false)}
        onConfirm={handleClearAll}
      >
        <p>
          Formularz zostanie opróżniony: znikną wszystkie grupy, drużyny, mecze
          i strzelcy, a także ustawienia campu, grafiki i nazwa turnieju.
        </p>
        <p className="font-medium text-slate-800">
          Zmiany trafią do bazy dopiero po kliknięciu „Zapisz”.
        </p>
        <p>Pliki wgrane do biblioteki grafik pozostaną nietknięte.</p>
      </ConfirmDialog>
    </div>
  );
}
