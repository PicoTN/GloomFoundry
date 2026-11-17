/**
 * Gloomhaven's Invisible (p. 84): enemies cannot target you, while allies still can.
 *
 * On the canvas, an Invisible token is undetectable by vision sources of tokens on the
 * opposing side (Friendly vs Hostile token disposition), and stays visible to its own side.
 * Neutral and Secret tokens are never "opposed". The GM without a selected token still
 * sees everything, as usual. Switching sides = changing the token's disposition.
 *
 * Foundry's own special INVISIBLE status (which hides the token from everyone without
 * See Invisibility) is disabled in conditions.ts.
 */
import { areOpposed } from "../rules/sides.ts";

type TokenLike = { document?: { disposition?: number; hasStatusEffect?(id: string): boolean } };

function hiddenByInvisible(viewer: TokenLike | undefined, target: TokenLike | null | undefined): boolean {
  const doc = target?.document;
  if (!doc?.hasStatusEffect?.("invisible")) return false;
  return areOpposed(viewer?.document?.disposition, doc.disposition);
}

/** Wrap every configured detection mode. Call during `setup`, after modules registered theirs. */
export function patchDetectionModes(): void {
  const modes = CONFIG.Canvas.detectionModes as Record<string, unknown>;
  for (const mode of Object.values(modes)) {
    const m = mode as { _canDetect?: (...args: unknown[]) => boolean; _gloomPatched?: boolean };
    if (typeof m._canDetect !== "function" || m._gloomPatched) continue;
    const original = m._canDetect.bind(m);
    m._canDetect = (visionSource: unknown, target: unknown, ...rest: unknown[]) => {
      const viewer = (visionSource as { object?: TokenLike } | null)?.object;
      if (hiddenByInvisible(viewer, target as TokenLike | null)) return false;
      return original(visionSource, target, ...rest);
    };
    m._gloomPatched = true;
  }
}

function refreshVision(): void {
  if (!canvas?.ready) return;
  canvas.perception.update({ initializeVision: true } as never);
}

function touchesInvisible(effect: unknown): boolean {
  return (effect as ActiveEffect.Implementation).statuses?.has("invisible") ?? false;
}

export function registerInvisibilityHooks(): void {
  Hooks.once("setup", patchDetectionModes);
  Hooks.on("createActiveEffect", (effect) => {
    if (touchesInvisible(effect)) refreshVision();
  });
  Hooks.on("deleteActiveEffect", (effect) => {
    if (touchesInvisible(effect)) refreshVision();
  });
  Hooks.on("updateToken", (_token, changes) => {
    if ("disposition" in (changes as object)) refreshVision();
  });
}
