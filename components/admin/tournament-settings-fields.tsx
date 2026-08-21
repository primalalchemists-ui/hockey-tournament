"use client";

import { useState } from "react";

import {
  QUALIFIED_TEAM_COUNTS,
  type PlayoffConfig,
  type TournamentFormat,
  type TournamentStructure,
} from "@/types/tournament-config";

type TournamentSettingsFieldsProps = {
  defaultStructure?: TournamentStructure;
  defaultFormat?: TournamentFormat;
  defaultPlayoffConfig?: PlayoffConfig | null;
  /** Czy turniej prowadzi klasyfikację strzelców. */
  defaultScorersEnabled?: boolean;
  /**
   * Blokada zmiany struktury dla turnieju, który ma już dane.
   * Przeniesienie drużyn i meczów między strukturami jest destrukcyjne.
   */
  structureLockedReason?: string | null;
};

/**
 * Pola konfiguracji turnieju — wspólne dla kreatora i ustawień.
 *
 * Dwie NIEZALEŻNE osie: struktura uczestników i system rozgrywek.
 * Nazwy pól odpowiadają dokładnie temu, co czyta server action.
 */
export function TournamentSettingsFields({
  defaultStructure = "groups",
  defaultFormat = "league",
  defaultPlayoffConfig = null,
  defaultScorersEnabled = true,
  structureLockedReason = null,
}: TournamentSettingsFieldsProps) {
  const [structure, setStructure] =
    useState<TournamentStructure>(defaultStructure);
  const [format, setFormat] = useState<TournamentFormat>(defaultFormat);
  const [qualified, setQualified] = useState<number>(
    defaultPlayoffConfig?.qualifiedTeamCount ?? 4
  );
  const [thirdPlace, setThirdPlace] = useState<boolean>(
    defaultPlayoffConfig?.thirdPlaceMatch ?? true
  );
  const [placementMode, setPlacementMode] = useState<string>(
    defaultPlayoffConfig?.placementMode ?? "placement_group"
  );
  const [scorersEnabled, setScorersEnabled] = useState(defaultScorersEnabled);

  const isLocked = Boolean(structureLockedReason);

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Struktura
        </legend>

        <Option
          name="structure"
          value="single"
          checked={structure === "single"}
          disabled={isLocked}
          onSelect={() => setStructure("single")}
          label="Jedna tabela"
        />

        <Option
          name="structure"
          value="groups"
          checked={structure === "groups"}
          disabled={isLocked}
          onSelect={() => setStructure("groups")}
          label="Podział na grupy"
        />

        {structureLockedReason ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {structureLockedReason}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          System rozgrywek
        </legend>

        <Option
          name="format"
          value="league"
          checked={format === "league"}
          onSelect={() => setFormat("league")}
          label="Każdy z każdym"
          description="Wyniki fazy round-robin wyznaczają końcową klasyfikację."
        />

        <Option
          name="format"
          value="group_playoff"
          checked={format === "group_playoff"}
          onSelect={() => setFormat("group_playoff")}
          label="Tabela + play-off"
          description="Po fazie round-robin najlepsze drużyny przechodzą do fazy pucharowej."
        />
      </fieldset>

      {format === "group_playoff" ? (
        <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Konfiguracja play-off
          </legend>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">
              Awans do fazy pucharowej
            </span>
            <select
              name="qualifiedTeamCount"
              value={qualified}
              onChange={(event) => setQualified(Number(event.target.value))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              {QUALIFIED_TEAM_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count} drużyny
                </option>
              ))}
            </select>
            <span className="block text-[11px] leading-snug text-slate-500">
              {structure === "groups"
                ? "Liczba najlepszych drużyn Z KAŻDEJ GRUPY."
                : "Liczba najlepszych drużyn ze wspólnej tabeli."}
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              name="thirdPlaceMatch"
              value="true"
              checked={thirdPlace}
              disabled={qualified < 4}
              onChange={(event) => setThirdPlace(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Mecz o 3. miejsce
              </span>
              {qualified < 4 ? (
                <span className="block text-[11px] text-slate-500">
                  Niedostępny przy drabince 2-drużynowej (sam finał).
                </span>
              ) : null}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">
              Pozostałe drużyny
            </span>
            <select
              name="placementMode"
              value={placementMode}
              onChange={(event) => setPlacementMode(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="placement_group">Minigrupa klasyfikacyjna</option>
              <option value="none">Kończą turniej</option>
            </select>
          </label>

          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="block text-sm font-medium text-slate-800">
              Rozstrzygnięcie remisu
            </span>
            <span className="block text-[11px] leading-snug text-slate-500">
              Rzuty karne. Remis dozwolony tylko w fazie round-robin.
            </span>
          </div>
        </fieldset>
      ) : null}

      {/*
        KLASYFIKACJA STRZELCÓW — cecha pojedynczego turnieju.
        Rabbit Cup ją prowadzi, SUN CUP U8/U10 nie.
      */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Klasyfikacja strzelców
        </legend>

        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <input
            type="checkbox"
            checked={scorersEnabled}
            onChange={(event) => setScorersEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 border-slate-300"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              Prowadzimy klasyfikację strzelców
            </span>
            <span className="block text-[11px] leading-snug text-slate-500">
              Wyłączona ukrywa zakładkę u kibica. Wpisane gole zostają w bazie.
            </span>
          </span>
        </label>

        {/* Niezaznaczony checkbox nie trafia do FormData — stąd jawne pole. */}
        <input
          type="hidden"
          name="scorersEnabled"
          value={scorersEnabled ? "true" : "false"}
        />
      </fieldset>

      {/* Zablokowane pole i tak musi trafić do formularza. */}
      {isLocked ? (
        <input type="hidden" name="structure" value={structure} />
      ) : null}
    </div>
  );
}

function Option({
  name,
  value,
  checked,
  disabled,
  onSelect,
  label,
  /** Zdanie pomocnicze TYLKO tam, gdzie etykieta naprawdę nie wystarcza. */
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  label: string;
  description?: string;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
          : checked
            ? "cursor-pointer border-slate-900 bg-white"
            : "cursor-pointer border-slate-200 bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 border-slate-300"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? (
          <span className="block text-[11px] leading-snug text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
