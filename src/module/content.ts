/**
 * Content importer: turns a private content folder (not shipped with the system) into world
 * compendiums. The folder has an index.json:
 *   { "name": "...", "iconPack": "icons/iconpack.json",
 *     "packs": [{ "name": "gloom-bestiary", "label": "...", "type": "Actor" | "Item",
 *                 "files": [{ "path": "bestiary/actors/archer.json", "folder": "Archers" }] }] }
 * Each file holds one document or an array of documents. Image paths starting with "./" are
 * resolved relative to the index, so the folder can be uploaded anywhere. Re-importing replaces
 * the contents of the packs. The icon pack named in the index is loaded too.
 */
import { SYSTEM_ID } from "./config.ts";
import { loadIconPack, resolvePath } from "./icons.ts";

interface ContentFile { path: string; folder?: string }
interface ContentPack { name: string; label: string; type: "Actor" | "Item"; files: ContentFile[] }
interface ContentIndex { name?: string; iconPack?: string; packs?: ContentPack[] }
type DocData = Record<string, unknown> & { img?: string; items?: DocData[]; prototypeToken?: { texture?: { src?: string } } };

const t = (key: string) => game.i18n!.localize(key);

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

/** Resolve "./relative" image paths against the content folder. */
function fixImages(doc: DocData, base: string): DocData {
  const fix = (p?: string) => (p?.startsWith("./") ? resolvePath(base, p.slice(2)) : p);
  const out: DocData = { ...doc };
  if (out.img) out.img = fix(out.img);
  if (out.prototypeToken?.texture?.src) {
    out.prototypeToken = { ...out.prototypeToken, texture: { ...out.prototypeToken.texture, src: fix(out.prototypeToken.texture.src) } };
  }
  if (Array.isArray(out.items)) out.items = out.items.map((i) => fixImages(i, base));
  delete out["_id"];
  return out;
}

/** Find or create the world compendium, then empty it. */
async function preparePack(def: ContentPack): Promise<CompendiumCollection.Any> {
  const id = `world.${def.name}`;
  let pack = game.packs!.get(id) as CompendiumCollection.Any | undefined;
  if (!pack) {
    pack = (await foundry.documents.collections.CompendiumCollection.createCompendium(
      { type: def.type, label: def.label, name: def.name } as never,
    )) as unknown as CompendiumCollection.Any;
  }
  if (pack.locked) await pack.configure({ locked: false } as never);
  const cls = CONFIG[def.type].documentClass as unknown as {
    deleteDocuments(ids: string[], options: object): Promise<unknown>;
  };
  const index = await pack.getIndex();
  const ids = [...index.keys()] as string[];
  if (ids.length) await cls.deleteDocuments(ids, { pack: id });
  const folderIds = pack.folders.map((f) => f.id!) as string[];
  if (folderIds.length) await Folder.implementation.deleteDocuments(folderIds, { pack: id } as never);
  return pack;
}

const levelOf = (doc: DocData): number => Number((doc["system"] as { level?: number } | undefined)?.level ?? 0) || 0;
const label = (key: string) => game.i18n!.localize(`GLOOM.Content.folder.${key}`);

/** Folder path inside the file's folder, by document type: Talents, Skills/Level N, Perks... */
function subfolder(doc: DocData): string[] {
  const system = (doc["system"] ?? {}) as { level?: number; category?: string; master?: boolean };
  switch (doc["type"]) {
    case "talent": return [label("talents")];
    case "skill": return [label("skills"), game.i18n!.format("GLOOM.Content.folder.level", { level: String(levelOf(doc)) })];
    case "perk": return [label("perks")];
    case "equipment": return [label("equipment")];
    case "background": return [system.master ? label("master") : label(system.category ?? "other")];
    default: return [];
  }
}

/** Create every folder (and its parents) once; returns "A/B/C" -> folder id. */
async function createFolders(pack: CompendiumCollection.Any, type: string, paths: string[][]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const all = new Set<string>();
  for (const p of paths) for (let d = 1; d <= p.length; d++) all.add(p.slice(0, d).join("/"));
  const byDepth = [...all].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b, undefined, { numeric: true }));
  const maxDepth = Math.max(0, ...byDepth.map((p) => p.split("/").length));
  for (let depth = 1; depth <= maxDepth; depth++) {
    const level = byDepth.filter((p) => p.split("/").length === depth);
    const created = (await Folder.implementation.createDocuments(
      level.map((p, i) => {
        const parts = p.split("/");
        return {
          name: parts.at(-1), type, sorting: "m", sort: (i + 1) * 100,
          folder: depth > 1 ? ids.get(parts.slice(0, -1).join("/")) ?? null : null,
          flags: { [SYSTEM_ID]: { path: p } },
        };
      }) as never,
      { pack: pack.collection } as never,
    )) as unknown as { id: string; flags: Record<string, { path?: string }> }[];
    for (const f of created) ids.set(f.flags[SYSTEM_ID]?.path ?? "", f.id);
  }
  return ids;
}

