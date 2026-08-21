import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { getDb } from "@/lib/db/client";
import { tournamentAssets } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  MEDIA_CATEGORIES,
  acceptsMimeType,
  previewVariantFor,
} from "@/lib/media/categories";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";
import { createU8Fixture } from "./torture/helpers/lifecycle";

/**
 * WSPÓLNY WYBÓR PLIKU.
 *
 * Jeden mechanizm dla wszystkich mediów w panelu. Testy pilnują tego, co
 * naprawdę psuje tę funkcję: filtrowania po rodzaju pola, braku ponownego
 * uploadu i tego, żeby żadne pole nie zostało przy starym wzorcu.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const picker = source("components/admin/media-asset-picker.tsx");
const shell = source("components/admin/admin-shell.tsx");
const playoff = source("components/admin/playoff-asset-manager.tsx");

describe("1-3: filtrowanie po rodzaju pola", () => {
  it("1 — każda kategoria ma własną pulę rodzajów", () => {
    expect(MEDIA_CATEGORIES.hero_banner.kinds).toEqual(["hero_banner"]);
    expect(MEDIA_CATEGORIES.camp_banner.kinds).toEqual(["camp_banner"]);
    // Lewy i prawy plakat dzielą jedną pulę.
    expect(MEDIA_CATEGORIES.camp_poster.kinds).toEqual([
      "camp_poster_left",
      "camp_poster_right",
    ]);
    // Tła drabinki i podium też.
    expect(MEDIA_CATEGORIES.background.kinds).toEqual([
      "playoff_bracket_background",
      "podium_background",
    ]);

    // Żadna kategoria nie jest śmietnikiem na wszystko.
    const everything = Object.values(MEDIA_CATEGORIES).flatMap(
      (definition) => definition.kinds
    );
    expect(new Set(everything).size).toBe(everything.length);
  });

  it("2 — pole obrazkowe odrzuca dokumenty", () => {
    for (const category of [
      "hero_banner",
      "camp_banner",
      "camp_poster",
      "background",
    ] as const) {
      expect(acceptsMimeType(category, "application/pdf")).toBe(false);
      expect(acceptsMimeType(category, "image/jpeg")).toBe(true);
      expect(MEDIA_CATEGORIES[category].accept).toBe("image/*");
    }
  });

  it("3 — harmonogram i regulamin przyjmują dokument oraz obraz", () => {
    for (const category of ["schedule", "regulation"] as const) {
      expect(acceptsMimeType(category, "application/pdf")).toBe(true);
      expect(acceptsMimeType(category, "image/jpeg")).toBe(true);
      expect(MEDIA_CATEGORIES[category].accept).toBe("application/pdf,image/*");
    }
  });

  it("podgląd odpowiada rodzajowi pliku, nie tylko pola", () => {
    // PDF nigdy nie jest miniaturką, nawet w polu mieszanym.
    expect(previewVariantFor("schedule", "application/pdf")).toBe("document");
    expect(previewVariantFor("schedule", "image/jpeg")).toBe("image");
    expect(previewVariantFor("camp_banner", "image/png")).toBe("image");
  });
});

describe("4-9: zachowanie pickera", () => {
  it("4/5 — wybór istniejącego pliku reuse referencji, bez uploadu", () => {
    /*
      Gdyby wybór dotykał uploadu, znaczyłoby to pobranie i ponowne wysłanie
      tego samego pliku — dokładnie to, czego ta funkcja ma unikać.
    */
    expect(picker).toContain("onSave(chosen)");
    expect(picker).not.toContain("uploadFileToCloudinary");

    const apply = shell.slice(
      shell.indexOf("function applyLibraryAsset"),
      shell.indexOf("async function handleUploadCampBanner")
    );

    expect(apply).toContain("MEDIA_FIELDS[field].assign");
    expect(apply).not.toContain("upload");
    // Przypisanie nie kasuje pliku, który może być używany gdzie indziej.
    expect(apply).not.toContain("queueDelete");
  });

  it("6/7 — dodanie nowego pliku od razu go przypisuje", () => {
    expect(picker).toContain('data-testid="media-picker-upload"');
    expect(picker).toContain("await onUploadNew(pendingFile, displayName.trim())");

    /*
      Po udanym wgraniu okno się zamyka, bo plik jest już przypisany do
      pola — nikt nie musi klikać go po raz drugi.
    */
    const upload = picker.slice(picker.indexOf("async function handleSave"));
    expect(upload).toContain("onCancel();");

    // Każde pole podaje swoją istniejącą ścieżkę uploadu.
    expect(shell).toContain("const MEDIA_UPLOADERS");
    expect(shell).toContain("schedule: handleUploadSchedule");
    expect(shell).toContain("camp_poster_right: handleUploadCampPosterRight");
    expect(playoff).toContain("onUploadNew={handleFile}");
  });

  it("8 — aktualnie przypisany plik startuje jako wybrany", () => {
    expect(picker).toContain("setSelectedUrl(currentUrl ?? null)");
    expect(picker).toContain('data-selected={isSelected ? "true" : "false"}');
    expect(picker).toContain("aria-pressed={isSelected}");
  });

  it("9 — wybór jest pojedynczy: jedno zaznaczenie naraz", () => {
    // Brak koszyka zaznaczeń — jeden adres, jeden plik.
    expect(picker).toContain("const [selectedUrl, setSelectedUrl]");
    expect(picker).not.toContain("limit");
    expect(shell).toContain("setMediaField(null)");
  });

  it("10 — lista przewija się wewnątrz okna", () => {
    expect(picker).toContain("max-h-[88dvh]");
    expect(picker).toContain("overflow-y-auto");
    // Siatka responsywna: 2 kolumny na telefonie, więcej wyżej.
    expect(picker).toContain("grid-cols-2");
    expect(picker).toContain("sm:grid-cols-3");
    expect(picker).toContain("lg:grid-cols-4");
  });

  it("pusta biblioteka nie zmienia wysokości okna", () => {
    expect(picker).toContain('data-testid="media-picker-empty"');
    expect(picker).toContain("Brak zapisanych plików");
    // Pusty stan leży NA obszarze o stałej wysokości, więc go nie zwija.
    expect(picker).toContain("media-library-area");
  });

  it("okno korzysta z systemu panelu, nie z natywnego dialogu", () => {
    expect(picker).toContain("ModalPortal");
    expect(picker).not.toContain("window.confirm");
    expect(picker).not.toContain("alert(");
  });
});

