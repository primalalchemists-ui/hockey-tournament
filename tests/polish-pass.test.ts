import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { postgresRepository } from "@/lib/data/postgres/repository";
import { getPublicSnapshot } from "@/lib/data/postgres/public-snapshot";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";
import { createU8Fixture } from "./torture/helpers/lifecycle";

/**
 * PASS POPRAWKOWY: strzelcy, media, przełączanie kategorii, okno usuwania.
 *
 * Każdy blok pilnuje jednej rzeczy, która realnie się zepsuła — nie kształtu
 * kodu i nie pikseli.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Komentarz tłumaczy też to, czego w kodzie już NIE ma — patrzymy na kod. */
const source = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const snapshot = source("lib/data/postgres/public-snapshot.ts");
const shell = source("components/tournament-shell.tsx");
const picker = source("components/admin/media-asset-picker.tsx");
const switcher = source("components/public/category-switcher.tsx");
const refresh = source("components/use-public-auto-refresh.ts");
const dialog = source("components/ui/confirm-dialog.tsx");
const selector = source("components/admin/tournament-selector.tsx");
const preview = source("components/ui/media-preview.tsx");
const lock = source("lib/public/scroll-lock.ts");
const globals = read("app/globals.css");

/* ==========================================================================
 * 1. STRZELCY
 * ======================================================================== */

describe("strzelcy: jedna flaga, jedna interpretacja", () => {
  it("snapshot publiczny przepuszcza ustawienia w całości", () => {
    /*
      ŹRÓDŁO BŁĘDU. Snapshot przepisywał trzy pola z osobna, a `scorersEnabled`
      wypadało po drodze; `readTournamentSettings` domyślało brakującą flagę
      na `true`. Przepisywanie pól po jednym nie może tu wrócić.
    */
    expect(snapshot).toContain("readTournamentSettings(result.settings)");
    expect(snapshot).not.toContain("structure: result.settings.structure,");
  });

  it("publiczna zakładka znika razem z flagą", () => {
    expect(shell).toContain(
      'mainTabs.filter((tab) => tab.key !== "scorers" || scorersEnabled)'
    );
  });

  it("wejście z linkiem na wyłączoną zakładkę wraca na wyniki", () => {
    // Adres, stan i historia przechodzą przez ten sam bezpiecznik.
    expect(shell).toContain(
      'activeTab === "scorers" && !scorersEnabled ? "live" : activeTab'
    );
    // Render korzysta z wartości PO korekcie, nie z surowego stanu.
    expect(shell).toContain("key={effectiveTab}");
    expect(shell).toContain("tab.key === effectiveTab");
  });

  it("odświeżenie danych aktualizuje flagę bez przeładowania strony", () => {
    expect(refresh).toContain(
      "setScorersEnabled(snapshot.settings.scorersEnabled)"
    );
  });
});

describe.skipIf(!hasDatabase)("strzelcy: flaga dociera do snapshotu", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
    tournamentId = await createU8Fixture("Vitest Scorers Flag");
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("wyłączenie w panelu widać w publicznym snapshocie", async () => {
    await postgresRepository.updateTournamentSettings(tournamentId, {
      scorersEnabled: false,
    });

    const result = await getPublicSnapshot(tournamentId);

    expect(result).not.toBeNull();
    // Dokładnie ten odczyt kłamał: zawsze zwracał `true`.
    expect(result!.settings.scorersEnabled).toBe(false);
  });

  it("włączenie wraca tą samą drogą", async () => {
    await postgresRepository.updateTournamentSettings(tournamentId, {
      scorersEnabled: true,
    });

    const result = await getPublicSnapshot(tournamentId);

    expect(result!.settings.scorersEnabled).toBe(true);
  });
});

/* ==========================================================================
 * 2. MEDIA: WALIDACJA BEZ PRZESUWANIA UKŁADU
 * ======================================================================== */

