/**
 * Terrain on the map (p. 74-77), built on Foundry's Regions, Region Behaviors and movement actions.
 * - trap: a "trap" behavior deals damage and conditions when a token moves into the region;
 *   traps placed by abilities are used up once triggered.
 * - hazard: a "hazard" behavior deals damage when a token moves in (hazardous terrain).
 * - difficult: Foundry's "Modify Movement Cost" behavior, walking costs double (1 extra point).
 * - obstacle: no token may end a walk or jump there (flying may).
 * - space: a marked space (Tinkerer...): its effect is recalled at the start of the turn of a
 *   token standing in or next to it.
 * Movement actions (Foundry's): Walk, Fly (ignores terrain, p. 74), Jump (only the destination
 * counts) and Blink = Teleport (only the destination counts, ignores walls). Swim, climb, crawl
 * and burrow are hidden. GM "Displace" never triggers anything.
 */
import { SYSTEM_ID } from "../config.ts";
import { CONDITION_IDS } from "../conditions.ts";
import { sufferDamage } from "../combat/damage.ts";
import { isActiveGM } from "../deck/registry.ts";
import { currentCampaignLevel } from "../npc.ts";
import { COMBAT_CHALLENGE } from "../rules/npc.ts";
import { cubeKey, neighbors, type Cube } from "../rules/hex.ts";
import { hexPolygon, pickHexes, type Offset } from "./hex-place.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const TERRAIN_COLORS = {
  trap: "#c0392b", obstacle: "#7f8c8d", space: "#16a085", hazard: "#d35400", difficult: "#8e7d5b",
} as const;
export type TerrainKind = keyof typeof TERRAIN_COLORS;

export interface TerrainFlags { kind?: string; damage?: number; effects?: string[]; oneShot?: boolean }

type RegionDoc = RegionDocument.Implementation & {
  flags: Record<string, TerrainFlags | undefined>;
  testPoint(p: { x: number; y: number; elevation: number }): boolean;
};

function grid() {
  return canvas?.grid as unknown as {
    isHexagonal: boolean; size: number;
    getOffset(p: { x: number; y: number }): Offset;
    offsetToCube(o: Offset): Cube;
    getCenterPoint(o: Offset): { x: number; y: number };
    cubeToOffset(c: Cube): Offset;
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

/** Centre of a token at a position (its top-left corner). */
function tokenCentre(token: TokenDocument.Implementation, pos: { x?: number; y?: number } = {}): { x: number; y: number } {
  const size = grid()?.size ?? 100;
  return { x: (pos.x ?? token.x) + ((token.width ?? 1) * size) / 2, y: (pos.y ?? token.y) + ((token.height ?? 1) * size) / 2 };
}

function regionsAt(scene: Scene.Implementation, point: { x: number; y: number }, elevation: number, kind: string): RegionDoc[] {
  return (scene.regions as unknown as RegionDoc[]).filter((r) => flagsOf(r).kind === kind && r.testPoint({ ...point, elevation }));
}

// ---------------------------------------------------------------------------
// Movement actions

/** Keep Walk, Fly, Jump and Blink (= Teleport, ignoring walls between, p. 74). Call during `init`. */
export function configureMovementActions(): void {
  const actions = (CONFIG.Token as unknown as { movement: { actions: Record<string, Record<string, unknown>> } }).movement.actions;
  for (const id of ["swim", "burrow", "crawl", "climb"]) if (actions[id]) actions[id]["canSelect"] = false;
  if (actions["blink"]) Object.assign(actions["blink"], { label: "GLOOM.Terrain.teleport", walls: null });
}

type Waypoint = { action?: string };
type Movement = { destination?: { x: number; y: number; elevation?: number }; passed?: { waypoints?: Waypoint[] } } | null | undefined;

/** The movement action of the last part of a move (or the token's current one). */
function actionOf(token: TokenDocument.Implementation, movement?: Movement): string {
  return movement?.passed?.waypoints?.at(-1)?.action ?? (token as unknown as { movementAction?: string }).movementAction ?? "walk";
}

// ---------------------------------------------------------------------------
// Triggers (active GM, from the region behaviors)

interface MoveEvent { region: RegionDoc; data: { token: TokenDocument.Implementation; movement?: Movement } }

/** Should terrain in this region affect the token for this move? */
function affects(event: MoveEvent): boolean {
  if (!isActiveGM()) return false;
  const { token, movement } = event.data;
  const action = actionOf(token, movement);
  if (action === "fly" || action === "displace") return false;
  if (action === "jump" || action === "blink") {
    // Jumping and teleporting only count the destination space.
    const dest = movement?.destination;
    if (!dest) return false;
    return event.region.testPoint({ ...tokenCentre(token, dest), elevation: dest.elevation ?? token.elevation ?? 0 });
  }
  return true;
}

async function triggerTrap(region: RegionDoc, actor: Actor.Implementation, trap: { damage: number; conditions: string[]; oneShot: boolean }): Promise<void> {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-trap"><i class="fa-solid fa-triangle-exclamation"></i> ${f("GLOOM.Terrain.trapTriggered", { name: escape(actor.name ?? ""), trap: escape(region.name ?? "") })}</p>`,
  } as never);
  if (trap.damage) await sufferDamage(actor, trap.damage, { source: region.name ?? t("GLOOM.Terrain.trap") });
  for (const id of trap.conditions.map((c) => c.toLowerCase()).filter((c) => CONDITION_IDS.has(c))) {
    if (!actor.statuses.has(id)) await actor.toggleStatusEffect(id, { active: true });
  }
  if (trap.oneShot) await region.delete();
}

