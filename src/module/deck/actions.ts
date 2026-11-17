/**
 * High-level draw actions: prompt the user, draw, resolve with the rules engine,
 * post the chat card, and apply side effects (expending a Background, ...).
 */
import { ATTRIBUTE_LABELS, ATTRIBUTES, templatePath, type AttributeKey } from "../config.ts";
import { cardView, postDrawMessage, type DrawMessageContext } from "../chat/draw-message.ts";
import {
  cardsToDraw, resolveAttack, resolveTest, type DrawMode, type TestOutcome,
} from "../rules/resolution.ts";
import { isInCombat } from "./combat-hooks.ts";
import type { DrawnCard, ModifierDeck, TemporaryKind } from "./modifier-deck.ts";
import { GM_DECK_REF } from "./registry.ts";
import { runAsGM } from "../socket.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

const OUTCOME_CSS: Record<TestOutcome, string> = {
  criticalSuccess: "crit-success",
  success: "success",
  failure: "failure",
  criticalFailure: "crit-failure",
};

const MODES: DrawMode[] = ["normal", "advantage", "disadvantage"];

async function drawFor(deck: ModifierDeck, mode: DrawMode): Promise<DrawnCard[] | null> {
  if (!deck.canModify) {
    ui.notifications?.warn("GLOOM.Notify.notDeckOwner", { localize: true });
    return null;
  }
  const needed = cardsToDraw(mode);
  const drawn = await deck.draw(needed, { inCombat: isInCombat(deck.actor) });
  if (drawn.length < needed) {
    ui.notifications?.error("GLOOM.Notify.deckEmpty", { localize: true });
    return null;
  }
  return drawn;
}

function readNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return value === "" || value === null || value === undefined || Number.isNaN(n) ? fallback : n;
}

