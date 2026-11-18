/**
 * Read a power's rules text into actions the sheet and chat can offer as buttons:
 * "Attack 2, 3-space cluster, range 3, Wound." -> attack (with an area), "Heal 3, yourself",
 * "Infuse Fire or Air", "Create one damage 3, Poison trap...", "Summon ...".
 * Pure: no Foundry imports. Unknown wording simply produces no button.
 */
export type AreaShape = "cluster" | "line" | "adjacent" | "circle" | "cone" | "arc";
export interface Area { shape: AreaShape; size: number }

export type PowerAction =
  | { kind: "attack"; value: number; relative: boolean; range: number | null; targets: number; pierce: number;
      area: Area | null; conditions: string[] }
  | { kind: "heal"; value: number; self: boolean; range: number | null; conditions: string[] }
  | { kind: "condition"; id: string; self: boolean }
  | { kind: "infuse"; elements: string[]; either: boolean }
  | { kind: "area"; area: Area }
  | { kind: "trap"; count: number; damage: number; effects: string[] }
  | { kind: "obstacle"; count: number }
  | { kind: "summon" };

export const CONDITION_WORDS = ["Bless", "Curse", "Immobilize", "Invisible", "Muddle", "Pacify", "Poison", "Regenerate",
  "Safeguard", "Strengthen", "Stun", "Ward", "Wound"];
const ELEMENT = "(?:Air|Dark|Earth|Fire|Ice|Light)";
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const num = (s: string | undefined): number => (s === undefined ? NaN : NUMBER_WORDS[s.toLowerCase()] ?? Number(s));
const conditionsIn = (clause: string) => CONDITION_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(clause));

function areaIn(clause: string): Area | null {
  const m = /(\d+)-space (cluster|line|adjacent|circle|cone|120)/i.exec(clause);
  if (m) {
    const shape = m[2]!.toLowerCase() === "120" ? "arc" : (m[2]!.toLowerCase() as AreaShape);
    return { shape, size: Number(m[1]) };
  }
  if (/\bcone\b/i.test(clause)) return { shape: "cone", size: 3 };
  return null;
}

/** Split into clauses at sentence ends and semicolons. */
function clauses(text: string): string[] {
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").split(/(?<=[.;])\s+|;\s*/).map((c) => c.trim()).filter(Boolean);
}

export function parsePowerActions(text: string): PowerAction[] {
  const out: PowerAction[] = [];
  const used = new Set<string>();
  for (const clause of clauses(text)) {
    const attack = /\bAttack ([+-]?\d+)/.exec(clause);
    if (attack) {
      const range = /\brange (\d+)/i.exec(clause);
      out.push({
        kind: "attack", value: Number(attack[1]), relative: /^[+-]/.test(attack[1]!),
        range: range ? Number(range[1]) : null,
        targets: num(/\btarget (\d+|two|three|four)\b/i.exec(clause)?.[1]) || 1,
        pierce: Number(/\bPierce (\d+)/.exec(clause)?.[1] ?? 0),
        area: areaIn(clause),
        conditions: conditionsIn(clause),
      });
      conditionsIn(clause).forEach((c) => used.add(c));
      continue;
    }
    const heal = /\bHeal (\d+)/.exec(clause);
    if (heal) {
      const range = /\brange (\d+)/i.exec(clause);
      out.push({
        kind: "heal", value: Number(heal[1]), self: /\byourself\b/i.test(clause) || !range,
        range: range ? Number(range[1]) : null, conditions: conditionsIn(clause),
      });
      conditionsIn(clause).forEach((c) => used.add(c));
      continue;
    }
    const trap = /\bCreate (a|an|one|two|three|\d+) damage (\d+)((?:,\s*[A-Z][a-z]+)*) traps?/.exec(clause);
    if (trap) {
      out.push({ kind: "trap", count: num(trap[1]) || 1, damage: Number(trap[2]), effects: trap[3]!.split(",").map((e) => e.trim()).filter(Boolean) });
      continue;
    }
    const obstacle = /\bCreate (a|an|one|two|three|\d+) 1-space obstacles?/i.exec(clause);
    if (obstacle) { out.push({ kind: "obstacle", count: num(obstacle[1]) || 1 }); continue; }
    if (/\bSummon\b/.test(clause)) out.push({ kind: "summon" });
    const area = areaIn(clause);
    if (area) out.push({ kind: "area", area });
  }
  // Infusions anywhere ("Infuse Fire", "Infuse Fire or Air", "Infuse Air/Dark").
  for (const m of text.matchAll(new RegExp(`Infuse (${ELEMENT}(?:\\s*(?:/|or|and)\\s*${ELEMENT})*)`, "g"))) {
    const elements = [...m[1]!.matchAll(new RegExp(ELEMENT, "g"))].map((e) => e[0].toLowerCase());
    out.push({ kind: "infuse", elements, either: !/\band\b/.test(m[1]!) });
  }
  // Conditions not tied to an attack or heal: "Grant ... Strengthen", "Ward, yourself".
  for (const clause of clauses(text)) {
    if (/\bAttack [+-]?\d|\bHeal \d|\btraps?\b|\bInfuse\b/.test(clause)) continue;
    for (const c of conditionsIn(clause)) {
      if (used.has(c)) continue;
      used.add(c);
      out.push({ kind: "condition", id: c.toLowerCase(), self: /\byourself\b|\byou gain\b/i.test(clause) });
    }
  }
  return out;
}
