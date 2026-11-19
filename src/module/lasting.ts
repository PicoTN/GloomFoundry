/**
 * Lasting effects at the table (p. 78): an ActiveEffect on the character carrying the effect's
 * text, uses and rounds. Its Skill (or item) is "active" meanwhile and is expended or lost when
 * the effect ends: out of uses, at the end of the round (round effects), after its rounds, at
 * the end of combat (round-based ones), or by hand.
 * Effects may carry an attack bonus (+X attack, Pierce, Push/Pull, advantage, conditions) for the
 * character, its allies or its enemies; marked spaces carry one for those in or next to them.
 * The attack dialog lists the bonuses that apply (attackBonuses) and spends their charges.
 */
import { SYSTEM_ID } from "./config.ts";
import { nearbySpaces, flagsOf } from "./canvas/terrain.ts";
import { dispositionOf } from "./npc.ts";
import { areOpposed } from "./rules/sides.ts";
import { runAsGM } from "./socket.ts";
import {
  bonusApplies, endsAtRoundEnd, parseLasting, parseLastingBonus, type BonusWho, type LastingBonus, type LastingSpec,
} from "./rules/lasting.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface LastingFlags extends LastingSpec { text: string; item: string; startRound: number; bonus?: LastingBonus | null }

export const lastingOf = (e: ActiveEffect.Implementation): LastingFlags | null =>
  ((e.flags as Record<string, { lasting?: LastingFlags } | undefined>)[SYSTEM_ID]?.lasting) ?? null;

export function lastingEffects(actor: Actor.Implementation): ActiveEffect.Implementation[] {
  return actor.effects.filter((e) => !!lastingOf(e as ActiveEffect.Implementation)) as ActiveEffect.Implementation[];
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Prompt (pre-filled from the text) and start a lasting effect from an item's action. */
export async function startLasting(actor: Actor.Implementation, item: Item.Implementation | null, text: string): Promise<void> {
  const guess = parseLasting(text) ?? { kind: "persistent", uses: null, rounds: null, lose: false };
  const bonus = parseLastingBonus(text);
  const content = `<div class="gloom-lasting-form">
    <p class="desc">${escape(plain(text))}</p>
    <label>${t("GLOOM.Lasting.kind")} <select name="kind">
      <option value="round"${guess.kind === "round" ? " selected" : ""}>${t("GLOOM.Lasting.round")}</option>
      <option value="persistent"${guess.kind === "persistent" ? " selected" : ""}>${t("GLOOM.Lasting.persistent")}</option></select></label>
    <label>${t("GLOOM.Lasting.uses")} <input type="number" name="uses" min="0" step="1" value="${guess.uses ?? ""}" placeholder="—"></label>
    <label>${t("GLOOM.Lasting.rounds")} <input type="number" name="rounds" min="0" step="1" value="${guess.rounds ?? ""}" placeholder="—"></label>
    ${item ? `<label class="checkbox"><input type="checkbox" name="lose"${guess.lose ? " checked" : ""}> ${t("GLOOM.Lasting.lose")}</label>` : ""}
    <fieldset><legend>${t("GLOOM.Lasting.bonus")}</legend>
      <label>${t("GLOOM.Lasting.who")} <select name="who">${(["self", "allies", "selfAndAllies", "enemies"] as BonusWho[]).map((w) =>
        `<option value="${w}"${(bonus?.who ?? "self") === w ? " selected" : ""}>${t(`GLOOM.Lasting.whoOptions.${w}`)}</option>`).join("")}</select></label>
      <label>${t("GLOOM.Lasting.attack")} <input type="number" name="attack" step="1" value="${bonus?.attack ?? 0}"></label>
      <label>Pierce <input type="number" name="pierce" min="0" step="1" value="${bonus?.pierce ?? 0}"></label>
      <label>Push <input type="number" name="push" min="0" step="1" value="${bonus?.push ?? 0}"></label>
      <label>Pull <input type="number" name="pull" min="0" step="1" value="${bonus?.pull ?? 0}"></label>
      <label>${t("GLOOM.Lasting.conditions")} <input type="text" name="conditions" value="${escape((bonus?.conditions ?? []).join(", "))}" placeholder="poison, wound"></label>
      <label class="checkbox"><input type="checkbox" name="advantage"${bonus?.advantage ? " checked" : ""}> ${t("GLOOM.Mode.advantage")}</label>
    </fieldset>
  </div>`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: f("GLOOM.Lasting.title", { name: item?.name ?? "" }), icon: "fa-solid fa-hourglass-half" }, content, rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return;
  const count = (k: string) => (form[k] === "" || form[k] === null || form[k] === undefined ? null : Math.max(0, Math.floor(Number(form[k]) || 0)));
  const flags: LastingFlags = {
    kind: form["kind"] === "round" ? "round" : "persistent",
    uses: count("uses"), rounds: count("rounds"), lose: !!form["lose"],
    text: plain(text), item: item?.id ?? "", startRound: game.combat?.started ? game.combat.round : 0,
    bonus: bonusFromForm(form),
  };
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: item?.name ?? t("GLOOM.Lasting.effect"), img: item?.img ?? "icons/svg/aura.svg",
    description: flags.text,
    flags: { [SYSTEM_ID]: { lasting: flags } },
  }] as never);
  // The Skill stays in play, unavailable, until the effect ends.
  if (item && (item.system as unknown as { state?: string }).state !== undefined) await item.update({ "system.state": "active" } as never);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-lasting"><i class="fa-solid fa-hourglass-half"></i> ${f("GLOOM.Lasting.started", { name: escape(actor.name ?? ""), effect: escape(item?.name ?? flags.text) })} <span class="tag">${describe(flags)}</span></p>`,
  } as never);
}