/** Import everything listed in the index; returns the number of documents created. */
export async function importContent(indexUrl: string): Promise<number> {
  const index = (await fetchJson(indexUrl)) as ContentIndex;
  const base = indexUrl.slice(0, indexUrl.lastIndexOf("/"));
  let total = 0;
  for (const def of index.packs ?? []) {
    ui.notifications?.info(game.i18n!.format("GLOOM.Content.importing", { label: def.label }));
    const pack = await preparePack(def);
    const entries: { doc: DocData; path: string[] }[] = [];
    for (const file of def.files) {
      const data = await fetchJson(resolvePath(base, file.path));
      for (const doc of (Array.isArray(data) ? data : [data]) as DocData[]) {
        if (!doc || typeof doc !== "object" || typeof doc["type"] !== "string") continue;
        const path = [...(file.folder ? [file.folder] : []), ...subfolder(doc)];
        entries.push({ doc: fixImages(doc, base), path });
      }
    }
    const folderId = await createFolders(pack, def.type, entries.map((e) => e.path));
    const docs = entries.map(({ doc, path }, i) => ({
      ...doc,
      folder: path.length ? folderId.get(path.join("/")) ?? null : null,
      // Within a folder: by level, then in file order.
      sort: levelOf(doc) * 1000 + i,
    }));
    const cls = CONFIG[def.type].documentClass as unknown as {
      createDocuments(data: object[], options: object): Promise<unknown[]>;
    };
    total += (await cls.createDocuments(docs, { pack: pack.collection })).length;
  }
  await game.settings!.set(SYSTEM_ID, "contentIndex", indexUrl);
  return total;
}

/** Settings menu: choose the content index and import it. */
export class ContentImportMenu extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = { id: "gloomfoundry-content-import", window: { title: "GLOOM.Content.title" } } as never;

  override async render(): Promise<this> {
    const last = game.settings!.get(SYSTEM_ID, "contentIndex") as string;
    const buttons = [
      { action: "pick", label: t("GLOOM.Content.pick"), icon: "fa-solid fa-folder-open", default: !last },
    ];
    if (last) buttons.unshift({ action: "again", label: t("GLOOM.Content.again"), icon: "fa-solid fa-rotate", default: true });
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("GLOOM.Content.title") },
      content: `<p>${t("GLOOM.Content.hint")}</p>${last ? `<p><strong>${t("GLOOM.Content.last")}</strong> <code>${last}</code></p>` : ""}`,
      buttons,
      rejectClose: false,
    } as never);
    if (choice === "again") void run(last);
    else if (choice === "pick") {
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      new FilePicker({ type: "text", callback: (path: string) => void run(path) } as never).browse();
    }
    return this;
  }
}

async function run(indexUrl: string): Promise<void> {
  try {
    const count = await importContent(indexUrl);
    ui.notifications?.info(game.i18n!.format("GLOOM.Content.done", { count: String(count) }));
    const index = (await fetchJson(indexUrl)) as ContentIndex;
    if (index.iconPack) {
      // Loading the icon pack reloads the page, so it comes last.
      await loadIconPack(resolvePath(indexUrl.slice(0, indexUrl.lastIndexOf("/")), index.iconPack));
    }
  } catch (err) {
    console.error("GloomFoundry | Content import failed", err);
    ui.notifications?.error(game.i18n!.format("GLOOM.Import.failed", { error: String(err) }));
  }
}

export function registerContentSettings(): void {
  game.settings!.register(SYSTEM_ID, "contentIndex", { scope: "world", config: false, type: String, default: "" } as never);
  game.settings!.registerMenu(SYSTEM_ID, "contentImportMenu", {
    name: "GLOOM.Content.title",
    label: "GLOOM.Content.menuLabel",
    hint: "GLOOM.Content.menuHint",
    icon: "fa-solid fa-book-atlas",
    type: ContentImportMenu,
    restricted: true,
  } as never);
}