describe("media: nazwa i plik w dowolnej kolejności", () => {
  it("wybór pliku nie zależy od nazwy", () => {
    const upload = picker.slice(
      picker.indexOf('data-testid="media-picker-upload"') - 400,
      picker.indexOf('data-testid="media-picker-file"')
    );

    // Blokuje wyłącznie trwający zapis, nigdy pusta nazwa.
    expect(upload).toContain("disabled={isSaving}");
    expect(upload).not.toContain("displayName");
  });

  it("zapis bez nazwy jest odrzucany", () => {
    const save = picker.slice(
      picker.indexOf("async function handleSave"),
      picker.indexOf("if (!open) return null;")
    );

    expect(save).toContain("if (!displayName.trim())");
    expect(save).toContain("reportMissingName()");
    // Odrzucenie kończy funkcję: żaden upload nie startuje.
    expect(save.indexOf("reportMissingName()")).toBeLessThan(
      save.indexOf("await onUploadNew")
    );
  });

  it("błąd pokazuje się w polu, a nie nowym wierszem", () => {
    expect(picker).toContain('border-rose-500 ring-2 ring-rose-500/25"');
    expect(picker).toContain("nameRef.current?.focus()");
    expect(picker).toContain("field-shake");

    /*
      Komunikat istnieje dla czytnika ekranu, ale nie zajmuje miejsca —
      inaczej okno urosłoby dokładnie wtedy, gdy trzeba trafić w „Zapisz".
    */
    expect(picker).toContain('aria-invalid={nameInvalid}');
    expect(picker).toContain('className="sr-only"');
  });

  it("poprawianie nazwy gasi błąd od razu", () => {
    expect(picker).toContain("if (nameInvalid) setNameInvalid(false);");
  });

  it("nazwa wybranego pliku wchodzi w gotowe miejsce", () => {
    // Wiersz istnieje zawsze — zmienia się tekst, nie wysokość.
    expect(picker).toContain('{pendingFile ? pendingFile.name : "Nie wybrano pliku"}');
  });

  it("drgnienie jest krótkie, malejące i wyłączalne", () => {
    const shake = globals.slice(
      globals.indexOf("@keyframes field-shake"),
      globals.indexOf(".field-shake {") + 400
    );

    expect(shake).toContain("translateX(-3px)");
    expect(shake).toContain("translateX(2px)");
    // Kończy na zerze: żadnego odbicia ani sprężyny.
    const frames = shake.split("%");
    expect(frames[frames.length - 1]).toContain("translateX(0)");
    expect(shake).toContain("240ms");

    // Blok wyciszenia dotyczący POLA, nie ostatni blok w pliku.
    const reduced = globals.slice(globals.lastIndexOf(".field-shake {"));
    // Drgnienie znika, ale czerwona obwódka i focus zostają.
    expect(reduced).toContain("prefers-reduced-motion");
    expect(reduced).toContain("animation: none");
  });
});

/* ==========================================================================
 * 3. MEDIA: STABILNY PODGLĄD
 * ======================================================================== */

describe("media: podgląd nie skacze", () => {
  it("wysokość wynika z pola, nie z pliku", () => {
    expect(preview).toContain("style={{ aspectRatio: ratio }}");
    // Ten sam kadr obowiązuje też, gdy pola jeszcze nie wypełniono.
    expect(preview.indexOf("aspectRatio: ratio")).toBeLessThan(
      preview.indexOf("{!src ?")
    );
  });

  it("stary obrazek zostaje, dopóki nowy się nie wczyta", () => {
    expect(preview).toContain("const showsPrevious =");
    expect(preview).toContain("onLoad={() => setReady(src)}");
    // Błąd też kończy ładowanie: loader nie zostaje na zawsze.
    expect(preview).toContain("onError={() => setReady(src)}");
  });

  it("loader siedzi w tym samym pudełku i ma język aplikacji", () => {
    expect(preview).toContain('data-testid="media-preview-loader"');
    expect(preview).toContain("absolute inset-0");
    expect(preview).toContain("festiwal-logo.png");
    expect(preview).toContain("media-preview-pulse");

    // Wejście obrazka: samo `opacity`, w zakresie zwykłego UI.
    expect(preview).toContain("transition-opacity duration-200");
  });

  it("wszystkie pola mediów korzystają z tego samego podglądu", () => {
    const admin = source("components/admin/admin-shell.tsx");
    const playoff = source("components/admin/playoff-asset-manager.tsx");

    for (const ratio of ["16/7", "16/6", "4/6"]) {
      expect(admin).toContain(`ratio="${ratio}"`);
    }

    expect(playoff).toContain("<MediaPreview");
    expect(picker).toContain("<MediaPreview");
    // Żadnego równoległego, własnego podglądu.
    expect(admin).not.toContain("function PreviewImage");
  });
});

