/**
 * Level up (Core Rulebook p. 120): +1 level (HP follows the class health track), 1 Attribute
 * point (cap 2 + half the level), 1 Perk box, and at some levels a new class Skill, a passive
 * Talent and an ancestry Skill, or the level 5 Talent upgrades.
 * The button only shows while the GM has enabled leveling (scene controls > Gloomhaven).
 */
import { ATTRIBUTES, SYSTEM_ID, templatePath, type AttributeKey } from "../config.ts";
import { attributeMax, levelGains, MAX_LEVEL, maxHp, type HpTrack } from "../rules/progression.ts";
import { collectItems, itemData, type Option } from "./creation.ts";
import { perkHTML } from "../perks/display.ts";
import { clearAreas } from "../combat/power-actions.ts";
import type { PerkStep } from "../rules/perks.ts";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

export const levelUpEnabled = (): boolean => !!game.settings?.get(SYSTEM_ID, "levelUpEnabled");

interface Choices {
  attribute: AttributeKey | "";
  perk: string;
  classSkill: string;
  passiveTalent: string;
  ancestrySkill: string;
}

export class LevelUpApp extends HandlebarsApplicationMixin(ApplicationV2) {
  actor: Actor.Implementation;
  choices: Choices = { attribute: "", perk: "", classSkill: "", passiveTalent: "", ancestrySkill: "" };
  powers: { skill: Option[]; talent: Option[] } | null = null;

  constructor(actor: Actor.Implementation, options: object = {}) {
    super(options as never);
    this.actor = actor;
  }

  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "level-up"],
    position: { width: 620, height: 700 },
    window: { title: "GLOOM.LevelUp.title", icon: "fa-solid fa-angles-up", resizable: true },
    actions: {
      pick: LevelUpApp.#onPick,
      confirm: LevelUpApp.#onConfirm,
    },
  } as never;

  static override PARTS = { body: { template: templatePath("apps/level-up.hbs"), scrollable: [".level-body"] } };

  override get title(): string {
    return f("GLOOM.LevelUp.titleFor", { name: this.actor.name ?? "" });
  }

  private get system() {
    return this.actor.system as unknown as {
      level: number; attributes: Record<AttributeKey, number>; className: string; ancestry: string; hp: { max: number };
    };
  }

  private owned(type: string, name: string): boolean {
    return this.actor.items.some((i) => i.type === type && i.name === name);
  }

  /** Options for the new level, from the class's/ancestry's powers in the world and compendiums. */
  private powerOptions(level: number) {
    const sys = this.system;
    const skills = this.powers?.skill ?? [];
    const talents = this.powers?.talent ?? [];
    const lvl = (o: Option) => Number(o.system["level"] ?? 1);
    const ofClass = (o: Option) => o.flags["class"] === sys.className;
    const ofAncestry = (o: Option) => o.flags["ancestry"] === sys.ancestry;
    return {
      classSkills: skills.filter((o) => o.system["source"] !== "ancestry" && ofClass(o) && lvl(o) <= level && !this.owned("skill", o.name)),
      ancestrySkills: skills.filter((o) => o.system["source"] === "ancestry" && ofAncestry(o) && lvl(o) <= level && !this.owned("skill", o.name)),
      passiveTalents: talents.filter((o) => ofClass(o) && o.system["kind"] === "passive" && lvl(o) <= level && lvl(o) > 1 && !this.owned("talent", o.name)),
      upgrades: talents.filter((o) => ofClass(o) && lvl(o) === 5 && !!o.system["replaces"] && !this.owned("talent", o.name)),
    };
  }

  override async _prepareContext(options: Parameters<foundry.applications.api.ApplicationV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    this.powers ??= await collectItems(["skill", "talent"] as const);
    const sys = this.system;
    const from = sys.level;
    const to = Math.min(MAX_LEVEL, from + 1);
    const gains = levelGains(to);
    const cap = attributeMax(to);
    const cls = this.actor.items.find((i) => i.type === "class");
    const track = (cls?.system as { hpTrack?: HpTrack } | undefined)?.hpTrack;
    const opts = this.powerOptions(to);
    const c = this.choices;
    const view = (o: Option, key: keyof Choices) => ({
      uuid: o.uuid, name: o.name, img: o.img, level: o.system["level"], initiative: o.system["initiative"],
      selected: c[key] === o.uuid,
      detail: [o.system["primary"], o.system["secondary"], o.system["passive"]].filter(Boolean).join(""),
    });
    const perkDocs = this.actor.items.filter((i) => i.type === "perk");
    const perks = perkDocs.map((i) => {
      const s = i.system as unknown as { steps: PerkStep[]; taken: number; description: string };
      return { id: i.id, name: i.name, html: perkHTML(s.steps, perkDocs.map((o) => o.system as unknown as { steps: PerkStep[] })), taken: s.taken, boxes: s.steps.length, full: s.taken >= s.steps.length, selected: c.perk === i.id };
    });
    return {
      ...context,
      atMax: from >= MAX_LEVEL,
      from, to,
      hp: track ? { from: maxHp(track, from), to: maxHp(track, to) } : null,
      gains,
      cap,
      attributes: ATTRIBUTES.map((a) => ({
        key: a, label: t(`GLOOM.Attribute.${a}.label`), value: sys.attributes[a], next: sys.attributes[a] + 1,
        atCap: sys.attributes[a] >= cap, selected: c.attribute === a,
      })),
      perks: perks.filter((p) => !p.full),
      classSkills: gains.classSkill ? opts.classSkills.map((o) => view(o, "classSkill")) : [],
      passiveTalents: gains.passiveTalent ? opts.passiveTalents.map((o) => view(o, "passiveTalent")) : [],
      ancestrySkills: gains.ancestrySkill ? opts.ancestrySkills.map((o) => view(o, "ancestrySkill")) : [],
      upgrades: gains.upgradeTalents ? opts.upgrades.map((o) => ({ name: o.name, replaces: o.system["replaces"] })) : [],
      noClass: !cls,
    };
  }

  static #onPick(this: LevelUpApp, _event: Event, target: HTMLElement): void {
    const key = target.dataset["key"] as keyof Choices;
    const value = target.dataset["value"] ?? "";
    (this.choices as unknown as Record<string, string>)[key] = this.choices[key] === value ? "" : value;
    void this.render();
  }

  static async #onConfirm(this: LevelUpApp): Promise<void> {
    const actor = this.actor;
    const sys = this.system;
    const to = Math.min(MAX_LEVEL, sys.level + 1);
    const gains = levelGains(to);
    const c = this.choices;
    const missing: string[] = [];
    if (gains.attributePoints && !c.attribute) missing.push(t("GLOOM.LevelUp.attribute"));
    if (gains.perks && !c.perk && actor.items.some((i) => i.type === "perk")) missing.push(t("GLOOM.LevelUp.perk"));
    if (gains.classSkill && !c.classSkill) missing.push(t("GLOOM.LevelUp.classSkill"));
    if (gains.passiveTalent && !c.passiveTalent) missing.push(t("GLOOM.LevelUp.passiveTalent"));
    if (gains.ancestrySkill && !c.ancestrySkill) missing.push(t("GLOOM.LevelUp.ancestrySkill"));
    if (missing.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: this.title },
        content: `<p>${t("GLOOM.LevelUp.incomplete")}</p><ul>${missing.map((m) => `<li>${m}</li>`).join("")}</ul>`,
      } as never);
      if (!ok) return;
    }

    const hpBefore = sys.hp.max;
    const update: Record<string, unknown> = { "system.level": to };
    if (c.attribute) update[`system.attributes.${c.attribute}`] = Math.min(7, sys.attributes[c.attribute] + 1);
    await actor.update(update as never);

    if (c.perk) {
      const perk = actor.items.get(c.perk);
      const s = perk?.system as unknown as { taken: number; steps: unknown[] } | undefined;
      if (perk && s && s.taken < s.steps.length) await perk.update({ "system.taken": s.taken + 1 } as never);
    }

    const gained: string[] = [];
    const create: Record<string, unknown>[] = [];
    for (const uuid of [c.classSkill, c.passiveTalent, c.ancestrySkill].filter(Boolean)) {
      const data = await itemData(uuid);
      if (data) { create.push(data); gained.push(String(data["name"])); }
    }
    // Level 5: upgraded active Talents replace the ones they name.
    if (gains.upgradeTalents) {
      const upgrades = this.powerOptions(to).upgrades;
      const replaced = actor.items.filter((i) => i.type === "talent" && upgrades.some((u) => u.system["replaces"] === i.name));
      for (const u of upgrades) {
        const data = await itemData(u.uuid);
        if (data) { create.push(data); gained.push(String(data["name"])); }
      }
      if (replaced.length) await actor.deleteEmbeddedDocuments("Item", replaced.map((i) => i.id!));
    }
    if (create.length) await actor.createEmbeddedDocuments("Item", create as never);

    // HP max follows the level: heal the difference.
    const hp = (actor.system as unknown as { hp: { value: number; max: number } }).hp;
    const gainedHp = hp.max - hpBefore;
    if (gainedHp > 0) await actor.update({ "system.hp.value": hp.value + gainedHp } as never);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
      content: `<div class="gloom-level-up"><h3><i class="fa-solid fa-angles-up"></i> ${f("GLOOM.LevelUp.reached", { name: actor.name ?? "", level: String(to) })}</h3>${
        gained.length ? `<p>${f("GLOOM.LevelUp.gained", { list: gained.join(", ") })}</p>` : ""}</div>`,
    } as never);
    await this.close();
  }
}

