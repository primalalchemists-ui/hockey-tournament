import type { QualifiedTeamCount } from "@/types/tournament-config";

/**
 * Standardowe, zbalansowane rozstawienie single-elimination.
 *
 * JEDEN generyczny generator dla 2 / 4 / 8 / 16 — bez czterech osobnych
 * algorytmów. Buduje kolejność slotów rekurencyjnie:
 *
 *   order(1)  = [1]
 *   order(2n) = dla każdego s z order(n): [s, 2n + 1 - s]
 *
 * Właściwość, o którą chodzi: najlepiej rozstawieni mogą spotkać się
 * dopiero możliwie najpóźniej (1 z 2 dopiero w finale).
 *
 *   2  -> [1, 2]                       -> 1v2
 *   4  -> [1, 4, 2, 3]                 -> 1v4, 2v3
 *   8  -> [1, 8, 4, 5, 2, 7, 3, 6]     -> 1v8, 4v5, 2v7, 3v6
 *   16 -> [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
 */
export function buildSeedOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`Rozmiar drabinki musi być potęgą dwójki, otrzymano ${size}.`);
  }

  let order = [1];

  while (order.length < size) {
    const nextSize = order.length * 2;
    const next: number[] = [];

    for (const seed of order) {
      next.push(seed, nextSize + 1 - seed);
    }

    order = next;
  }

  return order;
}

/** Pary pierwszej rundy w kolejności slotów drabinki. */
export function buildFirstRoundPairs(
  size: QualifiedTeamCount
): Array<[number, number]> {
  const order = buildSeedOrder(size);
  const pairs: Array<[number, number]> = [];

  for (let index = 0; index < order.length; index += 2) {
    pairs.push([order[index], order[index + 1]]);
  }

  return pairs;
}
