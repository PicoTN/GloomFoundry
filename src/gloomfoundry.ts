/**
 * GloomFoundry - Gloomhaven: The Roleplaying Game system for Foundry VTT.
 * Entry point: registers data models, sheets, settings, hooks and the public API.
 */
import "../styles/gloomfoundry.scss";

import { GMDeckApp } from "./module/apps/gm-deck.ts";
import { registerInvisibilityHooks } from "./module/canvas/invisibility.ts";
import { registerConditionHooks } from "./module/condition-hooks.ts";
import { registerStatusEffects } from "./module/conditions.ts";
import { applyIconPack } from "./module/icons.ts";
import { SYSTEM_ID, templatePath } from "./module/config.ts";
import { BackgroundModel } from "./module/data/background.ts";
import { MercenaryModel } from "./module/data/mercenary.ts";
import { NpcActionModel, NpcModel } from "./module/data/npc.ts";
import { PerkModel } from "./module/data/perk.ts";
import { AncestryModel, ClassModel, EquipmentModel, SkillModel, TalentModel } from "./module/data/powers.ts";
import { FactionModel } from "./module/data/faction.ts";
import { ModifierCardModel } from "./module/data/modifier-card.ts";
import { addTemporary, drawAttack, testAttribute } from "./module/deck/actions.ts";
import { registerCombatHooks } from "./module/deck/combat-hooks.ts";
import { registerPerkHooks } from "./module/deck/composition.ts";
import { ModifierDeck } from "./module/deck/modifier-deck.ts";
import { getActorDeck, getGMDeck, registerDeckLifecycleHooks } from "./module/deck/registry.ts";
import * as modifierRules from "./module/rules/modifier.ts";
import * as resolution from "./module/rules/resolution.ts";
import { applyCardFaceStyle, registerSettings, type CardFaceStyle } from "./module/settings.ts";
import { GloomItemSheet, ITEM_SHEET_TYPES } from "./module/sheets/item-sheet.ts";
import { registerPowerHooks } from "./module/powers.ts";
import { openCreationWizard, registerCreationHooks } from "./module/apps/creation.ts";
import { registerLevelUpControls } from "./module/apps/level-up.ts";
import { registerIconEnricher } from "./module/perks/display.ts";
import { registerPowerActionButtons } from "./module/combat/power-actions.ts";
import { registerPlanningSheetHooks } from "./module/sheets/mercenary-sheet.ts";
import { MercenarySheet } from "./module/sheets/mercenary-sheet.ts";
import { PerkSheet } from "./module/sheets/perk-sheet.ts";
import { NpcSheet } from "./module/sheets/npc-sheet.ts";
import { registerNpcHooks } from "./module/npc.ts";
import { registerCombatFlow } from "./module/combat/combat.ts";
import { registerDamageButtons } from "./module/combat/damage.ts";
import { registerTrackerUI } from "./module/combat/tracker.ts";
import { registerSocket } from "./module/socket.ts";

const api = {
  ModifierDeck,
  GMDeckApp,
  rules: { ...modifierRules, ...resolution },
  getActorDeck,
  getGMDeck,
  testAttribute,
  drawAttack,
  addTemporary,
  openGMDeck: () => GMDeckApp.instance.render(true),
};
export type GloomFoundryApi = typeof api;

