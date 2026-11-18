/**
 * Class mechanics at the table (rules/class-mechanics.ts for the model): marks on tokens
 * (Doom, Plague, Prescription), counters (Notes), slots in play (Augments, Songs), pools handed
 * out to allies (Supply, Medical Packs) and the class's summons. Also the sheet's Class panel.
 */
import { SYSTEM_ID } from "./config.ts";
import { pickHexes, type Offset } from "./canvas/hex-place.ts";
import { dispositionOf } from "./npc.ts";
import {
  addToCounter, availablePoolItems, playInSlot, type ClassState, type Mechanic, type MechanicOption,
} from "./rules/class-mechanics.ts";
import type { PowerAction } from "./rules/power-actions.ts";
import { runAsGM } from "./socket.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Token marks; icons can be replaced by the icon pack ("mark.doom"...). */
const MARKS: Record<string, string> = {
  doom: "icons/svg/skull.svg",
  plague: "icons/svg/biohazard.svg",
  prescription: "icons/svg/heal.svg",
};

export function markStatuses(): { id: string; name: string; img: string }[] {
  const pack = CONFIG.GLOOM?.icons ?? {};
  return Object.entries(MARKS).map(([id, img]) => ({ id, name: `GLOOM.Mark.${id}`, img: pack[`mark.${id}`] ?? img }));
}

// ---------------------------------------------------------------------------
// Access

/** The mercenary whose class mechanics apply: the actor itself, or a summon's controller. */
export function mechanicsOwner(actor: Actor.Implementation): Actor.Implementation {
  if (actor.type === "mercenary") return actor;
  const controller = (actor.system as unknown as { controller?: string }).controller;
  const owner = controller ? (fromUuidSync(controller) as Actor.Implementation | null) : null;
  return owner ?? actor;
}

export function mechanicsOf(actor: Actor.Implementation): Mechanic[] {
  const owner = mechanicsOwner(actor);
  const all = (owner.system as unknown as { mechanics?: Mechanic[] }).mechanics ?? [];
  // Talent-dependent mechanics (e.g. Concentrated Rage tokens) only once the talent is known.
  return all.filter((m) => !m.talent || owner.items.some((i) => i.type === "talent" && i.name === m.talent));
}

/** All class counters of an actor's mercenary, flattened (counter id -> value). */
export function allCounters(actor: Actor.Implementation): Record<string, number> {
  const owner = mechanicsOwner(actor);
  const counters = (owner.system as unknown as { classState?: ClassState }).classState?.counters ?? {};
  return Object.assign({}, ...Object.values(counters));
}

/** Spend class counters (e.g. 3 rage tokens). Returns false if there aren't enough. */
export async function spendCounters(actor: Actor.Implementation, spend: Record<string, number>): Promise<boolean> {
  const owner = mechanicsOwner(actor);
  const state = stateOf(owner);
  const counters = foundry.utils.deepClone(state.counters ?? {});
  for (const [id, n] of Object.entries(spend)) {
    const mechId = Object.keys(counters).find((m) => (counters[m]?.[id] ?? 0) >= n);
    if (!mechId) return false;
    counters[mechId]![id] = (counters[mechId]![id] ?? 0) - n;
  }
  state.counters = counters;
  await saveState(owner, state);
  return true;
}

export function statesOf(actor: Actor.Implementation): string[] {
  return (mechanicsOwner(actor).system as unknown as { states?: string[] }).states ?? [];
}

function stateOf(actor: Actor.Implementation): ClassState {
  return foundry.utils.deepClone((actor.system as unknown as { classState?: ClassState }).classState ?? {});
}

async function saveState(actor: Actor.Implementation, state: ClassState): Promise<void> {
  if (actor.isOwner) await actor.update({ "system.classState": state } as never);
  else await runAsGM({ action: "classState", actor: actor.uuid ?? "", state: state as Record<string, unknown> });
}

function mechanic<T extends Mechanic["type"]>(actor: Actor.Implementation, id: string, type: T): Extract<Mechanic, { type: T }> | null {
  const m = mechanicsOf(actor).find((x) => x.id === id && x.type === type);
  return (m as Extract<Mechanic, { type: T }> | undefined) ?? null;
}

