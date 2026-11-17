/** Base deck + ticked perks for a given actor (no Foundry writes). */
import { composeDeck, type ComposedDeck, type PerkInput } from "../rules/perks.ts";

type PerkSystem = { toRules(name: string): PerkInput };

export function perkItems(actor: Actor.Implementation): Item.Implementation[] {
  return actor.items.filter((i) => i.type === "perk").sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

export function composeActorDeck(actor: Actor.Implementation): ComposedDeck {
  const perks = perkItems(actor).map((i) => (i.system as unknown as PerkSystem).toRules(i.name ?? ""));
  return composeDeck(perks);
}
