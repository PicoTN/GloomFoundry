/**
 * Import Items from JSON files (an array of Item data, or a single Item).
 * The file can live on the Foundry server / Forge Assets Library, or on the user's computer.
 * No official content ships with the system: players supply their own files.
 */
const t = (key: string) => game.i18n!.localize(key);

export interface ItemFileEntry {
  _id?: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function pickFromServer(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const picker = new FilePicker({
      type: "text",
      callback: (path: string) => fetchJson(path).then(resolve, reject),
    } as never);
    void picker.browse();
  });
}

function pickFromComputer(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(JSON.parse(await file.text()));
      } catch (err) {
        reject(err);
      }
    });
    input.click();
  });
}

/** Ask where to read a JSON file from, then return its Item entries (or null if cancelled). */
export async function promptItemFile(title: string, hint: string): Promise<ItemFileEntry[] | null> {
  const source = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<p>${hint}</p>`,
    buttons: [
      { action: "server", label: t("GLOOM.Import.fromServer"), icon: "fa-solid fa-server", default: true },
      { action: "computer", label: t("GLOOM.Import.fromComputer"), icon: "fa-solid fa-laptop" },
    ],
    rejectClose: false,
  } as never);
  if (source !== "server" && source !== "computer") return null;
  try {
    const data = await (source === "server" ? pickFromServer() : pickFromComputer());
    if (data === null) return null;
    const list = (Array.isArray(data) ? data : [data]) as ItemFileEntry[];
    return list.filter((d) => d && typeof d === "object" && typeof d.type === "string");
  } catch (err) {
    console.error("GloomFoundry | Import failed", err);
    ui.notifications?.error(game.i18n!.format("GLOOM.Import.failed", { error: String(err) }));
    return null;
  }
}

/** Create the items of the given types on `actor`, skipping names the actor already has. */
export async function importItemsToActor(
  actor: Actor.Implementation,
  entries: ItemFileEntry[],
  types: string[],
): Promise<number> {
  const wanted = entries.filter((e) => types.includes(e.type ?? ""));
  if (!wanted.length) {
    ui.notifications?.warn("GLOOM.Import.nothing", { localize: true });
    return 0;
  }
  const existing = new Set(actor.items.map((i) => `${i.type}:${i.name}`));
  const toCreate = wanted.filter((p) => !existing.has(`${p.type}:${p.name}`)).map(({ _id, ...rest }) => rest);
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate as never);
  ui.notifications?.info(game.i18n!.format("GLOOM.Import.done", {
    count: String(toCreate.length),
    skipped: String(wanted.length - toCreate.length),
  }));
  return toCreate.length;
}

export async function promptImportPerks(actor: Actor.Implementation): Promise<void> {
  const entries = await promptItemFile(t("GLOOM.Perk.import.title"), t("GLOOM.Perk.import.hint"));
  if (entries) await importItemsToActor(actor, entries, ["perk"]);
}

export async function promptImportItems(actor: Actor.Implementation, types: string[]): Promise<void> {
  const entries = await promptItemFile(t("GLOOM.Import.title"), t("GLOOM.Import.hint"));
  if (entries) await importItemsToActor(actor, entries, types);
}
