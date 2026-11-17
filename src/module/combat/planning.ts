/**
 * Planning phase (p. 71): mercenaries choose a primary and a secondary action from two
 * different powers and use the initiative of one of them; the GM chooses a speed for each
 * enemy type (not the same as last round); summons act just before their controller.
 */
import { SYSTEM_ID, templatePath } from "../config.ts";
import {
  allowedSpeeds, enemyInitiative, summonInitiative, type Speed,
} from "../rules/combat.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

export interface PlannedPower {
  id: string;
  name: string;
  type: string;
  initiative: number | null;
}
export interface Plan {
  primary: PlannedPower | null;
  secondary: PlannedPower | null;
}

type Sys = Record<string, unknown> & {
  kind?: string; level?: number; prepared?: boolean; state?: string; initiative?: number | null; equipped?: boolean;
};

export const PLAN_FLAG = "plan";

export function getPlan(combatant: Combatant.Implementation): Plan | null {
  return (combatant.getFlag(SYSTEM_ID as never, PLAN_FLAG as never) as Plan | undefined) ?? null;
}

/** Powers a mercenary can choose this round. */
function availablePowers(actor: Actor.Implementation): PlannedPower[] {
  const level = (actor.system as unknown as { level: number }).level;
  const powers: PlannedPower[] = [];
  for (const item of actor.items) {
    const s = item.system as unknown as Sys;
    const ok =
      (item.type === "talent" && s.kind === "active" && (s.level ?? 1) <= level) ||
      (item.type === "skill" && s.prepared && s.state === "ready") ||
      (item.type === "equipment" && s.equipped && s.state === "ready" && s.initiative);
    if (ok) powers.push({ id: item.id!, name: item.name ?? "", type: item.type, initiative: s.initiative ?? null });
  }
  return powers.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/** Open the planning dialog for a mercenary combatant. */
export async function planMercenary(combatant: Combatant.Implementation): Promise<void> {
  const actor = combatant.actor as Actor.Implementation | null;
  if (!actor || !combatant.isOwner) return;
  const powers = availablePowers(actor);
  const current = getPlan(combatant);
  const option = (p: PlannedPower) => ({
    value: p.id,
    label: `${p.name}${p.initiative ? ` (${p.initiative})` : ""} — ${t(`TYPES.Item.${p.type}`)}`,
  });
  const content = await foundry.applications.handlebars.renderTemplate(templatePath("apps/plan-dialog.hbs"), {
    primaryOptions: powers.map(option),
    secondaryOptions: powers.filter((p) => p.type !== "equipment").map(option),
    primary: current?.primary?.id ?? "",
    secondary: current?.secondary?.id ?? "",
  } as never);
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: f("GLOOM.Plan.title", { name: actor.name ?? "" }) },
    content,
    ok: { label: t("GLOOM.Plan.confirm"), icon: "fa-solid fa-check" },
    rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return;

  const find = (id: unknown) => powers.find((p) => p.id === id) ?? null;
  const primary = find(form["primary"]);
  const secondary = find(form["secondary"]);
  if (primary && secondary && primary.id === secondary.id) {
    return void ui.notifications?.warn("GLOOM.Plan.samePower", { localize: true });
  }
  const from = String(form["initiativeFrom"] ?? "primary");
  const custom = Number(form["customInitiative"]);
  let initiative: number | null =
    from === "secondary" ? secondary?.initiative ?? null
      : from === "custom" ? (Number.isFinite(custom) && custom > 0 ? custom : null)
        : primary?.initiative ?? null;
  initiative ??= primary?.initiative ?? secondary?.initiative ?? (Number.isFinite(custom) && custom > 0 ? custom : null);
  if (initiative === null) return void ui.notifications?.warn("GLOOM.Plan.noInitiative", { localize: true });

  await combatant.update({
    initiative,
    [`flags.${SYSTEM_ID}.${PLAN_FLAG}`]: { primary, secondary } satisfies Plan,
  } as never);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    content: `<p class="gloom-plan"><i class="fa-solid fa-chess"></i> ${f("GLOOM.Plan.ready", {
      name: actor.name ?? "", initiative: String(initiative),
    })}</p><p class="hint">${[primary && `${t("GLOOM.Power.primary")}: ${primary.name}`,
      secondary && `${t("GLOOM.Power.secondary")}: ${secondary.name}`].filter(Boolean).join(" · ")}</p>`,
  } as never);
}