function bonusFromForm(form: Record<string, unknown>): LastingBonus | null {
  const n = (k: string) => Math.floor(Number(form[k]) || 0);
  const b: LastingBonus = {
    attack: n("attack"), pierce: Math.max(0, n("pierce")), push: Math.max(0, n("push")), pull: Math.max(0, n("pull")),
    advantage: !!form["advantage"],
    conditions: String(form["conditions"] ?? "").split(/[,;]/).map((c) => c.trim().toLowerCase()).filter(Boolean),
    who: (["self", "allies", "selfAndAllies", "enemies"].includes(String(form["who"])) ? String(form["who"]) : "self") as BonusWho,
  };
  return b.attack || b.pierce || b.push || b.pull || b.advantage || b.conditions.length ? b : null;
}

/** Short text for a bonus: "+1 attack, Pierce 2, advantage, Poison". */
export function bonusSummary(b: LastingBonus): string {
  return [
    b.attack ? `${b.attack > 0 ? "+" : ""}${b.attack} ${t("GLOOM.Act.attackWord")}` : "",
    b.pierce ? f("GLOOM.Act.pierce", { n: String(b.pierce) }) : "", b.push ? f("GLOOM.Act.push", { n: String(b.push) }) : "", b.pull ? f("GLOOM.Act.pull", { n: String(b.pull) }) : "",
    b.advantage ? t("GLOOM.Mode.advantage") : "",
    ...b.conditions.map((c) => (game.i18n!.has(`GLOOM.Condition.${c}.name`) ? t(`GLOOM.Condition.${c}.name`) : c)),
  ].filter(Boolean).join(", ");
}

export function describe(l: LastingFlags): string {
  if (l.kind === "round") return [t("GLOOM.Lasting.round"), l.bonus ? bonusSummary(l.bonus) : ""].filter(Boolean).join(" · ");
  const parts = [
    l.bonus ? bonusSummary(l.bonus) : "",
    l.uses !== null ? f("GLOOM.Lasting.usesLeft", { n: String(l.uses) }) : "",
    l.rounds !== null ? f("GLOOM.Lasting.roundsLeft", { n: String(l.rounds) }) : "",
  ].filter(Boolean);
  return parts.join(" · ") || t("GLOOM.Lasting.persistent");
}

