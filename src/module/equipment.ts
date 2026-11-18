/**
 * Equipping, swapping and carrying items at the table (p. 87): slot limits with a swap prompt,
 * combat limits (primary action, Hand/Small only, not while Stunned), the 5-space inventory and
 * the company's shared inventory.
 */
import { SYSTEM_ID } from "./config.ts";
import { companiesOf } from "./company.ts";
import {
  checkEquip, freesEnough, INVENTORY_SPACE, inventoryUsed, smallOverflow, swapRule, type Gear,
} from "./rules/equipment.ts";
import type { EquipmentSlot } from "./rules/progression.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface EquipSys { slot: EquipmentSlot; equipped: boolean; hands?: number; smallSlots?: number; space?: number; quantity?: number }

export function gearOf(item: Item.Implementation): Gear {
  const s = item.system as unknown as EquipSys;
  const flagHands = Number(((item.flags as Record<string, { hands?: number }>)[SYSTEM_ID])?.hands ?? 1);
  return {
    id: item.id ?? "", name: item.name ?? "", slot: s.slot ?? "none", equipped: !!s.equipped,
    hands: Math.max(s.hands ?? 1, flagHands), smallSlots: s.smallSlots ?? 0, space: s.space ?? 1, quantity: s.quantity ?? 1,
  };
}

export function gearList(actor: Actor.Implementation): Gear[] {
  return actor.items.filter((i) => i.type === "equipment").map((i) => gearOf(i as Item.Implementation));
}

const levelOf = (actor: Actor.Implementation) => (actor.system as unknown as { level?: number }).level ?? 1;

/** Is this actor fighting in a started combat? */
export function inCombat(actor: Actor.Implementation): boolean {
  const combat = game.combat;
  return !!combat?.started && combat.combatants.some((c) => c.actorId === actor.id);
}

/** May the current user break the combat swap rules? (The GM can.) */
async function overrideRule(message: string): Promise<boolean> {
  if (!game.user?.isGM) {
    ui.notifications?.warn(message);
    return false;
  }
  return !!(await foundry.applications.api.DialogV2.confirm({
    window: { title: t("GLOOM.Equip.title") },
    content: `<p>${escape(message)}</p><p>${t("GLOOM.Equip.gmOverride")}</p>`,
    rejectClose: false,
  } as never));
}

async function chooseToUnequip(item: Gear, candidates: Gear[], free: number): Promise<Gear[] | null> {
  const content = `<p>${f("GLOOM.Equip.full", { item: escape(item.name), n: String(free) })}</p>
    ${candidates.map((c, i) => `<label class="checkbox"><input type="checkbox" name="c${i}"${i < free ? " checked" : ""}> ${escape(c.name)}${(c.hands ?? 1) > 1 ? " (2)" : ""}</label>`).join("")}`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Equip.swapTitle") }, content, rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return null;
  const removed = candidates.filter((_, i) => form[`c${i}`]);
  if (!freesEnough(removed, free)) {
    ui.notifications?.warn(t("GLOOM.Equip.notEnough"));
    return null;
  }
  return removed;
}

/** Equip or unequip an item, respecting slots and the combat swap rules. */
export async function toggleEquipped(actor: Actor.Implementation, item: Item.Implementation): Promise<void> {
  const gear = gearList(actor);
  const me = gearOf(item);
  const fighting = inCombat(actor);
  const rule = swapRule(me.slot, fighting, actor.statuses.has("stun"));
  if (rule === "stunned" && !(await overrideRule(t("GLOOM.Equip.stunned")))) return;
  if (rule === "forbidden" && !(await overrideRule(f("GLOOM.Equip.forbidden", { slot: t(`GLOOM.Equipment.slot.${me.slot}`) })))) return;

  if (me.equipped) {
    await item.update({ "system.equipped": false } as never);
    const after = gearList(actor);
    const overflow = smallOverflow(levelOf(actor), after);
    if (overflow) ui.notifications?.warn(f("GLOOM.Equip.smallOverflow", { n: String(overflow) }));
    warnInventory(actor);
    if (fighting) await announce(actor, [], [me], rule);
    return;
  }
  if (me.slot === "none") return;
  const check = checkEquip(me, levelOf(actor), gear);
  let removed: Gear[] = [];
  if (!check.ok) {
    const chosen = await chooseToUnequip(me, check.candidates, check.free);
    if (!chosen) return;
    removed = chosen;
  }
  const updates = [
    ...removed.map((g) => ({ _id: g.id, "system.equipped": false })),
    { _id: me.id, "system.equipped": true },
  ];
  await actor.updateEmbeddedDocuments("Item", updates as never);
  warnInventory(actor);
  if (fighting) await announce(actor, [me], removed, rule);
}

