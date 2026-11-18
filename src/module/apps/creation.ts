/**
 * Character creation wizard (Core Rulebook ch. 4, "Making a Mercenary", p. 105):
 * ancestry, class, faction, Attribute points, Backgrounds, starting inventory, personal quest.
 * Options come from world Items and every Item compendium (e.g. the imported content), so the
 * system itself ships no content.
 */
import { ATTRIBUTES, SYSTEM_ID, templatePath, type AttributeKey } from "../config.ts";
import { STARTING_TIER } from "../rules/factions.ts";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

/** Points to distribute after the class's (p. 116), and the cap at creation. */
export const CREATION_POINTS = 6;
export const CREATION_MAX = 3;
export const CREATION_BACKGROUNDS = 4;
export const SHOPPING_GOLD = 50;

const STEPS = ["identity", "ancestry", "class", "faction", "attributes", "backgrounds", "inventory", "quest", "review"] as const;
type Step = (typeof STEPS)[number];

export interface Option {
  uuid: string;
  name: string;
  img: string;
  type: string;
  system: Record<string, unknown>;
  flags: Record<string, unknown>;
  source: string;
}

interface CreationState {
  name: string;
  pronouns: string;
  img: string;
  ancestry: string;
  class: string;
  faction: string;
  assigned: Record<AttributeKey, number>;
  backgrounds: string[];
  inventory: "starting" | "shop";
  cart: Record<string, number>;
  quest: string;
}

const TYPES = ["ancestry", "class", "faction", "background", "equipment"] as const;

/** Every Item of the given types from the world and from Item compendiums the user can see. */
export async function collectItems<T extends string>(types: readonly T[]): Promise<Record<T, Option[]>> {
  const out = Object.fromEntries(types.map((type) => [type, [] as Option[]])) as Record<T, Option[]>;
  const add = (doc: Item.Implementation, source: string) => {
    const list = out[doc.type as T];
    const flags = (doc.flags as Record<string, Record<string, unknown>>)[SYSTEM_ID] ?? {};
    const key = (o: { name: string; flags: Record<string, unknown> }) => `${o.name}|${String(o.flags["class"] ?? "")}|${String(o.flags["ancestry"] ?? "")}`;
    if (!list || list.some((o) => key(o) === key({ name: doc.name ?? "", flags }))) return;
    list.push({
      uuid: doc.uuid ?? "", name: doc.name ?? "", img: doc.img ?? "", type: doc.type,
      system: doc.system as unknown as Record<string, unknown>, source,
      flags,
    });
  };
  for (const item of game.items ?? []) if ((types as readonly string[]).includes(item.type)) add(item as Item.Implementation, t("GLOOM.Creation.world"));
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item" || !pack.visible) continue;
    const index = await pack.getIndex({ fields: ["type"] as never });
    const ids = index.filter((e) => (types as readonly string[]).includes((e as { type?: string }).type ?? "")).map((e) => e._id);
    if (!ids.length) continue;
    const docs = (await pack.getDocuments({ _id__in: ids } as never)) as unknown as Item.Implementation[];
    for (const doc of docs) add(doc, pack.metadata.label);
  }
  for (const list of Object.values(out) as Option[][]) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const emptyAssigned = (): Record<AttributeKey, number> =>
  Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<AttributeKey, number>;

