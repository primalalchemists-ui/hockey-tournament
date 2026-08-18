import { describe, expect, it } from "vitest";

import { buildBracketTopology } from "@/lib/playoff/topology";
import { describeStage, describeRoundTone, STAGE_LABELS } from "@/lib/playoff/stage";

/**
 * PEŁNA DRABINKA OD POCZĄTKU TURNIEJU.
 *
 * Kibic ma od razu widzieć format: ile rund, gdzie prowadzą i czy jest
 * mecz o 3. miejsce — nawet zanim padnie pierwszy gol.
 */

function topology(size: 2 | 4 | 8 | 16, thirdPlaceMatch = false, extra = {}) {
  return buildBracketTopology({
    scopeKey: "A",
    size,
    thirdPlaceMatch,
    ...extra,
  });
}

describe("A-D: pełna topologia dla każdego rozmiaru", () => {
  it("A: 2 drużyny = sam finał", () => {
    expect(topology(2).map((round) => round.kind)).toEqual(["final"]);
  });

  it("B: 4 drużyny = półfinały → finał", () => {
    expect(topology(4).map((round) => round.kind)).toEqual([
      "semifinal",
      "final",
    ]);
  });

  it("B: z meczem o 3. miejsce dochodzi osobna runda", () => {
    expect(topology(4, true).map((round) => round.kind)).toEqual([
      "semifinal",
      "final",
      "third_place",
    ]);
  });

  it("C: 8 drużyn = ćwierćfinały → półfinały → finał", () => {
    expect(topology(8).map((round) => round.kind)).toEqual([
      "quarterfinal",
      "semifinal",
      "final",
    ]);
  });

  it("D: 16 drużyn = 1/8 → ćwierćfinały → półfinały → finał", () => {
    expect(topology(16).map((round) => round.kind)).toEqual([
      "round_of_16",
      "quarterfinal",
      "semifinal",
      "final",
    ]);
  });

  it("liczba meczów w rundzie połowi się aż do finału", () => {
    expect(topology(16).map((round) => round.matches.length)).toEqual([
      8, 4, 2, 1,
    ]);
  });
});

describe("E/G: stan przed pierwszym wynikiem", () => {
  it("E: bez wyników pierwsza runda też jest pusta", () => {
    const rounds = topology(4, true);
    const semifinal = rounds[0];

    expect(semifinal.matches).toHaveLength(2);

    for (const match of semifinal.matches) {
      // Kolejność danych to NIE jest sportowy ranking.
      expect(match.homeTeamId).toBeNull();
      expect(match.awayTeamId).toBeNull();
    }
  });

  it("E: rozstawienie jest znane mimo braku drużyn", () => {
    const [semifinal] = topology(4);

    expect(semifinal.matches[0].homeSource).toEqual({ type: "seed", seed: 1 });
    expect(semifinal.matches[0].awaySource).toEqual({ type: "seed", seed: 4 });
  });

  it("G: dalsze rundy pozostają puste także po rozstawieniu grupy", () => {
    const rounds = topology(4, true, {
      liveSeeding: new Map([
        [1, "t1"],
        [2, "t2"],
        [3, "t3"],
        [4, "t4"],
      ]),
    });

    const [semifinal, final, thirdPlace] = rounds;

    expect(semifinal.matches[0].homeTeamId).toBe("t1");
    // Zwycięzcy półfinałów nie da się przewidzieć.
    expect(final.matches[0].homeTeamId).toBeNull();
    expect(final.matches[0].awayTeamId).toBeNull();
    expect(thirdPlace.matches[0].homeTeamId).toBeNull();
  });
});

describe("F: bieżące rozstawienie po pierwszym wyniku", () => {
  it("pierwsza runda dostaje drużyny z aktualnej tabeli", () => {
    const [semifinal] = topology(4, false, {
      liveSeeding: new Map([
        [1, "zaglebie"],
        [2, "mosm"],
        [3, "polonia"],
        [4, "gks"],
      ]),
    });

    expect(semifinal.matches[0].homeTeamId).toBe("zaglebie");
    expect(semifinal.matches[0].awayTeamId).toBe("gks");
    expect(semifinal.matches[1].homeTeamId).toBe("mosm");
    expect(semifinal.matches[1].awayTeamId).toBe("polonia");

    // Skład wynika z niezamrożonej tabeli — może się jeszcze zmienić.
    expect(semifinal.matches.every((match) => match.provisional)).toBe(true);
  });

  it("niepełna tabela wypełnia tylko znane miejsca", () => {
    const [semifinal] = topology(4, false, {
      liveSeeding: new Map([
        [1, "zaglebie"],
        [2, "mosm"],
      ]),
    });

    expect(semifinal.matches[0].homeTeamId).toBe("zaglebie");
    expect(semifinal.matches[0].awayTeamId).toBeNull();
  });
});

