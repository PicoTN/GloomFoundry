/**
 * Icon packs: replace the system's default icons with your own (e.g. official icons kept in a
 * private content folder). A pack is a JSON manifest:
 *   { "name": "...", "icons": { "condition.poison": "conditions/poison.webp", "element.fire": "...",
 *                               "card.back": "...", "card.atk-p1-attr4": "...", "stat.attack": "..." } }
 * with paths relative to the manifest. The GM loads it once (Settings > GloomFoundry > Icon pack);
 * the resolved map is cached in a world setting and applied at startup.
 */
import { SYSTEM_ID } from "./config.ts";

export type IconMap = Record<string, string>;

declare global {
  interface CONFIG {
    GLOOM?: { icons: IconMap };
  }
}

const t = (key: string) => game.i18n!.localize(key);

/** Look up an icon override (undefined if the pack doesn't provide it). */
export function iconOverride(key: string): string | undefined {
  return CONFIG.GLOOM?.icons[key];
}

/** Call during init, after settings are registered. */
export function applyIconPack(): void {
  const stored = game.settings!.get(SYSTEM_ID, "iconPack") as { name?: string; icons?: IconMap } | undefined;
  CONFIG.GLOOM = { icons: { ...(stored?.icons ?? {}) } };
}

export function resolvePath(base: string, path: string): string {
  if (/^(https?:|data:|\/)/.test(path)) return path;
  return `${base}/${path}`.replace(/\/+/g, "/").replace(/^(https?:)\//, "$1//");
}

/** Read a manifest from a URL/path and store the resolved icon map. */
export async function loadIconPack(manifestUrl: string): Promise<number> {
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const manifest = (await response.json()) as { name?: string; icons?: IconMap };
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/"));
  const icons = Object.fromEntries(Object.entries(manifest.icons ?? {}).map(([k, v]) => [k, resolvePath(base, v)]));
  await game.settings!.set(SYSTEM_ID, "iconPack", { name: manifest.name ?? manifestUrl, manifest: manifestUrl, icons } as never);
  return Object.keys(icons).length;
}

/** Settings menu: pick a manifest with the file picker (server / Forge assets). */
export class IconPackMenu extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = { id: "gloomfoundry-icon-pack", window: { title: "GLOOM.IconPack.title" } } as never;

  override async render(): Promise<this> {
    const stored = game.settings!.get(SYSTEM_ID, "iconPack") as { name?: string; icons?: IconMap } | undefined;
    const count = Object.keys(stored?.icons ?? {}).length;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("GLOOM.IconPack.title") },
      content: `<p>${t("GLOOM.IconPack.hint")}</p><p><strong>${t("GLOOM.IconPack.current")}</strong> ${
        count ? `${stored?.name ?? ""} (${count})` : t("GLOOM.IconPack.none")}</p>`,
      buttons: [
        { action: "load", label: t("GLOOM.IconPack.load"), icon: "fa-solid fa-folder-open", default: true },
        { action: "clear", label: t("GLOOM.IconPack.clear"), icon: "fa-solid fa-eraser" },
      ],
      rejectClose: false,
    } as never);
    if (choice === "clear") {
      await game.settings!.set(SYSTEM_ID, "iconPack", {} as never);
      ui.notifications?.info("GLOOM.IconPack.cleared", { localize: true });
    } else if (choice === "load") {
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      new FilePicker({
        type: "text",
        callback: async (path: string) => {
          try {
            const n = await loadIconPack(path);
            ui.notifications?.info(game.i18n!.format("GLOOM.IconPack.loaded", { count: String(n) }));
          } catch (err) {
            ui.notifications?.error(game.i18n!.format("GLOOM.Import.failed", { error: String(err) }));
          }
        },
      } as never).browse();
    }
    return this;
  }
}

export function registerIconPackSettings(): void {
  game.settings!.register(SYSTEM_ID, "iconPack", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => foundry.utils.debouncedReload?.(),
  } as never);
  game.settings!.registerMenu(SYSTEM_ID, "iconPackMenu", {
    name: "GLOOM.IconPack.title",
    label: "GLOOM.IconPack.menuLabel",
    hint: "GLOOM.IconPack.menuHint",
    icon: "fa-solid fa-icons",
    type: IconPackMenu,
    restricted: true,
  } as never);
}