// ---------------------------------------------------------------------------
// Region behavior types (declared in system.json under RegionBehavior)

const fields = foundry.data.fields;
type Ctor = new (...args: never[]) => object;
const BaseBehavior = (foundry.data as unknown as { regionBehaviors: { RegionBehaviorType: Ctor } }).regionBehaviors.RegionBehaviorType;
const MOVE_IN = "tokenMoveIn";

/** Trap: damage and conditions when a token moves in (p. 76). */
export class TrapBehavior extends BaseBehavior {
  static LOCALIZATION_PREFIXES = ["GLOOM.TrapBehavior"];

  static defineSchema() {
    return {
      damage: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 3 }),
      conditions: new fields.SetField(new fields.StringField({ required: true, blank: false })),
      oneShot: new fields.BooleanField({ required: true, initial: true }),
    };
  }

  static events = {
    [MOVE_IN]: async function (this: { damage: number; conditions: Set<string>; oneShot: boolean }, event: MoveEvent) {
      if (!affects(event)) return;
      const actor = event.data.token.actor as Actor.Implementation | null;
      if (actor) await triggerTrap(event.region, actor, { damage: this.damage, conditions: [...this.conditions], oneShot: this.oneShot });
    },
  };
}

/** Hazardous terrain: damage when a token moves in (p. 76). */
export class HazardBehavior extends BaseBehavior {
  static LOCALIZATION_PREFIXES = ["GLOOM.TrapBehavior"];

  static defineSchema() {
    return { damage: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 2 }) };
  }

  static events = {
    [MOVE_IN]: async function (this: { damage: number }, event: MoveEvent) {
      if (!affects(event)) return;
      const actor = event.data.token.actor as Actor.Implementation | null;
      if (actor && this.damage) await sufferDamage(actor, this.damage, { source: event.region.name ?? t("GLOOM.Terrain.hazard") });
    },
  };
}

/** Call during `init`. */
export function registerBehaviorTypes(): void {
  const cfg = CONFIG.RegionBehavior as unknown as { dataModels: Record<string, unknown>; typeIcons: Record<string, string> };
  Object.assign(cfg.dataModels, { trap: TrapBehavior, hazard: HazardBehavior });
  Object.assign(cfg.typeIcons, { trap: "fa-solid fa-triangle-exclamation", hazard: "fa-solid fa-fire" });
}

