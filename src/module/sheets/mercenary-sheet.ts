import { ATTRIBUTE_LABELS, ATTRIBUTES, templatePath, type AttributeKey } from "../config.ts";
import { cardView } from "../chat/draw-message.ts";
import { clearConditions, conditionLabel, hasCondition, TOGGLE_CONDITIONS } from "../conditions.ts";
import { addTemporary, drawAttack, testAttribute } from "../deck/actions.ts";
import { composeActorDeck, perkItems } from "../deck/compose-actor.ts";
import { rebuildActorDeck } from "../deck/composition.ts";
import { getActorDeck } from "../deck/registry.ts";
import { promptImportItems, promptImportPerks } from "../perks/import.ts";
import {
  expendSkillToHeal, heal, loseSkillToNegate, postItemCard, readySkills, recoverPowers, spendPower,
} from "../powers.ts";
import { EQUIPMENT_SLOTS, SKILL_LOADOUT, slotCapacity, type EquipmentSlot } from "../rules/progression.ts";
import { runAsGM } from "../socket.ts";
import { recordRequest, type FactionStanding } from "../rules/factions.ts";
import { isBlankMercenary, maybeOfferCreation, openCreationWizard } from "../apps/creation.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

type Handler = (this: MercenarySheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;
type AnySystem = Record<string, unknown> & {
  state?: string; prepared?: boolean; level?: number; initiative?: number | null; lostOnUse?: boolean;
  testBonus?: number; equipped?: boolean; slot?: EquipmentSlot; quantity?: number; space?: number;
  uses?: { max: number | null; spent: number }; kind?: string; replaces?: string; source?: string;
  category?: string; master?: boolean; expended?: boolean; consumable?: boolean;
};
const sysOf = (item: Item.Implementation) => item.system as unknown as AnySystem;

/** Types the "+" buttons and the import button of each tab create. */
const IMPORTABLE: Record<string, string[]> = {
  powers: ["talent", "skill"],
  inventory: ["equipment"],
  character: ["background"],
};

/** Character sheet for mercenaries (player characters). */
export class MercenarySheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "actor", "mercenary"],
    position: { width: 780, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      testAttribute: MercenarySheet.#onTestAttribute,
      openCreation: MercenarySheet.#onOpenCreation,
      drawAttack: MercenarySheet.#onDrawAttack,
      addBless: MercenarySheet.#onAddBless,
      addCurse: MercenarySheet.#onAddCurse,
      clearTemporary: MercenarySheet.#onClearTemporary,
      reshuffle: MercenarySheet.#onReshuffle,
      rebuildDeck: MercenarySheet.#onRebuildDeck,
      createDeck: MercenarySheet.#onCreateDeck,
      openDeck: MercenarySheet.#onOpenDeck,
      createItem: MercenarySheet.#onCreateItem,
      importItems: MercenarySheet.#onImportItems,
      createPerk: MercenarySheet.#onCreatePerk,
      importPerks: MercenarySheet.#onImportPerks,
      togglePerkBox: MercenarySheet.#onTogglePerkBox,
      editItem: MercenarySheet.#onEditItem,
      factionRequest: MercenarySheet.#onFactionRequest,
      factionActive: MercenarySheet.#onFactionActive,
      deleteItem: MercenarySheet.#onDeleteItem,
      postItem: MercenarySheet.#onPostItem,
      useItem: MercenarySheet.#onUseItem,
      loseItem: MercenarySheet.#onLoseItem,
      readyItem: MercenarySheet.#onReadyItem,
      healWithSkill: MercenarySheet.#onHealWithSkill,
      negateWithSkill: MercenarySheet.#onNegateWithSkill,
      togglePrepared: MercenarySheet.#onTogglePrepared,
      toggleEquipped: MercenarySheet.#onToggleEquipped,
      toggleExpended: MercenarySheet.#onToggleExpended,
      toggleCondition: MercenarySheet.#onToggleCondition,
      resistCondition: MercenarySheet.#onResistCondition,
      quickBreath: MercenarySheet.#onQuickBreath,
      fullRest: MercenarySheet.#onFullRest,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    header: { template: templatePath("actor/mercenary-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    character: { template: templatePath("actor/tab-character.hbs"), scrollable: [""] },
    powers: { template: templatePath("actor/tab-powers.hbs"), scrollable: [""] },
    inventory: { template: templatePath("actor/tab-inventory.hbs"), scrollable: [""] },
    progression: { template: templatePath("actor/tab-progression.hbs"), scrollable: [""] },
    story: { template: templatePath("actor/tab-story.hbs"), scrollable: [""] },
  };

  static override TABS = {
    primary: {
      tabs: [
        { id: "character", icon: "fa-solid fa-user" },
        { id: "powers", icon: "fa-solid fa-hand-sparkles" },
        { id: "inventory", icon: "fa-solid fa-sack" },
        { id: "progression", icon: "fa-solid fa-arrow-trend-up" },
        { id: "story", icon: "fa-solid fa-book" },
      ],
      initial: "character",
      labelPrefix: "GLOOM.Tab",
    },
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
      level: number;
      attributeMax: number;
      hpFromClass: boolean;
    };
    const deck = this.deck;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const items = actor.items.contents;
    const ofType = (type: string) => items.filter((i) => i.type === type).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    const brief = (i: Item.Implementation) => ({ id: i.id, name: i.name, img: i.img });

    const skillView = (i: Item.Implementation) => {
      const s = sysOf(i);
      return {
      isBlank: isBlankMercenary(actor) && actor.isOwner,
        ...brief(i), level: s.level, initiative: s.initiative, bonus: s.testBonus, state: s.state,
        prepared: s.prepared, lostOnUse: s.lostOnUse, ready: s.state === "ready",
      };
    };
    const skills = ofType("skill");
    const classSkills = skills.filter((s) => sysOf(s).source !== "ancestry");
    const ancestrySkills = skills.filter((s) => sysOf(s).source === "ancestry");
    const preparedCount = (list: Item.Implementation[]) => list.filter((s) => sysOf(s).prepared).length;

    const equipment = ofType("equipment");
    const slots = EQUIPMENT_SLOTS.map((slot) => {
      const inSlot = equipment.filter((e) => (sysOf(e).slot ?? "none") === slot);
      const capacity = slotCapacity(slot, system.level);
      const equipped = inSlot.filter((e) => sysOf(e).equipped).length;
      return {
        slot,
        label: t(`GLOOM.Equipment.slot.${slot}`),
        capacity: Number.isFinite(capacity) ? capacity : null,
        equipped,
        over: Number.isFinite(capacity) && equipped > capacity,
        items: inSlot.map((e) => {
          const s = sysOf(e);
          return {
            ...brief(e), equipped: s.equipped, state: s.state, ready: s.state === "ready", quantity: s.quantity,
            consumable: s.consumable, initiative: s.initiative,
            uses: s.uses?.max ? `${s.uses.max - s.uses.spent}/${s.uses.max}` : null,
          };
        }),
      };
    }).filter((s) => s.items.length || s.slot !== "none");

    const cls = items.find((i) => i.type === "class");
    const ancestry = items.find((i) => i.type === "ancestry");

    return {
      ...context,
      tabs: this._prepareTabs("primary"),
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
        overMax: system.attributes[key] > system.attributeMax,
      })),
      deck: deck
        ? { ...deck.counts(), canDraw: deck.canModify, recent: deck.recentDiscards(6).map((c, i) => cardView(c, i === 0, i > 0)) }
        : null,
      conditions: TOGGLE_CONDITIONS.map((c) => {
        const active = hasCondition(actor, c.id);
        return {
          id: c.id, kind: c.kind, active,
          label: t(conditionLabel(c.id)),
          hint: t(`GLOOM.Condition.${c.id}.hint`),
          img: CONFIG.statusEffects.find((s) => s.id === c.id)?.img ?? "",
          resist: active && c.resist ? t(ATTRIBUTE_LABELS[c.resist].abbr) : null,
        };
      }),
      unconscious: hasCondition(actor, "unconscious"),
      // Powers
      talents: ofType("talent").map((i) => {
        const s = sysOf(i);
        return {
          ...brief(i), level: s.level, initiative: s.initiative, passive: s.kind === "passive", replaces: s.replaces,
          locked: (s.level ?? 1) > system.level,
        };
      }),
      classSkills: classSkills.map(skillView),
      ancestrySkills: ancestrySkills.map(skillView),
      loadout: {
        class: { count: preparedCount(classSkills), max: SKILL_LOADOUT.class, over: preparedCount(classSkills) > SKILL_LOADOUT.class },
        ancestry: { count: preparedCount(ancestrySkills), max: SKILL_LOADOUT.ancestry, over: preparedCount(ancestrySkills) > SKILL_LOADOUT.ancestry },
      },
      // Inventory
      slots,
      // Progression
      classItem: cls ? brief(cls) : null,
      ancestryItem: ancestry ? brief(ancestry) : null,
      perks: perkItems(actor).map((p) => {
        const s = p.system as unknown as { description: string; taken: number; steps: unknown[] };
        return { id: p.id, name: p.name, description: s.description, boxes: s.steps.map((_, i) => ({ index: i, ticked: i < s.taken })) };
      }),
      perksTaken: perkItems(actor).reduce((n, p) => n + (p.system as unknown as { taken: number }).taken, 0),
      perkIssues: composeActorDeck(actor).issues.map((issue) =>
        f(`GLOOM.Perk.issue.${issue.kind}`, { perk: issue.perk, box: String(issue.step), code: issue.code })),
      // Character / story
      backgrounds: ofType("background").map((i) => {
        const s = sysOf(i);
        return { ...brief(i), expended: s.expended, master: s.master, bonus: s.testBonus, category: t(`GLOOM.Background.category.${s.category}`) };
      }),
      factions: await Promise.all(ofType("faction").map(async (i) => {
        const s = i.system as unknown as {
          tier: number; member: boolean; successes: number; failures: number; active: boolean; major: boolean;
          tierKey: string; tierTitle: string; currentBenefits: string; successesNeeded: number | null; failuresLimit: number | null;
        };
        return {
          ...brief(i), tier: s.tier, member: s.member, active: s.active, hostile: s.tier === 0,
          tierLabel: t(`GLOOM.Faction.tier.${s.tierKey}`), title: s.tierTitle,
          progress: s.member && s.successesNeeded !== null
            ? f("GLOOM.Faction.progress", {
              s: String(s.successes), need: String(s.successesNeeded), f: String(s.failures), limit: String(s.failuresLimit ?? "–"),
            })
            : s.member ? "" : t("GLOOM.Faction.nonMember"),
          benefits: s.tier >= 2 ? await TextEditor.enrichHTML(s.currentBenefits, { relativeTo: i } as never) : "",
        };
      })),
      enrichedBiography: await TextEditor.enrichHTML(system.biography, { secrets: actor.isOwner, relativeTo: actor } as never),
    };
  }

  // -------------------------------------------------------------------------
  // Deck & tests
  // -------------------------------------------------------------------------

  protected override async _onFirstRender(
    context: Parameters<foundry.applications.sheets.ActorSheetV2["_onFirstRender"]>[0],
    options: Parameters<foundry.applications.sheets.ActorSheetV2["_onFirstRender"]>[1],
  ): Promise<void> {
    await super._onFirstRender(context, options);
    maybeOfferCreation(this.document);
  }

  static #onOpenCreation(this: MercenarySheet) {
    openCreationWizard(this.document);
  }

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
    if (!this.deck) return;
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

  // -------------------------------------------------------------------------
  // Items
  // -------------------------------------------------------------------------

  static async #onCreateItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const type = target.dataset["type"] ?? "equipment";
    const system: Record<string, unknown> = {};
    if (target.dataset["source"]) system["source"] = target.dataset["source"];
    if (target.dataset["slot"]) system["slot"] = target.dataset["slot"];
    const [item] = await this.document.createEmbeddedDocuments("Item", [
      { name: f("GLOOM.Item.new", { type: t(`TYPES.Item.${type}`) }), type, system },
    ] as never);
    await item?.sheet?.render(true);
  }

  static async #onImportItems(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const types = IMPORTABLE[target.dataset["tab"] ?? ""] ?? [];
    await promptImportItems(this.document, types);
  }

  static async #onCreatePerk(this: MercenarySheet) {
    const [perk] = await this.document.createEmbeddedDocuments("Item", [{ name: t("GLOOM.Perk.new"), type: "perk" }] as never);
    await perk?.sheet?.render(true);
  }

  static async #onImportPerks(this: MercenarySheet) {
    await promptImportPerks(this.document);
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
    await this.#itemFrom(target)?.sheet?.render(true);
  }

  static async #onFactionRequest(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const s = item.system as unknown as FactionStanding;
    const next = recordRequest(
      { tier: s.tier, member: s.member, successes: s.successes, failures: s.failures },
      target.dataset["success"] === "true",
    );
    await item.update({ system: next } as never);
    if (next.tier !== s.tier) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.document as Actor.Stored }),
        content: `<p class="gloom-faction"><i class="fa-solid fa-flag"></i> ${f(next.tier > s.tier ? "GLOOM.Faction.rose" : "GLOOM.Faction.fell", {
          name: this.document.name ?? "", tier: String(next.tier), faction: item.name ?? "",
        })}</p>`,
      } as never);
    }
  }

  /** Only one faction's benefits apply per mission. */
  static async #onFactionActive(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const turnOn = !(item.system as unknown as { active: boolean }).active;
    const updates = this.document.items.filter((i) => i.type === "faction")
      .map((i) => ({ _id: i.id, "system.active": turnOn && i.id === item.id }));
    await this.document.updateEmbeddedDocuments("Item", updates as never);
  }

  static async #onDeleteItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    await this.#itemFrom(target)?.deleteDialog();
  }

  static async #onPostItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await postItemCard(item);
  }

  /** Use a Skill or item: post it to chat, then expend/lose it (or spend a use). */
  static async #onUseItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    await postItemCard(item);
    if (item.type !== "talent") await spendPower(item, "use");
  }

  static async #onLoseItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await spendPower(item, "lose");
  }

  static async #onReadyItem(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await item.update({ "system.state": "ready", "system.uses.spent": 0 } as never);
  }

  static async #onHealWithSkill(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await expendSkillToHeal(item);
  }

  static async #onNegateWithSkill(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await loseSkillToNegate(item);
  }

  static async #onTogglePrepared(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await item.update({ "system.prepared": !sysOf(item).prepared } as never);
  }

  static async #onToggleEquipped(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await item.update({ "system.equipped": !sysOf(item).equipped } as never);
  }

  static async #onToggleExpended(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await item.update({ "system.expended": !sysOf(item).expended } as never);
  }

  // -------------------------------------------------------------------------
  // Conditions & rests
  // -------------------------------------------------------------------------

  static async #onToggleCondition(this: MercenarySheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-condition]")?.dataset["condition"];
    if (id) await this.document.toggleStatusEffect(id);
  }

  /** Resist a condition: test its Attribute, expending a Background as the cost (p. 83). */
  static async #onResistCondition(this: MercenarySheet, event: PointerEvent, target: HTMLElement) {
    event.stopPropagation();
    const id = target.closest<HTMLElement>("[data-condition]")?.dataset["condition"];
    const def = TOGGLE_CONDITIONS.find((c) => c.id === id);
    const deck = this.deck;
    if (def?.resist && deck) await testAttribute(deck, { attribute: def.resist, resist: def.id });
  }

  /**
   * Quick Breath (p. 68): you may first expend your remaining Skills to heal 3 each,
   * then recover all expended powers. Conditions end with the scene.
   */
  static async #onQuickBreath(this: MercenarySheet) {
    const actor = this.document;
    const remaining = readySkills(actor);
    if (remaining.length) {
      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: t("GLOOM.Rest.quickBreath") },
        content: `<p>${f("GLOOM.Rest.quickBreathPrompt", { count: String(remaining.length) })}</p>`,
        buttons: [
          { action: "heal", label: f("GLOOM.Rest.healWithSkills", { amount: String(remaining.length * 3) }), icon: "fa-solid fa-heart", default: true },
          { action: "skip", label: t("GLOOM.Rest.justRecover"), icon: "fa-solid fa-wind" },
        ],
        rejectClose: false,
      } as never);
      if (!choice) return;
      if (choice === "heal") {
        // Each Skill is a separate heal: the first one only removes Poison if poisoned.
        let heals = remaining.length;
        if (hasCondition(actor, "poison")) {
          await heal(actor, 3, t("GLOOM.Rest.quickBreath"));
          heals -= 1;
        }
        if (heals > 0) await heal(actor, heals * 3, t("GLOOM.Rest.quickBreath"));
      }
    }
    await recoverPowers(actor, { lost: false });
    await clearConditions(actor);
    ui.notifications?.info(f("GLOOM.Rest.quickBreathDone", { name: actor.name ?? "" }));
  }

  /** Full Rest (p. 68): full HP, recover everything, remove Bless/Curse, re-pick Skills. */
  static async #onFullRest(this: MercenarySheet) {
    const actor = this.document;
    const hp = (actor.system as unknown as { hp: { max: number } }).hp;
    await actor.update({ "system.hp.value": hp.max } as never);
    await recoverPowers(actor, { lost: true });
    await clearConditions(actor);
    await this.deck?.removeTemporary();
    ui.notifications?.info(f("GLOOM.Rest.fullRestDone", { name: actor.name ?? "" }));
    this.changeTab("powers", "primary");
  }

  #itemFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"];
    return id ? this.document.items.get(id) : undefined;
  }
}
