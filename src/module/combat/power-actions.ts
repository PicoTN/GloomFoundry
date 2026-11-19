/**
 * Action buttons for powers (sheet details and chat cards): Attack, Heal, apply a condition,
 * Infuse, place an area, a trap, an obstacle or a summon. Built from the power's text
 * (rules/power-actions.ts). Areas, traps and obstacles become scene Regions; areas are cleared
 * at the end of the acting character's turn, traps and obstacles stay until removed.
 */
import { grantMove } from "./movement.ts";
import { parseLasting, parseLastingBonus } from "../rules/lasting.ts";
import { startLasting } from "../lasting.ts";
import { cubeKey, forcedMoves, type Cube as HexCube } from "../rules/hex.ts";
import { behaviorsFor, flagsOf, terrainMap, type TerrainFlags } from "../canvas/terrain.ts";
import { SYSTEM_ID } from "../config.ts";
import { cellsWithin, pickHexes, hexPolygon, type Offset } from "../canvas/hex-place.ts";
import { addTemporary, drawAttack } from "../deck/actions.ts";
import { deckForActor } from "../deck/registry.ts";
import { dispositionOf } from "../npc.ts";
import { heal } from "../powers.ts";
import { gainAbility } from "../abilities.ts";
import {
  allCounters, applyMark, classSummonNames, clearCounters, gainCounter, giveFromPool, markCount, mechanicsOwner,
  mechanicsOf, placeSummonByName, playIntoSlot, spendCounters, statesOf,
} from "../class-mechanics.ts";
import { countersCover } from "../rules/class-mechanics.ts";
import { currentTargetActor } from "../conditions.ts";
import { parsePowerActions, type Area, type Bonus, type PowerAction, type Requirement, type StoredActions } from "../rules/power-actions.ts";
import { areOpposed } from "../rules/sides.ts";
import { runAsGM } from "../socket.ts";
import type { ElementId } from "../rules/combat.ts";
import { changeElement, getBoard } from "./elements.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COLORS = { area: "#e2662b", trap: "#c0392b", obstacle: "#7f8c8d", space: "#16a085" } as const;

function areaLabel(area: Area): string {
  return f(`GLOOM.Place.shape.${area.shape}`, { n: String(area.size) });
}

function npcAttack(actor: Actor.Implementation): number {
  return (actor.system as unknown as { current?: { attack: number } }).current?.attack ?? 2;
}

const ELEMENTS = ["air", "dark", "earth", "fire", "ice", "light"] as const;
const cond = (c: string) => game.i18n!.localize(`GLOOM.Condition.${c.toLowerCase()}.name`);
const el = (e: string) => t(`GLOOM.Element.${e}`);

/** Apply a bonus to its action ("if Fire is active, add +1 attack, Wound"). */
export function withBonus(a: PowerAction, b: Bonus): PowerAction {
  const conditions = (list: string[]) => [...list, ...(b.conditions ?? []).filter((c) => !list.includes(c))];
  switch (a.kind) {
    case "attack": return {
      ...a, value: a.value + (b.attack ?? 0), range: a.range === null ? null : a.range + (b.range ?? 0),
      targets: a.targets + (b.targets ?? 0), pierce: a.pierce + (b.pierce ?? 0),
      push: (a.push ?? 0) + (b.push ?? 0) || undefined, pull: (a.pull ?? 0) + (b.pull ?? 0) || undefined,
      area: b.area ?? a.area, conditions: conditions(a.conditions), bonuses: [],
    };
    case "heal": return { ...a, value: a.value + (b.heal ?? 0), range: a.range === null ? null : a.range + (b.range ?? 0), conditions: conditions(a.conditions), bonuses: [] };
    case "move": return { ...a, value: a.value + (b.move ?? 0), bonuses: [] };
    case "shield": return { ...a, value: a.value + (b.shield ?? 0), bonuses: [] };
    case "retaliate": return { ...a, value: a.value + (b.retaliate ?? 0), bonuses: [] };
    default: return a;
  }
}

/** Is the bonus's (or requirement's) element condition met on the scene's element board? */
function bonusActive(b: Bonus | Requirement, actor?: Actor.Implementation | null): boolean | null {
  const checks: boolean[] = [];
  const board = getBoard();
  const active = (e: string) => (board.states[e as ElementId] ?? 0) > 0;
  if (b.anyElement) checks.push(ELEMENTS.some(active));
  else if (b.elements?.length) checks.push(b.anyOf ? b.elements.some(active) : b.elements.every(active));
  if (b.state && actor) checks.push(statesOf(actor).includes(b.state));
  const target = currentTargetActor();
  if (b.targetMark) checks.push(markCount(target, b.targetMark) > 0);
  if ("perTargetMark" in b && b.perTargetMark) checks.push(markCount(target, b.perTargetMark) > 0);
  if (b.allyMark) {
    checks.push(((canvas?.tokens?.placeables ?? []) as Token.Implementation[]).some((tk) => markCount(tk.actor as Actor.Implementation, b.allyMark!) > 0));
  }
  if ("counters" in b && b.counters && actor) checks.push(countersCover(allCounters(actor), b.counters));
  if (b.spend && actor) checks.push(countersCover(allCounters(actor), b.spend));
  return checks.length ? checks.every(Boolean) : null;
}

function triggerLabel(b: Bonus | Requirement): string {
  const parts: string[] = [];
  if (b.anyElement) parts.push(t("GLOOM.Act.anyElement"));
  else if (b.elements?.length) parts.push(b.elements.map(el).join(b.anyOf ? "/" : "+"));
  if (b.state) parts.push(game.i18n!.has(`GLOOM.State.${b.state}`) ? t(`GLOOM.State.${b.state}`) : b.state);
  if (b.targetMark) parts.push(f("GLOOM.Act.targetHas", { mark: t(`GLOOM.Mark.${b.targetMark}`) }));
  if ("perTargetMark" in b && b.perTargetMark) parts.push(f("GLOOM.Act.perMark", { mark: t(`GLOOM.Mark.${b.perTargetMark}`) }));
  if (b.allyMark) parts.push(f("GLOOM.Act.allyHas", { mark: t(`GLOOM.Mark.${b.allyMark}`) }));
  if ("counters" in b && b.counters) parts.push(Object.entries(b.counters).map(([k, v]) => `${v} ${k}`).join(" + "));
  if (b.spend) parts.push(f("GLOOM.Act.spend", { list: Object.entries(b.spend).map(([k, v]) => `${v} ${k}`).join(" + ") }));
  if (b.when) parts.push(b.when);
  return parts.join(", ");
}

