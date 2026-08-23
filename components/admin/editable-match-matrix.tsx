"use client";

import { useState } from "react";
import type { Group, Match, Team } from "@/types/tournament";

export type ResultsSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  /** Powód niepowodzenia — pokazywany wprost, nie chowany w konsoli. */
  message: string | null;
};

type EditableMatchMatrixProps = {
  group: Group;
  onUpdateCell: (
    groupKey: string,
    teamAId: string,
    teamBId: string,
    value: string
  ) => void;
  /** Zapis wąską ścieżką: wyłącznie wyniki, bez reszty turnieju. */
  onSaveResults: () => void;
  saveState: ResultsSaveState;
  /**
   * Faza grupowa zamrożona — wyniki są zamknięte.
   *
   * Serwer i tak odrzuci taki zapis, ale odmowa PO kliknięciu to zła
   * kolejność: człowiek zdąży wpisać partię wyników, zanim się dowie,
   * że nie miał prawa. Blokada musi być widoczna wcześniej.
   */
  locked: boolean;
  /**
   * Czy od ostatniego zapisu cokolwiek się zmieniło.
   *
   * Przycisk aktywny bez przerwy nic nie mówi. Zapalony znaczy „coś czeka
   * w przeglądarce i nie ma tego jeszcze w bazie" — i to jest informacja,
   * której przy wpisywaniu wyników naprawdę się potrzebuje.
   */
  dirty: boolean;
};

function findMatch(group: Group, teamAId: string, teamBId: string): Match | null {
  return (
    group.matches.find(
      (item) =>
        (item.homeTeamId === teamAId && item.awayTeamId === teamBId) ||
        (item.homeTeamId === teamBId && item.awayTeamId === teamAId)
    ) ?? null
  );
}

function buildCellValue(match: Match | null, rowTeamId: string) {
  if (!match) return "";

  const isRowHome = match.homeTeamId === rowTeamId;
  const leftScore = isRowHome ? match.homeScore : match.awayScore;
  const rightScore = isRowHome ? match.awayScore : match.homeScore;

  return `${leftScore}:${rightScore}`;
}

