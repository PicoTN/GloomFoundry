#!/usr/bin/env node
/**
 * Check a GloomFoundry content pack before importing it.
 *
 *   node tools/validate-pack.mjs path/to/index.json
 *
 * Reads the index, every file it lists, and checks: document types, the fields GloomFoundry
 * relies on (class/ancestry flags for level-up options, grants, starting items), structured
 * actions (docs/reference/actions.md), perk cards and class mechanics. Prints errors (things
 * that will not work) and warnings (things that may surprise you). Exit code 1 on errors.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const indexPath = process.argv[2];
if (!indexPath) {
  console.error("Usage: node tools/validate-pack.mjs path/to/index.json");
  process.exit(2);
}
const root = dirname(indexPath);
const errors = [];
const warnings = [];
const err = (at, msg) => errors.push(`${at}: ${msg}`);
const warn = (at, msg) => warnings.push(`${at}: ${msg}`);

const ITEM_TYPES = ["background", "perk", "skill", "talent", "equipment", "class", "ancestry", "npcAction", "faction", "companyBenefit"];
const ACTOR_TYPES = ["mercenary", "npc", "company", "shop"];
const ELEMENTS = ["air", "dark", "earth", "fire", "ice", "light"];
const CONDITIONS = ["Bless", "Curse", "Immobilize", "Invisible", "Muddle", "Pacify", "Poison", "Regenerate", "Safeguard", "Strengthen", "Stun", "Ward", "Wound"];
const SHAPES = ["cluster", "line", "arc", "cone", "circle", "all"];
const SLOTS = ["head", "body", "hand", "feet", "small", "none"];
const RARITIES = ["common", "uncommon", "rare", "masterwork", "legendary"];
const MECHANICS = ["state", "counters", "slot", "mark", "pool", "summons"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Actions

function area(a, at) {
  if (a === null || a === undefined) return;
  if (!SHAPES.includes(a.shape) || !isNum(a.size)) return err(at, `bad area ${JSON.stringify(a)}`);
  if (a.anchor !== undefined && !["adjacent", "range"].includes(a.anchor)) err(at, `area anchor must be "adjacent" or "range"`);
}
function conditions(list, at) {
  if (!Array.isArray(list)) return err(at, "conditions must be an array");
  for (const c of list) if (!CONDITIONS.includes(c)) err(at, `unknown condition "${c}" (capitalized: ${CONDITIONS.join(", ")})`);
}
function trigger(b, at, what) {
  for (const e of b.elements ?? []) if (!ELEMENTS.includes(e)) err(at, `unknown element "${e}"`);
  if (b.conditions) conditions(b.conditions, at);
  if (b.area) area(b.area, at);
  if (!b.elements && !b.anyElement && !b.when && !b.state && !b.targetMark && !b.perTargetMark && !b.allyMark && !b.counters && !b.spend) {
    err(at, `${what} without a trigger (elements, anyElement, when, state, targetMark, perTargetMark, allyMark, counters or spend)`);
  }
}
function action(a, at) {
  if (!a || typeof a !== "object") return err(at, "action must be an object");
  const need = (...keys) => keys.forEach((k) => { if (a[k] === undefined) err(at, `${a.kind} needs "${k}"`); });
  switch (a.kind) {
    case "attack": need("value", "relative", "range", "targets", "pierce", "area", "conditions"); area(a.area, at); conditions(a.conditions ?? [], at); break;
    case "heal": need("value", "self", "range", "conditions"); conditions(a.conditions ?? [], at); break;
    case "move": case "shield": case "retaliate": need("value"); break;
    case "taunt": case "summon": break;
    case "condition": need("id", "self");
      if (!CONDITIONS.map((c) => c.toLowerCase()).includes(a.id)) err(at, `unknown condition id "${a.id}" (lowercase)`); break;
    case "infuse": need("elements", "either"); for (const e of a.elements ?? []) if (!ELEMENTS.includes(e)) err(at, `unknown element "${e}"`); break;
    case "area": need("area"); area(a.area, at); break;
    case "trap": need("count", "damage", "effects"); break;
    case "obstacle": need("count"); break;
    case "space": need("label", "effect"); break;
    case "forced": need("dir", "value"); if (!["push", "pull"].includes(a.dir)) err(at, `forced dir must be "push" or "pull"`); break;
    case "mark": need("id"); break;
    case "gain": need("id", "counter", "count"); break;
    case "play": need("id", "name"); break;
    case "give": need("id"); break;
    case "choice": need("pick", "options");
      (a.options ?? []).forEach((opt, i) => (opt ?? []).forEach((x, j) => action(x, `${at} option ${i + 1}.${j + 1}`))); break;
    case "text": need("text"); break;
    default: err(at, `unknown action kind "${a.kind}"`);
  }
  for (const b of a.bonuses ?? []) trigger(b, `${at} bonus`, "bonus");
  if (a.requires) trigger(a.requires, `${at} requires`, "requirement");
  if (a.variable !== undefined && typeof a.variable !== "boolean") err(at, "variable must be true or false");
  if (a.performer !== undefined && !["self", "companion", "summon", "ally", "enemy"].includes(a.performer)) err(at, `bad performer "${a.performer}"`);
}
function actions(value, at) {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "object" || Array.isArray(value)) { err(at, "system.actions must be an object like {\"primary\": [...]}"); return 0; }
  let n = 0;
  for (const [key, list] of Object.entries(value)) {
    if (!["primary", "secondary", "effect", "description", "passive"].includes(key)) warn(at, `actions key "${key}" is not shown anywhere`);
    if (!Array.isArray(list)) { err(`${at}.${key}`, "must be an array of actions"); continue; }
    list.forEach((a, i) => action(a, `${at}.${key}[${i}]`));
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Documents

// Same codes as the perk editor: "7♥", "7H", "10s", "a♣", "RJ" / "BJ" (jokers); lists split on spaces , + / ;
const CARD = /^(?:RJ|BJ|JOKER-RED|JOKER-BLACK|(?:10|[2-9AJQK])[♠♤♥♡♦♢♣♧SHDC])$/i;
let checkedActions = 0;

function item(doc, at, inside = false) {
  if (!ITEM_TYPES.includes(doc.type)) return err(at, `unknown Item type "${doc.type}"`);
  const s = doc.system ?? {};
  const fl = doc.flags?.gloomfoundry ?? {};
  checkedActions += actions(s.actions, `${at} actions`);
  switch (doc.type) {
    case "skill":
      if (s.source === "ancestry" ? !fl.ancestry : !fl.class) warn(at, `no flags.gloomfoundry.${s.source === "ancestry" ? "ancestry" : "class"}: the Level up dialog won't offer it`);
      if (s.initiative !== null && s.initiative !== undefined && !(s.initiative >= 1 && s.initiative <= 100)) err(at, "initiative must be 1-100");
      break;
    case "talent":
      if (!fl.class && !inside) warn(at, "no flags.gloomfoundry.class: the Level up dialog won't offer it");
      if (s.kind && !["active", "passive"].includes(s.kind)) err(at, `talent kind must be "active" or "passive"`);
      break;
    case "equipment":
      if (s.slot && !SLOTS.includes(s.slot)) err(at, `slot must be one of ${SLOTS.join(", ")}`);
      if (s.rarity && !RARITIES.includes(s.rarity)) err(at, `rarity must be one of ${RARITIES.join(", ")}`);
      if (s.slot === "hand" && !s.initiative) warn(at, "Hand items usually have an initiative");
      break;
    case "perk":
      (s.steps ?? []).forEach((step, i) => {
        for (const code of String(step.remove ?? "").replace(/\uFE0F/g, "").split(/[\s,+/;]+/).filter(Boolean)) if (!CARD.test(code)) err(`${at} step ${i + 1}`, `bad card code "${code}"`);
        (step.add ?? []).forEach((c, j) => {
          if (!CARD.test(String(c.card ?? ""))) err(`${at} step ${i + 1} card ${j + 1}`, `bad card code "${c.card}"`);
          if (!["number", "critical", "null"].includes(c.attackKind)) err(`${at} step ${i + 1} card ${j + 1}`, "attackKind must be number, critical or null");
          if (c.actions) { c.actions.forEach((a, k) => action(a, `${at} step ${i + 1} card ${j + 1} action ${k + 1}`)); checkedActions++; }
        });
      });
      break;
    case "class":
      if (s.hpTrack && !["low", "medium", "high"].includes(s.hpTrack)) err(at, "hpTrack must be low, medium or high");
      (s.grants ?? []).forEach((g, i) => item(g, `${at} grant ${i + 1} (${g.name})`, true));
      (s.startingItems ?? []).forEach((g, i) => item(g, `${at} starting item ${i + 1} (${g.name})`, true));
      (s.mechanics ?? []).forEach((m, i) => mechanic(m, `${at} mechanic ${i + 1}`));
      break;
    case "ancestry":
      (s.grants ?? []).forEach((g, i) => item(g, `${at} grant ${i + 1} (${g.name})`, true));
      break;
    case "background":
      if (s.category && !["occupation", "origin", "social"].includes(s.category)) err(at, "category must be occupation, origin or social");
      break;
  }
}

function mechanic(m, at) {
  if (!MECHANICS.includes(m.type)) return err(at, `unknown mechanic type "${m.type}"`);
  if (!m.id || !m.label) err(at, "needs id and label");
  if (m.type === "counters" && (!Array.isArray(m.counters) || !isNum(m.max))) err(at, "counters needs counters[] and max");
  if (m.type === "slot" && !isNum(m.max)) err(at, "slot needs max");
  if (m.type === "mark" && !["enemy", "ally", "any"].includes(m.on)) err(at, `mark needs on: "enemy", "ally" or "any"`);
  if (m.type === "pool" && !Array.isArray(m.items)) err(at, "pool needs items[]");
  if (m.type === "summons" && !Array.isArray(m.summons)) err(at, "summons needs summons[]");
  for (const o of [...(m.options ?? []), ...(m.items ?? [])]) (o.actions ?? []).forEach((a, i) => action(a, `${at} ${o.name} action ${i + 1}`));
}

function actor(doc, at) {
  if (!ACTOR_TYPES.includes(doc.type)) return err(at, `unknown Actor type "${doc.type}"`);
  for (const [i, it] of (doc.items ?? []).entries()) {
    if (it.type === "npcAction") {
      checkedActions += actions(it.system?.actions, `${at} action "${it.name}"`);
      if (!it.system?.actions?.description?.length) warn(`${at} action "${it.name}"`, "no structured actions: buttons come from the text parser");
    } else item(it, `${at} item ${i + 1}`);
  }
  if (doc.type === "npc" && doc.system?.mode === "table") {
    const rows = doc.system?.stats?.normal ?? [];
    if (rows.length && rows.length !== 8) warn(at, `stat table has ${rows.length} rows (one per CL 0-7 expected)`);
  }
}

function image(path, at) {
  if (typeof path === "string" && path.startsWith("./") && !existsSync(join(root, path.slice(2)))) warn(at, `image not found: ${path}`);
}

// ---------------------------------------------------------------------------

const index = JSON.parse(readFileSync(indexPath, "utf8"));
let documents = 0;
const names = new Map();
for (const pack of index.packs ?? []) {
  if (!pack.name || !/^[a-z0-9-]+$/.test(pack.name)) err(`pack ${pack.label ?? "?"}`, "name must be lowercase letters, digits and dashes");
  if (!["Actor", "Item", "JournalEntry"].includes(pack.type)) err(`pack ${pack.name}`, "type must be Actor, Item or JournalEntry");
  for (const file of pack.files ?? []) {
    const path = join(root, file.path);
    if (!existsSync(path)) { err(file.path, "file not found"); continue; }
    let data;
    try { data = JSON.parse(readFileSync(path, "utf8")); } catch (e) { err(file.path, `invalid JSON: ${e.message}`); continue; }
    for (const [i, doc] of (Array.isArray(data) ? data : [data]).entries()) {
      const at = `${file.path} #${i + 1} "${doc.name ?? "?"}"`;
      documents++;
      if (!doc.name) err(at, "missing name");
      image(doc.img, at);
      image(doc.prototypeToken?.texture?.src, at);
      if (pack.type === "Item") item(doc, at);
      else if (pack.type === "Actor") actor(doc, at);
      const key = `${pack.name}|${doc.type}|${doc.name}|${doc.flags?.gloomfoundry?.class ?? ""}`;
      if (names.has(key)) warn(at, `same name and type as ${names.get(key)}`);
      names.set(key, at);
    }
  }
}
if (index.iconPack && !existsSync(join(root, index.iconPack))) err("index.json", `icon pack not found: ${index.iconPack}`);

for (const w of warnings) console.warn(`warning  ${w}`);
for (const e of errors) console.error(`ERROR    ${e}`);
console.log(`\n${documents} documents, ${checkedActions} action lists checked: ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
