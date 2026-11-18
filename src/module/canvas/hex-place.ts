/**
 * Hex placement on the canvas: preview an area pattern (cluster, line, cone...) under the cursor,
 * rotate it with the mouse wheel, click to place; or click N single hexes (traps, obstacles,
 * summons). Right-click or Escape cancels. Results are grid offsets.
 */
import type { Area } from "../rules/power-actions.ts";

export interface Cube { q: number; r: number; s: number }
export interface Offset { i: number; j: number }

const DIRS: Cube[] = [
  { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
  { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 },
];
const add = (a: Cube, b: Cube): Cube => ({ q: a.q + b.q, r: a.r + b.r, s: a.s + b.s });
const scale = (a: Cube, k: number): Cube => ({ q: a.q * k, r: a.r * k, s: a.s * k });
const rotate = (c: Cube, steps: number): Cube => {
  let out = c;
  for (let i = 0; i < ((steps % 6) + 6) % 6; i++) out = { q: -out.r, r: -out.s, s: -out.q };
  return out;
};
const dist = (c: Cube) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s));
const ZERO: Cube = { q: 0, r: 0, s: 0 };

/** Mirror a cube coordinate (areas may be mirrored, p. 79). */
const mirror = (c: Cube): Cube => ({ q: c.q, r: c.s, s: c.r });

/** Angle (degrees) of a cube offset in hex space, 0 along DIRS[0]. */
function angleOf(c: Cube): number {
  const x = Math.sqrt(3) * (c.q + c.r / 2);
  const y = 1.5 * c.r;
  const base = Math.atan2(1.5 * DIRS[0]!.r, Math.sqrt(3) * (DIRS[0]!.q + DIRS[0]!.r / 2));
  let a = ((Math.atan2(y, x) - base) * 180) / Math.PI;
  while (a <= -180) a += 360;
  while (a > 180) a -= 360;
  return a;
}

/**
 * Cells of an area relative to its anchor, before rotation. "Anchored" areas start next to the
 * acting character (whose hex is the origin); others follow the cursor.
 */
export function areaCells(area: Area): { cells: Cube[]; anchored: boolean } {
  const n = Math.max(1, area.size);
  const adjacent = area.anchor === "adjacent";
  switch (area.shape) {
    case "line": {
      const start = adjacent ? 1 : 0;
      return { cells: Array.from({ length: n }, (_, k) => scale(DIRS[0]!, k + start)), anchored: adjacent };
    }
    case "cone":
    case "arc": {
      // Nearest hexes within the arc's angle, centered on a direction (60° for a cone).
      const degrees = area.shape === "cone" ? 60 : area.degrees ?? Math.min(360, n * 60);
      const center = degrees / 60 % 2 === 0 ? 30 : 0;
      const candidates: { c: Cube; d: number; a: number }[] = [];
      for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
        const c = { q, r, s: -q - r };
        const d = dist(c);
        if (d === 0 || d > 5) continue;
        const a = Math.abs(angleOf(c) - center);
        if (a <= degrees / 2 + 0.01) candidates.push({ c, d, a });
      }
      candidates.sort((x, y) => x.d - y.d || x.a - y.a);
      return { cells: candidates.slice(0, n).map((x) => x.c), anchored: true };
    }
    default: {
      // Cluster / circle, "as rounded as possible": 2 = pair, 3 = triangle, 4 = rhombus, 7 = flower.
      let cells: Cube[];
      if (n === 4) cells = [ZERO, DIRS[0]!, DIRS[1]!, add(DIRS[0]!, DIRS[1]!)];
      else {
        cells = [ZERO, ...DIRS].slice(0, Math.min(7, n));
        for (let ring = 2; cells.length < n; ring++) {
          for (const d of DIRS) if (cells.length < n) cells.push(scale(d, ring));
        }
      }
      // Adjacent clusters touch the character: shift them one step away from the origin.
      return { cells: adjacent ? cells.map((c) => add(c, DIRS[0]!)) : cells, anchored: adjacent };
    }
  }
}

/** Hexes within `radius` of a center (for "All, range X"). */
export function cellsWithin(radius: number): Cube[] {
  const out: Cube[] = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    const c = { q, r, s: -q - r };
    if (dist(c) <= radius) out.push(c);
  }
  return out;
}

function hexGrid() {
  const grid = canvas?.grid as unknown as {
    isHexagonal: boolean;
    getOffset(p: { x: number; y: number }): Offset;
    offsetToCube(o: Offset): Cube;
    cubeToOffset(c: Cube): Offset;
    getVertices(o: Offset): { x: number; y: number }[];
  } | undefined;
  return grid?.isHexagonal ? grid : null;
}