function getTone(match: Match | null, rowTeamId: string) {
  if (!match) {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }

  const isRowHome = match.homeTeamId === rowTeamId;
  const scored = isRowHome ? match.homeScore : match.awayScore;
  const conceded = isRowHome ? match.awayScore : match.homeScore;

  if (scored > conceded) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (scored < conceded) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function TeamLogo({
  team,
  size = "md",
}: {
  team: Team;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-9 w-9" : "h-10 w-10";

  if (team.logoUrl) {
    return (
      <div
        className={[
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white",
          sizeClass,
        ].join(" ")}
      >
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[9px] font-semibold uppercase text-slate-600",
        sizeClass,
      ].join(" ")}
    >
      {team.shortName || team.logoText || "LOGO"}
    </div>
  );
}

/** Rozbija „3:1" na dwa pola. Pusty wynik to dwa puste pola. */
function splitScore(value: string): { home: string; away: string } {
  const [home = "", away = ""] = value.split(":");
  return { home: home.trim(), away: away.trim() };
}

/**
 * KOMÓRKA WYNIKU — dwa pola i dwukropek na stałe.
 *
 * Wcześniej było jedno pole, w które trzeba było wstukać także dwukropek.
 * Dwa problemy naraz:
 *
 * 1. DWUKROPEK Z KLAWIATURY. Na telefonie to zmiana układu klawiatury dla
 *    jednego znaku, przy stu wynikach w turnieju. Panel play-off od dawna
 *    ma dwa osobne pola i wpisuje się w nim znacznie szybciej.
 *
 * 2. SKAKANIE MACIERZY W TRAKCIE PISANIA. Wynik bez dwukropka nie parsował
 *    się, więc po pierwszym znaku mecz ZNIKAŁ z draftu: kratka traciła
 *    kolor, tabela nad macierzą przeliczała się i przestawiała drużyny,
 *    a wszystko wracało dopiero po wpisaniu ostatniej cyfry. Przy każdym
 *    wyniku, trzy razy.
 *
 * Dlatego niekompletna para (jedno pole puste) NIE rusza draftu. Zmiana
 * idzie dalej dopiero wtedy, gdy oba pola mają liczbę — albo gdy oba są
 * puste i użytkownik opuszcza kratkę, co znaczy „wyczyść wynik".
 */
function EditableCell({
  groupKey,
  rowTeamId,
  colTeamId,
  initialValue,
  toneClassName,
  isEditable,
  onUpdateCell,
}: {
  groupKey: string;
  rowTeamId: string;
  colTeamId: string;
  initialValue: string;
  toneClassName: string;
  isEditable: boolean;
  onUpdateCell: (
    groupKey: string,
    teamAId: string,
    teamBId: string,
    value: string
  ) => void;
}) {
  const [fields, setFields] = useState(() => splitScore(initialValue));

  /*
    Wartość z zewnątrz (zapis, przeładowanie danych) ma wygrać z tym, co
    leży w polach — ale tylko wtedy, gdy naprawdę się zmieniła. Ten sam
    wzorzec co w wierszu meczu play-off: korekta stanu w renderze, bez
    efektu, więc nie ma dodatkowego przebiegu ani migotania.
  */
  const [seen, setSeen] = useState(initialValue);

  if (initialValue !== seen) {
    setSeen(initialValue);
    setFields(splitScore(initialValue));
  }

  if (!isEditable) {
    return (
      <div
        className={[
          "mx-auto flex min-h-10 min-w-[88px] items-center justify-center rounded-xl border px-2 py-2 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
          toneClassName,
        ].join(" ")}
      >
        {initialValue || "—"}
      </div>
    );
  }

  /** Do draftu trafia komplet albo nic — nigdy połowa wyniku. */
  function commit(next: { home: string; away: string }) {
    if (next.home !== "" && next.away !== "") {
      onUpdateCell(groupKey, rowTeamId, colTeamId, `${next.home}:${next.away}`);
    }
  }

  function handleChange(side: "home" | "away", raw: string) {
    // Same cyfry i najwyżej dwie — bramek powyżej 99 w minihokeju nie ma.
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 2);
    const next = { ...fields, [side]: digits };

    setFields(next);
    commit(next);

    /*
      ŻADNEGO automatycznego skoku na drugie pole.

      Miał oszczędzać tabulatory, ale przeskakiwał już po pierwszej cyfrze —
      więc wyniku dwucyfrowego (10:2, 12:1) NIE DAŁO SIĘ wpisać: druga cyfra
      lądowała w polu gości. Przejście między polami należy do Taba i myszy,
      czyli do użytkownika.
    */
  }

  /*
    Opuszczenie kratki z DWOMA pustymi polami znaczy „wyczyść ten wynik".
    Świadomie dopiero na wyjściu: kasowanie w trakcie poprawiania 3:1 na
    4:1 wywoływałoby dokładnie to migotanie, którego się pozbywamy.
  */
  function handleBlur() {
    if (fields.home === "" && fields.away === "" && initialValue !== "") {
      onUpdateCell(groupKey, rowTeamId, colTeamId, "");
    }
  }

  const fieldClass =
    "w-6 bg-transparent text-center outline-none placeholder:text-slate-400";

  return (
    <div
      className={[
        "mx-auto flex min-h-10 min-w-[88px] items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
        toneClassName,
      ].join(" ")}
    >
      <input
        value={fields.home}
        onChange={(event) => handleChange("home", event.target.value)}
        onBlur={handleBlur}
        onFocus={(event) => event.target.select()}
        inputMode="numeric"
        aria-label="Gole gospodarza"
        data-testid="cell-home"
        /*
          Wyszarzone „0" to nie ozdoba, tylko sygnał „tu się wpisuje".
          Lustrzane odbicie w górnej połowie macierzy pokazuje „—", więc
          te dwa stany da się odróżnić jednym spojrzeniem. Wpisany wynik
          dostaje dodatkowo kolor tła, czego pusta kratka nie ma.
        */
        placeholder="0"
        /*
          Nieruchoma kolumna z nazwami leży NAD tabelą, więc bez tego marginesu
          przeglądarka przewijała kratkę dokładnie pod nią przy wejściu w pole.
        */
        style={{ scrollMarginLeft: `${NAME_COLUMN_REM + 1}rem` }}
        className={fieldClass}
      />

      <span aria-hidden="true" className="select-none text-slate-400">
        :
      </span>

      <input
        value={fields.away}
        onChange={(event) => handleChange("away", event.target.value)}
        onBlur={handleBlur}
        onFocus={(event) => event.target.select()}
        inputMode="numeric"
        aria-label="Gole gościa"
        data-testid="cell-away"
        placeholder="0"
        style={{ scrollMarginRight: "1rem" }}
        className={fieldClass}
      />
    </div>
  );
}

