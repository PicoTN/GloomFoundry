/**
 * Shops at the table (p. 93, 268-269): rolling a shop's stock from the Equipment compendium,
 * buying and selling (the GM applies the transaction, so players need no rights on the shop),
 * company discounts, and the "Mission completed" rewards dialog.
 */
import { SYSTEM_ID } from "./config.ts";
import { collectItems, type Option } from "./apps/creation.ts";
import { companiesOf, companyMembers, gainTemporaryBenefit } from "./company.ts";
import { runAsGM } from "./socket.ts";
import { inventoryOf } from "./equipment.ts";
import { recordRequest, type FactionStanding } from "./rules/factions.ts";
import {
  buyPrice, canBuyAtShops, defaultDisplayCount, goldPerMercenary, highestRarity, levelAllows, MISSION_GOLD, REQUEST_GOLD,
  rollStock, sellPrice, type RewardLine,
} from "./rules/shop.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ShopSystem { prosperity: number; district: string; inGloomhaven: boolean; markup: number; resell: boolean; open: boolean }
interface ItemSystem { cost: number; rarity: string; quantity: number; consumable: boolean; equipped: boolean }
interface BenefitSystem { kind: string; automation: string; amount: number; used: boolean }

const shopSys = (shop: Actor.Implementation) => shop.system as unknown as ShopSystem;
const itemSys = (item: Item.Implementation) => item.system as unknown as ItemSystem;
const goldOf = (actor: Actor.Implementation) => (actor.system as unknown as { gold?: number }).gold ?? 0;
const levelOf = (actor: Actor.Implementation) => (actor.system as unknown as { level?: number }).level ?? 1;
const norm = (s: string) => s.trim().toLowerCase();

export const shopLevelLimit = (): boolean => !!game.settings?.get(SYSTEM_ID, "shopLevelLimit");

// ---------------------------------------------------------------------------
// Discounts

export interface Discount { label: string; percent: number; once?: { company: string; item: string } }

/** Company discounts a buyer gets at this shop (permanent ones always; one-time ones when unused). */
export function discountsFor(buyer: Actor.Implementation, shop: Actor.Implementation): Discount[] {
  const s = shopSys(shop);
  const out: Discount[] = [];
  for (const company of companiesOf(buyer)) {
    const home = norm((company.system as unknown as { district: string }).district ?? "");
    for (const item of company.items.filter((i) => i.type === "companyBenefit")) {
      const b = item.system as unknown as BenefitSystem;
      const percent = b.amount || 10;
      if (b.automation === "discountHome" && home && norm(s.district) === home) out.push({ label: item.name ?? "", percent });
      if (b.automation === "discountCity" && s.inGloomhaven) out.push({ label: item.name ?? "", percent });
      if (b.automation === "discountOnce" && !b.used) out.push({ label: item.name ?? "", percent, once: { company: company.uuid ?? "", item: item.id ?? "" } });
    }
  }
  return out;
}

export interface Quote { price: number; unit: number; allowed: boolean; reason: string; discount: number }

/** Price and availability of a stock item for a buyer. */
export function quote(shop: Actor.Implementation, item: Item.Implementation, buyer: Actor.Implementation | null, quantity = 1, discount = 0): Quote {
  const s = shopSys(shop);
  const i = itemSys(item);
  const input = { cost: i.cost, rarity: i.rarity, prosperity: s.prosperity, markup: s.markup, discount };
  const price = buyPrice({ ...input, quantity });
  const unit = buyPrice(input);
  let reason = "";
  if (!canBuyAtShops(i.rarity)) reason = t("GLOOM.Shop.legendary");
  else if (i.quantity <= 0) reason = t("GLOOM.Shop.soldOut");
  else if (buyer && shopLevelLimit() && !levelAllows(i.rarity, levelOf(buyer))) reason = f("GLOOM.Shop.levelGate", { rarity: t(`GLOOM.Rarity.${i.rarity}`) });
  else if (buyer && goldOf(buyer) < price) reason = t("GLOOM.Shop.notEnoughGold");
  return { price, unit, allowed: !reason, reason, discount };
}

// ---------------------------------------------------------------------------
// Buying and selling (client side: confirm, then ask the GM)