// ---------------------------------------------------------------------------
// Enemies & other GM-controlled characters
// ---------------------------------------------------------------------------

type NpcSys = { initiative: Record<Speed, number>; category: string; controller: string };

/** Combatants are grouped by enemy type: tokens of the same world actor share initiative. */
export function typeKey(c: Combatant.Implementation): string {
  return (c.token?.actorId as string | undefined) ?? c.actorId ?? c.id!;
}

function isGmControlledNpc(c: Combatant.Implementation): boolean {
  const actor = c.actor as Actor.Implementation | null;
  return actor?.type === "npc" && !(actor.system as unknown as NpcSys).controller;
}

/** GM dialog: choose a speed for each enemy type. */
export async function planEnemies(combat: Combat.Implementation): Promise<void> {
  if (!game.user?.isGM) return;
  const groups = new Map<string, Combatant.Implementation[]>();
  for (const c of combat.combatants) {
    if (!isGmControlledNpc(c)) continue;
    const key = typeKey(c);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  if (!groups.size) return void ui.notifications?.info("GLOOM.Plan.noEnemies", { localize: true });

  const last = (combat.getFlag(SYSTEM_ID as never, "lastSpeeds" as never) as Record<string, Speed> | undefined) ?? {};
  const chosen = (combat.getFlag(SYSTEM_ID as never, "speeds" as never) as Record<string, Speed> | undefined) ?? {};
  const rows = [...groups.entries()].map(([key, list]) => {
    const actor = list[0]!.actor as Actor.Implementation;
    const init = (actor.system as unknown as NpcSys).initiative;
    const allowed = allowedSpeeds(last[key]);
    const selected = chosen[key] && allowed.includes(chosen[key]) ? chosen[key] : allowed.includes("normal") ? "normal" : allowed[0];
    return {
      key,
      name: (game.actors?.get(key)?.name ?? actor.name ?? "?"),
      count: list.length,
      last: last[key] ? t(`GLOOM.Speed.${last[key]}`) : "",
      speeds: allowed.map((s) => ({ key: s, label: `${t(`GLOOM.Speed.${s}`)} (${init[s]})`, selected: s === selected })),
    };
  });
  const content = await foundry.applications.handlebars.renderTemplate(templatePath("apps/enemy-speeds.hbs"), { rows } as never);
  const form = (await foundry.applications.api.DialogV2.input({
    window: { title: t("GLOOM.Plan.enemiesTitle") },
    content,
    ok: { label: t("GLOOM.Plan.confirm"), icon: "fa-solid fa-check" },
    rejectClose: false,
  } as never)) as Record<string, unknown> | null;
  if (!form) return;

  const speeds: Record<string, Speed> = {};
  const updates: Record<string, unknown>[] = [];
  for (const [key, list] of groups) {
    const speed = (form[`speed.${key}`] ?? (form["speed"] as Record<string, unknown> | undefined)?.[key]) as Speed | undefined;
    if (!speed) continue;
    speeds[key] = speed;
    for (const c of list) {
      const s = c.actor!.system as unknown as NpcSys;
      const elite = s.category === "elite" || s.category === "nemesis";
      updates.push({ _id: c.id, initiative: enemyInitiative(s.initiative[speed], elite) });
    }
  }
  await combat.updateEmbeddedDocuments("Combatant", updates as never);
  await combat.setFlag(SYSTEM_ID as never, "speeds" as never, speeds as never);
}

/** Summons share their controller's initiative and act just before them (p. 72). GM only. */
export async function syncSummons(combat: Combat.Implementation): Promise<void> {
  const byController = new Map<string, Combatant.Implementation[]>();
  for (const c of combat.combatants) {
    const controller = (c.actor?.system as unknown as Partial<NpcSys> | undefined)?.controller;
    if (c.actor?.type === "npc" && controller) byController.set(controller, [...(byController.get(controller) ?? []), c]);
  }
  const updates: Record<string, unknown>[] = [];
  for (const [uuid, summons] of byController) {
    const owner = combat.combatants.find((c) => c.actor?.uuid === uuid);
    if (!owner || owner.initiative === null || owner.initiative === undefined) continue;
    summons.forEach((s, i) => {
      const value = summonInitiative(owner.initiative!, i);
      if (s.initiative !== value) updates.push({ _id: s.id, initiative: value });
    });
  }
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates as never);
}

export function hasPlanned(c: Combatant.Implementation): boolean {
  return c.initiative !== null && c.initiative !== undefined;
}
