import { describe, expect, it } from "vitest";

import {
  detectSquadVariant,
  normalizeTeamNameForLogoMatching,
  slugifyLogoName,
  suggestCanonicalName,
} from "@/lib/logos/normalize";
import {
  matchTeamNameToLogos,
  searchLogos,
  type MatchableLogo,
} from "@/lib/logos/matching";

/**
 * DOPASOWANIE NAZW DO BIBLIOTEKI LOGOTYPÓW.
 *
 * Najważniejsza reguła całego etapu: automatycznie zaznaczamy WYŁĄCZNIE
 * pewne trafienia. Złe logo przypięte w ciemno jest gorsze niż brak logo.
 */

function logo(
  canonicalName: string,
  aliases: string[] = []
): MatchableLogo {
  return {
    slug: slugifyLogoName(canonicalName),
    canonicalName,
    normalizedName: normalizeTeamNameForLogoMatching(canonicalName),
    normalizedAliases: aliases.map(normalizeTeamNameForLogoMatching),
  };
}

describe("A: polskie znaki", () => {
  it("sprowadza diakrytyki do liter bazowych", () => {
    expect(normalizeTeamNameForLogoMatching("UKS Zagłębie Sosnowiec")).toBe(
      "uks zaglebie sosnowiec"
    );
    expect(normalizeTeamNameForLogoMatching("ŁKH Łódź")).toBe("lkh lodz");
    expect(normalizeTeamNameForLogoMatching("UKH Unia Oświęcim")).toBe(
      "ukh unia oswiecim"
    );
    expect(normalizeTeamNameForLogoMatching("Sandecja Nowy Sącz")).toBe(
      "sandecja nowy sacz"
    );
  });

  it("pokrywa komplet polskich znaków", () => {
    expect(normalizeTeamNameForLogoMatching("ąćęłńóśźż")).toBe("acelnoszz");
  });
});

describe("B: wielkość liter", () => {
  it("nie ma znaczenia przy dopasowaniu", () => {
    const library = [logo("GKS Katowice")];

    expect(matchTeamNameToLogos("gks katowice", library).autoSelect?.matchType).toBe(
      "exact"
    );
    expect(matchTeamNameToLogos("GKS KATOWICE", library).autoSelect?.matchType).toBe(
      "exact"
    );
  });
});

describe("C: białe znaki i separatory", () => {
  it("zwielokrotnione spacje, myślniki i podkreślenia dają ten sam wynik", () => {
    const expected = "gks katowice";

    expect(normalizeTeamNameForLogoMatching("  GKS   Katowice  ")).toBe(expected);
    expect(normalizeTeamNameForLogoMatching("GKS-Katowice")).toBe(expected);
    expect(normalizeTeamNameForLogoMatching("GKS_Katowice")).toBe(expected);
  });

  it("nazwa z końcową spacją nadal trafia dokładnie", () => {
    // W realnych danych Rabbit Cupa są takie nazwy.
    const library = [logo("LHT Lublin")];

    expect(matchTeamNameToLogos("LHT LUBLIN ", library).autoSelect).not.toBeNull();
  });
});

describe("D/E: trafienia pewne", () => {
  const library = [logo("GKS Katowice", ["GKS Katowice 2"]), logo("BS Polonia Bytom")];

  it("D: dokładna nazwa własna zaznacza się automatycznie", () => {
    const result = matchTeamNameToLogos("BS Polonia Bytom", library);

    expect(result.autoSelect?.matchType).toBe("exact");
    expect(result.autoSelect?.logo.canonicalName).toBe("BS Polonia Bytom");
  });

  it("E: dokładny alias też zaznacza się automatycznie", () => {
    const result = matchTeamNameToLogos("GKS Katowice 2", library);

    expect(result.autoSelect?.matchType).toBe("alias");
    expect(result.autoSelect?.logo.canonicalName).toBe("GKS Katowice");
  });
});