export class CreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The mercenary being filled in, or null to create one when finishing. */
  actor: Actor.Implementation | null;
  step: Step = "identity";
  draft: CreationState;
  options_: Record<(typeof TYPES)[number], Option[]> | null = null;

  constructor(actor: Actor.Implementation | null = null, options: object = {}) {
    super(options as never);
    this.actor = actor;
    this.draft = {
      name: actor?.name ?? "", pronouns: (actor?.system as { pronouns?: string } | undefined)?.pronouns ?? "",
      img: actor?.img ?? "icons/svg/mystery-man.svg",
      ancestry: "", class: "", faction: "", assigned: emptyAssigned(), backgrounds: [],
      inventory: "starting", cart: {}, quest: (actor?.system as { personalGoal?: string } | undefined)?.personalGoal ?? "",
    };
  }

  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "creation-wizard"],
    position: { width: 760, height: 640 },
    window: { title: "GLOOM.Creation.title", icon: "fa-solid fa-user-plus", resizable: true },
    actions: {
      goto: CreationWizard.#onGoto,
      next: CreationWizard.#onNext,
      back: CreationWizard.#onBack,
      choose: CreationWizard.#onChoose,
      toggleBackground: CreationWizard.#onToggleBackground,
      point: CreationWizard.#onPoint,
      cart: CreationWizard.#onCart,
      pickImage: CreationWizard.#onPickImage,
      finish: CreationWizard.#onFinish,
    },
  } as never;

  static override PARTS = { body: { template: templatePath("apps/creation.hbs"), scrollable: [".step-body"] } };

  override get title(): string {
    return this.actor ? f("GLOOM.Creation.titleFor", { name: this.actor.name ?? "" }) : t("GLOOM.Creation.title");
  }

  // ---------------------------------------------------------------------------
  // Derived values

  private find(type: (typeof TYPES)[number], uuid: string): Option | undefined {
    return this.options_?.[type].find((o) => o.uuid === uuid);
  }

  private get classBonus(): Record<AttributeKey, number> {
    const attrs = (this.find("class", this.draft.class)?.system["attributes"] ?? {}) as Partial<Record<AttributeKey, number>>;
    return Object.fromEntries(ATTRIBUTES.map((a) => [a, Number(attrs[a] ?? 0)])) as Record<AttributeKey, number>;
  }

  private get pointsLeft(): number {
    return CREATION_POINTS - Object.values(this.draft.assigned).reduce((a, b) => a + b, 0);
  }

  private get cartTotal(): number {
    return Object.entries(this.draft.cart).reduce((sum, [uuid, qty]) => sum + qty * Number(this.find("equipment", uuid)?.system["cost"] ?? 0), 0);
  }

  /** Problems per step (empty = complete). Only warnings: the GM may allow exceptions. */
  private issues(): Record<Step, string[]> {
    const s = this.draft;
    const out = Object.fromEntries(STEPS.map((k) => [k, [] as string[]])) as Record<Step, string[]>;
    if (!s.name.trim()) out.identity.push(t("GLOOM.Creation.issue.name"));
    if (!s.ancestry) out.ancestry.push(t("GLOOM.Creation.issue.ancestry"));
    if (!s.class) out.class.push(t("GLOOM.Creation.issue.class"));
    if (!s.faction && this.options_?.faction.length) out.faction.push(t("GLOOM.Creation.issue.faction"));
    if (this.pointsLeft > 0) out.attributes.push(f("GLOOM.Creation.issue.points", { n: String(this.pointsLeft) }));
    if (s.backgrounds.length !== CREATION_BACKGROUNDS) {
      out.backgrounds.push(f("GLOOM.Creation.issue.backgrounds", { n: String(s.backgrounds.length), max: String(CREATION_BACKGROUNDS) }));
    }
    if (s.inventory === "shop" && this.cartTotal > SHOPPING_GOLD) out.inventory.push(t("GLOOM.Creation.issue.overBudget"));
    if (!s.quest.trim()) out.quest.push(t("GLOOM.Creation.issue.quest"));
    out.review = STEPS.filter((k) => k !== "review").flatMap((k) => out[k]);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Rendering

  override async _prepareContext(options: Parameters<foundry.applications.api.ApplicationV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    this.options_ ??= await collectItems(TYPES);
    const o = this.options_;
    const s = this.draft;
    const issues = this.issues();
    const enrich = (html: unknown) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(String(html ?? ""), { secrets: false } as never);

    const ancestry = this.find("ancestry", s.ancestry);
    const cls = this.find("class", s.class);
    const faction = this.find("faction", s.faction);
    const bonus = this.classBonus;

    const grantsOf = (opt?: Option) =>
      ((opt?.system["grants"] ?? []) as { name?: string; type?: string }[])
        .filter((g) => g.type !== "perk")
        .map((g) => ({ name: g.name, type: t(`TYPES.Item.${g.type}`) }));

    const backgroundGroups = ["occupation", "origin", "social"].map((category) => ({
      label: t(`GLOOM.Creation.category.${category}`),
      items: o.background
        .filter((b) => b.system["category"] === category && !b.system["master"])
        .map((b) => ({ ...b, selected: s.backgrounds.includes(b.uuid) })),
      count: s.backgrounds.filter((u) => this.find("background", u)?.system["category"] === category).length,
    }));

    const startingItems = ((cls?.system["startingItems"] ?? []) as { name?: string; system?: { quantity?: number } }[])
      .map((i) => ({ name: i.name, quantity: i.system?.quantity ?? 1 }));
    const shop = o.equipment
      .filter((e) => (e.system["rarity"] ?? "common") === "common" && Number(e.system["cost"] ?? 0) > 0)
      .map((e) => ({ ...e, cost: Number(e.system["cost"] ?? 0), qty: s.cart[e.uuid] ?? 0, slot: e.system["slot"] }));

    return {
      ...context,
      step: this.step,
      steps: STEPS.map((k, i) => ({
        key: k, n: i + 1, label: t(`GLOOM.Creation.step.${k}`), active: k === this.step,
        done: k !== "review" && !issues[k].length,
      })),
      isFirst: this.step === STEPS[0],
      isLast: this.step === "review",
      issues: issues[this.step],
      state: s,
      ancestries: o.ancestry.map((a) => ({ ...a, selected: a.uuid === s.ancestry })),
      classes: o.class.map((c) => ({ ...c, selected: c.uuid === s.class })),
      // You start with a major faction (p. 115).
      factions: o.faction.filter((x) => x.system["major"] !== false).map((x) => ({ ...x, selected: x.uuid === s.faction })),
      ancestry: ancestry && { ...ancestry, description: await enrich(ancestry.system["description"]), grants: grantsOf(ancestry) },
      cls: cls && {
        ...cls, description: await enrich(cls.system["description"]), grants: grantsOf(cls),
        hpTrack: t(`GLOOM.Class.hpTrack.${String(cls.system["hpTrack"])}`),
        bonus: ATTRIBUTES.filter((a) => bonus[a]).map((a) => `${t(`GLOOM.Attribute.${a}.abbr`)} +${bonus[a]}`).join(", "),
        startingGear: cls.system["startingGear"],
      },
      faction: faction && { ...faction, description: await enrich(faction.system["description"]) },
      startingTier: STARTING_TIER,
      attributes: ATTRIBUTES.map((a) => ({
        key: a, label: t(`GLOOM.Attribute.${a}.label`), bonus: bonus[a], assigned: s.assigned[a],
        total: bonus[a] + s.assigned[a],
        canAdd: this.pointsLeft > 0 && bonus[a] + s.assigned[a] < CREATION_MAX,
        canRemove: s.assigned[a] > 0,
      })),
      pointsLeft: this.pointsLeft,
      points: CREATION_POINTS,
      max: CREATION_MAX,
      backgroundGroups,
      backgroundCount: s.backgrounds.length,
      backgroundMax: CREATION_BACKGROUNDS,
      startingItems,
      startingGold: Number(cls?.system["startingGold"] ?? 0),
      shop,
      cartTotal: this.cartTotal,
      budget: SHOPPING_GOLD,
      noContent: !o.ancestry.length && !o.class.length,
      hasEquipment: o.equipment.length > 0,
      summary: {
        backgrounds: s.backgrounds.map((u) => this.find("background", u)?.name).filter(Boolean).join(", "),
        attributes: ATTRIBUTES.map((a) => `${t(`GLOOM.Attribute.${a}.abbr`)} ${bonus[a] + s.assigned[a]}`).join(" · "),
      },
    };
  }

  protected override async _onRender(
    context: Parameters<foundry.applications.api.ApplicationV2["_onRender"]>[0],
    options: Parameters<foundry.applications.api.ApplicationV2["_onRender"]>[1],
  ): Promise<void> {
    await super._onRender(context, options);
    // Free-text fields write straight into the state (no re-render while typing).
    this.element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset["field"] as "name" | "pronouns" | "quest";
        this.draft[key] = input.value;
      });
    });
    this.element.querySelectorAll<HTMLInputElement>("input[name=inventory]").forEach((input) => {
      input.addEventListener("change", () => {
        this.draft.inventory = input.value as "starting" | "shop";
        void this.render();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Actions

  static #onGoto(this: CreationWizard, _event: Event, target: HTMLElement): void {
    this.step = target.dataset["step"] as Step;
    void this.render();
  }

  static #onNext(this: CreationWizard): void {
    this.step = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(this.step) + 1)]!;
    void this.render();
  }

  static #onBack(this: CreationWizard): void {
    this.step = STEPS[Math.max(0, STEPS.indexOf(this.step) - 1)]!;
    void this.render();
  }

  static #onChoose(this: CreationWizard, _event: Event, target: HTMLElement): void {
    const kind = target.dataset["kind"] as "ancestry" | "class" | "faction";
    this.draft[kind] = target.dataset["uuid"] ?? "";
    if (kind === "class") {
      // Class points change the caps: drop assigned points that no longer fit.
      const bonus = this.classBonus;
      for (const a of ATTRIBUTES) this.draft.assigned[a] = Math.max(0, Math.min(this.draft.assigned[a], CREATION_MAX - bonus[a]));
    }
    void this.render();
  }

  static #onToggleBackground(this: CreationWizard, _event: Event, target: HTMLElement): void {
    const uuid = target.dataset["uuid"] ?? "";
    const list = this.draft.backgrounds;
    if (list.includes(uuid)) list.splice(list.indexOf(uuid), 1);
    else if (list.length < CREATION_BACKGROUNDS) list.push(uuid);
    else ui.notifications?.warn(f("GLOOM.Creation.issue.tooManyBackgrounds", { max: String(CREATION_BACKGROUNDS) }));
    void this.render();
  }

  static #onPoint(this: CreationWizard, _event: Event, target: HTMLElement): void {
    const key = target.dataset["attribute"] as AttributeKey;
    const delta = Number(target.dataset["delta"]);
    const total = this.classBonus[key] + this.draft.assigned[key];
    if (delta > 0 && (this.pointsLeft <= 0 || total >= CREATION_MAX)) return;
    if (delta < 0 && this.draft.assigned[key] <= 0) return;
    this.draft.assigned[key] += delta;
    void this.render();
  }

  static #onCart(this: CreationWizard, _event: Event, target: HTMLElement): void {
    const uuid = target.dataset["uuid"] ?? "";
    const qty = Math.max(0, (this.draft.cart[uuid] ?? 0) + Number(target.dataset["delta"]));
    if (qty) this.draft.cart[uuid] = qty;
    else delete this.draft.cart[uuid];
    void this.render();
  }

  static #onPickImage(this: CreationWizard): void {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "image", current: this.draft.img,
      callback: (path: string) => { this.draft.img = path; void this.render(); },
    } as never).browse();
  }

  static async #onFinish(this: CreationWizard): Promise<void> {
    const issues = this.issues().review;
    if (issues.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GLOOM.Creation.title") },
        content: `<p>${t("GLOOM.Creation.incomplete")}</p><ul>${issues.map((i) => `<li>${i}</li>`).join("")}</ul>`,
      } as never);
      if (!ok) return;
    }
    try {
      const actor = await createMercenary(this.actor, this.draft, (type, uuid) => this.find(type, uuid));
      await this.close();
      actor?.sheet?.render({ force: true } as never);
    } catch (err) {
      console.error("GloomFoundry | Character creation failed", err);
      ui.notifications?.error(f("GLOOM.Creation.failed", { error: String(err) }));
    }
  }
}

