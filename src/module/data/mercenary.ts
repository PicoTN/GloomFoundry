import { ATTRIBUTES } from "../config.ts";

const fields = foundry.data.fields;

function attributeField() {
  return new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 7, initial: 0 });
}

function defineMercenarySchema() {
  return {
    attributes: new fields.SchemaField(
      Object.fromEntries(ATTRIBUTES.map((a) => [a, attributeField()])) as Record<
        (typeof ATTRIBUTES)[number],
        ReturnType<typeof attributeField>
      >,
    ),
    hp: new fields.SchemaField({
      value: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 8 }),
      max: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 8 }),
    }),
    level: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
    gold: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    pronouns: new fields.StringField({ required: true, blank: true, initial: "" }),
    ancestry: new fields.StringField({ required: true, blank: true, initial: "" }),
    className: new fields.StringField({ required: true, blank: true, initial: "" }),
    personalGoal: new fields.StringField({ required: true, blank: true, initial: "" }),
    biography: new fields.HTMLField({ required: true, blank: true, initial: "" }),
    deck: new fields.SchemaField({
      /** id of the `Cards` (type deck) holding this mercenary's Modifier Deck. */
      drawPile: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** id of the `Cards` (type pile) used as the discard pile. */
      discardPile: new fields.StringField({ required: true, blank: true, initial: "" }),
    }),
  };
}

export type MercenarySchema = ReturnType<typeof defineMercenarySchema>;

export class MercenaryModel extends foundry.abstract.TypeDataModel<MercenarySchema, Actor.Implementation> {
  static override defineSchema(): MercenarySchema {
    return defineMercenarySchema();
  }

  static override LOCALIZATION_PREFIXES = ["GLOOM.Mercenary"];

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    this.hp.value = Math.min(this.hp.value, this.hp.max);
  }
}
