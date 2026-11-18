/**
 * Faction item (ch. 7): the faction's description and tiers, plus this mercenary's standing.
 * A mercenary holds one faction item per faction they have a reputation with; the others are
 * Neutral (tier 1, not a member).
 */
import { failuresToDrop, MAX_TIER, successesToAdvance, TIER_KEYS } from "../rules/factions.ts";

const fields = foundry.data.fields;
const html = () => new fields.HTMLField({ required: true, blank: true, initial: "" });
const int = (initial: number, min = 0, max?: number) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, min, ...(max !== undefined ? { max } : {}), initial });

function defineFactionSchema() {
  return {
    major: new fields.BooleanField({ required: true, initial: true }),
    description: html(),
    /** Boons: how the faction's benefits work. */
    boons: html(),
    /** One entry per tier 0-5: the faction's title and what that tier grants. */
    tiers: new fields.ArrayField(new fields.SchemaField({
      tier: int(0, 0, MAX_TIER),
      title: new fields.StringField({ required: true, blank: true, initial: "" }),
      benefits: html(),
    })),
    // This mercenary's standing.
    tier: int(1, 0, MAX_TIER),
    member: new fields.BooleanField({ required: true, initial: false }),
    successes: int(0),
    failures: int(0),
    /** The faction whose benefits apply this mission (one per mission, p. 234). */
    active: new fields.BooleanField({ required: true, initial: false }),
  };
}
export type FactionSchema = ReturnType<typeof defineFactionSchema>;

export class FactionModel extends foundry.abstract.TypeDataModel<FactionSchema, Item.Implementation> {
  static override defineSchema(): FactionSchema {
    return defineFactionSchema();
  }

  get tierKey(): string {
    return TIER_KEYS[this.tier] ?? "neutral";
  }

  /** The faction's own title for the current tier, e.g. "Believer". */
  get tierTitle(): string {
    return this.tiers.find((t) => t.tier === this.tier)?.title ?? "";
  }

  get currentBenefits(): string {
    return this.tiers.find((t) => t.tier === this.tier)?.benefits ?? "";
  }

  get successesNeeded(): number | null {
    return successesToAdvance(this);
  }

  get failuresLimit(): number | null {
    return failuresToDrop(this);
  }
}