/** Polygon points (flat x,y list) of a hex. */
export function hexPolygon(offset: Offset): number[] {
  return hexGrid()?.getVertices(offset).flatMap((p) => [p.x, p.y]) ?? [];
}

export interface PlaceOptions {
  /** Area pattern to place; otherwise single hexes are clicked one by one. */
  area?: Area | null;
  /** Number of single hexes to click (default 1). */
  count?: number;
  /** The acting token, anchor of "adjacent", cone and arc shapes. */
  origin?: { center: { x: number; y: number } } | null;
  color?: number;
  hint?: string;
  /** Single picks only: the hexes that may be chosen (shown faintly). */
  allowed?: Offset[];
}

/** Let the user place hexes; resolves with the chosen offsets (null if cancelled). */
export function pickHexes(options: PlaceOptions): Promise<Offset[] | null> {
  const grid = hexGrid();
  if (!grid || !canvas?.ready) {
    ui.notifications?.warn("GLOOM.Place.needHex", { localize: true });
    return Promise.resolve(null);
  }
  const color = options.color ?? 0xe2662b;
  const shape = options.area ? areaCells(options.area) : null;
  const originCube = options.origin ? grid.offsetToCube(grid.getOffset(options.origin.center)) : null;
  const count = Math.max(1, options.count ?? 1);
  const picked: Offset[] = [];
  let rotation = 0;
  let mirrored = false;
  const g = new PIXI.Graphics();
  (canvas.controls ?? canvas.stage).addChild(g as never);
  if (options.hint) ui.notifications?.info(options.hint);

  const mouseCube = (): Cube => {
    const p = (canvas as unknown as { mousePosition: { x: number; y: number } }).mousePosition;
    return grid.offsetToCube(grid.getOffset(p));
  };
  const transform = (c: Cube) => rotate(mirrored ? mirror(c) : c, rotation);
  const currentCells = (): Offset[] => {
    if (!shape) return [grid.cubeToOffset(mouseCube())];
    if (options.area?.shape === "all" && originCube) {
      return cellsWithin(options.area.size).map((c) => grid.cubeToOffset(add(originCube, c)));
    }
    const anchor = shape.anchored && originCube ? originCube : mouseCube();
    return shape.cells.map((c) => grid.cubeToOffset(add(anchor, transform(c))));
  };
  const draw = () => {
    g.clear();
    const fill = (cells: Offset[], alpha: number) => {
      for (const o of cells) {
        g.lineStyle(3, color, 0.9).beginFill(color, alpha).drawPolygon(hexPolygon(o)).endFill();
      }
    };
    if (options.allowed) {
      for (const o of options.allowed) g.lineStyle(1, color, 0.6).beginFill(color, 0.12).drawPolygon(hexPolygon(o)).endFill();
    }
    fill(picked, 0.45);
    fill(currentCells(), 0.3);
  };

  return new Promise((resolve) => {
    const view = canvas!.app!.view as unknown as HTMLCanvasElement;
    const onCanvas = (e: Event) => e.target === view;
    const finish = (result: Offset[] | null) => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onContext, true);
      g.destroy();
      resolve(result);
    };
    const onMove = () => draw();
    const onDown = (e: PointerEvent) => {
      if (!onCanvas(e)) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) return finish(null);
      if (e.button !== 0) return;
      if (shape) return finish(currentCells());
      const cell = currentCells()[0]!;
      if (options.allowed && !options.allowed.some((o) => o.i === cell.i && o.j === cell.j)) return;
      if (!picked.some((p) => p.i === cell.i && p.j === cell.j)) picked.push(cell);
      if (picked.length >= count) return finish(picked);
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      if (!onCanvas(e) || !shape) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.shiftKey) mirrored = !mirrored;
      else rotation += e.deltaY > 0 ? 1 : -1;
      draw();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); finish(null); }
      if ((e.key === "r" || e.key === "R") && shape) { rotation += e.shiftKey ? -1 : 1; draw(); }
      if ((e.key === "m" || e.key === "M") && shape) { mirrored = !mirrored; draw(); }
    };
    const onContext = (e: Event) => { if (onCanvas(e)) e.preventDefault(); };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onContext, true);
    draw();
  });
}

/** Offset of the hex under a token's center. */
export function tokenOffset(token: { center: { x: number; y: number } }): Offset | null {
  return hexGrid()?.getOffset(token.center) ?? null;
}
