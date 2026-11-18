/**
 * The mercenary company (Core Rulebook p. 122-125): an actor holding the group's concept,
 * service, home district, leader, members and relationships, its level (0-5) and its
 * benefits (`companyBenefit` items). Five temporary benefits raise the level by one; each new
 * level grants one permanent benefit.
 */
const fields = foundry.data.fields;
const text = () => new fields.StringField({ required: true, blank: true, initial: "" });
const html = () => new fields.HTMLField({ required: true, blank: true, initial: "" });

export const COMPANY_MAX_LEVEL = 5;
export const BENEFITS_PER_LEVEL = 5;

function defineCompanySchema() {
  return {
    concept: html(),
    service: text(),
    district: text(),
    /** UUID of the leading mercenary. */
    leader: text(),
    closestFaction: text(),
    /** How the company obtains and assigns missions. */
    missions: html(),
    /** UUIDs of the member mercenaries. */
    members: new fields.ArrayField(new fields.StringField({ required: true, blank: false })),
    level: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: COMPANY_MAX_LEVEL, initial: 0 }),
    /** Temporary benefits gained toward the next level (0-4). */
    progress: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: BENEFITS_PER_LEVEL, initial: 0 }),
    /** Missions completed (Mission completed dialog). */
    missionsCompleted: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    relationships: html(),
    notes: html(),
    /** Benefits waiting for a trigger, e.g. Ward at the start of the next combat. */
    pending: new fields.SchemaField({ ward: new fields.BooleanField({ required: true, initial: false }) }),
  };
}
export type CompanySchema = ReturnType<typeof defineCompanySchema>;

export class CompanyModel extends foundry.abstract.TypeDataModel<CompanySchema, Actor.Implementation> {
  static override defineSchema(): CompanySchema {
    return defineCompanySchema();
  }
}

export const BENEFIT_AUTOMATIONS = [
  "", "bless", "gold", "ward", "ally",
  // Shops: home-district and Gloomhaven-wide discounts, a one-time discount (percent in `amount`).
  "discountHome", "discountCity", "discountOnce",
  // Mission rewards: extra gold per mercenary for each mission, recruits' gold between missions.
  "missionGold", "recruitGold",
] as const;

function defineBenefitSchema() {
  return {
    kind: new fields.StringField({ required: true, initial: "temporary", choices: ["temporary", "permanent"] }),
    /** Company level required (permanent benefits). */
    level: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: COMPANY_MAX_LEVEL, initial: 0 }),
    description: html(),
    /** What the system can do when the benefit is used. */
    automation: new fields.StringField({ required: true, blank: true, initial: "", choices: [...BENEFIT_AUTOMATIONS] }),
    amount: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    /** Temporary benefits: already used. */
    used: new fields.BooleanField({ required: true, initial: false }),
    /** Why it was gained: mission, milestone, retirement (temporary benefits). */
    reason: text(),
  };
}
export type BenefitSchema = ReturnType<typeof defineBenefitSchema>;

export class CompanyBenefitModel extends foundry.abstract.TypeDataModel<BenefitSchema, Item.Implementation> {
  static override defineSchema(): BenefitSchema {
    return defineBenefitSchema();
  }
}
