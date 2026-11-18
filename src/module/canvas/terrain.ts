/**
 * Terrain on the map (p. 76, 77): Regions flagged with a kind.
 * - trap: damage + conditions when a token enters; placed traps are used up once triggered.
 * - hazard: damage when a token enters (hazardous terrain).
 * - difficult: 1 extra movement point (shown only).
 * - obstacle: no token may end its movement there.
 * - space: a marked space (Tinkerer...): its effect is recalled at the start of the turn of a
 *   token standing in or next to it.
 * Flying tokens ignore traps and hazards; a Jumping or Teleporting token only triggers its final
 * space (p. 74).
 */
import { SYSTEM_ID } from "../config.ts";
import { CONDITION_IDS } from "../conditions.ts";
import { sufferDamage } from "../combat/damage.ts";
import { isActiveGM } from "../deck/registry.ts";
import { currentCampaignLevel } from "../npc.ts";
import { COMBAT_CHALLENGE } from "../rules/npc.ts";
import { cubeKey, neighbors, pathThrough, type Cube } from "../rules/hex.ts";
import { hexPolygon, pickHexes, type Offset } from "./hex-place.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const TERRAIN_COLORS = {
  trap: "#c0392b", obstacle: "#7f8c8d", space: "#16a085", hazard: "#d35400", difficult: "#8e7d5b",
} as const;
export type TerrainKind = keyof typeof TERRAIN_COLORS;

export interface TerrainFlags { kind?: string; damage?: number; effects?: string[]; oneShot?: boolean }

type RegionDoc = RegionDocument.Implementation & { flags: Record<string, TerrainFlags | undefined> };

function grid() {
  return canvas?.grid as unknown as {
    isHexagonal: boolean; size: number;
    getOffset(p: { x: number; y: number }): Offset;
    offsetToCube(o: Offset): Cube;
    cubeToOffset(c: Cube): Offset;
    getTopLeftPoint(o: Offset): { x: number; y: number };
  } | undefined;
}

export const flagsOf = (r: RegionDoc): TerrainFlags => r.flags[SYSTEM_ID] ?? {};

function centre(points: number[]): { x: number; y: number } {
  let x = 0, y = 0;
  const n = points.length / 2;
  for (let i = 0; i < points.length; i += 2) { x += points[i]!; y += points[i + 1]!; }
  return { x: x / n, y: y / n };
}

/** Hexes covered by a region (one per polygon shape). */
export function regionCells(region: RegionDoc): Cube[] {
  const g = grid();
  if (!g?.isHexagonal) return [];
  const shapes = (region as unknown as { shapes: { type: string; points?: number[] }[] }).shapes;
  return shapes.filter((s) => s.type === "polygon" && s.points?.length)
    .map((s) => g.offsetToCube(g.getOffset(centre(s.points!))));
}

/** Terrain regions of a scene by hex. */
export function terrainMap(scene: Scene.Implementation | null | undefined): Map<string, RegionDoc[]> {
  const out = new Map<string, RegionDoc[]>();
  for (const r of (scene?.regions ?? []) as unknown as RegionDoc[]) {
    if (!flagsOf(r).kind || flagsOf(r).kind === "area") continue;
    for (const c of regionCells(r)) {
      const key = cubeKey(c);
      out.set(key, [...(out.get(key) ?? []), r]);
    }
  }
  return out;
}

/** Hex of a token whose top-left corner is at (x, y). */
export function tokenCell(doc: TokenDocument.Implementation, x = doc.x, y = doc.y): Cube | null {
  const g = grid();
  if (!g?.isHexagonal) return null;
  const w = (doc.width ?? 1) * g.size;
  const h = (doc.height ?? 1) * g.size;
  return g.offsetToCube(g.getOffset({ x: x + w / 2, y: y + h / 2 }));
}

export function hasObstacle(map: Map<string, RegionDoc[]>, cell: Cube): boolean {
  return (map.get(cubeKey(cell)) ?? []).some((r) => flagsOf(r).kind === "obstacle");
}

const flying = (actor: Actor.Implementation | null | undefined) => !!actor?.statuses.has("flying");

// ---------------------------------------------------------------------------
// Triggers (active GM)

