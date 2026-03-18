"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { logoutAdminAction, saveAdminDraftAction } from "@/app/admin/actions";
import { CampBanner } from "@/components/camp-banner";
import { EditableGroupTabs } from "@/components/admin/editable-group-tabs";
import { ScorersManager } from "@/components/admin/scorers-manager";
import { EditableTournamentHeader } from "@/components/admin/editable-tournament-header";
import { RegulationSection } from "@/components/regulation-section";
import { ScheduleSection } from "@/components/schedule-section";
import type { Tournament } from "@/types/tournament";

type MainTab =
  | "live"
  | "schedule"
  | "regulation"
  | "scorers"
  | "camp"
  | "ticker";

type AdminShellProps = {
  tournament: Tournament;
};

const mainTabs: Array<{ key: MainTab; label: string }> = [
  { key: "live", label: "Tabela" },
  { key: "scorers", label: "Strzelcy" },
  { key: "schedule", label: "Harmonogram" },
  { key: "regulation", label: "Regulamin" },
  { key: "camp", label: "Camp i bannery" },
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

function createMatchId(groupKey: string, homeTeamId: string, awayTeamId: string) {
  return `${groupKey}-${homeTeamId}-${awayTeamId}`;
}

function createScorerId() {
  return `scorer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function PreviewImage({
  src,
  alt,
  emptyLabel,
  className,
}: {
  src?: string;
  alt: string;
  emptyLabel: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={["overflow-hidden rounded-3xl border border-slate-200 bg-white", className].join(
        " "
      )}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </div>
  );
}

export function AdminShell({ tournament }: AdminShellProps) {
  const [draft, setDraft] = useState<Tournament>(() => cloneTournament(tournament));
  const [activeTab, setActiveTab] = useState<MainTab>("live");
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">(
    "idle"
  );
  const [deletePublicIds, setDeletePublicIds] = useState<string[]>([]);
  const [separatorCopied, setSeparatorCopied] = useState(false);

  const scheduleInputRef = useRef<HTMLInputElement | null>(null);
  const regulationInputRef = useRef<HTMLInputElement | null>(null);
  const heroBannerInputRef = useRef<HTMLInputElement | null>(null);
  const campBannerInputRef = useRef<HTMLInputElement | null>(null);
  const campPosterLeftInputRef = useRef<HTMLInputElement | null>(null);
  const campPosterRightInputRef = useRef<HTMLInputElement | null>(null);

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
        for (const team of group.teams) {
          queueDelete(team.logoPublicId);
        }

        prev.scorers = prev.scorers.filter((scorer) =>
          !group.teams.some((team) => team.id === scorer.teamId)
        );
      }

      prev.groups = prev.groups.filter((group) => group.key !== groupKey);
      return prev;
    });
  }

  function handleAddTeam(groupKey: string) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      if (!group) return prev;

      const teamId = createTeamId(groupKey);
      const nextIndex = group.teams.length + 1;

      group.teams.push({
        id: teamId,
        name: `Nowa drużyna ${nextIndex}`,
        shortName: `Team ${nextIndex}`,
        logoText: "LOGO",
        logoUrl: "",
        logoName: "",
        logoType: "",
        sourceOrder: nextIndex,
      });

      return prev;
    });
  }

  function handleRemoveTeam(groupKey: string, teamId: string) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      if (!group) return prev;

      const team = group.teams.find((item) => item.id === teamId);
      if (team) {
        queueDelete(team.logoPublicId);
      }

      group.teams = group.teams.filter((team) => team.id !== teamId);
      group.matches = group.matches.filter(
        (match) => match.homeTeamId !== teamId && match.awayTeamId !== teamId
      );
      prev.scorers = prev.scorers.filter((scorer) => scorer.teamId !== teamId);

      return prev;
    });
  }

  function handleUpdateTeamName(groupKey: string, teamId: string, value: string) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      const team = group?.teams.find((item) => item.id === teamId);
      if (!team) return prev;

      team.name = value;
      team.shortName = value;
      return prev;
    });
  }

  async function handleUploadTeamLogo(groupKey: string, teamId: string, file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      const team = group?.teams.find((item) => item.id === teamId);
      if (!team) return prev;

      queueDelete(team.logoPublicId);

      team.logoUrl = uploaded.url;
      team.logoName = uploaded.name;
      team.logoType = file.type || "image/*";
      team.logoPublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadSchedule(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.scheduleImagePublicId);

      prev.assets.scheduleImage = uploaded.url;
      prev.assets.scheduleImageName = uploaded.name;
      prev.assets.scheduleImageType =
        file.type === "application/pdf" ? "application/pdf" : file.type || "image/*";
      prev.assets.scheduleImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadRegulation(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.regulationImagePublicId);

      prev.assets.regulationImage = uploaded.url;
      prev.assets.regulationImageName = uploaded.name;
      prev.assets.regulationImageType =
        file.type === "application/pdf" ? "application/pdf" : file.type || "image/*";
      prev.assets.regulationImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadHeroBanner(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.heroBannerImagePublicId);

      prev.assets.heroBannerImage = uploaded.url;
      prev.assets.heroBannerImageName = uploaded.name;
      prev.assets.heroBannerImageType = file.type || "image/*";
      prev.assets.heroBannerImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadCampBanner(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.campBannerImagePublicId);

      prev.assets.campBannerImage = uploaded.url;
      prev.assets.campBannerImageName = uploaded.name;
      prev.assets.campBannerImageType = file.type || "image/*";
      prev.assets.campBannerImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadCampPosterLeft(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.campPosterLeftPublicId);

      prev.assets.campPosterLeft = uploaded.url;
      prev.assets.campPosterLeftName = uploaded.name;
      prev.assets.campPosterLeftType = file.type || "image/*";
      prev.assets.campPosterLeftPublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadCampPosterRight(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete(prev.assets.campPosterRightPublicId);

      prev.assets.campPosterRight = uploaded.url;
      prev.assets.campPosterRightName = uploaded.name;
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
    value: string
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
        scorer.goals = value.trim() === "" ? 0 : Math.max(0, Number(value) || 0);
      }

      return prev;
    });
  }

  function handleUpdateCell(
    groupKey: string,
    teamAId: string,
    teamBId: string,
    value: string
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
            match.awayTeamId === canonicalHomeTeamId)
      );

      const parsed = normalizeScore(value);

      if (!parsed) {
        if (existingMatch) {
          group.matches = group.matches.filter((match) => match.id !== existingMatch.id);
        }
        return prev;
      }

      const isSameOrientation =
        teamAId === canonicalHomeTeamId && teamBId === canonicalAwayTeamId;

      const homeScore = isSameOrientation ? parsed.leftScore : parsed.rightScore;
      const awayScore = isSameOrientation ? parsed.rightScore : parsed.leftScore;

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
    for (const group of draft.groups) {
      for (const team of group.teams) {
        queueDelete(team.logoPublicId);
      }
    }

    queueDelete(draft.assets.scheduleImagePublicId);
    queueDelete(draft.assets.regulationImagePublicId);
    queueDelete(draft.assets.heroBannerImagePublicId);
    queueDelete(draft.assets.campBannerImagePublicId);
    queueDelete(draft.assets.campPosterLeftPublicId);
    queueDelete(draft.assets.campPosterRightPublicId);

    setDraft({
      ...draft,
      title: "Nowy turniej",
      groups: [],
      scorers: [],
      campStartDate: "",
      campSignupLink: "",
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
  }

  function handleSave() {
    setSaveStatus("saving");

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("payload", JSON.stringify(draft));
        formData.set("deletePublicIds", JSON.stringify(deletePublicIds));

        await saveAdminDraftAction(formData);

        setDeletePublicIds([]);
        setSaveStatus("saved");
      } catch (error) {
        console.error(error);
        setSaveStatus("error");
      }
    });
  }

  const allTeams = draft.groups.flatMap((group) => group.teams);

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

  const content = useMemo(() => {
    if (activeTab === "schedule") {
      return (
        <section className="space-y-4">
          <div className="flex justify-end gap-2">
            <input
              ref={scheduleInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) return;

                try {
                  await handleUploadSchedule(file);
                } catch (error) {
                  console.error(error);
                } finally {
                  input.value = "";
                }
              }}
            />

            <button
              type="button"
              onClick={() => scheduleInputRef.current?.click()}
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

    if (activeTab === "regulation") {
      return (
        <section className="space-y-4">
          <div className="flex justify-end gap-2">
            <input
              ref={regulationInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) return;

                try {
                  await handleUploadRegulation(file);
                } catch (error) {
                  console.error(error);
                } finally {
                  input.value = "";
                }
              }}
            />

            <button
              type="button"
              onClick={() => regulationInputRef.current?.click()}
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

    if (activeTab === "camp") {
      return (
        <section className="space-y-6">
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Banner główny</h2>

              <div className="flex flex-wrap gap-2">
                <input
                  ref={heroBannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;

                    try {
                      await handleUploadHeroBanner(file);
                    } catch (error) {
                      console.error(error);
                    } finally {
                      input.value = "";
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() => heroBannerInputRef.current?.click()}
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

            <PreviewImage
              src={draft.assets.heroBannerImage}
              alt="Banner główny"
              emptyLabel="Brak bannera głównego"
              className="aspect-[16/7]"
            />
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Data startu campa
                </label>
                <input
                  type="datetime-local"
                  value={draft.campStartDate ?? ""}
                  onChange={(event) => handleChangeCampStartDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Link do zapisów
                </label>
                <input
                  type="text"
                  value={draft.campSignupLink ?? ""}
                  onChange={(event) => handleChangeCampSignupLink(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Banner campa</h2>

              <div className="flex flex-wrap gap-2">
                <input
                  ref={campBannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;

                    try {
                      await handleUploadCampBanner(file);
                    } catch (error) {
                      console.error(error);
                    } finally {
                      input.value = "";
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() => campBannerInputRef.current?.click()}
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

            <PreviewImage
              src={draft.assets.campBannerImage}
              alt="Banner campa"
              emptyLabel="Brak bannera campa"
              className="aspect-[16/6]"
            />
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Plakaty campa</h2>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={campPosterLeftInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;

                      try {
                        await handleUploadCampPosterLeft(file);
                      } catch (error) {
                        console.error(error);
                      } finally {
                        input.value = "";
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => campPosterLeftInputRef.current?.click()}
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

                <PreviewImage
                  src={draft.assets.campPosterLeft}
                  alt="Lewy plakat"
                  emptyLabel="Brak lewego plakatu"
                  className="aspect-[4/6]"
                />
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={campPosterRightInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;

                      try {
                        await handleUploadCampPosterRight(file);
                      } catch (error) {
                        console.error(error);
                      } finally {
                        input.value = "";
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => campPosterRightInputRef.current?.click()}
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

                <PreviewImage
                  src={draft.assets.campPosterRight}
                  alt="Prawy plakat"
                  emptyLabel="Brak prawego plakatu"
                  className="aspect-[4/6]"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Podgląd sekcji campa</h2>

            <CampBanner
              date={draft.campStartDate ?? ""}
              signupLink={draft.campSignupLink || "#"}
              bannerImage={draft.assets.campBannerImage}
              leftPosterImage={draft.assets.campPosterLeft}
              rightPosterImage={draft.assets.campPosterRight}
            />
          </section>
        </section>
      );
    }

    if (activeTab === "ticker") {
      return (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Pasek info</h2>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Separator</p>
              <p className="mt-1 text-sm text-slate-600">
                Użyj tego między fragmentami komunikatu: <span className="font-bold">{TICKER_SEPARATOR}</span>
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
              onChange={(event) => handleToggleShowTopScorerTicker(event.target.checked)}
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
              onChange={(event) => handleChangeTickerMessage(event.target.value)}
              placeholder={`Np. Zapraszamy na finały o 17:30${TICKER_SEPARATOR}Wstęp wolny${TICKER_SEPARATOR}Partner wydarzenia: Festiwal Hokeja`}
              rows={5}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">Podgląd:</p>
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white overflow-x-auto whitespace-nowrap">
              {tickerPreview}
            </div>
          </div>
        </section>
      );
    }

    if (activeTab === "scorers") {
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
      <EditableGroupTabs
        groups={draft.groups}
        onAddGroup={handleAddGroup}
        onRemoveGroup={handleRemoveGroup}
        onAddTeam={handleAddTeam}
        onRemoveTeam={handleRemoveTeam}
        onUpdateTeamName={handleUpdateTeamName}
        onUploadTeamLogo={handleUploadTeamLogo}
        onUpdateCell={handleUpdateCell}
      />
    );
  }, [activeTab, draft, allTeams, separatorCopied, tickerPreview]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="space-y-4">
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="inline-flex shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              Live tournament
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                >
                  Wyczyść
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending}
                  className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Zapisz
                </button>

                <form action={logoutAdminAction}>
                  <button
                    type="submit"
                    className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Wyloguj
                  </button>
                </form>
              </div>

              <div className="h-5 text-right text-sm font-medium">
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
        </div>
      </header>

      <nav className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          {mainTabs.map((tab) => {
            const isActive = tab.key === activeTab;

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
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}