function bonusLabel(b: Bonus): string {
  const trigger = triggerLabel(b);
  const parts = [
    b.attack && `+${b.attack} ${t("GLOOM.Act.attackWord")}`, b.range && `+${b.range} ${t("GLOOM.Act.rangeWord")}`,
    b.targets && `+${b.targets} ${t("GLOOM.Act.targetWord")}`, b.heal && `+${b.heal} ${t("GLOOM.Act.healWord")}`,
    b.pierce && `Pierce ${b.pierce}`, b.push && `Push ${b.push}`, b.pull && `Pull ${b.pull}`,
    ...(b.conditions ?? []).map(cond), b.area && areaLabel(b.area), b.text,
  ].filter(Boolean);
  return `${trigger}: ${parts.join(", ")}`;
}

function label(actor: Actor.Implementation, a: PowerAction): { icon: string; text: string; button: boolean } {
  switch (a.kind) {
    case "attack": {
      const base = a.relative ? npcAttack(actor) + a.value : a.value;
      const extra = [
        a.area && areaLabel(a.area), a.targets > 1 && f("GLOOM.Act.targets", { n: String(a.targets) }),
        a.range && `${t("GLOOM.Act.rangeWord")} ${a.range}`, a.pierce && `Pierce ${a.pierce}`,
        a.push && `Push ${a.push}`, a.pull && `Pull ${a.pull}`,
      ].filter(Boolean);
      return { icon: "fa-swords", button: true, text: `${f("GLOOM.Act.attack", { n: String(base) })}${extra.length ? ` · ${extra.join(" · ")}` : ""}` };
    }
    case "heal": return { icon: "fa-heart", button: true, text: f(a.self ? "GLOOM.Act.healSelf" : "GLOOM.Act.heal", { n: String(a.value) }) + (a.range ? ` · ${t("GLOOM.Act.rangeWord")} ${a.range}` : "") };
    case "move": {
      if (a.teleport) return { icon: "fa-person-through-window", button: true, text: f("GLOOM.Act.teleport", { n: String(a.value) }) };
      const v = a.relative ? (a.value >= 0 ? `+${a.value}` : String(a.value)) : String(a.value);
      return { icon: a.jump ? "fa-person-running" : "fa-shoe-prints", button: true, text: `${t(a.jump ? "GLOOM.Act.jump" : "GLOOM.Act.move")} ${v}${a.flying ? ` (${t("GLOOM.Act.flying")})` : ""}` };
    }
    case "shield": return { icon: "fa-shield", button: true, text: `${t("GLOOM.Ability.shield")} ${a.value}${a.self ? "" : ` (${t("GLOOM.Act.ally")})`}${a.duration === "persistent" ? ` · ${t("GLOOM.Ability.persistent")}` : ""}` };
    case "retaliate": return { icon: "fa-hand-fist", button: true, text: `${t("GLOOM.Ability.retaliate")} ${a.value}${a.range ? ` · ${t("GLOOM.Act.rangeWord")} ${a.range}` : ""}${a.self === false ? ` (${t("GLOOM.Act.ally")})` : ""}${a.duration === "persistent" ? ` · ${t("GLOOM.Ability.persistent")}` : ""}` };
    case "taunt": return { icon: "fa-bullhorn", button: true, text: `${t("GLOOM.Ability.taunt")}${a.self === false ? ` (${t("GLOOM.Act.ally")})` : ""}` };
    case "condition": return { icon: "fa-bolt", button: true, text: cond(a.id) + (a.self ? ` (${t("GLOOM.Act.self")})` : "") };
    case "infuse": return { icon: "fa-fire", button: true, text: a.any ? f("GLOOM.Act.infuse", { list: t("GLOOM.Act.anyElement") }) : f("GLOOM.Act.infuse", { list: a.elements.map(el).join(a.either ? " / " : " + ") }) };
    case "area": return { icon: "fa-draw-polygon", button: true, text: f("GLOOM.Act.place", { what: areaLabel(a.area) }) };
    case "trap": return { icon: "fa-triangle-exclamation", button: true, text: f("GLOOM.Act.trap", { n: String(a.count), damage: String(a.damage), effects: a.effects.join(", ") }) };
    case "obstacle": return { icon: "fa-cube", button: true, text: f("GLOOM.Act.obstacle", { n: String(a.count) }) };
    case "space": return { icon: "fa-location-dot", button: true, text: f("GLOOM.Act.space", { label: a.label, n: String(a.count ?? 1) }) };
    case "summon": return { icon: "fa-ghost", button: true, text: a.name ? `${t("GLOOM.Act.summon")}: ${a.name}` : t("GLOOM.Act.summon") };
    case "choice": return { icon: "fa-list-check", button: false, text: f("GLOOM.Act.choose", { n: String(a.pick) }) };
    case "text": return { icon: "fa-circle-info", button: false, text: a.text };
    case "forced": return { icon: a.dir === "push" ? "fa-arrow-right-from-bracket" : "fa-arrow-right-to-bracket", button: true, text: `${a.dir === "push" ? "Push" : "Pull"} ${a.value}` };
    case "mark": return { icon: "fa-crosshairs", button: true, text: `${t(`GLOOM.Mark.${a.id}`)}${a.option ? `: ${a.option}` : a.group ? ` (${a.group})` : ""}${(a.count ?? 1) > 1 ? ` ×${a.count}` : ""}${(a.targets ?? 1) > 1 ? ` · ${f("GLOOM.Act.targets", { n: String(a.targets) })}` : ""}` };
    case "gain": return { icon: "fa-music", button: true, text: f("GLOOM.Act.gain", { n: String(a.count), what: a.counter === "any" ? t("GLOOM.Act.anyCounter") : a.counter }) };
    case "play": return { icon: "fa-play", button: true, text: f("GLOOM.Act.play", { name: a.name }) };
    case "give": return { icon: "fa-gift", button: true, text: f("GLOOM.Act.give", { what: a.item ?? t(`GLOOM.Mech.pool.${a.id}`) }) + ((a.count ?? 1) > 1 ? ` ×${a.count}` : "") };
  }
}

