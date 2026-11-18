/**
 * Mercenary company rules at the table: gaining temporary benefits (5 per level, up to level 5),
 * choosing a permanent benefit at each new level, and using benefits (Bless, gold, Ward at the
 * next combat, a City Watch ally). Benefit texts come from the user's own content.
 */

import { addTemporary } from "./deck/actions.ts";
import { deckForActor, isActiveGM } from "./deck/registry.ts";
import { placeSummonByName } from "./class-mechanics.ts";
import { BENEFITS_PER_LEVEL, COMPANY_MAX_LEVEL } from "./data/company.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface CompanySystem {
  level: number; progress: number; members: string[]; leader: string; pending: { ward: boolean };
}
interface BenefitSystem { kind: string; level: number; description: string; automation: string; amount: number; used: boolean; reason: string }

const sys = (actor: Actor.Implementation) => actor.system as unknown as CompanySystem;

export function companyMembers(company: Actor.Implementation): Actor.Implementation[] {
  return sys(company).members.map((u) => fromUuidSync(u) as Actor.Implementation | null).filter((a): a is Actor.Implementation => !!a);
}

/** Companies a mercenary belongs to. */
export function companiesOf(actor: Actor.Implementation): Actor.Implementation[] {
  return (game.actors?.filter((a) => a.type === "company" && sys(a as Actor.Implementation).members.includes(actor.uuid ?? "")) ?? []) as Actor.Implementation[];
}

interface BenefitOption { uuid: string; name: string; system: BenefitSystem }

/** Benefit items from the world and Item compendiums. */
async function benefitOptions(kind: "temporary" | "permanent"): Promise<BenefitOption[]> {
  const out: BenefitOption[] = [];
  const add = (doc: Item.Implementation) => {
    const s = doc.system as unknown as BenefitSystem;
    if (s.kind === kind && !out.some((o) => o.name === doc.name)) out.push({ uuid: doc.uuid ?? "", name: doc.name ?? "", system: s });
  };
  for (const item of game.items ?? []) if (item.type === "companyBenefit") add(item as Item.Implementation);
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item" || !pack.visible) continue;
    const index = await pack.getIndex({ fields: ["type"] as never });
    const ids = index.filter((e) => (e as { type?: string }).type === "companyBenefit").map((e) => e._id);
    if (!ids.length) continue;
    for (const doc of (await pack.getDocuments({ _id__in: ids } as never)) as unknown as Item.Implementation[]) add(doc);
  }
  return out.sort((a, b) => a.system.level - b.system.level || a.name.localeCompare(b.name));
}

async function chooseBenefit(title: string, intro: string, options: BenefitOption[], reasons = false, reason = ""): Promise<{ option: BenefitOption; reason: string } | null> {
  if (!options.length) {
    ui.notifications?.warn("GLOOM.Company.noBenefits", { localize: true });
    return null;
  }
  const reasonSelect = reasons
    ? `<label>${t("GLOOM.Company.reason")} <select name="reason">${["mission", "milestone", "retirement"].map((r) => `<option value="${r}"${r === reason ? " selected" : ""}>${t(`GLOOM.Company.reasons.${r}`)}</option>`).join("")}</select></label>`
    : "";
  const content = `<p>${intro}</p>${reasonSelect}<div class="gloom-benefit-choices">${options.map((o, i) => `
    <label class="choice"><input type="radio" name="benefit" value="${i}"${i === 0 ? " checked" : ""}>
      <strong>${escape(o.name)}</strong>${o.system.level ? ` <span class="tag">${f("GLOOM.Company.levelReq", { n: String(o.system.level) })}</span>` : ""}
      <div class="desc">${o.system.description}</div></label>`).join("")}</div>`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title }, content, position: { width: 560 }, rejectClose: false,
  } as never)) as { benefit?: string; reason?: string } | null;
  if (!form || form.benefit === undefined) return null;
  const option = options[Number(form.benefit)];
  return option ? { option, reason: form.reason ?? "" } : null;
}

async function addBenefit(company: Actor.Implementation, option: BenefitOption, reason: string): Promise<void> {
  const source = (await fromUuid(option.uuid)) as Item.Implementation | null;
  const data = (source?.toObject() ?? { name: option.name, type: "companyBenefit", system: option.system }) as Record<string, unknown>;
  delete data["_id"];
  delete data["folder"];
  foundry.utils.mergeObject(data, { system: { used: false, reason }, _stats: { compendiumSource: option.uuid } });
  await company.createEmbeddedDocuments("Item", [data] as never);
}

