/**
 * A shop (Core Rulebook p. 268-269): an actor whose embedded equipment items are its stock
 * (`system.quantity` = how many are left). Prosperity sets the highest rarity it normally sells;
 * `markup` is its own price change (remote outposts cost more, big markets less).
 */
const fields = foundry.data.fields;

function defineShopSchema() {
  return {
    prosperity: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 5, initial: 5 }),
    /** District, matched against a company's home district for its discount. */
    district: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** Shops in Gloomhaven get the company's city-wide discounts. */
    inGloomhaven: new fields.BooleanField({ required: true, initial: true }),
    /** Price change in percent (+20 = 20% dearer). */
    markup: new fields.NumberField({ required: true, nullable: false, integer: true, min: -90, max: 500, initial: 0 }),
    /** Items bought from mercenaries go back on display. */
    resell: new fields.BooleanField({ required: true, initial: true }),
    /** Closed shops can't be used by players. */
    open: new fields.BooleanField({ required: true, initial: true }),
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
  };
}
export type ShopSchema = ReturnType<typeof defineShopSchema>;

export class ShopModel extends foundry.abstract.TypeDataModel<ShopSchema, Actor.Implementation> {
  static override defineSchema(): ShopSchema {
    return defineShopSchema();
  }
}
