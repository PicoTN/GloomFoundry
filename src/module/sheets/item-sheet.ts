/**
 * Shared sheet for Skills, Talents, equipment, Backgrounds, classes and ancestries.
 * Each type has its own body partial ("gloom.item.<type>").
 */
import { ATTRIBUTE_LABELS, ATTRIBUTES, templatePath } from "../config.ts";
import { promptItemFile } from "../perks/import.ts";
import { EQUIPMENT_SLOTS } from "../rules/progression.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);

export const ITEM_SHEET_TYPES = ["skill", "talent", "equipment", "background", "class", "ancestry"] as const;

const choices = (keys: readonly string[], prefix: string) => keys.map((k) => ({ key: k, label: t(`${prefix}.${k}`) }));

type Handler = (this: GloomItemSheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;

export class GloomItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "item"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      removeGrant: GloomItemSheet.#onRemoveGrant,
      importGrants: GloomItemSheet.#onImportGrants,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    body: { template: templatePath("item/item-sheet.hbs"), scrollable: [""] },
  };

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ItemSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system as unknown as Record<string, unknown> & { schema: { fields: Record<string, unknown> } };
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const enriched: Record<string, string> = {};
    for (const key of ["primary", "secondary", "passive", "effect", "description", "specialMechanics"]) {
      const value = system[key];
      if (typeof value === "string") {
        enriched[key] = await TextEditor.enrichHTML(value, { relativeTo: item, secrets: item.isOwner } as never);
      }
    }
    const grants = (system["grants"] as Record<string, unknown>[] | undefined) ?? [];
    return {
      ...context,
      item,
      system,
      systemFields: system.schema.fields,
      enriched,
      editable: this.isEditable,
      bodyPartial: `gloom.item.${item.type}`,
      typeLabel: t(`TYPES.Item.${item.type}`),
      testBonus: (system as { testBonus?: number }).testBonus,
      options: {
        source: choices(["class", "ancestry"], "GLOOM.Skill.source"),
        state: choices(["ready", "expended", "lost"], "GLOOM.Power.state"),
        talentKind: choices(["active", "passive"], "GLOOM.Talent.kind"),
        slot: choices(EQUIPMENT_SLOTS, "GLOOM.Equipment.slot"),
        rarity: choices(["common", "uncommon", "rare", "masterwork", "legendary"], "GLOOM.Equipment.rarity"),
        per: choices(["scene", "rest"], "GLOOM.Equipment.per"),
        category: choices(["occupation", "origin", "social"], "GLOOM.Background.category"),
        hpTrack: choices(["low", "medium", "high"], "GLOOM.Class.hpTrack"),
      },
      attributes: ATTRIBUTES.map((a) => ({
        key: a,
        abbr: t(ATTRIBUTE_LABELS[a].abbr),
        value: (system["attributes"] as Record<string, number> | undefined)?.[a] ?? 0,
      })),
      grants: grants.map((g, index) => ({
        index,
        name: String(g["name"] ?? "?"),
        type: String(g["type"] ?? ""),
        typeLabel: t(`TYPES.Item.${String(g["type"] ?? "")}`),
        img: String(g["img"] ?? "icons/svg/item-bag.svg"),
      })),
    };
  }

  /** Classes and ancestries accept dropped Items as grants. */
  protected override async _onRender(
    context: Parameters<foundry.applications.sheets.ItemSheetV2["_onRender"]>[0],
    options: Parameters<foundry.applications.sheets.ItemSheetV2["_onRender"]>[1],
  ): Promise<void> {
    await super._onRender(context, options);
    const zone = this.element.querySelector<HTMLElement>(".grants-drop");
    if (!zone || !this.isEditable) return;
    zone.addEventListener("dragover", (event) => event.preventDefault());
    zone.addEventListener("drop", (event) => void this.#onDropGrant(event));
  }

  async #onDropGrant(event: DragEvent): Promise<void> {
    event.preventDefault();
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const data = TextEditor.getDragEventData(event) as { type?: string; uuid?: string };
    if (data.type !== "Item" || !data.uuid) return;
    const dropped = (await fromUuid(data.uuid)) as Item.Implementation | null;
    if (!dropped || dropped.type === "class" || dropped.type === "ancestry") return;
    const { _id, ...itemData } = dropped.toObject() as Record<string, unknown>;
    await this.#addGrants([itemData]);
  }

  async #addGrants(entries: Record<string, unknown>[]) {
    const current = foundry.utils.deepClone((this.document._source.system as unknown as { grants: unknown[] }).grants);
    await this.document.update({ "system.grants": [...current, ...entries] } as never);
  }

  static async #onRemoveGrant(this: GloomItemSheet, _event: PointerEvent, target: HTMLElement) {
    const index = Number(target.closest<HTMLElement>("[data-index]")?.dataset["index"]);
    const current = foundry.utils.deepClone((this.document._source.system as unknown as { grants: unknown[] }).grants);
    current.splice(index, 1);
    await this.document.update({ "system.grants": current } as never);
  }

  /** Add grants from a JSON file, e.g. a class's perk file. */
  static async #onImportGrants(this: GloomItemSheet) {
    const entries = await promptItemFile(t("GLOOM.Grants.importTitle"), t("GLOOM.Grants.importHint"));
    if (!entries) return;
    const usable = entries
      .filter((e) => e.type !== "class" && e.type !== "ancestry")
      .map(({ _id, ...rest }) => rest);
    await this.#addGrants(usable);
    ui.notifications?.info(game.i18n!.format("GLOOM.Grants.imported", { count: String(usable.length) }));
  }
}