describe("11-12: migracja wszystkich pól", () => {
  it("12 — zniknal osobny przycisk wyboru z biblioteki", () => {
    for (const file of [shell, playoff]) {
      expect(file).not.toContain("Wybierz z biblioteki");
      expect(file).not.toContain("camp-banner-library");
      expect(file).not.toContain("camp-posters-library");
    }
  });

  it("12 — wszystkie pola panelu otwierają wspólny picker", () => {
    // Sześć pól w panelu głównym...
    for (const field of [
      "schedule",
      "regulation",
      "hero_banner",
      "camp_banner",
      "camp_poster_left",
      "camp_poster_right",
    ]) {
      expect(shell).toContain(`setMediaField("${field}")`);
      expect(shell).toContain(`  ${field}: {`);
    }

    expect(shell).toContain("<MediaAssetPicker");
    // ...i dwa tła play-off.
    expect(playoff).toContain("<MediaAssetPicker");
    expect(playoff).toContain('category="background"');
  });

  it("12 — żadne pole nie trzyma już własnego ukrytego inputu", () => {
    // Upload żyje wyłącznie w pickerze.
    expect(shell).not.toContain("InputRef");
    expect(playoff).not.toContain("inputRef");
    expect(picker).toContain('type="file"');
  });

  it("11 — usuniecie odpina plik od pola, nie kasuje z biblioteki", () => {
    expect(shell).toContain("handleRemoveCampBannerFile");
    expect(shell).toContain("handleRemoveScheduleFile");

    const remove = shell.slice(
      shell.indexOf("function handleRemoveCampBannerFile"),
      shell.indexOf("function handleRemoveCampPosterLeftFile")
    );

    // Czyści referencję w draftcie — nic globalnego.
    expect(remove).toContain('prev.assets.campBannerImage = ""');
  });
});

