/**
 * Action buttons for powers (sheet details and chat cards): Attack, Heal, apply a condition,
 * Infuse, place an area, a trap, an obstacle or a summon. Built from the power's text
 * (rules/power-actions.ts). Areas, traps and obstacles become scene Regions; areas are cleared
 * at the end of the acting character's turn, traps and obstacles stay until removed.
 */
import { SYSTEM_ID } from "../config.ts";
import { pickHexes, hexPolygon, type Offset } from "../canvas/hex-place.ts";
import { addTemporary, drawAttack } from "../deck/actions.ts";
import { deckForActor } from "../deck/registry.ts";
import { dispositionOf } from "../npc.ts";
import { heal } from "../powers.ts";
import { parsePowerActions, type Area, type Bonus, type PowerAction, type StoredActions } from "../rules/power-actions.ts";
import { areOpposed } from "../rules/sides.ts";
import { runAsGM } from "../socket.ts";
import type { ElementId } from "../rules/combat.ts";
import { changeElement, getBoard } from "./elements.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COLORS = { area: "#e2662b", trap: "#c0392b", obstacle: "#7f8c8d" } as const;

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

/** Is the bonus's element requirement met on the scene's element board? */
function bonusActive(b: Bonus): boolean | null {
  const board = getBoard();
  const active = (e: string) => (board.states[e as ElementId] ?? 0) > 0;
  if (b.anyElement) return ELEMENTS.some(active);
  if (!b.elements?.length) return null;
  return b.anyOf ? b.elements.some(active) : b.elements.every(active);
}

function bonusLabel(b: Bonus): string {
  const trigger = b.anyElement ? t("GLOOM.Act.anyElement") : b.elements?.length ? b.elements.map(el).join(b.anyOf ? "/" : "+") : b.when ?? "";
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
      const v = a.relative ? (a.value >= 0 ? `+${a.value}` : String(a.value)) : String(a.value);
      return { icon: a.jump ? "fa-person-running" : "fa-shoe-prints", button: false, text: `${t(a.jump ? "GLOOM.Act.jump" : "GLOOM.Act.move")} ${v}${a.flying ? ` (${t("GLOOM.Act.flying")})` : ""}` };
    }
    case "shield": return { icon: "fa-shield", button: false, text: `Shield ${a.value}${a.self ? "" : ` (${t("GLOOM.Act.ally")})`}` };
    case "retaliate": return { icon: "fa-hand-fist", button: false, text: `Retaliate ${a.value}${a.range ? ` · ${t("GLOOM.Act.rangeWord")} ${a.range}` : ""}` };
    case "condition": return { icon: "fa-bolt", button: true, text: cond(a.id) + (a.self ? ` (${t("GLOOM.Act.self")})` : "") };
    case "infuse": return { icon: "fa-fire", button: true, text: a.any ? f("GLOOM.Act.infuse", { list: t("GLOOM.Act.anyElement") }) : f("GLOOM.Act.infuse", { list: a.elements.map(el).join(a.either ? " / " : " + ") }) };
    case "area": return { icon: "fa-draw-polygon", button: true, text: f("GLOOM.Act.place", { what: areaLabel(a.area) }) };
    case "trap": return { icon: "fa-triangle-exclamation", button: true, text: f("GLOOM.Act.trap", { n: String(a.count), damage: String(a.damage), effects: a.effects.join(", ") }) };
    case "obstacle": return { icon: "fa-cube", button: true, text: f("GLOOM.Act.obstacle", { n: String(a.count) }) };
    case "summon": return { icon: "fa-ghost", button: true, text: a.name ? `${t("GLOOM.Act.summon")}: ${a.name}` : t("GLOOM.Act.summon") };
    case "choice": return { icon: "fa-list-check", button: false, text: f("GLOOM.Act.choose", { n: String(a.pick) }) };
    case "text": return { icon: "fa-circle-info", button: false, text: a.text };
  }
}

