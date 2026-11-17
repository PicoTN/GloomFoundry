/** Token dispositions (CONST.TOKEN_DISPOSITIONS), duplicated here to keep this module Foundry-free. */
export const DISPOSITION = { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } as const;

/** Friendly vs Hostile, in either direction. Neutral and Secret are never opposed. */
export function areOpposed(a: number | undefined, b: number | undefined): boolean {
  return (a === DISPOSITION.FRIENDLY && b === DISPOSITION.HOSTILE)
    || (a === DISPOSITION.HOSTILE && b === DISPOSITION.FRIENDLY);
}