describe.skipIf(!hasDatabase)("biblioteka — źródło danych", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  const BANNER = {
    url: "https://res.cloudinary.com/demo/image/upload/vitest-camp-banner.jpg",
    publicId: "tournaments/vitest-camp-banner",
  };

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
    tournamentId = await createU8Fixture("Vitest Media Library");

    await getDb()
      .insert(tournamentAssets)
      .values([
        {
          tournamentId,
          kind: "camp_banner",
          url: BANNER.url,
          publicId: BANNER.publicId,
          fileName: "banner.jpg",
          mimeType: "image/jpeg",
        },
        {
          tournamentId,
          kind: "regulation",
          url: "https://res.cloudinary.com/demo/raw/upload/vitest-rules.pdf",
          publicId: "tournaments/vitest-rules",
          fileName: "regulamin.pdf",
          mimeType: "application/pdf",
        },
      ]);
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("4 — zwraca ten sam adres i publicId co wgrany plik", async () => {
    const library = await postgresRepository.listMediaLibrary("camp_banner");
    const entry = library.find((item) => item.url === BANNER.url);

    expect(entry).toBeDefined();
    expect(entry!.publicId).toBe(BANNER.publicId);
    expect(entry!.mimeType).toBe("image/jpeg");
  });

  it("2 — pula banera nie zawiera dokumentu regulaminu", async () => {
    const library = await postgresRepository.listMediaLibrary("camp_banner");

    expect(
      library.some((item) => item.mimeType === "application/pdf")
    ).toBe(false);
  });

  it("3 — pula regulaminu nie zawiera grafiki banera", async () => {
    const library = await postgresRepository.listMediaLibrary("regulation");

    expect(library.some((item) => item.url === BANNER.url)).toBe(false);
    expect(
      library.some((item) => item.publicId === "tournaments/vitest-rules")
    ).toBe(true);
  });

  it("ta sama grafika w dwóch turniejach pojawia się raz", async () => {
    const second = await createU8Fixture("Vitest Media Dup");

    await getDb().insert(tournamentAssets).values({
      tournamentId: second,
      kind: "camp_banner",
      url: BANNER.url,
      publicId: BANNER.publicId,
      fileName: "banner.jpg",
      mimeType: "image/jpeg",
    });

    const library = await postgresRepository.listMediaLibrary("camp_banner");

    expect(
      library.filter((item) => item.publicId === BANNER.publicId)
    ).toHaveLength(1);
  });

  it("plakaty widzą oba sloty jako jedną pulę", async () => {
    const third = await createU8Fixture("Vitest Media Posters");

    await getDb()
      .insert(tournamentAssets)
      .values([
        {
          tournamentId: third,
          kind: "camp_poster_left",
          url: "https://res.cloudinary.com/demo/image/upload/vitest-left.jpg",
          publicId: "tournaments/vitest-left",
          fileName: "lewy.jpg",
          mimeType: "image/jpeg",
        },
        {
          tournamentId: third,
          kind: "camp_poster_right",
          url: "https://res.cloudinary.com/demo/image/upload/vitest-right.jpg",
          publicId: "tournaments/vitest-right",
          fileName: "prawy.jpg",
          mimeType: "image/jpeg",
        },
      ]);

    const library = await postgresRepository.listMediaLibrary("camp_poster");
    const ids = library.map((item) => item.publicId);

    expect(ids).toContain("tournaments/vitest-left");
    expect(ids).toContain("tournaments/vitest-right");
  });
});

/**
 * UX PICKERA — wybór zatwierdzany, nie natychmiastowy.
 *
 * Kliknięcie karty tylko zaznacza. Podmiana grafiki na stronie turnieju to
 * skutek „Zapisz", nie skutek trafienia palcem w kafelek podczas przewijania.
 */
