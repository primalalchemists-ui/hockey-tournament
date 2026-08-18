"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";

import type { Group } from "@/types/tournament";
import { TeamDialog, type TeamDraft } from "@/components/admin/team-dialog";

type TeamManagerProps = {
  groups: Group[];
  activeGroupKey: string;
  onCreateTeam: (groupKey: string, draft: TeamDraft) => void;
  onRemoveTeam: (groupKey: string, teamId: string) => void;
  onSaveTeam: (groupKey: string, teamId: string, draft: TeamDraft) => void;
};

type DialogState =
  | { mode: "create"; teamId: null; draft: TeamDraft }
  | { mode: "edit"; teamId: string; draft: TeamDraft };

export function TeamManager({
  groups,
  activeGroupKey,
  onCreateTeam,
  onRemoveTeam,
  onSaveTeam,
}: TeamManagerProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const activeGroup = groups.find((group) => group.key === activeGroupKey);

  if (!activeGroup) return null;

  return (
    <section className="overflow-hidden ice-surface flush-card sm:rounded-3xl">
      <div className="ice-card-head">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Drużyny</h2>

          <button
            type="button"
            onClick={() =>
              setDialog({
                mode: "create",
                teamId: null,
                draft: { name: "", logoUrl: "", logoAssetSlug: "" },
              })
            }
            className="btn btn-primary"
          >
            <Plus size={16} />
            Dodaj drużynę
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {activeGroup.teams.map((team) => (
          <div
            key={team.id}
            className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {team.logoUrl ? (
                  <img
                    src={team.logoUrl}
                    alt={team.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-semibold uppercase text-slate-600">
                    LOGO
                  </span>
                )}
              </div>

              {/*
                Ołówek zostaje — ale otwiera pełny dialog edycji drużyny,
                a nie ukryty upload pliku.
              */}
              <button
                type="button"
                title="Edytuj drużynę"
                data-testid="edit-team"
                onClick={() =>
                  setDialog({
                    mode: "edit",
                    teamId: team.id,
                    draft: {
                      name: team.name,
                      logoUrl: team.logoUrl ?? "",
                      logoAssetSlug: team.logoAssetSlug ?? "",
                    },
                  })
                }
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <Pencil size={14} />
              </button>

              <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                {team.name}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onRemoveTeam(activeGroup.key, team.id)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
              title="Usuń drużynę"
            >
              <X size={16} />
            </button>
          </div>
        ))}

        {activeGroup.teams.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500 sm:px-6">
            Brak drużyn w tej grupie.
          </div>
        ) : null}
      </div>

      {/*
        Dialog montujemy DOPIERO przy otwarciu i z kluczem per drużyna.

        Wcześniej wisiał w drzewie na stałe, więc jego stan (wybrany herb)
        pochodził z pierwszego montowania — czyli z pustych propsów.
        Otwarcie drużyny, której nazwa nie trafiała dokładnie w bibliotekę,
        pokazywało „Brak logo" mimo że drużyna herb miała.
      */}
      {dialog ? (
      <TeamDialog
        key={dialog.teamId ?? "new"}
        initial={dialog.draft}
        mode={dialog.mode}
        onCancel={() => setDialog(null)}
        onSave={(value) => {
          if (!dialog) return;

          if (dialog.mode === "create") {
            onCreateTeam(activeGroup.key, value);
          } else {
            onSaveTeam(activeGroup.key, dialog.teamId, value);
          }

          setDialog(null);
        }}
      />
      ) : null}
    </section>
  );
}
