/**
 * Suffering damage (p. 68, 77, 84): Ward halves the damage (reduction rounded up) and is then
 * used up; Regenerate ends when damage is taken; HP never goes below 0.
 */
import { SYSTEM_ID } from "../config.ts";
import { hasCondition } from "../conditions.ts";
import { runAsGM } from "../socket.ts";

const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

export interface DamageOptions {
  /** Label for the chat message (e.g. "Wound", an attacker's name). */
  source?: string;
  /** The amount already includes the Ward reduction (attack dialog): only use Ward up. */
  wardApplied?: boolean;
}

/** Apply damage now (caller must be able to update the actor). Returns the damage suffered. */
export async function sufferDamage(actor: Actor.Implementation, amount: number, options: DamageOptions = {}): Promise<number> {
  let damage = Math.max(0, Math.floor(amount));
  const warded = hasCondition(actor, "ward");
  let wardNote = "";
  if (warded && (damage > 0 || options.wardApplied)) {
    if (!options.wardApplied) {
      const reduction = Math.ceil(damage / 2);
      damage -= reduction;
      wardNote = ` (${game.i18n!.localize("GLOOM.Condition.ward.name")} −${reduction})`;
    }
    await actor.toggleStatusEffect("ward", { active: false });
  }
  const hp = (actor.system as unknown as { hp: { value: number } }).hp;
  const next = Math.max(0, hp.value - damage);
  if (next !== hp.value) await actor.update({ "system.hp.value": next } as never);
  if (damage > 0 && hasCondition(actor, "regenerate")) await actor.toggleStatusEffect("regenerate", { active: false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-damage"><i class="fa-solid fa-burst"></i> ${f("GLOOM.Damage.suffered", {
      name: actor.name ?? "", amount: String(damage),
    })}${wardNote}${options.source ? ` <em>(${options.source})</em>` : ""}</p>`,
  } as never);
  return damage;
}

/** Apply damage to any actor: directly if allowed, else through the GM. */
export async function applyDamage(actor: Actor.Implementation, amount: number, options: DamageOptions = {}): Promise<void> {
  if (actor.isOwner) {
    await sufferDamage(actor, amount, options);
    return;
  }
  await runAsGM({ action: "applyDamage", actor: actor.uuid ?? "", amount, options });
}

/** "Apply damage" buttons on attack chat cards. */
export function registerDamageButtons(): void {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html as HTMLElement;
    const flags = ((message as ChatMessage.Implementation).flags as Record<string, Record<string, unknown> | undefined>)[SYSTEM_ID] ?? {};
    const canApply = game.user?.isGM || (message as ChatMessage.Implementation).isAuthor;
    // Retaliate: the target damages the attacker back.
    const retaliate = root.querySelector<HTMLButtonElement>("[data-gloom-retaliate]");
    if (retaliate) {
      if (!canApply) retaliate.remove();
      else retaliate.addEventListener("click", async (event) => {
        event.preventDefault();
        const attacker = (await fromUuid(String(flags["attackerUuid"] ?? ""))) as Actor.Implementation | null;
        if (!attacker) return;
        await applyDamage(attacker, Number(retaliate.dataset["gloomRetaliate"] ?? 0), { source: game.i18n!.localize("GLOOM.Ability.retaliate") });
        retaliate.disabled = true;
      });
    }
    const button = root.querySelector<HTMLButtonElement>("[data-gloom-apply-damage]");
    if (!button) return;
    if (!canApply) {
      button.remove();
      return;
    }
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const damage = Number(flags["damage"] ?? 0);
      const wardApplied = Boolean(flags["wardApplied"]);
      const source = String(flags["attacker"] ?? "");
      const targets: Actor.Implementation[] = [];
      if (typeof flags["targetUuid"] === "string" && flags["targetUuid"]) {
        const target = (await fromUuid(flags["targetUuid"])) as Actor.Implementation | null;
        if (target) targets.push(target);
      } else {
        for (const token of canvas?.tokens?.controlled ?? []) if (token.actor) targets.push(token.actor as Actor.Implementation);
      }
      if (!targets.length) return void ui.notifications?.warn("GLOOM.Damage.noTarget", { localize: true });
      for (const target of targets) await applyDamage(target, damage, { source, wardApplied });
      button.disabled = true;
    });
  });
}
