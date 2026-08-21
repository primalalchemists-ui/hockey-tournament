# SUN CUP U8 / U10 — FINAL TORTURE TEST MATRIX

Status dokumentu: **SPECYFIKACJA / KONTRAKT**. Zero zmian w kodzie produkcyjnym,
zero nowych testów, zero mutacji bazy. Dokument ma być na tyle precyzyjny, żeby
w kolejnym kroku dało się powiedzieć „zamień każdy READY scenario na test" bez
ponownego wymyślania oczekiwanego zachowania.

Wersja kodu, na której powstał audyt: stan po przebudowie małej tabeli
(`lib/standings.ts`) i po dodaniu resolvera minigrupy (`lib/playoff/placement.ts`).

---

## 0. POTWIERDZENIE ZASAD W KODZIE

Wszystkie poniższe reguły zostały **odczytane z implementacji**, nie z pamięci.

### 0.1 Normalna grupa — remis DOKŁADNIE 2 drużyn

`lib/standings.ts` → `resolveTwoTeamTie()`

| # | Kryterium | Miejsce w kodzie |
|---|---|---|
| 1 | punkty (koszyk) | `groupsByPoints` w `calculateStandings` |
| 2 | mecz bezpośredni | `getDirectMatchResult()` |
| 3 | overall goal difference | `compareOverall()` |
| 4 | overall goals for | `compareOverall()` |
| 5 | overall goals against (mniej = wyżej) | `compareOverall()` |
| 6 | nadal równe → `isTieUnresolved = true` | grupowanie po `getTieSignature()` |

`sourceOrder` jest ostatnim krokiem `compareOverall()` i **nie wchodzi** do
`getTieSignature()`, więc nie gasi flagi. ✅ ZGODNE.

### 0.2 Normalna grupa — remis 3+ drużyn

`lib/standings.ts` → `resolveMultiTeamTie()`

| # | Kryterium | Miejsce w kodzie |
|---|---|---|
| 1 | punkty (koszyk) | `groupsByPoints` |
| 2 | goal difference MAŁEJ TABELI | `buildHeadToHeadMiniTable()` |
| 3 | overall goals for | komparator w `resolveMultiTeamTie` |
| 4 | overall goals against (mniej = wyżej) | jw. |
| 5 | nadal równe → `isTieUnresolved = true` | grupowanie po `${miniGD}\|${GF}\|${GA}` |

Mecz bezpośredni **nie występuje** w tej gałęzi na żadnym etapie. Mała tabela
liczona jest RAZ, dla pierwotnego koszyka punktowego. ✅ ZGODNE.

### 0.3 Rzuty karne — workflow operacyjny

`lib/playoff/rules.ts` → `validateDecisiveScore()`, komentarz w kodzie:

> „Nie przechowujemy osobnego wyniku rzutów karnych — do systemu trafia wynik
> już rozstrzygnięty (1:1 po czasie + karne => admin wpisuje 2:1)."

To jest **świadomie przyjęty workflow**, nie brakująca reguła. W fazie grupowej
remis jest legalny (`validateGroupScore`), a rozstrzygnięcie karnymi admin wpisuje
jako finalny wynik nieremisowy. ✅ ZGODNE.

### 0.4 Placement U8 5–7

`lib/playoff/placement.ts` → `resolvePlacementStandings()`

1. normalne `calculateStandings()` minigrupy,
2. jeśli `isTieUnresolved` → frozen group-stage `goalDifference` (większy = wyżej),
3. jeśli nadal równe → frozen group-stage `position` (mniejsza = wyżej),
4. brak kompletu danych frozen → blok zostaje nierozstrzygnięty,
   `unresolvedTeamIds` niepuste, klasyfikacja `complete: false`.

Nigdy `sourceOrder`, kolejność rejestracji, alfabet ani losowość. ✅ ZGODNE.

### 0.5 Formaty

| | U10 | U8 |
|---|---|---|
| grupy | 2 × 10 drużyn | 2 × 7 drużyn |
| round robin / grupa | 45 | 21 |
| mecze grupowe łącznie | 90 | 42 |
| play-off | brak | 4 SF-slot (2 mecze × 2 grupy), final, 3. miejsce |
| minigrupa | brak | 5–7, 3 mecze × 2 grupy |
| planowane łącznie | 90 | 56 |

Liczba planowanych liczona z konfiguracji przez
`lib/playoff/planned-matches.ts` → `plannedMatchesForScope()`, nie z `matches.length`.
✅ ZGODNE.

---

## 1. GLOBALNE INVARIANTY

Do sprawdzenia w KAŻDYM scenariuszu, w którym mają sens.

### 1.1 Arytmetyka (uniwersalne)

| ID | Invariant |
|---|---|
| INV-01 | `played === wins + draws + losses` |
| INV-02 | `goalDifference === goalsFor - goalsAgainst` |
| INV-03 | `points === 3 * wins + draws` |
| INV-04 | Dla zamkniętego zestawu meczów: `Σ goalsFor === Σ goalsAgainst` |
| INV-05 | Jeden wynik wpływa dokładnie na 2 drużyny |
| INV-06 | `Σ played` po wszystkich drużynach `=== 2 × liczba rozegranych meczów` |
| INV-07 | Pozycje w tabeli to ciągły ciąg `1..n`, bez dziur i powtórzeń |
| INV-08 | `calculateStandings` nie mutuje wejścia |
| INV-09 | Mecz wskazujący na nieistniejącą drużynę jest pomijany, nie wywala |

### 1.2 Round robin

| ID | Invariant |
|---|---|
| INV-10 | Każda para drużyn występuje dokładnie raz |
| INV-11 | Brak duplikatów meczów (ta sama para dwa razy) |
| INV-12 | Brak meczu drużyny z samą sobą |
| INV-13 | `roundRobinMatchCount(n) === n(n-1)/2` |

### 1.3 U10 (liga)

| ID | Invariant |
|---|---|
| INV-14 | 45 meczów na grupę, 90 łącznie |
| INV-15 | 10 wierszy w tabeli każdej grupy |
| INV-16 | Zero stanu pucharowego: brak bracket, rounds, snapshot, placement |
| INV-17 | `plannedMatchCount === 90` |
| INV-18 | Remis jest legalnym wynikiem |

### 1.4 U8 (grupa + play-off)

| ID | Invariant |
|---|---|
| INV-19 | 21 meczów grupowych na grupę, 42 łącznie |
| INV-20 | `plannedMatchCount === 56` |
| INV-21 | 7 wierszy snapshotu na grupę |
| INV-22 | Seedy 1–4 występują dokładnie raz w drabince |
| INV-23 | Drużyny minigrupy = dokładnie seedy 5–7 |
| INV-24 | Żadna drużyna nie jest jednocześnie w top-4 i w minigrupie |
| INV-25 | Zwycięzca finału = 1, przegrany = 2 |
| INV-26 | Zwycięzca meczu o 3. miejsce = 3, przegrany = 4 |
| INV-27 | Minigrupa obsadza miejsca 5–7 |
| INV-28 | Każda drużyna dokładnie raz w klasyfikacji końcowej |
| INV-29 | Brak duplikatów `teamId` w klasyfikacji |
| INV-30 | Brak uczestnika z innej grupy w drabince/minigrupie |
| INV-31 | `sourceOrder` nigdy nie wyznacza oficjalnego, rozstrzygniętego miejsca |
| INV-32 | Klasyfikacja identyczna w minitabeli, podium i Rankingu |
| INV-33 | Mecze play-off nie trafiają do `calculateStandings` fazy grupowej |
| INV-34 | Remis niedozwolony w drabince i w minigrupie |
| INV-35 | Snapshot nie zmienia się po żadnym meczu play-off |
| INV-36 | Rozstawienie pochodzi WYŁĄCZNIE ze snapshotu, nie z bieżących statystyk |
| INV-37 | Statystyki agregują grupę + drabinkę + 3. miejsce + minigrupę |
| INV-38 | Miejsce w klasyfikacji jest niezależne od dorobku punktowego |

**Razem: 38 invariantów.**

---

## 2. U10 — SCENARIUSZE

### U10-A — POSTĘP I STAN POCZĄTKOWY