async function triggerTrap(region: RegionDoc, actor: Actor.Implementation): Promise<void> {
  const fl = flagsOf(region);
  const effects = (fl.effects ?? []).map((e) => e.toLowerCase()).filter((e) => CONDITION_IDS.has(e));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-trap"><i class="fa-solid fa-triangle-exclamation"></i> ${f("GLOOM.Terrain.trapTriggered", { name: escape(actor.name ?? ""), trap: escape(region.name ?? "") })}</p>`,
  } as never);
  if (fl.damage) await sufferDamage(actor, fl.damage, { source: region.name ?? t("GLOOM.Terrain.trap") });
  for (const id of effects) if (!actor.statuses.has(id)) await actor.toggleStatusEffect(id, { active: true });
  if (fl.oneShot !== false) await region.delete();
}

async function triggerHazard(region: RegionDoc, actor: Actor.Implementation): Promise<void> {
  const damage = flagsOf(region).damage ?? COMBAT_CHALLENGE[Math.min(7, currentCampaignLevel())]!.hazard;
  await sufferDamage(actor, damage, { source: t("GLOOM.Terrain.hazard") });
}

/** Apply terrain for the hexes a token entered. */
export async function enterCells(scene: Scene.Implementation, actor: Actor.Implementation, cells: Cube[], jumped: boolean): Promise<void> {
  if (flying(actor) || !cells.length) return;
  const entered = jumped ? cells.slice(-1) : cells;
  const map = terrainMap(scene);
  for (const cell of entered) {
    for (const region of map.get(cubeKey(cell)) ?? []) {
      const kind = flagsOf(region).kind;
      if (kind === "trap") await triggerTrap(region, actor);
      else if (kind === "hazard") await triggerHazard(region, actor);
    }
  }
}

/** Marked spaces in or next to a token's hex (their effects are recalled at its turn start). */
export function nearbySpaces(token: TokenDocument.Implementation): RegionDoc[] {
  const cell = tokenCell(token);
  if (!cell) return [];
  const map = terrainMap(token.parent as Scene.Implementation);
  const seen = new Set<string>();
  const out: RegionDoc[] = [];
  for (const c of [cell, ...neighbors(cell)]) {
    for (const r of map.get(cubeKey(c)) ?? []) {
      if (flagsOf(r).kind === "space" && !seen.has(r.id ?? "")) { seen.add(r.id ?? ""); out.push(r); }
    }
  }
  return out;
}

