import { clearConditions, hasCondition } from "./conditions.ts";
import { expireRoundAbilities } from "./abilities.ts";
import { addTemporary } from "./deck/actions.ts";
import { deckForActor, isActiveGM } from "./deck/registry.ts";

/** The deck that receives Bless/Curse for this actor: their own, or the GM deck for GM characters. */
const deckFor = deckForActor;

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

  // At 0 HP: mercenaries fall Unconscious (p. 68), GM-controlled characters are defeated.
  Hooks.on("updateActor", (actor, changes, _options, userId) => {
    if (userId !== game.user?.id) return;
    const a = actor as Actor.Implementation;
    const hpChanged = (changes as { system?: { hp?: { value?: number } } }).system?.hp?.value !== undefined;
    if (!hpChanged || (a.type !== "mercenary" && a.type !== "npc")) return;
    const status = a.type === "mercenary" ? "unconscious" : "dead";
    const down = (a.system as unknown as { hp: { value: number } }).hp.value <= 0;
    if (down !== hasCondition(a, status)) void a.toggleStatusEffect(status, { active: down, overlay: down });
  });

  // End of combat: conditions such as Poison or Wound are removed (p. 72).
  Hooks.on("deleteCombat", async (combat) => {
    if (!isActiveGM()) return;
    for (const combatant of (combat as Combat.Implementation).combatants) {
      const actor = combatant.actor as Actor.Implementation | null;
      if (actor) {
        await clearConditions(actor);
        await expireRoundAbilities(actor);
      }
    }
  });
}