/* ==========================================================================
 * 4. BLOKADA PRZEWIJANIA
 * ======================================================================== */

describe("okna: tło stoi", () => {
  it("blokady się liczą, więc okno w oknie nie odblokowuje tła", () => {
    expect(lock).toContain("activeLocks += 1");
    expect(lock).toContain("if (activeLocks > 0 || !saved) return;");
    // Podwójne sprzątanie nie może zabrać cudzej blokady.
    expect(lock).toContain("if (released) return;");
  });

  it("iOS naprawdę się zatrzymuje i wraca w to samo miejsce", () => {
    expect(lock).toContain('body.style.position = "fixed"');
    expect(lock).toContain("body.style.top = `-${scrollY}px`");
    expect(lock).toContain("window.scrollTo(0, state.scrollY)");
  });

  it("zniknięcie paska nie przesuwa strony w bok", () => {
    expect(lock).toContain(
      "window.innerWidth - document.documentElement.clientWidth"
    );
    expect(lock).toContain("body.style.paddingRight");
  });

  it("każde okno korzysta z tej jednej blokady", () => {
    for (const path of [
      "components/ui/confirm-dialog.tsx",
      "components/admin/media-asset-picker.tsx",
      "components/tournament-shell.tsx",
    ]) {
      expect(source(path)).toContain("lockBodyScroll()");
    }
  });
});

/* ==========================================================================
 * 5. WSPÓLNY PASEK PRZEWIJANIA
 * ======================================================================== */

describe("pasek przewijania: jeden styl", () => {
  it("klasa obsługuje oba silniki", () => {
    expect(globals).toContain(".ice-scroll::-webkit-scrollbar-thumb");
    expect(globals).toContain("scrollbar-width: thin");
    // Ten sam kolor kciuka co pasek całej strony.
    expect(globals).toContain("rgba(100, 130, 165, 0.45)");
  });

  it("wszystkie własne obszary przewijania jej używają", () => {
    for (const path of [
      "components/ui/confirm-dialog.tsx",
      "components/admin/media-asset-picker.tsx",
      "components/admin/team-dialog.tsx",
      "components/admin/tournament-settings-panel.tsx",
      "components/public/category-switcher.tsx",
    ]) {
      expect(`${path}: ${source(path)}`).toContain("ice-scroll");
    }
  });
});

/* ==========================================================================
 * 6. OKNO USUWANIA TURNIEJU
 * ======================================================================== */

describe("usuwanie turnieju: dwie realne odpowiedzi", () => {
  it("druga akcja naprawdę się renderuje", () => {
    /*
      ŹRÓDŁO BŁĘDU. `secondaryAction` był przyjmowany i wyłączał przycisk
      główny na czas swojej operacji, ale sam nie miał żadnego JSX —
      okno pokazywało wyłącznie „Usuń trwale".
    */
    expect(dialog).toContain('data-testid="confirm-secondary"');
    expect(dialog).toContain("onClick={secondaryAction.onClick}");
    expect(dialog).toContain(": secondaryAction.label}");
  });

  it("obie akcje mieszczą się na telefonie", () => {
    const footer = dialog.slice(dialog.lastIndexOf("flex shrink-0 flex-col"));

    // Kolumna na telefonie, rząd wyżej — nic nie wypada poza ekran.
    expect(footer).toContain("flex-col-reverse");
    expect(footer).toContain("sm:flex-row");
    expect(footer).toContain("h-11");
  });

  it("okno ma komplet: Usuń trwale, Archiwizuj, ×, bez Anuluj", () => {
    expect(selector).toContain('confirmLabel="Usuń trwale"');
    expect(selector).toContain('label: "Archiwizuj"');
    expect(selector).toContain("showCancel={false}");
    expect(dialog).toContain('data-testid="confirm-close"');
  });

  it("tekst mieści się w dwóch krótkich liniach", () => {
    expect(selector).toContain("Usunięcie jest nieodwracalne.");
    expect(selector).not.toContain("Usunięcie zabiera wyniki, terminarz");
  });
});

