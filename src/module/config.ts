export const SYSTEM_ID = "gloomfoundry";
export const SYSTEM_PATH = `systems/${SYSTEM_ID}`;
export const SOCKET_NAME = `system.${SYSTEM_ID}`;

/** The six Attributes, in rulebook order (p. 67). */
export const ATTRIBUTES = ["cunning", "finesse", "grit", "intuition", "logic", "understanding"] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number];

/** i18n keys; every user-facing string goes through `game.i18n`. */
export const ATTRIBUTE_LABELS: Record<AttributeKey, { label: string; abbr: string }> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a, { label: `GLOOM.Attribute.${a}.label`, abbr: `GLOOM.Attribute.${a}.abbr` }]),
) as Record<AttributeKey, { label: string; abbr: string }>;

export function templatePath(name: string): string {
  return `${SYSTEM_PATH}/templates/${name}`;
}

export function cardArtPath(key: string): string {
  return `${SYSTEM_PATH}/assets/cards/${key}.svg`;
}
