import type { PerkInput, PerkStep } from "../rules/perks.ts";

const fields = foundry.data.fields;

function cardSpecField() {
  return new fields.SchemaField({
    card: new fields.StringField({ required: true, blank: true, initial: "" }),
    attackKind: new fields.StringField({ required: true, initial: "number", choices: ["number", "critical", "null"] }),
    attackValue: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    attribute: new fields.NumberField({ required: false, nullable: true, integer: true, min: 0, max: 9, initial: null }),
    effect: new fields.StringField({ required: true, blank: true, initial: "" }),
  });
}

function stepField() {
  return new fields.SchemaField({
    /** Codes of cards removed by this step, e.g. "2♥" or "3♦ + 4♦". */
    remove: new fields.StringField({ required: true, blank: true, initial: "" }),
    add: new fields.ArrayField(cardSpecField()),
  });
}

function definePerkSchema() {
  return {
    /** Short reminder of what the perk does, written by the player. */
    description: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** One step per checkbox. */
    steps: new fields.ArrayField(stepField(), { initial: () => [{ remove: "", add: [] }] as never }),
    /** Number of ticked checkboxes (steps applied, in order). */
    taken: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
  };
}

export type PerkSchema = ReturnType<typeof definePerkSchema>;

export class PerkModel extends foundry.abstract.TypeDataModel<PerkSchema, Item.Implementation> {
  static override defineSchema(): PerkSchema {
    return definePerkSchema();
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    this.taken = Math.min(this.taken, this.steps.length);
  }

  toRules(name: string): PerkInput {
    return {
      name,
      taken: this.taken,
      steps: this.steps.map((s) => ({
        remove: s.remove,
        add: s.add.map((a) => ({
          card: a.card,
          attackKind: a.attackKind as PerkStep["add"][number]["attackKind"],
          attackValue: a.attackValue,
          attribute: a.attribute ?? null,
          effect: a.effect,
        })),
      })),
    };
  }
}
