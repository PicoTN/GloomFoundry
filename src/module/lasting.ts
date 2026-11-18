/**
 * Lasting effects at the table (p. 78): an ActiveEffect on the character carrying the effect's
 * text, uses and rounds. Its Skill (or item) is "active" meanwhile and is expended or lost when
 * the effect ends: out of uses, at the end of the round (round effects), after its rounds, at
 * the end of combat (round-based ones), or by hand.
 */
import { SYSTEM_ID } from "./config.ts";
import { endsAtRoundEnd, parseLasting, type LastingSpec } from "./rules/lasting.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface LastingFlags extends LastingSpec { text: string; item: string; startRound: number }

export const lastingOf = (e: ActiveEffect.Implementation): LastingFlags | null =>
  ((e.flags as Record<string, { lasting?: LastingFlags } | undefined>)[SYSTEM_ID]?.lasting) ?? null;

export function lastingEffects(actor: Actor.Implementation): ActiveEffect.Implementation[] {
  return actor.effects.filter((e) => !!lastingOf(e as ActiveEffect.Implementation)) as ActiveEffect.Implementation[];
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Prompt (pre-filled from the text) and start a lasting effect from an item's action. */
export async function startLasting(actor: Actor.Implementation, item: Item.Implementation | null, text: string): Promise<void> {
  const guess = parseLasting(text) ?? { kind: "persistent", uses: null, rounds: null, lose: false };
  const content = `<div class="gloom-lasting-form">
    <p class="desc">${escape(plain(text))}</p>
    <label>${t("GLOOM.Lasting.kind")} <select name="kind">
      <option value="round"${guess.kind === "round" ? " selected" : ""}>${t("GLOOM.Lasting.round")}</option>
      <option value="persistent"${guess.kind === "persistent" ? " selected" : ""}>${t("GLOOM.Lasting.persistent")}</option></select></label>
    <label>${t("GLOOM.Lasting.uses")} <input type="number" name="uses" min="0" step="1" value="${guess.uses ?? ""}" placeholder="—"></label>
    <label>${t("GLOOM.Lasting.rounds")} <input type="number" name="rounds" min="0" step="1" value="${guess.rounds ?? ""}" placeholder="—"></label>
    ${item ? `<label class="checkbox"><input type="checkbox" name="lose"${guess.lose ? " checked" : ""}> ${t("GLOOM.Lasting.lose")}</label>` : ""}
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

export function describe(l: LastingFlags): string {
  if (l.kind === "round") return t("GLOOM.Lasting.round");
  const parts = [
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
