/**
 * Hex geometry on cube coordinates, for movement rules. Pure: no Foundry imports.
 * - Lines between hexes (the path a token walks between two waypoints).
 * - Forced movement (p. 76): Push X / Pull X move the target up to X spaces, each space entered
 *   farther from (Push) or closer to (Pull) the forcing character, never into blocked spaces.
 */

export interface Cube { q: number; r: number; s: number }

export const DIRECTIONS: readonly Cube[] = [
  { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
  { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 },
];

export const cubeKey = (c: Cube): string => `${c.q},${c.r}`;
export const cubeAdd = (a: Cube, b: Cube): Cube => ({ q: a.q + b.q, r: a.r + b.r, s: a.s + b.s });

export function cubeDistance(a: Cube, b: Cube): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

export function neighbors(c: Cube): Cube[] {
  return DIRECTIONS.map((d) => cubeAdd(c, d));
}

function cubeRound(q: number, r: number, s: number): Cube {
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return { q: rq + 0, r: rr + 0, s: rs + 0 };
}

/** Hexes on the straight line from a to b, both included. */
export function cubeLine(a: Cube, b: Cube): Cube[] {
  const n = cubeDistance(a, b);
  if (n === 0) return [a];
  const out: Cube[] = [];
  // A tiny nudge keeps ties on hex edges consistent.
  const e = 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(cubeRound(
      a.q + e + (b.q - a.q) * t, a.r + e + (b.r - a.r) * t, a.s - 2 * e + (b.s - a.s) * t,
    ));
  }
  return out;
}

/** Hexes entered when walking through waypoints (the start is not "entered"). */
export function pathThrough(waypoints: readonly Cube[]): Cube[] {
  const out: Cube[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const seg = cubeLine(waypoints[i - 1]!, waypoints[i]!).slice(1);
    for (const c of seg) {
      const last = out[out.length - 1];
      if (!last || cubeKey(last) !== cubeKey(c)) out.push(c);
    }
  }
  return out;
}

/**
 * Where Push/Pull X can move a target: every reachable hex with the path to it (start excluded).
 * The start itself is included with an empty path (the forcing character may move it 0).
 */
export function forcedMoves(
  start: Cube, forcer: Cube, steps: number, kind: "push" | "pull", blocked: ReadonlySet<string>,
): Map<string, { cell: Cube; path: Cube[] }> {
  const out = new Map<string, { cell: Cube; path: Cube[] }>([[cubeKey(start), { cell: start, path: [] }]]);
  let frontier = [{ cell: start, path: [] as Cube[] }];
  for (let step = 0; step < Math.max(0, steps); step++) {
    const next: typeof frontier = [];
    for (const { cell, path } of frontier) {
      const d = cubeDistance(cell, forcer);
      for (const n of neighbors(cell)) {
        const nd = cubeDistance(n, forcer);
        if (kind === "push" ? nd <= d : nd >= d) continue;
        if (nd === 0) continue; // never into the forcing character's space
        const key = cubeKey(n);
        if (blocked.has(key) || out.has(key)) continue;
        const entry = { cell: n, path: [...path, n] };
        out.set(key, entry);
        next.push(entry);
      }
    }
    frontier = next;
  }
  return out;
}
