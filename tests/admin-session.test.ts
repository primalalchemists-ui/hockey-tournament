import { describe, expect, it } from "vitest";

import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  safeEquals,
  verifySessionToken,
} from "@/lib/admin-session";

const SECRET = "test-secret-value";

describe("token sesji admina", () => {
  it("akceptuje token podpisany właściwym sekretem", () => {
    const token = createSessionToken(SECRET);
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("ODRZUCA dawną stałą wartość 'ok' (podatność z audytu)", () => {
    expect(verifySessionToken("ok", SECRET)).toBe(false);
  });

  it("odrzuca token podpisany innym sekretem", () => {
    const token = createSessionToken("inny-sekret");
    expect(verifySessionToken(token, SECRET)).toBe(false);
  });

  it("odrzuca token z podmienioną datą wygaśnięcia", () => {
    const token = createSessionToken(SECRET);
    const [version, , signature] = token.split(".");
    const farFuture = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;

    expect(
      verifySessionToken(`${version}.${farFuture}.${signature}`, SECRET)
    ).toBe(false);
  });

  it("odrzuca token po wygaśnięciu", () => {
    const issuedAt = Date.now();
    const token = createSessionToken(SECRET, issuedAt);

    const justBefore = issuedAt + (SESSION_MAX_AGE_SECONDS - 5) * 1000;
    const justAfter = issuedAt + (SESSION_MAX_AGE_SECONDS + 5) * 1000;

    expect(verifySessionToken(token, SECRET, justBefore)).toBe(true);
    expect(verifySessionToken(token, SECRET, justAfter)).toBe(false);
  });

  it("odrzuca wartości puste, zniekształcone i bez sekretu", () => {
    expect(verifySessionToken(undefined, SECRET)).toBe(false);
    expect(verifySessionToken("", SECRET)).toBe(false);
    expect(verifySessionToken("a.b", SECRET)).toBe(false);
    expect(verifySessionToken("a.b.c.d", SECRET)).toBe(false);
    expect(verifySessionToken("v2.999999999999.sig", SECRET)).toBe(false);
    expect(verifySessionToken("v1.notanumber.sig", SECRET)).toBe(false);
    expect(verifySessionToken(createSessionToken(SECRET), null)).toBe(false);
  });
});

describe("safeEquals", () => {
  it("porównuje poprawnie napisy równe i różne", () => {
    expect(safeEquals("tajne-haslo", "tajne-haslo")).toBe(true);
    expect(safeEquals("tajne-haslo", "tajne-haslo ")).toBe(false);
    expect(safeEquals("tajne-haslo", "inne")).toBe(false);
    expect(safeEquals("", "")).toBe(true);
  });

  it("obsługuje znaki spoza ASCII", () => {
    expect(safeEquals("hasło-ąęć", "hasło-ąęć")).toBe(true);
    expect(safeEquals("hasło-ąęć", "haslo-aec")).toBe(false);
  });
});
