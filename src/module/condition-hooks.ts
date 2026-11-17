import { clearConditions, hasCondition } from "./conditions.ts";
import { addTemporary } from "./deck/actions.ts";
import { getActorDeck, getGMDeck, isActiveGM } from "./deck/registry.ts";

/** The deck that receives Bless/Curse for this actor: their own, or the GM deck for GM characters. */
function deckFor(actor: Actor.Implementation) {
  return getActorDeck(actor) ?? (actor.type === "mercenary" ? null : getGMDeck());
}

export function registerConditionHooks(): void {
  // Bless/Curse from the token HUD: shuffle a card into the deck instead of creating an effect.
  Hooks.on("preCreateActiveEffect", (effect) => {
    const e = effect as ActiveEffect.Implementation;
    const kind = e.statuses.has("bless") ? "bless" : e.statuses.has("curse") ? "curse" : null;
    if (!kind) return;
    const actor = e.parent as Actor.Implementation | null;
    if (actor?.documentName !== "Actor") return;
    const deck = deckFor(actor);
    if (deck) void addTemporary(deck, kind);
    else ui.notifications?.warn("GLOOM.Deck.notReady", { localize: true });
    return false;
  });

  // Unconscious follows HP (p. 68): set at 0, cleared when healed.
  Hooks.on("updateActor", (actor, changes, _options, userId) => {
    if (userId !== game.user?.id) return;
    const a = actor as Actor.Implementation;
    const hpChanged = (changes as { system?: { hp?: { value?: number } } }).system?.hp?.value !== undefined;
    if (a.type !== "mercenary" || !hpChanged) return;
    const down = (a.system as unknown as { hp: { value: number } }).hp.value <= 0;
    if (down !== hasCondition(a, "unconscious")) {
      void a.toggleStatusEffect("unconscious", { active: down, overlay: down });
    }
  });

  // End of combat: conditions such as Poison or Wound are removed (p. 72).
  Hooks.on("deleteCombat", async (combat) => {
    if (!isActiveGM()) return;
    for (const combatant of (combat as Combat.Implementation).combatants) {
      const actor = combatant.actor as Actor.Implementation | null;
      if (actor) await clearConditions(actor);
    }
  });
}
