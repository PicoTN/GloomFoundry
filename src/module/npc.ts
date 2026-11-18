/**
 * NPC helpers: defaults on creation, switching sides, campaign level and Threat.
 */
import { mercenaryCount } from "./data/npc.ts";
import { campaignLevel } from "./rules/npc.ts";
import { DISPOSITION } from "./rules/sides.ts";

const t = (key: string) => game.i18n!.localize(key);

/** Levels of the player-owned mercenaries. */
export function partyLevels(): number[] {
  return (game.actors ?? [])
    .filter((a) => a.type === "mercenary" && a.hasPlayerOwner)
    .map((a) => (a.system as unknown as { level: number }).level);
}

export function currentCampaignLevel(): number {
  return campaignLevel(partyLevels());
}

/** A character's side: its token's disposition, or the prototype token's for a world actor. */
export function dispositionOf(actor: Actor.Implementation): number {
  const token = actor.token ?? actor.getActiveTokens(true, true)[0];
  return (token?.disposition ?? actor.prototypeToken.disposition) as number;
}

/**
 * Switch a character between Friendly and Hostile (charmed, allied or betraying NPCs).
 * From a token's sheet only that token changes; from a world actor, the default and its
 * linked tokens change.
 */
export async function switchSide(actor: Actor.Implementation): Promise<void> {
  const current = dispositionOf(actor);
  const next = current === DISPOSITION.HOSTILE ? DISPOSITION.FRIENDLY : DISPOSITION.HOSTILE;
  if (actor.isToken && actor.token) {
    await actor.token.update({ disposition: next } as never);
  } else {
    await actor.update({ "prototypeToken.disposition": next } as never);
    for (const scene of game.scenes ?? []) {
      const updates = scene.tokens
        .filter((tok) => tok.actorId === actor.id && tok.actorLink)
        .map((tok) => ({ _id: tok.id, disposition: next }));
      if (updates.length) await scene.updateEmbeddedDocuments("Token", updates as never);
    }
  }
  ui.notifications?.info(game.i18n!.format(next === DISPOSITION.HOSTILE ? "GLOOM.Side.nowHostile" : "GLOOM.Side.nowFriendly", {
    name: actor.name ?? "",
  }));
}

/** Total Threat of the hostile NPC tokens on a scene (default: the viewed scene). */
export function sceneThreat(scene = canvas?.scene): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const token of scene?.tokens ?? []) {
    const actor = token.actor as Actor.Implementation | null;
    if (actor?.type !== "npc" || token.disposition !== DISPOSITION.HOSTILE) continue;
    if ((actor.system as unknown as { hp: { value: number } }).hp.value <= 0) continue;
    total += (actor.system as unknown as { current: { threat: number } }).current.threat;
    count += 1;
  }
  return { total, count };
}

function resetNpcs(): void {
  for (const actor of game.actors ?? []) if (actor.type === "npc") actor.reset();
}

export function registerNpcHooks(): void {
  Hooks.on("preCreateActor", (actor, data) => {
    const a = actor as Actor.Implementation;
    if (a.pack) return;
    const given = (data as { prototypeToken?: { disposition?: number } }).prototypeToken?.disposition;
    if (a.type === "npc") {
      // Enemies taken from a compendium start at the current CL; otherwise keep the given level.
      const fromCompendium = !!(data as { _stats?: { compendiumSource?: string } })._stats?.compendiumSource;
      const level = (data as { system?: { level?: number } }).system?.level;
      a.updateSource({
        "system.level": fromCompendium || level === undefined ? currentCampaignLevel() : level,
        "prototypeToken.disposition": given ?? DISPOSITION.HOSTILE,
        "prototypeToken.bar1.attribute": "hp",
      } as never);
    } else if (a.type === "mercenary") {
      a.updateSource({
        "prototypeToken.disposition": given ?? DISPOSITION.FRIENDLY,
        "prototypeToken.actorLink": true,
        "prototypeToken.bar1.attribute": "hp",
      } as never);
    }
  });

  // New NPCs start at full health.
  Hooks.on("createActor", (actor, _options, userId) => {
    const a = actor as Actor.Implementation;
    if (a.type !== "npc" || a.pack || userId !== game.user?.id) return;
    const hp = (a.system as unknown as { hp: { value: number; max: number } }).hp;
    if (hp.value < hp.max) void a.update({ "system.hp.value": hp.max } as never);
  });

  // Nemesis stats depend on the number of mercenaries (M): recompute when it may change.
  Hooks.once("ready", resetNpcs);
  for (const hook of ["createActor", "deleteActor"] as const) {
    Hooks.on(hook, (actor: Actor.Implementation) => {
      if (actor.type === "mercenary") resetNpcs();
    });
  }

  // "Switch side" button in the token HUD.
  Hooks.on("renderTokenHUD", (hud, html) => {
    const actor = (hud as { object?: { actor?: Actor.Implementation } }).object?.actor;
    if (!actor?.isOwner || actor.type === "mercenary") return;
    const root = html as HTMLElement;
    const column = root.querySelector(".col.right");
    if (!column || column.querySelector(".gloom-switch-side")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon gloom-switch-side";
    button.dataset["tooltip"] = t("GLOOM.Side.switch");
    button.innerHTML = `<i class="fa-solid fa-people-arrows"></i>`;
    button.addEventListener("click", () => void switchSide(actor));
    column.append(button);
  });
}

export { mercenaryCount };
