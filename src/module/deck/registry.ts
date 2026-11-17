/**
 * Finding, creating and cleaning up the `Cards` documents behind Modifier Decks.
 * Creation is GM-only (players usually lack the CARDS_CREATE permission), so it
 * runs on the active GM's client in response to actor hooks or socket requests.
 */
import { SYSTEM_ID } from "../config.ts";
import { ModifierDeck } from "./modifier-deck.ts";

export const GM_DECK_REF = "gm";

export function isActiveGM(): boolean {
  return game.users?.activeGM?.isSelf ?? false;
}

function getCards(id: string | undefined): Cards.Stored | null {
  if (!id) return null;
  return (game.cards?.get(id) as Cards.Stored | undefined) ?? null;
}

type MercenaryActor = Actor.Stored & { system: { deck: { drawPile: string; discardPile: string } } };

function isMercenary(actor: Actor.Implementation | null | undefined): actor is MercenaryActor {
  return actor?.type === "mercenary";
}

export function getActorDeck(actor: Actor.Implementation | null | undefined): ModifierDeck | null {
  if (!isMercenary(actor)) return null;
  const draw = getCards(actor.system.deck.drawPile);
  const discard = getCards(actor.system.deck.discardPile);
  return draw && discard ? new ModifierDeck(draw, discard, actor) : null;
}

export function getGMDeck(): ModifierDeck | null {
  const draw = getCards(game.settings!.get(SYSTEM_ID, "gmDrawPile"));
  const discard = getCards(game.settings!.get(SYSTEM_ID, "gmDiscardPile"));
  return draw && discard ? new ModifierDeck(draw, discard, null) : null;
}

/** Resolve a deck reference: an Actor UUID, or "gm". */
export async function resolveDeck(ref: string): Promise<ModifierDeck | null> {
  if (ref === GM_DECK_REF) return getGMDeck();
  const actor = (await fromUuid(ref)) as Actor.Implementation | null;
  return getActorDeck(actor);
}

async function ensureFolder(): Promise<string | null> {
  const existing = game.settings!.get(SYSTEM_ID, "deckFolder");
  if (existing && game.folders?.get(existing)) return existing;
  const folder = await Folder.create({
    name: game.i18n!.localize("GLOOM.Deck.folderName"),
    type: "Cards",
    color: "#5b3a1a",
  });
  if (!folder) return null;
  await game.settings!.set(SYSTEM_ID, "deckFolder", folder.id!);
  return folder.id!;
}

async function createPair(name: string, ownership: Record<string, number>, flags: Record<string, unknown>) {
  const folder = await ensureFolder();
  const common = { folder, ownership, flags: { [SYSTEM_ID]: flags } };
  const created = await Cards.createDocuments([
    { ...common, name: game.i18n!.format("GLOOM.Deck.drawPileName", { name }), type: "deck" },
    { ...common, name: game.i18n!.format("GLOOM.Deck.discardPileName", { name }), type: "pile" },
  ] as never);
  const [draw, discard] = created as Cards.Stored[];
  if (!draw || !discard) throw new Error("GloomFoundry | Failed to create modifier deck");
  return { draw, discard };
}

/** Create (or repair) the decks of a mercenary. GM only. */
export async function ensureActorDecks(actor: Actor.Implementation): Promise<ModifierDeck | null> {
  if (!game.user?.isGM || !isMercenary(actor)) return null;
  const existing = getActorDeck(actor);
  if (existing) return existing;
  const ownership = foundry.utils.deepClone(actor.ownership) as Record<string, number>;
  const { draw, discard } = await createPair(actor.name ?? "?", ownership, { actor: actor.uuid });
  await actor.update({ "system.deck.drawPile": draw.id, "system.deck.discardPile": discard.id } as never);
  const deck = new ModifierDeck(draw, discard, actor);
  await deck.rebuild();
  return deck;
}

/** Create the shared GM deck if missing. GM only. */
export async function ensureGMDeck(): Promise<ModifierDeck | null> {
  if (!game.user?.isGM) return null;
  const existing = getGMDeck();
  if (existing) return existing;
  const name = game.i18n!.localize("GLOOM.Deck.gmDeck");
  const { draw, discard } = await createPair(name, { default: 0 }, { gm: true });
  await game.settings!.set(SYSTEM_ID, "gmDrawPile", draw.id);
  await game.settings!.set(SYSTEM_ID, "gmDiscardPile", discard.id);
  const deck = new ModifierDeck(draw, discard, null);
  await deck.rebuild();
  return deck;
}

/** Mirror the actor's ownership onto its decks so its players can draw. GM only. */
export async function syncDeckOwnership(actor: Actor.Implementation): Promise<void> {
  const deck = getActorDeck(actor);
  if (!deck) return;
  const ownership = foundry.utils.deepClone(actor.ownership) as Record<string, number>;
  await Cards.updateDocuments([
    { _id: deck.drawPile.id, ownership },
    { _id: deck.discardPile.id, ownership },
  ] as never);
}

export async function deleteActorDecks(actor: Actor.Implementation): Promise<void> {
  if (!isMercenary(actor)) return;
  const ids = [actor.system.deck.drawPile, actor.system.deck.discardPile].filter((id) => getCards(id));
  if (ids.length) await Cards.deleteDocuments(ids);
}

/** All decks currently known (mercenaries + GM), for bulk operations like combat shuffles. */
export function allDecks(): ModifierDeck[] {
  const decks: ModifierDeck[] = [];
  for (const actor of game.actors ?? []) {
    const deck = getActorDeck(actor as Actor.Implementation);
    if (deck) decks.push(deck);
  }
  const gm = getGMDeck();
  if (gm) decks.push(gm);
  return decks;
}

export function registerDeckLifecycleHooks(): void {
  Hooks.on("createActor", (actor) => {
    if (isActiveGM()) void ensureActorDecks(actor as Actor.Implementation);
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (isActiveGM() && "ownership" in (changes as object)) void syncDeckOwnership(actor as Actor.Implementation);
  });
  Hooks.on("deleteActor", (actor) => {
    if (isActiveGM()) void deleteActorDecks(actor as Actor.Implementation);
  });
  Hooks.once("ready", async () => {
    if (!isActiveGM()) return;
    await ensureGMDeck();
    for (const actor of game.actors ?? []) await ensureActorDecks(actor as Actor.Implementation);
  });
}
