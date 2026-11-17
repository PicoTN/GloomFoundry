/**
 * Small window giving the GM access to the shared GM Modifier Deck
 * (used by every GM-controlled character, p. 63).
 */
import { templatePath } from "../config.ts";
import { cardView } from "../chat/draw-message.ts";
import { addTemporary, drawAttack, testAttribute } from "../deck/actions.ts";
import { ensureGMDeck, getGMDeck } from "../deck/registry.ts";
import { currentCampaignLevel, mercenaryCount, sceneThreat } from "../npc.ts";
import { COMBAT_CHALLENGE, DIFFICULTIES, threatDifficulty, threatMaximum, type Difficulty } from "../rules/npc.ts";
import { SYSTEM_ID } from "../config.ts";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);

export class GMDeckApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance: GMDeckApp | null = null;

  static get instance(): GMDeckApp {
    return (GMDeckApp.#instance ??= new GMDeckApp());
  }

  static override DEFAULT_OPTIONS = {
    id: "gloomfoundry-gm-deck",
    classes: ["gloomfoundry", "gm-deck"],
    position: { width: 420, height: "auto" },
    window: { title: "GLOOM.Deck.gmDeck", icon: "fa-solid fa-cards", resizable: false },
    actions: {
      test: GMDeckApp.#onTest,
      attack: GMDeckApp.#onAttack,
      addBless: GMDeckApp.#onAddBless,
      addCurse: GMDeckApp.#onAddCurse,
      clearTemporary: GMDeckApp.#onClear,
      reshuffle: GMDeckApp.#onReshuffle,
      rebuild: GMDeckApp.#onRebuild,
      refresh: GMDeckApp.#onRefresh,
    },
  } as never;

  static override PARTS = {
    body: { template: templatePath("apps/gm-deck.hbs") },
  };

  override async _prepareContext(options: Parameters<foundry.applications.api.ApplicationV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const deck = getGMDeck();
    const m = mercenaryCount();
    const cl = currentCampaignLevel();
    const difficulty = game.settings!.get(SYSTEM_ID, "difficulty") as Difficulty;
    const threat = sceneThreat();
    const fits = threatDifficulty(threat.total, m);
    return {
      ...context,
      party: {
        mercenaries: m,
        cl,
        challenge: COMBAT_CHALLENGE[cl],
      },
      threat: {
        ...threat,
        max: threatMaximum(difficulty, m),
        over: threat.total > threatMaximum(difficulty, m),
        fitsLabel: t(`GLOOM.Threat.difficulty.${fits}`),
        difficulties: DIFFICULTIES.map((d) => ({
          key: d, label: `${t(`GLOOM.Threat.difficulty.${d}`)} (${threatMaximum(d, m)})`, selected: d === difficulty,
        })),
      },
      deck: deck
        ? { ...deck.counts(), recent: deck.recentDiscards(6).map((c, i) => cardView(c, i === 0, i > 0)) }
        : null,
    };
  }

  protected override async _onRender(
    context: Parameters<foundry.applications.api.ApplicationV2["_onRender"]>[0],
    options: Parameters<foundry.applications.api.ApplicationV2["_onRender"]>[1],
  ): Promise<void> {
    await super._onRender(context, options);
    this.element.querySelector<HTMLSelectElement>("select[name=difficulty]")?.addEventListener("change", async (event) => {
      await game.settings!.set(SYSTEM_ID, "difficulty", (event.target as HTMLSelectElement).value as Difficulty);
      void this.render();
    });
  }

  static async #deck() {
    return getGMDeck() ?? (await ensureGMDeck());
  }

  static async #onTest(this: GMDeckApp) {
    const deck = await GMDeckApp.#deck();
    if (deck) await testAttribute(deck);
  }

  static async #onAttack(this: GMDeckApp) {
    const deck = await GMDeckApp.#deck();
    if (deck) await drawAttack(deck);
  }

  static async #onAddBless(this: GMDeckApp) {
    const deck = await GMDeckApp.#deck();
    if (deck) await addTemporary(deck, "bless");
  }

  static async #onAddCurse(this: GMDeckApp) {
    const deck = await GMDeckApp.#deck();
    if (deck) await addTemporary(deck, "curse");
  }

  static async #onClear(this: GMDeckApp) {
    await (await GMDeckApp.#deck())?.removeTemporary();
  }

  static async #onReshuffle(this: GMDeckApp) {
    await (await GMDeckApp.#deck())?.reshuffle();
  }

  static async #onRefresh(this: GMDeckApp) {
    await this.render();
  }

  static async #onRebuild(this: GMDeckApp) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("GLOOM.Deck.rebuild") },
      content: `<p>${t("GLOOM.Deck.rebuildConfirm")}</p>`,
    } as never);
    if (ok) await (await GMDeckApp.#deck())?.rebuild();
  }
}
