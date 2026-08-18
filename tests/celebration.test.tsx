import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import {
  celebrationSectionId,
  describeCelebrationCta,
} from "@/lib/public/celebration";
import { buildRevealOrder, getRevealTotalMs } from "@/lib/public/podium-reveal";
import { PodiumSection } from "@/components/playoff/podium-section";
import { buildClassificationSkeleton } from "@/lib/playoff/classification";
import { classification } from "./helpers/view-fixtures";

/**
 * CELEBRACJA KLASYFIKACJI KOŃCOWEJ.
 *
 * Scena, kolejność odsłaniania i przycisk prowadzący do niej.
 * Mechanika zapamiętania pozostaje ta sama co dotąd.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const SKELETON_7 = buildClassificationSkeleton({
  teamCount: 7,
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
});

function renderPodium(completed: boolean) {
  return renderToStaticMarkup(
    <PodiumSection
      tournamentId="t-1"
      scopeKey="A"
      classification={completed ? classification(7) : null}
      skeleton={SKELETON_7}
      completionToken={completed ? "2026-08-22T10:00:00.000Z" : null}
      backgroundUrl={null}
    />
  );
}

describe("A-C: stan przed zakończeniem i układ sceny", () => {
  const html = renderPodium(false);

  it("A: miejsca 1-3 czekają jako placeholdery", () => {
    expect(html).toContain("Klasyfikacja końcowa");
    expect(html).not.toContain("Drużyna 1");
    // Puste podium nie tłumaczy się tekstem.
    expect(html).not.toMatch(/zostanie odsłonięt|Czekamy|wkrótce/i);
  });

  it("B: miejsca 4+ też mają placeholdery, nie pustkę", () => {
    expect(html).toContain('data-testid="podium-tail"');

    const tail = html.slice(html.indexOf('data-testid="podium-tail"'));

    for (const place of ["4", "5", "6", "7"]) {
      expect(tail).toContain(`>${place}<`);
    }
  });

  it("C: siedem drużyn daje cztery sloty w ogonie", () => {
    const tail = html.slice(html.indexOf('data-testid="podium-tail"'));
    const slots = tail.match(/<li /g) ?? [];

    expect(slots).toHaveLength(4);
  });

  it("ogon jest jednym rzędem w dolnej części sceny, nie listą kart", () => {
    const code = source("components/playoff/podium-section.tsx");

    expect(code).toContain("flex flex-wrap items-stretch justify-center");
    // Karty ogona nie leżą na fizycznych stopniach podium.
    expect(code).toContain("border-t border-white/10 pt-4");
  });
});

describe("D-H: kolejność i rytm odsłaniania", () => {
  function entries(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      position: index + 1,
      shared: false,
      team: { teamId: `t${index + 1}` },
    }));
  }

  it("D: dla siedmiu drużyn kolejność to 7,6,5,4,3,2,1", () => {
    const order = buildRevealOrder(entries(7)).map((item) => item.key);

    expect(order).toEqual(["t7", "t6", "t5", "t4", "t3", "t2", "t1"]);
  });

  it("E: dla dowolnego N kolejność biegnie od ostatniego do pierwszego", () => {
    for (const n of [2, 4, 5, 9, 16]) {
      const order = buildRevealOrder(entries(n)).map((item) => item.key);

      expect(order[0]).toBe(`t${n}`);
      expect(order[order.length - 1]).toBe("t1");
    }
  });

  it("F: ogon wypełnia się od prawej, czyli od miejsca 7 do 4", () => {
    const order = buildRevealOrder(entries(7));
    const delay = new Map(order.map((item) => [item.key, item.delayMs]));

    // Layout to 4|5|6|7, więc rosnący numer miejsca = mniejsze opóźnienie.
    expect(delay.get("t7")!).toBeLessThan(delay.get("t6")!);
    expect(delay.get("t6")!).toBeLessThan(delay.get("t5")!);
    expect(delay.get("t5")!).toBeLessThan(delay.get("t4")!);
  });

  it("G/H: podium wchodzi 3 → 2 → 1, zwycięzca na samym końcu", () => {
    const order = buildRevealOrder(entries(7));
    const delay = new Map(order.map((item) => [item.key, item.delayMs]));

    expect(delay.get("t3")!).toBeLessThan(delay.get("t2")!);
    expect(delay.get("t2")!).toBeLessThan(delay.get("t1")!);
    expect(order[order.length - 1].key).toBe("t1");

    // Zwycięzca dostaje dodatkową pauzę — kulminacja, nie zwłoka.
    const podiumStep = delay.get("t2")! - delay.get("t3")!;
    expect(delay.get("t1")! - delay.get("t2")!).toBeGreaterThan(podiumStep);
  });

  it("cała ceremonia dla siedmiu drużyn mieści się w 2,5-3,0 s", () => {
    const total = getRevealTotalMs(buildRevealOrder(entries(7)));

    expect(total).toBeGreaterThanOrEqual(2500);
    expect(total).toBeLessThanOrEqual(3000);
  });
});

describe("I-N: przycisk celebracji", () => {
  const base = {
    classificationComplete: true,
    seen: false,
    scopeKey: "A",
  };

  it("I: przed zakończeniem prowadzi do wyników", () => {
    const cta = describeCelebrationCta({ ...base, isCompleted: false });

    expect(cta.kind).toBe("results");
    expect(cta.label).toBe("Sprawdź wyniki");
    expect(cta.targetId).toBe("results-section");
    expect(cta.shine).toBe(false);
  });

  it("J: po zakończeniu zaprasza na celebrację", () => {
    const cta = describeCelebrationCta({ ...base, isCompleted: true });

    expect(cta.kind).toBe("celebration");
    expect(cta.label).toBe("Zobacz celebrację");
    expect(cta.targetId).toBe(celebrationSectionId("A"));
  });

  it("niekompletna klasyfikacja nie zaprasza na celebrację", () => {
    const cta = describeCelebrationCta({
      ...base,
      isCompleted: true,
      classificationComplete: false,
    });

    expect(cta.kind).toBe("results");
  });

  it("M: nieobejrzana ceremonia dostaje jednorazowy błysk", () => {
    expect(describeCelebrationCta({ ...base, isCompleted: true }).shine).toBe(
      true
    );
  });

  it("N: po obejrzeniu błysk znika, a przycisk zostaje skrótem", () => {
    const cta = describeCelebrationCta({
      ...base,
      isCompleted: true,
      seen: true,
    });

    expect(cta.shine).toBe(false);
    expect(cta.label).toBe("Zobacz klasyfikację");
    // Nie ukrywamy go — to wygodna droga do finalnych wyników.
    expect(cta.kind).toBe("celebration");
  });

  it("P: przycisk celuje w podium WYBRANEJ grupy", () => {
    expect(
      describeCelebrationCta({ ...base, isCompleted: true, scopeKey: "B" })
        .targetId
    ).toBe(celebrationSectionId("B"));
  });
});

describe("K/L/O: gdzie stoi przycisk i co robi klik", () => {
  const header = source("components/tournament-header.tsx");
  const standings = source("components/standings-table.tsx");
  const button = source("components/celebration-cta.tsx");

  it("K: desktop nie dostaje drugiego dużego CTA przy Rankingu", () => {
    // Przy tabeli przycisk pojawia się wyłącznie poniżej breakpointu md.
    expect(standings).toContain('className="mt-3 md:hidden"');
    // W hero to TEN SAM slot co „Sprawdź wyniki", nie dodatkowy przycisk.
    expect(header).toContain("<CelebrationButton");
    expect(header).not.toContain("Sprawdź wyniki");
  });

  it("L: na telefonie przycisk stoi przy Rankingu", () => {
    expect(standings).toContain("CelebrationButton");
    expect(standings).toContain('celebration?.kind === "celebration"');
  });

  it("O: klik przewija, ale nie oznacza ceremonii jako obejrzanej", () => {
    expect(button).toContain("scrollIntoView");
    expect(button).toContain('behavior: "smooth"');
    // Zapisanie „obejrzane" należy wyłącznie do podium po pełnym reveal.
    expect(button).not.toContain("markRevealSeen");
    expect(button).not.toContain("localStorage");
  });

  it("hero prowadzi do wyników albo do celebracji tym samym przyciskiem", () => {
    const shell = source("components/tournament-shell.tsx");

    expect(shell).toContain("useCelebration");
    // Grupa pochodzi z adresu, więc przycisk celuje w oglądaną grupę.
    expect(shell).toContain('searchParams.get("group")');
  });
});

describe("Q-U: wyzwalanie i zapamiętanie", () => {
  const podium = source("components/playoff/podium-section.tsx");

  it("Q/R: ceremonia rusza z obserwatora widoczności, nie z kliknięcia", () => {
    expect(podium).toContain("new IntersectionObserver");
    // Wysoka sekcja też musi umieć osiągnąć próg.
    expect(podium).toContain("threshold: 0");
    expect(podium).toContain('rootMargin: "0px 0px -20% 0px"');
  });

  it("S: pełna ceremonia oznacza celebrację jako obejrzaną", () => {
    expect(podium).toContain("getRevealTotalMs(revealOrder)");
    expect(podium).toContain("markSeen(storageKey)");
    expect(podium).toContain("CELEBRATION_SEEN_EVENT");
  });

  it("T/U: klucz nadal zawiera turniej, grupę i token finalizacji", () => {
    expect(podium).toContain("buildPodiumStorageKey({");
    expect(podium).toContain("tournamentId,");
    expect(podium).toContain("scopeKey,");
    expect(podium).toContain("completionToken,");
  });

  it("sekcja klasyfikacji ma własną kotwicę per grupa", () => {
    expect(podium).toContain("id={celebrationSectionId(scopeKey)}");
    expect(celebrationSectionId("A")).not.toBe(celebrationSectionId("B"));
  });
});

describe("V-Z: czyste placeholdery drabinki", () => {
  const card = source("components/playoff/bracket-card.tsx");
  const html = renderPodium(false);

  it("V: pusty slot pokazuje znak zapytania", () => {
    expect(card).toContain('{team ? team.name : "?"}');
  });

  it("W: semantyka slotu zostaje w etykiecie dostępności", () => {
    expect(card).toContain("aria-label={team ? undefined :");
    expect(card).toContain("jeszcze nieustalony");
  });

  it("X/Y/Z: opisowe teksty znikają z widoku", () => {
    expect(card).not.toContain("Zwycięzca poprzedniej rundy");
    expect(card).not.toContain("Przegrany półfinału");
    expect(card).not.toMatch(/>Miejsce /);

    // Podium też nie tłumaczy pustych slotów słowami.
    expect(html).not.toContain("Zwycięzca");
  });
});

describe("AA: prefers-reduced-motion", () => {
  const css = source("app/globals.css");
  const podium = source("components/playoff/podium-section.tsx");

  it("bez ruchu nie ma ani sekwencji, ani błysku", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(block).toContain(".cta-shine::after");
    expect(block).toContain("display: none");

    // Podium pokazuje stan końcowy od razu i od razu zapisuje „obejrzane".
    expect(podium).toContain("reducedMotion");
    expect(podium).toContain("markSeen(storageKey)");
  });
});
