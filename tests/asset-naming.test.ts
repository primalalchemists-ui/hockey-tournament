import { describe, expect, it } from "vitest";

import {
  AIRTABLE_ASSET_HOST,
  buildTeamLogoPublicId,
  buildTournamentAssetPublicId,
  isAirtableAssetUrl,
  isCloudinaryUrl,
  sanitizeIdSegment,
} from "@/lib/assets/naming";

describe("rozpoznawanie źródła assetu", () => {
  it("wykrywa URL-e Airtable", () => {
    expect(
      isAirtableAssetUrl("https://v5.airtableusercontent.com/v3/u/45/abc/logo.png")
    ).toBe(true);
    expect(isAirtableAssetUrl(`https://cokolwiek.${AIRTABLE_ASSET_HOST}/x`)).toBe(true);
  });

  it("nie myli Cloudinary z Airtable", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v1/tournaments/x.png";

    expect(isAirtableAssetUrl(url)).toBe(false);
    expect(isCloudinaryUrl(url)).toBe(true);
  });

  it("odrzuca puste i nie-Cloudinary adresy", () => {
    expect(isCloudinaryUrl("")).toBe(false);
    expect(isCloudinaryUrl(null)).toBe(false);
    expect(isCloudinaryUrl(undefined)).toBe(false);
    expect(isCloudinaryUrl("https://example.com/logo.png")).toBe(false);
    // wyłącznie HTTPS
    expect(isCloudinaryUrl("http://res.cloudinary.com/demo/x.png")).toBe(false);
    // ochrona przed podszyciem się pod host
    expect(isCloudinaryUrl("https://evil.com/res.cloudinary.com/x.png")).toBe(false);
  });
});

describe("sanitizeIdSegment", () => {
  it("normalizuje niedozwolone znaki", () => {
    expect(sanitizeIdSegment("Rabbit Cup 2026")).toBe("rabbit-cup-2026");
    expect(sanitizeIdSegment("a/b c")).toBe("a-b-c");
    expect(sanitizeIdSegment("--x--")).toBe("x");
  });

  it("zachowuje znaki dozwolone przez Cloudinary", () => {
    expect(sanitizeIdSegment("hero_banner")).toBe("hero_banner");
    expect(sanitizeIdSegment("a-1773351457254")).toBe("a-1773351457254");
  });

  it("nigdy nie zwraca pustego segmentu", () => {
    expect(sanitizeIdSegment("///")).toBe("unknown");
    expect(sanitizeIdSegment("")).toBe("unknown");
  });
});

describe("deterministyczne public_id", () => {
  it("logo drużyny trafia do tournaments/<slug>/teams/<id>", () => {
    expect(buildTeamLogoPublicId("rabbit-cup", "a-1773351457254")).toBe(
      "tournaments/rabbit-cup/teams/a-1773351457254"
    );
  });

  it("asset turnieju trafia do tournaments/<slug>/assets/<kind>", () => {
    expect(buildTournamentAssetPublicId("rabbit-cup", "hero_banner")).toBe(
      "tournaments/rabbit-cup/assets/hero_banner"
    );
  });

  it("jest stabilne — powtórne wywołanie daje ten sam identyfikator", () => {
    // To jest podstawa idempotencji rehostu: ten sam public_id + overwrite
    // oznacza nadpisanie tego samego obiektu, a nie kolejną kopię.
    const first = buildTeamLogoPublicId("rabbit-cup", "b-1");
    const second = buildTeamLogoPublicId("rabbit-cup", "b-1");

    expect(first).toBe(second);
  });

  it("różne drużyny dostają różne public_id, nawet przy identycznym logo", () => {
    // Świadoma decyzja: nie współdzielimy jednego obiektu Cloudinary między
    // rekordami, bo panel kasuje assety po public_id.
    expect(buildTeamLogoPublicId("rabbit-cup", "a-1")).not.toBe(
      buildTeamLogoPublicId("rabbit-cup", "b-1")
    );
  });

  it("różne turnieje nie kolidują ze sobą", () => {
    expect(buildTeamLogoPublicId("cup-2025", "a-1")).not.toBe(
      buildTeamLogoPublicId("cup-2026", "a-1")
    );
  });
});
