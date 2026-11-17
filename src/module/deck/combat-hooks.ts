/**
 * Combat-related deck upkeep (Core Rulebook p. 71-72):
 *  - start of combat: every deck is shuffled;
 *  - cleanup phase (end of each round): decks that drew Critical/Null are reshuffled;
 *  - end of combat: every deck is shuffled.
 * Runs on the active GM only.
 */
import { allDecks, getActorDeck, getGMDeck, isActiveGM } from "./registry.ts";
import type { ModifierDeck } from "./modifier-deck.ts";

function combatDecks(combat: Combat.Implementation): ModifierDeck[] {
  const decks: ModifierDeck[] = [];
  for (const combatant of combat.combatants) {
    const deck = getActorDeck(combatant.actor as Actor.Implementation | null);
    if (deck && !decks.some((d) => d.drawPile.id === deck.drawPile.id)) decks.push(deck);
  }
  const gm = getGMDeck();
  if (gm) decks.push(gm);
  return decks;
}

/** Whether draws from this actor's deck should wait for the cleanup phase to reshuffle. */
export function isInCombat(actor: Actor.Implementation | null): boolean {
  for (const combat of game.combats ?? []) {
    if (!combat.started) continue;
    if (!actor) return true; // the GM deck is "in combat" whenever any combat runs
    if (combat.combatants.some((c) => c.actorId === actor.id)) return true;
  }
  return false;
}

export function registerCombatHooks(): void {
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!isActiveGM() || !("round" in (changes as object))) return;
    const c = combat as Combat.Implementation;
    const decks = combatDecks(c);
    if (c.round === 1 && (c.previous?.round ?? 0) === 0) {
      for (const deck of decks) await deck.reshuffle();
    } else {
      for (const deck of decks) await deck.reshuffleIfPending();
    }
  });

  Hooks.on("deleteCombat", async (combat) => {
    if (!isActiveGM()) return;
    for (const deck of combatDecks(combat as Combat.Implementation)) await deck.reshuffle();
  });
}

export { allDecks };
