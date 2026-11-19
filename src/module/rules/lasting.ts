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

// ---------------------------------------------------------------------------
// Attack bonuses from lasting effects and marked spaces

export type BonusWho = "self" | "allies" | "selfAndAllies" | "enemies";

export interface LastingBonus {
  /** +X (or -X for enemies) attack. */
  attack: number;
  pierce: number;
  push?: number;
  pull?: number;
  advantage: boolean;
  /** Conditions added to the attacks (Poison, Wound...). */
  conditions: string[];
  who: BonusWho;
  /** Only while in or adjacent to the marked space. */
  near?: boolean;
}

const COND = "(Poison|Wound|Muddle|Immobilize|Stun|Curse|Bless|Strengthen|Pacify|Plague)";

/** Read an attack bonus from an effect's text (null if there is none). */
export function parseLastingBonus(text: string): LastingBonus | null {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // The sentence that changes attacks (who it is for is read from that sentence only).
  const sentence = plain.split(/(?<=\.)\s+/).find((x) =>
    /[+-]\d+ attack\b(?! \d)|\bPierce \d+ to\b|\badd (?:Push|Pull) \d+ to\b|\b(?:gain|and) advantage\b|\badd (?:[+-]\d+ attack and )?(?:Poison|Wound|Muddle|Immobilize|Stun|Curse|Plague)\b/i.test(x)
      && !/^\s*(?:Attack|Command: Attack) [+-]?\d/i.test(x));
  if (!sentence) return null;
  const attack = /\badds? ([+-]\d+) attack\b/i.exec(sentence) ?? /([+-]\d+) attack to (?:all |your |their |its )*(?:\w+ )?attacks?\b/i.exec(sentence);
  const pierce = /\b(?:add|and) Pierce (\d+)/i.exec(sentence);
  const push = /\badd Push (\d+) to\b/i.exec(sentence);
  const pull = /\badd Pull (\d+) to\b/i.exec(sentence);
  const advantage = /\bgain advantage\b|\band advantage\b/i.test(sentence);
  const conditions = new Set<string>();
  for (const m of sentence.matchAll(new RegExp(`\\b(?:add|and|attack and) ${COND}(?: and ${COND})?\\b`, "gi"))) {
    for (const c of [m[1], m[2]]) if (c) conditions.add(c.toLowerCase());
  }
  if (!attack && !pierce && !push && !pull && !advantage && !conditions.size) return null;
  const who: BonusWho = attack && Number(attack[1]) < 0 && /\b(?:each|all) enem(?:y|ies)\b/i.test(sentence) ? "enemies"
    : /\byou and all (?:adjacent )?allies\b/i.test(sentence) ? "selfAndAllies"
      : /\ball (?:adjacent )?allies\b|\ballies (?:add|gain)\b|\b(?:one of )?your allies\b|\ban? (?:adjacent )?ally\b[^.]*\battacks?\b/i.test(sentence) ? "allies"
        : "self";
  return {
    attack: attack ? Number(attack[1]) : 0, pierce: pierce ? Number(pierce[1]) : 0,
    ...(push ? { push: Number(push[1]) } : {}), ...(pull ? { pull: Number(pull[1]) } : {}),
    advantage, conditions: [...conditions], who,
    ...(/\bwhile (?:in or adjacent to|in|adjacent to) the space\b/i.test(plain) ? { near: true } : {}),
  };
}

/** Does a bonus apply, given how the attacker relates to the effect's owner? */
export function bonusApplies(who: BonusWho, relation: "self" | "ally" | "enemy"): boolean {
  switch (who) {
    case "self": return relation === "self";
    case "allies": return relation === "ally";
    case "selfAndAllies": return relation === "self" || relation === "ally";
    case "enemies": return relation === "enemy";
  }
}