function oneHTML(actor: Actor.Implementation, a: PowerAction): string {
  const l = label(actor, a);
  const uuid = escape(actor.uuid ?? "");
  const note = a.note ? `<span class="act-note">${escape(a.note)}</span>` : "";
  if (a.kind === "choice") {
    return `<div class="gloom-act-choice"><span class="gloom-act-chip"><i class="fa-solid ${l.icon}"></i> ${escape(l.text)}</span>${
      a.options.map((opt) => `<div class="option">${opt.map((o) => oneHTML(actor, o)).join("")}</div>`).join("")}${note}</div>`;
  }
  const main = l.button
    ? `<button type="button" class="gloom-act act-${a.kind}" data-gloom-act="${escape(JSON.stringify(a))}" data-actor="${uuid}"><i class="fa-solid ${l.icon}"></i> ${escape(l.text)}</button>`
    : `<span class="gloom-act-chip act-${a.kind}"><i class="fa-solid ${l.icon}"></i> ${escape(l.text)}</span>`;
  // Bonus variants: the same action with the extras applied; highlighted when the element is active.
  const bonuses = (a.bonuses ?? []).map((b) => {
    const state = bonusActive(b);
    const css = state === null ? "" : state ? " active" : " inactive";
    const merged = withBonus(a, b);
    const trigger = escape(JSON.stringify({ elements: b.elements ?? [], anyOf: !!b.anyOf, anyElement: !!b.anyElement, consume: !!b.consume }));
    return l.button
      ? `<button type="button" class="gloom-act bonus${css}" data-gloom-act="${escape(JSON.stringify(merged))}" data-bonus="${trigger}" data-actor="${uuid}"><i class="fa-solid fa-plus"></i> ${escape(bonusLabel(b))}</button>`
      : `<span class="gloom-act-chip bonus${css}"><i class="fa-solid fa-plus"></i> ${escape(bonusLabel(b))}</span>`;
  });
  // Conditions carried by an attack or heal also get their own button (applied after the hit).
  const carried = a.kind === "attack" || a.kind === "heal"
    ? a.conditions.map((c) => oneHTML(actor, { kind: "condition", id: c.toLowerCase(), self: a.kind === "heal" && a.self }))
    : [];
  return [main, ...bonuses, ...carried].join("") + note;
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
    return cells.some((c) => c.i === o.i && c.j === o.j) && areOpposed(me, tk.document.disposition);
  });
  for (const tk of [...(game.user?.targets ?? [])]) tk.setTarget(false, { releaseOthers: false, groupSelection: true } as never);
  for (const tk of inside) tk.setTarget(true, { releaseOthers: false, groupSelection: true } as never);
}

async function placeRegion(kind: keyof typeof COLORS, cells: Offset[], name: string, actor: Actor.Implementation): Promise<void> {
  if (!canvas?.scene) return;
  await runAsGM({
    action: "createRegion", scene: canvas.scene.uuid ?? "", name, color: COLORS[kind],
    polygons: cells.map((c) => hexPolygon(c)),
    flags: { kind, actor: actor.uuid ?? "", combatant: game.combat?.combatant?.id ?? "" },
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
  if (targets.length <= 1) return drawAttack(deck, { actor, base, target: targets[0] ?? null, pierce: a.pierce });
  // One draw per target (p. 63).
  for (const target of targets) await drawAttack(deck, { actor, base, target, pierce: a.pierce });
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
  options.sort((x, y) => x.name.localeCompare(y.name));
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
    controller: actor.uuid ?? "", disposition: dispositionOf(actor),
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
      for (const cell of cells) await placeRegion("trap", [cell], name, actor);
      return;
    }
    case "obstacle": {
      const cells = await pickHexes({ count: a.count, color: 0x7f8c8d, hint: t("GLOOM.Place.hintSingle") });
      if (!cells) return;
      for (const cell of cells) await placeRegion("obstacle", [cell], t("GLOOM.Place.obstacleName"), actor);
      return;
    }
    case "summon": return onSummon(actor);
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
  }] as never);
}

export async function spawnSummon(sceneUuid: string, actorUuid: string, x: number, y: number, controller: string, disposition: number): Promise<void> {
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
  const tokenData = await actor.getTokenDocument({ x, y, disposition, actorLink: false } as never);
  const [token] = (await scene.createEmbeddedDocuments("Token", [tokenData.toObject()] as never)) as unknown as TokenDocument.Implementation[];
  await (token?.actor as Actor.Implementation | undefined)?.update({ "system.controller": controller } as never);
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
  // Areas from a finished combat go away (traps and obstacles stay).
  Hooks.on("deleteCombat", (combat) => {
    if (game.user?.isGM && game.users?.activeGM?.isSelf) void clearAreas((combat as Combat.Implementation).scene);
  });
  document.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-gloom-act]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const actor = (await fromUuid(button.dataset["actor"] ?? "")) as Actor.Implementation | null;
    if (!actor?.isOwner) return void ui.notifications?.warn("GLOOM.Act.notYours", { localize: true });
    try {
      if (button.dataset["bonus"] && !(await useElements(actor, JSON.parse(button.dataset["bonus"]) as ElementUse))) return;
      await runPowerAction(actor, JSON.parse(button.dataset["gloomAct"] ?? "{}") as PowerAction);
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
    if (key !== "passive") out[`${key}Acts`] = actionButtonsHTML(actor, actionsFor(item, key, v));
  }
  return out;
}
