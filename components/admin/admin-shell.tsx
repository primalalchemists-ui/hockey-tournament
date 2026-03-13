"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { logoutAdminAction, saveAdminDraftAction } from "@/app/admin/actions";
import { EditableGroupTabs } from "@/components/admin/editable-group-tabs";
import { EditableTournamentHeader } from "@/components/admin/editable-tournament-header";
import { RegulationSection } from "@/components/regulation-section";
import { ScheduleSection } from "@/components/schedule-section";
import type { Tournament } from "@/types/tournament";

type MainTab = "live" | "schedule" | "regulation";

type AdminShellProps = {
  tournament: Tournament;
};

const mainTabs: Array<{ key: MainTab; label: string }> = [
  { key: "live", label: "Tabela Live" },
  { key: "schedule", label: "Harmonogram" },
  { key: "regulation", label: "Regulamin" },
];

function cloneTournament(tournament: Tournament): Tournament {
  return JSON.parse(JSON.stringify(tournament)) as Tournament;
}

function normalizeScore(value: string) {
  const raw = value.trim();

  if (!raw) return null;
  if (!raw.includes(":")) return null;

  const [homeRaw, awayRaw] = raw.split(":").map((item) => item.trim());
  const homeScore = Number(homeRaw);
  const awayScore = Number(awayRaw);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }

  return { homeScore, awayScore };
}

function createTeamId(groupKey: string) {
  return `${groupKey.toLowerCase()}-${Date.now()}`;
}

function createMatchId(groupKey: string, homeTeamId: string, awayTeamId: string) {
  return `${groupKey}-${homeTeamId}-${awayTeamId}`;
}

export function AdminShell({ tournament }: AdminShellProps) {
  const [draft, setDraft] = useState<Tournament>(() => cloneTournament(tournament));
  const [activeTab, setActiveTab] = useState<MainTab>("live");
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [deletePublicIds, setDeletePublicIds] = useState<string[]>([]);

  const scheduleInputRef = useRef<HTMLInputElement | null>(null);
  const regulationInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (saveStatus !== "saved") return;

    const timeout = window.setTimeout(() => {
      setSaveStatus("idle");
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

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

  function handleChangeTitle(value: string) {
    updateDraft((prev) => {
      prev.title = value;
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
          queueDelete((team as any).logoPublicId);
        }
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
        queueDelete((team as any).logoPublicId);
      }

      group.teams = group.teams.filter((team) => team.id !== teamId);
      group.matches = group.matches.filter(
        (match) => match.homeTeamId !== teamId && match.awayTeamId !== teamId
      );

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

      queueDelete((team as any).logoPublicId);

      team.logoUrl = uploaded.url;
      team.logoName = uploaded.name;
      team.logoType = file.type || "image/*";
      (team as any).logoPublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadSchedule(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete((prev.assets as any).scheduleImagePublicId);

      prev.assets.scheduleImage = uploaded.url;
      prev.assets.scheduleImageName = uploaded.name;
      prev.assets.scheduleImageType =
        file.type === "application/pdf" ? "application/pdf" : file.type || "image/*";
      (prev.assets as any).scheduleImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  async function handleUploadRegulation(file: File) {
    const uploaded = await uploadFileToCloudinary(file);

    updateDraft((prev) => {
      queueDelete((prev.assets as any).regulationImagePublicId);

      prev.assets.regulationImage = uploaded.url;
      prev.assets.regulationImageName = uploaded.name;
      prev.assets.regulationImageType =
        file.type === "application/pdf" ? "application/pdf" : file.type || "image/*";
      (prev.assets as any).regulationImagePublicId = uploaded.publicId ?? "";
      return prev;
    });
  }

  function handleRemoveScheduleFile() {
    updateDraft((prev) => {
      queueDelete((prev.assets as any).scheduleImagePublicId);

      prev.assets.scheduleImage = "";
      prev.assets.scheduleImageType = "";
      prev.assets.scheduleImageName = "";
      (prev.assets as any).scheduleImagePublicId = "";
      return prev;
    });
  }

  function handleRemoveRegulationFile() {
    updateDraft((prev) => {
      queueDelete((prev.assets as any).regulationImagePublicId);

      prev.assets.regulationImage = "";
      prev.assets.regulationImageType = "";
      prev.assets.regulationImageName = "";
      (prev.assets as any).regulationImagePublicId = "";
      return prev;
    });
  }

  function handleUpdateCell(
    groupKey: string,
    homeTeamId: string,
    awayTeamId: string,
    value: string
  ) {
    updateDraft((prev) => {
      const group = prev.groups.find((item) => item.key === groupKey);
      if (!group) return prev;

      const existingMatch = group.matches.find(
        (match) =>
          match.homeTeamId === homeTeamId && match.awayTeamId === awayTeamId
      );

      const parsed = normalizeScore(value);

      if (!parsed) {
        if (existingMatch) {
          group.matches = group.matches.filter((match) => match.id !== existingMatch.id);
        }
        return prev;
      }

      if (existingMatch) {
        existingMatch.homeScore = parsed.homeScore;
        existingMatch.awayScore = parsed.awayScore;
        return prev;
      }

      group.matches.push({
        id: createMatchId(groupKey, homeTeamId, awayTeamId),
        group: groupKey,
        homeTeamId,
        awayTeamId,
        homeScore: parsed.homeScore,
        awayScore: parsed.awayScore,
      });

      return prev;
    });
  }

  function handleClearAll() {
    for (const group of draft.groups) {
      for (const team of group.teams) {
        queueDelete((team as any).logoPublicId);
      }
    }

    queueDelete((draft.assets as any).scheduleImagePublicId);
    queueDelete((draft.assets as any).regulationImagePublicId);

    setDraft({
      ...draft,
      title: "Nowy turniej",
      groups: [],
      assets: {
        scheduleImage: "",
        scheduleImageType: "",
        scheduleImageName: "",
        regulationImage: "",
        regulationImageType: "",
        regulationImageName: "",
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
  }, [activeTab, draft, deletePublicIds]);

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