/**
 * Gloomhaven combat flow (p. 71-72):
 *  - each round starts with a planning phase (initiatives are cleared and chosen again);
 *  - the GM then starts the action phase: characters act from the lowest initiative;
 *  - turn start: Regenerate then Wound; turn end: infusions become strong, "until the end of
 *    your next turn" conditions expire, planned Skills/items are expended or lost;
 *  - round end (cleanup): elements decay, Critical/Null decks reshuffle (deck/combat-hooks.ts).
 */
import { SYSTEM_ID } from "../config.ts";
import { hasCondition } from "../conditions.ts";
import { isActiveGM } from "../deck/registry.ts";
import { heal, recoverRoundUses, spendPower } from "../powers.ts";
import { clearAreas } from "./power-actions.ts";
import { expireRoundAbilities } from "../abilities.ts";
import {
  decay, endTurn as elementsEndTurn, expiresAtTurnEnd, timelinePosition, UNTIL_END_OF_NEXT_TURN,
} from "../rules/combat.ts";
import { sufferDamage } from "./damage.ts";
import { getBoard, saveBoard } from "./elements.ts";
import { getPlan, openPlanningSheet, PLAN_FLAG, planEnemies, syncSummons } from "./planning.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

export type Phase = "planning" | "action";

export function getPhase(combat: Combat.Implementation | null | undefined): Phase | null {
  return (combat?.getFlag(SYSTEM_ID as never, "phase" as never) as Phase | undefined) ?? null;
}

export class GloomCombat extends Combat {
  /** Lowest initiative acts first; characters who haven't planned go last. */
  protected override _sortCombatants(a: Combatant.Implementation, b: Combatant.Implementation): number {
    const ia = a.initiative ?? Number.POSITIVE_INFINITY;
    const ib = b.initiative ?? Number.POSITIVE_INFINITY;
    if (ia !== ib) return ia - ib;
    return (a.name ?? "").localeCompare(b.name ?? "") || (a.id ?? "").localeCompare(b.id ?? "");
  }

  /** "Roll initiative" opens planning: the mercenary's dialog, or the GM's enemy speeds. */
  override async rollInitiative(ids: string | string[]): Promise<this> {
    const list = (Array.isArray(ids) ? ids : [ids]).map((id) => this.combatants.get(id)).filter(Boolean) as Combatant.Implementation[];
    if (list.some((c) => c.actor?.type === "npc")) await planEnemies(this as unknown as Combat.Implementation);
    for (const c of list) if (c.actor?.type === "mercenary") await openPlanningSheet(c);
    return this;
  }

  override async rollNPC(): Promise<this> {
    await planEnemies(this as unknown as Combat.Implementation);
    return this;
  }

  override async rollAll(): Promise<this> {
    await planEnemies(this as unknown as Combat.Implementation);
    for (const c of this.combatants) if (c.isOwner && c.actor?.type === "mercenary" && !game.user?.isGM) await openPlanningSheet(c);
    return this;
  }

  /** GM: end planning and start the action phase with the lowest initiative. */
  async startActionPhase(): Promise<void> {
    const unplanned = this.combatants.filter((c) => c.initiative === null || c.initiative === undefined);
    if (unplanned.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GLOOM.Combat.startAction") },
        content: `<p>${f("GLOOM.Combat.unplanned", { names: unplanned.map((c) => c.name).join(", ") })}</p>`,
      } as never);
      if (!ok) return;
    }
    await this.update({ turn: 0, [`flags.${SYSTEM_ID}.phase`]: "action" } as never);
    const first = this.turns[0];
    if (first) await startTurn(this as unknown as Combat.Implementation, first);
  }
}

// ---------------------------------------------------------------------------
// Turn & round processing (active GM only)
// ---------------------------------------------------------------------------

async function startTurn(combat: Combat.Implementation, combatant: Combatant.Implementation): Promise<void> {
  await combatant.update({
    [`flags.${SYSTEM_ID}.turnStartedAt`]: timelinePosition(combat.round, combat.turn),
    // Each element can be used once per turn (p. 82): reset this character's uses.
    [`flags.${SYSTEM_ID}.elementsUsed`]: [],
  } as never);
  const actor = combatant.actor as Actor.Implementation | null;
  if (!actor) return;
  // Regenerate happens first and removes Wound before it deals damage (p. 84).
  if (hasCondition(actor, "regenerate")) await heal(actor, 1, t("GLOOM.Condition.regenerate.name"));
  if (hasCondition(actor, "wound")) await sufferDamage(actor, 1, { source: t("GLOOM.Condition.wound.name") });
  if (hasCondition(actor, "stun")) {
    await ChatMessage.create({ content: `<p class="gloom-stun"><i class="fa-solid fa-dizzy"></i> ${f("GLOOM.Combat.stunned", { name: actor.name ?? "" })}</p>` } as never);
  }
}

