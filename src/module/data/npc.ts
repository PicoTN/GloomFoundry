/**
 * GM-controlled characters (enemies, allies, summons, townsfolk): actor type "npc",
 * and their actions: item type "npcAction".
 */
import { ATTRIBUTES, SYSTEM_ID, type AttributeKey } from "../config.ts";
import { computeNpcStats, MAX_CL, type NpcCategory, type NpcStats, type StatRow } from "../rules/npc.ts";

const fields = foundry.data.fields;
const int = (initial: number, min = 0, max?: number) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, min, ...(max !== undefined ? { max } : {}), initial });
const text = () => new fields.StringField({ required: true, blank: true, initial: "" });
const attributeChoice = (initial: AttributeKey[]) =>
  new fields.ArrayField(new fields.StringField({ required: true, choices: [...ATTRIBUTES] }), { initial: () => initial as never });

function statRow() {
  return new fields.SchemaField({
    hp: int(1, 0), move: int(2, 0), attack: int(2, 0), other: int(0, 0),
    defense: text(), offense: text(),
  });
}

const defaultRows = () => Array.from({ length: MAX_CL + 1 }, () => ({ hp: 1, move: 2, attack: 2, other: 0, defense: "", offense: "" }));

function defineNpcSchema() {
  return {
    /** "table": bestiary stat block by CL; "manual": simple stats typed in (townsfolk, allies...). */
    mode: new fields.StringField({ required: true, initial: "table", choices: ["table", "manual"] }),
    category: new fields.StringField({ required: true, initial: "normal", choices: ["normal", "elite", "adversary", "nemesis"] }),
    /** Enemy level (= campaign level by default, p. 267). */
    level: int(0, 0, MAX_CL),
    hp: new fields.SchemaField({ value: int(1, 0), max: int(1, 0) }),
    stats: new fields.SchemaField({
      normal: new fields.ArrayField(statRow(), { initial: defaultRows as never }),
      elite: new fields.ArrayField(statRow(), { initial: defaultRows as never }),
    }),
    columns: new fields.SchemaField({
      move: attributeChoice(["intuition", "grit"]),
      attack: attributeChoice(["cunning", "finesse"]),
      other: attributeChoice(["logic", "understanding"]),
    }),
    threat: new fields.SchemaField({ normal: int(2, 0), elite: int(4, 0) }),
    initiative: new fields.SchemaField({ fast: int(20, 1, 100), normal: int(50, 1, 100), slow: int(80, 1, 100) }),
    adversaryBoost: new fields.StringField({ required: true, initial: "attack", choices: ["move", "attack"] }),
    /** Meaning of the DFNS/OFNS markers for this variant, e.g. "■ = Shield 1". */
    markers: new fields.SchemaField({ defense: text(), offense: text() }),
    /** Manual mode stats. */
    manual: new fields.SchemaField({
      move: int(2, 0), attack: int(2, 0),
      attributes: new fields.SchemaField(
        Object.fromEntries(ATTRIBUTES.map((a) => [a, int(0, 0, 9)])) as Record<AttributeKey, ReturnType<typeof int>>,
      ),
      threat: int(0, 0),
    }),
    tactics: int(1, 0, 5),
    stunts: new fields.SchemaField({ value: int(0, 0), max: int(2, 0) }),
    /** Summons: UUID of the controlling mercenary, whose Modifier Deck they use. */
    controller: text(),
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
    tacticsText: new fields.HTMLField({ required: true, blank: true, initial: "" }),
  };
}

export type NpcSchema = ReturnType<typeof defineNpcSchema>;

/** Number of mercenaries present (M): world setting, or the count of player-owned mercenaries. */
export function mercenaryCount(): number {
  const setting = Number(game.settings?.get(SYSTEM_ID, "mercenaryCount") ?? 0);
  if (setting > 0) return setting;
  const owned = game.actors?.filter((a) => a.type === "mercenary" && a.hasPlayerOwner).length ?? 0;
  return Math.max(1, owned);
}

export class NpcModel extends foundry.abstract.TypeDataModel<NpcSchema, Actor.Implementation> {
  static override defineSchema(): NpcSchema {
    return defineNpcSchema();
  }

  /** Current stats, derived from the stat block (or manual values). */
  current: NpcStats = {
    hpMax: 1, move: 0, attack: 0, threat: 0, defense: "", offense: "",
    attributes: { cunning: 0, finesse: 0, grit: 0, intuition: 0, logic: 0, understanding: 0 },
  };

  /** Attributes in the same shape as a mercenary's, for tests and contests. */
  get attributes(): Record<AttributeKey, number> {
    return this.current.attributes;
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    if (this.mode === "manual") {
      this.current = {
        hpMax: this.hp.max, move: this.manual.move, attack: this.manual.attack, threat: this.manual.threat,
        attributes: { ...this.manual.attributes }, defense: "", offense: "",
      };
    } else {
      const nemesisActions = this.parent?.items.filter(
        (i) => i.type === "npcAction" && (i.system as unknown as { nemesisOnly: boolean }).nemesisOnly,
      ).length ?? 0;
      this.current = computeNpcStats({
        category: this.category as NpcCategory,
        level: this.level,
        normal: this.stats.normal as StatRow[],
        elite: this.stats.elite as StatRow[],
        columns: this.columns as { move: AttributeKey[]; attack: AttributeKey[]; other: AttributeKey[] },
        threat: this.threat,
        adversaryBoost: this.adversaryBoost as "move" | "attack",
        mercenaries: game.settings ? mercenaryCount() : 4,
        nemesisActions,
      });
      this.hp.max = this.current.hpMax;
    }
    this.hp.value = Math.min(this.hp.value, this.hp.max);
  }
}

// ---------------------------------------------------------------------------

function defineNpcActionSchema() {
  return {
    /** Initiative speeds at which the action can be taken (F/N/S). */
    speeds: new fields.SchemaField({
      fast: new fields.BooleanField({ required: true, initial: false }),
      normal: new fields.BooleanField({ required: true, initial: true }),
      slow: new fields.BooleanField({ required: true, initial: false }),
    }),
    /** action: regular; break: nemesis Break action (at half HP); stunt: nemesis free Stunt. */
    kind: new fields.StringField({ required: true, initial: "action", choices: ["action", "break", "stunt"] }),
    /** Printed in yellow: elites (and nemeses) only. */
    eliteOnly: new fields.BooleanField({ required: true, initial: false }),
    /** Nemesis-only unique action (adds Threat beyond the first). */
    nemesisOnly: new fields.BooleanField({ required: true, initial: false }),
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
  };
}

export type NpcActionSchema = ReturnType<typeof defineNpcActionSchema>;

export class NpcActionModel extends foundry.abstract.TypeDataModel<NpcActionSchema, Item.Implementation> {
  static override defineSchema(): NpcActionSchema {
    return defineNpcActionSchema();
  }

  /** "F/N", "S"... */
  get speedLabel(): string {
    return (["fast", "normal", "slow"] as const).filter((s) => this.speeds[s]).map((s) => s[0]!.toUpperCase()).join("/");
  }

  /** Can an NPC of this category take this action? */
  availableTo(category: string): boolean {
    if (this.nemesisOnly || this.kind !== "action") return category === "nemesis";
    if (this.eliteOnly) return category === "elite" || category === "nemesis";
    return true;
  }
}
