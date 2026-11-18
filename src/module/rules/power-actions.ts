/**
 * Structured power actions. Transcribed content stores them (items' `system.actions`, keyed by
 * the text field they come from: primary, secondary, effect, description); the text parser below
 * is only a fallback for hand-written powers and a first draft for transcription.
 * Pure: no Foundry imports.
 *
 * Rules: areas may be rotated and mirrored (p. 79); clusters and lines are adjacent to you or at
 * range; arcs start adjacent to you; "All, range X" targets every applicable character within X.
 * Using an active element (strong or waning) does not consume it; each element once per turn (p. 82).
 */
export type AreaShape = "cluster" | "line" | "arc" | "cone" | "circle" | "all";
export interface Area {
  shape: AreaShape;
  /** Number of spaces (for "all": the radius). */
  size: number;
  /** "adjacent": the area must start next to you; "range": anywhere with one space in range. */
  anchor?: "adjacent" | "range";
  /** Arcs: 60, 120, 180... */
  degrees?: number;
}

/** "If Fire is active, add +1 attack and Wound" — optional extras unlocked by an element or a condition. */
export interface Bonus {
  /** Elements that unlock it; several = all of them are needed unless `anyOf`. */
  elements?: string[];
  anyOf?: boolean;
  /** Any active element (e.g. "if any element is active"). */
  anyElement?: boolean;
  /** Using the element consumes it (sets it to inert); most effects don't (p. 82). */
  consume?: boolean;
  /** Other trigger, as text ("if Berserk", "if the target is adjacent"). */
  when?: string;
  attack?: number; range?: number; targets?: number; pierce?: number; push?: number; pull?: number;
  heal?: number; move?: number; shield?: number; retaliate?: number;
  conditions?: string[];
  area?: Area;
  /** Anything else the bonus does. */
  text?: string;
}

interface Common {
  /** Extras unlocked by elements or other triggers. */
  bonuses?: Bonus[];
  /** Short free text shown with the action (e.g. "target all enemies adjacent to the ally"). */
  note?: string;
}

export type PowerAction =
  | (Common & { kind: "attack"; value: number; relative: boolean; range: number | null; targets: number; pierce: number;
      push?: number; pull?: number; area: Area | null; conditions: string[] })
  | (Common & { kind: "move"; value: number; relative?: boolean; jump?: boolean; flying?: boolean })
  | (Common & { kind: "heal"; value: number; self: boolean; range: number | null; targets?: number; conditions: string[] })
  | (Common & { kind: "shield"; value: number; self: boolean; range?: number | null; duration?: "round" | "persistent" | "scene" })
  | (Common & { kind: "retaliate"; value: number; range?: number | null; self?: boolean; duration?: "round" | "persistent" | "scene" })
  | (Common & { kind: "condition"; id: string; self: boolean; range?: number | null })
  | (Common & { kind: "infuse"; elements: string[]; either: boolean; any?: boolean })
  | (Common & { kind: "area"; area: Area })
  | (Common & { kind: "trap"; count: number; damage: number; effects: string[]; range?: number | null })
  | (Common & { kind: "obstacle"; count: number; range?: number | null })
  | (Common & { kind: "summon"; name?: string })
  | (Common & { kind: "choice"; pick: number; options: PowerAction[][] })
  | (Common & { kind: "text"; text: string });

/** Actions stored on an item, by text field. */
export type StoredActions = Partial<Record<"primary" | "secondary" | "effect" | "description" | "passive", PowerAction[]>>;

export const CONDITION_WORDS = ["Bless", "Curse", "Immobilize", "Invisible", "Muddle", "Pacify", "Poison", "Regenerate",
  "Safeguard", "Strengthen", "Stun", "Ward", "Wound"];
const ELEMENT = "(?:Air|Dark|Earth|Fire|Ice|Light)";
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const num = (s: string | undefined): number => (s === undefined ? NaN : NUMBER_WORDS[s.toLowerCase()] ?? Number(s));
const conditionsIn = (clause: string) => CONDITION_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(clause));
const elementsIn = (s: string) => [...s.matchAll(new RegExp(ELEMENT, "g"))].map((e) => e[0].toLowerCase());