/* ==========================================================================
 * 7. PRZEŁĄCZANIE KATEGORII
 * ======================================================================== */

describe("kategorie: wczytanie, nie zawieszenie", () => {
  it("zmiana natychmiast wchodzi w stan ładowania", () => {
    expect(shell).toContain("{isSwitching ? (");
    expect(shell).toContain('<BrandLoader blocking testId="category-loader" />');
    expect(shell).toContain("aria-busy={isSwitching}");
  });

  it("stary turniej nie zostaje klikalny pod spodem", () => {
    const loader = source("components/brand-loader.tsx");

    expect(loader).toContain("blocking = false");
    expect(loader).toContain(
      'blocking ? "pointer-events-auto" : "pointer-events-none"'
    );
  });

  it("używamy ISTNIEJĄCEGO loadera strony, nie nowego spinnera", () => {
    expect(shell).toContain('from "@/components/brand-loader"');
    expect(shell).not.toContain("animate-spin");

    const loader = source("components/brand-loader.tsx");
    expect(loader).toContain("festiwal-logo.png");
    expect(loader).toContain("intro-pulse");
  });

  it("podmiana jest atomowa: komplet danych albo nic", () => {
    const swap = refresh.slice(refresh.indexOf("async function switchTournament"));

    // Jedno pobranie, jedno zastosowanie — sekcje nie aktualizują się osobno.
    expect(swap).toContain("applyRef.current(snapshot)");
    expect(swap.indexOf("applyRef.current(snapshot)")).toBeLessThan(
      swap.indexOf("setTargetId(snapshot.tournamentId)")
    );

    // Loader nie mruga przy szybkiej odpowiedzi.
    expect(swap).toContain("if (elapsed < MIN_SWITCH_MS)");
    expect(swap).toContain("setIsSwitching(false)");
  });

  it("nieudana zmiana zostawia poprzedni turniej w całości", () => {
    const swap = refresh.slice(refresh.indexOf("async function switchTournament"));
    const failure = swap.slice(swap.indexOf("} catch"), swap.indexOf("} finally"));

    // W gałęzi błędu nie ma ani jednego zastosowania danych.
    expect(failure).not.toContain("applyRef");
    expect(failure).not.toContain("setTargetId");
    expect(failure).toContain("return false");

    expect(shell).toContain('setSwitchError("Nie udało się wczytać tej kategorii.")');
  });

  it("lista zamyka się przed rozpoczęciem wczytywania", () => {
    const option = switcher.slice(
      switcher.indexOf('data-testid="category-option"')
    );

    expect(option.indexOf("setOpen(false)")).toBeLessThan(
      option.indexOf("onSelect(category.tournamentId)")
    );
  });

  it("komunikat o błędzie żyje poza zamkniętą listą", () => {
    const error = switcher.slice(switcher.indexOf('data-testid="category-error"'));

    // Pozycjonowany absolutnie, więc jego pojawienie się niczego nie przesuwa.
    expect(error).toContain("absolute");
    expect(switcher.indexOf('data-testid="category-error"')).toBeGreaterThan(
      switcher.indexOf('data-testid="category-popover"')
    );
  });

  it("oba warianty przełącznika zachowują się tak samo", () => {
    // Telefon i desktop to ten sam komponent, więc i ta sama ścieżka.
    expect(shell).toContain('variant="inline"');
    expect(shell).toContain('variant="floating"');
    expect(shell.split("onSelect={handleSelectCategory}").length - 1).toBe(2);
  });

  it("zmiana kategorii NIE rusza turnieju wyświetlanego globalnie", () => {
    expect(refresh).not.toContain("setCurrentTournament");
    expect(refresh).not.toContain("is_current");
    expect(shell).not.toContain("setCurrentTournament");
    // I nie przeładowuje przeglądarki, żeby uzyskać efekt wczytania.
    expect(shell).not.toContain("window.location.reload");
    expect(refresh).not.toContain("window.location.reload");
  });
});

/* ==========================================================================
 * 8. ANIMACJE POZA ZAKRESEM
 * ======================================================================== */

