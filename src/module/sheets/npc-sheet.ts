import { ATTRIBUTE_LABELS, ATTRIBUTES, templatePath, type AttributeKey } from "../config.ts";
import { conditionLabel, hasCondition, TOGGLE_CONDITIONS } from "../conditions.ts";
import { drawAttack, testAttribute } from "../deck/actions.ts";
import { deckForActor } from "../deck/registry.ts";
import { dispositionOf, switchSide } from "../npc.ts";
import { postItemCard } from "../powers.ts";
import { MAX_CL } from "../rules/npc.ts";
import { DISPOSITION } from "../rules/sides.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);

type Handler = (this: NpcSheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;
type NpcSystem = {
  mode: string; category: string; level: number; hp: { value: number; max: number };
  stats: { normal: Record<string, unknown>[]; elite: Record<string, unknown>[] };
  columns: Record<"move" | "attack" | "other", AttributeKey[]>;
  current: { hpMax: number; move: number; attack: number; threat: number; defense: string; offense: string; attributes: Record<AttributeKey, number> };
  controller: string; description: string; tacticsText: string; tactics: number;
};

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    return Object.entries(value).filter(([k]) => /^\d+$/.test(k)).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v as T);
  }
  return [];
}

export class NpcSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "actor", "npc"],
    position: { width: 720, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      testAttribute: NpcSheet.#onTestAttribute,
      drawAttack: NpcSheet.#onDrawAttack,
      switchSide: NpcSheet.#onSwitchSide,
      createAction: NpcSheet.#onCreateAction,
      postItem: NpcSheet.#onPostItem,
      editItem: NpcSheet.#onEditItem,
      deleteItem: NpcSheet.#onDeleteItem,
      toggleCondition: NpcSheet.#onToggleCondition,
      clearController: NpcSheet.#onClearController,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    header: { template: templatePath("actor/npc-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    overview: { template: templatePath("actor/npc-overview.hbs"), scrollable: [""] },
    statblock: { template: templatePath("actor/npc-statblock.hbs"), scrollable: [""] },
    notes: { template: templatePath("actor/npc-notes.hbs"), scrollable: [""] },
  };

  static override TABS = {
    primary: {
      tabs: [
        { id: "overview", icon: "fa-solid fa-skull" },
        { id: "statblock", icon: "fa-solid fa-table" },
        { id: "notes", icon: "fa-solid fa-book" },
      ],
      initial: "overview",
      labelPrefix: "GLOOM.Tab",
    },
  };

  get system(): NpcSystem {
    return this.document.system as unknown as NpcSystem;
  }

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ActorSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = this.system;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const enrich = (html: string) => TextEditor.enrichHTML(html, { relativeTo: actor, secrets: actor.isOwner } as never);
    const disposition = dispositionOf(actor);
    const deck = deckForActor(actor);
    const controller = system.controller ? (fromUuidSync(system.controller) as Actor.Implementation | null) : null;
    const columnOf = (attr: AttributeKey) =>
      (["move", "attack", "other"] as const).find((c) => system.columns[c].includes(attr)) ?? "other";
    const rows = (key: "normal" | "elite") =>
      Array.from({ length: MAX_CL + 1 }, (_, level) => ({ level, ...(system.stats[key][level] ?? {}), current: level === system.level }));

    return {
      ...context,
      tabs: this._prepareTabs("primary"),
      actor,
      system,
      systemFields: (actor.system as unknown as { schema: { fields: unknown } }).schema.fields,
      editable: this.isEditable,
      table: system.mode === "table",
      side: disposition === DISPOSITION.HOSTILE ? "hostile" : disposition === DISPOSITION.FRIENDLY ? "friendly" : "neutral",
      sideLabel: t(disposition === DISPOSITION.HOSTILE ? "GLOOM.Side.hostile" : disposition === DISPOSITION.FRIENDLY ? "GLOOM.Side.friendly" : "GLOOM.Side.neutral"),
      deckLabel: deck?.label ?? t("GLOOM.Deck.notReady"),
      controllerName: controller?.name ?? "",
      categories: ["normal", "elite", "adversary", "nemesis"].map((c) => ({ key: c, label: t(`GLOOM.Npc.category.${c}`) })),
      modes: ["table", "manual"].map((m) => ({ key: m, label: t(`GLOOM.Npc.mode.${m}`) })),
      boosts: ["move", "attack"].map((b) => ({ key: b, label: t(`GLOOM.Npc.boost.${b}`) })),
      columnChoices: ["move", "attack", "other"].map((c) => ({ key: c, label: t(`GLOOM.Npc.column.${c}`) })),
      levels: Array.from({ length: MAX_CL + 1 }, (_, i) => ({ key: i, label: String(i) })),
      attributes: ATTRIBUTES.map((key) => ({
        key,
        label: t(ATTRIBUTE_LABELS[key].label),
        abbr: t(ATTRIBUTE_LABELS[key].abbr),
        value: system.current.attributes[key],
        manual: (actor.system as unknown as { manual: { attributes: Record<AttributeKey, number> } }).manual.attributes[key],
        column: columnOf(key),
      })),
      normalRows: rows("normal"),
      eliteRows: rows("elite"),
      conditions: TOGGLE_CONDITIONS.map((c) => ({
        id: c.id, kind: c.kind, active: hasCondition(actor, c.id), label: t(conditionLabel(c.id)),
        img: CONFIG.statusEffects.find((s) => s.id === c.id)?.img ?? "",
      })),
      actions: actor.items
        .filter((i) => i.type === "npcAction")
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((i) => {
          const s = i.system as unknown as {
            speedLabel: string; kind: string; eliteOnly: boolean; nemesisOnly: boolean; availableTo(c: string): boolean;
          };
          return {
            id: i.id, name: i.name, img: i.img, speeds: s.speedLabel, kind: s.kind,
            kindLabel: s.kind === "action" ? "" : t(`GLOOM.NpcAction.kind.${s.kind}`),
            elite: s.eliteOnly, nemesis: s.nemesisOnly, available: s.availableTo(system.category),
          };
        }),
      enrichedDescription: await enrich(system.description),
      enrichedTactics: await enrich(system.tacticsText),
    };
  }

  /** Rebuild stat table arrays and the Attribute column mapping from flat form fields. */
  protected override _processFormData(
    event: SubmitEvent | null,
    form: HTMLFormElement,
    formData: Parameters<foundry.applications.sheets.ActorSheetV2["_processFormData"]>[2],
  ) {
    const data = super._processFormData(event, form, formData) as Record<string, unknown> & {
      system?: Record<string, unknown> & { stats?: Record<string, unknown> };
      attrColumn?: Record<AttributeKey, "move" | "attack" | "other">;
    };
    const stats = data.system?.stats;
    if (stats) {
      for (const key of ["normal", "elite"] as const) {
        if (key in stats) stats[key] = toArray(stats[key]);
      }
    }
    if (data.attrColumn) {
      const columns: Record<string, AttributeKey[]> = { move: [], attack: [], other: [] };
      for (const attr of ATTRIBUTES) columns[data.attrColumn[attr] ?? "other"]!.push(attr);
      data.system = { ...(data.system ?? {}), columns };
      delete data.attrColumn;
    }
    return data as never;
  }

  /** Drop a mercenary on the sheet to make this NPC their summon (it then uses their deck). */
  protected override async _onDropActor(event: DragEvent, actor: Actor.Implementation) {
    if (!this.isEditable || actor.type !== "mercenary") return super._onDropActor(event, actor as never);
    await this.document.update({ "system.controller": actor.uuid } as never);
    return null as never;
  }

  // -------------------------------------------------------------------------

  static async #onTestAttribute(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const deck = deckForActor(this.document);
    if (!deck) return void ui.notifications?.warn("GLOOM.Deck.notReady", { localize: true });
    const attribute = target.dataset["attribute"] as AttributeKey | undefined;
    await testAttribute(deck, { actor: this.document, ...(attribute ? { attribute } : {}) });
  }

  static async #onDrawAttack(this: NpcSheet) {
    const deck = deckForActor(this.document);
    if (!deck) return void ui.notifications?.warn("GLOOM.Deck.notReady", { localize: true });
    await drawAttack(deck, { actor: this.document, base: this.system.current.attack });
  }

  static async #onSwitchSide(this: NpcSheet) {
    await switchSide(this.document);
    await this.render();
  }

  static async #onCreateAction(this: NpcSheet) {
    const [item] = await this.document.createEmbeddedDocuments("Item", [
      { name: t("GLOOM.NpcAction.new"), type: "npcAction" },
    ] as never);
    await item?.sheet?.render(true);
  }

  static async #onPostItem(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await postItemCard(item);
  }

  static async #onEditItem(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    await this.#itemFrom(target)?.sheet?.render(true);
  }

  static async #onDeleteItem(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    await this.#itemFrom(target)?.deleteDialog();
  }

  static async #onToggleCondition(this: NpcSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-condition]")?.dataset["condition"];
    if (id) await this.document.toggleStatusEffect(id);
  }

  static async #onClearController(this: NpcSheet) {
    await this.document.update({ "system.controller": "" } as never);
  }

  #itemFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"];
    return id ? this.document.items.get(id) : undefined;
  }
}