/** Mercenaries this user may buy for (their character first). */
export function buyersFor(user: User.Implementation | null | undefined = game.user): Actor.Implementation[] {
  const all = (game.actors?.filter((a) => a.type === "mercenary" && (user?.isGM || a.testUserPermission(user!, "OWNER"))) ?? []) as Actor.Implementation[];
  const own = user?.character as Actor.Implementation | null | undefined;
  return own ? [own, ...all.filter((a) => a.id !== own.id)] : all;
}

export async function buyFromShop(shop: Actor.Implementation, itemId: string, buyer: Actor.Implementation): Promise<void> {
  const item = shop.items.get(itemId) as Item.Implementation | undefined;
  if (!item) return;
  const discounts = discountsFor(buyer, shop);
  const permanent = discounts.filter((d) => !d.once).reduce((n, d) => n + d.percent, 0);
  const onceOptions = discounts.filter((d) => d.once);
  const check = quote(shop, item, buyer, 1, permanent);
  if (!check.allowed && !(game.user?.isGM && check.reason !== t("GLOOM.Shop.soldOut"))) {
    return void ui.notifications?.warn(check.reason);
  }
  const stock = itemSys(item).quantity;
  const companies = companiesOf(buyer).filter((c) => c.isOwner);
  const inv = inventoryOf(buyer);
  const space = (item.system as unknown as { space?: number }).space ?? 1;
  const overflow = inv.used + space > inv.max;
  const content = `
    <p>${f("GLOOM.Shop.buyPrompt", { buyer: escape(buyer.name ?? ""), item: escape(item.name ?? ""), gold: String(goldOf(buyer)) })}</p>
    ${check.reason ? `<p class="notice">${escape(check.reason)} ${t("GLOOM.Shop.gmOverride")}</p>` : ""}
    <label>${t("GLOOM.Shop.quantity")} <input type="number" name="quantity" value="1" min="1" max="${stock}" step="1"></label>
    ${discounts.filter((d) => !d.once).map((d) => `<p class="hint"><i class="fa-solid fa-tag"></i> ${escape(d.label)} −${d.percent}%</p>`).join("")}
    ${onceOptions.map((d, i) => `<label class="checkbox"><input type="checkbox" name="once${i}"> ${f("GLOOM.Shop.useOnce", { name: escape(d.label), n: String(d.percent) })}</label>`).join("")}
    <p class="hint">${f("GLOOM.Shop.unitPrice", { n: String(check.unit) })}</p>
    ${companies.length ? `<label class="checkbox"><input type="checkbox" name="stash"${overflow ? " checked" : ""}> ${f("GLOOM.Shop.toStash", { company: escape(companies[0]!.name ?? "") })}</label>
      <p class="hint">${f("GLOOM.Shop.space", { used: String(inv.used), max: String(inv.max), item: String(space) })}</p>` : ""}`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: f("GLOOM.Shop.buyTitle", { item: item.name ?? "" }) }, content, rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return;
  const quantity = Math.max(1, Math.min(stock, Math.floor(Number(form["quantity"]) || 1)));
  const used = onceOptions.filter((_, i) => form[`once${i}`]);
  await runAsGM({
    action: "shopBuy", shop: shop.uuid ?? "", item: itemId, buyer: buyer.uuid ?? "", quantity,
    once: used.map((d) => d.once!), user: game.user?.id ?? "",
    stash: form["stash"] ? companies[0]?.uuid ?? "" : "",
  });
}

export async function sellToShop(shop: Actor.Implementation, buyer: Actor.Implementation, itemId: string): Promise<void> {
  const item = buyer.items.get(itemId) as Item.Implementation | undefined;
  if (!item) return;
  const s = itemSys(item);
  let quantity = 1;
  if (s.quantity > 1) {
    const form = (await foundry.applications.api.DialogV2.input({
      window: { title: f("GLOOM.Shop.sellTitle", { item: item.name ?? "" }) },
      content: `<label>${t("GLOOM.Shop.quantity")} <input type="number" name="quantity" value="1" min="1" max="${s.quantity}" step="1"></label>
        <p class="hint">${f("GLOOM.Shop.sellEach", { n: String(s.cost / 2) })}</p>`,
      rejectClose: false,
    } as never)) as { quantity?: number } | null;
    if (!form) return;
    quantity = Math.max(1, Math.min(s.quantity, Math.floor(Number(form.quantity) || 1)));
  } else {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: f("GLOOM.Shop.sellTitle", { item: item.name ?? "" }) },
      content: `<p>${f("GLOOM.Shop.sellPrompt", { item: escape(item.name ?? ""), n: String(sellPrice(s.cost, 1)) })}</p>`,
      rejectClose: false,
    } as never);
    if (!ok) return;
  }
  await runAsGM({ action: "shopSell", shop: shop.uuid ?? "", item: itemId, buyer: buyer.uuid ?? "", quantity, user: game.user?.id ?? "" });
}

