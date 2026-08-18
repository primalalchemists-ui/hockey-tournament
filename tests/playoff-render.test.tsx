import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlayoffBracket } from "@/components/playoff/playoff-bracket";
import { PlacementSection } from "@/components/playoff/placement-section";
import { PodiumSection } from "@/components/playoff/podium-section";
import { buildClassificationSkeleton } from "@/lib/playoff/classification";
import { classification, placement, scope } from "./helpers/view-fixtures";

/**
 * KONTRAKT RENDERU sekcji pucharowych.
 *
 * Polish wizualny nie może zmienić tego, CO widzi kibic: gdzie jest
 * przewijanie, kiedy pojawiają się drużyny, jak wygląda puste podium.
 */

const ARTWORK = "https://res.cloudinary.com/demo/image/upload/bracket.jpg";

const SKELETON = buildClassificationSkeleton({
  teamCount: 7,
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
});

describe("drabinka", () => {
  it("D: zachowuje własny kontener przewijania poziomego", () => {
    const html = renderToStaticMarkup(
      <PlayoffBracket scope={scope()} backgroundUrl={null} />
    );

    expect(html).toContain('data-testid="bracket-scroll"');
    expect(html).toContain("overflow-x-auto");
  });

  it("E: własne tło turnieju trafia na scenę jako artwork", () => {
    const html = renderToStaticMarkup(
      <PlayoffBracket scope={scope()} backgroundUrl={ARTWORK} />
    );

    expect(html).toContain('data-has-artwork="true"');
    expect(html).toContain(ARTWORK);
  });

  it("F: bez grafiki scena nadal istnieje i używa neutralnego tła", () => {
    const html = renderToStaticMarkup(
      <PlayoffBracket scope={scope()} backgroundUrl={null} />
    );

    expect(html).toContain('data-has-artwork="false"');
    expect(html).not.toContain("background-image");
    expect(html).toContain("Faza play-off");
  });

  it("wynik rozegranego meczu jest widoczny, nierozegranego — nie jest zerem", () => {
    const html = renderToStaticMarkup(
      <PlayoffBracket scope={scope()} backgroundUrl={null} />
    );

    expect(html).toContain("Zwycięzca SF1");
    expect(html).toContain(">3<");
  });
});

describe("minigrupa", () => {
  it("I: pozycje są przesunięte o zakres miejsc, nie liczone od 1", () => {
    const html = renderToStaticMarkup(<PlacementSection placement={placement()} />);

    expect(html).toContain("Klasyfikacja miejsc 5–7");
    expect(html).toContain(">5<");
  });

  it("I: nierozegrany mecz nie udaje wyniku 0:0", () => {
    const html = renderToStaticMarkup(<PlacementSection placement={placement()} />);

    expect(html).toContain("—");
    expect(html).not.toContain("0 : 0");
  });
});

describe("podium", () => {
  function renderPodium(options: {
    completed: boolean;
    backgroundUrl?: string | null;
  }) {
    return renderToStaticMarkup(
      <PodiumSection
        tournamentId="t-1"
        scopeKey="A"
        classification={options.completed ? classification(7) : null}
        skeleton={SKELETON}
        completionToken={options.completed ? "2026-08-22T10:00:00.000Z" : null}
        backgroundUrl={options.backgroundUrl ?? null}
      />
    );
  }

  it("G: przed zakończeniem podium ISTNIEJE i pokazuje puste sloty", () => {
    const html = renderPodium({ completed: false });

    expect(html).toContain("Klasyfikacja końcowa");
    // Siedem znaków zapytania = siedem slotów ze szkieletu.
    expect(html.split("?").length - 1).toBeGreaterThanOrEqual(7);
  });

  it("G: puste podium nie tłumaczy się tekstem", () => {
    const html = renderPodium({ completed: false });

    expect(html).not.toMatch(/zostanie|Czekamy|jeszcze nie|wkrótce/i);
  });

  it("G: przed zakończeniem nie pokazuje żadnej drużyny", () => {
    const html = renderPodium({ completed: false });

    expect(html).not.toContain("Drużyna 1");
  });

  it("H: po zakończeniu pokazuje pełną klasyfikację", () => {
    const html = renderPodium({ completed: true });

    expect(html).toContain("Drużyna 1");
    expect(html).toContain("Drużyna 7");
  });

  it("C/D tła: podium działa z własną grafiką i bez niej", () => {
    const withArtwork = renderPodium({
      completed: true,
      backgroundUrl: "https://res.cloudinary.com/demo/image/upload/podium.jpg",
    });
    const withoutArtwork = renderPodium({ completed: true });

    expect(withArtwork).toContain("podium.jpg");
    expect(withoutArtwork).not.toContain("background-image");
    expect(withoutArtwork).toContain("Klasyfikacja końcowa");
  });
});
