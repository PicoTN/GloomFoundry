/**
 * Lasting effects (p. 78): round effects end at the end of the round; persistent effects end after
 * a number of uses or of rounds (not counting the current one), or when removed. While one is in
 * play its Skill stays "active"; when it ends the Skill is expended (or lost). Pure module.
 */

export interface LastingSpec {
  kind: "round" | "persistent";
  /** Uses left ("the next 2 times you attack"), null = not counted. */
  uses: number | null;
  /** Rounds after the current one, null = not counted. */
  rounds: number | null;
  /** The Skill is lost (not expended) when the effect ends. */
  lose: boolean;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1 };
const num = (s: string | undefined): number => (s ? WORDS[s.toLowerCase()] ?? Number(s) : 0) || 0;
const N = "(\\d+|one|two|three|four|five|six)";

/** Guess a lasting effect from an action's text (null if it doesn't look like one). */
export function parseLasting(text: string): LastingSpec | null {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const lose = /\blose this (skill|item|card)\b/i.test(plain);
  const uses = new RegExp(`\\bnext ${N} (times|attacks|heals|moves|sources|targets|instances)\\b`, "i").exec(plain)
    ?? new RegExp(`\\b${N} (charges|uses)\\b`, "i").exec(plain);
  const nextTime = /\bthe next time\b/i.test(plain);
  const rounds = new RegExp(`\\b(?:for the next|for|next) ${N} rounds?\\b`, "i").exec(plain);
  const nextRound = /\buntil the end of (the|your) next (round|turn)\b|\bnext round\b/i.test(plain);
  const persistent = /\bpersistent\b/i.test(plain);
  const round = /\bthis round\b|\buntil the end of the round\b|\bround effect\b/i.test(plain);
  if (uses || nextTime || rounds || nextRound || persistent) {
    return {
      kind: "persistent",
      uses: uses ? num(uses[1]) : nextTime ? 1 : null,
      rounds: rounds ? num(rounds[1]) : nextRound ? 1 : null,
      lose,
    };
  }
  if (round) return { kind: "round", uses: null, rounds: null, lose };
  return null;
}

/** Does a lasting effect end at the end of `round` (the round just finished)? */
export function endsAtRoundEnd(spec: Pick<LastingSpec, "kind" | "rounds">, startRound: number, round: number): boolean {
  if (spec.kind === "round") return true;
  if (spec.rounds === null || spec.rounds === undefined) return false;
  return round >= startRound + spec.rounds;
}