// ---------------------------------------------------------------------------
// GM side

function cleanItem(item: Item.Implementation, quantity: number): Record<string, unknown> {
  const data = item.toObject() as Record<string, unknown>;
  delete data["_id"];
  delete data["folder"];
  foundry.utils.mergeObject(data, { system: { quantity, equipped: false, state: "ready", uses: { spent: 0 } } });
  return data;
}

/** Add to an actor's items, stacking consumables (and shop stock) with the same name. */
async function addItem(actor: Actor.Implementation, item: Item.Implementation, quantity: number, stack: boolean): Promise<void> {
  const same = stack ? actor.items.find((i) => i.type === "equipment" && i.name === item.name) : undefined;
  if (same) {
    await same.update({ "system.quantity": itemSys(same as Item.Implementation).quantity + quantity } as never);
    return;
  }
  const data = cleanItem(item, quantity);
  const source = (item._stats as { compendiumSource?: string } | undefined)?.compendiumSource;
  if (source) data["_stats"] = { compendiumSource: source };
  await actor.createEmbeddedDocuments("Item", [data] as never);
}

async function removeQuantity(item: Item.Implementation, quantity: number, deleteWhenEmpty: boolean): Promise<void> {
  const left = itemSys(item).quantity - quantity;
  if (left <= 0 && deleteWhenEmpty) await item.delete();
  else await item.update({ "system.quantity": Math.max(0, left) } as never);
}

export async function handleShopBuy(req: {
  shop: string; item: string; buyer: string; quantity: number; once: { company: string; item: string }[]; user: string; stash?: string;
}): Promise<void> {
  const shop = (await fromUuid(req.shop)) as Actor.Implementation | null;
  const buyer = (await fromUuid(req.buyer)) as Actor.Implementation | null;
  const item = shop?.items.get(req.item) as Item.Implementation | undefined;
  if (!shop || !buyer || !item) return;
  const user = game.users?.get(req.user);
  const byGM = !!user?.isGM;
  if (!byGM && (!shopSys(shop).open || !buyer.testUserPermission(user!, "OWNER"))) return;
  const valid = discountsFor(buyer, shop);
  const once = valid.filter((d) => d.once && req.once.some((o) => o.company === d.once!.company && o.item === d.once!.item));
  const discount = valid.filter((d) => !d.once).reduce((n, d) => n + d.percent, 0) + once.reduce((n, d) => n + d.percent, 0);
  const quantity = Math.max(1, Math.min(itemSys(item).quantity, req.quantity));
  const q = quote(shop, item, buyer, quantity, discount);
  const soldOut = itemSys(item).quantity <= 0;
  if (soldOut || (!q.allowed && !byGM)) {
    ui.notifications?.warn(q.reason || t("GLOOM.Shop.soldOut"));
    return;
  }
  if (goldOf(buyer) < q.price) return void ui.notifications?.warn(t("GLOOM.Shop.notEnoughGold"));
  await buyer.update({ "system.gold": goldOf(buyer) - q.price } as never);
  const stash = req.stash ? (await fromUuid(req.stash)) as Actor.Implementation | null : null;
  const destination = stash?.type === "company" && companiesOf(buyer).includes(stash) ? stash : buyer;
  await addItem(destination, item, quantity, itemSys(item).consumable || destination !== buyer);
  await removeQuantity(item, quantity, false);
  for (const d of once) {
    const company = (await fromUuid(d.once!.company)) as Actor.Implementation | null;
    await company?.items.get(d.once!.item)?.update({ "system.used": true } as never);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: buyer as Actor.Stored }),
    content: `<p class="gloom-shop"><i class="fa-solid fa-coins"></i> ${f("GLOOM.Shop.bought", {
      buyer: escape(buyer.name ?? ""), item: escape(item.name ?? ""), n: String(quantity), gold: String(q.price), shop: escape(shop.name ?? ""),
    })}${discount ? ` <span class="tag">−${discount}%</span>` : ""}</p>`,
  } as never);
}

