/**
 * Pure resolution of Attribute tests and attacks against drawn modifier cards.
 * Source: Core Rulebook ch. 2, "Attribute Tests" (p. 69-70), "Attacks" (p. 77),
 * "Advantage and Disadvantage" (p. 64, 74).
 */
import { isCriticalLike, isNullLike, type ModifierCardData } from "./modifier.ts";

export type DrawMode = "normal" | "advantage" | "disadvantage";

/** Number of cards to draw for a given mode. */
export function cardsToDraw(mode: DrawMode): number {
  return mode === "normal" ? 1 : 2;
}

/**
 * Combine advantage and disadvantage sources. Like most d20-likes, the rulebook
 * gives no explicit stacking rule; we treat one of each as cancelling out.
 * (TODO: confirm against the rulebook / errata.)
 */
export function combineModes(advantage: boolean, disadvantage: boolean): DrawMode {
  if (advantage && !disadvantage) return "advantage";
  if (disadvantage && !advantage) return "disadvantage";
  return "normal";
}

interface Pick<T> {
  keptIndex: number;
  kept: T;
  /** Both candidates scored equally but are different cards: the GM decides (p. 64). */
  tie: boolean;
}

function pick<T>(items: readonly T[], score: (t: T) => number, mode: DrawMode, same: (a: T, b: T) => boolean): Pick<T> {
  if (items.length === 0) throw new Error("No card drawn");
  if (mode === "normal" || items.length === 1) return { keptIndex: 0, kept: items[0]!, tie: false };
  const [a, b] = [items[0]!, items[1]!];
  const [sa, sb] = [score(a), score(b)];
  const tie = sa === sb && !same(a, b);
  const takeB = mode === "advantage" ? sb > sa : sb < sa;
  return takeB ? { keptIndex: 1, kept: b, tie } : { keptIndex: 0, kept: a, tie };
}

/** Equal scores only need a GM ruling when the cards carry different extra effects. */
function sameEffect(a: ModifierCardData, b: ModifierCardData): boolean {
  return a.effect === b.effect;
}

// ---------------------------------------------------------------------------
// Attribute tests
// ---------------------------------------------------------------------------

export type TestOutcome = "criticalSuccess" | "success" | "failure" | "criticalFailure";

export interface TestInput {
  /** Base Attribute score (0-7). */
  score: number;
  /** Bonuses from Skills, Backgrounds, etc. Added before drawing (p. 70). */
  bonus: number;
  /** Target number; `null` if the GM has not revealed it. */
  tn: number | null;
  mode: DrawMode;
}

export interface TestResult {
  cards: ModifierCardData[];
  keptIndex: number;
  tie: boolean;
  /** score + bonus + attribute modifier; `null` on Critical/Null draws. */
  total: number | null;
  /** `null` when the TN is unknown and the card was not Critical/Null. */
  outcome: TestOutcome | null;
}

function testScore(card: ModifierCardData): number {
  if (isCriticalLike(card)) return Number.POSITIVE_INFINITY;
  if (isNullLike(card)) return Number.NEGATIVE_INFINITY;
  return card.attribute ?? 0;
}

export function resolveTest(input: TestInput, cards: ModifierCardData[]): TestResult {
  const { keptIndex, kept, tie } = pick(cards, testScore, input.mode, sameEffect);
  const base = { cards, keptIndex, tie };
  if (isCriticalLike(kept)) return { ...base, total: null, outcome: "criticalSuccess" };
  if (isNullLike(kept)) return { ...base, total: null, outcome: "criticalFailure" };
  const total = input.score + input.bonus + (kept.attribute ?? 0);
  const outcome = input.tn === null ? null : total >= input.tn ? "success" : "failure";
  return { ...base, total, outcome };
}

/** Contest: the active character succeeds if their result equals or exceeds the opponent's (p. 70). */
export function resolveContest(active: TestResult, opponent: TestResult): "success" | "failure" {
  const rank = (r: TestResult) =>
    r.outcome === "criticalSuccess" ? Number.POSITIVE_INFINITY
      : r.outcome === "criticalFailure" ? Number.NEGATIVE_INFINITY
        : (r.total ?? 0);
  return rank(active) >= rank(opponent) ? "success" : "failure";
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

export interface AttackInput {
  /** The "Attack X" value of the ability. */
  base: number;
  /** Sum of "+X attack" / "-X attack" effects (e.g. Poison on the target), applied first (p. 77). */
  bonus: number;
  /** Target's Shield, applied after the modifier card (p. 77). */
  shield: number;
  /** Target has Ward: halves the damage, applied last, after Shield (p. 77, 84). */
  ward?: boolean;
  mode: DrawMode;
}

export interface AttackResult {
  cards: ModifierCardData[];
  keptIndex: number;
  tie: boolean;
  /** Attack value after bonuses and the modifier card, before Shield. */
  attackValue: number;
  /** Damage after Shield, before Ward. */
  afterShield: number;
  /** Damage prevented by Ward (0 without Ward). */
  warded: number;
  /** Final damage suffered by the target. */
  damage: number;
  critical: boolean;
  null: boolean;
}

function attackValueWith(card: ModifierCardData, preCard: number): number {
  if (isNullLike(card)) return 0;
  // "you deal twice your base damage" (p. 63): we double the value after +X/-X effects.
  if (isCriticalLike(card)) return preCard * 2;
  return Math.max(0, preCard + card.attack.value);
}

export function resolveAttack(input: AttackInput, cards: ModifierCardData[]): AttackResult {
  const preCard = Math.max(0, input.base + input.bonus);
  // Null always ranks worst even when the pre-card value is 0.
  const score = (c: ModifierCardData) => (isNullLike(c) ? -1 : attackValueWith(c, preCard));
  const { keptIndex, kept, tie } = pick(cards, score, input.mode, sameEffect);
  const attackValue = attackValueWith(kept, preCard);
  const isNull = isNullLike(kept);
  const afterShield = isNull ? 0 : Math.max(0, attackValue - Math.max(0, input.shield));
  // "reduce that damage by half (rounded up)": the reduction is rounded up, so 5 damage becomes 2.
  const warded = input.ward ? Math.ceil(afterShield / 2) : 0;
  const damage = afterShield - warded;
  return {
    cards, keptIndex, tie, attackValue, afterShield, warded, damage, critical: isCriticalLike(kept), null: isNull,
  };
}
