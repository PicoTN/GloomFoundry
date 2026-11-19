/**
 * Movement enforcement in combat (rules/movement.ts). Move buttons (powers, NPC actions, the basic
 * Move 4 / Move 3) grant movement for the turn; Foundry's preMoveToken hook refuses moves that go
 * beyond it, out of turn, during planning, or while Immobilized/Stunned. Outside combat and for
 * the GM, movement is free. Used movement is the token's Foundry movement history, which Foundry
 * clears at the start of each turn and shrinks when a move is undone (Ctrl+Z), so undoing a
 * mistaken move gives the movement back. Difficult terrain is included in the measured cost.
 */
import { SYSTEM_ID } from "../config.ts";
import { checkMove, granted, type MoveGrant } from "../rules/movement.ts";
import { getPhase } from "./combat.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

const GRANTS = "moves";

export const enforceMovement = (): boolean => !!game.settings?.get(SYSTEM_ID, "enforceMovement");

export function grantsOf(combatant: Combatant.Implementation): MoveGrant[] {
  return (combatant.getFlag(SYSTEM_ID as never, GRANTS as never) as MoveGrant[] | undefined) ?? [];
}

/** Movement used this turn: the cost of the token's movement history (cleared each turn start). */
export function usedOf(combatant: Combatant.Implementation): number {
  const token = combatant.token as (TokenDocument.Implementation & {
    movementHistory?: unknown[]; measureMovementPath?(w: unknown[]): { cost: number };
  }) | null;
  const history = token?.movementHistory ?? [];
  if (!token || history.length < 2 || typeof token.measureMovementPath !== "function") return 0;
  return points(token, token.measureMovementPath(history).cost);
}

/** Movement left this turn (null when nothing was granted). */
export function movementLeft(combatant: Combatant.Implementation): { left: number; total: number } | null {
  const total = granted(grantsOf(combatant));
  return total > 0 ? { left: Math.max(0, total - usedOf(combatant)), total } : null;
}

/** The started combat a token fights in, and its combatant. */
function combatOf(token: TokenDocument.Implementation): { combat: Combat.Implementation; combatant: Combatant.Implementation } | null {
  for (const combat of (game.combats ?? []) as Iterable<Combat.Implementation>) {
    if (!combat.started) continue;
    const combatant = combat.combatants.find((c) => c.tokenId === token.id && c.sceneId === token.parent?.id);
    if (combatant) return { combat, combatant: combatant as Combatant.Implementation };
  }
  return null;
}

/** Movement points of a measured cost (Foundry measures in scene distance units). */
function points(token: TokenDocument.Implementation, cost: number): number {
  const distance = (token.parent as unknown as { grid?: { distance?: number } } | null)?.grid?.distance || 1;
  return cost / distance;
}

/** Reset at the start of a turn (called from combat.ts). */
export function turnStartMovementUpdate(): Record<string, unknown> {
  return { [`flags.${SYSTEM_ID}.${GRANTS}`]: [] };
}

/** A Move ability was performed: grant its movement (in combat) and set the token's movement type. */
export async function grantMove(actor: Actor.Implementation, grant: MoveGrant): Promise<void> {
  const token = actor.getActiveTokens()[0]?.document as (TokenDocument.Implementation & { movementAction?: string }) | undefined;
  const action = grant.fly ? "fly" : grant.jump ? "jump" : "walk";
  if (token?.isOwner && token.movementAction !== action) await token.update({ movementAction: action } as never);
  const found = token ? combatOf(token) : null;
  if (!found) return;
  const { combat, combatant } = found;
  if (getPhase(combat) !== "action" || combat.combatant?.id !== combatant.id) {
    return void ui.notifications?.warn("GLOOM.Move.notNow", { localize: true });
  }
  const grants = [...grantsOf(combatant), grant];
  await combatant.update({ [`flags.${SYSTEM_ID}.${GRANTS}`]: grants } as never);
  const left = granted(grants) - usedOf(combatant);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-move"><i class="fa-solid fa-shoe-prints"></i> ${f("GLOOM.Move.granted", {
      name: actor.name ?? "", label: grant.label ?? `${t("GLOOM.Act.move")} ${grant.amount}`, left: String(left),
    })}</p>`,
  } as never);
}

const REASONS: Record<string, string> = {
  planning: "GLOOM.Move.planning", notYourTurn: "GLOOM.Move.notYourTurn", immobilized: "GLOOM.Move.immobilized",
  stunned: "GLOOM.Move.stunned", noMove: "GLOOM.Move.noMove", tooFar: "GLOOM.Move.tooFar", noJump: "GLOOM.Move.noJump",
  noFly: "GLOOM.Move.noFly", teleport: "GLOOM.Move.teleport",
};

type Section = { cost?: number; waypoints?: { action?: string }[] };

export function registerMovementRules(): void {
  game.settings!.register(SYSTEM_ID, "enforceMovement", {
    name: "GLOOM.Move.setting", hint: "GLOOM.Move.settingHint",
    scope: "world", config: true, type: Boolean, default: true,
  } as never);

  // Refuse moves the rules don't allow (only runs for the user making the move).
  Hooks.on("preMoveToken", (doc, movement) => {
    if (game.user?.isGM || !enforceMovement()) return;
    const token = doc as TokenDocument.Implementation;
    const found = combatOf(token);
    if (!found) return;
    const m = movement as unknown as { passed?: Section; pending?: Section; history?: Section; method?: string };
    // Forced movement and teleports go through the GM; undoing a move is always allowed.
    if (m.method === "api" || m.method === "undo") return;
    const actor = token.actor as Actor.Implementation | null;
    const action = m.pending?.waypoints?.at(-1)?.action ?? m.passed?.waypoints?.at(-1)?.action
      ?? (token as unknown as { movementAction?: string }).movementAction ?? "walk";
    const verdict = checkMove({
      inCombat: true, phase: getPhase(found.combat), isCurrent: found.combat.combatant?.id === found.combatant.id,
      immobilized: !!actor?.statuses.has("immobilize"), stunned: !!actor?.statuses.has("stun"),
      action, cost: points(token, (m.passed?.cost ?? 0) + (m.pending?.cost ?? 0)),
      used: m.history?.cost !== undefined ? points(token, m.history.cost) : usedOf(found.combatant), grants: grantsOf(found.combatant),
    });
    if (verdict.ok) return;
    ui.notifications?.warn(f(REASONS[verdict.reason]!, { left: String(verdict.left ?? 0) }));
    return false;
  });

  // Keep the tracker's "movement left" up to date (moves and undos change the history).
  Hooks.on("moveToken", (doc) => {
    const found = combatOf(doc as TokenDocument.Implementation);
    if (found && found.combat.combatant?.id === found.combatant.id) void ui.combat?.render();
  });
}
