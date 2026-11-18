import { ATTRIBUTES } from "../config.ts";
import { attributeMax, maxHp, MAX_LEVEL, type HpTrack } from "../rules/progression.ts";
import { activeStates, type Mechanic } from "../rules/class-mechanics.ts";

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
    level: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: MAX_LEVEL, initial: 1 }),
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
    /** Class mechanics state: counters, slots in play, pool holders, single marks (rules/class-mechanics.ts). */
    classState: new fields.ObjectField({ required: true, initial: () => ({}) as never }),
  };
}

export type MercenarySchema = ReturnType<typeof defineMercenarySchema>;

export class MercenaryModel extends foundry.abstract.TypeDataModel<MercenarySchema, Actor.Implementation> {
  static override defineSchema(): MercenarySchema {
    return defineMercenarySchema();
  }

  static override LOCALIZATION_PREFIXES = ["GLOOM.Mercenary"];

  /** Max HP comes from the class item's health track, when there is one. */
  hpFromClass = false;
  /** Attribute maximum for the current level (2 + half the level, rounded up). */
  attributeMax = 3;
  /** Class mechanics from the Class item, and the derived states active now (e.g. Berserk). */
  mechanics: Mechanic[] = [];
  states: string[] = [];

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    const items = this.parent?.items;
    const cls = items?.find((i) => i.type === "class");
    const ancestry = items?.find((i) => i.type === "ancestry");
    if (cls) {
      this.hpFromClass = true;
      this.hp.max = maxHp((cls.system as unknown as { hpTrack: HpTrack }).hpTrack, this.level);
      this.className = cls.name ?? this.className;
    }
    if (ancestry) this.ancestry = ancestry.name ?? this.ancestry;
    this.attributeMax = attributeMax(this.level);
    this.hp.value = Math.min(this.hp.value, this.hp.max);
    this.mechanics = ((cls?.system as unknown as { mechanics?: Mechanic[] } | undefined)?.mechanics ?? []) as Mechanic[];
    this.states = [...activeStates(this.mechanics, this.hp)];
  }
}