describe("I-L: oficjalna drabinka po zamrożeniu", () => {
  const official = [
    {
      externalId: "po-A-semifinal-0",
      homeTeamId: "zaglebie",
      awayTeamId: "gks",
      homeScore: 4,
      awayScore: 1,
    },
    {
      externalId: "po-A-semifinal-1",
      homeTeamId: "mosm",
      awayTeamId: "polonia",
      homeScore: null,
      awayScore: null,
    },
    {
      externalId: "po-A-final-0",
      homeTeamId: "zaglebie",
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
    },
    {
      externalId: "po-A-third_place-0",
      homeTeamId: "gks",
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
    },
  ];

  const rounds = topology(4, true, { officialMatches: official });

  it("I: uczestnicy pierwszej rundy przestają być prowizoryczni", () => {
    const [semifinal] = rounds;

    expect(semifinal.matches[0].homeTeamId).toBe("zaglebie");
    expect(semifinal.matches.every((match) => !match.provisional)).toBe(true);
  });

  it("J: zwycięzca półfinału trafia do finału", () => {
    const final = rounds.find((round) => round.kind === "final")!;

    expect(final.matches[0].homeTeamId).toBe("zaglebie");
    // Drugi półfinał nierozegrany — slot pozostaje pusty.
    expect(final.matches[0].awayTeamId).toBeNull();
  });

  it("K: przegrany półfinału trafia do meczu o 3. miejsce", () => {
    const third = rounds.find((round) => round.kind === "third_place")!;

    expect(third.matches[0].homeTeamId).toBe("gks");
    expect(third.matches[0].awayTeamId).toBeNull();
  });

  it("L: nic nie wypełnia się dwie rundy do przodu", () => {
    const deep = buildBracketTopology({
      scopeKey: "A",
      size: 8,
      thirdPlaceMatch: false,
      officialMatches: [
        {
          externalId: "po-A-quarterfinal-0",
          homeTeamId: "t1",
          awayTeamId: "t8",
          homeScore: 5,
          awayScore: 0,
        },
      ],
    });

    const semifinal = deep.find((round) => round.kind === "semifinal")!;
    const final = deep.find((round) => round.kind === "final")!;

    // Zwycięzca ćwierćfinału zna swój półfinał tylko wtedy, gdy zapisał go
    // silnik — a finał na pewno nie zna nikogo.
    expect(final.matches[0].homeTeamId).toBeNull();
    expect(final.matches[0].awayTeamId).toBeNull();
    expect(semifinal.matches[0].awayTeamId).toBeNull();
  });
});

describe("M-U: prezentacja etapu", () => {
  it("M-R: publiczne nazwy etapów", () => {
    expect(describeStage("group_stage").label).toBe("Faza grupowa");
    expect(describeStage("round_of_16").label).toBe("1/8 finału");
    expect(describeStage("quarterfinal").label).toBe("Ćwierćfinały");
    expect(describeStage("semifinal").label).toBe("Półfinały");
    expect(describeStage("final").label).toBe("Finał");
    expect(describeStage("completed").label).toBe("Turniej zakończony");
  });

  it("S/T: ton fazy grupowej i finału są różne", () => {
    expect(describeStage("group_stage").tone).toBe("group");
    expect(describeStage("final").tone).toBe("final");
    expect(STAGE_LABELS.final).toBe("Finał");
  });

  it("U: mecz o 3. miejsce ma własny ton, ale nie jest fazą", () => {
    expect(describeRoundTone("third_place")).toBe("third_place");
    // W typie TournamentPhase nie ma takiej wartości — to runda, nie faza.
    expect(Object.keys(STAGE_LABELS)).not.toContain("third_place");
  });

  it("każda runda drabinki niesie swój ton", () => {
    const rounds = topology(16, false);

    expect(rounds.map((round) => round.tone)).toEqual([
      "round_of_16",
      "quarterfinal",
      "semifinal",
      "final",
    ]);
  });
});
