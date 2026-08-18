/**
 * STAN PRZYCISKU ZAPISU — czysta logika, zero Reacta i zero DOM.
 *
 * Wyniesione z komponentu celowo: to jest maszyna stanów, którą trzeba
 * umieć przetestować bez przeglądarki, a nie kwestia wyglądu.
 *
 * Reguła nadrzędna: powrót z „Zapisano" do „Zapisz" wynika WYŁĄCZNIE
 * z porównania wartości w inputach z ostatnią zapisaną wartością.
 * Żadnych setTimeout — jeśli nikt nic nie zmienił, napis zostaje.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Wartości z inputów. Pusty string i brak wyniku to to samo. */
export type ScoreDraft = {
  home: string;
  away: string;
};

export type SaveButtonState = "dirty" | "saving" | "saved" | "error";

export type SaveButtonView = {
  label: string;
  state: SaveButtonState;
  disabled: boolean;
};

export function isDirty(draft: ScoreDraft, persisted: ScoreDraft): boolean {
  return draft.home !== persisted.home || draft.away !== persisted.away;
}

/** Czy w ogóle jest co zapisywać (komplet obu wartości albo jawne czyszczenie). */
export function hasScore(draft: ScoreDraft): boolean {
  return draft.home !== "" && draft.away !== "";
}

export function describeSaveButton(input: {
  draft: ScoreDraft;
  persisted: ScoreDraft;
  status: SaveStatus;
}): SaveButtonView {
  const { draft, persisted, status } = input;
  const dirty = isDirty(draft, persisted);

  if (status === "saving") {
    // Nigdy „..." — trzy kropki nie mówią nic i skakała po nich szerokość.
    return { label: "Zapisywanie…", state: "saving", disabled: true };
  }

  if (status === "error") {
    return { label: "Spróbuj ponownie", state: "error", disabled: false };
  }

  if (dirty) {
    return { label: "Zapisz", state: "dirty", disabled: false };
  }

  if (hasScore(persisted)) {
    return { label: "Zapisano", state: "saved", disabled: true };
  }

  // Pusty, nietknięty mecz: nie ma czego zapisywać.
  return { label: "Zapisz", state: "dirty", disabled: true };
}

/**
 * Bramka wysyłki.
 *
 * Podwójne kliknięcie w trakcie zapisu nie może wysłać drugiego żądania —
 * i nie polegamy tu na `disabled` w HTML, bo to tylko podpowiedź dla oka.
 */
export function canSubmit(input: {
  draft: ScoreDraft;
  persisted: ScoreDraft;
  status: SaveStatus;
}): boolean {
  if (input.status === "saving") return false;

  return isDirty(input.draft, input.persisted);
}

/**
 * Czy przyjąć wartość, która przyszła z serwera (auto-odświeżenie,
 * cudzy zapis), nie kasując tego, co administrator właśnie wpisuje.
 */
export function shouldAdoptIncoming(input: {
  incomingChanged: boolean;
  draft: ScoreDraft;
  persisted: ScoreDraft;
  status: SaveStatus;
}): boolean {
  if (!input.incomingChanged) return false;
  if (input.status === "saving") return false;

  return !isDirty(input.draft, input.persisted);
}
