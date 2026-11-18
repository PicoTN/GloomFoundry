/**
 * Faction reputation (Core Rulebook ch. 7, p. 233-235).
 * Each mercenary has a tier 0-5 per faction: 0 Hostile, 1 Neutral, 2 Positive,
 * 3 Novice, 4 Junior, 5 Senior Member. Members climb by succeeding at Faction Requests and
 * fall by failing them; both tallies run in parallel and reset whenever the tier changes.
 */
export const MAX_TIER = 5;
export const STARTING_TIER = 2;
export const TIER_KEYS = ["hostile", "neutral", "positive", "novice", "junior", "senior"] as const;

export interface FactionStanding {
  tier: number;
  member: boolean;
  successes: number;
  failures: number;
}

const clampTier = (tier: number) => Math.min(MAX_TIER, Math.max(0, Math.floor(tier) || 0));

/** Successes needed to rise from the current tier (= the tier, at least 1); null if impossible. */
export function successesToAdvance(s: Pick<FactionStanding, "tier" | "member">): number | null {
  if (!s.member || s.tier <= 0 || s.tier >= MAX_TIER) return null;
  return Math.max(1, s.tier);
}

/**
 * Failures that drop the tier (= the tier below, so T2 needs 1, T5 needs 4); a member at T1
 * becomes Hostile after 3. Non-members' failures never count. Null if they can't drop.
 */
export function failuresToDrop(s: Pick<FactionStanding, "tier" | "member">): number | null {
  if (!s.member || s.tier <= 0) return null;
  return s.tier === 1 ? 3 : s.tier - 1;
}

/** Record a Faction Request outcome; returns the new standing (tallies reset on a tier change). */
export function recordRequest(s: FactionStanding, success: boolean): FactionStanding {
  const tier = clampTier(s.tier);
  if (success) {
    const need = successesToAdvance({ tier, member: s.member });
    if (need === null) return { ...s, tier };
    const successes = s.successes + 1;
    return successes >= need ? { ...s, tier: tier + 1, successes: 0, failures: 0 } : { ...s, tier, successes };
  }
  const limit = failuresToDrop({ tier, member: s.member });
  if (limit === null) return { ...s, tier };
  const failures = s.failures + 1;
  return failures >= limit ? { ...s, tier: tier - 1, successes: 0, failures: 0 } : { ...s, tier, failures };
}

/** Starting tier with the chosen faction when starting above level 1 (p. 121). */
export function startingTierForLevel(level: number): number {
  if (level >= 8) return 5;
  if (level >= 5) return 4;
  if (level >= 3) return 3;
  return STARTING_TIER;
}

/** Boons apply only at a positive reputation (T2+), and only the current tier's (p. 233). */
export const hasBoons = (tier: number) => tier >= 2;
