/**
 * GM relay for operations a player is not allowed to perform directly,
 * e.g. cursing an enemy (GM deck) or blessing an ally (deck they don't own).
 */
import { SOCKET_NAME } from "./config.ts";
import type { TemporaryKind } from "./deck/modifier-deck.ts";
import { ensureActorDecks, isActiveGM, resolveDeck } from "./deck/registry.ts";
import type { ElementId, ElementState } from "./rules/combat.ts";
import { sufferDamage, type DamageOptions } from "./combat/damage.ts";
import { handleElementRequest } from "./combat/elements.ts";
import { createRegion, spawnSummon } from "./combat/power-actions.ts";
import { heal } from "./powers.ts";

export type SocketRequest =
  | { action: "addTemporary"; deck: string; kind: TemporaryKind; count: number }
  | { action: "ensureDecks"; actor: string }
  | { action: "element"; element: ElementId; change: "infuse" | ElementState }
  | { action: "applyDamage"; actor: string; amount: number; options: DamageOptions }
  | { action: "condition"; actor: string; id: string }
  | { action: "heal"; actor: string; amount: number; source: string }
  | { action: "createRegion"; scene: string; name: string; color: string; polygons: number[][]; flags: Record<string, unknown> }
  | { action: "spawnSummon"; scene: string; actor: string; x: number; y: number; controller: string; disposition: number };

async function handle(req: SocketRequest): Promise<void> {
  switch (req.action) {
    case "addTemporary": {
      const deck = await resolveDeck(req.deck);
      await deck?.addTemporary(req.kind, req.count);
      return;
    }
    case "ensureDecks": {
      const actor = (await fromUuid(req.actor)) as Actor.Implementation | null;
      if (actor) await ensureActorDecks(actor);
      return;
    }
    case "element": {
      await handleElementRequest(req.element, req.change);
      return;
    }
    case "condition": {
      const actor = (await fromUuid(req.actor)) as Actor.Implementation | null;
      await actor?.toggleStatusEffect(req.id, { active: true });
      return;
    }
    case "heal": {
      const actor = (await fromUuid(req.actor)) as Actor.Implementation | null;
      if (actor) await heal(actor, req.amount, req.source);
      return;
    }
    case "createRegion":
      return createRegion(req.scene, req.name, req.color, req.polygons, req.flags);
    case "spawnSummon":
      return spawnSummon(req.scene, req.actor, req.x, req.y, req.controller, req.disposition);
    case "applyDamage": {
      const actor = (await fromUuid(req.actor)) as Actor.Implementation | null;
      if (actor) await sufferDamage(actor, req.amount, req.options);
      return;
    }
  }
}

export function registerSocket(): void {
  game.socket!.on(SOCKET_NAME, (req: SocketRequest) => {
    if (isActiveGM()) void handle(req);
  });
}

/** Run a request locally if we are a GM, otherwise ask the active GM to do it. */
export async function runAsGM(req: SocketRequest): Promise<boolean> {
  if (game.user?.isGM) {
    await handle(req);
    return true;
  }
  if (!game.users?.activeGM) {
    ui.notifications?.warn("GLOOM.Notify.noGM", { localize: true });
    return false;
  }
  game.socket!.emit(SOCKET_NAME, req);
  return true;
}
