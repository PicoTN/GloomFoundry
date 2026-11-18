/**
 * Mercenary company sheet: identity (concept, service, district, leader, faction, missions),
 * level and progress, members (drop mercenaries), benefits, relationships and notes.
 */
import { templatePath } from "../config.ts";
import { companyMembers, gainTemporaryBenefit, useBenefit } from "../company.ts";
import { missionCompleted } from "../shop.ts";
import { takeFromStash } from "../equipment.ts";
import { BENEFITS_PER_LEVEL, COMPANY_MAX_LEVEL } from "../data/company.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);
/** Benefits with a "use" button; discounts and mission gold apply in shops and mission rewards. */
const ACTIVE = new Set(["bless", "gold", "ward", "ally"]);

type Handler = (this: CompanySheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;

export class CompanySheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "actor", "company"],
    position: { width: 720, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      gainBenefit: CompanySheet.#onGainBenefit,
      mission: CompanySheet.#onMission,
      useBenefit: CompanySheet.#onUseBenefit,
      toggleUsed: CompanySheet.#onToggleUsed,
      editItem: CompanySheet.#onEditItem,
      deleteItem: CompanySheet.#onDeleteItem,
      openMember: CompanySheet.#onOpenMember,
      removeMember: CompanySheet.#onRemoveMember,
      takeItem: CompanySheet.#onTakeItem,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    header: { template: templatePath("actor/company-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    overview: { template: templatePath("actor/company-overview.hbs"), scrollable: [""] },
    benefits: { template: templatePath("actor/company-benefits.hbs"), scrollable: [""] },
    stash: { template: templatePath("actor/company-stash.hbs"), scrollable: [""] },
    story: { template: templatePath("actor/company-story.hbs"), scrollable: [""] },
  };

  static override TABS = {
    primary: {
      tabs: [
        { id: "overview", icon: "fa-solid fa-flag" },
        { id: "benefits", icon: "fa-solid fa-star" },
        { id: "stash", icon: "fa-solid fa-box-archive" },
        { id: "story", icon: "fa-solid fa-book" },
      ],
      initial: "overview",
      labelPrefix: "GLOOM.Tab",
    },
  };

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ActorSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system as unknown as Record<string, unknown> & { level: number; progress: number; leader: string; pending: { ward: boolean } };
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const enrich = (v: unknown) => TextEditor.enrichHTML(String(v ?? ""), { relativeTo: actor, secrets: actor.isOwner } as never);
    const members = companyMembers(actor);
    const takers = members.filter((m) => m.isOwner);
    const taker = takers.find((m) => m.id === this.#takerId) ?? takers.find((m) => m.id === game.user?.character?.id) ?? takers[0];
    const benefits = actor.items.filter((i) => i.type === "companyBenefit").map((i) => {
      const s = i.system as unknown as { kind: string; level: number; description: string; automation: string; used: boolean; reason: string };
      return { id: i.id, name: i.name, img: i.img, ...s, usable: ACTIVE.has(s.automation), reasonLabel: s.reason ? t(`GLOOM.Company.reasons.${s.reason}`) : "" };
    });
    return {
      ...context,
      tabs: this._prepareTabs("primary"),
      actor,
      system,
      systemFields: (actor.system as unknown as { schema: { fields: unknown } }).schema.fields,
      editable: this.isEditable,
      isGM: game.user?.isGM ?? false,
      missionsCompleted: (system as unknown as { missionsCompleted?: number }).missionsCompleted ?? 0,
      levelPips: Array.from({ length: COMPANY_MAX_LEVEL }, (_, i) => ({ on: i < system.level })),
      progressPips: Array.from({ length: BENEFITS_PER_LEVEL }, (_, i) => ({ on: i < system.progress })),
      maxLevel: system.level >= COMPANY_MAX_LEVEL,
      members: members.map((m) => ({
        uuid: m.uuid, name: m.name, img: m.img, leader: m.uuid === system.leader,
        className: (m.system as unknown as { className?: string }).className ?? "",
        level: (m.system as unknown as { level?: number }).level ?? 1,
      })),
      leaderOptions: [{ key: "", label: "—" }, ...members.map((m) => ({ key: m.uuid ?? "", label: m.name ?? "" }))],
      temporary: benefits.filter((b) => b.kind === "temporary"),
      permanent: benefits.filter((b) => b.kind === "permanent"),
      wardPending: system.pending.ward,
      takers,
      takerId: taker?.id ?? "",
      takerOptions: Object.fromEntries(takers.map((m) => [m.id, m.name])),
      stash: actor.items.filter((i) => i.type === "equipment").map((i) => {
        const s = i.system as unknown as { slot: string; quantity: number };
        return { id: i.id, name: i.name, img: i.img, quantity: s.quantity, slotLabel: t(`GLOOM.Equipment.slot.${s.slot}`) };
      }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      enrichedConcept: await enrich(system["concept"]),
      enrichedMissions: await enrich(system["missions"]),
      enrichedRelationships: await enrich(system["relationships"]),
      enrichedNotes: await enrich(system["notes"]),
    };
  }

  #takerId = "";

  override async _onRender(context: never, options: never): Promise<void> {
    await super._onRender(context, options);
    this.element.querySelector<HTMLSelectElement>("select[data-taker]")?.addEventListener("change", (ev) => {
      ev.stopPropagation();
      this.#takerId = (ev.currentTarget as HTMLSelectElement).value;
    });
  }

  static async #onTakeItem(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.document.items.get(target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "");
    const select = this.element.querySelector<HTMLSelectElement>("select[data-taker]");
    const taker = companyMembers(this.document).find((m) => m.id === (select?.value ?? this.#takerId));
    if (item && taker) await takeFromStash(this.document, item as Item.Implementation, taker);
  }

  /** Dropping a mercenary adds it to the company. */
  protected override async _onDropActor(event: DragEvent, actor: Actor.Implementation) {
    if (!this.isEditable || actor.type !== "mercenary") return super._onDropActor(event, actor as never);
    const members = [...(this.document.system as unknown as { members: string[] }).members];
    if (!members.includes(actor.uuid ?? "")) members.push(actor.uuid ?? "");
    await this.document.update({ "system.members": members } as never);
    return null as never;
  }

  static async #onMission(this: CompanySheet) {
    await missionCompleted(this.document);
  }

  static async #onGainBenefit(this: CompanySheet) {
    await gainTemporaryBenefit(this.document);
  }

  static async #onUseBenefit(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.document.items.get(target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "");
    if (item) await useBenefit(this.document, item);
  }

  static async #onToggleUsed(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.document.items.get(target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "");
    if (item) await item.update({ "system.used": !(item.system as unknown as { used: boolean }).used } as never);
  }

  static async #onEditItem(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    await this.document.items.get(target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "")?.sheet?.render(true);
  }

  static async #onDeleteItem(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    await this.document.items.get(target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? "")?.deleteDialog();
  }

  static async #onOpenMember(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    const actor = (await fromUuid(target.closest<HTMLElement>("[data-uuid]")?.dataset["uuid"] ?? "")) as Actor.Implementation | null;
    await actor?.sheet?.render(true);
  }

  static async #onRemoveMember(this: CompanySheet, _event: PointerEvent, target: HTMLElement) {
    const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset["uuid"] ?? "";
    const members = (this.document.system as unknown as { members: string[] }).members.filter((m) => m !== uuid);
    await this.document.update({ "system.members": members } as never);
  }
}