export async function remindSpaces(actor: Actor.Implementation): Promise<void> {
  const token = actor.getActiveTokens()[0]?.document as TokenDocument.Implementation | undefined;
  if (!token) return;
  const spaces = nearbySpaces(token);
  if (!spaces.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<div class="gloom-spaces"><p><i class="fa-solid fa-location-dot"></i> ${f("GLOOM.Terrain.spacesNear", { name: escape(actor.name ?? "") })}</p>
      <ul>${spaces.map((r) => `<li>${escape(r.name ?? "")}</li>`).join("")}</ul></div>`,
  } as never);
}

// ---------------------------------------------------------------------------
// GM placement

export async function createTerrain(scene: Scene.Implementation, kind: TerrainKind, cells: Offset[], name: string, extra: TerrainFlags = {}): Promise<void> {
  await scene.createEmbeddedDocuments("Region", cells.map((cell) => ({
    name, color: TERRAIN_COLORS[kind],
    shapes: [{ type: "polygon", points: hexPolygon(cell), hole: false }],
    visibility: 2,
    flags: { [SYSTEM_ID]: { kind, ...extra } },
  })) as never);
}

/** GM tool: place traps, hazardous or difficult terrain, or obstacles. */
export async function placeTerrainDialog(): Promise<void> {
  const scene = canvas?.scene;
  if (!game.user?.isGM || !scene) return;
  const row = COMBAT_CHALLENGE[Math.min(7, currentCampaignLevel())]!;
  const conditions = ["poison", "wound", "immobilize", "stun", "muddle"];
  const content = `<div class="gloom-terrain-form">
    <label>${t("GLOOM.Terrain.kind")} <select name="kind">${(["trap", "hazard", "difficult", "obstacle"] as const).map((k) =>
      `<option value="${k}">${t(`GLOOM.Terrain.${k}`)}</option>`).join("")}</select></label>
    <label>${t("GLOOM.Terrain.count")} <input type="number" name="count" value="1" min="1" max="30"></label>
    <label>${t("GLOOM.Terrain.name")} <input type="text" name="name" placeholder="${t("GLOOM.Terrain.namePlaceholder")}"></label>
    <label>${f("GLOOM.Terrain.trapDamage", { n: String(row.trap) })} <input type="number" name="trapDamage" value="${row.trap}" min="0"></label>
    <label>${f("GLOOM.Terrain.hazardDamage", { n: String(row.hazard) })} <input type="number" name="hazardDamage" value="${row.hazard}" min="0"></label>
    <fieldset><legend>${t("GLOOM.Terrain.trapEffects")}</legend>${conditions.map((c) =>
      `<label class="checkbox"><input type="checkbox" name="c_${c}"> ${t(`GLOOM.Condition.${c}.name`)}</label>`).join("")}</fieldset>
    <label class="checkbox"><input type="checkbox" name="lasting"> ${t("GLOOM.Terrain.lasting")}</label>
  </div>`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Terrain.title"), icon: "fa-solid fa-mountain" }, content, rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return;
  const kind = String(form["kind"]) as TerrainKind;
  const count = Math.max(1, Math.floor(Number(form["count"]) || 1));
  const cells = await pickHexes({ count, color: Number.parseInt(TERRAIN_COLORS[kind].slice(1), 16), hint: t("GLOOM.Place.hintSingle") });
  if (!cells) return;
  const effects = conditions.filter((c) => form[`c_${c}`]);
  const extra: TerrainFlags = kind === "trap"
    ? { damage: Number(form["trapDamage"]) || 0, effects, oneShot: !form["lasting"] }
    : kind === "hazard" ? { damage: Number(form["hazardDamage"]) || 0 } : {};
  const custom = String(form["name"] ?? "").trim();
  const name = custom || (kind === "trap"
    ? f("GLOOM.Place.trapName", { damage: String(extra.damage ?? 0), effects: effects.length ? `, ${effects.map((e) => t(`GLOOM.Condition.${e}.name`)).join(", ")}` : "" })
    : kind === "hazard" ? f("GLOOM.Terrain.hazardName", { n: String(extra.damage ?? 0) }) : t(`GLOOM.Terrain.${kind}`));
  await createTerrain(scene, kind, cells, name, extra);
}

// ---------------------------------------------------------------------------
// Hooks

interface MoveOptions { gloomFrom?: { x: number; y: number }; gloomPath?: Cube[]; gloomForced?: boolean }

export function registerTerrainHooks(): void {
  // Remember where the token came from, and refuse to end a move in an obstacle.
  Hooks.on("preUpdateToken", (doc, changes, options) => {
    const c = changes as { x?: number; y?: number };
    if (c.x === undefined && c.y === undefined) return;
    const token = doc as TokenDocument.Implementation;
    const opts = options as MoveOptions;
    opts.gloomFrom ??= { x: token.x, y: token.y };
    const dest = tokenCell(token, c.x ?? token.x, c.y ?? token.y);
    if (!dest || !token.parent) return;
    if (hasObstacle(terrainMap(token.parent as Scene.Implementation), dest)) {
      if (!game.user?.isGM) {
        ui.notifications?.warn("GLOOM.Terrain.obstacleBlocks", { localize: true });
        return false;
      }
      ui.notifications?.info("GLOOM.Terrain.obstacleGM", { localize: true });
    }
  });

  Hooks.on("updateToken", (doc, changes, options) => {
    if (!isActiveGM()) return;
    const c = changes as { x?: number; y?: number };
    if (c.x === undefined && c.y === undefined) return;
    const token = doc as TokenDocument.Implementation;
    const actor = token.actor as Actor.Implementation | null;
    const opts = options as MoveOptions;
    if (!actor || !token.parent) return;
    const from = opts.gloomFrom ? tokenCell(token, opts.gloomFrom.x, opts.gloomFrom.y) : null;
    const to = tokenCell(token);
    if (!to) return;
    const path = opts.gloomPath ?? (from ? pathThrough([from, to]) : [to]);
    const one = ["jumping", "teleporting"].filter((id) => actor.statuses.has(id));
    const jumped = !opts.gloomForced && one.length > 0;
    void (async () => {
      await enterCells(token.parent as Scene.Implementation, actor, path, jumped);
      if (!opts.gloomForced) for (const id of one) await actor.toggleStatusEffect(id, { active: false });
    })();
  });
}

/** Status effects used by movement: Flying (ignores terrain) and Jumping (next move only). */
export function movementStatuses(): { id: string; name: string; img: string }[] {
  return [
    { id: "flying", name: "GLOOM.Terrain.flying", img: "icons/svg/wing.svg" },
    { id: "jumping", name: "GLOOM.Terrain.jumping", img: "icons/svg/upgrade.svg" },
    { id: "teleporting", name: "GLOOM.Terrain.teleporting", img: "icons/svg/portal.svg" },
  ];
}
