/**
 * Equipping and carrying items (Core Rulebook p. 87, 99, 141). Pure: no Foundry imports.
 *
 * - Slots: 1 Head, 1 Body, 2 Hand (a "(2)" item takes both), 1 Feet, Small = half the level
 *   rounded up (+ items such as the Cloak of Pockets).
 * - Up to 5 inventory space of unequipped items; the rest stays in the company's shared inventory.
 * - In combat, swapping is a primary action, only Hand for Hand or Small for Small, never while
 *   Stunned. Outside combat, anything goes.
 */
import { slotCapacity, type EquipmentSlot } from "./progression.ts";

export const INVENTORY_SPACE = 5;

export interface Gear {
  id: string;
  name: string;
  slot: EquipmentSlot;
  equipped: boolean;
  /** Hand slots used (2 for "(2)" items). */
  hands?: number;
  /** Extra Small slots while equipped (Cloak of Pockets). */
  smallSlots?: number;
  /** Inventory space of one item (1/2 for a ration, 1/5 for a torch). */
  space?: number;
  quantity?: number;
}

/** Slot units an item uses when equipped. */
export function slotUnits(g: Gear): number {
  return g.slot === "hand" ? Math.max(1, Math.min(2, g.hands ?? 1)) : 1;
}

/** Capacity of a slot for a level, counting equipped items that add Small slots. */
export function capacity(slot: EquipmentSlot, level: number, gear: readonly Gear[]): number {
  const base = slotCapacity(slot, level);
  if (slot !== "small") return base;
  return base + gear.filter((g) => g.equipped).reduce((n, g) => n + Math.max(0, g.smallSlots ?? 0), 0);
}

/** Slot units in use. */
export function used(slot: EquipmentSlot, gear: readonly Gear[]): number {
  return gear.filter((g) => g.equipped && g.slot === slot).reduce((n, g) => n + slotUnits(g), 0);
}

export interface EquipCheck {
  ok: boolean;
  /** Items in that slot that could be unequipped to make room (empty when ok). */
  candidates: Gear[];
  /** Slot units that must be freed. */
  free: number;
}

/** Can `item` be equipped alongside what is already equipped? */
export function checkEquip(item: Gear, level: number, gear: readonly Gear[]): EquipCheck {
  if (item.slot === "none") return { ok: false, candidates: [], free: 0 };
  const others = gear.filter((g) => g.id !== item.id);
  const cap = capacity(item.slot, level, others);
  const need = used(item.slot, others) + slotUnits(item) - cap;
  if (need <= 0) return { ok: true, candidates: [], free: 0 };
  return { ok: false, candidates: others.filter((g) => g.equipped && g.slot === item.slot), free: need };
}

/** Do these unequipped items free enough room? */
export function freesEnough(removed: readonly Gear[], free: number): boolean {
  return removed.reduce((n, g) => n + slotUnits(g), 0) >= free;
}

/** After unequipping an item that adds Small slots, too many Small items may remain equipped. */
export function smallOverflow(level: number, gear: readonly Gear[]): number {
  return Math.max(0, used("small", gear) - capacity("small", level, gear));
}

/** Inventory space taken by unequipped items. */
export function inventoryUsed(gear: readonly Gear[]): number {
  const total = gear.filter((g) => !g.equipped).reduce((n, g) => n + (g.space ?? 1) * Math.max(1, g.quantity ?? 1), 0);
  return Math.round(total * 100) / 100;
}

export type SwapRule = "free" | "primary" | "forbidden" | "stunned";

/** What swapping an item costs right now (p. 87). */
export function swapRule(slot: EquipmentSlot, inCombat: boolean, stunned: boolean): SwapRule {
  if (!inCombat) return "free";
  if (stunned) return "stunned";
  return slot === "hand" || slot === "small" ? "primary" : "forbidden";
}