/** Gain a temporary benefit; the fifth raises the level and grants a permanent benefit (p. 124). */
export async function gainTemporaryBenefit(company: Actor.Implementation, reason = ""): Promise<void> {
  const choice = await chooseBenefit(t("GLOOM.Company.gainTemporary"), t("GLOOM.Company.gainTemporaryHint"), await benefitOptions("temporary"), true, reason);
  if (!choice) return;
  await addBenefit(company, choice.option, choice.reason);
  const s = sys(company);
  let progress = s.progress + 1;
  let level = s.level;
  const leveledUp = progress >= BENEFITS_PER_LEVEL && level < COMPANY_MAX_LEVEL;
  if (leveledUp) { level += 1; progress = 0; }
  if (level >= COMPANY_MAX_LEVEL) progress = Math.min(progress, BENEFITS_PER_LEVEL - 1);
  await company.update({ "system.progress": progress, "system.level": level } as never);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: company as Actor.Stored }),
    content: `<p class="gloom-company"><i class="fa-solid fa-flag"></i> ${f("GLOOM.Company.gained", { name: company.name ?? "", benefit: choice.option.name })}</p>`,
  } as never);
  if (leveledUp) await levelUp(company, level);
}

async function levelUp(company: Actor.Implementation, level: number): Promise<void> {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: company as Actor.Stored }),
    content: `<div class="gloom-company"><h3><i class="fa-solid fa-angles-up"></i> ${f("GLOOM.Company.levelReached", { name: company.name ?? "", level: String(level) })}</h3></div>`,
  } as never);
  const owned = new Set(company.items.filter((i) => i.type === "companyBenefit").map((i) => i.name));
  const options = (await benefitOptions("permanent")).filter((o) => o.system.level <= level && !owned.has(o.name));
  const choice = await chooseBenefit(t("GLOOM.Company.choosePermanent"), f("GLOOM.Company.choosePermanentHint", { level: String(level) }), options);
  if (choice) await addBenefit(company, choice.option, "level");
}

/** Use a benefit: apply what can be automated, then mark temporary ones used. */
export async function useBenefit(company: Actor.Implementation, item: Item.Implementation): Promise<void> {
  const s = item.system as unknown as BenefitSystem;
  const members = companyMembers(company);
  switch (s.automation) {
    case "bless":
      for (const m of members) {
        const deck = deckForActor(m);
        if (deck) await addTemporary(deck, "bless");
      }
      break;
    case "gold":
      for (const m of members) {
        const gold = (m.system as unknown as { gold: number }).gold ?? 0;
        if (m.isOwner) await m.update({ "system.gold": gold + (s.amount || 0) } as never);
      }
      break;
    case "ward":
      await company.update({ "system.pending.ward": true } as never);
      ui.notifications?.info("GLOOM.Company.wardPending", { localize: true });
      break;
    case "ally": {
      if (!members.length) return void ui.notifications?.warn("GLOOM.Company.noMembers", { localize: true });
      const form = (await foundry.applications.api.DialogV2.input({
        window: { title: item.name ?? "" },
        content: `<label>${t("GLOOM.Company.allyType")} <select name="ally">
            <option value="Guard (City Watch)">${t("GLOOM.Company.allyGuard")}</option>
            <option value="Archer (City Watch)">${t("GLOOM.Company.allyArcher")}</option></select></label>
          <label>${t("GLOOM.Company.allyController")} <select name="controller">${members.map((m) => `<option value="${escape(m.uuid ?? "")}">${escape(m.name ?? "")}</option>`).join("")}</select></label>`,
        rejectClose: false,
      } as never)) as { ally?: string; controller?: string } | null;
      if (!form?.ally || !form.controller) return;
      const controller = (await fromUuid(form.controller)) as Actor.Implementation | null;
      if (controller) await placeSummonByName(controller, form.ally);
      break;
    }
  }
  if (s.kind === "temporary") await item.update({ "system.used": true } as never);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: company as Actor.Stored }),
    content: `<p class="gloom-company"><i class="fa-solid fa-star"></i> ${f("GLOOM.Company.used", { benefit: item.name ?? "" })}</p>`,
  } as never);
}

export function registerCompanyHooks(): void {
  // Ward "at the start of the next combat scene" (temporary benefit).
  Hooks.on("combatStart", async (combat) => {
    if (!isActiveGM()) return;
    for (const company of (game.actors?.filter((a) => a.type === "company") ?? []) as Actor.Implementation[]) {
      if (!sys(company).pending.ward) continue;
      const members = new Set(sys(company).members);
      for (const c of (combat as Combat.Implementation).combatants) {
        const actor = c.actor as Actor.Implementation | null;
        if (actor && members.has(actor.uuid ?? "")) await actor.toggleStatusEffect("ward", { active: true });
      }
      await company.update({ "system.pending.ward": false } as never);
    }
  });
  // Companies are shared by the whole group by default.
  Hooks.on("preCreateActor", (actor) => {
    const a = actor as Actor.Implementation;
    if (a.type !== "company" || a.pack) return;
    a.updateSource({ ownership: { default: 3 } } as never);
  });
}

