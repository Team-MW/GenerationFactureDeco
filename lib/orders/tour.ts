/**
 * Calcul de l'ordre de passage d'une tournée à partir des temps de trajet entre tous les points.
 *
 * - Jusqu'à 14 arrêts : solution exacte (toutes les combinaisons sont comparées, méthode de Held-Karp).
 *   C'est garanti le trajet le plus court en temps de route.
 * - Au-delà : très bonne solution par améliorations successives (plus proche voisin, puis 2-opt et déplacements).
 *
 * `cost[i][j]` = temps de trajet du point i au point j (pas forcément symétrique : sens uniques, etc.).
 */
export const EXACT_LIMIT = 14;

/** Tournée fermée : part du point 0 (le dépôt), passe par tous les autres, revient au point 0. */
export function solveRoundTrip(cost: number[][]): { order: number[]; exact: boolean } {
  const n = cost.length - 1; // nombre d'arrêts, hors dépôt
  if (n <= 0) return { order: [], exact: true };
  if (n === 1) return { order: [1], exact: true };
  if (n <= EXACT_LIMIT) return { order: heldKarp(cost, true), exact: true };
  return { order: improve(nearestNeighbour(cost), cost, true), exact: false };
}

/** Tournée ouverte (pas de dépôt connu) : meilleur chemin passant par tous les points, départ et arrivée libres. */
export function solveOpenPath(cost: number[][]): { order: number[]; exact: boolean } {
  const n = cost.length;
  if (n <= 1) return { order: n ? [0] : [], exact: true };
  // On ajoute un dépôt fictif à distance nulle de tous les points : la tournée fermée devient un chemin libre.
  const padded = [new Array(n + 1).fill(0), ...cost.map((row) => [0, ...row])];
  const solved = solveRoundTrip(padded);
  return { order: solved.order.map((i) => i - 1), exact: solved.exact };
}

/** Exact : programmation dynamique sur les sous-ensembles d'arrêts. */
function heldKarp(cost: number[][], roundTrip: boolean): number[] {
  const n = cost.length - 1;
  const full = 1 << n;
  const best = new Float64Array(full * n).fill(Infinity);
  const from = new Int8Array(full * n).fill(-1);
  for (let j = 0; j < n; j++) best[(1 << j) * n + j] = cost[0][j + 1];
  for (let mask = 1; mask < full; mask++) {
    for (let j = 0; j < n; j++) {
      const current = best[mask * n + j];
      if (!(mask & (1 << j)) || current === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const next = mask | (1 << k);
        const value = current + cost[j + 1][k + 1];
        if (value < best[next * n + k]) {
          best[next * n + k] = value;
          from[next * n + k] = j;
        }
      }
    }
  }
  let last = 0;
  let total = Infinity;
  for (let j = 0; j < n; j++) {
    const value = best[(full - 1) * n + j] + (roundTrip ? cost[j + 1][0] : 0);
    if (value < total) {
      total = value;
      last = j;
    }
  }
  const order: number[] = [];
  let mask = full - 1;
  for (let j = last; j >= 0; ) {
    order.push(j + 1);
    const previous = from[mask * n + j];
    mask ^= 1 << j;
    j = previous;
  }
  return order.reverse();
}

function nearestNeighbour(cost: number[][]): number[] {
  const left = new Set<number>();
  for (let i = 1; i < cost.length; i++) left.add(i);
  const order: number[] = [];
  let at = 0;
  while (left.size) {
    let pick = -1;
    for (const i of left) if (pick < 0 || cost[at][i] < cost[at][pick]) pick = i;
    order.push(pick);
    left.delete(pick);
    at = pick;
  }
  return order;
}

export function tourCost(order: number[], cost: number[][], roundTrip: boolean): number {
  let total = 0;
  let at = 0;
  for (const i of order) {
    total += cost[at][i];
    at = i;
  }
  return roundTrip ? total + cost[at][0] : total;
}

/** Améliorations locales répétées : inversion d'un tronçon (2-opt) et déplacement d'un arrêt. */
function improve(start: number[], cost: number[][], roundTrip: boolean): number[] {
  let order = start;
  let value = tourCost(order, cost, roundTrip);
  for (let pass = 0; pass < 60; pass++) {
    let better = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const reversed = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const v = tourCost(reversed, cost, roundTrip);
        if (v < value - 1e-9) {
          order = reversed;
          value = v;
          better = true;
        }
      }
    }
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        if (i === j) continue;
        const moved = order.filter((_, k) => k !== i);
        moved.splice(j, 0, order[i]);
        const v = tourCost(moved, cost, roundTrip);
        if (v < value - 1e-9) {
          order = moved;
          value = v;
          better = true;
        }
      }
    }
    if (!better) break;
  }
  return order;
}
