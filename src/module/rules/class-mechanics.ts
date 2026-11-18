/**
 * Class-specific mechanics, declared as data on the Class item (`system.mechanics`) and tracked
 * on the mercenary (`system.classState`). Pure: no Foundry imports.
 *
 * Kinds:
 * - state:    a derived condition, e.g. Berserk (current HP ≤ half the maximum, rounded down).
 * - counters: named counters with a shared maximum, e.g. Soothsinger Bass/Treble Notes (max 4).
 * - slot:     things "in play" with a limit, e.g. Mindthief Augments (1), Songs, Invocations.
 * - mark:     put on other characters' tokens, e.g. Doom (one at a time, chosen from a list),
 *             Plague (stacks), Prescriptions (on an ally).
 * - pool:     a set of items handed out to allies, e.g. Quartermaster Supply, Medical Packs.
 * - summons:  the class's summons (NPC actors, by name), e.g. Dancer Swarms, Battle Bot, Companion.
 */
import type { PowerAction } from "./power-actions.ts";

export interface MechanicOption { name: string; text: string; group?: string; actions?: PowerAction[] }

/** Every mechanic may depend on a talent (shown only once the character has it). */
export type Mechanic = MechanicBase & { talent?: string };
type MechanicBase =
  | { type: "state"; id: string; label: string; rule: "hpHalfOrLess"; text?: string }
  | { type: "counters"; id: string; label: string; counters: { id: string; label: string }[]; max: number; text?: string;
      /** Gain 1 of the first counter automatically, e.g. whenever your companion attacks. */
      gainOn?: "companionAttack" }
  | { type: "slot"; id: string; label: string; max: number; text?: string }
  | { type: "mark"; id: string; label: string; on: "enemy" | "ally" | "any"; stacking?: boolean; single?: boolean;
      options?: MechanicOption[]; text?: string }
  | { type: "pool"; id: string; label: string; items: MechanicOption[]; random?: boolean; text?: string }
  | { type: "summons"; id: string; label: string; summons: { name: string; group?: string }[]; text?: string };

/** What the mercenary tracks for its class mechanics. */
export interface ClassState {
  counters?: Record<string, Record<string, number>>;
  slots?: Record<string, { name: string; text?: string }[]>;
  /** Pool item name -> UUID of the actor holding it ("" = available). */
  pools?: Record<string, Record<string, string>>;
  /** Single marks (e.g. Doom): token UUID currently marked and the option chosen. */
  marks?: Record<string, { token: string; option?: string } | null>;
}

/** Derived states (e.g. Berserk) from the current HP. */
export function activeStates(mechanics: readonly Mechanic[], hp: { value: number; max: number }): Set<string> {
  const out = new Set<string>();
  for (const m of mechanics) {
    if (m.type === "state" && m.rule === "hpHalfOrLess" && hp.max > 0 && hp.value <= Math.floor(hp.max / 2)) out.add(m.id);
  }
  return out;
}

/** Add to a counter, respecting the shared maximum. Returns the new counters and how many were gained. */
export function addToCounter(
  mech: Extract<Mechanic, { type: "counters" }>, current: Record<string, number> | undefined, counter: string, n: number,
): { counters: Record<string, number>; gained: number } {
  const counters = { ...Object.fromEntries(mech.counters.map((c) => [c.id, 0])), ...(current ?? {}) };
  const total = Object.values(counters).reduce((a, b) => a + b, 0);
  const room = n > 0 ? Math.max(0, mech.max - total) : n;
  const gained = n > 0 ? Math.min(n, room) : Math.max(n, -(counters[counter] ?? 0));
  counters[counter] = (counters[counter] ?? 0) + gained;
  return { counters, gained };
}

/** Do the counters cover a requirement (e.g. a Song needing 2 Bass and 1 Treble)? */
export function countersCover(current: Record<string, number> | undefined, need: Record<string, number>): boolean {
  return Object.entries(need).every(([id, n]) => (current?.[id] ?? 0) >= n);
}

/** Put something in a slot; when full, the oldest entry leaves. Returns the new list and what left. */
export function playInSlot(
  max: number, current: { name: string; text?: string }[] | undefined, entry: { name: string; text?: string },
): { list: { name: string; text?: string }[]; removed: { name: string; text?: string }[] } {
  const list = (current ?? []).filter((e) => e.name !== entry.name);
  list.push(entry);
  const removed = list.length > Math.max(1, max) ? list.splice(0, list.length - Math.max(1, max)) : [];
  return { list, removed };
}

/** Pool items not handed out. */
export function availablePoolItems(mech: Extract<Mechanic, { type: "pool" }>, held: Record<string, string> | undefined): MechanicOption[] {
  return mech.items.filter((i) => !held?.[i.name]);
}