Hooks.once("init", async () => {
  console.log("GloomFoundry | Initializing");
  (game as unknown as Record<string, unknown>)[SYSTEM_ID] = api;

  Object.assign(CONFIG.Actor.dataModels, { mercenary: MercenaryModel, npc: NpcModel });
  Object.assign(CONFIG.Item.dataModels, {
    background: BackgroundModel,
    perk: PerkModel,
    skill: SkillModel,
    talent: TalentModel,
    equipment: EquipmentModel,
    class: ClassModel,
    faction: FactionModel,
    ancestry: AncestryModel,
    npcAction: NpcActionModel,
  });
  Object.assign(CONFIG.Card.dataModels, { modifier: ModifierCardModel });

  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, MercenarySheet, {
    types: ["mercenary"],
    makeDefault: true,
    label: "GLOOM.Sheet.mercenary",
  } as never);
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NpcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "GLOOM.Sheet.npc",
  } as never);
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GloomItemSheet, {
    types: [...ITEM_SHEET_TYPES],
    makeDefault: true,
    label: "GLOOM.Sheet.item",
  } as never);
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, PerkSheet, {
    types: ["perk"],
    makeDefault: true,
    label: "GLOOM.Sheet.perk",
  } as never);

  registerSettings();
  applyIconPack();
  registerStatusEffects();
  registerConditionHooks();
  registerInvisibilityHooks();
  registerDeckLifecycleHooks();
  registerCombatHooks();
  registerPerkHooks();
  registerPowerHooks();
  registerCreationHooks();
  registerLevelUpControls();
  registerIconEnricher();
  registerPowerActionButtons();
  registerPlanningSheetHooks();
  registerNpcHooks();
  registerCombatFlow();
  registerDamageButtons();
  registerTrackerUI();

  await foundry.applications.handlebars.loadTemplates({
    "gloom.modifier-card": templatePath("parts/modifier-card.hbs"),
    "gloom.deck-counts": templatePath("parts/deck-counts.hbs"),
    "gloom.power-details": templatePath("parts/power-details.hbs"),
    "gloom.npc.stat-table": templatePath("actor/parts/stat-table.hbs"),
    ...Object.fromEntries(
      [...ITEM_SHEET_TYPES, "grants"].map((p) => [`gloom.item.${p}`, templatePath(`item/parts/${p}.hbs`)]),
    ),
  });
});

Hooks.once("ready", () => {
  registerSocket();
  applyCardFaceStyle(game.settings!.get(SYSTEM_ID, "cardFace") as CardFaceStyle);
});

// Re-render sheets/apps showing a deck whenever its cards change.
const refreshDeckViews = foundry.utils.debounce((stack: Cards.Implementation) => {
  const flags = (stack.flags as Record<string, { actor?: string; gm?: boolean } | undefined>)[SYSTEM_ID];
  if (!flags) return;
  if (flags.gm) {
    if (GMDeckApp.instance.rendered) void GMDeckApp.instance.render();
    return;
  }
  if (flags.actor) {
    const actor = fromUuidSync(flags.actor) as Actor.Implementation | null;
    if (actor?.sheet?.rendered) void actor.sheet.render();
  }
}, 50);

for (const hook of ["createCard", "updateCard", "deleteCard"] as const) {
  Hooks.on(hook, (card: Card.Implementation) => {
    if (card.parent) refreshDeckViews(card.parent as Cards.Implementation);
  });
}
Hooks.on("updateCards", (stack) => refreshDeckViews(stack as Cards.Implementation));

// Keep the GM window's Threat tally current.
const refreshGMWindow = foundry.utils.debounce(() => {
  if (GMDeckApp.instance.rendered) void GMDeckApp.instance.render();
}, 200);
for (const hook of ["createToken", "deleteToken", "updateToken", "updateActor", "canvasReady"] as const) {
  Hooks.on(hook, () => refreshGMWindow());
}

// "GM Modifier Deck" button in the Cards sidebar.
Hooks.on("renderCardsDirectory", (_app, html) => {
  if (!game.user?.isGM) return;
  const root = html as HTMLElement;
  if (root.querySelector(".gloom-open-gm-deck")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gloom-open-gm-deck";
  button.innerHTML = `<i class="fa-solid fa-cards"></i> ${game.i18n!.localize("GLOOM.Deck.gmDeck")}`;
  button.addEventListener("click", () => api.openGMDeck());
  (root.querySelector(".header-actions") ?? root.querySelector("header") ?? root).append(button);
});