export async function handleShopSell(req: { shop: string; item: string; buyer: string; quantity: number; user: string }): Promise<void> {
  const shop = (await fromUuid(req.shop)) as Actor.Implementation | null;
  const seller = (await fromUuid(req.buyer)) as Actor.Implementation | null;
  const item = seller?.items.get(req.item) as Item.Implementation | undefined;
  if (!shop || !seller || !item) return;
  const user = game.users?.get(req.user);
  if (!user?.isGM && (!shopSys(shop).open || !seller.testUserPermission(user!, "OWNER"))) return;
  const quantity = Math.max(1, Math.min(itemSys(item).quantity, req.quantity));
  const gold = sellPrice(itemSys(item).cost, quantity);
  if (shopSys(shop).resell) await addItem(shop, item, quantity, true);
  await removeQuantity(item, quantity, true);
  await seller.update({ "system.gold": goldOf(seller) + gold } as never);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: seller as Actor.Stored }),
    content: `<p class="gloom-shop"><i class="fa-solid fa-hand-holding-dollar"></i> ${f("GLOOM.Shop.sold", {
      seller: escape(seller.name ?? ""), item: escape(item.name ?? ""), n: String(quantity), gold: String(gold), shop: escape(shop.name ?? ""),
    })}</p>`,
  } as never);
}

// ---------------------------------------------------------------------------
// Stock

function categoryOf(o: Option): string {
  return String(o.flags["category"] ?? "");
}

/** Roll the stock from the world's and compendiums' equipment (GM). */
export async function restockShop(shop: Actor.Implementation): Promise<void> {
  const s = shopSys(shop);
  const { equipment } = await collectItems(["equipment"] as const);
  const categories = [...new Set(equipment.map(categoryOf).filter(Boolean))].sort();
  const content = `
    <p>${f("GLOOM.Shop.restockHint", { prosperity: String(s.prosperity), rarity: t(`GLOOM.Rarity.${highestRarity(s.prosperity)}`) })}</p>
    <label>${t("GLOOM.Shop.count")} <input type="number" name="count" value="${defaultDisplayCount(s.prosperity)}" min="1" max="60"></label>
    <label class="checkbox"><input type="checkbox" name="replace" checked> ${t("GLOOM.Shop.replace")}</label>
    <label class="checkbox"><input type="checkbox" name="basics"> ${t("GLOOM.Shop.basics")}</label>
    <fieldset><legend>${t("GLOOM.Shop.categories")}</legend>${categories.map((c, i) =>
      `<label class="checkbox"><input type="checkbox" name="cat${i}" checked> ${escape(c)}</label>`).join("")}</fieldset>`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Shop.restock") }, content, rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return;
  const allowed = new Set(categories.filter((_, i) => form[`cat${i}`]));
  const catalog = equipment
    .filter((o) => !categoryOf(o) || allowed.has(categoryOf(o)))
    .map((o) => ({ ...o, rarity: String(o.system["rarity"] ?? "common") }));
  const picked = rollStock(catalog, s.prosperity, Math.floor(Number(form["count"]) || 1));
  // Basic items (rope, rations...) are found almost anywhere (p. 267).
  const basics = form["basics"] ? catalog.filter((o) => categoryOf(o) === "Basic" && o.rarity === "common") : [];
  if (form["replace"]) {
    const ids = shop.items.filter((i) => i.type === "equipment").map((i) => i.id!);
    if (ids.length) await shop.deleteEmbeddedDocuments("Item", ids);
  }
  const have = new Set(shop.items.map((i) => i.name));
  const data: Record<string, unknown>[] = [];
  for (const o of [...picked, ...basics]) {
    if (have.has(o.name)) continue;
    have.add(o.name);
    const doc = (await fromUuid(o.uuid)) as Item.Implementation | null;
    if (!doc) continue;
    const consumable = !!o.system["consumable"];
    const entry = cleanItem(doc, consumable ? 3 : 1);
    entry["_stats"] = { compendiumSource: o.uuid };
    data.push(entry);
  }
  if (data.length) await shop.createEmbeddedDocuments("Item", data as never);
  ui.notifications?.info(f("GLOOM.Shop.restocked", { n: String(data.length) }));
}

