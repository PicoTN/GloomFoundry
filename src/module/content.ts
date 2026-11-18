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

/** Import everything listed in the index; returns the number of documents created. */
export async function importContent(indexUrl: string): Promise<number> {
  const index = (await fetchJson(indexUrl)) as ContentIndex;
  const base = indexUrl.slice(0, indexUrl.lastIndexOf("/"));
  let total = 0;
  for (const def of index.packs ?? []) {
    ui.notifications?.info(game.i18n!.format("GLOOM.Content.importing", { label: def.label }));
    const pack = await preparePack(def);
    const folderNames = [...new Set(def.files.map((f) => f.folder).filter((f): f is string => !!f))];
    const folders = folderNames.length
      ? ((await Folder.implementation.createDocuments(
          folderNames.map((name) => ({ name, type: def.type, sorting: "a" })) as never,
          { pack: pack.collection } as never,
        )) as unknown as { id: string; name: string }[])
      : [];
    const folderId = new Map(folders.map((f) => [f.name, f.id]));
    const docs: DocData[] = [];
    for (const file of def.files) {
      const data = await fetchJson(resolvePath(base, file.path));
      for (const doc of (Array.isArray(data) ? data : [data]) as DocData[]) {
        if (!doc || typeof doc !== "object" || typeof doc["type"] !== "string") continue;
        docs.push({ ...fixImages(doc, base), folder: file.folder ? folderId.get(file.folder) ?? null : null });
      }
    }
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