#### U10-A01 — Grupa bez ani jednego wyniku
**Purpose:** stan zerowy nie wywraca tabeli.
**Preconditions:** U10, grupa A, 10 drużyn, 0 wyników.
**Action:** `calculateStandings(group)`.
**Expected:** 10 wierszy, wszystkie wartości 0, kolejność wg `sourceOrder`, pozycje 1..10, `isTieUnresolved` = false (grupa niekompletna → brak `tieNote`).
**Assertions:** INV-01..03, INV-07, `played === 0`, `tieNote === undefined`.
**Layer:** UNIT · **Status:** READY

#### U10-A02 — Jeden wynik z 45
**Purpose:** pierwszy mecz rusza statystyki dokładnie dwóch drużyn.
**Input:** 1 mecz 3:1.
**Expected:** 2 drużyny z `played=1`, 8 z `played=0`. Zwycięzca 3 pkt, przegrany 0.
**Assertions:** INV-05, INV-06, `Σ played === 2`.
**Layer:** UNIT · **Status:** READY

#### U10-A03 — Postęp częściowy (np. 23/45)
**Purpose:** tabela jest deterministyczna przed kompletem.
**Expected:** dwukrotne wywołanie daje identyczny wynik; brak `tieNote` mimo remisów.
**Assertions:** determinizm, `tieNote === undefined`.
**Layer:** UNIT · **Status:** READY

#### U10-A04 — 44/45 (komplet minus jeden)
**Purpose:** granica kompletności.
**Expected:** grupa nadal traktowana jako niekompletna → `tieNote` pusty nawet przy pełnym remisie.
**Layer:** UNIT · **Status:** READY

#### U10-A05 — 45/45 komplet
**Purpose:** komplet włącza komunikat o karnych.
**Expected:** przy nierozstrzygniętym remisie `tieNote` zawiera „rzuty karne".
**Assertions:** INV-13, `isGroupComplete === true`.
**Layer:** UNIT · **Status:** READY

#### U10-A06 — Postęp globalny 0 / częściowy / 90
**Purpose:** licznik meczów całego turnieju.
**Expected:** `plannedMatchCount === 90` niezależnie od liczby rozegranych; `playedMatchCount` rośnie tylko z kompletnymi wynikami.
**Assertions:** INV-14, INV-17.
**Layer:** INTEGRATION · **Status:** READY

### U10-B — KLASY WYNIKÓW

#### U10-B01 — Zwycięstwo / porażka
**Expected:** 3 pkt / 0 pkt, `wins`/`losses` +1.
**Layer:** UNIT · **Status:** READY

#### U10-B02 — Remis niezerowy (2:2)
**Expected:** po 1 pkt, `draws` +1, GD bez zmian.
**Layer:** UNIT · **Status:** READY

#### U10-B03 — Remis bezbramkowy (0:0)
**Purpose:** 0:0 to poprawny wynik, nie „brak wyniku".
**Expected:** `played` +1 u obu, po 1 pkt, GF/GA +0.
**Assertions:** mecz LICZY SIĘ do kompletności grupy.
**Layer:** UNIT · **Status:** READY

#### U10-B04 — Czyste konto (3:0)
**Expected:** `goalsAgainst` zwycięzcy bez zmian.
**Layer:** UNIT · **Status:** READY

#### U10-B05 — Wysoki wynik (20:0)
**Purpose:** brak limitu bramek, brak przepełnienia.
**Expected:** GD +20 / −20, INV-04 zachowany.
**Layer:** UNIT · **Status:** READY

#### U10-B06 — Wynik połowiczny odrzucony
**Purpose:** `validateGroupScore`.
**Input:** `home = 3`, `away = null`.
**Expected:** `{ ok: false }`, komunikat o obu drużynach.
**Layer:** UNIT · **Status:** READY

#### U10-B07 — Wynik ujemny / niecałkowity odrzucony
**Expected:** `{ ok: false }` dla `-1` oraz dla `1.5`.
**Layer:** UNIT · **Status:** READY

### U10-C — ZWYKŁE PORZĄDKOWANIE

#### U10-C01 — Punkty decydują przed wszystkim
**Purpose:** drużyna z mniejszą liczbą punktów nigdy nie wyprzedza.
**Input:** A 9 pkt / GD +1, B 6 pkt / GD +30.
**Expected:** A przed B.
**Layer:** UNIT · **Status:** READY

#### U10-C02 — Sortowanie malejące i numeracja 1..n
**Assertions:** INV-07.
**Layer:** UNIT · **Status:** READY

### U10-D — REMIS DOKŁADNIE DWÓCH DRUŻYN

#### U10-D01 — Mecz bezpośredni rozstrzyga
**Input:** A i B po tyle samo punktów, A wygrało bezpośredni, B ma lepszy overall GD.
**Expected:** A wyżej. `isTieUnresolved = false`.
**Layer:** UNIT · **Status:** READY

#### U10-D02 — Bezpośredni remisowy → decyduje GD
**Layer:** UNIT · **Status:** READY

#### U10-D03 — Równe GD → decydują bramki zdobyte
**Layer:** UNIT · **Status:** READY

#### U10-D04 — Równe GF → decydują bramki stracone
**Purpose:** kryterium 5.
**Uwaga:** przy równych punktach, GD i GF, równe GA wynika matematycznie —
patrz POTENTIAL BUG PB-04. Scenariusz ma udowodnić, że komparator jest obecny
i poprawny, nawet jeśli w round-robin trudno go osiągnąć.
**Layer:** UNIT · **Status:** READY

#### U10-D05 — Pełny remis dwóch drużyn → nierozstrzygnięty
**Input:** identyczne punkty/GD/GF/GA i remisowy mecz bezpośredni.
**Expected:** obie `isTieUnresolved = true`, `tieWithTeamIds` wskazuje drugą,
`tieNote` z „rzuty karne" (gdy grupa kompletna).
**Layer:** UNIT · **Status:** READY

#### U10-D06 — Bezpośredni bije lepszy bilans
**Input:** A pokonało B, ale B ma GD +15 wobec +2.
**Expected:** A wyżej — regulaminowy punkt 2 przed punktem 3.
**Layer:** UNIT · **Status:** READY

#### U10-D07 — `sourceOrder` przeciwny do wyniku sportowego
**Input:** ta sama sytuacja, trzy różne kolejności rejestracji.
**Expected:** identyczny wynik sportowy w każdej.
**Assertions:** INV-31.
**Layer:** UNIT · **Status:** READY

### U10-E — REMIS TRZECH DRUŻYN

#### U10-E01 — Mała tabela rozstrzyga wszystkich
**Input:** A, B, C równe punkty; mini GD +2 / 0 / −2.
**Expected:** kolejność A, B, C. Wszyscy `isTieUnresolved = false`.
**Layer:** UNIT · **Status:** READY

#### U10-E02 — Mała tabela ma pierwszeństwo przed overall GD
**Input:** overall GD sugeruje A > B > C, mini GD daje B > C > A.
**Expected:** B, C, A.
**Purpose:** dowód, że mała tabela naprawdę działa.
**Layer:** UNIT · **Status:** READY

#### U10-E03 — Równe mini GD → overall GF
**Layer:** UNIT · **Status:** READY

#### U10-E04 — Równe mini GD i GF → overall GA
**Layer:** UNIT · **Status:** READY

#### U10-E05 — Pełny cykl A>B>C>A
**Expected:** mini GD = 0 u wszystkich → przechodzimy do overall GF.
**Layer:** UNIT · **Status:** READY

#### U10-E06 — Cykl + różne overall GF
**Expected:** kolejność wg GF malejąco, `isTieUnresolved = false`.
**Layer:** UNIT · **Status:** READY

#### U10-E07 — Cykl + równe GF + różne GA
**Expected:** kolejność wg GA rosnąco.
**Layer:** UNIT · **Status:** READY

#### U10-E08 — Cykl + wszystko równe → nierozstrzygnięty
**Expected:** wszyscy `isTieUnresolved = true`, `tieWithTeamIds.length === 2`,
`tieNote` z „rzuty karne".
**Layer:** UNIT · **Status:** READY

#### U10-E09 — Mecz z outsiderem nie wchodzi do małej tabeli
**Input:** A wygrywa z outsiderem 20:0.
**Expected:** mini GD drużyny A bez zmian; overall GD rośnie.
**Assertions:** `buildHeadToHeadMiniTable` pomija mecze spoza koszyka.
**Layer:** UNIT · **Status:** READY

