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
import { parsePowerActions, type Area, type PowerAction } from "../rules/power-actions.ts";
import { areOpposed } from "../rules/sides.ts";
import { runAsGM } from "../socket.ts";
import type { ElementId } from "../rules/combat.ts";
import { changeElement } from "./elements.ts";

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

function label(actor: Actor.Implementation, a: PowerAction): { icon: string; text: string } {
  switch (a.kind) {
    case "attack": {
      const base = a.relative ? npcAttack(actor) + a.value : a.value;
      const extra = [a.area && areaLabel(a.area), a.targets > 1 && f("GLOOM.Act.targets", { n: String(a.targets) })].filter(Boolean);
      return { icon: "fa-swords", text: `${f("GLOOM.Act.attack", { n: String(base) })}${extra.length ? ` · ${extra.join(" · ")}` : ""}` };
    }
    case "heal": return { icon: "fa-heart", text: f(a.self ? "GLOOM.Act.healSelf" : "GLOOM.Act.heal", { n: String(a.value) }) };
    case "condition": return { icon: "fa-bolt", text: game.i18n!.localize(`GLOOM.Condition.${a.id}.name`) + (a.self ? ` (${t("GLOOM.Act.self")})` : "") };
    case "infuse": return { icon: "fa-fire", text: f("GLOOM.Act.infuse", { list: a.elements.map((e) => t(`GLOOM.Element.${e}`)).join(a.either ? " / " : " + ") }) };
    case "area": return { icon: "fa-draw-polygon", text: f("GLOOM.Act.place", { what: areaLabel(a.area) }) };
    case "trap": return { icon: "fa-triangle-exclamation", text: f("GLOOM.Act.trap", { n: String(a.count), damage: String(a.damage), effects: a.effects.join(", ") }) };
    case "obstacle": return { icon: "fa-cube", text: f("GLOOM.Act.obstacle", { n: String(a.count) }) };
    case "summon": return { icon: "fa-ghost", text: t("GLOOM.Act.summon") };
  }
}

/** Buttons for one power text. */
export function actionButtonsHTML(actor: Actor.Implementation | null, text: string): string {
  if (!actor || !text) return "";
  const actions = parsePowerActions(text);
  // Conditions carried by an attack or heal get their own button too (to apply after the hit).
  const extra: PowerAction[] = actions.flatMap((a) =>
    a.kind === "attack" || a.kind === "heal"
      ? a.conditions.map((c) => ({ kind: "condition", id: c.toLowerCase(), self: false }) as PowerAction)
      : []);
  const all = [...actions, ...extra];
  if (!all.length) return "";
  return `<div class="gloom-acts">${all.map((a) => {
    const l = label(actor, a);
    return `<button type="button" class="gloom-act act-${a.kind}" data-gloom-act="${escape(JSON.stringify(a))}" data-actor="${escape(actor.uuid ?? "")}"><i class="fa-solid ${l.icon}"></i> ${escape(l.text)}</button>`;
  }).join("")}</div>`;
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
    case "infuse": return onInfuse(a);
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
    if (key !== "passive") out[`${key}Acts`] = actionButtonsHTML(actor, v);
  }
  return out;
}
