/**
 * Refresh a character's items from the compendiums: rules data (texts, actions, mechanics,
 * perks' cards...) is replaced by the compendium version, while the item's state at the table
 * (ready/expended, prepared, perk boxes taken, quantity, uses, equipped, faction standing) is kept.
 * Items are matched by their compendium source, or by type + name (+ class/ancestry).
 */
import { SYSTEM_ID } from "./config.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

/** Fields that describe the item's state at the table, never overwritten. */
const KEEP = ["state", "prepared", "taken", "equipped", "quantity", "expended", "tier", "member", "successes", "failures", "active", "grants"];

type Index = Map<string, string>;

async function buildIndex(): Promise<Index> {
  const index: Index = new Map();
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item" || !pack.visible) continue;
    const entries = await pack.getIndex({ fields: ["type", `flags.${SYSTEM_ID}.class`, `flags.${SYSTEM_ID}.ancestry`] as never });
    for (const e of entries) {
      const fl = ((e as { flags?: Record<string, { class?: string; ancestry?: string }> }).flags ?? {})[SYSTEM_ID] ?? {};
      const key = `${(e as { type?: string }).type}|${e.name}|${fl.class ?? fl.ancestry ?? ""}`;
      if (!index.has(key)) index.set(key, (e as { uuid: string }).uuid);
      const loose = `${(e as { type?: string }).type}|${e.name}|`;
      if (!index.has(loose)) index.set(loose, (e as { uuid: string }).uuid);
    }
  }
  return index;
}

export async function refreshFromCompendiums(actor: Actor.Implementation): Promise<void> {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("GLOOM.Refresh.title") },
    content: `<p>${t("GLOOM.Refresh.confirm")}</p>`,
  } as never);
  if (!ok) return;
  const index = await buildIndex();
  const updates: Record<string, unknown>[] = [];
  for (const item of actor.items) {
    const fl = (item.flags as Record<string, { class?: string; ancestry?: string }>)[SYSTEM_ID] ?? {};
    const source = (item as unknown as { _stats?: { compendiumSource?: string } })._stats?.compendiumSource
      ?? index.get(`${item.type}|${item.name}|${fl.class ?? fl.ancestry ?? ""}`)
      ?? index.get(`${item.type}|${item.name}|`);
    if (!source) continue;
    const doc = (await fromUuid(source)) as Item.Implementation | null;
    if (!doc || doc.type !== item.type) continue;
    const system = foundry.utils.deepClone(doc.toObject().system) as Record<string, unknown>;
    const current = item.toObject().system as Record<string, unknown>;
    for (const key of KEEP) if (key in current) system[key] = current[key];
    // Keep spent uses.
    if (current["uses"] && system["uses"]) (system["uses"] as Record<string, unknown>)["spent"] = (current["uses"] as Record<string, unknown>)["spent"];
    updates.push({ _id: item.id, img: doc.img, system, "_stats.compendiumSource": source });
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never, { diff: false, recursive: false } as never);
  ui.notifications?.info(f("GLOOM.Refresh.done", { count: String(updates.length) }));
}