#### U10-E10 — Trzy drużyny, mecz bezpośredni NIE wraca
**Input:** cykl, w którym mecz bezpośredni B–C dałby inną kolejność niż GF.
**Expected:** decyduje GF, nie mecz B–C.
**Purpose:** punkt 6 obowiązuje w całości.
**Layer:** UNIT · **Status:** READY

### U10-F — CZĘŚCIOWE ROZSTRZYGNIĘCIE

#### U10-F01 — Jedna drużyna odchodzi, para zostaje
**Input:** mini GD: A +3, B 0, C 0.
**Expected:** A rozstrzygnięte i wyżej. B/C rozstrzygane przez overall GF,
potem GA. **Nigdy** przez mecz bezpośredni B–C.
**Assertions:** jeśli B/C zostaną związane, `tieWithTeamIds` zawiera wyłącznie siebie nawzajem (nie A).
**Layer:** UNIT · **Status:** READY

#### U10-F02 — Podzbiór związany do końca
**Input:** A rozstrzygnięte, B i C identyczne we wszystkim.
**Expected:** A z `isTieUnresolved = false`, B i C z `true` i `tieWithTeamIds = [drugi]`.
**Layer:** UNIT · **Status:** READY

#### U10-F03 — Dwa niezależne podzbiory w jednym koszyku
**Input:** 5 drużyn w koszyku; mini GD: +2, +2, 0, −2, −2.
**Expected:** dwa osobne bloki nierozstrzygnięte (o ile GF/GA też równe),
każdy wskazujący tylko swoich.
**Layer:** UNIT · **Status:** READY

### U10-G — CZTERY I WIĘCEJ DRUŻYN

#### U10-G01 — Mała tabela czterech drużyn
**Input:** 4 drużyny w koszyku, mecze z outsiderami o skrajnych wynikach.
**Expected:** kolejność wyłącznie z mini GD; mecze z outsiderami bez wpływu.
**Layer:** UNIT · **Status:** READY

#### U10-G02 — Czwórka, częściowe rozstrzygnięcie
**Expected:** rozstrzygnięci odchodzą, reszta idzie przez GF → GA.
**Layer:** UNIT · **Status:** READY

#### U10-G03 — `buildHeadToHeadMiniTable` — selekcja meczów
**Purpose:** test jednostkowy samego helpera.
**Input:** lista 4 zainteresowanych + mecze z piątą drużyną.
**Expected:** GF/GA/GD liczone tylko z meczów wewnętrznych.
**Layer:** UNIT · **Status:** READY

#### U10-G04 — Koszyk = cała grupa (10 drużyn po 0 pkt lub identycznych)
**Purpose:** skrajność — mała tabela równa całej tabeli.
**Expected:** brak wyjątku, deterministyczny wynik.
**Layer:** UNIT · **Status:** READY

### U10-H — ROZSTRZYGNIĘCIE KARNYMI (workflow)

#### U10-H01 — Nierozstrzygnięty remis → admin wpisuje wynik po karnych
**Preconditions:** trzy drużyny w pełnym remisie, `isTieUnresolved = true`.
**Action:** admin zmienia jeden remisowy wynik grupowy z 1:1 na 2:1.
**Expected:** przeliczona tabela, remis znika lub przesuwa się na inny podzbiór,
statystyki odpowiadają WPISANEMU wynikowi (2:1, nie 1:1).
**Assertions:** INV-01..04, `isTieUnresolved` zgodnie z nową sytuacją.
**Layer:** DOMAIN · **Status:** READY

#### U10-H02 — Zmiana wyniku przesuwa drużynę do innego koszyka punktowego
**Expected:** koszyki przeliczone od zera; poprzednia flaga remisu nie „przykleja się".
**Layer:** UNIT · **Status:** READY

### U10-I — TABELA NIEKOMPLETNA

#### U10-I01 — Tie-break działa przed kompletem
**Expected:** kolejność liczona normalnie, ale `tieNote` pusty.
**Layer:** UNIT · **Status:** READY

#### U10-I02 — Niekompletna zostaje niekompletna
**Purpose:** `isGroupComplete` liczy z `matches.length >= n(n-1)/2`.
**Uwaga:** patrz PB-05 — funkcja nie sprawdza, czy to są RÓŻNE pary.
**Layer:** UNIT · **Status:** READY

### U10-J — EDYCJA WYNIKU

#### U10-J01 — Wpisanie wyniku
**Expected:** `played` +1 u obu, punkty zgodne.
**Layer:** INTEGRATION · **Status:** READY

#### U10-J02 — Zmiana wyniku bez zmiany zwycięzcy
**Expected:** `played` bez zmian, GF/GA przeliczone, brak podwójnego liczenia.
**Layer:** INTEGRATION · **Status:** READY

#### U10-J03 — Zmiana zwycięzcy
**Expected:** punkty przechodzą na drugą drużynę, `wins`/`losses` zamienione.
**Layer:** INTEGRATION · **Status:** READY

#### U10-J04 — Zmiana lidera tabeli
**Expected:** pozycja 1 zmienia właściciela.
**Layer:** INTEGRATION · **Status:** READY

#### U10-J05 — Przejście resolved → tie
**Expected:** `isTieUnresolved` zapala się.
**Layer:** UNIT · **Status:** READY

#### U10-J06 — Przejście tie → resolved
**Expected:** flaga gaśnie, `tieWithTeamIds` puste, `tieNote` undefined.
**Layer:** UNIT · **Status:** READY

#### U10-J07 — Zapis z panelu nie kasuje terminarza
**Purpose:** regresja znaleziona na żywo.
**Action:** odczyt stanu i zapis bez zmian.
**Expected:** liczba meczów niezmieniona, wpisane wyniki zachowane.
**Layer:** DATABASE · **Status:** READY

### U10-K — USUNIĘCIE WYNIKU

#### U10-K01 — Usunięcie cofa statystyki
**Expected:** `played` −1, punkty, GF, GA, GD wracają do stanu sprzed.
**Layer:** INTEGRATION · **Status:** READY

#### U10-K02 — Usunięcie z kompletnej grupy → niekompletna
**Expected:** `tieNote` znika przy nierozstrzygniętym remisie.
**Layer:** UNIT · **Status:** READY

#### U10-K03 — Usunięcie zmienia kolejność
**Expected:** ranking przeliczony.
**Layer:** INTEGRATION · **Status:** READY

### U10-L — IZOLACJA GRUP

#### U10-L01 — Wynik w A nie rusza tabeli B
**Assertions:** wszystkie wiersze B identyczne przed i po.
**Layer:** INTEGRATION · **Status:** READY

#### U10-L02 — Postęp liczony osobno
**Layer:** INTEGRATION · **Status:** READY

#### U10-L03 — Żadna drużyna nie gra w obu grupach
**Layer:** DATABASE · **Status:** READY

### U10-M — INVARIANTY LIGI

#### U10-M01 — Brak jakiegokolwiek stanu pucharowego
**Expected:** zero rekordów `brackets`, `bracket_rounds`, `standings_snapshots`,
zero meczów `stage in (bracket, placement_group)`.
**Assertions:** INV-16.
**Layer:** DATABASE · **Status:** READY

#### U10-M02 — Silnik pucharowy odrzuca turniej ligowy
**Action:** `completeGroupStage()` na U10.
**Expected:** `TournamentOperationError`.
**Layer:** DOMAIN · **Status:** READY

#### U10-M03 — `plannedMatchesForScope` dla ligi
**Expected:** `45` dla 10 drużyn, bez dodatków pucharowych.
**Layer:** UNIT · **Status:** READY

**Liczba scenariuszy U10: 48**

---

## 3. U8 — SCENARIUSZE

### U8-GRP — FAZA GRUPOWA

Wszystkie klasy z sekcji U10-B..U10-L obowiązują również dla U8 (7 drużyn,
21 meczów). Nie duplikujemy ich jeden do jednego — oznaczamy coverage:

#### U8-GRP01 — Remis 2 drużyn w grupie 7-zespołowej
**Expected:** identycznie jak U10-D01..D07.
**Layer:** UNIT · **Status:** READY

#### U8-GRP02 — Remis 3+ w grupie 7-zespołowej
**Expected:** identycznie jak U10-E01..E10.
**Layer:** UNIT · **Status:** READY

