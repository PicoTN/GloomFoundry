import { SYSTEM_ID } from "./config.ts";

export type CardFaceStyle = "gloomhaven" | "playing";

/** Toggle a body class so every rendered card (chat, sheets) switches face style per viewer. */
export function applyCardFaceStyle(style: CardFaceStyle): void {
  document.body.classList.toggle("gloom-face-playing", style === "playing");
}

export function registerSettings(): void {
  const settings = game.settings!;

  // Internal references to world documents (not shown in the settings menu).
  settings.register(SYSTEM_ID, "gmDrawPile", { scope: "world", config: false, type: String, default: "" });
  settings.register(SYSTEM_ID, "gmDiscardPile", { scope: "world", config: false, type: String, default: "" });
  settings.register(SYSTEM_ID, "deckFolder", { scope: "world", config: false, type: String, default: "" });

  settings.register(SYSTEM_ID, "cardFace", {
    name: "GLOOM.Settings.cardFace.name",
    hint: "GLOOM.Settings.cardFace.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      gloomhaven: "GLOOM.Settings.cardFace.gloomhaven",
      playing: "GLOOM.Settings.cardFace.playing",
    },
    default: "gloomhaven",
    onChange: (value) => applyCardFaceStyle(value as CardFaceStyle),
  });
}
