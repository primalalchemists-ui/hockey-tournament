"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

type EditableTournamentHeaderProps = {
  title: string;
  onChangeTitle: (value: string) => void;
};

export function EditableTournamentHeader({
  title,
  onChangeTitle,
}: EditableTournamentHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-3">
      {/* <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
        Live tournament
      </div> */}

      <div className="flex items-center gap-2">
        {isEditing ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => onChangeTitle(event.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setIsEditing(false);
              }
            }}
            className="min-w-0 bg-transparent text-3xl font-bold tracking-tight text-slate-900 outline-none sm:text-4xl lg:text-5xl"
          />
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              {title}
            </h1>

            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="shrink-0 rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              title="Edytuj tytuł"
            >
              <Pencil size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}