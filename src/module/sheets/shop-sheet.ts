/**
 * Shop sheet: the stock (buy), the buyer's items (sell) and a description. Players browse with
 * Observer rights; purchases and sales are applied by the GM (shop.ts).
 */
import { templatePath } from "../config.ts";
import { buyFromShop, buyersFor, discountsFor, quote, restockShop, sellToShop, type ShopSystem } from "../shop.ts";
import { rarityMarkup, sellPrice } from "../rules/shop.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);

type Handler = (this: ShopSheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;
interface EquipSys { cost: number; rarity: string; slot: string; quantity: number; consumable: boolean; equipped: boolean; effect: string }

export class ShopSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "actor", "shop"],
    position: { width: 720, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      buy: ShopSheet.#onBuy,
      sell: ShopSheet.#onSell,
      restock: ShopSheet.#onRestock,
      toggleDetails: ShopSheet.#onToggleDetails,
      editItem: ShopSheet.#onEditItem,
      deleteItem: ShopSheet.#onDeleteItem,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    header: { template: templatePath("actor/shop-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stock: { template: templatePath("actor/shop-stock.hbs"), scrollable: [""] },
    sell: { template: templatePath("actor/shop-sell.hbs"), scrollable: [""] },
    description: { template: templatePath("actor/shop-description.hbs"), scrollable: [""] },
  };

  static override TABS = {
    primary: {
      tabs: [
        { id: "stock", icon: "fa-solid fa-store" },
        { id: "sell", icon: "fa-solid fa-hand-holding-dollar" },
        { id: "description", icon: "fa-solid fa-book" },
      ],
      initial: "stock",
      labelPrefix: "GLOOM.Tab",
    },
  };

  #buyerId = "";
  #expanded = new Set<string>();

  get buyer(): Actor.Implementation | null {
    const buyers = buyersFor();
    return buyers.find((a) => a.id === this.#buyerId) ?? buyers[0] ?? null;
  }

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ActorSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system as unknown as ShopSystem & { description: string };
    const isGM = !!game.user?.isGM;
    const buyers = buyersFor();
    const buyer = this.buyer;
    const discounts = buyer ? discountsFor(buyer, actor) : [];
    const permanent = discounts.filter((d) => !d.once).reduce((n, d) => n + d.percent, 0);
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const rarityLabel = (r: string) => t(`GLOOM.Equipment.rarity.${r}`);
    const stock = await Promise.all(actor.items.filter((i) => i.type === "equipment").map(async (item) => {
      const s = item.system as unknown as EquipSys;
      const q = quote(actor, item as Item.Implementation, buyer, 1, permanent);
      const base = quote(actor, item as Item.Implementation, null, 1, 0);
      const soldOut = s.quantity <= 0;
      const expanded = this.#expanded.has(item.id!);
      return {
        id: item.id, name: item.name, img: item.img, rarity: s.rarity, rarityLabel: rarityLabel(s.rarity),
        slotLabel: s.slot && s.slot !== "none" ? t(`GLOOM.Equipment.slot.${s.slot}`) : "",
        consumable: s.consumable, quantity: s.quantity, soldOut,
        markup: rarityMarkup(s.rarity, system.prosperity),
        price: q.price, basePrice: base.price, discounted: q.price < base.price,
        allowed: q.allowed, reason: q.reason,
        canClick: !!buyer && !soldOut && (system.open || isGM) && (q.allowed || isGM),
        expanded,
        effect: expanded ? await TextEditor.enrichHTML(s.effect ?? "", { relativeTo: item } as never) : "",
      };
    }));
    const order = ["common", "uncommon", "rare", "masterwork", "legendary"];
    stock.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity) || (a.name ?? "").localeCompare(b.name ?? ""));
    const sellable = buyer
      ? buyer.items.filter((i) => i.type === "equipment").map((item) => {
        const s = item.system as unknown as EquipSys;
        return {
          id: item.id, name: item.name, img: item.img, rarity: s.rarity, rarityLabel: rarityLabel(s.rarity),
          quantity: s.quantity, equipped: s.equipped, price: sellPrice(s.cost, 1),
        };
      })
      : [];
    return {
      ...context,
      tabs: this._prepareTabs("primary"),
      actor,
      system,
      systemFields: (actor.system as unknown as { schema: { fields: unknown } }).schema.fields,
      isGM,
      prosperityOptions: Object.fromEntries([1, 2, 3, 4, 5].map((p) => [p, `${p} — ${t(`GLOOM.Shop.prosperityLevels.${p}`)}`])),
      buyers,
      buyerId: buyer?.id ?? "",
      buyerOptions: Object.fromEntries(buyers.map((b) => [b.id, b.name])),
      buyerGold: (buyer?.system as unknown as { gold?: number } | undefined)?.gold ?? 0,
      discounts,
      stock,
      sellable,
      enrichedDescription: await TextEditor.enrichHTML(system.description ?? "", { relativeTo: actor } as never),
    };
  }

  override async _onRender(context: never, options: never): Promise<void> {
    await super._onRender(context, options);
    const el = this.element;
    el.querySelector<HTMLSelectElement>("select[data-buyer]")?.addEventListener("change", (ev) => {
      ev.stopPropagation(); // not shop data: don't submit the sheet
      this.#buyerId = (ev.currentTarget as HTMLSelectElement).value;
      void this.render();
    });
    // GM: edit the stock count in place (not part of the actor's form data).
    el.querySelectorAll<HTMLInputElement>("input[data-stock]").forEach((input) => {
      input.addEventListener("change", (ev) => {
        ev.stopPropagation();
        const id = input.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "";
        void this.document.items.get(id)?.update({ "system.quantity": Math.max(0, Math.floor(Number(input.value) || 0)) } as never);
      });
    });
  }

  /** Observers (players) get a read-only form, but must still pick a buyer and buy or sell. */
  protected override _toggleDisabled(disabled: boolean): void {
    super._toggleDisabled(disabled);
    if (!disabled) return;
    this.element.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("[data-player-control]").forEach((el) => {
      if (!el.hasAttribute("data-blocked")) el.disabled = false;
    });
  }

  /** Dropping equipment adds it to the stock (GM). */
  protected override async _onDropItem(event: DragEvent, item: Item.Implementation) {
    if (!game.user?.isGM || item.type !== "equipment") return null as never;
    const same = this.document.items.find((i) => i.type === "equipment" && i.name === item.name);
    if (same) {
      await same.update({ "system.quantity": (same.system as unknown as EquipSys).quantity + 1 } as never);
      return null as never;
    }
    return super._onDropItem(event, item as never);
  }

  #itemId(target: HTMLElement): string {
    return target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "";
  }

  static async #onBuy(this: ShopSheet, _event: PointerEvent, target: HTMLElement) {
    const buyer = this.buyer;
    if (buyer) await buyFromShop(this.document, this.#itemId(target), buyer);
  }

  static async #onSell(this: ShopSheet, _event: PointerEvent, target: HTMLElement) {
    const buyer = this.buyer;
    if (!buyer) return;
    if (!(this.document.system as unknown as ShopSystem).open && !game.user?.isGM) {
      return void ui.notifications?.warn("GLOOM.Shop.closed", { localize: true });
    }
    await sellToShop(this.document, buyer, this.#itemId(target));
  }

  static async #onRestock(this: ShopSheet) {
    await restockShop(this.document);
  }

  static #onToggleDetails(this: ShopSheet, _event: PointerEvent, target: HTMLElement) {
    const id = this.#itemId(target);
    if (this.#expanded.has(id)) this.#expanded.delete(id);
    else this.#expanded.add(id);
    void this.render();
  }

  static async #onEditItem(this: ShopSheet, _event: PointerEvent, target: HTMLElement) {
    await this.document.items.get(this.#itemId(target))?.sheet?.render(true);
  }

  static async #onDeleteItem(this: ShopSheet, _event: PointerEvent, target: HTMLElement) {
    await this.document.items.get(this.#itemId(target))?.delete();
  }
}

/** Shops and the buyer's sheet refresh when gold or items change. */
export function registerShopSheetHooks(): void {
  const rerender = (actor: Actor.Implementation | null | undefined) => {
    if (!actor) return;
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof ShopSheet && app.rendered && (app.document === actor || app.buyer === actor)) void app.render();
    }
  };
  Hooks.on("updateActor", (actor) => rerender(actor as Actor.Implementation));
  for (const hook of ["createItem", "updateItem", "deleteItem"] as const) {
    Hooks.on(hook, ((item: Item.Implementation) => rerender(item.parent as Actor.Implementation | null)) as never);
  }
  // Company benefits change discounts.
  Hooks.on("updateItem", ((item: Item.Implementation) => {
    if (item.type !== "companyBenefit") return;
    for (const app of foundry.applications.instances.values()) if (app instanceof ShopSheet && app.rendered) void app.render();
  }) as never);
}