/* Miary wspólne z publicznym matrixem — patrz components/match-matrix.tsx. */
const NAME_COLUMN_REM = 9;
const HEAD_HEIGHT_REM = 4;
const ROW_HEIGHT_REM = 3.5;

const NAME_COLUMN_STYLE: React.CSSProperties = {
  width: `${NAME_COLUMN_REM}rem`,
  minWidth: `${NAME_COLUMN_REM}rem`,
  maxWidth: `${NAME_COLUMN_REM}rem`,
};

/*
  Nakładka jest o włos szersza niż kolumna tabeli.
  Bez tego zaokrąglenie subpikselowe zostawiało przy pierwszym przesunięciu
  cienki pasek przewijanej treści na styku kolumn.
*/
const NAME_COLUMN_OVERLAY_STYLE: React.CSSProperties = {
  width: `calc(${NAME_COLUMN_REM}rem + 1px)`,
};

export function EditableMatchMatrix({
  group,
  onUpdateCell,
  onSaveResults,
  saveState,
  locked,
  dirty,
}: EditableMatchMatrixProps) {
  const isSaving = saveState.status === "saving";

  /* Powód blokady stoi w tym samym miejscu co komunikaty o zapisie. */
  const lockedNote = "Faza grupowa zamrożona. Cofnij ją, aby poprawić wynik.";

  /*
    W trakcie zapisu status MILCZY. Przycisk pokazuje wtedy kółko i napis
    „Zapisywanie", więc powtarzanie tego samego słowa obok byłoby szumem.
    Tekst pojawia się dopiero jako WYNIK: „Zapisano" albo powód porażki.
  */
  const statusText = isSaving
    ? null
    : saveState.status === "saved"
      ? "Zapisano"
      : (saveState.message ?? (locked ? lockedNote : null));

  return (
    <section className="ice-card-solid flush-card rounded-none sm:rounded-3xl">
      {/*
        ZAPIS PRZY TABELI, NIE NA GÓRZE STRONY.

        Jedyny przycisk zapisu stał w nagłówku panelu, więc po każdej partii
        wyników trzeba było przewinąć w górę, kliknąć i wrócić na dół — a status
        pojawiał się dokładnie tam, skąd się przed chwilą odjechało. Tutaj
        przycisk jest w zasięgu wzroku od kratek, a odpowiedź pokazuje się
        w tej samej linii.

        Ten zapis wysyła WYŁĄCZNIE wyniki. Nie może skasować drużyny ani grupy,
        więc wpisywanie wyników przestaje być operacją na całym turnieju.
      */}
      <div className="ice-card-head">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Wyniki</h2>

          {/*
            Status stoi TUŻ PRZY przycisku, nie na środku linii. Odpowiedź
            ma się pojawić tam, gdzie przed chwilą był wzrok i palec —
            środek nagłówka to miejsce, na które nikt nie patrzy po
            kliknięciu. Wysokość jest stała, więc tabela pod spodem nie drga.
          */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <p
              role="status"
              data-testid="results-save-status"
              title={statusText ?? undefined}
              className={[
                "min-h-5 min-w-0 truncate text-right text-sm font-semibold",
                saveState.status === "error"
                  ? "text-rose-700"
                  : saveState.status === "saved"
                    ? "text-emerald-700"
                    : "text-slate-600",
              ].join(" ")}
            >
              {statusText}
            </p>

            <button
              type="button"
              onClick={onSaveResults}
              disabled={isSaving || locked || !dirty}
              title={locked ? lockedNote : undefined}
              data-testid="results-save"
              data-locked={locked ? "true" : "false"}
              data-dirty={dirty ? "true" : "false"}
              className="btn btn-primary shrink-0"
            >
              {isSaving ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>Zapisywanie</span>
                </>
              ) : (
                "Zapisz wyniki"
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
      <div className="ice-scroll overflow-x-auto pb-4">
        <table className="matrix-table w-full text-xs sm:text-sm">
          <thead className="w-full">
            <tr style={{ height: `${HEAD_HEIGHT_REM}rem` }}>
              <th
                className="px-3 py-3 text-left font-semibold text-slate-600"
                style={NAME_COLUMN_STYLE}
              />

              {group.teams.map((team) => (
                <th
                  key={team.id}
                  className="bg-[var(--surface-head)] px-2 py-3 text-center font-semibold text-[var(--text-secondary)]"
                >
                  <div className="mx-auto flex w-20 flex-col items-center gap-2">
                    <TeamLogo team={team} size="sm" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {group.teams.map((rowTeam, rowIndex) => (
              <tr
                key={rowTeam.id}
                className={rowIndex % 2 === 0 ? "" : "bg-[var(--surface-alt)]"}
                style={{ height: `${ROW_HEIGHT_REM}rem` }}
              >
                <td
                  className="px-3 py-2 font-medium text-slate-900"
                  style={NAME_COLUMN_STYLE}
                >
                  <div className="flex items-center gap-3">
                    <TeamLogo team={rowTeam} size="sm" />
                    <span className="truncate">{rowTeam.name}</span>
                  </div>
                </td>

                {group.teams.map((colTeam, colIndex) => {
                  const isSame = rowTeam.id === colTeam.id;
                  const match = findMatch(group, rowTeam.id, colTeam.id);
                  const isLastCol = colIndex === group.teams.length - 1;
                  /*
                    Wynik wpisuje się w DOLNEJ połowie matrixa.
                    Górna połowa jest lustrem tej samej pary i celowo
                    pozostaje tylko do odczytu — jeden mecz, jedno miejsce
                    wpisania, zero ryzyka sprzecznych edycji.
                  */
                  const isEditable = rowIndex > colIndex;

                  return (
                    <td
                      key={colTeam.id}
                      className={
                        isLastCol
                          ? "py-2 pl-2 pr-4 text-center"
                          : "px-2 py-2 text-center"
                      }
                    >
                      {isSame ? (
                        <div className="mx-auto flex min-h-10 min-w-[88px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                          -
                        </div>
                      ) : (
                        <EditableCell
                          groupKey={group.key}
                          rowTeamId={rowTeam.id}
                          colTeamId={colTeam.id}
                          initialValue={buildCellValue(match, rowTeam.id)}
                          toneClassName={getTone(match, rowTeam.id)}
                          isEditable={isEditable}
                          onUpdateCell={onUpdateCell}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Ta sama nieruchoma kolumna nazw co na stronie publicznej.
        Wpisywanie wyników przesuwa się dokładnie tak samo jak front.
      */}
      <div
        aria-hidden="true"
        data-testid="matrix-name-column"
        className="pointer-events-none absolute left-0 top-0 z-10"
        style={NAME_COLUMN_OVERLAY_STYLE}
      >
        <div
          className="matrix-name-head"
          style={{ height: `${HEAD_HEIGHT_REM}rem` }}
        />

        {group.teams.map((rowTeam, rowIndex) => (
          <div
            key={rowTeam.id}
            className={[
              "matrix-name-cell flex items-center gap-3 px-3",
              rowIndex % 2 === 0 ? "" : "matrix-name-cell-alt",
            ].join(" ")}
            style={{ height: `${ROW_HEIGHT_REM}rem` }}
          >
            <TeamLogo team={rowTeam} size="sm" />
            <span className="truncate text-xs font-medium text-slate-900 sm:text-sm">
              {rowTeam.name}
            </span>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}