/** How many of a mark an actor carries (Plague stacks; others are 0 or 1). */
export function markCount(actor: Actor.Implementation | null | undefined, id: string): number {
  if (!actor) return 0;
  return actor.effects.filter((e) => e.statuses.has(id))
    .reduce((n, e) => n + Number(((e.flags as Record<string, { count?: number }>)[SYSTEM_ID]?.count) ?? 1), 0);
}

async function chooseOption(title: string, options: MechanicOption[]): Promise<MechanicOption | null> {
  if (options.length <= 1) return options[0] ?? null;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<div class="gloom-option-list">${options.map((o) => `<p><strong>${escape(o.name)}</strong>${o.group ? ` <em>(${escape(o.group)})</em>` : ""}: ${escape(o.text)}</p>`).join("")}</div>`,
    buttons: options.map((o, i) => ({ action: String(i), label: o.name })),
    rejectClose: false,
  } as never);
  return choice === null || choice === undefined ? null : options[Number(choice)] ?? null;
}

// ---------------------------------------------------------------------------
// Marks

/** Create/stack/replace a mark effect on an actor (GM side when needed). */
export async function setMarkEffect(
  target: Actor.Implementation, id: string, label: string, opts: { count?: number; option?: string; stacking?: boolean; source?: string },
): Promise<void> {
  const existing = target.effects.find((e) => e.statuses.has(id)) as ActiveEffect.Implementation | undefined;
  const img = markStatuses().find((s) => s.id === id)?.img ?? "icons/svg/aura.svg";
  const prev = existing ? Number(((existing.flags as Record<string, { count?: number }>)[SYSTEM_ID]?.count) ?? 1) : 0;
  const count = opts.stacking ? prev + (opts.count ?? 1) : 1;
  const name = `${label}${opts.option ? `: ${opts.option}` : ""}${opts.stacking ? ` ×${count}` : ""}`;
  const flags = { [SYSTEM_ID]: { count, option: opts.option ?? "", source: opts.source ?? "" } };
  if (existing) await existing.update({ name, flags } as never);
  else await target.createEmbeddedDocuments("ActiveEffect", [{ name, img, statuses: [id], flags }] as never);
}

export async function removeMarkEffect(target: Actor.Implementation, id: string): Promise<void> {
  const ids = target.effects.filter((e) => e.statuses.has(id)).map((e) => e.id!);
  if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
}

async function markActor(target: Actor.Implementation, id: string, label: string, opts: { count?: number; option?: string; stacking?: boolean; source?: string }) {
  if (target.isOwner) await setMarkEffect(target, id, label, opts);
  else await runAsGM({ action: "mark", actor: target.uuid ?? "", id, label, opts });
}

async function unmarkActor(target: Actor.Implementation, id: string) {
  if (target.isOwner) await removeMarkEffect(target, id);
  else await runAsGM({ action: "unmark", actor: target.uuid ?? "", id });
}

/** "Give 1 enemy a Doom", "Plague, target 2": mark the targeted tokens. */
export async function applyMark(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "mark" }>, targets: Token.Implementation[]): Promise<void> {
  const owner = mechanicsOwner(actor);
  const mech = mechanic(owner, a.id, "mark");
  const label = mech?.label ?? t(`GLOOM.Mark.${a.id}`);
  if (!targets.length) return void ui.notifications?.warn("GLOOM.Damage.noTarget", { localize: true });
  let option = a.option;
  if (!option && mech?.options?.length) {
    const pool = a.group ? mech.options.filter((o) => !o.group || o.group === a.group || (a.group === "advanced")) : mech.options;
    option = (await chooseOption(f("GLOOM.Mark.choose", { mark: label }), pool))?.name;
    if (!option) return;
  }
  const state = stateOf(owner);
  for (const token of targets.slice(0, a.targets ?? targets.length)) {
    const target = token.actor as Actor.Implementation | null;
    if (!target) continue;
    if (mech?.single) {
      // Only one at a time: the previous one ends.
      const prev = state.marks?.[a.id];
      if (prev?.token && prev.token !== token.document.uuid) {
        const prevToken = fromUuidSync(prev.token) as TokenDocument.Implementation | null;
        if (prevToken?.actor) await unmarkActor(prevToken.actor as Actor.Implementation, a.id);
      }
      state.marks = { ...(state.marks ?? {}), [a.id]: { token: token.document.uuid ?? "", option: option ?? "" } };
    }
    await markActor(target, a.id, label, { count: a.count ?? 1, option, stacking: mech?.stacking ?? a.id === "plague", source: owner.uuid ?? "" });
  }
  if (mech?.single) await saveState(owner, state);
}

/** Marks this mercenary has placed on tokens of the current scene. */
function placedMarks(owner: Actor.Implementation, id: string): { token: string; name: string; count: number; option: string }[] {
  const out: { token: string; name: string; count: number; option: string }[] = [];
  for (const token of (canvas?.tokens?.placeables ?? []) as Token.Implementation[]) {
    const effect = token.actor?.effects.find((e) => e.statuses.has(id));
    if (!effect) continue;
    const fl = (effect.flags as Record<string, { count?: number; option?: string; source?: string }>)[SYSTEM_ID] ?? {};
    if (fl.source && fl.source !== owner.uuid) continue;
    out.push({ token: token.document.uuid ?? "", name: token.name ?? "", count: Number(fl.count ?? 1), option: fl.option ?? "" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Counters, slots, pools

export async function gainCounter(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "gain" }>): Promise<void> {
  const owner = mechanicsOwner(actor);
  const mech = mechanic(owner, a.id, "counters");
  if (!mech) return void ui.notifications?.warn(f("GLOOM.Mech.missing", { id: a.id }));
  let counter = a.counter;
  if (counter === "any" || !mech.counters.some((c) => c.id === counter)) {
    const pick = await foundry.applications.api.DialogV2.wait({
      window: { title: mech.label }, content: "",
      buttons: mech.counters.map((c) => ({ action: c.id, label: c.label })), rejectClose: false,
    } as never);
    if (!pick) return;
    counter = String(pick);
  }
  const state = stateOf(owner);
  const { counters, gained } = addToCounter(mech, state.counters?.[mech.id], counter, a.count);
  if (gained < a.count) ui.notifications?.info(f("GLOOM.Mech.counterFull", { label: mech.label, max: String(mech.max) }));
  state.counters = { ...(state.counters ?? {}), [mech.id]: counters };
  await saveState(owner, state);
}

export async function clearCounters(actor: Actor.Implementation, mechId: string): Promise<void> {
  const owner = mechanicsOwner(actor);
  const state = stateOf(owner);
  state.counters = { ...(state.counters ?? {}), [mechId]: {} };
  await saveState(owner, state);
}

export async function playIntoSlot(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "play" }>): Promise<void> {
  const owner = mechanicsOwner(actor);
  const mech = mechanic(owner, a.id, "slot");
  const state = stateOf(owner);
  const { list, removed } = playInSlot(mech?.max ?? 1, state.slots?.[a.id], { name: a.name, ...(a.text ? { text: a.text } : {}) });
  state.slots = { ...(state.slots ?? {}), [a.id]: list };
  await saveState(owner, state);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: owner as Actor.Stored }),
    content: `<p class="gloom-mech"><i class="fa-solid fa-play"></i> ${f("GLOOM.Mech.played", { name: a.name, label: mech?.label ?? a.id })}${
      removed.length ? ` ${f("GLOOM.Mech.ended", { list: removed.map((r) => r.name).join(", ") })}` : ""}</p>`,
  } as never);
}

async function createItemOn(recipient: Actor.Implementation, data: Record<string, unknown>): Promise<void> {
  if (recipient.isOwner) await recipient.createEmbeddedDocuments("Item", [data] as never);
  else await runAsGM({ action: "createItem", actor: recipient.uuid ?? "", data });
}

/** Hand a Supply item / Medical Pack to the targeted ally (or yourself). */
export async function giveFromPool(actor: Actor.Implementation, a: Extract<PowerAction, { kind: "give" }>, recipients: Actor.Implementation[]): Promise<void> {
  const owner = mechanicsOwner(actor);
  const mech = mechanic(owner, a.id, "pool");
  if (!mech) return void ui.notifications?.warn(f("GLOOM.Mech.missing", { id: a.id }));
  const state = stateOf(owner);
  const held = { ...(state.pools?.[mech.id] ?? {}) };
  for (const recipient of recipients.length ? recipients : [owner]) {
    for (let n = 0; n < (a.count ?? 1); n++) {
      const free = availablePoolItems(mech, held);
      if (!free.length) { ui.notifications?.info(f("GLOOM.Mech.poolEmpty", { label: mech.label })); break; }
      const item = a.item ? free.find((i) => i.name === a.item) ?? null
        : (a.random ?? mech.random) ? free[Math.floor(Math.random() * free.length)]!
          : await chooseOption(mech.label, free);
      if (!item) return;
      held[item.name] = recipient.uuid ?? "";
      await createItemOn(recipient, {
        name: item.name, type: "equipment", img: "icons/svg/item-bag.svg",
        system: { slot: "none", effect: `<p>${escape(item.text)}</p>`, consumable: true, quantity: 1, actions: item.actions?.length ? { effect: item.actions } : {} },
        flags: { [SYSTEM_ID]: { pool: { owner: owner.uuid, mechanic: mech.id, item: item.name } } },
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: owner as Actor.Stored }),
        content: `<p class="gloom-mech"><i class="fa-solid fa-gift"></i> ${f("GLOOM.Mech.gave", { item: item.name, name: recipient.name ?? "" })}</p>`,
      } as never);
    }
  }
  state.pools = { ...(state.pools ?? {}), [mech.id]: held };
  await saveState(owner, state);
}

/** A pool item came back (used, or returned by hand). */
export async function returnToPool(ownerUuid: string, mechId: string, itemName: string): Promise<void> {
  const owner = (await fromUuid(ownerUuid)) as Actor.Implementation | null;
  if (!owner) return;
  const state = stateOf(owner);
  const held = { ...(state.pools?.[mechId] ?? {}) };
  delete held[itemName];
  state.pools = { ...(state.pools ?? {}), [mechId]: held };
  await saveState(owner, state);
}

// ---------------------------------------------------------------------------
// Summons by name

async function findNpc(name: string): Promise<string | null> {
  const world = game.actors?.find((a) => a.type === "npc" && a.name === name);
  if (world) return world.uuid ?? null;
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Actor" || !pack.visible) continue;
    const entry = (await pack.getIndex()).find((e) => e.name === name);
    if (entry) return (entry as { uuid: string }).uuid;
  }
  return null;
}

/** Place a named summon next to... wherever the player clicks. */
export async function placeSummonByName(actor: Actor.Implementation, name: string): Promise<boolean> {
  const uuid = await findNpc(name);
  if (!uuid) {
    ui.notifications?.warn(f("GLOOM.Mech.noSummon", { name }));
    return false;
  }
  const owner = mechanicsOwner(actor);
  const cells = await pickHexes({ count: 1, color: 0x7d4fa3, hint: t("GLOOM.Place.hintSingle") });
  if (!cells?.[0] || !canvas?.scene) return false;
  const grid = canvas.grid as unknown as { getTopLeftPoint(o: Offset): { x: number; y: number } };
  const p = grid.getTopLeftPoint(cells[0]);
  await runAsGM({
    action: "spawnSummon", scene: canvas.scene.uuid ?? "", actor: uuid, x: p.x, y: p.y,
    controller: owner.uuid ?? "", disposition: dispositionOf(owner),
  });
  return true;
}

/** Names of the class's summons (for the summon picker). */
export function classSummonNames(actor: Actor.Implementation): string[] {
  return mechanicsOf(actor).flatMap((m) => (m.type === "summons" ? m.summons.map((s) => s.name) : []));
}

// ---------------------------------------------------------------------------
// Sheet panel

export function classPanel(actor: Actor.Implementation): Record<string, unknown>[] {
  const state = stateOf(actor);
  const states = statesOf(actor);
  return mechanicsOf(actor).map((m) => {
    const base = { id: m.id, type: m.type, label: m.label, text: m.text ?? "" };
    switch (m.type) {
      case "state": return { ...base, isState: true, active: states.includes(m.id) };
      case "counters": {
        const values = state.counters?.[m.id] ?? {};
        const total = m.counters.reduce((n, c) => n + (values[c.id] ?? 0), 0);
        return { ...base, isCounters: true, max: m.max, total, counters: m.counters.map((c) => ({ ...c, value: values[c.id] ?? 0 })) };
      }
      case "slot": return { ...base, isSlot: true, max: m.max, entries: state.slots?.[m.id] ?? [] };
      case "mark": return {
        ...base, isMark: true, marks: placedMarks(actor, m.id),
        options: (m.options ?? []).map((o) => ({ ...o })),
      };
      case "pool": {
        const held = state.pools?.[m.id] ?? {};
        return {
          ...base, isPool: true,
          items: m.items.map((i) => {
            const holder = held[i.name] ? (fromUuidSync(held[i.name]!) as Actor.Implementation | null) : null;
            return { name: i.name, text: i.text, held: !!held[i.name], holder: holder?.name ?? (held[i.name] ? "?" : "") };
          }),
        };
      }
      case "summons": return { ...base, isSummons: true, summons: m.summons };
    }
  });
}

/** Sheet buttons of the Class panel (data-op). */
export async function classPanelAction(actor: Actor.Implementation, el: HTMLElement): Promise<void> {
  const d = el.dataset;
  const mechId = d["mech"] ?? "";
  const state = stateOf(actor);
  switch (d["op"]) {
    case "counter": {
      const mech = mechanic(actor, mechId, "counters");
      if (!mech) return;
      const { counters } = addToCounter(mech, state.counters?.[mechId], d["counter"] ?? "", Number(d["delta"] ?? 1));
      state.counters = { ...(state.counters ?? {}), [mechId]: counters };
      return saveState(actor, state);
    }
    case "clearCounters": return clearCounters(actor, mechId);
    case "endSlot": {
      state.slots = { ...(state.slots ?? {}), [mechId]: (state.slots?.[mechId] ?? []).filter((e) => e.name !== d["name"]) };
      return saveState(actor, state);
    }
    case "unmark": {
      const token = fromUuidSync(d["token"] ?? "") as TokenDocument.Implementation | null;
      if (token?.actor) await unmarkActor(token.actor as Actor.Implementation, mechId);
      if (state.marks?.[mechId]?.token === d["token"]) {
        state.marks = { ...(state.marks ?? {}), [mechId]: null };
        await saveState(actor, state);
      }
      return;
    }
    case "mark": {
      const targets = [...(game.user?.targets ?? [])] as Token.Implementation[];
      return applyMark(actor, { kind: "mark", id: mechId }, targets);
    }
    case "give": {
      const recipients = [...(game.user?.targets ?? [])].map((tk) => tk.actor as Actor.Implementation).filter(Boolean);
      return giveFromPool(actor, { kind: "give", id: mechId, ...(d["item"] ? { item: d["item"] } : {}) }, recipients);
    }
    case "return": {
      const holderUuid = state.pools?.[mechId]?.[d["item"] ?? ""];
      const holder = holderUuid ? ((await fromUuid(holderUuid)) as Actor.Implementation | null) : null;
      const item = holder?.items.find((i) => {
        const pool = (i.flags as Record<string, { pool?: { item?: string; mechanic?: string } }>)[SYSTEM_ID]?.pool;
        return pool?.item === d["item"] && pool?.mechanic === mechId;
      });
      if (item && holder) {
        if (holder.isOwner) await item.delete();
        else await runAsGM({ action: "deleteItem", actor: holder.uuid ?? "", item: item.id ?? "" });
      }
      return returnToPool(actor.uuid ?? "", mechId, d["item"] ?? "");
    }
    case "summon": {
      await placeSummonByName(actor, d["name"] ?? "");
      return;
    }
  }
}

export function registerClassMechanicHooks(): void {
  // A pool item used up (consumable deleted) goes back to its owner's pool.
  Hooks.on("deleteItem", (item, _options, userId) => {
    if (userId !== game.user?.id) return;
    const pool = ((item as Item.Implementation).flags as Record<string, { pool?: { owner?: string; mechanic?: string; item?: string } }>)[SYSTEM_ID]?.pool;
    if (!pool?.owner || !pool.mechanic || !pool.item) return;
    void returnToPool(pool.owner, pool.mechanic, pool.item);
  });
}
