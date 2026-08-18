import { describe, expect, it } from "vitest";

import {
  describeEditabilityLabel,
  describeMatchEditability,
  isMatchEditable,
} from "@/lib/playoff/editability";
import {
  canSubmit,
  describeSaveButton,
  isDirty,
  shouldAdoptIncoming,
} from "@/lib/admin/save-state";

/**
 * REGUŁY PANELU BEZ PRZEGLĄDARKI.
 *
 * Dwie rzeczy, które muszą działać identycznie na serwerze i w UI:
 * co wolno dziś edytować oraz w jakim stanie jest przycisk zapisu.
 */

const TOP4 = { size: 4 as const, thirdPlaceMatch: true };

describe("A-H: które mecze są edytowalne", () => {
  it("faza grupowa: drabinka i minigrupa jeszcze nie istnieją", () => {
    expect(
      describeMatchEditability({
        phase: "group_stage",
        ...TOP4,
        stage: "bracket",
        kind: "semifinal",
      })
    ).toBe("locked");

    expect(
      describeMatchEditability({
        phase: "group_stage",
        ...TOP4,
        stage: "placement_group",
      })
    ).toBe("locked");
  });

  it("A: w półfinałach edytowalne są półfinały", () => {
    expect(
      isMatchEditable({
        phase: "semifinal",
        ...TOP4,
        stage: "bracket",
        kind: "semifinal",
      })
    ).toBe(true);
  });

  it("B/C: w półfinałach finał i mecz o 3. miejsce tylko czekają", () => {
    for (const kind of ["final", "third_place"] as const) {
      expect(
        describeMatchEditability({
          phase: "semifinal",
          ...TOP4,
          stage: "bracket",
          kind,
        })
      ).toBe("pending");
    }
  });

  it("D/G: minigrupa jest aktywna przez cały play-off", () => {
    for (const phase of ["semifinal", "final"] as const) {
      expect(
        describeMatchEditability({
          phase,
          ...TOP4,
          stage: "placement_group",
        })
      ).toBe("editable");
    }
  });

  it("E/F: w finałach edytowalny jest finał i mecz o 3. miejsce", () => {
    for (const kind of ["final", "third_place"] as const) {
      expect(
        describeMatchEditability({
          phase: "final",
          ...TOP4,
          stage: "bracket",
          kind,
        })
      ).toBe("editable");
    }
  });

  it("H: w finałach półfinał jest już zamknięty", () => {
    expect(
      describeMatchEditability({
        phase: "final",
        ...TOP4,
        stage: "bracket",
        kind: "semifinal",
      })
    ).toBe("completed");
  });

  it("po zakończeniu turnieju nic nie jest edytowalne", () => {
    expect(
      describeMatchEditability({
        phase: "completed",
        ...TOP4,
        stage: "placement_group",
      })
    ).toBe("completed");
  });

  it("reguła jest generyczna dla drabinek 8 i 16", () => {
    const eight = (phase: "quarterfinal" | "semifinal" | "final") =>
      ["quarterfinal", "semifinal", "final"].map((kind) =>
        describeMatchEditability({
          phase,
          size: 8,
          thirdPlaceMatch: false,
          stage: "bracket",
          kind: kind as "quarterfinal",
        })
      );

    expect(eight("quarterfinal")).toEqual(["editable", "pending", "pending"]);
    expect(eight("semifinal")).toEqual(["completed", "editable", "pending"]);
    expect(eight("final")).toEqual(["completed", "completed", "editable"]);

    expect(
      describeMatchEditability({
        phase: "quarterfinal",
        size: 16,
        thirdPlaceMatch: false,
        stage: "bracket",
        kind: "round_of_16",
      })
    ).toBe("completed");
  });

  it("etykiety etapów są po ludzku", () => {
    expect(describeEditabilityLabel("editable")).toBe("Trwa");
    expect(describeEditabilityLabel("pending")).toBe("Oczekuje");
    expect(describeEditabilityLabel("completed")).toBe("Rozegrane");
    expect(describeEditabilityLabel("locked")).toBe("Podgląd");
  });
});

describe("W-AE: przycisk zapisu", () => {
  const empty = { home: "", away: "" };
  const saved = { home: "3", away: "1" };

  it("W: zapisany, nieruszony wynik pokazuje „Zapisano”", () => {
    const view = describeSaveButton({
      draft: saved,
      persisted: saved,
      status: "idle",
    });

    expect(view).toEqual({ label: "Zapisano", state: "saved", disabled: true });
  });

  it("W: pusty, nieruszony mecz nie ma czego zapisać", () => {
    expect(
      describeSaveButton({ draft: empty, persisted: empty, status: "idle" })
    ).toEqual({ label: "Zapisz", state: "dirty", disabled: true });
  });

  it("X: zmiana w inpucie odblokowuje „Zapisz”", () => {
    const view = describeSaveButton({
      draft: { home: "2", away: "0" },
      persisted: empty,
      status: "idle",
    });

    expect(view.label).toBe("Zapisz");
    expect(view.disabled).toBe(false);
  });

  it("Y/AB: w trakcie zapisu widać „Zapisywanie…”, nigdy „...”", () => {
    const view = describeSaveButton({
      draft: saved,
      persisted: empty,
      status: "saving",
    });

    expect(view.label).toBe("Zapisywanie…");
    expect(view.label).not.toContain("...");
    expect(view.disabled).toBe(true);
  });

  it("AC: zmiana zapisanego wyniku natychmiast wraca do „Zapisz”", () => {
    // Bez żadnego timeoutu - liczy się wyłącznie porównanie wartości.
    expect(isDirty({ home: "2", away: "0" }, saved)).toBe(true);

    expect(
      describeSaveButton({
        draft: { home: "2", away: "0" },
        persisted: saved,
        status: "saved",
      }).label
    ).toBe("Zapisz");
  });

  it("AD: podwójne kliknięcie nie wysyła drugiego żądania", () => {
    expect(
      canSubmit({ draft: saved, persisted: empty, status: "saving" })
    ).toBe(false);

    expect(canSubmit({ draft: saved, persisted: empty, status: "idle" })).toBe(
      true
    );
  });

  it("AE: nieudany zapis da się powtórzyć", () => {
    const view = describeSaveButton({
      draft: saved,
      persisted: empty,
      status: "error",
    });

    expect(view.label).toBe("Spróbuj ponownie");
    expect(view.disabled).toBe(false);
  });

  it("odświeżenie z serwera nie kasuje niezapisanej zmiany", () => {
    expect(
      shouldAdoptIncoming({
        incomingChanged: true,
        draft: { home: "9", away: "9" },
        persisted: empty,
        status: "idle",
      })
    ).toBe(false);

    expect(
      shouldAdoptIncoming({
        incomingChanged: true,
        draft: empty,
        persisted: empty,
        status: "idle",
      })
    ).toBe(true);
  });
});
