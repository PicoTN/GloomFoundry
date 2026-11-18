/**
 * Combat tracker additions: element bar, phase banner with planning buttons,
 * planned/unplanned markers and rounded initiative display.
 */
import { displayInitiative } from "../rules/combat.ts";
import { activateElementBar, elementBarHTML } from "./elements.ts";
import { chooseSurprised, getPhase, isSurprised, type GloomCombat } from "./combat.ts";
import { getPlan, openPlanningSheet, planEnemies } from "./planning.ts";

const t = (key: string) => game.i18n!.localize(key);

function phaseBanner(combat: Combat.Implementation): string {
  if (!combat.started) return "";
  const phase = getPhase(combat) ?? "planning";
  const isGM = game.user?.isGM ?? false;
  const myUnplanned = combat.combatants.filter(
    (c) => c.isOwner && c.actor?.type === "mercenary" && (c.initiative === null || c.initiative === undefined),
  );
  const buttons: string[] = [];
  if (phase === "planning") {
    if (myUnplanned.length && !isGM) {
      buttons.push(`<button type="button" data-gloom-combat="plan"><i class="fa-solid fa-chess"></i> ${t("GLOOM.Combat.planTurn")}</button>`);
    }
    if (isGM && combat.round <= 1) {
      buttons.push(`<button type="button" data-gloom-combat="surprise"><i class="fa-solid fa-eye-slash"></i> ${t("GLOOM.Combat.surprise")}</button>`);
    }
    if (isGM) {
      buttons.push(`<button type="button" data-gloom-combat="enemies"><i class="fa-solid fa-gauge-high"></i> ${t("GLOOM.Plan.enemiesTitle")}</button>`);
      buttons.push(`<button type="button" data-gloom-combat="start"><i class="fa-solid fa-play"></i> ${t("GLOOM.Combat.startAction")}</button>`);
    }
  }
  return `<div class="gloom-phase phase-${phase}">
    <span class="label">${t(`GLOOM.Combat.phase.${phase}`)}</span>
    <div class="buttons">${buttons.join("")}</div>
  </div>`;
}

export function registerTrackerUI(): void {
  Hooks.on("renderCombatTracker", (_app, html) => {
    const root = html as HTMLElement;
    root.querySelector(".gloom-tracker")?.remove();
    const combat = game.combat as Combat.Implementation | null;

    const panel = document.createElement("div");
    panel.className = "gloom-tracker";
    panel.innerHTML = `${combat ? phaseBanner(combat) : ""}${elementBarHTML()}`;
    const anchor = root.querySelector(".combat-tracker-header") ?? root.querySelector("header");
    if (anchor) anchor.after(panel);
    else root.prepend(panel);
    activateElementBar(panel);

    panel.querySelector('[data-gloom-combat="plan"]')?.addEventListener("click", async () => {
      for (const c of combat?.combatants ?? []) {
        if (c.isOwner && c.actor?.type === "mercenary" && (c.initiative === null || c.initiative === undefined)) {
          await openPlanningSheet(c);
        }
      }
    });
    panel.querySelector('[data-gloom-combat="surprise"]')?.addEventListener("click", () => {
      if (combat) void chooseSurprised(combat);
    });
    panel.querySelector('[data-gloom-combat="enemies"]')?.addEventListener("click", () => {
      if (combat) void planEnemies(combat);
    });
    panel.querySelector('[data-gloom-combat="start"]')?.addEventListener("click", () => {
      void (combat as unknown as GloomCombat | null)?.startActionPhase();
    });

    if (!combat) return;
    // Rounded initiative display and planning markers on each row.
    root.querySelectorAll<HTMLElement>("[data-combatant-id]").forEach((row) => {
      const combatant = combat.combatants.get(row.dataset["combatantId"] ?? "");
      if (!combatant) return;
      const init = row.querySelector<HTMLElement>(".token-initiative .initiative, .initiative");
      if (init && combatant.initiative !== null && combatant.initiative !== undefined) {
        init.textContent = displayInitiative(combatant.initiative);
      }
      if (isSurprised(combat, combatant)) {
        row.querySelector(".token-name, .name")?.insertAdjacentHTML("beforeend", ` <i class="fa-solid fa-eye-slash gloom-surprised" data-tooltip="${t("GLOOM.Combat.surprisedTag")}"></i>`);
      }
      const plan = getPlan(combatant);
      if (plan && combatant.isOwner) {
        const names = [plan.primary?.name, plan.secondary?.name].filter(Boolean).join(" / ");
        if (names) row.querySelector(".token-name, .name")?.insertAdjacentHTML("beforeend", `<span class="gloom-plan-names">${names}</span>`);
      }
    });
  });

  // Re-render the tracker when the element board changes.
  Hooks.on("updateScene", (scene, changes) => {
    if ((changes as { flags?: Record<string, unknown> }).flags?.["gloomfoundry"] && scene === (game.combat?.scene ?? canvas?.scene)) {
      void ui.combat?.render();
    }
  });
}