async function input(title: string, template: string, data: Record<string, unknown>) {
  const content = await foundry.applications.handlebars.renderTemplate(templatePath(template), data as never);
  const result = await foundry.applications.api.DialogV2.input({
    window: { title },
    content,
    ok: { label: t("GLOOM.Draw.draw"), icon: "fa-solid fa-hand" },
    rejectClose: false,
  } as never);
  return (result ?? null) as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Attribute test
// ---------------------------------------------------------------------------

export interface TestOptions {
  attribute?: AttributeKey;
  /** Score override; defaults to the actor's Attribute. */
  score?: number;
}

function backgroundsOf(actor: Actor.Implementation | null) {
  if (!actor) return [];
  return actor.items.filter((i) => i.type === "background" && !(i.system as { expended: boolean }).expended);
}

export async function testAttribute(deck: ModifierDeck, options: TestOptions = {}): Promise<void> {
  const actor = deck.actor;
  const attrs = (actor?.system as { attributes?: Record<AttributeKey, number> } | undefined)?.attributes;
  const attribute = options.attribute ?? null;
  const dialogData = {
    attributes: ATTRIBUTES.map((a) => ({
      key: a,
      label: t(ATTRIBUTE_LABELS[a].label),
      score: attrs?.[a] ?? 0,
      selected: a === attribute,
    })),
    hasActor: Boolean(attrs),
    score: options.score ?? (attribute && attrs ? attrs[attribute] : 0),
    backgrounds: backgroundsOf(actor).map((b) => ({ id: b.id, name: b.name })),
    modes: MODES.map((m) => ({ key: m, label: t(`GLOOM.Mode.${m}`) })),
  };
  const title = attribute ? f("GLOOM.Test.titleAttr", { attr: t(ATTRIBUTE_LABELS[attribute].label) }) : t("GLOOM.Test.title");
  const form = await input(title, "apps/test-dialog.hbs", dialogData);
  if (!form) return;

  const chosenAttr = (form["attribute"] as AttributeKey | undefined) ?? attribute ?? undefined;
  const score = attrs && chosenAttr ? attrs[chosenAttr] : readNumber(form["score"], 0);
  const background = form["background"] ? actor?.items.get(String(form["background"])) : undefined;
  const bonus = readNumber(form["bonus"], 0) + (background ? 1 : 0);
  const tnRaw = form["tn"];
  const tn = tnRaw === "" || tnRaw === null || tnRaw === undefined ? null : readNumber(tnRaw, 0);
  const mode = (form["mode"] as DrawMode | undefined) ?? "normal";

  const drawn = await drawFor(deck, mode);
  if (!drawn) return;
  if (background) await background.update({ "system.expended": true } as never);

  const result = resolveTest({ score, bonus, tn, mode }, drawn.map((d) => d.data));
  const attrLabel = chosenAttr ? t(ATTRIBUTE_LABELS[chosenAttr].label) : t("GLOOM.Test.generic");
  const details: DrawMessageContext["details"] = [
    { label: t("GLOOM.Test.score"), value: String(score) },
  ];
  if (bonus) details.push({ label: t("GLOOM.Test.bonus"), value: bonus > 0 ? `+${bonus}` : String(bonus) });
  if (background) details.push({ label: t("GLOOM.Test.background"), value: background.name ?? "" });
  if (result.total !== null) details.push({ label: t("GLOOM.Test.total"), value: String(result.total) });
  if (tn !== null) details.push({ label: t("GLOOM.Test.tn"), value: String(tn) });

  await postDrawMessage(
    {
      title: f("GLOOM.Test.chatTitle", { attr: attrLabel }),
      subtitle: deck.label,
      cards: drawn.map((d, i) => cardView(d, i === result.keptIndex)),
      mode,
      ...(mode !== "normal" ? { modeLabel: t(`GLOOM.Mode.${mode}`) } : {}),
      tie: result.tie,
      details,
      ...(result.outcome
        ? { outcome: { label: t(`GLOOM.Outcome.${result.outcome}`), css: OUTCOME_CSS[result.outcome] } }
        : {}),
    },
    actor,
    { type: "test", attribute: chosenAttr ?? null, total: result.total, tn, outcome: result.outcome },
  );
}

// ---------------------------------------------------------------------------
// Attack
// ---------------------------------------------------------------------------

export async function drawAttack(deck: ModifierDeck): Promise<void> {
  const form = await input(t("GLOOM.Attack.title"), "apps/attack-dialog.hbs", {
    modes: MODES.map((m) => ({ key: m, label: t(`GLOOM.Mode.${m}`) })),
  });
  if (!form) return;
  const base = readNumber(form["base"], 2); // basic attack is "Attack 2" (p. 66)
  const bonus = readNumber(form["bonus"], 0);
  const shield = readNumber(form["shield"], 0);
  const mode = (form["mode"] as DrawMode | undefined) ?? "normal";

  const drawn = await drawFor(deck, mode);
  if (!drawn) return;
  const result = resolveAttack({ base, bonus, shield, mode }, drawn.map((d) => d.data));
  const details: DrawMessageContext["details"] = [{ label: t("GLOOM.Attack.base"), value: String(base) }];
  if (bonus) details.push({ label: t("GLOOM.Attack.bonus"), value: bonus > 0 ? `+${bonus}` : String(bonus) });
  details.push({ label: t("GLOOM.Attack.value"), value: String(result.attackValue) });
  if (shield) details.push({ label: t("GLOOM.Attack.shield"), value: `-${shield}` });

  const outcome = result.null
    ? { label: t("GLOOM.Attack.nullHit"), css: "crit-failure" }
    : {
        label: f("GLOOM.Attack.damage", { damage: String(result.damage) }),
        css: result.critical ? "crit-success" : "success",
      };
  const kept = drawn[result.keptIndex];
  const effect = kept?.data.effect;

  await postDrawMessage(
    {
      title: t("GLOOM.Attack.chatTitle"),
      subtitle: deck.label,
      cards: drawn.map((d, i) => cardView(d, i === result.keptIndex)),
      mode,
      ...(mode !== "normal" ? { modeLabel: t(`GLOOM.Mode.${mode}`) } : {}),
      tie: result.tie,
      details: effect ? [...details, { label: t("GLOOM.Attack.effect"), value: effect }] : details,
      outcome,
    },
    deck.actor,
    { type: "attack", damage: result.damage, critical: result.critical, null: result.null },
  );
}

// ---------------------------------------------------------------------------
// Bless / Curse
// ---------------------------------------------------------------------------

export async function addTemporary(deck: ModifierDeck, kind: TemporaryKind, count = 1): Promise<void> {
  if (deck.canModify) {
    const added = await deck.addTemporary(kind, count);
    if (added < count) ui.notifications?.info(f("GLOOM.Notify.capReached", { kind: t(`GLOOM.Card.${kind}`) }));
    return;
  }
  await runAsGM({ action: "addTemporary", deck: deck.actor?.uuid ?? GM_DECK_REF, kind, count });
}
