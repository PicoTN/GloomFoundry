import { ATTRIBUTE_LABELS, ATTRIBUTES, templatePath, type AttributeKey } from "../config.ts";
import { cardView } from "../chat/draw-message.ts";
import { addTemporary, drawAttack, testAttribute } from "../deck/actions.ts";
import { composeActorDeck, perkItems } from "../deck/compose-actor.ts";
import { rebuildActorDeck } from "../deck/composition.ts";
import { getActorDeck } from "../deck/registry.ts";
import { runAsGM } from "../socket.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);

type Handler = (this: MercenarySheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;

/** Character sheet for mercenaries (player characters). */
export class MercenarySheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "actor", "mercenary"],
    position: { width: 760, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      testAttribute: MercenarySheet.#onTestAttribute,
      drawAttack: MercenarySheet.#onDrawAttack,
      addBless: MercenarySheet.#onAddBless,
      addCurse: MercenarySheet.#onAddCurse,
      clearTemporary: MercenarySheet.#onClearTemporary,
      reshuffle: MercenarySheet.#onReshuffle,
      rebuildDeck: MercenarySheet.#onRebuildDeck,
      createDeck: MercenarySheet.#onCreateDeck,
      openDeck: MercenarySheet.#onOpenDeck,
      createBackground: MercenarySheet.#onCreateBackground,
      createPerk: MercenarySheet.#onCreatePerk,
      togglePerkBox: MercenarySheet.#onTogglePerkBox,
      editItem: MercenarySheet.#onEditItem,
      deleteItem: MercenarySheet.#onDeleteItem,
      toggleExpended: MercenarySheet.#onToggleExpended,
      quickBreath: MercenarySheet.#onQuickBreath,
      fullRest: MercenarySheet.#onFullRest,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    header: { template: templatePath("actor/mercenary-header.hbs") },
    body: { template: templatePath("actor/mercenary-body.hbs"), scrollable: [""] },
  };

  get deck() {
    return getActorDeck(this.document);
  }

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ActorSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system as unknown as {
      attributes: Record<AttributeKey, number>;
      biography: string;
    };
    const deck = this.deck;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    return {
      ...context,
      actor,
      system,
      systemFields: (actor.system as unknown as { schema: { fields: unknown } }).schema.fields,
      editable: this.isEditable,
      isGM: game.user?.isGM ?? false,
      attributes: ATTRIBUTES.map((key) => ({
        key,
        label: t(ATTRIBUTE_LABELS[key].label),
        abbr: t(ATTRIBUTE_LABELS[key].abbr),
        value: system.attributes[key],
      })),
      deck: deck
        ? {
            ...deck.counts(),
            canDraw: deck.canModify,
            recent: deck.recentDiscards(6).map((c, i) => cardView(c, i === 0, i > 0)),
          }
        : null,
      perks: perkItems(actor).map((p) => {
        const sys = p.system as unknown as { description: string; taken: number; steps: unknown[] };
        return {
          id: p.id,
          name: p.name,
          description: sys.description,
          boxes: sys.steps.map((_, i) => ({ index: i, ticked: i < sys.taken })),
        };
      }),
      perkIssues: composeActorDeck(actor).issues.map((issue) =>
        game.i18n!.format(`GLOOM.Perk.issue.${issue.kind}`, {
          perk: issue.perk,
          box: String(issue.step),
          code: issue.code,
        })),
      backgrounds: actor.items
        .filter((i) => i.type === "background")
        .map((i) => ({ id: i.id, name: i.name, img: i.img, expended: (i.system as { expended: boolean }).expended })),
      enrichedBiography: await TextEditor.enrichHTML(system.biography, {
        secrets: actor.isOwner,
        relativeTo: actor,
      } as never),
    };
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  static async #onTestAttribute(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const deck = this.deck;
    const attribute = target.dataset["attribute"] as AttributeKey | undefined;
    if (deck) await testAttribute(deck, attribute ? { attribute } : {});
  }

  static async #onDrawAttack(this: MercenarySheet) {
    const deck = this.deck;
    if (deck) await drawAttack(deck);
  }

  static async #onAddBless(this: MercenarySheet) {
    const deck = this.deck;
    if (deck) await addTemporary(deck, "bless");
  }

  static async #onAddCurse(this: MercenarySheet) {
    const deck = this.deck;
    if (deck) await addTemporary(deck, "curse");
  }

  static async #onClearTemporary(this: MercenarySheet) {
    await this.deck?.removeTemporary();
  }

  static async #onReshuffle(this: MercenarySheet) {
    await this.deck?.reshuffle();
  }

  static async #onRebuildDeck(this: MercenarySheet) {
    const deck = this.deck;
    if (!deck) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("GLOOM.Deck.rebuild") },
      content: `<p>${t("GLOOM.Deck.rebuildConfirm")}</p>`,
    } as never);
    if (ok) await rebuildActorDeck(this.document);
  }

  static async #onCreateDeck(this: MercenarySheet) {
    await runAsGM({ action: "ensureDecks", actor: this.document.uuid ?? "" });
  }

  static async #onOpenDeck(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const deck = this.deck;
    if (!deck) return;
    const doc = target.dataset["pile"] === "discard" ? deck.discardPile : deck.drawPile;
    await doc.sheet?.render(true);
  }

  static async #onCreateBackground(this: MercenarySheet) {
    await this.document.createEmbeddedDocuments("Item", [
      { name: t("GLOOM.Background.new"), type: "background" },
    ] as never);
  }

  static async #onCreatePerk(this: MercenarySheet) {
    const [perk] = await this.document.createEmbeddedDocuments("Item", [
      { name: t("GLOOM.Perk.new"), type: "perk" },
    ] as never);
    await perk?.sheet?.render(true);
  }

  /** Clicking box N ticks boxes 1..N; clicking the last ticked box unticks it. */
  static async #onTogglePerkBox(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const index = Number(target.dataset["index"]);
    const taken = (item.system as unknown as { taken: number }).taken;
    await item.update({ "system.taken": taken === index + 1 ? index : index + 1 } as never);
  }

  static async #onEditItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    await item?.sheet?.render(true);
  }

  static async #onDeleteItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    await this.#itemFrom(target)?.deleteDialog();
  }

  static async #onToggleExpended(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const expended = (item.system as { expended: boolean }).expended;
    await item.update({ "system.expended": !expended } as never);
  }

  /** Quick Breath (p. 68): recover expended powers. Backgrounds are refreshed too. */
  static async #onQuickBreath(this: MercenarySheet) {
    await this.#refreshBackgrounds();
    ui.notifications?.info(game.i18n!.format("GLOOM.Rest.quickBreathDone", { name: this.document.name ?? "" }));
  }

  /** Full Rest (p. 68): full HP, recover everything, remove Bless/Curse. */
  static async #onFullRest(this: MercenarySheet) {
    const hp = (this.document.system as unknown as { hp: { max: number } }).hp;
    await this.document.update({ "system.hp.value": hp.max } as never);
    await this.#refreshBackgrounds();
    await this.deck?.removeTemporary();
    ui.notifications?.info(game.i18n!.format("GLOOM.Rest.fullRestDone", { name: this.document.name ?? "" }));
  }

  async #refreshBackgrounds() {
    const updates = this.document.items
      .filter((i) => i.type === "background" && (i.system as { expended: boolean }).expended)
      .map((i) => ({ _id: i.id, "system.expended": false }));
    if (updates.length) await this.document.updateEmbeddedDocuments("Item", updates as never);
  }

  #itemFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"];
    return id ? this.document.items.get(id) : undefined;
  }
}
