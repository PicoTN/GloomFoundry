import { templatePath } from "../config.ts";
import { parseCardCode, parseCardList } from "../rules/playing-cards.ts";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key: string) => game.i18n!.localize(key);

interface CardSpecSource {
  card: string;
  attackKind: string;
  attackValue: number;
  attribute: number | null;
  effect: string;
}
interface StepSource {
  remove: string;
  add: CardSpecSource[];
}

const NEW_CARD: CardSpecSource = { card: "", attackKind: "number", attackValue: 0, attribute: null, effect: "" };

/** Turn `{0: a, 1: b}` (what form field names like `steps.0.x` expand to) back into arrays. */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([k]) => /^\d+$/.test(k))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v as T);
  }
  return [];
}

type Handler = (this: PerkSheet, event: PointerEvent, target: HTMLElement) => Promise<void> | void;

/** Editor for a perk: one fieldset per checkbox, each removing and adding modifier cards. */
export class PerkSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gloomfoundry", "sheet", "item", "perk"],
    position: { width: 640, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addStep: PerkSheet.#onAddStep,
      duplicateStep: PerkSheet.#onDuplicateStep,
      deleteStep: PerkSheet.#onDeleteStep,
      addCard: PerkSheet.#onAddCard,
      deleteCard: PerkSheet.#onDeleteCard,
    } satisfies Record<string, Handler>,
  } as never;

  static override PARTS = {
    body: { template: templatePath("item/perk.hbs"), scrollable: [".perk-steps"] },
  };

  get #steps(): StepSource[] {
    const source = this.document._source.system as unknown as { steps: StepSource[] };
    return foundry.utils.deepClone(source.steps);
  }

  async #saveSteps(steps: StepSource[]) {
    await this.document.update({ "system.steps": steps } as never);
  }

  override async _prepareContext(options: Parameters<foundry.applications.sheets.ItemSheetV2["_prepareContext"]>[0]) {
    const context = await super._prepareContext(options);
    const system = this.document.system as unknown as { description: string; taken: number; steps: StepSource[] };
    return {
      ...context,
      item: this.document,
      system,
      editable: this.isEditable,
      attackKinds: ["number", "critical", "null"].map((k) => ({ key: k, label: t(`GLOOM.Perk.attackKind.${k}`) })),
      steps: system.steps.map((step, i) => ({
        index: i,
        number: i + 1,
        ticked: i < system.taken,
        remove: step.remove,
        removeInvalid: parseCardList(step.remove).invalid.length > 0,
        add: step.add.map((card, j) => ({
          ...card,
          index: j,
          invalid: card.card !== "" && !parseCardCode(card.card),
          isNumber: card.attackKind === "number",
        })),
      })),
    };
  }

  /** Rebuild the nested `steps` arrays from the flat form field names. */
  protected override _processFormData(
    event: SubmitEvent | null,
    form: HTMLFormElement,
    formData: Parameters<foundry.applications.sheets.ItemSheetV2["_processFormData"]>[2],
  ) {
    const data = super._processFormData(event, form, formData) as { system?: { steps?: unknown } };
    if (data.system && "steps" in data.system) {
      data.system.steps = toArray<StepSource & { add: unknown }>(data.system.steps).map((step) => ({
        ...step,
        remove: step.remove ?? "",
        add: toArray<CardSpecSource>(step.add),
      }));
    }
    return data as never;
  }

  static async #onAddStep(this: PerkSheet) {
    await this.#saveSteps([...this.#steps, { remove: "", add: [{ ...NEW_CARD }] }]);
  }

  /** Copy a step: handy for "remove 2♥, 2♦ or 2♣" perks where only the suit changes. */
  static async #onDuplicateStep(this: PerkSheet, _event: PointerEvent, target: HTMLElement) {
    const steps = this.#steps;
    const i = Number(target.dataset["step"]);
    const step = steps[i];
    if (!step) return;
    steps.splice(i + 1, 0, foundry.utils.deepClone(step));
    await this.#saveSteps(steps);
  }

  static async #onDeleteStep(this: PerkSheet, _event: PointerEvent, target: HTMLElement) {
    const steps = this.#steps;
    steps.splice(Number(target.dataset["step"]), 1);
    await this.#saveSteps(steps);
  }

  static async #onAddCard(this: PerkSheet, _event: PointerEvent, target: HTMLElement) {
    const steps = this.#steps;
    steps[Number(target.dataset["step"])]?.add.push({ ...NEW_CARD });
    await this.#saveSteps(steps);
  }

  static async #onDeleteCard(this: PerkSheet, _event: PointerEvent, target: HTMLElement) {
    const steps = this.#steps;
    steps[Number(target.dataset["step"])]?.add.splice(Number(target.dataset["card"]), 1);
    await this.#saveSteps(steps);
  }
}