/** End a lasting effect: remove it and expend (or lose) its Skill. */
export async function endLasting(actor: Actor.Implementation, effect: ActiveEffect.Implementation): Promise<void> {
  const l = lastingOf(effect);
  await effect.delete();
  const item = l?.item ? actor.items.get(l.item) : null;
  if (item && (item.system as unknown as { state: string }).state === "active") {
    await item.update({ "system.state": l!.lose ? "lost" : "expended" } as never);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="hint"><i class="fa-solid fa-hourglass-end"></i> ${f("GLOOM.Lasting.ended", { name: escape(actor.name ?? ""), effect: escape(effect.name ?? "") })}</p>`,
  } as never);
}

/** Use one charge ("the next 2 times..."); ends at 0. */
export async function useLasting(actor: Actor.Implementation, effect: ActiveEffect.Implementation): Promise<void> {
  const l = lastingOf(effect);
  if (!l) return;
  if (l.uses === null) return endLasting(actor, effect);
  const uses = l.uses - 1;
  if (uses <= 0) return endLasting(actor, effect);
  await effect.update({ [`flags.${SYSTEM_ID}.lasting.uses`]: uses } as never);
}

/** End of round (active GM): round effects and finished multi-round effects end. */
export async function expireLasting(actor: Actor.Implementation, round: number): Promise<void> {
  for (const effect of lastingEffects(actor)) {
    const l = lastingOf(effect)!;
    if (endsAtRoundEnd(l, l.startRound, round)) await endLasting(actor, effect);
    else if (l.kind === "persistent" && l.rounds !== null && round >= l.startRound) {
      // Count down: same end round, shown as rounds left.
      await effect.update({ [`flags.${SYSTEM_ID}.lasting.startRound`]: round, [`flags.${SYSTEM_ID}.lasting.rounds`]: Math.max(0, l.startRound + l.rounds - round) } as never);
    }
  }
}

/** End of combat: round and multi-round effects end (uses-based ones stay until used). */
export async function expireLastingAtCombatEnd(actor: Actor.Implementation): Promise<void> {
  for (const effect of lastingEffects(actor)) {
    const l = lastingOf(effect)!;
    if (l.kind === "round" || l.rounds !== null) await endLasting(actor, effect);
  }
}

/** Sheet rows. */
export function lastingRows(actor: Actor.Implementation): { id: string; name: string; img: string; text: string; info: string; counted: boolean }[] {
  return lastingEffects(actor).map((e) => {
    const l = lastingOf(e)!;
    return { id: e.id ?? "", name: e.name ?? "", img: e.img ?? "", text: l.text, info: describe(l), counted: l.uses !== null };
  });
}

// ---------------------------------------------------------------------------
// Attack bonuses

export interface AppliedBonus {
  /** Effect UUID (lasting effects) or region UUID (marked spaces). */
  uuid: string;
  label: string;
  text: string;
  bonus: LastingBonus;
  /** Spend a charge when used. */
  counted: boolean;
}

function relation(attacker: Actor.Implementation, owner: Actor.Implementation): "self" | "ally" | "enemy" | null {
  if (attacker === owner || (attacker.id && attacker.id === owner.id && !attacker.isToken && !owner.isToken)) return "self";
  const a = dispositionOf(attacker);
  const o = dispositionOf(owner);
  if (areOpposed(a, o)) return "enemy";
  return a === o && a !== 0 ? "ally" : null;
}

/** Bonuses from lasting effects and marked spaces that apply to this attacker now. */
export function attackBonuses(attacker: Actor.Implementation | null | undefined): AppliedBonus[] {
  if (!attacker) return [];
  const out: AppliedBonus[] = [];
  const owners = new Set<Actor.Implementation>([attacker]);
  for (const tk of (canvas?.tokens?.placeables ?? []) as Token.Implementation[]) if (tk.actor) owners.add(tk.actor as Actor.Implementation);
  for (const owner of owners) {
    const rel = relation(attacker, owner);
    if (!rel) continue;
    for (const effect of lastingEffects(owner)) {
      const l = lastingOf(effect)!;
      if (!l.bonus || l.bonus.near || !bonusApplies(l.bonus.who, rel)) continue;
      out.push({ uuid: effect.uuid ?? "", label: `${effect.name ?? ""}${owner !== attacker ? ` (${owner.name ?? ""})` : ""}`, text: l.text, bonus: l.bonus, counted: l.uses !== null });
    }
  }
  // Marked spaces with a bonus, while in or next to them (e.g. Enhancement Field).
  const token = attacker.getActiveTokens()[0]?.document as TokenDocument.Implementation | undefined;
  if (token) {
    for (const region of nearbySpaces(token)) {
      const fl = flagsOf(region) as { bonus?: LastingBonus | null; actor?: string };
      const bonus = fl.bonus !== undefined ? fl.bonus : parseLastingBonus(region.name ?? "");
      if (!bonus) continue;
      const owner = fl.actor ? (fromUuidSync(fl.actor) as Actor.Implementation | null) : null;
      const rel = owner ? relation(attacker, owner) : "self";
      if (!rel || !bonusApplies(bonus.who, rel)) continue;
      out.push({ uuid: region.uuid ?? "", label: region.name?.split(":")[0] ?? "", text: region.name ?? "", bonus, counted: false });
    }
  }
  return out;
}

/** Spend a charge of a lasting effect (through the GM when another player owns it). */
export async function spendLasting(effectUuid: string): Promise<void> {
  const effect = fromUuidSync(effectUuid) as ActiveEffect.Implementation | null;
  const actor = effect?.parent as Actor.Implementation | null;
  if (!effect || !actor) return;
  if (actor.isOwner) await useLasting(actor, effect);
  else await runAsGM({ action: "lastingUse", effect: effectUuid });
}
