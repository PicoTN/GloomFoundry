/**
 * Movement in combat (p. 72-76). Pure: no Foundry imports.
 * Outside combat, characters move freely. In combat, a character moves only on its own turn in
 * the action phase, by performing Move abilities: each "Move X" (or Jump/Flying) grants X spaces
 * of movement this turn. Difficult terrain costs 1 extra (the cost comes from Foundry's measure).
 * Immobilize and Stun prevent moving; forced movement and the GM are not limited.
 */

export interface MoveGrant { amount: number; jump?: boolean; fly?: boolean; label?: string }

export interface MoveCheck {
  inCombat: boolean;
  phase: "planning" | "action" | null;
  isCurrent: boolean;
  immobilized: boolean;
  stunned: boolean;
  /** Foundry movement action: walk, fly, jump, blink, displace... */
  action: string;
  /** Movement points this move costs. */
  cost: number;
  /** Movement points already used this turn. */
  used: number;
  grants: readonly MoveGrant[];
}

export type MoveVerdict =
  | { ok: true }
  | { ok: false; reason: "planning" | "notYourTurn" | "immobilized" | "stunned" | "noMove" | "tooFar" | "noJump" | "noFly" | "teleport"; left?: number };

export function granted(grants: readonly MoveGrant[]): number {
  return grants.reduce((n, g) => n + Math.max(0, g.amount), 0);
}

export function checkMove(c: MoveCheck): MoveVerdict {
  if (!c.inCombat || c.action === "displace") return { ok: true };
  if (c.phase !== "action") return { ok: false, reason: "planning" };
  if (!c.isCurrent) return { ok: false, reason: "notYourTurn" };
  if (c.stunned) return { ok: false, reason: "stunned" };
  if (c.immobilized) return { ok: false, reason: "immobilized" };
  if (c.action === "blink") return { ok: false, reason: "teleport" };
  const total = granted(c.grants);
  if (total <= 0) return { ok: false, reason: "noMove" };
  if (c.action === "jump" && !c.grants.some((g) => g.jump)) return { ok: false, reason: "noJump" };
  if (c.action === "fly" && !c.grants.some((g) => g.fly)) return { ok: false, reason: "noFly" };
  const left = total - c.used;
  if (c.cost > left + 1e-6) return { ok: false, reason: "tooFar", left: Math.max(0, left) };
  return { ok: true };
}