async function announce(actor: Actor.Implementation, on: Gear[], off: Gear[], rule: string): Promise<void> {
  const names = (list: Gear[]) => list.map((g) => escape(g.name)).join(", ");
  const text = on.length && off.length
    ? f("GLOOM.Equip.swapped", { actor: escape(actor.name ?? ""), on: names(on), off: names(off) })
    : on.length ? f("GLOOM.Equip.equipped", { actor: escape(actor.name ?? ""), on: names(on) })
      : f("GLOOM.Equip.unequipped", { actor: escape(actor.name ?? ""), off: names(off) });
  const cost = rule === "primary" ? ` <span class="tag">${t("GLOOM.Equip.primaryAction")}</span>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-equip"><i class="fa-solid fa-right-left"></i> ${text}${cost}</p>`,
  } as never);
}

/** Inventory space used by unequipped items, and the limit. */
export function inventoryOf(actor: Actor.Implementation): { used: number; max: number; over: boolean } {
  const used = inventoryUsed(gearList(actor));
  return { used, max: INVENTORY_SPACE, over: used > INVENTORY_SPACE };
}

export function warnInventory(actor: Actor.Implementation): void {
  const inv = inventoryOf(actor);
  if (inv.over) ui.notifications?.warn(f("GLOOM.Equip.inventoryFull", { name: actor.name ?? "", used: String(inv.used), max: String(inv.max) }));
}

// ---------------------------------------------------------------------------
// The company's shared inventory

async function pickCompany(actor: Actor.Implementation): Promise<Actor.Implementation | null> {
  const companies = companiesOf(actor).filter((c) => c.isOwner);
  if (companies.length <= 1) return companies[0] ?? null;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Equip.stashTitle") },
    content: `<label>${t("TYPES.Actor.company")} <select name="company">${companies.map((c) => `<option value="${c.id}">${escape(c.name ?? "")}</option>`).join("")}</select></label>`,
    rejectClose: false,
  } as never)) as { company?: string } | null;
  return companies.find((c) => c.id === form?.company) ?? null;
}

function itemCopy(item: Item.Implementation, quantity: number): Record<string, unknown> {
  const data = item.toObject() as Record<string, unknown>;
  delete data["_id"];
  delete data["folder"];
  foundry.utils.mergeObject(data, { system: { equipped: false, quantity } });
  return data;
}

/** Move a quantity of an item between two actors (stacking with an item of the same name). */
export async function moveItem(from: Actor.Implementation, item: Item.Implementation, to: Actor.Implementation, quantity?: number): Promise<void> {
  const have = (item.system as unknown as EquipSys).quantity ?? 1;
  const n = Math.max(1, Math.min(have, quantity ?? have));
  const same = to.items.find((i) => i.type === "equipment" && i.name === item.name);
  if (same) await same.update({ "system.quantity": ((same.system as unknown as EquipSys).quantity ?? 1) + n } as never);
  else await to.createEmbeddedDocuments("Item", [itemCopy(item, n)] as never);
  if (n >= have) await item.delete();
  else await item.update({ "system.quantity": have - n } as never);
}

async function askQuantity(item: Item.Implementation, title: string): Promise<number | null> {
  const have = (item.system as unknown as EquipSys).quantity ?? 1;
  if (have <= 1) return 1;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title },
    content: `<label>${t("GLOOM.Shop.quantity")} <input type="number" name="quantity" value="${have}" min="1" max="${have}" step="1"></label>`,
    rejectClose: false,
  } as never)) as { quantity?: number } | null;
  return form ? Math.max(1, Math.min(have, Math.floor(Number(form.quantity) || 1))) : null;
}

/** Leave an item in the company's shared inventory. */
export async function stashItem(actor: Actor.Implementation, item: Item.Implementation): Promise<void> {
  const company = await pickCompany(actor);
  if (!company) return void ui.notifications?.warn("GLOOM.Equip.noCompany", { localize: true });
  const n = await askQuantity(item, f("GLOOM.Equip.stash", { company: company.name ?? "" }));
  if (n === null) return;
  await moveItem(actor, item, company, n);
  ui.notifications?.info(f("GLOOM.Equip.stashed", { item: item.name ?? "", company: company.name ?? "" }));
}

/** Take an item from a company's shared inventory (into a member's inventory space). */
export async function takeFromStash(company: Actor.Implementation, item: Item.Implementation, actor: Actor.Implementation): Promise<void> {
  const n = await askQuantity(item, f("GLOOM.Equip.take", { name: actor.name ?? "" }));
  if (n === null) return;
  await moveItem(company, item, actor, n);
  warnInventory(actor);
}