#### U8-GRP03 — Komplet 21 meczów włącza `tieNote`
**Layer:** UNIT · **Status:** READY

#### U8-GRP04 — Edycja i usunięcie wyniku
**Expected:** jak U10-J / U10-K.
**Layer:** INTEGRATION · **Status:** READY

#### U8-GRP05 — Izolacja grup A/B
**Layer:** INTEGRATION · **Status:** READY

#### U8-GRP06 — Workflow karnych w grupie
**Expected:** jak U10-H01.
**Layer:** DOMAIN · **Status:** READY

### U8-FRZ — ZAMROŻENIE FAZY GRUPOWEJ

#### U8-FRZ01 — 0/21 → zablokowane
**Action:** `completeGroupStage()`.
**Expected:** błąd „brakuje wyników 21 meczów".
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ02 — Częściowo (np. 10/21) → zablokowane
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ03 — 20/21 → zablokowane
**Purpose:** granica.
**Expected:** błąd „brakuje wyników 1 meczów".
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ04 — 21/21 i jednoznaczny ranking → dozwolone
**Expected:** snapshot + drabinka + minigrupa powstają, faza `semifinal`.
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ05 — Nierozstrzygnięty remis w strefie awansu → zablokowane
**Purpose:** `validateGroupStageCompletion`, warunek `position <= qualified + 1`.
**Input:** remis na miejscach 4–5.
**Expected:** błąd zawierający „granicy awansu" i nazwy drużyn.
**Assertions:** INV-31 — seedy nie powstają z `sourceOrder`.
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ06 — Nierozstrzygnięty remis POZA strefą awansu → dozwolone
**Input:** remis na miejscach 6–7.
**Expected:** freeze przechodzi.
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ07 — Po korekcie wyniku freeze przechodzi
**Action:** admin rozstrzyga remis wpisując wynik po karnych, potem freeze.
**Expected:** sukces.
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ08 — Za mało drużyn → zablokowane
**Input:** grupa z 3 drużynami przy `qualifiedTeamCount = 4`.
**Expected:** błąd o liczbie drużyn.
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ09 — Ponowne zamrożenie odrzucone
**Expected:** „Drabinka dla tego turnieju już istnieje."
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ10 — Freeze poza fazą grupową odrzucony
**Expected:** komunikat z aktualną fazą.
**Layer:** DOMAIN · **Status:** READY

#### U8-FRZ11 — Walidacja poprzedza jakąkolwiek mutację
**Purpose:** przy błędzie w grupie B nie może powstać snapshot grupy A.
**Expected:** zero nowych rekordów.
**Layer:** DATABASE · **Status:** READY

### U8-SNP — SNAPSHOT

#### U8-SNP01 — Dokładnie 7 wierszy na grupę
**Assertions:** INV-21.
**Layer:** DATABASE · **Status:** READY

#### U8-SNP02 — Komplet kolumn
**Expected:** `position, points, goalsFor, goalsAgainst, goalDifference, played, wins, draws, losses`.
**Layer:** DATABASE · **Status:** READY

#### U8-SNP03 — Snapshot nie zmienia się po meczach play-off
**Action:** rozegrać półfinały, odczytać snapshot.
**Expected:** identyczne wartości.
**Assertions:** INV-35.
**Layer:** DATABASE · **Status:** READY

#### U8-SNP04 — Zmiana wyniku grupowego po zamrożeniu nie rusza rozstawienia
**Expected:** seedy niezmienione.
**Assertions:** INV-36. **Uwaga:** patrz PB-01.
**Layer:** DATABASE · **Status:** READY

#### U8-SNP05 — Każda grupa ma własny snapshot
**Assertions:** INV-30.
**Layer:** DATABASE · **Status:** READY

### U8-SEED — ROZSTAWIENIE

#### U8-SEED01 — Pary 1v4 i 2v3
**Assertions:** INV-22, `buildFirstRoundPairs(4) === [[1,4],[2,3]]`.
**Layer:** UNIT · **Status:** READY

#### U8-SEED02 — Minigrupa dostaje dokładnie seedy 5,6,7
**Assertions:** INV-23, INV-24.
**Layer:** DOMAIN · **Status:** READY

#### U8-SEED03 — Rozstawienie liczone niezależnie dla A i B
**Layer:** DOMAIN · **Status:** READY

#### U8-SEED04 — Podgląd rozstawienia przed zamrożeniem nie jest zapisywany
**Expected:** `buildPlayoffPreview` liczy z bieżącej tabeli, zero rekordów w bazie.
**Layer:** DOMAIN · **Status:** READY

