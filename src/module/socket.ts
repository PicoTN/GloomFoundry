/**
 * GM relay for operations a player is not allowed to perform directly,
 * e.g. cursing an enemy (GM deck) or blessing an ally (deck they don't own).
 */
import { SOCKET_NAME } from "./config.ts";
import type { TemporaryKind } from "./deck/modifier-deck.ts";
import { ensureActorDecks, isActiveGM, resolveDeck } from "./deck/registry.ts";

export type SocketRequest =
  | { action: "addTemporary"; deck: string; kind: TemporaryKind; count: number }
  | { action: "ensureDecks"; actor: string };

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