/** Raw Item data from a source document, remembering where it came from. */
export async function itemData(uuid: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
  const doc = (await fromUuid(uuid)) as Item.Implementation | null;
  if (!doc) return null;
  const data = doc.toObject() as Record<string, unknown>;
  delete data["_id"];
  delete data["folder"];
  data["_stats"] = { compendiumSource: uuid };
  return foundry.utils.mergeObject(data, extra, { inplace: false });
}

async function createMercenary(
  existing: Actor.Implementation | null,
  s: CreationState,
  find: (type: (typeof TYPES)[number], uuid: string) => Option | undefined,
): Promise<Actor.Implementation | null> {
  const cls = find("class", s.class);
  const gold = s.inventory === "starting"
    ? Number(cls?.system["startingGold"] ?? 0)
    // Shopping: 50 g of common gear (p. 118); the change is kept (assumption, see PLAN.md).
    : Math.max(0, SHOPPING_GOLD - Object.entries(s.cart).reduce((sum, [u, q]) => sum + q * Number(find("equipment", u)?.system["cost"] ?? 0), 0));

  const base = {
    name: s.name.trim() || t("GLOOM.Creation.defaultName"),
    img: s.img,
    "prototypeToken.texture.src": s.img,
    "system.pronouns": s.pronouns,
    "system.personalGoal": s.quest,
    "system.gold": gold,
    "system.level": 1,
    // Assigned points only: the class adds its own when its item is created (applyGrants).
    ...Object.fromEntries(ATTRIBUTES.map((a) => [`system.attributes.${a}`, s.assigned[a]])),
  };
  let actor = existing;
  if (actor) await actor.update(base as never);
  else {
    actor = (await Actor.implementation.create(
      foundry.utils.expandObject({ ...base, type: "mercenary" }) as never,
    )) as Actor.Implementation | null;
    if (!actor) return null;
  }

  // Ancestry and class first: their grants (Skills, Talents, perks, class Attribute points) follow.
  const core = (await Promise.all([s.ancestry, s.class].filter(Boolean).map((u) => itemData(u)))).filter(Boolean);
  if (core.length) await actor.createEmbeddedDocuments("Item", core as never);

  const others: Record<string, unknown>[] = [];
  if (s.faction) {
    const data = await itemData(s.faction, { system: { tier: STARTING_TIER, member: true, successes: 0, failures: 0, active: true } });
    if (data) others.push(data);
  }
  for (const u of s.backgrounds) {
    const data = await itemData(u);
    if (data) others.push(data);
  }
  if (s.inventory === "starting") {
    for (const item of (cls?.system["startingItems"] ?? []) as Record<string, unknown>[]) {
      const { _id, ...data } = item;
      others.push(data);
    }
  } else {
    for (const [u, qty] of Object.entries(s.cart)) {
      const data = await itemData(u, { system: { quantity: qty } });
      if (data) others.push(data);
    }
  }
  if (others.length) await actor.createEmbeddedDocuments("Item", others as never);

  // Start at full HP once the class has set the maximum.
  const hp = (actor.system as unknown as { hp: { max: number } }).hp;
  await actor.update({ "system.hp.value": hp.max } as never);
  await actor.setFlag(SYSTEM_ID as never, "created" as never, true as never);
  ui.notifications?.info(f("GLOOM.Creation.done", { name: actor.name ?? "" }));
  return actor;
}

