import { templatePath } from "../config.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class BackgroundSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "item", "background"],
    position: { width: 480, height: 420 },
    window: { resizable: true },
    form: { submitOnChange: true },
  } as never;

  static override PARTS = {
    body: { template: templatePath("item/background.hbs") },
  };

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ItemSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system as unknown as { description: string; expended: boolean; schema: { fields: unknown } };
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    return {
      ...context,
      item,
      system,
      systemFields: system.schema.fields,
      editable: this.isEditable,
      enrichedDescription: await TextEditor.enrichHTML(system.description, { relativeTo: item } as never),
    };
  }
}
