/**
 * Combat rules (Core Rulebook ch. 2, "Combat Encounters" p. 71-72, "Elements" p. 82,
 * "Conditions" p. 83-85).
 */

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export const ELEMENTS = ["air", "dark", "earth", "fire", "ice", "light"] as const;
export type ElementId = (typeof ELEMENTS)[number];

/** 0 = inert, 1 = waning, 2 = strong. */
export type ElementState = 0 | 1 | 2;
export const INERT = 0, WANING = 1, STRONG = 2;

export interface ElementBoard {
  states: Record<ElementId, ElementState>;
  /** Infused this turn: becomes strong at the end of the current turn (p. 82). */
  pending: ElementId[];
}

export function emptyBoard(): ElementBoard {
  return { states: { air: 0, dark: 0, earth: 0, fire: 0, ice: 0, light: 0 }, pending: [] };
}

/** An element is active (usable) when strong or waning. */
export function isActive(state: ElementState): boolean {
  return state > INERT;
}

/** Infuse: in combat it waits for the end of the turn; outside combat it is strong at once. */
export function infuse(board: ElementBoard, element: ElementId, inCombat: boolean): ElementBoard {
  if (!inCombat) return { ...board, states: { ...board.states, [element]: STRONG } };
  if (board.pending.includes(element)) return board;
  return { ...board, pending: [...board.pending, element] };
}

/** Consume / set an element's state directly (GM override, or abilities that consume). */
export function setState(board: ElementBoard, element: ElementId, state: ElementState): ElementBoard {
  return { states: { ...board.states, [element]: state }, pending: board.pending.filter((e) => e !== element) };
}

/** End of a turn: pending infusions become strong. */
export function endTurn(board: ElementBoard): ElementBoard {
  if (!board.pending.length) return board;
  const states = { ...board.states };
  for (const e of board.pending) states[e] = STRONG;
  return { states, pending: [] };
}

/** End of a round (cleanup phase): strong → waning → inert. */
export function decay(board: ElementBoard): ElementBoard {
  const states = { ...board.states };
  for (const e of ELEMENTS) states[e] = Math.max(INERT, states[e] - 1) as ElementState;
  return { states, pending: board.pending };
}

// ---------------------------------------------------------------------------
// Initiative (lowest acts first)
// ---------------------------------------------------------------------------

export type Speed = "fast" | "normal" | "slow";
export const SPEEDS: readonly Speed[] = ["fast", "normal", "slow"];

/** The same enemy type cannot use the same speed on two consecutive rounds (p. 71). */
export function allowedSpeeds(last: Speed | null | undefined): Speed[] {
  return SPEEDS.filter((s) => s !== last);
}

/**
 * Tie-breaks are encoded as small fractions below the printed value, so displaying
 * Math.round(initiative) still shows the printed number:
 *  - elites act before normals of the same type (p. 72);
 *  - summons act immediately before their controller, in summoning order.
 */
export function enemyInitiative(base: number, elite: boolean): number {
  return elite ? base - 0.2 : base;
}

export function summonInitiative(controllerInitiative: number, summonIndex: number): number {
  return controllerInitiative - 0.4 + summonIndex * 0.01;
}

export function displayInitiative(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(Math.round(value));
}

// ---------------------------------------------------------------------------
// Condition durations
// ---------------------------------------------------------------------------

/** Conditions that last "until the end of your next turn" in combat (p. 84-85). */
export const UNTIL_END_OF_NEXT_TURN = ["invisible", "strengthen", "immobilize", "muddle", "pacify", "stun"] as const;

/** A point in the combat timeline: round and turn index. */
export function timelinePosition(round: number, turn: number | null | undefined): number {
  return round * 1000 + (turn ?? 0);
}

/**
 * At the end of a character's turn, a condition expires if it was gained before that turn
 * started (or outside combat). Gained during the turn itself → it lasts through the next turn.
 */
export function expiresAtTurnEnd(appliedAt: number | null | undefined, turnStartedAt: number): boolean {
  return appliedAt === null || appliedAt === undefined || appliedAt < turnStartedAt;
}