/** Is this mercenary still blank (no class, no ancestry)? */
export function isBlankMercenary(actor: Actor.Implementation): boolean {
  return actor.type === "mercenary" && !actor.items.some((i) => i.type === "class" || i.type === "ancestry");
}

export function openCreationWizard(actor: Actor.Implementation | null = null): void {
  new CreationWizard(actor).render({ force: true } as never);
}

export function registerCreationHooks(): void {
  // "New mercenary" button in the Actors sidebar.
  Hooks.on("renderActorDirectory", (_app, html) => {
    if (!game.user?.can("ACTOR_CREATE" as never)) return;
    const root = html as HTMLElement;
    if (root.querySelector(".gloom-new-mercenary")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gloom-new-mercenary";
    button.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${t("GLOOM.Creation.newMercenary")}`;
    button.addEventListener("click", () => openCreationWizard());
    (root.querySelector(".header-actions") ?? root.querySelector("header") ?? root).append(button);
  });

}

const offered = new Set<string>();
/** Called by the mercenary sheet on first render: players opening their blank mercenary get the wizard. */
export function maybeOfferCreation(actor: Actor.Implementation): void {
  if (game.user?.isGM || !actor.isOwner || !isBlankMercenary(actor) || offered.has(actor.id!)) return;
  if (actor.getFlag(SYSTEM_ID as never, "created" as never)) return;
  offered.add(actor.id!);
  openCreationWizard(actor);
}
