/**
 * GM-controlled characters: enemy stat blocks, categories, Threat and campaign level.
 * Core Rulebook ch. 8 (p. 266-267) and ch. 9 "Enemy Design" (p. 271-273), "Nemesis Design" (p. 293).
 */
import type { AttributeKey } from "../config.ts";

export const MAX_CL = 7;
export type NpcCategory = "normal" | "elite" | "adversary" | "nemesis";

/** One row of a stat table (one per campaign level 0-7). */
export interface StatRow {
  hp: number;
  move: number;
  attack: number;
  /** Value of the third Attribute column (the Attributes not tied to move/attack). */
  other: number;
  /** Defensive / offensive marker shown in the row (variant placeholder), "" if none. */
  defense: string;
  offense: string;
}

/** Which Attribute pair shares each column of the table, e.g. IN/GR with move. */
export interface AttributeColumns {
  move: AttributeKey[];
  attack: AttributeKey[];
  other: AttributeKey[];
}

export interface NpcStatInput {
  category: NpcCategory;
  level: number;
  normal: StatRow[];
  elite: StatRow[];
  columns: AttributeColumns;
  threat: { normal: number; elite: number };
  /** Adversary: which of move/attack gets the +25% (p. 272). */
  adversaryBoost: "move" | "attack";
  /** Number of mercenaries present (M), for nemeses. */
  mercenaries: number;
  /** Nemesis-only actions: the first is included, each further one adds 1×M Threat (p. 293). */
  nemesisActions: number;
}

export interface NpcStats {
  hpMax: number;
  move: number;
  attack: number;
  attributes: Record<AttributeKey, number>;
  threat: number;
  defense: string;
  offense: string;
}

export function clampCl(level: number): number {
  return Math.min(MAX_CL, Math.max(0, Math.floor(level) || 0));
}

const EMPTY_ROW: StatRow = { hp: 1, move: 0, attack: 0, other: 0, defense: "", offense: "" };

function rowAt(rows: StatRow[], level: number): StatRow {
  return rows[clampCl(level)] ?? rows[rows.length - 1] ?? EMPTY_ROW;
}

function attributesFrom(row: StatRow, columns: AttributeColumns): Record<AttributeKey, number> {
  const attrs = { cunning: 0, finesse: 0, grit: 0, intuition: 0, logic: 0, understanding: 0 };
  for (const key of columns.move) attrs[key] = row.move;
  for (const key of columns.attack) attrs[key] = row.attack;
  for (const key of columns.other) attrs[key] = row.other;
  return attrs;
}

/** Current stats of an enemy from its stat block, category and level. */
export function computeNpcStats(input: NpcStatInput): NpcStats {
  const m = Math.max(1, input.mercenaries);
  const base = rowAt(input.category === "normal" ? input.normal : input.elite.length ? input.elite : input.normal, input.level);
  // Attributes always come from the table row (nemeses use the elite template's scores).
  const attributes = attributesFrom(base, input.columns);
  switch (input.category) {
    case "normal":
    case "elite":
      return {
        hpMax: base.hp, move: base.move, attack: base.attack, attributes,
        threat: input.category === "elite" ? input.threat.elite : input.threat.normal,
        defense: base.defense, offense: base.offense,
      };
    case "adversary": {
      // Built on the normal template: +half HP, +a quarter of move or attack, Threat +2 (rounded up).
      const normal = rowAt(input.normal, input.level);
      const boost = (v: number) => v + Math.ceil(v / 4);
      return {
        hpMax: normal.hp + Math.ceil(normal.hp / 2),
        move: input.adversaryBoost === "move" ? boost(normal.move) : normal.move,
        attack: input.adversaryBoost === "attack" ? boost(normal.attack) : normal.attack,
        attributes: attributesFrom(normal, input.columns),
        threat: input.threat.normal + 2,
        defense: normal.defense, offense: normal.offense,
      };
    }
    case "nemesis":
      // Elite template: HP ×M, move +1, attack +1, Threat (elite + 2) ×M, +1×M per extra unique action.
      return {
        hpMax: base.hp * m,
        move: base.move + 1,
        attack: base.attack + 1,
        attributes,
        threat: (input.threat.elite + 2) * m + Math.max(0, input.nemesisActions - 1) * m,
        defense: base.defense, offense: base.offense,
      };
  }
}

/** Campaign level: half the average mercenary level, rounded up (p. 266). */
export function campaignLevel(mercenaryLevels: number[]): number {
  if (!mercenaryLevels.length) return 0;
  const average = mercenaryLevels.reduce((a, b) => a + b, 0) / mercenaryLevels.length;
  return clampCl(Math.ceil(average / 2));
}

export const DIFFICULTIES = ["easy", "normal", "hard", "deadly"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
const THREAT_PER_MERCENARY: Record<Difficulty, number> = { easy: 6, normal: 8, hard: 10, deadly: 12 };

/** Threat maximum for an encounter (p. 266). */
export function threatMaximum(difficulty: Difficulty, mercenaries: number): number {
  return THREAT_PER_MERCENARY[difficulty] * Math.max(0, mercenaries);
}

/** The hardest difficulty whose maximum the total Threat still fits under (or "beyond"). */
export function threatDifficulty(total: number, mercenaries: number): Difficulty | "beyond" {
  for (const d of DIFFICULTIES) if (total <= threatMaximum(d, mercenaries)) return d;
  return "beyond";
}

/** Combat Challenge table: enemy level, trap and hazardous terrain damage by CL (p. 267). */
export const COMBAT_CHALLENGE: readonly { enemyLevel: number; trap: number; hazard: number }[] = [
  { enemyLevel: 0, trap: 2, hazard: 1 },
  { enemyLevel: 1, trap: 3, hazard: 2 },
  { enemyLevel: 2, trap: 4, hazard: 2 },
  { enemyLevel: 3, trap: 5, hazard: 2 },
  { enemyLevel: 4, trap: 6, hazard: 3 },
  { enemyLevel: 5, trap: 7, hazard: 3 },
  { enemyLevel: 6, trap: 8, hazard: 3 },
  { enemyLevel: 7, trap: 9, hazard: 4 },
];
