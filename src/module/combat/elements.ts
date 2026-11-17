/**
 * Element tracker (p. 82). The board lives in the scene's flags; players' changes go
 * through the active GM. Shown at the top of the combat tracker.
 */
import { SYSTEM_ID, SYSTEM_PATH } from "../config.ts";
import {
  ELEMENTS, emptyBoard, infuse, setState, type ElementBoard, type ElementId, type ElementState,
} from "../rules/combat.ts";
import { runAsGM } from "../socket.ts";

const FLAG = "elements";
const t = (key: string) => game.i18n!.localize(key);

/** Icons: icon pack override ("element.<id>"), else the system's simple glyphs. */
const FALLBACK: Record<ElementId, string> = {
  air: "fa-wind", dark: "fa-moon", earth: "fa-leaf", fire: "fa-fire", ice: "fa-snowflake", light: "fa-sun",
};

export function elementScene(): Scene.Implementation | null {
  return (game.combat?.scene as Scene.Implementation | null | undefined) ?? (canvas?.scene as Scene.Implementation | null) ?? null;
}

export function getBoard(scene = elementScene()): ElementBoard {
  const stored = scene?.getFlag(SYSTEM_ID as never, FLAG as never) as ElementBoard | undefined;
  return stored ? { states: { ...emptyBoard().states, ...stored.states }, pending: [...(stored.pending ?? [])] } : emptyBoard();
}

/** GM only: write the board. */
export async function saveBoard(board: ElementBoard, scene = elementScene()): Promise<void> {
  if (!scene) return;
  await scene.setFlag(SYSTEM_ID as never, FLAG as never, board as never);
}

/** Apply a change as the GM (directly, or via the socket for players). */
export async function changeElement(element: ElementId, change: "infuse" | ElementState): Promise<void> {
  await runAsGM({ action: "element", element, change });
}

export async function handleElementRequest(element: ElementId, change: "infuse" | ElementState): Promise<void> {
  const board = getBoard();
  const inCombat = Boolean(game.combat?.started);
  await saveBoard(change === "infuse" ? infuse(board, element, inCombat) : setState(board, element, change));
}

export function elementIcon(element: ElementId): { img?: string; fa: string } {
  const img = CONFIG.GLOOM?.icons?.[`element.${element}`];
  return img ? { img, fa: FALLBACK[element] } : { fa: FALLBACK[element] };
}

/** HTML of the element bar. */
export function elementBarHTML(): string {
  const board = getBoard();
  const items = ELEMENTS.map((e) => {
    const state = board.states[e];
    const pending = board.pending.includes(e);
    const icon = elementIcon(e);
    const glyph = icon.img ? `<img src="${icon.img}" alt="">` : `<i class="fa-solid ${icon.fa}"></i>`;
    const label = `${t(`GLOOM.Element.${e}`)}: ${t(`GLOOM.Element.state.${state}`)}${pending ? ` (${t("GLOOM.Element.pending")})` : ""}`;
    return `<a class="gloom-element el-${e} state-${state}${pending ? " pending" : ""}" data-element="${e}" data-tooltip="${label}">${glyph}</a>`;
  });
  return `<div class="gloom-elements" data-tooltip-direction="UP">${items.join("")}<span class="hint">${t("GLOOM.Element.hint")}</span></div>`;
}

/** Click: infuse. Right-click: consume (inert). GM shift-click: cycle state. */
export function activateElementBar(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".gloom-element").forEach((el) => {
    const element = el.dataset["element"] as ElementId;
    el.addEventListener("click", (event) => {
      event.preventDefault();
      if (event.shiftKey && game.user?.isGM) {
        const next = ((getBoard().states[element] + 1) % 3) as ElementState;
        void changeElement(element, next);
      } else {
        void changeElement(element, "infuse");
      }
    });
    el.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      void changeElement(element, 0);
    });
  });
}

export const ELEMENT_ASSETS = `${SYSTEM_PATH}/assets/elements`;
