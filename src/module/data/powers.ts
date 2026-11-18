/**
 * Data models for powers and character options:
 *  - skill:      class/ancestry Skills (expended or lost after use, p. 65)
 *  - talent:     class Talents (never expended; active or passive)
 *  - equipment:  items with a slot, uses and an optional primary action (p. 87)
 *  - class / ancestry: grant items (Talents, Skills, perks) when dropped on a mercenary
 */
import { ATTRIBUTES } from "../config.ts";
import { EQUIPMENT_SLOTS, skillTestBonus } from "../rules/progression.ts";

const fields = foundry.data.fields;

const text = () => new fields.StringField({ required: true, blank: true, initial: "" });
const html = () => new fields.HTMLField({ required: true, blank: true, initial: "" });
/** Structured actions by text field (primary, secondary, effect...): see rules/power-actions.ts. */
const actions = () => new fields.ObjectField({ required: true, initial: () => ({}) as never });
const int = (initial: number, min = 0) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, min, initial });
const optionalInt = (min = 0, max?: number) =>
  new fields.NumberField({ required: false, nullable: true, integer: true, min, ...(max ? { max } : {}), initial: null });

/** Usage state shared by Skills and equipment. */
export const POWER_STATES = ["ready", "expended", "lost"] as const;
export type PowerState = (typeof POWER_STATES)[number];
const state = () => new fields.StringField({ required: true, initial: "ready", choices: [...POWER_STATES] });

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

function defineSkillSchema() {
  return {
    source: new fields.StringField({ required: true, initial: "class", choices: ["class", "ancestry"] }),
    level: int(1, 1),
    /** Initiative (1-100), when the Skill is used in combat. */
    initiative: optionalInt(1, 100),
    /** Attribute test bonus; empty = half the level rounded up. */
    bonusOverride: optionalInt(0, 9),
    flavor: text(),
    primary: html(),
    secondary: html(),
    /** Lost (until a Full Rest) instead of expended (until the end of the scene) after use. */
    lostOnUse: new fields.BooleanField({ required: true, initial: false }),
    /** Chosen for the current loadout (2 ancestry + 4 class, picked at each Full Rest). */
    prepared: new fields.BooleanField({ required: true, initial: false }),
    state: state(),
    actions: actions(),
  };
}
export type SkillSchema = ReturnType<typeof defineSkillSchema>;

export class SkillModel extends foundry.abstract.TypeDataModel<SkillSchema, Item.Implementation> {
  static override defineSchema(): SkillSchema {
    return defineSkillSchema();
  }

  /** Bonus when expended for an Attribute test (p. 70). */
  get testBonus(): number {
    return this.bonusOverride ?? skillTestBonus(this.level);
  }

  get available(): boolean {
    return this.state === "ready";
  }
}

// ---------------------------------------------------------------------------
// Talent
// ---------------------------------------------------------------------------

function defineTalentSchema() {
  return {
    /** Level at which the Talent becomes available (1, 3, 5, 7). */
    level: int(1, 1),
    kind: new fields.StringField({ required: true, initial: "active", choices: ["active", "passive"] }),
    initiative: optionalInt(1, 100),
    primary: html(),
    secondary: html(),
    /** Effect text of a passive Talent. */
    passive: html(),
    /** Name of the Talent this one replaces (upgrades at Level 5). */
    replaces: text(),
    actions: actions(),
  };
}
export type TalentSchema = ReturnType<typeof defineTalentSchema>;

export class TalentModel extends foundry.abstract.TypeDataModel<TalentSchema, Item.Implementation> {
  static override defineSchema(): TalentSchema {
    return defineTalentSchema();
  }
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

function defineEquipmentSchema() {
  return {
    slot: new fields.StringField({ required: true, initial: "none", choices: [...EQUIPMENT_SLOTS] }),
    effect: html(),
    /** Initiative of the item's primary action, if any. */
    initiative: optionalInt(1, 100),
    uses: new fields.SchemaField({
      /** Uses before the item becomes expended; empty = unlimited ("~"). */
      max: optionalInt(1),
      spent: int(0),
      per: new fields.StringField({ required: true, initial: "scene", choices: ["round", "scene", "rest"] }),
    }),
    rarity: new fields.StringField({
      required: true, initial: "common", choices: ["common", "uncommon", "rare", "masterwork", "legendary"],
    }),
    cost: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
    /** Inventory space when carried unequipped (5 available, p. 87). */
    space: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
    /** Hand slots used: 2 for "(2)" items (p. 99). */
    hands: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 2, initial: 1 }),
    /** Extra Small slots while equipped (Cloak of Pockets). */
    smallSlots: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    consumable: new fields.BooleanField({ required: true, initial: false }),
    quantity: int(1),
    equipped: new fields.BooleanField({ required: true, initial: false }),
    lostOnUse: new fields.BooleanField({ required: true, initial: false }),
    state: state(),
    crafting: text(),
    actions: actions(),
  };
}
export type EquipmentSchema = ReturnType<typeof defineEquipmentSchema>;

export class EquipmentModel extends foundry.abstract.TypeDataModel<EquipmentSchema, Item.Implementation> {
  static override defineSchema(): EquipmentSchema {
    return defineEquipmentSchema();
  }
}

// ---------------------------------------------------------------------------
// Class & ancestry
// ---------------------------------------------------------------------------

/** Items granted when the class/ancestry is added to a mercenary (raw Item data). */
const grants = () => new fields.ArrayField(new fields.ObjectField());

function defineClassSchema() {
  return {
    description: html(),
    hpTrack: new fields.StringField({ required: true, initial: "medium", choices: ["low", "medium", "high"] }),
    /** Attribute points granted by the class at creation, e.g. GR +2, IN +1. */
    attributes: new fields.SchemaField(
      Object.fromEntries(ATTRIBUTES.map((a) => [a, int(0)])) as Record<(typeof ATTRIBUTES)[number], ReturnType<typeof int>>,
    ),
    specialMechanics: html(),
    startingGear: text(),
    /** Starting inventory offered at character creation (raw equipment Item data) and gold. */
    startingItems: grants(),
    startingGold: int(0),
    /** Class mechanics (Berserk, Notes, Augments, Doom, Supply, summons...): rules/class-mechanics.ts. */
    mechanics: new fields.ArrayField(new fields.ObjectField()),
    grants: grants(),
  };
}
export type ClassSchema = ReturnType<typeof defineClassSchema>;

export class ClassModel extends foundry.abstract.TypeDataModel<ClassSchema, Item.Implementation> {
  static override defineSchema(): ClassSchema {
    return defineClassSchema();
  }
}

function defineAncestrySchema() {
  return {
    description: html(),
    traditionalClasses: text(),
    grants: grants(),
  };
}
export type AncestrySchema = ReturnType<typeof defineAncestrySchema>;

export class AncestryModel extends foundry.abstract.TypeDataModel<AncestrySchema, Item.Implementation> {
  static override defineSchema(): AncestrySchema {
    return defineAncestrySchema();
  }
}