#### U8-SEED05 — Podgląd zostaje, zamrożenie jest blokowane
**Purpose:** rozdzielenie podglądu od decyzji oficjalnej.
**POPRAWIONE 2026-08-21** — poprzednie brzmienie („`isReliable === false`")
było sprzeczne z zamierzonym zachowaniem produktu, utrwalonym w
`tests/playoff-domain.test.ts` („nie straszy kibica nierozstrzygniętym
remisem w strefie awansu").

**Expected:**
- PODGLĄD: pozostaje dostępny zgodnie z obecną semantyką — nie straszymy
  kibica prowizorycznym rozstawieniem,
- ZAMROŻENIE: `validateGroupStageCompletion` MUSI zablokować operację,
  dopóki remis wpływający na rozstawienie nie zostanie rozstrzygnięty.

**Assertions:** podgląd zwraca pary; `validateGroupStageCompletion` zwraca
błąd z frazą „granicy awansu".
**Layer:** UNIT · **Status:** READY

### U8-SF — PÓŁFINAŁY

#### U8-SF01 — SF1: wygrywa seed 1
#### U8-SF02 — SF1: wygrywa seed 4
#### U8-SF03 — SF2: wygrywa seed 2
#### U8-SF04 — SF2: wygrywa seed 3
**Expected (każdy):** zwycięzca propaguje się do finału, przegrany do meczu o 3. miejsce.
**Layer:** DOMAIN · **Status:** READY

#### U8-SF05..08 — Cztery kombinacje finalistów
**Kombinacje:** (1,2), (1,3), (4,2), (4,3).
**Expected:** finał i mecz o 3. miejsce mają poprawną, rozłączną obsadę.
**Assertions:** INV-24, INV-30.
**Layer:** DOMAIN · **Status:** READY

#### U8-SF09 — Remis w półfinale odrzucony
**Expected:** `validateDecisiveScore` → komunikat o wpisaniu wyniku po karnych.
**Assertions:** INV-34.
**Layer:** UNIT · **Status:** READY

#### U8-SF10 — Zmiana zwycięzcy półfinału gdy finał pusty
**Expected:** dozwolone, uczestnik finału podmieniony.
**Layer:** DOMAIN · **Status:** READY

#### U8-SF11 — Zmiana zwycięzcy półfinału gdy finał ma wynik
**Expected:** zablokowane.
**Layer:** DOMAIN · **Status:** READY

### U8-GATE — BRAMKOWANIE FAZ

#### U8-GATE01 — Wynik finału w trakcie półfinałów odrzucony
**Expected:** błąd „ten etap jeszcze się nie rozpoczął".
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE02 — Wynik półfinału po przejściu do finałów odrzucony
**Expected:** błąd „ten etap jest już zamknięty" + wskazówka o cofnięciu.
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE03 — Drabinka w fazie grupowej: `locked`
**Expected:** `describeMatchEditability(...) === "locked"`, zapis odrzucony.
**Layer:** UNIT · **Status:** READY

#### U8-GATE04 — Minigrupa edytowalna od razu po zamrożeniu
**Purpose:** świadomy wyjątek — niezależna gałąź turnieju.
**Expected:** `editable` w fazach `semifinal` i `final`.
**Layer:** UNIT · **Status:** READY

#### U8-GATE05 — Minigrupa `locked` w fazie grupowej
**Layer:** UNIT · **Status:** READY

#### U8-GATE06 — Wszystko `completed` po zakończeniu turnieju
**Layer:** UNIT · **Status:** READY

#### U8-GATE07 — Zamknięcie rundy przy braku wyniku odrzucone
**Expected:** `OperationIssueReport` z drużynami, nie identyfikatorami meczów.
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE08 — Zamknięcie rundy przy remisie odrzucone
**Expected:** `reason: "draw"`.
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE09 — Zamknięcie rundy z nieznanym uczestnikiem odrzucone
**Expected:** `reason: "unknown_participants"`.
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE10 — Legalne przejście SF → F
**Expected:** faza `final`, rundy półfinałowe `completed`.
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE11 — `completeCurrentRound` na finale odrzucone
**Expected:** „Finały kończy operacja »Zakończ turniej«."
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE12 — `completeCurrentRound` w fazie grupowej odrzucone
**Expected:** „Najpierw zakończ fazę grupową."
**Layer:** DOMAIN · **Status:** READY

#### U8-GATE13 — Zapis wyniku meczu grupowego przez silnik pucharowy odrzucony
**Expected:** „Wyniki fazy grupowej zapisuje się przez zwykłą tabelę."
**Layer:** DOMAIN · **Status:** READY

### U8-FIN — FINAŁ I MECZ O 3. MIEJSCE

#### U8-FIN01 — Wygrywa pierwszy finalista → miejsca 1 / 2
#### U8-FIN02 — Wygrywa drugi finalista → miejsca 1 / 2
**Assertions:** INV-25.
**Layer:** DOMAIN · **Status:** READY

#### U8-FIN03 — Wygrywa pierwszy przegrany półfinału → 3 / 4
#### U8-FIN04 — Wygrywa drugi przegrany półfinału → 3 / 4
**Assertions:** INV-26.
**Layer:** DOMAIN · **Status:** READY

#### U8-FIN05 — Remis w finale odrzucony
#### U8-FIN06 — Remis w meczu o 3. miejsce odrzucony
**Layer:** UNIT · **Status:** READY

#### U8-FIN07 — Konfiguracja bez meczu o 3. miejsce
**Expected:** brak fikcyjnego meczu; przegrani półfinałów szeregowani zamrożoną tabelą; przy braku snapshotu miejsca dzielone (`position: null`, `shared: true`).
**Layer:** DOMAIN · **Status:** READY

### U8-PLC — MINIGRUPA, PRZYPADKI NORMALNE

#### U8-PLC01 — Różne punkty
**Expected:** kolejność 5/6/7 wprost z punktów.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLC02 — Remis dwóch w minigrupie → mecz bezpośredni
**Purpose:** minigrupa używa zwykłego `calculateStandings`.
**Expected:** rozstrzygnięte bez fallbacku frozen.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLC03 — Remis trzech → mała tabela
**Uwaga:** przy 3 drużynach mała tabela = cała minigrupa.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLC04 — Równe mini GD → overall GF minigrupy
**Layer:** DOMAIN · **Status:** READY

#### U8-PLC05 — Równe GF → overall GA minigrupy
**Layer:** DOMAIN · **Status:** READY

#### U8-PLC06 — Remis w minigrupie odrzucony przy zapisie
**Assertions:** INV-34.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLC07 — 3 mecze w minigrupie, round robin trójki
**Expected:** pary 5-6, 5-7, 6-7, każda raz.
**Assertions:** INV-10, INV-11.
**Layer:** DOMAIN · **Status:** READY

### U8-PLF — MINIGRUPA, FALLBACK REGULAMINOWY

#### U8-PLF01 — CASE 1: pełny cykl w minigrupie
**Input:** A 1:0 B, B 1:0 C, C 1:0 A. Wszyscy 3 pkt, GF 1, GA 1, GD 0.
**Expected:** `calculateStandings` zwraca `isTieUnresolved` u wszystkich trzech;
`resolvePlacementStandings` rozstrzyga frozen GD.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF02 — CASE 2: frozen GD rozdziela wszystkich
**Input:** frozen GD A +5, B +2, C −1.
**Expected:** 5 = A, 6 = B, 7 = C. Wszystkie `isTieUnresolved = false`.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF03 — CASE 3: częściowy remis frozen GD
**Input:** frozen GD A +5, B +2, C +2; frozen position B=6, C=7.
**Expected:** A na 5, potem B (poz. 6), potem C (poz. 7).
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF04 — CASE 4: wszystkie frozen GD równe
**Input:** frozen GD 0/0/0; frozen position 5/6/7.
**Expected:** kolejność wg frozen position.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF05 — CASE 5: `sourceOrder` przeciwny
**Input:** trzy różne kolejności rejestracji, te same dane frozen.
**Expected:** identyczny wynik w każdej.
**Assertions:** INV-31.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF06 — CASE 6: brak danych frozen
**Input:** `frozen: []`.
**Expected:** blok pozostaje nierozstrzygnięty, `unresolvedTeamIds` = wszystkie trzy,
klasyfikacja `complete: false`, `missing` zawiera
„rozstrzygnięcie miejsc poza podium". **Zero** miejsc z `sourceOrder`.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF07 — Niepełne dane frozen
**Input:** frozen tylko dla jednej z trzech drużyn.
**Expected:** cały blok nierozstrzygnięty — rozstrzygamy komplet albo nic.
**Layer:** DOMAIN · **Status:** READY

#### U8-PLF08 — Rozstrzygnięta minigrupa przechodzi przez resolver bez zmian
**Expected:** wynik identyczny z wejściem, `unresolvedTeamIds` puste.
**Layer:** UNIT · **Status:** READY

#### U8-PLF09 — Fallback frozen NIE jest używany, gdy minigrupa rozstrzyga
**Purpose:** kolejność reguł — minigrupa ma pierwszeństwo.
**Input:** minigrupa daje A>B>C, frozen GD daje odwrotnie.
**Expected:** A, B, C wg minigrupy.
**Layer:** DOMAIN · **Status:** READY

### U8-CLS — KLASYFIKACJA KOŃCOWA

#### U8-CLS01 — Miejsca 1–2 z finału
#### U8-CLS02 — Miejsca 3–4 z meczu o 3. miejsce
#### U8-CLS03 — Miejsca 5–7 z resolvera minigrupy
**Assertions:** INV-25..27.
**Layer:** DOMAIN · **Status:** READY

#### U8-CLS04 — Statystyki nie przesuwają miejsc play-off
**Input:** drużyna z miejsca 3 ma więcej punktów łącznie niż mistrz.
**Expected:** nadal miejsce 3.
**Assertions:** INV-38.
**Layer:** DOMAIN · **Status:** READY

#### U8-CLS05 — Klasyfikacja 1–7 bez dziur
**Assertions:** INV-07, INV-28, INV-29.
**Layer:** DOMAIN · **Status:** READY

#### U8-CLS06 — Klasyfikacja liczona osobno dla A i B
**Layer:** DOMAIN · **Status:** READY

#### U8-CLS07 — `complete: false` przy brakującym finale
**Expected:** `missing` zawiera „finał".
**Layer:** UNIT · **Status:** READY

#### U8-CLS08 — `complete: false` przy niekompletnej minigrupie
**Expected:** `missing` zawiera „minigrupa klasyfikacyjna".
**Layer:** UNIT · **Status:** READY

#### U8-CLS09 — Szkielet klasyfikacji przed startem
**Expected:** 7 slotów, miejsca 1–7, znaki zapytania zamiast drużyn.
**Layer:** UNIT · **Status:** READY

#### U8-CLS10 — Szkielet bez meczu o 3. miejsce
**Expected:** dwa sloty `3–4` z `shared: true`.
**Layer:** UNIT · **Status:** READY

### U8-CONS — SPÓJNOŚĆ WIDOKÓW *(HARD INVARIANT)*

#### U8-CONS01 — Minitabela = klasyfikacja = Ranking
**Purpose:** najważniejszy invariant całego systemu.
**Expected:** miejsca 5/6/7 identyczne we wszystkich trzech.
**Zakazany stan:** minitabela `?`, podium puste, Ranking 5/6/7.
**Assertions:** INV-32.
**Layer:** INTEGRATION · **Status:** READY

#### U8-CONS02 — Nierozstrzygnięte miejsce widoczne wszędzie tak samo
**Input:** brak danych frozen.
**Expected:** `?` w minitabeli, `position: null` w klasyfikacji,
`isTieUnresolved` w Rankingu. Nigdzie twardego numeru.
**Layer:** INTEGRATION · **Status:** READY

#### U8-CONS03 — Kolejność Rankingu = kolejność klasyfikacji po zakończeniu
**Layer:** INTEGRATION · **Status:** READY

#### U8-CONS04 — Ranking nie dokleja drużyn z kolejności rejestracji
**Purpose:** regresja naprawiona; `teamIdsInGroup` nie jest fallbackiem sportowym.
**Expected:** drużyna spoza klasyfikacji dostaje `position: null`, nie numer.
**Layer:** DOMAIN · **Status:** READY

### U8-AGG — STATYSTYKI ZBIORCZE

#### U8-AGG01 — Zakres agregacji
**Expected:** grupa + półfinały + finał + mecz o 3. miejsce + minigrupa.
**Assertions:** INV-37.
**Layer:** DOMAIN · **Status:** READY

#### U8-AGG02 — Zwycięstwo w play-off dorzuca 3 punkty
**Layer:** DOMAIN · **Status:** READY

#### U8-AGG03 — Bilans sumuje fazę grupową i play-off
**Layer:** DOMAIN · **Status:** READY

#### U8-AGG04 — Mecz bez kompletu bramek pomijany
**Expected:** terminarz nie wpływa na statystyki.
**Layer:** UNIT · **Status:** READY

#### U8-AGG05 — Arytmetyka po agregacji
**Assertions:** INV-01..03 na zagregowanych wierszach.
**Layer:** UNIT · **Status:** READY

#### U8-AGG06 — Mecze pucharowe nie trafiają do tabeli fazy grupowej
**Assertions:** INV-33.
**Layer:** DOMAIN · **Status:** READY

### U8-CPL — ZAKOŃCZENIE TURNIEJU

#### U8-CPL01 — Brak wyniku finału → zablokowane
#### U8-CPL02 — Brak wyniku meczu o 3. miejsce → zablokowane
#### U8-CPL03 — Brak wyniku w minigrupie → zablokowane
**Purpose:** minigrupa nie blokuje rundy, ale blokuje zakończenie turnieju.
**Layer:** DOMAIN · **Status:** READY

#### U8-CPL04 — Remis w wymaganym meczu → zablokowane
**Layer:** DOMAIN · **Status:** READY

#### U8-CPL05 — Zakończenie przed fazą finałową → zablokowane
**Expected:** „Najpierw zakończ wcześniejsze rundy fazy pucharowej."
**Layer:** DOMAIN · **Status:** READY

#### U8-CPL06 — Ponowne zakończenie → zablokowane
**Layer:** DOMAIN · **Status:** READY

#### U8-CPL07 — Komplet → faza `completed`, `completedAt` ustawione
**Purpose:** `completedAt` jest tokenem ceremonii podium.
**Layer:** DOMAIN · **Status:** READY

#### U8-CPL08 — Faza jest GLOBALNA, dane są per grupa
**Purpose:** kluczowe rozróżnienie.
**Expected:** `completeTournament` sprawdza mecze OBU grup; nie da się zakończyć,
gdy grupa B ma braki, nawet jeśli A jest kompletna.
**Assertions:** faza w `tournaments.phase` (jedna kolumna), dane w `groups`.
**Layer:** DOMAIN · **Status:** READY

#### U8-CPL09 — Bump rewizji publicznej przy zakończeniu
**Layer:** DATABASE · **Status:** READY

### U8-RWD — COFANIE FAZY

#### U8-RWD01 — `describeReopen` opisuje skutki PRZED wykonaniem
**Expected:** `targetPhase`, `resultsToDiscard`, `removesBracket`.
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD02 — Cofnięcie bez potwierdzenia przy stracie danych → odrzucone
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD03 — `completed` → `final`
**Expected:** faza cofnięta, `completedAt` wyczyszczone, ceremonia zgaszona.
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD04 — `final` → `semifinal`
**Expected:** wyniki finału i meczu o 3. miejsce skasowane; uczestnicy wyprowadzeni
z półfinałów wyzerowani; półfinały nietknięte.
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD05 — `semifinal` → `group_stage`
**Expected:** drabinka, minigrupa i snapshot **usunięte**; wyniki grupowe
**nietknięte**.
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD06 — Uczestnik z seeda zostaje, wyprowadzony znika
**Purpose:** `homeSource.type !== "seed"`.
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD07 — Statystyki po cofnięciu
**Expected:** punkty z play-off znikają razem z wynikami.
**Layer:** DOMAIN · **Status:** READY

#### U8-RWD08 — Stan zakończenia po cofnięciu
**Purpose:** rozdzielenie KOMPLETNOŚCI DANYCH od STANU ZAKOŃCZENIA.
**POPRAWIONE 2026-08-21** — poprzednie brzmienie („`complete: false`") było
błędne. Cofnięcie z `completed` do `final` nie kasuje żadnych wyników
(`getRoundKindsForPhase("completed")` zwraca pustą listę), więc dane
klasyfikacji nadal są kompletne.

**Expected:**
- KOMPLETNOŚĆ DANYCH: `classification.complete` pozostaje `true` — wszystkie
  wymagane wyniki nadal istnieją,
- STAN ZAKOŃCZENIA: `phase !== "completed"`, `completedAt === null`,
  `completionToken === null` — turniej nie jest już oficjalnie zakończony,
  a token ceremonii przestaje reprezentować poprzednią finalizację.

**Layer:** DOMAIN · **Status:** READY

#### U8-RWD09 — Postęp meczów po cofnięciu
**Expected:** `playedMatchCount` maleje, `plannedMatchCount` zostaje 56.
**Layer:** INTEGRATION · **Status:** READY

### U8-EDT — KOREKTA STAREGO WYNIKU GRUPOWEGO

#### U8-EDT01 — Zmiana wyniku grupowego po zamrożeniu
**Preconditions:** faza `semifinal`, snapshot istnieje.
**Action:** zapis nowego wyniku grupowego przez `saveTournament`.
**Expected wg regulaminu:** operacja powinna być zablokowana albo wymuszać cofnięcie.
**Actual:** **przechodzi bez ostrzeżenia** — patrz PB-01.
**Layer:** DATABASE · **Status:** READY *(scenariusz opisuje stan pożądany; test
należy napisać dopiero po decyzji, patrz PB-01)*

#### U8-EDT02 — Legalna procedura: rewind → edycja → ponowne zamrożenie
**Expected:** nowy snapshot, nowe seedy, nowi uczestnicy drabinki.
**Layer:** DOMAIN · **Status:** READY

#### U8-EDT03 — Stare wyniki play-off nie przeżywają cofnięcia do fazy grupowej
**Expected:** wszystkie mecze `bracket` i `placement_group` usunięte.
**Layer:** DATABASE · **Status:** READY

### U8-RFZ — PONOWNE ZAMROŻENIE

#### U8-RFZ01 — Nowy snapshot po ponownym zamrożeniu
**Expected:** dokładnie jeden snapshot na grupę, z nowymi liczbami.
**Layer:** DATABASE · **Status:** READY

#### U8-RFZ02 — Nowe rozstawienie
**Expected:** seedy odpowiadają nowej tabeli; brak pozostałości po starych.
**Layer:** DATABASE · **Status:** READY

#### U8-RFZ03 — Brak osieroconych rekordów
**Expected:** zero starych `brackets`, `bracket_rounds`, meczów drabinki.
**Layer:** DATABASE · **Status:** READY

### U8-RCP — PONOWNE ZAKOŃCZENIE

#### U8-RCP01 — complete → reopen → edycja → complete
**Expected:** nowa klasyfikacja, nowy `completedAt`.
**Layer:** LIFECYCLE · **Status:** READY

#### U8-RCP02 — Nowy token ceremonii
**Purpose:** `completedAt` zmienia klucz `podiumRevealSeen`, więc kibic zobaczy
ceremonię ponownie.
**Expected:** `completionToken` różny od poprzedniego.
**Layer:** LIFECYCLE · **Status:** READY

#### U8-RCP03 — Brak stanu resztkowego
**Expected:** klasyfikacja odpowiada nowym wynikom, zero starych miejsc.
**Layer:** LIFECYCLE · **Status:** READY

### U8-ISO — IZOLACJA GRUP

#### U8-ISO01 — Wynik w A nie budzi rozstawienia w B
#### U8-ISO02 — Każda grupa ma własny snapshot i własną drabinkę
#### U8-ISO03 — Zwycięzca półfinału A nie trafia do finału B
#### U8-ISO04 — Minigrupy i klasyfikacje liczone osobno
**Assertions:** INV-30.
**Layer:** DOMAIN · **Status:** READY

#### U8-ISO05 — Faza globalna vs dane per grupa
**Purpose:** rozdzielenie pojęć.
**Expected:** `tournaments.phase` jest jedno dla całego turnieju; snapshot,
drabinka, minigrupa i klasyfikacja są per `groupId`.
**Layer:** DOMAIN · **Status:** READY

**Liczba scenariuszy U8: 104**

---

## 4. POKRYCIE ISTNIEJĄCYMI TESTAMI

Sprawdzone przez odczyt **asercji**, nie nazw. Stan: 82 pliki, 1228 testów.

### FULLY COVERED

| Scenariusz | Plik |
|---|---|
| U10-A01, A05 | `tests/standings.test.ts` |
| U10-B01..B04 | `tests/standings.test.ts` |
| U10-C01, C02 | `tests/standings.test.ts` |
| U10-D01..D05 | `tests/standings.test.ts`, `tests/standings-mini-table.test.ts` |
| U10-D07 | `tests/standings-mini-table.test.ts` |
| U10-E01..E09 | `tests/standings-mini-table.test.ts` |
| U10-F01, F02 | `tests/standings-mini-table.test.ts` |
| U10-G01, G03 | `tests/standings-mini-table.test.ts` |
| U10-I01, I02 | `tests/standings.test.ts` |
| U10-J07 | `tests/sun-cup-data.test.ts` |
| U10-M01..M03 | `tests/sun-cup-data.test.ts`, `tests/playoff-engine.test.ts` |
| U8-FRZ01..03, 05, 06, 08..10 | `tests/playoff-domain.test.ts`, `tests/playoff-engine.test.ts` |
| U8-SNP01, 03, 04, 05 | `tests/playoff-engine.test.ts`, `tests/dress-rehearsal.test.ts` |
| U8-SEED01..03, 05 | `tests/playoff-domain.test.ts`, `tests/dress-rehearsal.test.ts` |
| U8-SF09, SF10, SF11 | `tests/playoff-engine.test.ts` |
| U8-GATE01, 02, 07, 10..13 | `tests/playoff-engine.test.ts` |
| U8-GATE03..06 | `tests/playoff-domain.test.ts` |
| U8-FIN05..07 | `tests/playoff-engine.test.ts`, `tests/dress-rehearsal.test.ts` |
| U8-PLC06, PLC07 | `tests/playoff-engine.test.ts`, `tests/dress-rehearsal.test.ts` |
| U8-PLF01..08 | `tests/placement-resolver.test.ts` |
| U8-CLS01..03, 05, 06 | `tests/dress-rehearsal.test.ts`, `tests/playoff-engine.test.ts` |
| U8-CLS04 | `tests/dress-rehearsal.test.ts` |
| U8-CONS01, CONS03 | `tests/dress-rehearsal.test.ts`, `tests/placement-resolver.test.ts` |
| U8-AGG01..03, 06 | `tests/dress-rehearsal.test.ts`, `tests/playoff-engine.test.ts` |
| U8-CPL01..03 | `tests/playoff-engine.test.ts` |
| U8-RWD01..05 | `tests/playoff-engine.test.ts`, `tests/dress-rehearsal.test.ts` |
| U8-ISO01..04 | `tests/dress-rehearsal.test.ts`, `tests/playoff-engine.test.ts` |
| INV-01..03, 07..09, 13 | `tests/standings.test.ts` |
| INV-19..23, 25..27, 33..36 | `tests/dress-rehearsal.test.ts`, `tests/playoff-engine.test.ts` |

### PARTIALLY COVERED

| Scenariusz | Co jest | Czego brakuje |
|---|---|---|
| U10-A02..A04, A06 | progres 0 i komplet | konkretne progi 1/45, 44/45, 23/45 |
| U10-D06 | tie-break 2 drużyn | brak testu „H2H bije duży GD" wprost |
| U10-E10 | mini table | brak dowodu, że H2H NIE wraca dla pary po miniGD |
| U10-F03 | częściowe rozdzielenie | brak dwóch niezależnych podzbiorów |
| U10-G02, G04 | 4-drużynowa mała tabela | brak częściowego rozdzielenia i skrajności 10 drużyn |
| U10-H01, H02 | — | workflow karnych nietestowany end-to-end |
| U10-J01..J06 | zapis nie kasuje | brak testów przejść tie↔resolved |
| U10-K01..K03 | — | usuwanie wyniku nietestowane |
| U10-L01..L03 | izolacja U8 | brak odpowiednika dla U10 |
| U8-SF01..08 | jedna kombinacja | brak wszystkich czterech |
| U8-SNP02 | kolumny w schemacie | brak asercji na komplet wartości |
| U8-PLC01..05 | resolver frozen | brak normalnych przypadków minigrupy |
| U8-CLS07..10 | `complete` | brak testów `missing` per przyczyna |
| U8-CONS02, CONS04 | — | brak testu spójności dla stanu nierozstrzygniętego |
| U8-CPL07..09 | — | brak asercji na `completedAt` i rewizję |
| U8-RWD06..09 | rewind | brak asercji na statystyki, klasyfikację i postęp |

### NOT COVERED

| Scenariusz | Uwagi |
|---|---|
| U10-A02, A03, A04 | konkretne progi postępu |
| U10-B05..B07 | wysoki wynik, wynik połowiczny, ujemny/niecałkowity |
| U10-E10 | brak powrotu do H2H w gałęzi 3+ |
| U10-F03 | dwa niezależne podzbiory |
| U10-G02, G04 | |
| U10-H01, H02 | workflow karnych |
| U10-J01..J06 | edycje wyniku end-to-end |
| U10-K01..K03 | usuwanie wyniku |
| U10-L01..L03 | izolacja grup U10 |
| U8-GRP01..06 | brak jawnego pokrycia standings dla U8 |
| U8-FRZ04, FRZ07, FRZ11 | freeze po korekcie, atomowość walidacji |
| U8-SEED04 | podgląd nie jest zapisywany |
| U8-SF01..08 | pełna macierz kombinacji |
| U8-GATE08, GATE09 | `draw` i `unknown_participants` w `completeCurrentRound` |
| U8-FIN01..04 | obie strony finału i meczu o 3. miejsce |
| U8-PLC01..05 | normalne przypadki minigrupy |
| U8-PLF09 | pierwszeństwo minigrupy nad frozen |
| U8-CONS02, CONS04 | |
| U8-AGG04, AGG05 | |
| U8-CPL04..09 | |
| U8-RWD06..09 | |
| U8-EDT01..03 | korekta starego wyniku |
| U8-RFZ01..03 | ponowne zamrożenie |
| U8-RCP01..03 | ponowne zakończenie |
| U8-ISO05 | faza globalna vs dane per grupa |
| INV-04..06, 10..12 | arytmetyka sum i unikalność par |
| INV-24, 28..32, 37, 38 | częściowo, brak jawnych asercji |

**Podsumowanie:** FULLY 62 · PARTIALLY 42 · NOT COVERED 48.

---

## 5. NEEDS DECISION

**Brak.** Wszystkie reguły domenowe potrzebne do napisania testów są jednoznacznie
określone w kodzie albo w regulaminie. Workflow rzutów karnych jest świadomie
przyjęty (admin wpisuje finalny wynik nieremisowy) i **nie** jest tu traktowany
jako brakująca decyzja.

Jedyny punkt wymagający Twojej decyzji **produktowej**, a nie domenowej, to
PB-01 poniżej — i to dlatego, że dotyczy zablokowania operacji, która dziś działa.

---

## 6. POTENTIAL BUGS *(bez naprawy)*

### PB-01 — Wynik grupowy da się zmienić po zamrożeniu, bez ostrzeżenia
**STATUS 2026-08-21: POTWIERDZONY AUTOMATYCZNIE** — `tests/torture/u8/edit-after-freeze.test.ts` (U8-EDT01).
- **Scenario:** U8-EDT01
- **Expected:** operacja zablokowana albo wymuszająca cofnięcie do fazy grupowej.
- **Actual:** `saveTournament()` nie sprawdza `tournaments.phase` ani istnienia
  snapshotu. Wynik grupowy zostaje nadpisany, tabela pokazuje nowe liczby,
  a snapshot i rozstawienie zostają stare. Publiczna tabela przestaje zgadzać się
  z drabinką.
- **File/function:** `lib/data/postgres/repository.ts` → `saveTournament()` (linia ~609)
- **Uwaga:** `savePlayoffMatchResult()` ma pełne bramkowanie fazowe — brakuje go
  wyłącznie po stronie zapisu fazy grupowej.

### PB-02 — Minigrupa nie ma bramkowania „faza grupowa"
- **Scenario:** U8-PLC/U8-GATE04
- **Expected:** minigrupa edytowalna od zamknięcia fazy grupowej — i tak jest.
- **Actual:** zgodne. **To NIE jest bug**, tylko świadomy wyjątek; wpisuję dla
  jasności, żeby nie został zgłoszony przy pisaniu testów.

### PB-03 — `classification.complete` przy miejscach dzielonych 3–4
**STATUS 2026-08-21: POTWIERDZONY AUTOMATYCZNIE** — `tests/torture/u8/domain.test.ts` (U8-FIN07).
- **Scenario:** U8-FIN07
- **Expected:** do rozstrzygnięcia — czy turniej bez meczu o 3. miejsce i bez
  snapshotu może być `complete`.
- **Actual:** przegrani półfinałów dostają `position: null, shared: true`, ale do
  `missing` **nic nie trafia**, więc `complete: true` przy dwóch nieobsadzonych
  miejscach. Analogiczny przypadek dla minigrupy został naprawiony
  (`placementUnresolvedTeamIds`), dla półfinałów — nie.
- **File/function:** `lib/playoff/classification.ts` → `buildFinalClassification()`,
  gałąź `else` przy `thirdPlaceMatch === false`.

### PB-04 — Kryterium „bramki stracone" jest w round-robin nieosiągalne
- **Scenario:** U10-D04
- **Actual:** przy równych punktach, równym GD i równym GF, GA wynika
  matematycznie i też jest równe. Komparator jest poprawny, ale w praktyce
  martwy. Istniejący test `tests/standings.test.ts` nazywa to wprost
  („kryterium 'bramki stracone' jest matematycznie nieosiągalne").
- **Nie jest to defekt** — informacja dla piszącego testy, żeby nie próbował
  konstruować niemożliwego przypadku w pełnym round-robin.

### PB-05 — `isGroupComplete` liczy mecze, nie pary
**STATUS 2026-08-21: POTWIERDZONY AUTOMATYCZNIE** — `tests/torture/u10/ties.test.ts` (U10-I02).
- **Scenario:** U10-I02
- **Expected:** grupa kompletna = każda para rozegrana dokładnie raz.
- **Actual:** `matches.length >= n(n-1)/2`. Dziesięć powtórzeń tego samego meczu
  spełni warunek. W praktyce terminarz generuje poprawne pary, ale gdyby
  organizator dopisał mecz towarzyski (a to się już zdarzyło — 22. mecz w grupie
  A SUN CUP U8), grupa zostanie uznana za kompletną przedwcześnie.
- **File/function:** `lib/standings.ts` → `isGroupComplete()`

### PB-06 — Komentarz w silniku mija się z kodem
- **Scenario:** U8-PLC
- **Actual:** `playoff-engine.ts:594` twierdzi, że `sourceOrder` w minigrupie
  „odzwierciedla miejsce z fazy grupowej". Faktycznie `placementTeams` powstaje
  z `domainGroup.teams` posortowanych po `sourceOrder`, czyli po **kolejności
  rejestracji**. Nie ma wpływu na wynik (fallback frozen działa poprawnie), ale
  komentarz wprowadza w błąd.
- **File/function:** `lib/data/postgres/playoff-engine.ts` (linia ~592)

---

## 7. NAJGROŹNIEJSZE PRZYPADKI DLA REALNEGO TURNIEJU

Uszeregowane wg realnego ryzyka w hali:

1. **PB-01 — korekta wyniku grupowego po zamrożeniu.** Najgroźniejszy. Sędzia
   zgłasza pomyłkę w trakcie półfinałów, admin poprawia wynik w tabeli, tabela
   publiczna pokazuje nową kolejność, a drabinka gra dalej po starych seedach.
   Nikt tego nie zauważy do końca turnieju.
2. **U8-FRZ05 — zamrożenie przy remisie na granicy awansu.** Zablokowane
   poprawnie, ale komunikat musi być zrozumiały w hali. Jeśli admin go obejdzie
   (np. wpisując przypadkowy wynik), drabinka powstanie z błędnym rozstawieniem.
3. **U8-CONS01 — rozjazd trzech widoków.** Realnie wystąpił: minitabela `?`,
   podium puste, Ranking twarde 5/6/7 z kolejności rejestracji. Naprawione, ale
   to jest klasa błędu, która wraca przy każdej zmianie warstwy prezentacji.
4. **U8-PLF06 — brak danych frozen przy nierozstrzygniętej minigrupie.** System
   nie może wtedy wymyślić miejsca. Jeśli ktoś kiedyś doda fallback po
   `sourceOrder`, turniej dostanie oficjalne miejsca z kolejności zgłoszeń.
5. **U8-RWD05 — cofnięcie do fazy grupowej.** Kasuje drabinkę, minigrupę
   i snapshot. Operacja nieodwracalna. Wymaga potwierdzenia, ale przy szybkim
   klikaniu w hali to najbardziej kosztowna pomyłka.
6. **PB-05 — dopisany mecz towarzyski.** Realnie już się zdarzyło (22. mecz
   w grupie A U8). Grupa zostanie uznana za kompletną przed czasem, co włączy
   komunikat o karnych i pozwoli na zamrożenie.
7. **U10-E02 — mała tabela vs bilans ogólny.** Najczęstsza realna sytuacja przy
   10 drużynach. Do niedawna system liczył to źle. Regresja tutaj oznacza błędną
   kolejność w oficjalnej tabeli ligowej.
8. **U8-CPL08 — faza globalna, dane per grupa.** Zakończenie turnieju sprawdza
   obie grupy. Jeśli kiedyś ktoś zrobi to per grupa, jedna grupa zostanie
   zamknięta z niekompletną drugą.
9. **U8-RCP02 — token ceremonii przy ponownym zakończeniu.** `completedAt`
   steruje kluczem `podiumRevealSeen`. Jeśli nie zmieni się przy ponownym
   zakończeniu, kibice nie zobaczą poprawionej ceremonii.
10. **PB-03 — `complete: true` przy nieobsadzonych miejscach 3–4.** Ceremonia
    podium odpali się dla turnieju z dziurą w klasyfikacji.

---

## 8. PODSUMOWANIE LICZBOWE

| | |
|---|---|
| Scenariusze U10 | **48** |
| Scenariusze U8 | **104** |
| Scenariusze łącznie | **152** |
| Globalne invarianty | **38** |
| FULLY COVERED | 62 |
| PARTIALLY COVERED | 42 |
| NOT COVERED | 48 |
| NEEDS DECISION | 0 |
| POTENTIAL BUGS | 6 (w tym 2 informacyjne) |

---

## 9. NASTĘPNY KROK

Ten dokument jest gotowy do zamiany na testy. Sugerowana kolejność:

1. **NOT COVERED + Layer UNIT** — najtańsze, czyste funkcje, zero bazy
   (U10-B05..B07, U10-E10, U10-F03, U10-G02, U10-G04, U8-AGG04, U8-AGG05).
2. **NOT COVERED + Layer DOMAIN** — silnik na fixture'ach
   (U8-SF01..08, U8-FIN01..04, U8-PLC01..05, U8-PLF09, U8-GATE08, U8-GATE09).
3. **NOT COVERED + Layer LIFECYCLE/DATABASE** — pełne ścieżki na
   `vitest-*` fixture'ach, sprzątane w `finally`
   (U8-EDT, U8-RFZ, U8-RCP, U8-CPL04..09, U8-RWD06..09).
4. **PARTIALLY COVERED** — dopięcie brakujących asercji.
5. **PB-01 i PB-03** — dopiero po Twojej decyzji, czy zmieniamy zachowanie.

Wszystkie testy integracyjne i bazodanowe muszą używać **jednorazowych
fixture'ów** (`vitest-*`), sprzątanych w `finally`. Żaden test nie może dotknąć
SUN CUP U8, SUN CUP U10, Rabbit Cup ani turniejów próbnych.