function areaIn(clause: string): Area | null {
  const all = /\b(?:target )?all (?:enemies|allies|characters)?[^.;]*?within range (\d+)/i.exec(clause) ?? /\bAll, range (\d+)/i.exec(clause);
  if (all) return { shape: "all", size: Number(all[1]) };
  const m = /(\d+)-space (cluster|line|circle|cone|(\d+)-degree arc|120)/i.exec(clause);
  if (m) {
    const word = m[2]!.toLowerCase();
    const isArc = word.includes("arc") || word === "120";
    const area: Area = { shape: isArc ? "arc" : (word as AreaShape), size: Number(m[1]) };
    if (isArc) area.degrees = Number(m[3] ?? 120);
    if (/away from you|adjacent to you/i.test(clause) || isArc) area.anchor = "adjacent";
    else if (/\brange \d+/i.test(clause)) area.anchor = "range";
    return area;
  }
  const adj = /(\d+)-space adjacent/i.exec(clause);
  if (adj) return { shape: "arc", size: Number(adj[1]), anchor: "adjacent", degrees: Number(adj[1]) * 60 };
  if (/\bcone\b/i.test(clause)) return { shape: "cone", size: 3, anchor: "adjacent" };
  return null;
}

/** "if Fire is active, add Wound" / "if Earth is active, add +1 attack" -> bonus. */
function bonusesIn(clause: string): Bonus[] {
  const out: Bonus[] = [];
  const re = new RegExp(`if ((?:any element|${ELEMENT}(?:\\s*(?:,|and|or|/)\\s*${ELEMENT})*)) (?:is|are) active,?\\s*([^;.]*)`, "gi");
  for (const m of clause.matchAll(re)) {
    const what = m[2]!;
    const b: Bonus = /any element/i.test(m[1]!) ? { anyElement: true } : { elements: elementsIn(m[1]!) };
    if (/\bor\b|\//.test(m[1]!)) b.anyOf = true;
    if (/\bconsume\b/i.test(what)) b.consume = true;
    const n = (re2: RegExp) => { const x = re2.exec(what); return x ? Number(x[1]) : undefined; };
    const attack = n(/\+(\d+) attack/i); if (attack) b.attack = attack;
    const range = n(/\+(\d+) range/i); if (range) b.range = range;
    const targets = n(/\+(\d+) target/i); if (targets) b.targets = targets;
    const heal = n(/\+(\d+) heal/i); if (heal) b.heal = heal;
    const pierce = n(/Pierce (\d+)/); if (pierce) b.pierce = pierce;
    const push = n(/Push (\d+)/); if (push) b.push = push;
    const pull = n(/Pull (\d+)/); if (pull) b.pull = pull;
    const conds = conditionsIn(what); if (conds.length) b.conditions = conds;
    if (!Object.keys(b).some((k) => !["elements", "anyOf", "anyElement"].includes(k))) b.text = what.trim();
    out.push(b);
  }
  return out;
}

/** Split into clauses at sentence ends (semicolons stay inside: they carry bonuses). */
function sentences(text: string): string[] {
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").split(/(?<=\.)\s+/).map((c) => c.trim()).filter(Boolean);
}

export function parsePowerActions(text: string): PowerAction[] {
  const out: PowerAction[] = [];
  const used = new Set<string>();
  for (const sentence of sentences(text)) {
    const head = sentence.split(";")[0]!;
    const bonuses = bonusesIn(sentence);
    const withBonuses = <T extends PowerAction>(a: T): T => (bonuses.length ? { ...a, bonuses } : a);
    const moves = /\b(Move|Jump) ([+-]?\d+)/.exec(head);
    if (moves && !/\bAttack [+-]?\d/.test(head.slice(0, moves.index))) {
      out.push({ kind: "move", value: Number(moves[2]), ...(/^[+-]/.test(moves[2]!) ? { relative: true } : {}),
        ...(moves[1] === "Jump" ? { jump: true } : {}) });
    }
    const attack = /\bAttack ([+-]?\d+)/.exec(head);
    if (attack) {
      const range = /\brange (\d+)/i.exec(head);
      const push = /\bPush (\d+)/.exec(head);
      const pull = /\bPull (\d+)/.exec(head);
      out.push(withBonuses({
        kind: "attack", value: Number(attack[1]), relative: /^[+-]/.test(attack[1]!),
        range: range ? Number(range[1]) : null,
        targets: num(/\btarget (\d+|two|three|four)\b/i.exec(head)?.[1]) || 1,
        pierce: Number(/\bPierce (\d+)/.exec(head)?.[1] ?? 0),
        ...(push ? { push: Number(push[1]) } : {}), ...(pull ? { pull: Number(pull[1]) } : {}),
        area: areaIn(head),
        conditions: conditionsIn(head),
      }));
      conditionsIn(head).forEach((c) => used.add(c));
      continue;
    }
    const heal = /\bHeal (\d+)/.exec(head);
    if (heal) {
      const range = /\brange (\d+)/i.exec(head);
      out.push(withBonuses({
        kind: "heal", value: Number(heal[1]), self: /\byourself\b/i.test(head) || !range,
        range: range ? Number(range[1]) : null, conditions: conditionsIn(head),
        ...(num(/\btarget (\d+|two|three)\b/i.exec(head)?.[1]) > 1 ? { targets: num(/\btarget (\d+|two|three)\b/i.exec(head)?.[1]) } : {}),
      }));
      conditionsIn(head).forEach((c) => used.add(c));
      continue;
    }
    const shield = /\bShield (\d+)/.exec(head);
    if (shield) out.push(withBonuses({ kind: "shield", value: Number(shield[1]), self: !/\bally\b/i.test(head) }));
    const retaliate = /\bRetaliate (\d+)/.exec(head);
    if (retaliate) {
      const range = /Retaliate \d+[^.;]*?\brange (\d+)/i.exec(head);
      out.push(withBonuses({ kind: "retaliate", value: Number(retaliate[1]), ...(range ? { range: Number(range[1]) } : {}) }));
    }
    const trap = /\bCreate (a|an|one|two|three|\d+) damage (\d+)((?:,\s*[A-Z][a-z]+)*) traps?/.exec(sentence);
    if (trap) {
      out.push({ kind: "trap", count: num(trap[1]) || 1, damage: Number(trap[2]), effects: trap[3]!.split(",").map((e) => e.trim()).filter(Boolean) });
      continue;
    }
    const obstacle = /\bCreate (a|an|one|two|three|\d+) 1-space obstacles?/i.exec(sentence);
    if (obstacle) { out.push({ kind: "obstacle", count: num(obstacle[1]) || 1 }); continue; }
    if (/\bSummon\b/.test(sentence)) out.push({ kind: "summon" });
    const area = areaIn(head);
    if (area && !attack) out.push({ kind: "area", area });
  }
  for (const m of text.matchAll(new RegExp(`Infuse (any element|${ELEMENT}(?:\\s*(?:/|or|and)\\s*${ELEMENT})*)`, "g"))) {
    if (/any element/i.test(m[1]!)) out.push({ kind: "infuse", elements: [], either: true, any: true });
    else out.push({ kind: "infuse", elements: elementsIn(m[1]!), either: !/\band\b/.test(m[1]!) });
  }
  // Conditions not tied to an attack or heal: "Grant ... Strengthen", "Ward, yourself".
  for (const sentence of sentences(text)) {
    const head = sentence.split(";")[0]!;
    if (/\bAttack [+-]?\d|\bHeal \d|\btraps?\b|\bInfuse\b/.test(head)) continue;
    for (const c of conditionsIn(head)) {
      if (used.has(c)) continue;
      used.add(c);
      out.push({ kind: "condition", id: c.toLowerCase(), self: /\byourself\b|\byou gain\b|^gain\b/i.test(head) });
    }
  }
  return out;
}
