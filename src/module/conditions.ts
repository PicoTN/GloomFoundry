/**
 * Gloomhaven conditions (Core Rulebook p. 83-85), implemented as token status effects.
 *
 * Foundry's default status list is replaced by the Gloomhaven conditions plus
 * Unconscious and Dead. Durations are not automated yet (combat comes later), but:
 *  - Strengthen / Muddle pre-select advantage / disadvantage in draw dialogs;
 *  - Poison / Ward on the targeted token pre-fill the attack dialog;
 *  - Bless / Curse from the token HUD shuffle a card into the Modifier Deck instead
 *    of staying on as a toggle (they stack up to 6, as cards);
 *  - rests and the end of combat remove conditions; Unconscious follows HP.
 */
import { SYSTEM_PATH, type AttributeKey } from "./config.ts";

export type ConditionKind = "positive" | "negative";

export interface ConditionDef {
  id: string;
  kind: ConditionKind;
  /** Attribute tested to resist the condition, if any. */
  resist?: AttributeKey;
  /** Core Foundry status whose icon we reuse. */
  coreIcon: string;
  /** Represented by cards in the Modifier Deck rather than a toggle. */
  deckCard?: boolean;
}

export const CONDITIONS: readonly ConditionDef[] = [
  // Positive
  { id: "bless", kind: "positive", coreIcon: "bless", deckCard: true },
  { id: "invisible", kind: "positive", coreIcon: "invisible" },
  { id: "regenerate", kind: "positive", coreIcon: "regen" },
  { id: "safeguard", kind: "positive", coreIcon: "holyShield" },
  { id: "strengthen", kind: "positive", coreIcon: "upgrade" },
  { id: "ward", kind: "positive", coreIcon: "magicShield" },
  // Negative
  { id: "curse", kind: "negative", coreIcon: "curse", resist: "understanding", deckCard: true },
  { id: "immobilize", kind: "negative", coreIcon: "restrain", resist: "finesse" },
  { id: "muddle", kind: "negative", coreIcon: "downgrade", resist: "logic" },
  { id: "pacify", kind: "negative", coreIcon: "silence", resist: "intuition" },
  { id: "poison", kind: "negative", coreIcon: "poison", resist: "cunning" },
  { id: "stun", kind: "negative", coreIcon: "stun", resist: "grit" },
  { id: "wound", kind: "negative", coreIcon: "bleeding", resist: "grit" },
];

/** Conditions shown as toggles (Bless/Curse live in the deck). */
export const TOGGLE_CONDITIONS = CONDITIONS.filter((c) => !c.deckCard);
export const CONDITION_IDS = new Set(CONDITIONS.map((c) => c.id));

const EXTRA_STATUSES = [
  { id: "unconscious", coreIcon: "unconscious" },
  { id: "dead", coreIcon: "dead" },
];

export function conditionLabel(id: string): string {
  return `GLOOM.Condition.${id}.name`;
}

/** Replace Foundry's status effects with the Gloomhaven ones. Call during `init`. */
export function registerStatusEffects(): void {
  const coreImg = new Map(CONFIG.statusEffects.map((s) => [s.id, s.img as string | undefined]));
  const img = (core: string) => coreImg.get(core) ?? `${SYSTEM_PATH}/assets/cards/back.svg`;

  CONFIG.statusEffects = [
    ...CONDITIONS.map((c) => ({ id: c.id, name: conditionLabel(c.id), img: img(c.coreIcon) })),
    ...EXTRA_STATUSES.map((s) => ({ id: s.id, name: conditionLabel(s.id), img: img(s.coreIcon) })),
  ] as typeof CONFIG.statusEffects;

  // Gloomhaven's Invisible only hides you from the opposing side (see canvas/invisibility.ts),
  // so Foundry's special INVISIBLE status (hidden from everyone) is disabled.
  const special = CONFIG.specialStatusEffects as Record<string, string>;
  special["INVISIBLE"] = "gloomfoundry-none";
  special["DEFEATED"] = "dead";
}

// ---------------------------------------------------------------------------
// Helpers used by sheets and draw actions
// ---------------------------------------------------------------------------

export function hasCondition(actor: Actor.Implementation | null | undefined, id: string): boolean {
  return actor?.statuses?.has(id) ?? false;
}

/** Remove every Gloomhaven condition (not Unconscious/Dead) from an actor. */
export async function clearConditions(actor: Actor.Implementation): Promise<void> {
  for (const c of TOGGLE_CONDITIONS) {
    if (hasCondition(actor, c.id)) await actor.toggleStatusEffect(c.id, { active: false });
  }
}

/** The targeted token's actor, if exactly one token is targeted. */
export function currentTargetActor(): Actor.Implementation | null {
  const targets = game.user?.targets;
  if (!targets || targets.size !== 1) return null;
  const [token] = targets;
  return (token?.actor as Actor.Implementation | undefined) ?? null;
}
