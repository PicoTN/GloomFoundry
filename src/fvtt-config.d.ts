import type { MercenaryModel } from "./module/data/mercenary.ts";
import type { BackgroundModel } from "./module/data/background.ts";
import type { PerkModel } from "./module/data/perk.ts";
import type { ModifierCardModel } from "./module/data/modifier-card.ts";

declare module "fvtt-types/configuration" {
  interface DataModelConfig {
    Actor: { mercenary: typeof MercenaryModel };
    Item: { background: typeof BackgroundModel; perk: typeof PerkModel };
    Card: { modifier: typeof ModifierCardModel };
  }

  interface AssumeHookRan {
    ready: never;
  }

  interface SettingConfig {
    "gloomfoundry.gmDrawPile": string;
    "gloomfoundry.gmDiscardPile": string;
    "gloomfoundry.deckFolder": string;
    "gloomfoundry.cardFace": "gloomhaven" | "playing";
  }
}
