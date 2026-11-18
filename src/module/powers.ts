/**
 * Powers (Talents, Skills, items) and Backgrounds: using, expending, losing, recovering;
 * healing; class/ancestry grants. Core Rulebook p. 65, 68, 72, 85, 87.
 */
import { powerDetails } from "./combat/power-actions.ts";
import { SYSTEM_ID, templatePath } from "./config.ts";
import { hasCondition } from "./conditions.ts";
import type { PowerState } from "./data/powers.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

type Sys<T> = T & Record<string, unknown>;
const sys = <T>(item: Item.Implementation) => item.system as unknown as Sys<T>;

// ---------------------------------------------------------------------------
// Healing (p. 78, 85): a heal removes Poison *instead of* healing, and removes Wound.
// ---------------------------------------------------------------------------

export async function heal(actor: Actor.Implementation, amount: number, source = ""): Promise<number> {
  const hp = (actor.system as unknown as { hp: { value: number; max: number } }).hp;
  const poisoned = hasCondition(actor, "poison");
  const healed = poisoned ? 0 : Math.max(0, Math.min(amount, hp.max - hp.value));
  if (healed) await actor.update({ "system.hp.value": hp.value + healed } as never);
  if (poisoned) await actor.toggleStatusEffect("poison", { active: false });
  if (hasCondition(actor, "wound")) await actor.toggleStatusEffect("wound", { active: false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-heal"><i class="fa-solid fa-heart"></i> ${
      poisoned
        ? f("GLOOM.Heal.poisonRemoved", { name: actor.name ?? "" })
        : f("GLOOM.Heal.healed", { name: actor.name ?? "", amount: String(healed) })
    }${source ? ` <em>(${source})</em>` : ""}</p>`,
  } as never);
  return healed;
}

// ---------------------------------------------------------------------------
// Using powers
// ---------------------------------------------------------------------------

/** Mark a Skill or item as expended or lost (its own `lostOnUse` decides when `how` is "use"). */
export async function spendPower(item: Item.Implementation, how: "use" | "expend" | "lose" = "use"): Promise<void> {
  const s = sys<{ lostOnUse?: boolean; consumable?: boolean; quantity?: number; uses?: { max: number | null; spent: number } }>(item);
  if (item.type === "equipment") {
    if (s.consumable && how !== "lose") {
      const quantity = (s.quantity ?? 1) - 1;
      if (quantity <= 0) await item.delete();
      else await item.update({ "system.quantity": quantity } as never);
      return;
    }
    const uses = s.uses;
    if (how === "use" && uses?.max) {
      const spent = uses.spent + 1;
      const update: Record<string, unknown> = { "system.uses.spent": spent };
      if (spent >= uses.max) update["system.state"] = s.lostOnUse ? "lost" : "expended";
      await item.update(update as never);
      return;
    }
    if (how === "use" && !uses?.max && !s.lostOnUse) return; // always-active item
  }
  const state: PowerState = how === "lose" || (how === "use" && s.lostOnUse) ? "lost" : "expended";
  await item.update({ "system.state": state } as never);
}

/** Expend a Skill to heal 3 as a basic secondary action (p. 66). */
export async function expendSkillToHeal(item: Item.Implementation): Promise<void> {
  const actor = item.parent as Actor.Implementation | null;
  if (!actor) return;
  await item.update({ "system.state": "expended" } as never);
  await heal(actor, 3, item.name ?? "");
}

/** Voluntarily lose a Skill (even an expended one) to negate all damage from one source (p. 65). */
export async function loseSkillToNegate(item: Item.Implementation): Promise<void> {
  const actor = item.parent as Actor.Implementation | null;
  await item.update({ "system.state": "lost" } as never);
  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor: actor as Actor.Stored }) : {},
    content: `<p class="gloom-negate"><i class="fa-solid fa-shield-halved"></i> ${
      f("GLOOM.Skill.negated", { name: actor?.name ?? "", skill: item.name ?? "" })
    }</p>`,
  } as never);
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * Recover powers. Quick Breath: expended only (and per-scene uses).
 * Full Rest: expended and lost, all uses, all Backgrounds.
 */
export async function recoverPowers(actor: Actor.Implementation, { lost }: { lost: boolean }): Promise<void> {
  const updates: Record<string, unknown>[] = [];
  for (const item of actor.items) {
    const s = sys<{ state?: PowerState; expended?: boolean; uses?: { spent: number; per: string } }>(item);
    const update: Record<string, unknown> = {};
    if (s.state === "expended" || (lost && s.state === "lost")) update["system.state"] = "ready";
    if (item.type === "background" && s.expended) update["system.expended"] = false;
    if (s.uses?.spent && (lost || s.uses.per !== "rest")) update["system.uses.spent"] = 0;
    if (Object.keys(update).length) updates.push({ _id: item.id, ...update });
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
}

/** End of round: items usable "1/round" get their uses back. */
export async function recoverRoundUses(actor: Actor.Implementation): Promise<void> {
  const updates = actor.items
    .filter((i) => i.type === "equipment")
    .filter((i) => {
      const s = sys<{ uses?: { spent: number; per: string } }>(i);
      return s.uses?.per === "round" && s.uses.spent > 0;
    })
    .map((i) => {
      const s = sys<{ state?: PowerState; lostOnUse?: boolean }>(i);
      return { _id: i.id, "system.uses.spent": 0, ...(s.state === "expended" ? { "system.state": "ready" } : {}) };
    });
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
}

/** Ready, prepared Skills (the ones still usable this scene). */
export function readySkills(actor: Actor.Implementation): Item.Implementation[] {
  return actor.items.filter((i) => {
    if (i.type !== "skill") return false;
    const s = sys<{ prepared: boolean; state: PowerState }>(i);
    return s.prepared && s.state === "ready";
  });
}

// ---------------------------------------------------------------------------
// Chat card
// ---------------------------------------------------------------------------

export async function postItemCard(item: Item.Implementation): Promise<void> {
  const actor = item.parent as Actor.Implementation | null;
  const s = item.system as unknown as Record<string, unknown>;
  const content = await foundry.applications.handlebars.renderTemplate(templatePath("chat/item.hbs"), {
    item,
    typeLabel: t(`TYPES.Item.${item.type}`),
    system: s,
    ...(await powerDetails(item)),
  } as never);
  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor: actor as Actor.Stored }) : {},
    content,
    flags: { [SYSTEM_ID]: { itemUuid: item.uuid } },
  } as never);
}

// ---------------------------------------------------------------------------
// Class & ancestry grants
// ---------------------------------------------------------------------------

/**
 * When a class or ancestry is added to a mercenary: create its granted items (skipping
 * ones the mercenary already has) and, for a class, add its Attribute points once.
 */
export async function applyGrants(actor: Actor.Implementation, source: Item.Implementation): Promise<void> {
  const s = sys<{ grants: Record<string, unknown>[]; attributes?: Record<string, number> }>(source);
  const existing = new Set(actor.items.map((i) => `${i.type}:${i.name}`));
  const toCreate = (s.grants ?? [])
    .filter((g) => g && typeof g === "object" && !existing.has(`${String(g["type"])}:${String(g["name"])}`))
    .map((g) => {
      const { _id, ...data } = g;
      return foundry.utils.mergeObject(data, { [`flags.${SYSTEM_ID}.grantedBy`]: source.id }, { inplace: false });
    });
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate as never);

  if (source.type === "class" && s.attributes) {
    const attrs = (actor.system as unknown as { attributes: Record<string, number> }).attributes;
    const update: Record<string, number> = {};
    for (const [key, bonus] of Object.entries(s.attributes)) {
      if (bonus) update[`system.attributes.${key}`] = Math.min(7, (attrs[key] ?? 0) + bonus);
    }
    if (Object.keys(update).length) await actor.update(update as never);
  }
  ui.notifications?.info(f("GLOOM.Grants.applied", { name: source.name ?? "", count: String(toCreate.length) }));
}

/** Remove the items a class/ancestry granted (asked when the class/ancestry is deleted). */
export async function removeGrants(actor: Actor.Implementation, sourceId: string): Promise<void> {
  const ids = actor.items
    .filter((i) => (i.flags as Record<string, { grantedBy?: string } | undefined>)[SYSTEM_ID]?.grantedBy === sourceId)
    .map((i) => i.id!);
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
}

export function registerPowerHooks(): void {
  // Only one class and one ancestry per mercenary.
  Hooks.on("preCreateItem", (item) => {
    const i = item as Item.Implementation;
    const actor = i.parent as Actor.Implementation | null;
    if (!actor || (i.type !== "class" && i.type !== "ancestry")) return;
    if (actor.items.some((other) => other.type === i.type)) {
      ui.notifications?.warn(f("GLOOM.Grants.onlyOne", { type: t(`TYPES.Item.${i.type}`) }));
      return false;
    }
  });

  Hooks.on("createItem", (item, _options, userId) => {
    const i = item as Item.Implementation;
    const actor = i.parent as Actor.Implementation | null;
    if (userId !== game.user?.id || actor?.type !== "mercenary") return;
    if (i.type === "class" || i.type === "ancestry") void applyGrants(actor, i);
  });

  Hooks.on("deleteItem", async (item, _options, userId) => {
    const i = item as Item.Implementation;
    const actor = i.parent as Actor.Implementation | null;
    if (userId !== game.user?.id || !actor || (i.type !== "class" && i.type !== "ancestry")) return;
    const granted = actor.items.some(
      (o) => (o.flags as Record<string, { grantedBy?: string } | undefined>)[SYSTEM_ID]?.grantedBy === i.id,
    );
    if (!granted) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("GLOOM.Grants.removeTitle") },
      content: `<p>${f("GLOOM.Grants.removeConfirm", { name: i.name ?? "" })}</p>`,
    } as never);
    if (ok) await removeGrants(actor, i.id!);
  });
}
