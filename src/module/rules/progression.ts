/**
 * Mercenary progression rules (Core Rulebook ch. 4, "Gaining Levels" and the Leveling Guide, p. 120).
 */

export const MAX_LEVEL = 9;

export type HpTrack = "low" | "medium" | "high";

/** Maximum HP by level (index 0 = level 1) for each class health track. */
export const HP_BY_LEVEL: Record<HpTrack, readonly number[]> = {
  low: [6, 7, 8, 9, 10, 11, 12, 13, 14],
  medium: [8, 9, 11, 12, 14, 15, 17, 18, 20],
  high: [10, 12, 14, 16, 18, 20, 22, 24, 26],
};

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));
}

export function maxHp(track: HpTrack, level: number): number {
  return HP_BY_LEVEL[track][clampLevel(level) - 1]!;
}

/** Attribute maximum: 2 + half the level, rounded up (3 at level 1). */
export function attributeMax(level: number): number {
  return 2 + Math.ceil(clampLevel(level) / 2);
}

/** Number of Small items you may equip: half your level, rounded up (p. 87). */
export function smallItemSlots(level: number): number {
  return Math.ceil(clampLevel(level) / 2);
}

/** Expending a Skill for an Attribute test gives half its level, rounded up (p. 70). */
export function skillTestBonus(skillLevel: number): number {
  return Math.ceil(Math.max(1, skillLevel) / 2);
}

/** Equipment slots (p. 87). Small is limited by level, "none" items live in the inventory space. */
export const EQUIPMENT_SLOTS = ["head", "body", "hand", "feet", "small", "none"] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export function slotCapacity(slot: EquipmentSlot, level: number): number {
  switch (slot) {
    case "hand":
      return 2;
    case "small":
      return smallItemSlots(level);
    case "none":
      return Number.POSITIVE_INFINITY;
    default:
      return 1;
  }
}

/** Skills in use between Full Rests: 2 ancestry + 4 class (p. 68). */
export const SKILL_LOADOUT = { ancestry: 2, class: 4 } as const;

/** Total inventory space for unequipped items carried on a mission (p. 87). */
export const INVENTORY_SPACE = 5;

/** Background test bonus: +1, or +2 for Master occupations (p. 117). */
export function backgroundBonus(master: boolean): number {
  return master ? 2 : 1;
}
