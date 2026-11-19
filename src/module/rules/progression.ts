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

/** What a mercenary gains on reaching `level` (p. 120, Leveling Guide). */
export interface LevelGains {
  perks: number;
  attributePoints: number;
  classSkill: boolean;
  passiveTalent: boolean;
  ancestrySkill: boolean;
  /** Level 5: active Talents are replaced by their upgraded versions. */
  upgradeTalents: boolean;
}

export function levelGains(level: number): LevelGains {
  const l = clampLevel(level);
  return {
    perks: l > 1 ? 1 : 0,
    attributePoints: l > 1 ? 1 : 0,
    classSkill: [2, 4, 5, 6, 8, 9].includes(l),
    passiveTalent: l === 3 || l === 7,
    ancestrySkill: l === 3 || l === 7,
    upgradeTalents: l === 5,
  };
}

// ---------------------------------------------------------------------------
// Starting at higher levels and retirement benefits (p. 121)

export interface HigherLevelStart {
  /** Total Perks at that level (the level-ups give level − 1 of them). */
  perks: number;
  backgrounds: number;
  factionTier: number;
  /** Extra gold, on top of the starting equipment. */
  gold: number;
  /** Rarest equipment that gold may buy. */
  rarity: "common" | "uncommon" | "rare" | "masterwork" | "legendary";
}

const HIGHER_LEVELS: Record<number, HigherLevelStart> = {
  1: { perks: 0, backgrounds: 4, factionTier: 2, gold: 0, rarity: "common" },
  2: { perks: 1, backgrounds: 4, factionTier: 2, gold: 75, rarity: "uncommon" },
  3: { perks: 3, backgrounds: 5, factionTier: 3, gold: 100, rarity: "uncommon" },
  4: { perks: 4, backgrounds: 5, factionTier: 3, gold: 125, rarity: "rare" },
  5: { perks: 5, backgrounds: 5, factionTier: 4, gold: 150, rarity: "rare" },
  6: { perks: 7, backgrounds: 6, factionTier: 4, gold: 175, rarity: "masterwork" },
  7: { perks: 8, backgrounds: 6, factionTier: 4, gold: 200, rarity: "masterwork" },
  8: { perks: 9, backgrounds: 6, factionTier: 5, gold: 225, rarity: "legendary" },
  9: { perks: 10, backgrounds: 6, factionTier: 5, gold: 250, rarity: "legendary" },
};

export function higherLevelStart(level: number): HigherLevelStart {
  return HIGHER_LEVELS[clampLevel(level)]!;
}

/** Perks a higher-level start grants beyond the one per level-up. */
export function extraStartingPerks(level: number): number {
  const l = clampLevel(level);
  return Math.max(0, higherLevelStart(l).perks - (l - 1));
}

export interface RetirementBenefits {
  perk: number;
  background: number;
  attributePoint: number;
  /** Trade one Level 1 Skill for a Level 2 Skill. */
  skillTrade: boolean;
  legendaryItem: boolean;
}

/** Cumulative benefits for the number of mercenaries retired after completing their personal goal. */
export function retirementBenefits(retired: number): RetirementBenefits {
  const n = Math.max(0, Math.floor(retired));
  return { perk: n >= 1 ? 1 : 0, background: n >= 2 ? 1 : 0, attributePoint: n >= 3 ? 1 : 0, skillTrade: n >= 4, legendaryItem: n >= 5 };
}