function requirementLabel(r: Requirement): string {
  if (r.elements?.length || r.anyElement) {
    const els = r.anyElement ? t("GLOOM.Act.anyElement") : (r.elements ?? []).map(el).join(r.anyOf ? "/" : "+");
    const rest = triggerLabel({ ...r, elements: [], anyElement: false });
    return [f("GLOOM.Act.ifActive", { list: els }), rest].filter(Boolean).join(", ");
  }
  return triggerLabel(r);
}

/** Icon-pack key for an action (attack, heal, conditions, elements...), when there is one. */
function iconKey(a: PowerAction): string | null {
  switch (a.kind) {
    case "attack": case "heal": case "shield": case "retaliate": case "taunt": return `stat.${a.kind}`;
    case "move": return a.teleport ? null : a.jump ? "stat.jump" : "stat.move";
    case "condition": return `condition.${a.id}`;
    case "infuse": return a.any ? "element.any" : `element.${a.elements[0]}`;
    case "trap": return "stat.damage";
    case "forced": return `stat.${a.dir}`;
    default: return null;
  }
}

/** The icon-pack image for an action, or its Font Awesome icon. */
function actIcon(a: PowerAction, fa: string): string {
  const key = iconKey(a);
  const src = key ? CONFIG.GLOOM?.icons?.[key] : undefined;
  return src
    ? `<img class="gloom-act-icon${key!.startsWith("stat.") ? " icon-stat" : ""}" src="${escape(src)}" alt="">`
    : `<i class="fa-solid ${fa}"></i>`;
}

function oneHTML(actor: Actor.Implementation, a: PowerAction): string {
  const base = label(actor, a);
  const l = {
    ...base,
    text: `${a.performer && a.performer !== "self" ? `${t(`GLOOM.Act.performer.${a.performer}`)}: ` : ""}${a.requires ? `[${requirementLabel(a.requires)}] ` : ""}${base.text}${a.variable ? " (X)" : ""}`,
  };
  const req = a.requires ?? null;
  const reqState = req ? bonusActive(req, actor) : null;
  const reqCss = reqState === null ? "" : reqState ? " active" : " inactive";
  const reqData = req && (req.elements?.length || req.anyElement)
    ? ` data-bonus="${escape(JSON.stringify({ elements: req.elements ?? [], anyOf: !!req.anyOf, anyElement: !!req.anyElement, consume: !!req.consume }))}"`
    : "";
  const uuid = escape(actor.uuid ?? "");
  const note = a.note ? `<span class="act-note">${escape(a.note)}</span>` : "";
  if (a.kind === "choice") {
    return `<div class="gloom-act-choice"><span class="gloom-act-chip"><i class="fa-solid ${l.icon}"></i> ${escape(l.text)}</span>${
      a.options.map((opt) => `<div class="option">${opt.map((o) => oneHTML(actor, o)).join("")}</div>`).join("")}${note}</div>`;
  }
  const icon = actIcon(a, l.icon);
  const main = l.button
    ? `<button type="button" class="gloom-act act-${a.kind}${req ? ` requires${reqCss}` : ""}" data-gloom-act="${escape(JSON.stringify(a))}"${reqData} data-actor="${uuid}">${icon} ${escape(l.text)}</button>`
    : `<span class="gloom-act-chip act-${a.kind}${req ? ` requires${reqCss}` : ""}">${icon} ${escape(l.text)}</span>`;
  // Bonus variants: the same action with the extras applied; highlighted when the element is active.
  const bonuses = (a.bonuses ?? []).map((b) => {
    const state = bonusActive(b, actor);
    const css = state === null ? "" : state ? " active" : " inactive";
    const merged = withBonus(a, b);
    const usesElements = !!(b.elements?.length || b.anyElement);
    const trigger = usesElements ? escape(JSON.stringify({ elements: b.elements ?? [], anyOf: !!b.anyOf, anyElement: !!b.anyElement, consume: !!b.consume })) : "";
    return l.button
      ? `<button type="button" class="gloom-act bonus${css}" data-gloom-act="${escape(JSON.stringify(merged))}" ${trigger ? ` data-bonus="${trigger}"` : ""}${b.perTargetMark ? ` data-per-mark="${escape(b.perTargetMark)}" data-per-bonus="${escape(JSON.stringify(b))}"` : ""}${b.spend ? ` data-spend="${escape(JSON.stringify(b.spend))}"` : ""} data-actor="${uuid}"><i class="fa-solid fa-plus"></i> ${escape(bonusLabel(b))}</button>`
      : `<span class="gloom-act-chip bonus${css}"><i class="fa-solid fa-plus"></i> ${escape(bonusLabel(b))}</span>`;
  });
  // Conditions carried by an attack or heal also get their own button (applied after the hit).
  const carried = a.kind === "attack" || a.kind === "heal"
    ? a.conditions.map((c) => oneHTML(actor, { kind: "condition", id: c.toLowerCase(), self: a.kind === "heal" && a.self }))
    : [];
  // Push/Pull after the attack: pick where each target goes.
  if (a.kind === "attack") {
    if (a.push) carried.push(oneHTML(actor, { kind: "forced", dir: "push", value: a.push }));
    if (a.pull) carried.push(oneHTML(actor, { kind: "forced", dir: "pull", value: a.pull }));
  }
  return [main, ...bonuses, ...carried].join("") + note;
}

/** Does the item store actions for this field? Then its buttons replace the text (p. n/a: UI). */
export function hasStoredActions(item: Item.Implementation | null, key: string): boolean {
  const stored = (item?.system as unknown as { actions?: StoredActions } | undefined)?.actions?.[key as keyof StoredActions];
  return Array.isArray(stored) && stored.length > 0;
}

/**
 * Buttons for an item's text field. When the actions are stored, they stand in for the text
 * (anything they don't cover is a text chip); the original wording stays in an info tooltip.
 */