export function openLevelUp(actor: Actor.Implementation): void {
  new LevelUpApp(actor).render({ force: true } as never);
}

/** World toggle and the Gloomhaven group in the scene controls (GM only). */
export function registerLevelUpControls(): void {
  game.settings!.register(SYSTEM_ID, "levelUpEnabled", {
    scope: "world", config: false, type: Boolean, default: false,
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        const doc = (app as { document?: Actor.Implementation }).document;
        if (doc?.type === "mercenary") void (app as { render: () => unknown }).render();
      }
    },
  } as never);

  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM) return;
    (controls as Record<string, unknown>)["gloomhaven"] = {
      name: "gloomhaven",
      title: "GLOOM.Controls.title",
      icon: "fa-solid fa-dungeon",
      order: 100,
      layer: "tokens",
      activeTool: "select",
      tools: {
        select: { name: "select", order: 0, title: "GLOOM.Controls.select", icon: "fa-solid fa-expand" },
        levelUp: {
          name: "levelUp", order: 1, title: "GLOOM.Controls.levelUp", icon: "fa-solid fa-angles-up",
          toggle: true, active: levelUpEnabled(),
          onChange: (_event: Event, active: boolean) => void game.settings!.set(SYSTEM_ID, "levelUpEnabled", active),
        },
        clearAreas: {
          name: "clearAreas", order: 3, title: "GLOOM.Place.clearAreas", icon: "fa-solid fa-eraser", button: true,
          onChange: () => void clearAreas(canvas?.scene),
        },
        gmDeck: {
          name: "gmDeck", order: 2, title: "GLOOM.Deck.gmDeck", icon: "fa-solid fa-cards", button: true,
          onChange: () => (game as unknown as { gloomfoundry: { openGMDeck: () => void } }).gloomfoundry.openGMDeck(),
        },
      },
    };
  });
}
