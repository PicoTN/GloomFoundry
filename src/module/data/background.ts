import { backgroundBonus } from "../rules/progression.ts";

const fields = foundry.data.fields;

function defineBackgroundSchema() {
  return {
    /** Occupation, Origin or Social (p. 117). */
    category: new fields.StringField({
      required: true, initial: "occupation", choices: ["occupation", "origin", "social"],
    }),
    /** Master occupations give +2 and require a base occupation (p. 117). */
    master: new fields.BooleanField({ required: true, initial: false }),
    prerequisite: new fields.StringField({ required: true, blank: true, initial: "" }),
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

  /** Bonus when expended for an Attribute test. */
  get testBonus(): number {
    return backgroundBonus(this.master);
  }
}
