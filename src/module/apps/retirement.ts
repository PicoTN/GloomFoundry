/**
 * Benefits applied right after creating a mercenary (p. 121):
 * - fourth retirement: trade one Level 1 class Skill for a Level 2 class Skill;
 * - extra Perks: the higher-level table's Perks beyond the level-ups', plus the first
 *   retirement's Perk.
 */
import { perkHTML } from "../perks/display.ts";
import type { PerkStep } from "../rules/perks.ts";
import { retirementBenefits } from "../rules/progression.ts";
import { collectItems, itemData } from "./creation.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface SkillSys { level?: number; source?: string }

async function skillTrade(actor: Actor.Implementation): Promise<void> {
  const className = (actor.system as unknown as { className?: string }).className ?? "";
  const mine = actor.items.filter((i) => i.type === "skill" && (i.system as unknown as SkillSys).source !== "ancestry"
    && Number((i.system as unknown as SkillSys).level ?? 1) === 1);
  const { skill } = await collectItems(["skill"] as const);
  const owned = new Set(actor.items.map((i) => i.name));
  const level2 = skill.filter((o) => o.flags["class"] === className && o.system["source"] !== "ancestry"
    && Number(o.system["level"] ?? 1) === 2 && !owned.has(o.name));
  if (!mine.length || !level2.length) return;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Creation.retirement.skillTrade"), icon: "fa-solid fa-right-left" },
    content: `<p>${t("GLOOM.Creation.tradeHint")}</p>
      <label>${t("GLOOM.Creation.tradeGive")} <select name="give">${mine.map((i) => `<option value="${i.id}">${escape(i.name ?? "")}</option>`).join("")}</select></label>
      <label>${t("GLOOM.Creation.tradeTake")} <select name="take">${level2.map((o) => `<option value="${escape(o.uuid)}">${escape(o.name)}</option>`).join("")}</select></label>`,
    rejectClose: false,
  } as never)) as { give?: string; take?: string } | null;
  if (!form?.give || !form.take) return;
  const data = await itemData(form.take);
  if (!data) return;
  await actor.deleteEmbeddedDocuments("Item", [form.give]);
  await actor.createEmbeddedDocuments("Item", [data] as never);
}

async function extraPerks(actor: Actor.Implementation, count: number): Promise<void> {
  const perks = actor.items.filter((i) => i.type === "perk");
  if (!perks.length || count <= 0) return;
  const all = perks.map((p) => p.system as unknown as { steps: PerkStep[] });
  const rows = perks.map((p) => {
    const s = p.system as unknown as { steps: PerkStep[]; taken: number };
    const left = s.steps.length - s.taken;
    return left > 0 ? `<label class="perk-row"><input type="number" name="${p.id}" value="0" min="0" max="${left}" step="1">
      <span class="perk-text">${perkHTML(s.steps, all)}</span> <span class="hint">(${s.taken}/${s.steps.length})</span></label>` : "";
  }).join("");
  for (;;) {
    const form = (await foundry.applications.api.DialogV2.input({
      window: { title: f("GLOOM.Creation.extraPerksTitle", { n: String(count) }), icon: "fa-solid fa-star" },
      content: `<div class="gloom-extra-perks"><p>${f("GLOOM.Creation.extraPerks", { n: String(count) })}</p>${rows}</div>`,
      position: { width: 560 }, rejectClose: false,
    } as never)) as Record<string, unknown> | null;
    if (!form) return;
    const picks = perks.map((p) => ({ p, n: Math.max(0, Math.floor(Number(form[p.id ?? ""]) || 0)) })).filter((x) => x.n > 0);
    const total = picks.reduce((a, x) => a + x.n, 0);
    if (total > count) {
      ui.notifications?.warn(f("GLOOM.Creation.tooManyPerks", { n: String(count) }));
      continue;
    }
    const updates = picks.map(({ p, n }) => {
      const s = p.system as unknown as { steps: PerkStep[]; taken: number };
      return { _id: p.id, "system.taken": Math.min(s.steps.length, s.taken + n) };
    });
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
    return;
  }
}

export async function afterCreationBenefits(actor: Actor.Implementation, opts: { retired: number; extraPerks: number }): Promise<void> {
  if (retirementBenefits(opts.retired).skillTrade) await skillTrade(actor);
  await extraPerks(actor, opts.extraPerks);
}