describe("F: wariant drużyny 1/2", () => {
  it("rozpoznaje końcowy numer i proponuje nazwę bazową", () => {
    expect(detectSquadVariant("GKS Katowice 1")).toEqual({
      baseName: "gks katowice",
      suffix: "1",
    });
    expect(suggestCanonicalName("UKS Zagłębie Sosnowiec 2")).toBe(
      "UKS Zagłębie Sosnowiec"
    );
  });

  it("G/H: jednoznaczna nazwa bazowa zaznacza się automatycznie", () => {
    const library = [logo("GKS Katowice")];

    for (const input of ["GKS Katowice 1", "GKS Katowice 2"]) {
      const result = matchTeamNameToLogos(input, library);

      // To NIE jest fuzzy: usunęliśmy tylko rozpoznaną cyfrę wariantu,
      // a reszta trafiła dokładnie i jednoznacznie.
      expect(result.autoSelect?.matchType).toBe("base_name");
      expect(result.autoSelect?.logo.canonicalName).toBe("GKS Katowice");
    }
  });

  it("NIE obcina cyfr, które są częścią nazwy", () => {
    // Za krótko, żeby uznać ostatni token za numer drużyny.
    expect(detectSquadVariant("Katowice 1").baseName).toBeNull();
    // Rok w nazwie klubu to nie numer drużyny.
    expect(detectSquadVariant("AH Legia Warszawa 1926").baseName).toBeNull();
    // Bez końcowej cyfry nie ma czego obcinać.
    expect(detectSquadVariant("MKS Sokoły Toruń").baseName).toBeNull();
    expect(suggestCanonicalName("MKS Sokoły Toruń")).toBe("MKS Sokoły Toruń");
  });
});

describe("G: brak automatycznego przypisania przy słabym dopasowaniu", () => {
  it("podobna, ale inna nazwa nigdy nie zaznacza się sama", () => {
    const library = [logo("GKS Katowice")];
    const result = matchTeamNameToLogos("GKS Tychy", library);

    expect(result.autoSelect).toBeNull();
  });

  it("kompletnie inna nazwa nie trafia nawet do propozycji", () => {
    const library = [logo("GKS Katowice")];
    const result = matchTeamNameToLogos("Sandecja Nowy Sącz", library);

    expect(result.autoSelect).toBeNull();
    expect(result.suggestions).toHaveLength(0);
  });

  it("fuzzy trafia do propozycji, ale zawsze poniżej pewnych", () => {
    const library = [logo("Naprzód Janów Katowice"), logo("GKS Katowice")];
    const result = matchTeamNameToLogos("Naprzód Janów", library);

    expect(result.autoSelect).toBeNull();
    expect(result.suggestions[0].logo.canonicalName).toBe("Naprzód Janów Katowice");
  });

  it("pusta biblioteka nie wymyśla dopasowań", () => {
    expect(matchTeamNameToLogos("GKS Katowice", [])).toEqual({
      autoSelect: null,
      suggestions: [],
    });
  });
});

describe("S/T: wyszukiwanie", () => {
  const library = [
    logo("GKS Katowice", ["GKS Katowice 1", "GKS Katowice 2"]),
    logo("UKH Unia Oświęcim"),
    logo("BS Polonia Bytom"),
  ];

  it("S: po nazwie własnej, bez względu na polskie znaki", () => {
    expect(searchLogos("oswiecim", library).map((item) => item.canonicalName)).toEqual([
      "UKH Unia Oświęcim",
    ]);
    expect(searchLogos("Oświęcim", library)).toHaveLength(1);
  });

  it("T: po aliasie", () => {
    const found = searchLogos("katowice 2", library);

    expect(found).toHaveLength(1);
    expect(found[0].canonicalName).toBe("GKS Katowice");
  });

  it("puste zapytanie zwraca całą bibliotekę", () => {
    expect(searchLogos("   ", library)).toHaveLength(3);
  });
});

describe("L: konwencja public_id", () => {
  it("slug jest czytelny i bez polskich znaków", () => {
    expect(slugifyLogoName("UKS Zagłębie Sosnowiec")).toBe("uks-zaglebie-sosnowiec");
    expect(slugifyLogoName("GKS Katowice")).toBe("gks-katowice");
    expect(`team-logos/${slugifyLogoName("MMKS Podhale Nowy Targ")}`).toBe(
      "team-logos/mmks-podhale-nowy-targ"
    );
  });

  it("nie wymaga sufiksu _LOGO ani wielkich liter", () => {
    expect(slugifyLogoName("BS Polonia Bytom")).not.toContain("logo");
    expect(slugifyLogoName("BS Polonia Bytom")).toBe(
      slugifyLogoName("bs   polonia_bytom")
    );
  });
});

