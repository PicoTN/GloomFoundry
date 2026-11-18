/**
 * Positive abilities that last until the end of the round (p. 81): Shield X, Retaliate X and
 * Taunt. Each is a token status (with its icon) carrying a value; several sources stack.
 * Persistent ones (from persistent effects or items) stay until removed.
 * - The attack dialog pre-fills the target's Shield.
 * - The attack chat card offers "Retaliate X" damage back to the attacker.
 * - Round effects are removed at the end of the round (combat) or by hand.
 */
import { SYSTEM_ID } from "./config.ts";

export const ABILITY_IDS = ["shield", "retaliate", "taunt"] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

const DEFAULT_ICONS: Record<AbilityId, string> = {
  shield: "icons/svg/shield.svg",
  retaliate: "icons/svg/sword.svg",
  taunt: "icons/svg/target.svg",
};

interface AbilityFlags { value?: number; persistent?: boolean; range?: number | null }

const flagsOf = (e: ActiveEffect.Implementation) =>
  ((e.flags as Record<string, AbilityFlags | undefined>)[SYSTEM_ID] ?? {});

/** Status entries for CONFIG.statusEffects (icons from the icon pack's stat icons when loaded). */
export function abilityStatuses(): { id: string; name: string; img: string }[] {
  const pack = CONFIG.GLOOM?.icons ?? {};
  return ABILITY_IDS.map((id) => ({
    id, name: `GLOOM.Ability.${id}`, img: pack[`condition.${id}`] ?? pack[`stat.${id}`] ?? DEFAULT_ICONS[id],
  }));
}

function effectsOf(actor: Actor.Implementation, id: AbilityId): ActiveEffect.Implementation[] {
  return actor.effects.filter((e) => e.statuses.has(id)) as ActiveEffect.Implementation[];
}

/** Total value of an ability on an actor (Taunt: 1 if present). */
export function abilityValue(actor: Actor.Implementation | null | undefined, id: AbilityId): number {
  if (!actor) return 0;
  return effectsOf(actor, id).reduce((sum, e) => sum + (id === "taunt" ? 1 : Number(flagsOf(e).value ?? 0)), 0);
}

function effectName(id: AbilityId, value: number, persistent: boolean): string {
  const base = game.i18n!.localize(`GLOOM.Ability.${id}`);
  const v = id === "taunt" ? "" : ` ${value}`;
  return `${base}${v}${persistent ? ` (${game.i18n!.localize("GLOOM.Ability.persistent")})` : ""}`;
}

/** Gain Shield/Retaliate X or Taunt (stacks with the same kind of effect). */
export async function gainAbility(
  actor: Actor.Implementation, id: AbilityId, value = 1, options: { persistent?: boolean; range?: number | null } = {},
): Promise<void> {
  const persistent = !!options.persistent;
  const existing = effectsOf(actor, id).find((e) => !!flagsOf(e).persistent === persistent);
  const img = abilityStatuses().find((s) => s.id === id)!.img;
  if (existing && id !== "taunt") {
    const total = Number(flagsOf(existing).value ?? 0) + value;
    await existing.update({ name: effectName(id, total, persistent), [`flags.${SYSTEM_ID}.value`]: total } as never);
    return;
  }
  if (existing) return;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: effectName(id, value, persistent), img, statuses: [id],
    flags: { [SYSTEM_ID]: { value, persistent, range: options.range ?? null } },
  }] as never);
}

/** End of round: round abilities end (persistent ones stay). */
export async function expireRoundAbilities(actor: Actor.Implementation): Promise<void> {
  const ids = actor.effects
    .filter((e) => ABILITY_IDS.some((id) => e.statuses.has(id)) && !flagsOf(e as ActiveEffect.Implementation).persistent)
    .map((e) => e.id!);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
