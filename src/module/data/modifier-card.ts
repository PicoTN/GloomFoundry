import type { ModifierCardData } from "../rules/modifier.ts";

const fields = foundry.data.fields;

function defineModifierCardSchema() {
  return {
    category: new fields.StringField({
      required: true,
      initial: "base",
      choices: ["base", "perk", "bless", "curse"],
    }),
    attack: new fields.SchemaField({
      kind: new fields.StringField({ required: true, initial: "number", choices: ["number", "critical", "null"] }),
      value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    }),
    attribute: new fields.NumberField({ required: false, nullable: true, integer: true, min: 0, initial: null }),
    effect: new fields.StringField({ required: true, blank: true, initial: "" }),
    playingCard: new fields.SchemaField({
      rank: new fields.StringField({ required: true, initial: "A" }),
      suit: new fields.StringField({ required: true, initial: "hearts" }),
    }),
  };
}

export type ModifierCardSchema = ReturnType<typeof defineModifierCardSchema>;

/** System data for a `Card` of type `modifier`. */
export class ModifierCardModel extends foundry.abstract.TypeDataModel<ModifierCardSchema, Card.Implementation> {
  static override defineSchema(): ModifierCardSchema {
    return defineModifierCardSchema();
  }

  /** Plain rules-engine view of this card. */
  toRules(): ModifierCardData {
    return {
      category: this.category as ModifierCardData["category"],
      attack: { kind: this.attack.kind as ModifierCardData["attack"]["kind"], value: this.attack.value },
      attribute: this.attribute ?? null,
      effect: this.effect,
      playingCard: {
        rank: this.playingCard.rank as ModifierCardData["playingCard"]["rank"],
        suit: this.playingCard.suit as ModifierCardData["playingCard"]["suit"],
      },
    };
  }
}
