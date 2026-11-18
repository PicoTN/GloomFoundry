/**
 * Shops and mission rewards (Core Rulebook p. 93, 268-269). Pure: no Foundry imports.
 *
 * - A city's Prosperity (1-5) sets a shop's highest rarity and how many items are on display.
 * - An item rarer than the shop normally sells can still be offered for +10 g per Prosperity
 *   step it is missing.
 * - Suggested gate: no Rare items before Level 4, no Masterwork before Level 7. Legendary items
 *   are never sold in shops.
 * - Items sell back for half their gold cost.
 * - Missions pay 10-20 g per mercenary; Faction Requests 5-10 g; treasure up to 5 g.
 */

export const RARITIES = ["common", "uncommon", "rare", "masterwork", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export const MIN_PROSPERITY = 1;
export const MAX_PROSPERITY = 5;

/** Shop inventories by Prosperity: highest rarity and items on display (5: any number). */
export const SHOP_TABLE: Record<number, { highest: Rarity; display: [number, number] | null }> = {
  1: { highest: "common", display: [4, 5] },
  2: { highest: "common", display: [5, 6] },
  3: { highest: "uncommon", display: [6, 7] },
  4: { highest: "rare", display: [7, 8] },
  5: { highest: "masterwork", display: null },
};

const rank = (r: string): number => Math.max(0, RARITIES.indexOf(r as Rarity));
const clampProsperity = (p: number): number => Math.min(MAX_PROSPERITY, Math.max(MIN_PROSPERITY, Math.round(p) || 1));

export function highestRarity(prosperity: number): Rarity {
  return SHOP_TABLE[clampProsperity(prosperity)]!.highest;
}

/** Lowest Prosperity whose shops normally sell this rarity (Legendary: none). */
export function minProsperity(rarity: string): number | null {
  if (rarity === "legendary") return null;
  for (let p = MIN_PROSPERITY; p <= MAX_PROSPERITY; p++) if (rank(SHOP_TABLE[p]!.highest) >= rank(rarity)) return p;
  return null;
}

/** Extra cost for an item rarer than the shop normally sells: 10 g per Prosperity step (p. 269). */
export function rarityMarkup(rarity: string, prosperity: number): number {
  const need = minProsperity(rarity);
  return need === null ? 0 : Math.max(0, need - clampProsperity(prosperity)) * 10;
}

/** Suggested level gate (p. 93): Rare from Level 4, Masterwork from Level 7, never Legendary. */
export function levelAllows(rarity: string, level: number): boolean {
  if (rarity === "legendary") return false;
  if (rarity === "masterwork") return level >= 7;
  if (rarity === "rare") return level >= 4;
  return true;
}

export function canBuyAtShops(rarity: string): boolean {
  return rarity !== "legendary";
}

export interface PriceInput {
  /** Base gold cost of one item (may be a fraction, e.g. 1/5 g for a torch). */
  cost: number;
  rarity: string;
  prosperity: number;
  quantity?: number;
  /** The shop's own price change in percent (e.g. +20 for a remote outpost, -10 for a big market). */
  markup?: number;
  /** Discounts in percent (company benefits...), added together, at most 100. */
  discount?: number;
}

/** Whole-gold price of a purchase (rounded up; at least 1 g for anything that costs something). */
export function buyPrice(p: PriceInput): number {
  const qty = Math.max(1, Math.floor(p.quantity ?? 1));
  const factor = Math.max(0, 1 + (p.markup ?? 0) / 100) * Math.max(0, 1 - Math.min(100, p.discount ?? 0) / 100);
  const base = p.cost * qty * factor + rarityMarkup(p.rarity, p.prosperity) * qty;
  if (base <= 0) return 0;
  return Math.max(1, Math.ceil(base - 1e-9));
}

/** Gold received when selling: half the gold cost, rounded down. */
export function sellPrice(cost: number, quantity = 1): number {
  return Math.floor((cost * Math.max(1, Math.floor(quantity))) / 2 + 1e-9);
}

/** How many items a shop displays by default when its stock is rolled. */
export function defaultDisplayCount(prosperity: number, rng: () => number = Math.random): number {
  const row = SHOP_TABLE[clampProsperity(prosperity)]!;
  if (!row.display) return 12;
  const [min, max] = row.display;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick `count` distinct items a shop of this Prosperity normally sells. */
export function rollStock<T extends { name: string; rarity: string }>(
  catalog: readonly T[], prosperity: number, count: number, rng: () => number = Math.random,
): T[] {
  const top = rank(highestRarity(prosperity));
  const pool = catalog.filter((i) => canBuyAtShops(i.rarity) && rank(i.rarity) <= top);
  const seen = new Set<string>();
  const unique = pool.filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true)));
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j]!, unique[i]!];
  }
  return unique.slice(0, Math.max(0, count));
}

// ---------------------------------------------------------------------------
// Mission rewards

export const MISSION_GOLD = { min: 10, max: 20 } as const;
export const REQUEST_GOLD = { min: 5, max: 10 } as const;
export const TREASURE_MAX = 5;

export interface RewardLine { label: string; perMercenary: number }

/** Gold each mercenary receives from the reward lines. */
export function goldPerMercenary(lines: readonly RewardLine[]): number {
  return lines.reduce((sum, l) => sum + Math.max(0, Math.floor(l.perMercenary || 0)), 0);
}