// ---------------------------------------------------------------------------
// Mission rewards

interface MissionForm { [key: string]: unknown }

/** Members of the first company that has any, else every player character. */
function defaultParticipants(company: Actor.Implementation | null): Actor.Implementation[] {
  const members = company ? companyMembers(company) : [];
  if (members.length) return members;
  return (game.actors?.filter((a) => a.type === "mercenary" && a.hasPlayerOwner) ?? []) as Actor.Implementation[];
}

function benefitTotal(company: Actor.Implementation | null, automation: string): { amount: number; names: string[] } {
  const items = company?.items.filter((i) => i.type === "companyBenefit" && (i.system as unknown as BenefitSystem).automation === automation) ?? [];
  return {
    amount: items.reduce((n, i) => n + ((i.system as unknown as BenefitSystem).amount || 0), 0),
    names: items.map((i) => i.name ?? ""),
  };
}

/** GM: pay a mission's rewards, record Faction Requests, open level-ups, grant the company benefit. */
export async function missionCompleted(companyArg?: Actor.Implementation | null): Promise<void> {
  if (!game.user?.isGM) return;
  const companies = (game.actors?.filter((a) => a.type === "company") ?? []) as Actor.Implementation[];
  const company = companyArg ?? companies[0] ?? null;
  const people = defaultParticipants(company);
  const all = (game.actors?.filter((a) => a.type === "mercenary") ?? []) as Actor.Implementation[];
  const contracts = benefitTotal(company, "missionGold");
  const recruits = benefitTotal(company, "recruitGold");
  const row = (a: Actor.Implementation) => {
    const factions = a.items.filter((i) => i.type === "faction" && (i.system as unknown as { member: boolean }).member);
    return `<tr>
      <td><label class="checkbox"><input type="checkbox" name="p.${a.id}"${people.includes(a) ? " checked" : ""}> ${escape(a.name ?? "")}</label></td>
      <td>${factions.length ? `<select name="r.${a.id}"><option value="">—</option>${factions.map((i) =>
        `<option value="${i.id}:1">${escape(i.name ?? "")} ✔</option><option value="${i.id}:0">${escape(i.name ?? "")} ✘</option>`).join("")}</select>` : "—"}</td>
      <td><input type="number" name="g.${a.id}" value="0" min="0" step="1"></td></tr>`;
  };
  const content = `<div class="gloom-mission">
    <p class="hint">${t("GLOOM.Mission.hint")}</p>
    <label>${t("GLOOM.Mission.name")} <input type="text" name="name" placeholder="${t("GLOOM.Mission.namePlaceholder")}"></label>
    <label>${f("GLOOM.Mission.gold", { min: String(MISSION_GOLD.min), max: String(MISSION_GOLD.max) })}
      <input type="number" name="gold" value="${MISSION_GOLD.min}" min="0" step="1"></label>
    ${contracts.amount ? `<label>${f("GLOOM.Mission.contracts", { names: escape(contracts.names.join(", ")) })}
      <input type="number" name="contracts" value="${contracts.amount}" min="0" step="1"></label>` : ""}
    ${recruits.amount ? `<label>${f("GLOOM.Mission.recruits", { names: escape(recruits.names.join(", ")) })}
      <input type="number" name="recruits" value="${recruits.amount}" min="0" step="1"></label>` : ""}
    <label>${t("GLOOM.Mission.treasure")} <input type="number" name="treasure" value="0" min="0" step="1"></label>
    <table class="participants"><thead><tr><th>${t("GLOOM.Mission.mercenary")}</th><th>${f("GLOOM.Mission.request", { min: String(REQUEST_GOLD.min), max: String(REQUEST_GOLD.max) })}</th><th>${t("GLOOM.Mission.extra")}</th></tr></thead>
      <tbody>${all.map(row).join("")}</tbody></table>
    <label>${t("GLOOM.Mission.requestGold")} <input type="number" name="requestGold" value="${REQUEST_GOLD.min}" min="0" step="1"></label>
    <label class="checkbox"><input type="checkbox" name="levelUp" checked> ${t("GLOOM.Mission.levelUp")}</label>
    ${company ? `<label class="checkbox"><input type="checkbox" name="benefit" checked> ${f("GLOOM.Mission.benefit", { company: escape(company.name ?? "") })}</label>` : ""}
  </div>`;
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Mission.title"), icon: "fa-solid fa-flag-checkered" }, content, position: { width: 620 }, rejectClose: false,
  } as never)) as MissionForm | null;
  if (!form) return;
  const flat = foundry.utils.flattenObject(form) as Record<string, unknown>;
  const num = (k: string) => Math.max(0, Math.floor(Number(flat[k]) || 0));
  const lines: RewardLine[] = [
    { label: t("GLOOM.Mission.goldLabel"), perMercenary: num("gold") },
    { label: contracts.names.join(", "), perMercenary: num("contracts") },
    { label: recruits.names.join(", "), perMercenary: num("recruits") },
    { label: t("GLOOM.Mission.treasure"), perMercenary: num("treasure") },
  ].filter((l) => l.perMercenary > 0);
  const base = goldPerMercenary(lines);
  const requestGold = num("requestGold");
  const results: string[] = [];
  for (const actor of all.filter((a) => flat[`p.${a.id}`])) {
    let gold = base + num(`g.${actor.id}`);
    const request = String(flat[`r.${actor.id}`] ?? "");
    let requestText = "";
    if (request) {
      const [itemId, ok] = request.split(":");
      const faction = actor.items.get(itemId!);
      if (faction) {
        const s = faction.system as unknown as FactionStanding;
        const success = ok === "1";
        const next = recordRequest({ tier: s.tier, member: s.member, successes: s.successes, failures: s.failures }, success);
        await faction.update({ system: next } as never);
        if (success) gold += requestGold;
        requestText = ` · ${escape(faction.name ?? "")} ${success ? "✔" : "✘"}${next.tier !== s.tier ? ` → ${t("GLOOM.Creation.tier")} ${next.tier}` : ""}`;
      }
    }
    await actor.update({ "system.gold": goldOf(actor) + gold } as never);
    results.push(`<li><strong>${escape(actor.name ?? "")}</strong> +${gold} g${requestText}</li>`);
  }
  if (flat["levelUp"]) {
    await game.settings!.set(SYSTEM_ID, "levelUpEnabled", true);
    void (ui.controls as unknown as { render(o: unknown): unknown } | undefined)?.render({ reset: true });
  }
  if (company) await company.update({ "system.missionsCompleted": ((company.system as unknown as { missionsCompleted?: number }).missionsCompleted ?? 0) + 1 } as never);
  const name = String(flat["name"] ?? "").trim();
  await ChatMessage.create({
    speaker: company ? ChatMessage.getSpeaker({ actor: company as Actor.Stored }) : undefined,
    content: `<div class="gloom-mission-card"><h3><i class="fa-solid fa-flag-checkered"></i> ${name ? escape(name) : t("GLOOM.Mission.title")}</h3>
      ${lines.length ? `<p class="hint">${lines.map((l) => `${escape(l.label)} ${l.perMercenary} g`).join(" · ")}</p>` : ""}
      <ul>${results.join("")}</ul>
      ${flat["levelUp"] ? `<p><i class="fa-solid fa-angles-up"></i> ${t("GLOOM.Mission.levelUpOpen")}</p>` : ""}</div>`,
  } as never);
  if (company && flat["benefit"]) await gainTemporaryBenefit(company, "mission");
}

// ---------------------------------------------------------------------------
// Hooks

export function registerShopHooks(): void {
  game.settings!.register(SYSTEM_ID, "shopLevelLimit", {
    name: "GLOOM.Shop.settingLevelLimit", hint: "GLOOM.Shop.settingLevelLimitHint",
    scope: "world", config: true, type: Boolean, default: true,
  } as never);
  // Players can browse shops (buying goes through the GM).
  Hooks.on("preCreateActor", (actor) => {
    const a = actor as Actor.Implementation;
    if (a.type !== "shop" || a.pack) return;
    a.updateSource({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } } as never);
  });
}