/* ==========================================================================
 * PRZYPADKI Z RĘCZNEGO TESTU DIALOGU
 * ======================================================================== */

describe("A-D: ta sama drużyna niezależnie od zapisu", () => {
  const library = [
    logo("UKS ZAGŁĘBIE SOSNOWIEC"),
    logo("GKS KATOWICE"),
    logo("BS POLONIA BYTOM"),
  ];

  const inputs = [
    "UKS ZAGŁĘBIE SOSNOWIEC",
    "uks zagłębie sosnowiec",
    "Uks Zagłębie Sosnowiec",
    "uks zaglebie sosnowiec",
    "  UKS   Zagłębie   Sosnowiec  ",
  ];

  it.each(inputs)("%s → to samo dokładne trafienie", (input) => {
    const result = matchTeamNameToLogos(input, library);

    expect(result.autoSelect?.matchType).toBe("exact");
    expect(result.autoSelect?.logo.canonicalName).toBe("UKS ZAGŁĘBIE SOSNOWIEC");
  });
});

describe("E-J: warianty drużyn tego samego klubu", () => {
  const library = [
    logo("UKS ZAGŁĘBIE SOSNOWIEC"),
    logo("GKS Katowice"),
    logo("MOSM Tyskie Lwy"),
    logo("Naprzód Janów Katowice"),
  ];

  const cases: Array<[string, string]> = [
    ["UKS ZAGŁĘBIE SOSNOWIEC 1", "UKS ZAGŁĘBIE SOSNOWIEC"],
    ["uks zagłębie sosnowiec 2", "UKS ZAGŁĘBIE SOSNOWIEC"],
    ["GKS Katowice 1", "GKS Katowice"],
    ["GKS Katowice 2", "GKS Katowice"],
    ["MOSM Tyskie Lwy 1", "MOSM Tyskie Lwy"],
    ["Naprzód Janów Katowice 2", "Naprzód Janów Katowice"],
  ];

  it.each(cases)("%s → %s (auto)", (input, expected) => {
    const result = matchTeamNameToLogos(input, library);

    expect(result.autoSelect).not.toBeNull();
    expect(result.autoSelect?.logo.canonicalName).toBe(expected);
  });
});

describe("K-M: granice automatu", () => {
  it("K: liczba będąca częścią nazwy nie jest wariantem", () => {
    const library = [logo("AH Legia Warszawa")];
    const result = matchTeamNameToLogos("AH Legia Warszawa 1926", library);

    expect(result.autoSelect).toBeNull();
    expect(detectSquadVariant("AH Legia Warszawa 1926").baseName).toBeNull();
  });

  it("L: niejednoznaczna nazwa bazowa NIE zaznacza się automatycznie", () => {
    // Dwa assety pasujące do tej samej bazy — algorytm nie zgaduje.
    const library = [
      logo("GKS Katowice"),
      logo("Rezerwy", ["GKS Katowice"]),
    ];

    const result = matchTeamNameToLogos("GKS Katowice 1", library);

    expect(result.autoSelect).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(1);
  });

  it("M: fuzzy nigdy nie zaznacza się automatycznie", () => {
    const library = [logo("GKS Katowice"), logo("GKS Tychy")];
    const result = matchTeamNameToLogos("GKS", library);

    expect(result.autoSelect).toBeNull();
    expect(result.suggestions[0].matchType).toBe("fuzzy");
    // Niepełna nazwa pasuje do obu klubów — tym bardziej nie zgadujemy.
    expect(result.suggestions).toHaveLength(2);
  });

  it("wariant nie przebija dokładnej nazwy własnej", () => {
    const library = [logo("GKS Katowice"), logo("GKS Katowice 1")];
    const result = matchTeamNameToLogos("GKS Katowice 1", library);

    expect(result.autoSelect?.matchType).toBe("exact");
    expect(result.autoSelect?.logo.canonicalName).toBe("GKS Katowice 1");
  });
});
