import { describe, expect, it } from "vitest";

import {
  DEFAULT_BUBBLE_COLOR,
  MAX_CATEGORY_LABEL,
  describeLabelError,
  findCategory,
  normalizeCategoryLabel,
  pickReadableTextColor,
  shouldShowSwitcher,
  suggestCategoryLabel,
} from "@/lib/public/tournament-collection";

/**
 * PRZELACZNIK KATEGORII - warstwa domenowa.
 *
 * Feature jest CELOWO generyczny: etykieta moze brzmiec U8, OPEN, PRO albo
 * KOBIETY. Domena nie zna znaczenia tych slow i niczego nie waliduje wzorcem.
 */

describe("etykieta kategorii", () => {
  it("przycina biale znaki", () => {
    expect(normalizeCategoryLabel("  U8  ")).toBe("U8");
  });

  it("pusta etykieta jest odrzucana", () => {
    expect(normalizeCategoryLabel("")).toBeNull();
    expect(normalizeCategoryLabel("   ")).toBeNull();
    expect(describeLabelError("")).toBe("Podaj etykietę kategorii.");
  });

  it("za dluga etykieta jest odrzucana", () => {
    const long = "X".repeat(MAX_CATEGORY_LABEL + 1);

    expect(normalizeCategoryLabel(long)).toBeNull();
    expect(describeLabelError(long)).toContain(String(MAX_CATEGORY_LABEL));
  });

  it("to NIE jest funkcja o rocznikach", () => {
    // Zadnego wzorca U[0-9]+ - dowolny krotki tekst jest poprawny.
    for (const label of ["U8", "OPEN", "PRO", "KOBIETY", "A", "Dywizja 2"]) {
      expect(normalizeCategoryLabel(label)).toBe(label);
      expect(describeLabelError(label)).toBeNull();
    }
  });

  it("podpowiada etykiete z tytulu, ale jej nie narzuca", () => {
    expect(suggestCategoryLabel("SUN CUP 2026 — U8")).toBe("U8");
    expect(suggestCategoryLabel("SUN CUP 2026 — U10")).toBe("U10");
    // Tytul bez czlonu po myslniku nie wymysla niczego na sile.
    expect(suggestCategoryLabel("Rabbit Cup")).toBe("Rabbit Cup");
  });
});

describe("BA-BC: automatyczny kontrast tekstu", () => {
  it("BB: ciemne tlo dostaje jasny tekst", () => {
    for (const dark of ["#1E3A5F", "#111827", "#7C3AED", "#B91C1C"]) {
      expect(pickReadableTextColor(dark)).toBe("light");
    }
  });

  it("BC: jasne tlo dostaje ciemny tekst", () => {
    for (const light of ["#F1F5F9", "#FDE68A", "#38BDF8", "#FFFFFF"]) {
      expect(pickReadableTextColor(light)).toBe("dark");
    }
  });

  it("niepoprawny kolor nie wywraca babelka", () => {
    expect(pickReadableTextColor("nonsens")).toBe("light");
    expect(DEFAULT_BUBBLE_COLOR).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("N-Q: kiedy przelacznik ma sie pokazac", () => {
  const u8 = { tournamentId: "a", label: "U8", bubbleColor: "#1E3A5F" };
  const u10 = { tournamentId: "b", label: "U10", bubbleColor: "#3978C7" };

  it("N: brak kolekcji = brak babelka", () => {
    expect(shouldShowSwitcher(null)).toBe(false);
    expect(shouldShowSwitcher([])).toBe(false);
  });

  it("O: jedna kategoria = brak babelka", () => {
    expect(shouldShowSwitcher([u8])).toBe(false);
  });

  it("P: dwie kategorie = babelek", () => {
    expect(shouldShowSwitcher([u8, u10])).toBe(true);
  });

  it("Q: etykieta babelka pochodzi z ogladanej kategorii", () => {
    expect(findCategory([u8, u10], "b")?.label).toBe("U10");
    expect(findCategory([u8, u10], "nieznane")).toBeNull();
    expect(findCategory(null, "a")).toBeNull();
  });
});