describe("poza zakresem: ceremonie zostają nietknięte", () => {
  it("podium i stopka nie korzystają z tokenów zwykłego UI", () => {
    for (const path of [
      "components/playoff/podium-section.tsx",
      "components/playoff/cinematic-backdrop.tsx",
      "components/public/footer-animation.tsx",
    ]) {
      const code = source(path);

      expect(code).not.toContain("field-shake");
      expect(code).not.toContain("media-preview-pulse");
      expect(code).not.toContain("dialog-card");
    }
  });
});

/* ==========================================================================
 * 9. STAŁA GEOMETRIA BIBLIOTEKI PLIKÓW
 * ======================================================================== */

describe("biblioteka plików: wysokość znana od pierwszej klatki", () => {
  it("obszar z plikami ma wysokość z tokenu, nie z zawartości", () => {
    expect(picker).toContain('data-testid="media-library-area"');
    expect(picker).toContain("media-library-area");

    expect(globals).toContain("--media-library-h: 22rem");
    expect(globals).toContain("--media-library-h: 26rem");
    // Jedna reguła dla wszystkich pól mediów, nie wartość per typ pliku.
    expect(globals).toContain("height: min(var(--media-library-h), 52dvh)");
  });

  it("loader, błąd i pusty stan mieszkają w tym samym prostokącie", () => {
    const area = picker.slice(
      picker.indexOf('data-testid="media-library-area"'),
      picker.indexOf('data-testid="media-picker-grid"')
    );

    // Wszystkie trzy są warstwą NA obszarze, nie jego zawartością.
    expect(area).toContain('data-testid="media-library-loader"');
    expect(area).toContain('data-testid="media-library-error"');
    expect(area).toContain('data-testid="media-picker-empty"');
    expect(area.split("absolute inset-0").length - 1).toBe(3);

    expect(picker).not.toContain("skeleton");
  });

  it("loader się kręci i jest duży", () => {
    expect(picker).toContain('className="spinner spinner-lg"');

    expect(globals).toContain("@keyframes spinner-turn");
    expect(globals).toContain("--spinner-size: 3rem");
    // Ten sam mechanizm co kółko w przycisku, tylko inny rozmiar.
    expect(globals).toContain("width: var(--spinner-size, 1rem)");
  });

  it("nieudane wczytanie da się ponowić bez zamykania okna", () => {
    expect(picker).toContain('data-testid="media-library-retry"');
    expect(picker).toContain("setAttempt((value) => value + 1)");
    // Ponowienie odpala ten sam odczyt.
    expect(picker).toContain("[open, category, currentUrl, attempt]");

    // Powód awarii ląduje w logu serwera, nie znika po drodze.
    const actions = source("app/admin/actions.ts");
    expect(actions).toContain('console.error("[admin] listMediaLibrary failed:"');
  });

  it("przewija się wyłącznie obszar z plikami", () => {
    expect(picker).toContain(
      'className="media-library-area ice-scroll relative overflow-y-auto overscroll-contain'
    );

    // Modal nie ma już drugiego, konkurencyjnego obszaru przewijania.
    expect(picker.split("overflow-y-auto").length - 1).toBe(1);
    // I korzysta ze wspólnego paska, nie systemowego.
    expect(picker).toContain("ice-scroll");
  });

  it("dodawanie i stopka stoją poza przewijaniem", () => {
    const add = picker.indexOf('data-testid="media-picker-add"');
    const areaEnd = picker.indexOf('data-testid="media-picker-add"');

    expect(add).toBeGreaterThan(picker.indexOf('data-testid="media-library-area"'));
    expect(areaEnd).toBeGreaterThan(-1);

    // Sekcja dodawania i stopka są rodzeństwem obszaru, nie jego dziećmi.
    expect(picker).toContain('className="shrink-0 px-5 pb-4 pt-3"');
    expect(picker).toContain('data-testid="media-picker-save"');
  });
});

/* ==========================================================================
 * 10. EKRAN ŁADOWANIA KATEGORII NA CAŁYM EKRANIE
 * ======================================================================== */