async function endTurn(combat: Combat.Implementation, combatant: Combatant.Implementation): Promise<void> {
  // Infusions made during the turn become strong.
  await saveBoard(elementsEndTurn(getBoard()));
  // Areas shown for this turn's attacks disappear (traps and obstacles stay).
  await clearAreas(combat.scene ?? canvas?.scene, combatant.id ?? undefined);
  const actor = combatant.actor as Actor.Implementation | null;
  if (!actor) return;

  // Conditions lasting "until the end of your next turn".
  const startedAt = Number(combatant.getFlag(SYSTEM_ID as never, "turnStartedAt" as never) ?? 0);
  const expired: string[] = [];
  for (const id of UNTIL_END_OF_NEXT_TURN) {
    const effect = actor.effects.find((e) => e.statuses.has(id));
    if (!effect) continue;
    const appliedAt = (effect.flags as Record<string, { appliedAt?: number } | undefined>)[SYSTEM_ID]?.appliedAt;
    if (expiresAtTurnEnd(appliedAt, startedAt)) {
      await actor.toggleStatusEffect(id, { active: false });
      expired.push(t(`GLOOM.Condition.${id}.name`));
    }
  }
  if (expired.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
      content: `<p class="hint">${f("GLOOM.Combat.expired", { name: actor.name ?? "", conditions: expired.join(", ") })}</p>`,
    } as never);
  }

  // Skills (and items) chosen in planning are expended or lost even if not used (p. 72).
  const plan = getPlan(combatant);
  for (const power of [plan?.primary, plan?.secondary]) {
    if (!power || (power.type !== "skill" && power.type !== "equipment")) continue;
    const item = actor.items.get(power.id);
    if (item && (item.system as unknown as { state: string }).state === "ready") await spendPower(item, "use");
  }
}

async function endRound(combat: Combat.Implementation, priorRound: number): Promise<void> {
  if (priorRound > 0) await saveBoard(decay(getBoard()));
  const speeds = combat.getFlag(SYSTEM_ID as never, "speeds" as never) as Record<string, string> | undefined;
  await combat.update({
    [`flags.${SYSTEM_ID}.phase`]: "planning",
    [`flags.${SYSTEM_ID}.lastSpeeds`]: speeds ?? {},
    [`flags.${SYSTEM_ID}.-=speeds`]: null,
  } as never);
  for (const c of combat.combatants) {
    if (!c.actor) continue;
    await recoverRoundUses(c.actor as Actor.Implementation);
    // Shield, Retaliate and Taunt last until the end of the round (p. 81).
    await expireRoundAbilities(c.actor as Actor.Implementation);
  }
  const updates = combat.combatants.map((c) => ({ _id: c.id, initiative: null, [`flags.${SYSTEM_ID}.-=${PLAN_FLAG}`]: null }));
  await combat.updateEmbeddedDocuments("Combatant", updates as never);
  await ChatMessage.create({
    content: `<div class="gloom-round"><h3>${f("GLOOM.Combat.roundTitle", { round: String(combat.round) })}</h3><p>${t("GLOOM.Combat.planningHint")}</p></div>`,
  } as never);
}

export function registerCombatFlow(): void {
  CONFIG.Combat.documentClass = GloomCombat as never;
  CONFIG.Combat.initiative = { formula: "0", decimals: 0 } as never;

  Hooks.on("combatTurnChange", async (combat, prior, current) => {
    if (!isActiveGM()) return;
    const c = combat as Combat.Implementation;
    const phase = getPhase(c);
    if (phase === "action" && prior.combatantId) {
      const ended = c.combatants.get(prior.combatantId);
      if (ended) await endTurn(c, ended);
    }
    if (current.round !== prior.round) return void (await endRound(c, prior.round));
    if (phase === "action" && current.combatantId) {
      const started = c.combatants.get(current.combatantId);
      if (started) await startTurn(c, started);
    }
  });

  // Remember when a condition was gained, for "until the end of your next turn" durations.
  Hooks.on("preCreateActiveEffect", (effect) => {
    const combat = game.combat;
    if (!combat?.started) return;
    (effect as ActiveEffect.Implementation).updateSource({
      [`flags.${SYSTEM_ID}.appliedAt`]: timelinePosition(combat.round, combat.turn),
    } as never);
  });

  // Summons follow their controller's initiative.
  Hooks.on("updateCombatant", (combatant, changes) => {
    if (!isActiveGM() || !("initiative" in (changes as object))) return;
    void syncSummons((combatant as Combatant.Implementation).parent as Combat.Implementation);
  });

  // End of combat: unconscious mercenaries heal 1 (p. 72).
  Hooks.on("deleteCombat", async (combat) => {
    if (!isActiveGM()) return;
    for (const c of (combat as Combat.Implementation).combatants) {
      const actor = c.actor as Actor.Implementation | null;
      if (actor?.type !== "mercenary" || !hasCondition(actor, "unconscious")) continue;
      const hp = (actor.system as unknown as { hp: { value: number; max: number } }).hp;
      await actor.update({ "system.hp.value": Math.min(hp.max, hp.value + 1) } as never);
    }
  });
}
