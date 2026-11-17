/**
 * Builds a mercenary's Modifier Deck from the base deck and their ticked perks,
 * and keeps the deck in sync when perks change.
 */
import { composeActorDeck } from "./compose-actor.ts";
import { getActorDeck } from "./registry.ts";

/** Rebuild the actor's deck from base + perks, keeping Bless/Curse cards. */
export async function rebuildActorDeck(actor: Actor.Implementation): Promise<void> {
  const deck = getActorDeck(actor);
  if (!deck?.canModify) return;
  await deck.rebuild(composeActorDeck(actor).cards);
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced rebuild, so editing several perk fields in a row only rebuilds once. */
function scheduleRebuild(actor: Actor.Implementation): void {
  const key = actor.uuid ?? "";
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    void rebuildActorDeck(actor);
  }, 300));
}

function onPerkChange(item: Item.Implementation, userId: string, changes?: object): void {
  if (item.type !== "perk" || userId !== game.user?.id) return;
  const actor = item.parent as Actor.Implementation | null;
  if (actor?.type !== "mercenary") return;
  if (changes) {
    // Renaming or editing the description does not affect the deck.
    const system = (changes as { system?: Record<string, unknown> }).system;
    if (!system || !("steps" in system || "taken" in system)) return;
  } else if ((item.system as unknown as { taken: number }).taken === 0) {
    return; // creating/deleting a perk with no ticked box changes nothing
  }
  scheduleRebuild(actor);
}

export function registerPerkHooks(): void {
  Hooks.on("createItem", (item, _options, userId) => onPerkChange(item as Item.Implementation, userId));
  Hooks.on("deleteItem", (item, _options, userId) => onPerkChange(item as Item.Implementation, userId));
  Hooks.on("updateItem", (item, changes, _options, userId) =>
    onPerkChange(item as Item.Implementation, userId, changes as object));
}