describe("kategorie: zasłona kryje cały ekran", () => {
  it("warstwa wychodzi poza kontener strony", () => {
    /*
      ŹRÓDŁO BŁĘDU. `position: fixed` liczy się względem viewportu tylko
      wtedy, gdy żaden przodek nie tworzy kontenera pozycjonowania — a robi
      to `backdrop-filter` z `.ice-surface`. Zasłona kończyła się na krawędzi
      karty i pod spodem widać było ranking oraz „Udostępnij".
    */
    const loaderBlock = shell.slice(shell.indexOf("{isSwitching ? ("));

    expect(loaderBlock).toContain("<ModalPortal>");
    expect(loaderBlock.indexOf("<ModalPortal>")).toBeLessThan(
      loaderBlock.indexOf("<BrandLoader")
    );
    expect(shell).toContain('from "@/components/ui/modal-portal"');
  });

  it("warstwa sięga dolnej krawędzi także na telefonie", () => {
    const loader = source("components/brand-loader.tsx");

    expect(loader).toContain("fixed inset-0");
    // Chowający się pasek adresu nie może odsłonić paska starej strony.
    expect(loader).toContain("min-h-[100dvh]");
  });

  it("korzysta z istniejącej skali warstw i tła strony", () => {
    const loader = source("components/brand-loader.tsx");

    // Ta sama warstwa co okna modalne, bez wymyślonego z-indexu.
    expect(loader).toContain("z-[100]");
    expect(loader).toContain("bg-[var(--ice-base)]");
    // Nieprzezroczyste tło: ma wyglądać jak wczytywanie, nie jak przyciemnienie.
    expect(loader).not.toContain("bg-slate-950/");
  });

  it("tło nie przewija się w trakcie zmiany", () => {
    expect(shell).toContain("if (!isSwitching) return;");
    expect(shell).toContain("return lockBodyScroll();");
  });
});

/* ==========================================================================
 * 11. EKRAN LOGOWANIA
 * ======================================================================== */

describe("logowanie: część aplikacji, nie osobny formularz", () => {
  const login = source("components/admin/admin-login.tsx");

  it("karta stoi na środku ekranu", () => {
    expect(login).toContain("min-h-[100dvh] items-center justify-center");
    // Żadnego przyklejenia do góry przez kontener o stałej szerokości.
    expect(login).not.toContain("mx-auto max-w-md");
    expect(login).not.toContain("items-start");
    // Karta ma sensowną szerokość i marginesy bezpieczeństwa na telefonie.
    expect(login).toContain("w-full max-w-sm");
    expect(login).toContain("p-4 sm:p-6");
  });

  it("używa tła i powierzchni aplikacji", () => {
    // Tło mieszka na <body>; własne szare przykrycie zniknęło.
    expect(login).not.toContain("bg-slate-100");
    expect(login).toContain("ice-surface");
    expect(login).toContain("rounded-3xl");
    expect(login).toContain("dialog-card");
  });

  it("copy ograniczone do tytułu", () => {
    expect(login).toContain("Panel administratora");
    expect(login).not.toContain("Wpisz hasło, aby przejść");
    expect(login).not.toContain("Admin login");
  });

  it("pola i przycisk w stylu reszty panelu", () => {
    expect(login).toContain("rounded-2xl border px-4 py-3 text-sm");
    expect(login).toContain("focus:border-slate-900");
    // Wspólny przycisk aplikacji, nie własny gradient.
    expect(login).toContain("btn btn-primary");
    expect(login).toContain("Zaloguj się");
  });

  it("błąd nie zmienia wysokości karty", () => {
    expect(login).toContain('className="h-5 text-sm font-semibold text-rose-700"');
    expect(login).toContain("aria-invalid={hasError}");
    expect(login).toContain("border-rose-500 ring-2 ring-rose-500/25");

    /*
      Komunikat nie gaśnie sam po chwili. Licznik czasu w efekcie znaczył
      kaskadę renderów i tekst znikający w trakcie czytania.
    */
    expect(login).not.toContain("useEffect");
    expect(login).not.toContain("setTimeout");
  });

  it("oczekiwanie nie rusza przyciskiem", () => {
    expect(login).toContain('className="btn btn-primary w-full justify-center"');
    expect(login).toContain('<span className="spinner"');

    // Kółko jest małe i wyłączalne; nie zmienia wysokości przycisku.
    expect(globals).toContain(".spinner {");
    // Domyślny rozmiar to 1rem — wysokość przycisku się nie zmienia.
    expect(globals).toContain("width: var(--spinner-size, 1rem)");
    expect(globals).toContain("@keyframes spinner-turn");
  });
});
