/**
 * Markers on placed regions: traps, obstacles and marked spaces get an icon and a short name in
 * each hex, so they read at a glance (the region colour alone says little). Attack areas are
 * temporary and keep only their colour.
 */
import { SYSTEM_ID } from "../config.ts";

const ICONS: Record<string, string> = {
  trap: "icons/svg/trap.svg",
  obstacle: "icons/svg/ruins.svg",
  space: "icons/svg/aura.svg",
};

const MARKER = "gloomMarker";

type Container = PIXI.Container & { name: string | null };

/** Flat polygon points -> centre of the shape's bounding box. */
function centre(points: number[]): { x: number; y: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]!); maxX = Math.max(maxX, points[i]!);
    minY = Math.min(minY, points[i + 1]!); maxY = Math.max(maxY, points[i + 1]!);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** "Teleportation Pad: you and your allies..." -> "Teleportation Pad". */
function shortName(name: string): string {
  const head = name.split(":")[0]!.trim();
  return head.length > 24 ? `${head.slice(0, 23)}…` : head;
}

async function drawMarkers(region: PlaceableObject): Promise<void> {
  const doc = region.document as unknown as {
    name: string; shapes: { type: string; points?: number[] }[]; flags: Record<string, { kind?: string } | undefined>;
  };
  const kind = doc.flags[SYSTEM_ID]?.kind ?? "";
  const container = region as unknown as Container;
  container.children.filter((c) => (c as Container).name === MARKER).forEach((c) => c.destroy({ children: true }));
  const src = ICONS[kind];
  if (!src) return;
  const loadTexture = (foundry.canvas as unknown as { loadTexture(src: string): Promise<PIXI.Texture | null> }).loadTexture;
  const texture = await loadTexture(src);
  if (!texture || region.destroyed) return;
  const size = (canvas?.grid?.size ?? 100) * 0.42;
  const label = kind === "obstacle" ? "" : shortName(doc.name ?? "");
  const style = (CONFIG.canvasTextStyle as PIXI.TextStyle).clone();
  style.fontSize = Math.max(11, Math.round(size * 0.32));
  style.wordWrap = true;
  style.wordWrapWidth = (canvas?.grid?.size ?? 100) * 0.95;
  style.align = "center";
  for (const shape of doc.shapes) {
    if (shape.type !== "polygon" || !shape.points?.length) continue;
    const c = centre(shape.points);
    const marker = new PIXI.Container() as Container;
    marker.name = MARKER;
    marker.eventMode = "none";
    const icon = new PIXI.Sprite(texture);
    icon.anchor.set(0.5);
    icon.width = size;
    icon.height = size;
    icon.alpha = 0.85;
    icon.position.set(c.x, c.y - (label ? size * 0.25 : 0));
    marker.addChild(icon);
    if (label) {
      const text = new PIXI.Text(label, style);
      text.anchor.set(0.5, 0);
      text.position.set(c.x, c.y + size * 0.3);
      marker.addChild(text);
    }
    container.addChild(marker);
  }
}

export function registerRegionMarkers(): void {
  for (const hook of ["drawRegion", "updateRegion"] as const) {
    Hooks.on(hook as never, ((arg: unknown) => {
      const region = (hook === "drawRegion" ? arg : (arg as { object?: PlaceableObject }).object) as PlaceableObject | undefined;
      if (region && !region.destroyed) void drawMarkers(region);
    }) as never);
  }
}
