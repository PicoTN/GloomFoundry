const fields = foundry.data.fields;

function defineBackgroundSchema() {
  return {
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
    /** Backgrounds are expended after use (+1 to a test, or resisting a condition) - p. 65. */
    expended: new fields.BooleanField({ required: true, initial: false }),
  };
}

export type BackgroundSchema = ReturnType<typeof defineBackgroundSchema>;

export class BackgroundModel extends foundry.abstract.TypeDataModel<BackgroundSchema, Item.Implementation> {
  static override defineSchema(): BackgroundSchema {
    return defineBackgroundSchema();
  }
}