export function itemActsHTML(actor: Actor.Implementation | null, item: Item.Implementation | null, key: string, text: string): { html: string; covered: boolean } {
  const covered = hasStoredActions(item, key);
  let html = actionButtonsHTML(actor, actionsFor(item, key, text));
  if (covered && html) {
    const plainText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    html = html.replace(/<\/div>$/, `<span class="act-source" data-tooltip="${escape(plainText)}"><i class="fa-solid fa-circle-info"></i></span></div>`);
  }
  return { html, covered: covered && !!html };
}

/** Stored actions for a text field of an item, or the parsed text as a fallback. */
export function actionsFor(item: Item.Implementation | null, key: string, text: string): PowerAction[] {
  const stored = (item?.system as unknown as { actions?: StoredActions } | undefined)?.actions?.[key as keyof StoredActions];
  return Array.isArray(stored) && stored.length ? stored : parsePowerActions(text);
}

/** Buttons (and chips for Move, Shield...) for a list of actions. */
export function actionButtonsHTML(actor: Actor.Implementation | null, actionsOrText: PowerAction[] | string): string {
  if (!actor || !actionsOrText) return "";
  const actions = typeof actionsOrText === "string" ? parsePowerActions(actionsOrText) : actionsOrText;
  if (!actions.length) return "";
  return `<div class="gloom-acts">${actions.map((a) => oneHTML(actor, a)).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Handlers

function actingToken(actor: Actor.Implementation): Token.Implementation | null {
  const active = actor.getActiveTokens?.() as Token.Implementation[] | undefined;
  return active?.find((tk) => tk.controlled) ?? active?.[0] ?? null;
}

function targetedActors(): Actor.Implementation[] {
  return [...(game.user?.targets ?? [])].map((tk) => tk.actor as Actor.Implementation | null).filter((a): a is Actor.Implementation => !!a);
}

/** Target the opposing tokens standing in the given hexes. */
function targetTokensIn(cells: Offset[], actor: Actor.Implementation): void {
  const grid = canvas!.grid as unknown as { getOffset(p: { x: number; y: number }): Offset };
  const me = dispositionOf(actor);
  const inside = (canvas!.tokens!.placeables as Token.Implementation[]).filter((tk) => {
    const o = grid.getOffset(tk.center);
    return cells.some((c) => c.i === o.i && c.j === o.j) && areOpposed(me, tk.document.disposition)
      && !tk.document.hasStatusEffect("invisible"); // Invisible enemies can't be targeted (p. 84)
  });
  for (const tk of [...(game.user?.targets ?? [])]) tk.setTarget(false, { releaseOthers: false, groupSelection: true } as never);
  for (const tk of inside) tk.setTarget(true, { releaseOthers: false, groupSelection: true } as never);
}

/** Push/Pull X each targeted token (p. 76): pick a reachable hex, then move along that path. */
async function onForced(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "forced" }>): Promise<void> {
  const forcer = actingToken(actor);
  const targets = [...(game.user?.targets ?? [])] as Token.Implementation[];
  if (!forcer || !targets.length || !canvas?.scene) return void ui.notifications?.warn("GLOOM.Damage.noTarget", { localize: true });
  const grid = canvas.grid as unknown as {
    getOffset(p: { x: number; y: number }): Offset; offsetToCube(o: Offset): HexCube; cubeToOffset(c: HexCube): Offset;
    getTopLeftPoint(o: Offset): { x: number; y: number }; getCenterPoint(o: Offset): { x: number; y: number };
  };
  const cubeOf = (tk: Token.Implementation) => grid.offsetToCube(grid.getOffset(tk.center));
  const terrain = terrainMap(canvas.scene as Scene.Implementation);
  for (const target of targets) {
    const start = cubeOf(target);
    // Characters and obstacles block; a flying target passes over them but can't end on a character (p. 74, 76).
    const occupied = new Set<string>();
    for (const tk of canvas.tokens!.placeables as Token.Implementation[]) if (tk !== target) occupied.add(cubeKey(cubeOf(tk)));
    const obstacles = new Set<string>();
    for (const [key, regions] of terrain) if (regions.some((r) => flagsOf(r).kind === "obstacle")) obstacles.add(key);
    const flying = (target.document as unknown as { movementAction?: string }).movementAction === "fly";
    const blocked = flying ? new Set<string>() : new Set([...occupied, ...obstacles]);
    // Movement walls on the scene stop each step.
    const center = (c: HexCube) => grid.getCenterPoint(grid.cubeToOffset(c));
    const backend = (CONFIG.Canvas.polygonBackends as unknown as Record<string, { testCollision(a: unknown, b: unknown, o: unknown): unknown }>)["move"];
    const canStep = (from: HexCube, to: HexCube) => !backend?.testCollision(center(from), center(to), { type: "move", mode: "any" });
    const moves = forcedMoves(start, cubeOf(forcer), a.value, a.dir, blocked, { noEnd: flying ? occupied : undefined, canStep });
    if (moves.size <= 1) {
      ui.notifications?.warn(f("GLOOM.Act.cannotForce", { name: target.name ?? "" }));
      continue;
    }
    const allowed = [...moves.values()].map((m) => grid.cubeToOffset(m.cell));
    const picked = await pickHexes({ count: 1, allowed, color: 0x2980b9, hint: f("GLOOM.Act.forceHint", { name: target.name ?? "", dir: a.dir === "push" ? "Push" : "Pull", n: String(a.value) }) });
    const cell = picked?.[0];
    if (!cell) return;
    const move = moves.get(cubeKey(grid.offsetToCube(cell)));
    if (!move || !move.path.length) continue;
    const p = grid.getTopLeftPoint(cell);
    await runAsGM({ action: "moveToken", token: target.document.uuid ?? "", x: p.x, y: p.y, path: move.path });
  }
}

/** Teleport X (p. 74): pick an empty space within range (line of sight only with the house rule). */
async function onTeleport(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "move" }>): Promise<void> {
  const token = actingToken(actor);
  if (!token || !canvas?.scene) return void ui.notifications?.warn("GLOOM.Act.noToken", { localize: true });
  const grid = canvas.grid as unknown as {
    getOffset(p: { x: number; y: number }): Offset; offsetToCube(o: Offset): HexCube; cubeToOffset(c: HexCube): Offset;
    getTopLeftPoint(o: Offset): { x: number; y: number }; getCenterPoint(o: Offset): { x: number; y: number };
  };
  const cubeOf = (tk: Token.Implementation) => grid.offsetToCube(grid.getOffset(tk.center));
  const start = cubeOf(token);
  const blocked = new Set<string>();
  for (const tk of canvas.tokens!.placeables as Token.Implementation[]) if (tk !== token) blocked.add(cubeKey(cubeOf(tk)));
  for (const [key, regions] of terrainMap(canvas.scene as Scene.Implementation)) {
    if (regions.some((r) => flagsOf(r).kind === "obstacle")) blocked.add(key);
  }
  const needSight = !!game.settings?.get(SYSTEM_ID, "teleportSight");
  const sight = (CONFIG.Canvas.polygonBackends as unknown as Record<string, { testCollision(a: unknown, b: unknown, o: unknown): unknown }>)["sight"];
  const from = token.center;
  const allowed = cellsWithin(a.value)
    .map((c) => ({ q: start.q + c.q, r: start.r + c.r, s: start.s + c.s }))
    .filter((c) => cubeKey(c) !== cubeKey(start) && !blocked.has(cubeKey(c)))
    .map((c) => grid.cubeToOffset(c))
    .filter((o) => !needSight || !sight?.testCollision(from, grid.getCenterPoint(o), { type: "sight", mode: "any" }));
  if (!allowed.length) return void ui.notifications?.warn("GLOOM.Act.noTeleport", { localize: true });
  const picked = await pickHexes({ count: 1, allowed, color: 0x8e44ad, hint: f("GLOOM.Act.teleportHint", { n: String(a.value) }) });
  const cell = picked?.[0];
  if (!cell) return;
  const p = grid.getTopLeftPoint(cell);
  await runAsGM({ action: "moveToken", token: token.document.uuid ?? "", x: p.x, y: p.y, path: [grid.offsetToCube(cell)], teleport: true });
}

/**
 * GM side: move a token with Foundry's movement API, so region behaviors (traps, hazards) react.
 * Forced movement walks (or flies) through each space of the path; Teleport is a Blink to the
 * destination. Walls were already checked when the spaces were offered.
 */
export async function forcedMoveToken(tokenUuid: string, x: number, y: number, path: HexCube[], teleport = false): Promise<void> {
  const token = (await fromUuid(tokenUuid)) as (TokenDocument.Implementation & {
    movementAction?: string; move?(w: unknown[], o: unknown): Promise<boolean>;
  }) | null;
  if (!token) return;
  const grid = (token.parent as unknown as { grid: { cubeToOffset(c: HexCube): Offset; getTopLeftPoint(o: Offset): { x: number; y: number } } }).grid;
  const action = teleport ? "blink" : token.movementAction === "fly" ? "fly" : "walk";
  const waypoints = teleport || !path.length
    ? [{ x, y, action }]
    : path.map((c) => ({ ...grid.getTopLeftPoint(grid.cubeToOffset(c)), action }));
  if (typeof token.move === "function") {
    await token.move(waypoints, { method: "api", constrainOptions: { ignoreWalls: true, ignoreCost: true }, showRuler: false });
  } else {
    await token.update({ x, y } as never);
  }
}

async function placeRegion(kind: keyof typeof COLORS, cells: Offset[], name: string, actor: Actor.Implementation, extra: Record<string, unknown> = {}): Promise<void> {
  if (!canvas?.scene) return;
  await runAsGM({
    action: "createRegion", scene: canvas.scene.uuid ?? "", name, color: COLORS[kind],
    polygons: cells.map((c) => hexPolygon(c)),
    flags: { kind, actor: actor.uuid ?? "", combatant: game.combat?.combatant?.id ?? "", ...extra },
  });
}

async function onAttack(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "attack" }>): Promise<void> {
  const deck = deckForActor(actor);
  if (!deck) return void ui.notifications?.warn("GLOOM.Deck.notReady", { localize: true });
  const base = a.relative ? npcAttack(actor) + a.value : a.value;
  if (a.area && canvas?.ready) {
    const cells = await pickHexes({ area: a.area, origin: actingToken(actor), hint: t("GLOOM.Place.hint") });
    if (!cells) return;
    await placeRegion("area", cells, `${actor.name}: ${areaLabel(a.area)}`, actor);
    targetTokensIn(cells, actor);
  }
  const targets = targetedActors();
  const group = foundry.utils.randomID();
  if (targets.length <= 1) return drawAttack(deck, { actor, base, target: targets[0] ?? null, pierce: a.pierce, group });
  // One draw per target (p. 63); lasting-effect charges are spent once for the whole ability.
  for (const target of targets) await drawAttack(deck, { actor, base, target, pierce: a.pierce, group });
}

async function applyCondition(target: Actor.Implementation, id: string): Promise<void> {
  if (id === "bless" || id === "curse") {
    const deck = deckForActor(target);
    if (deck) await addTemporary(deck, id);
    return;
  }
  if (target.isOwner) await target.toggleStatusEffect(id, { active: true });
  else await runAsGM({ action: "condition", actor: target.uuid ?? "", id });
}

async function onHeal(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "heal" }>): Promise<void> {
  const targets = a.self ? [actor] : targetedActors();
  for (const target of targets.length ? targets : [actor]) {
    if (target.isOwner) await heal(target, a.value, actor.name ?? "");
    else await runAsGM({ action: "heal", actor: target.uuid ?? "", amount: a.value, source: actor.name ?? "" });
  }
}

async function onInfuse(a: Extract<PowerAction, { kind: "infuse" }>): Promise<void> {
  let elements = a.elements;
  if (a.either && elements.length > 1) {
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("GLOOM.Act.chooseElement") },
      content: "",
      buttons: elements.map((e) => ({ action: e, label: t(`GLOOM.Element.${e}`) })),
      rejectClose: false,
    } as never);
    if (!choice) return;
    elements = [String(choice)];
  }
  for (const e of elements) await changeElement(e as ElementId, "infuse");
}

async function onSummon(actor: Actor.Implementation): Promise<void> {
  // Candidates: world NPCs, then NPCs in Actor compendiums.
  const options: { uuid: string; name: string }[] = (game.actors ?? [])
    .filter((a) => a.type === "npc").map((a) => ({ uuid: a.uuid!, name: a.name ?? "" }));
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Actor" || !pack.visible) continue;
    const index = await pack.getIndex({ fields: ["type"] as never });
    for (const e of index) {
      if ((e as { type?: string }).type === "npc") options.push({ uuid: (e as { uuid: string }).uuid, name: `${e.name} (${pack.metadata.label})` });
    }
  }
  if (!options.length) return void ui.notifications?.warn("GLOOM.Act.noSummons", { localize: true });
  // The class's own summons first.
  const mine = new Set(classSummonNames(actor));
  const isMine = (o: { name: string }) => [...mine].some((n) => o.name === n || o.name.startsWith(`${n} (`));
  options.sort((x, y) => Number(isMine(y)) - Number(isMine(x)) || x.name.localeCompare(y.name));
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Act.summon") },
    content: `<p>${t("GLOOM.Act.summonHint")}</p><select name="uuid">${options.map((o) => `<option value="${escape(o.uuid)}">${escape(o.name)}</option>`).join("")}</select>`,
    rejectClose: false,
  } as never)) as { uuid?: string } | null;
  if (!form?.uuid) return;
  const cells = await pickHexes({ count: 1, color: 0x7d4fa3, hint: t("GLOOM.Place.hintSingle") });
  if (!cells?.[0] || !canvas?.scene) return;
  const grid = canvas.grid as unknown as { getTopLeftPoint(o: Offset): { x: number; y: number } };
  const p = grid.getTopLeftPoint(cells[0]);
  await runAsGM({
    action: "spawnSummon", scene: canvas.scene.uuid ?? "", actor: form.uuid, x: p.x, y: p.y,
    controller: actor.uuid ?? "", disposition: dispositionOf(actor), user: game.user?.id ?? "",
  });
}

export async function runPowerAction(actor: Actor.Implementation, a: PowerAction): Promise<void> {
  switch (a.kind) {
    case "attack": return onAttack(actor, a);
    case "heal": return onHeal(actor, a);
    case "condition": {
      const targets = a.self ? [actor] : targetedActors();
      if (!targets.length) return void ui.notifications?.warn("GLOOM.Damage.noTarget", { localize: true });
      for (const target of targets) await applyCondition(target, a.id);
      return;
    }
    case "forced": return onForced(actor, a);
    case "move": {
      if (a.teleport) return onTeleport(actor, a);
      const npcMove = (actor.system as unknown as { current?: { move: number } }).current?.move ?? 2;
      const amount = Math.max(0, a.relative ? npcMove + a.value : a.value);
      const label = `${t(a.jump ? "GLOOM.Act.jump" : "GLOOM.Act.move")} ${amount}${a.flying ? ` (${t("GLOOM.Act.flying")})` : ""}`;
      return grantMove(actor, { amount, jump: !!a.jump, fly: !!a.flying, label });
    }
    case "infuse": return onInfuse(a.any ? { ...a, elements: [...ELEMENTS], either: true } : a);
    case "area": {
      const cells = await pickHexes({ area: a.area, origin: actingToken(actor), hint: t("GLOOM.Place.hint") });
      if (!cells) return;
      await placeRegion("area", cells, `${actor.name}: ${areaLabel(a.area)}`, actor);
      targetTokensIn(cells, actor);
      return;
    }
    case "trap": {
      const cells = await pickHexes({ count: a.count, color: 0xc0392b, hint: t("GLOOM.Place.hintSingle") });
      if (!cells) return;
      const name = f("GLOOM.Place.trapName", { damage: String(a.damage), effects: a.effects.length ? `, ${a.effects.join(", ")}` : "" });
      // Traps placed by abilities are used up when triggered (canvas/terrain.ts).
      for (const cell of cells) await placeRegion("trap", [cell], name, actor, { damage: a.damage, effects: a.effects, oneShot: true });
      return;
    }
    case "obstacle": {
      const cells = await pickHexes({ count: a.count, color: 0x7f8c8d, hint: t("GLOOM.Place.hintSingle") });
      if (!cells) return;
      for (const cell of cells) await placeRegion("obstacle", [cell], t("GLOOM.Place.obstacleName"), actor);
      return;
    }
    case "space": {
      const cells = await pickHexes({ count: a.count ?? 1, color: 0x16a085, hint: t("GLOOM.Place.hintSingle") });
      if (!cells) return;
      // The space's attack bonus (e.g. Enhancement Field: +1 attack in or next to it).
      for (const cell of cells) await placeRegion("space", [cell], `${a.label}: ${a.effect}`, actor, { bonus: parseLastingBonus(a.effect) });
      return;
    }
    case "summon": {
      if (a.name && (await placeSummonByName(actor, a.name))) return;
      return onSummon(actor);
    }
    case "mark": return applyMark(actor, a, [...(game.user?.targets ?? [])] as Token.Implementation[]);
    case "gain": return gainCounter(actor, a);
    case "play": return playIntoSlot(actor, a);
    case "give": return giveFromPool(actor, a, targetedActors());
    case "shield":
    case "retaliate":
    case "taunt": {
      // Yourself, or the targeted ally when the power gives it to an ally.
      const targets = a.self === false ? targetedActors() : [actor];
      if (!targets.length) return void ui.notifications?.warn("GLOOM.Damage.noTarget", { localize: true });
      const value = a.kind === "taunt" ? 1 : a.value;
      const persistent = a.duration === "persistent";
      for (const target of targets) {
        if (target.isOwner) await gainAbility(target, a.kind, value, { persistent, range: "range" in a ? a.range ?? null : null });
        else await runAsGM({ action: "ability", actor: target.uuid ?? "", id: a.kind, value, persistent });
      }
      return;
    }
    default: return;
  }
}

// ---------------------------------------------------------------------------
// GM side

export async function createRegion(sceneUuid: string, name: string, color: string, polygons: number[][], flags: Record<string, unknown>): Promise<void> {
  const scene = (await fromUuid(sceneUuid)) as Scene.Implementation | null;
  if (!scene) return;
  await scene.createEmbeddedDocuments("Region", [{
    name, color,
    shapes: polygons.map((points) => ({ type: "polygon", points, hole: false })),
    visibility: 2, // CONST.REGION_VISIBILITY.ALWAYS: everyone sees it
    flags: { [SYSTEM_ID]: flags },
    behaviors: behaviorsFor(flags as TerrainFlags),
  }] as never);
}

function summonOwnership(controller: Actor.Implementation | null, user: string): Record<string, number> {
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const out: Record<string, number> = {};
  for (const [id, lvl] of Object.entries((controller?.ownership ?? {}) as Record<string, number>)) {
    if (id !== "default" && lvl >= owner && !game.users?.get(id)?.isGM) out[id] = owner;
  }
  const player = (controller?.system as unknown as { player?: string } | undefined)?.player;
  if (player) out[player] = owner;
  if (user && !game.users?.get(user)?.isGM) out[user] = owner;
  return out;
}

export async function spawnSummon(sceneUuid: string, actorUuid: string, x: number, y: number, controller: string, disposition: number, user = ""): Promise<void> {
  const scene = (await fromUuid(sceneUuid)) as Scene.Implementation | null;
  let actor = (await fromUuid(actorUuid)) as Actor.Implementation | null;
  if (!scene || !actor) return;
  if (actor.pack) {
    // Import compendium summons once into the world.
    const existing = game.actors?.find((a) => (a as { _stats?: { compendiumSource?: string } })._stats?.compendiumSource === actorUuid);
    actor = (existing as Actor.Implementation | undefined)
      ?? ((await (game.actors as unknown as { importFromCompendium(p: unknown, id: string): Promise<Actor.Implementation> })
        .importFromCompendium(game.packs!.get(actor.pack), actor.id!)));
  }
  const controllerActor = (await fromUuid(controller)) as Actor.Implementation | null;
  const tokenData = await actor.getTokenDocument({ x, y, disposition, actorLink: false } as never);
  const [token] = (await scene.createEmbeddedDocuments("Token", [tokenData.toObject()] as never)) as unknown as TokenDocument.Implementation[];
  // This summon (not every copy of the base actor) belongs to the summoner: the controller's
  // owners, its player and whoever placed it may run it (Command, its own turn).
  const update: Record<string, unknown> = { "system.controller": controller, ownership: summonOwnership(controllerActor, user) };
  // Summons whose HP grows with the controller's level (e.g. the Wildfury companion).
  const byLevel = (actor.flags as Record<string, { hpByLevel?: number[] }>)[SYSTEM_ID]?.hpByLevel;
  const level = (controllerActor?.system as unknown as { level?: number } | undefined)?.level ?? 1;
  if (byLevel?.length) {
    const hp = byLevel[Math.min(byLevel.length, level) - 1] ?? byLevel[0]!;
    Object.assign(update, { "system.hp.max": hp, "system.hp.value": hp });
  }
  await (token?.actor as Actor.Implementation | undefined)?.update(update as never);
}

/** Remove the areas placed during a combatant's turn (traps and obstacles stay). */
export async function clearAreas(scene: Scene.Implementation | null | undefined, combatantId?: string): Promise<void> {
  if (!scene) return;
  const ids = scene.regions
    .filter((r) => {
      const fl = (r.flags as Record<string, { kind?: string; combatant?: string } | undefined>)[SYSTEM_ID];
      return fl?.kind === "area" && (!combatantId || fl.combatant === combatantId);
    })
    .map((r) => r.id!);
  if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
}

interface ElementUse { elements: string[]; anyOf: boolean; anyElement: boolean; consume: boolean }

/** This actor's combatant in the current combat (element uses are tracked per turn on it). */
function combatantOf(actor: Actor.Implementation): Combatant.Implementation | null {
  const combat = game.combat as Combat.Implementation | null;
  if (!combat?.started) return null;
  return (combat.combatants.find((c) => c.actor === actor || c.actor?.id === actor.id) as Combatant.Implementation | undefined) ?? null;
}

/**
 * Use elements for a bonus: pick which one for "any"/"or" bonuses, warn if this character
 * already used it this turn (each element once per turn, p. 82), consume it if the effect says so.
 * Returns false if cancelled.
 */
async function useElements(actor: Actor.Implementation, use: ElementUse): Promise<boolean> {
  const board = getBoard();
  const active = (e: string) => (board.states[e as ElementId] ?? 0) > 0;
  let chosen = use.anyElement ? ELEMENTS.filter(active) as string[] : use.elements;
  if (use.anyElement || use.anyOf) {
    const options = (use.anyElement ? chosen : use.elements.filter(active));
    const pool = options.length ? options : use.anyElement ? [...ELEMENTS] : use.elements;
    if (pool.length > 1) {
      const pick = await foundry.applications.api.DialogV2.wait({
        window: { title: t("GLOOM.Act.chooseElementUsed") }, content: "",
        buttons: pool.map((e) => ({ action: e, label: el(e) })), rejectClose: false,
      } as never);
      if (!pick) return false;
      chosen = [String(pick)];
    } else chosen = pool;
  }
  const inactive = chosen.filter((e) => !active(e));
  const combatant = combatantOf(actor);
  const used = (combatant?.getFlag(SYSTEM_ID as never, "elementsUsed" as never) as string[] | undefined) ?? [];
  const again = chosen.filter((e) => used.includes(e));
  const problems = [
    ...(inactive.length ? [f("GLOOM.Act.elementInactive", { list: inactive.map(el).join(", ") })] : []),
    ...(again.length ? [f("GLOOM.Act.elementUsed", { list: again.map(el).join(", ") })] : []),
  ];
  if (problems.length) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("GLOOM.Act.elementCheck") },
      content: `<p>${problems.join("</p><p>")}</p><p>${t("GLOOM.Act.useAnyway")}</p>`,
    } as never);
    if (!ok) return false;
  }
  if (combatant?.isOwner) {
    await combatant.setFlag(SYSTEM_ID as never, "elementsUsed" as never, [...new Set([...used, ...chosen])] as never);
  }
  if (use.consume) for (const e of chosen) await changeElement(e as ElementId, 0 as never);
  return true;
}

export function registerPowerActionButtons(): void {
  // Teleport ignores line of sight by the rules (p. 74); some tables prefer to require it.
  game.settings!.register(SYSTEM_ID, "teleportSight", {
    name: "GLOOM.Act.settingTeleportSight", hint: "GLOOM.Act.settingTeleportSightHint",
    scope: "world", config: true, type: Boolean, default: false,
  } as never);
  // Areas from a finished combat go away (traps and obstacles stay).
  Hooks.on("deleteCombat", (combat) => {
    if (game.user?.isGM && game.users?.activeGM?.isSelf) void clearAreas((combat as Combat.Implementation).scene);
  });
  document.addEventListener("click", async (event) => {
    const lasting = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-gloom-lasting]");
    if (lasting) {
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        const item = (await fromUuid(lasting.dataset["item"] ?? "")) as Item.Implementation | null;
        const actor = item?.parent as Actor.Implementation | null;
        if (!item || !actor?.isOwner) return;
        const text = String((item.system as unknown as Record<string, unknown>)[lasting.dataset["key"] ?? ""] ?? "");
        await startLasting(actor, item, text);
      })();
      return;
    }
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-gloom-act]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const actor = (await fromUuid(button.dataset["actor"] ?? "")) as Actor.Implementation | null;
    if (!actor?.isOwner) return void ui.notifications?.warn("GLOOM.Act.notYours", { localize: true });
    try {
      if (button.dataset["bonus"] && !(await useElements(actor, JSON.parse(button.dataset["bonus"]) as ElementUse))) return;
      let action = JSON.parse(button.dataset["gloomAct"] ?? "{}") as PowerAction;
      if (action.variable && "value" in action) {
        // "Attack X, where X is ...": ask for X.
        const form = (await foundry.applications.api.DialogV2.input({
          window: { title: t("GLOOM.Act.valueX") },
          content: `${action.note ? `<p>${escape(action.note)}</p>` : ""}<input type="number" name="x" value="0" min="0" step="1" autofocus>`,
          rejectClose: false,
        } as never)) as { x?: number | string } | null;
        if (!form) return;
        action = { ...action, value: Number(form.x) || 0, relative: false } as PowerAction;
      }
      // Other requirements (Berserk, Song Notes, marks): warn when not met.
      if (action.requires) {
        const { elements: _e, anyElement: _a, ...rest } = action.requires;
        const ok = bonusActive(rest, actor);
        if (ok === false) {
          const go = await foundry.applications.api.DialogV2.confirm({
            window: { title: t("GLOOM.Act.requirementTitle") },
            content: `<p>${f("GLOOM.Act.requirementNotMet", { what: requirementLabel(rest) })}</p>`,
          } as never);
          if (!go) return;
        }
      }
      // Bonuses that spend class counters (e.g. 3 rage tokens for +3 attack).
      const spend = { ...(button.dataset["spend"] ? JSON.parse(button.dataset["spend"]) as Record<string, number> : {}), ...(action.requires?.spend ?? {}) };
      if (Object.keys(spend).length && !(await spendCounters(actor, spend))) {
        return void ui.notifications?.warn(f("GLOOM.Act.notEnough", { list: Object.entries(spend).map(([k, v]) => `${v} ${k}`).join(" + ") }));
      }
      // "+1 attack for each Plague the target has": apply the bonus once per mark.
      if (button.dataset["perMark"]) {
        const per = JSON.parse(button.dataset["perBonus"] ?? "{}") as Bonus;
        const n = markCount(currentTargetActor(), button.dataset["perMark"]);
        for (let i = 1; i < n; i++) action = withBonus(action, per);
      }
      // Command: your companion or one of your summons performs it.
      let performer = actor;
      if (action.performer === "companion" || action.performer === "summon") {
        const mine = ((canvas?.tokens?.placeables ?? []) as Token.Implementation[])
          .filter((tk) => (tk.actor?.system as unknown as { controller?: string } | undefined)?.controller === mechanicsOwner(actor).uuid);
        if (mine.length === 1) performer = mine[0]!.actor as Actor.Implementation;
        else if (mine.length > 1) {
          const pick = await foundry.applications.api.DialogV2.wait({
            window: { title: t("GLOOM.Act.whoActs") }, content: "",
            buttons: mine.map((tk, i) => ({ action: String(i), label: tk.name ?? "?" })), rejectClose: false,
          } as never);
          if (pick === null || pick === undefined) return;
          performer = mine[Number(pick)]!.actor as Actor.Implementation;
        }
      }
      await runPowerAction(performer, action);
      // Counters gained automatically (e.g. Concentrated Rage when the companion attacks, unless tokens were spent).
      if (action.kind === "attack" && performer !== actor && !Object.keys(spend).length) {
        for (const m of mechanicsOf(actor)) {
          if (m.type === "counters" && m.gainOn === "companionAttack" && m.counters[0]) {
            await gainCounter(actor, { kind: "gain", id: m.id, counter: m.counters[0].id, count: 1 });
          }
        }
      }
      if (action.requires?.clearCounters) await clearCounters(actor, action.requires.clearCounters);
    } catch (err) {
      console.error("GloomFoundry | Power action failed", err);
    }
  }, true);
}

/** Enriched texts of a power and their action buttons, for sheets and chat cards. */
export async function powerDetails(item: Item.Implementation): Promise<Record<string, string>> {
  const actor = item.parent as Actor.Implementation | null;
  const s = item.system as unknown as Record<string, unknown>;
  const TextEditor = foundry.applications.ux.TextEditor.implementation;
  const out: Record<string, string> = {};
  for (const key of ["primary", "secondary", "passive", "effect", "description"]) {
    const v = s[key];
    if (typeof v !== "string" || !v) continue;
    out[key] = await TextEditor.enrichHTML(v, { relativeTo: item } as never);
    if (key === "passive") continue;
    const acts = itemActsHTML(actor, item, key, v);
    out[`${key}Acts`] = acts.html;
    if (acts.covered) out[`${key}Covered`] = "1";
    // Round/persistent effects can be tracked (rules/lasting.ts).
    if (actor && parseLasting(v)) {
      const button = `<button type="button" class="gloom-act act-lasting" data-gloom-lasting data-item="${escape(item.uuid ?? "")}" data-key="${key}">`
        + `<i class="fa-solid fa-hourglass-half"></i> ${escape(t("GLOOM.Lasting.track"))}</button>`;
      out[`${key}Acts`] = out[`${key}Acts`]
        ? out[`${key}Acts`]!.replace(/<\/div>$/, `${button}</div>`)
        : `<div class="gloom-acts">${button}</div>`;
    }
  }
  return out;
}