describe("picker: zapis, anulowanie i nazwa", () => {
  it("stopka to Zapisz i Anuluj, w tej kolejności, od lewej", () => {
    const footer = picker.slice(picker.lastIndexOf('data-testid="media-picker-save"'));

    // Kolejność liczona po samych przyciskach, nie po komentarzu nad nimi.
    expect(footer.indexOf('data-testid="media-picker-cancel"')).toBeGreaterThan(
      0
    );

    // Bez `justify-end` i bez `ml-auto` — przyciski zaczynają od lewej.
    expect(footer).not.toContain("justify-end");
    expect(footer).not.toContain("ml-auto");
  });

  it("w stopce nie ma już przycisku Zamknij", () => {
    expect(picker).not.toContain('confirmLabel="Zamknij"');
    // „×" w rogu ma etykietę dla czytnika, ale nie jest przyciskiem stopki.
    expect(picker).toContain('aria-label="Zamknij"');
  });

  it("Zapisz jest nieaktywny, dopóki nie ma czego zapisać", () => {
    /*
      Dwie drogi, dwa warunki kompletu: albo wskazany INNY plik z biblioteki,
      albo odłożony plik do wgrania.
    */
    expect(picker).toContain("? pendingFile !== null");
    expect(picker).toContain(
      ": Boolean(selected) && selected?.url !== currentUrl"
    );
    expect(picker).toContain("disabled={!canSave || isSaving}");
  });

  it("anulowanie i Escape porzucają niezapisany wybór", () => {
    expect(picker).toContain('data-testid="media-picker-cancel"');
    // Ani jedna, ani druga droga nie woła `onSave`.
    const escape = picker.slice(
      picker.indexOf('event.key === "Escape"'),
      picker.indexOf('event.key !== "Tab"')
    );
    expect(escape).toContain("onCancel()");
    expect(escape).not.toContain("onSave");
  });

  it("nowy plik wymaga nazwy", () => {
    expect(picker).toContain('data-testid="media-picker-name"');

    /*
      Walidacja siedzi w zapisie, nie w wyborze pliku. Kolejność jest
      dowolna: można wpisać nazwę i wskazać plik albo odwrotnie.
    */
    const save = picker.slice(
      picker.indexOf("async function handleSave"),
      picker.indexOf("if (!open) return null;")
    );
    expect(save).toContain("if (!displayName.trim())");
    expect(save).toContain("reportMissingName()");
  });

  it("podana nazwa trafia do pola nazwy assetu, nie nazwa z Cloudinary", () => {
    // Wszystkie sześć pól panelu zapisuje nazwę od administratora...
    for (const field of [
      "scheduleImageName",
      "regulationImageName",
      "heroBannerImageName",
      "campBannerImageName",
      "campPosterLeftName",
      "campPosterRightName",
    ]) {
      expect(shell).toContain(`prev.assets.${field} = displayName || uploaded.name;`);
    }

    // ...i tak samo tła play-off.
    expect(playoff).toContain("fileName: displayName || json.name");
  });

  it("stare pliki bez nazwy nadal da się rozpoznać", () => {
    // Zamiast pustego kafelka: nazwa pliku, a w ostateczności etykieta.
    expect(picker).toContain('{asset.fileName || "Bez nazwy"}');
  });

  it("etykieta dodawania ma rodzaj gramatyczny z konfiguracji", () => {
    expect(picker).toContain("{definition.addNewLabel}");
    // Komponent nie skleja tekstu sam.
    expect(picker).not.toContain('"Dodaj now');

    expect(MEDIA_CATEGORIES.background.addNewLabel).toBe("Dodaj nowe");
    expect(MEDIA_CATEGORIES.hero_banner.addNewLabel).toBe("Dodaj nowy");

    for (const definition of Object.values(MEDIA_CATEGORIES)) {
      expect(definition.addNewLabel.length).toBeGreaterThan(0);
    }
  });
});
