/**
 * Import perk Items from a JSON file (an array of Item data, or a single Item).
 * The file can live on the Foundry server / Forge Assets Library, or on the user's computer.
 * No perk content ships with the system: players supply their own files.
 */
const t = (key: string) => game.i18n!.localize(key);

interface PerkFileEntry {
  _id?: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
}

/** Create the perks found in `data` on `actor`, skipping names the actor already has. */
export async function importPerkData(actor: Actor.Implementation, data: unknown): Promise<number> {
  const list = (Array.isArray(data) ? data : [data]) as PerkFileEntry[];
  const perks = list.filter((d) => d && typeof d === "object" && d.type === "perk");
  if (!perks.length) {
    ui.notifications?.warn("GLOOM.Perk.import.noPerks", { localize: true });
    return 0;
  }
  const existing = new Set(actor.items.filter((i) => i.type === "perk").map((i) => i.name));
  const toCreate = perks
    .filter((p) => !existing.has(p.name ?? ""))
    .map(({ _id, ...rest }) => rest);
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate as never);
  ui.notifications?.info(game.i18n!.format("GLOOM.Perk.import.done", {
    count: String(toCreate.length),
    skipped: String(perks.length - toCreate.length),
  }));
  return toCreate.length;
}

export async function importPerksFromUrl(actor: Actor.Implementation, url: string): Promise<number> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await importPerkData(actor, await response.json());
  } catch (err) {
    console.error("GloomFoundry | Perk import failed", err);
    ui.notifications?.error(game.i18n!.format("GLOOM.Perk.import.failed", { error: String(err) }));
    return 0;
  }
}

function pickFromServer(actor: Actor.Implementation): void {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const picker = new FilePicker({
    type: "text",
    callback: (path: string) => void importPerksFromUrl(actor, path),
  } as never);
  void picker.browse();
}

function pickFromComputer(actor: Actor.Implementation): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importPerkData(actor, JSON.parse(await file.text()));
    } catch (err) {
      ui.notifications?.error(game.i18n!.format("GLOOM.Perk.import.failed", { error: String(err) }));
    }
  });
  input.click();
}

/** Ask where to import from, then import. */
export async function promptImportPerks(actor: Actor.Implementation): Promise<void> {
  const source = await foundry.applications.api.DialogV2.wait({
    window: { title: t("GLOOM.Perk.import.title") },
    content: `<p>${t("GLOOM.Perk.import.hint")}</p>`,
    buttons: [
      { action: "server", label: t("GLOOM.Perk.import.fromServer"), icon: "fa-solid fa-server", default: true },
      { action: "computer", label: t("GLOOM.Perk.import.fromComputer"), icon: "fa-solid fa-laptop" },
    ],
    rejectClose: false,
  } as never);
  if (source === "server") pickFromServer(actor);
  else if (source === "computer") pickFromComputer(actor);
}