/** The behaviors a terrain region gets. */
export function behaviorsFor(flags: TerrainFlags): Record<string, unknown>[] {
  switch (flags.kind) {
    case "trap": return [{ type: "trap", name: t("TYPES.RegionBehavior.trap"), system: { damage: flags.damage ?? 0, conditions: flags.effects ?? [], oneShot: flags.oneShot !== false } }];
    case "hazard": return [{ type: "hazard", name: t("TYPES.RegionBehavior.hazard"), system: { damage: flags.damage ?? COMBAT_CHALLENGE[Math.min(7, currentCampaignLevel())]!.hazard } }];
    case "difficult": return [{ type: "modifyMovementCost", name: t("GLOOM.Terrain.difficult"), system: { difficulties: { walk: 2 } } }];
    default: return [];
  }
}

/** Regions placed before behaviors existed get them (active GM, on canvas ready). */
async function addMissingBehaviors(scene: Scene.Implementation): Promise<void> {
  for (const region of scene.regions as unknown as RegionDoc[]) {
    const wanted = behaviorsFor(flagsOf(region));
    if (!wanted.length) continue;
    const have = [...((region as unknown as { behaviors: Iterable<{ type: string }> }).behaviors)];
    if (have.some((b) => b.type === wanted[0]!["type"])) continue;
    await (region as unknown as { createEmbeddedDocuments(t: string, d: unknown[]): Promise<unknown> }).createEmbeddedDocuments("RegionBehavior", wanted);
  }
}

// ---------------------------------------------------------------------------
// Marked spaces

/** Marked spaces in or next to a token's hex (their effects are recalled at its turn start). */
export function nearbySpaces(token: TokenDocument.Implementation): RegionDoc[] {
  const g = grid();
  const scene = token.parent as Scene.Implementation | null;
  if (!g?.isHexagonal || !scene) return [];
  const cell = g.offsetToCube(g.getOffset(tokenCentre(token)));
  const elevation = token.elevation ?? 0;
  const out = new Set<RegionDoc>();
  for (const c of [cell, ...neighbors(cell)]) {
    for (const r of regionsAt(scene, g.getCenterPoint(g.cubeToOffset(c)), elevation, "space")) out.add(r);
  }
  return [...out];
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
  const flags = { kind, ...extra };
  await scene.createEmbeddedDocuments("Region", cells.map((cell) => ({
    name, color: TERRAIN_COLORS[kind],
    shapes: [{ type: "polygon", points: hexPolygon(cell), hole: false }],
    visibility: 2,
    flags: { [SYSTEM_ID]: flags },
    behaviors: behaviorsFor(flags),
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

export function registerTerrainHooks(): void {
  // No token ends a walk or jump in an obstacle (p. 76); flying may, the GM may.
  Hooks.on("preUpdateToken", (doc, changes, options) => {
    const c = changes as { x?: number; y?: number; elevation?: number };
    if (c.x === undefined && c.y === undefined) return;
    const token = doc as TokenDocument.Implementation;
    const scene = token.parent as Scene.Implementation | null;
    if (!scene || game.user?.isGM) return;
    const movement = (options as { movement?: Record<string, { waypoints?: Waypoint[] }> }).movement?.[token.id ?? ""];
    const action = movement?.waypoints?.at(-1)?.action ?? (token as unknown as { movementAction?: string }).movementAction;
    if (action === "fly") return;
    if (regionsAt(scene, tokenCentre(token, { x: c.x, y: c.y }), c.elevation ?? token.elevation ?? 0, "obstacle").length) {
      ui.notifications?.warn("GLOOM.Terrain.obstacleBlocks", { localize: true });
      return false;
    }
  });

  Hooks.on("canvasReady", () => {
    if (isActiveGM() && canvas?.scene) void addMissingBehaviors(canvas.scene as Scene.Implementation);
  });
}
