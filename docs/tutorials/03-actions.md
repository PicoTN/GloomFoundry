# Tutorial 3: Writing actions

GloomFoundry shows a power's text as **buttons**: clicking *Attack 3* draws from the Modifier Deck
against the targeted token, *Infuse Light* infuses the element, *Place trap* lets you click a hex,
and so on. The buttons come from the item's **structured actions** (`system.actions`), or, when
there are none, from reading the text.

Structured actions are worth writing for anything the text reader gets wrong or can't express:
choices, conditional bonuses, areas, class counters, Command. This page walks through examples
from simple to advanced. The complete schema is in the [actions reference](../reference/actions.md).

## Where actions go

`system.actions` is an object with one list per text field:

| Item | Keys |
|---|---|
| Skill, Talent | `primary`, `secondary` (passive Talents: none, or `passive`) |
| Item (equipment) | `effect` |
| NPC Action | `description` |
| Perk card (inside a perk step) | the card's own `actions` list |

When a list is present, its buttons **replace** the text on sheets and chat cards (the text is
still available as a tooltip). Anything the buttons don't cover should be a `text` action, so it
stays visible.

## Example 1: a plain attack

> Attack 3, range 2, Wound.

```json
{ "kind": "attack", "value": 3, "relative": false, "range": 2, "targets": 1, "pierce": 0, "area": null, "conditions": ["Wound"] }
```

- `range: null` means melee.
- `relative: true` is for NPC actions written `Attack +1` (the enemy's Attack value plus 1).
- Conditions are capitalized (`"Wound"`); each one also gets its own button, to apply after the
  attack hits.

## Example 2: movement and an element

> Move 3. Infuse Fire or Ice.

```json
[
  { "kind": "move", "value": 3 },
  { "kind": "infuse", "elements": ["fire", "ice"], "either": true }
]
```

Elements are lowercase. `either: true` for "Fire **or** Ice" (the button asks which),
`false` for "Fire **and** Ice". Add `"jump": true` or `"flying": true` to a move for Jump or
Flying, `"teleport": true` for Teleport (the button offers the empty spaces in range).

## Example 3: an element bonus

> Attack 2, range 3. If Light is active, add +1 attack and Muddle.

```json
{
  "kind": "attack", "value": 2, "relative": false, "range": 3, "targets": 1, "pierce": 0, "area": null, "conditions": [],
  "bonuses": [{ "elements": ["light"], "attack": 1, "conditions": ["Muddle"] }]
}
```

The bonus shows as a second button (*Light: +1 attack, Muddle*), highlighted when Light is
active. Using an element doesn't consume it (p. 82): add `"consume": true` only when the text says
so. "If Fire or Ice is active" is `"elements": ["fire", "ice"], "anyOf": true`; "if any element is
active" is `"anyElement": true`.

A condition that isn't an element goes in `when` (shown, not checked):
`{ "when": "if you have not moved this turn", "attack": 2 }`.

## Example 4: an area

> Attack 2 targeting all enemies in a 3-space line extending from you.

```json
{ "kind": "attack", "value": 2, "relative": false, "range": null, "targets": 1, "pierce": 0,
  "area": { "shape": "line", "size": 3, "anchor": "adjacent" }, "conditions": [] }
```

Shapes: `cluster`, `line`, `arc` (with `degrees`), `cone`, `circle`, `all` (everything within
range `size`). `anchor: "adjacent"` when the area must touch the character, `"range"` when one of
its spaces must be within range. The button lets the player place the area (wheel or R to rotate,
M to mirror) and targets the enemies inside.

## Example 5: a requirement

> If Dark is active, gain Invisible.

```json
{ "kind": "condition", "id": "invisible", "self": true, "requires": { "elements": ["dark"] } }
```

`requires` makes the **whole action** conditional (the button is dimmed until it's met), where
`bonuses` add to an action that always happens.

## Example 6: placing things

> Create one damage 2 trap with Poison in an adjacent space. Summon Lantern Spirit.

```json
[
  { "kind": "trap", "count": 1, "damage": 2, "effects": ["Poison"], "note": "in an adjacent space" },
  { "kind": "summon", "name": "Lantern Spirit" }
]
```

Traps become map regions that trigger when a token walks in. `summon` finds the NPC actor with
that name (in the world or a compendium) and the player clicks the hex where it appears, on their
side and under their control. Without a `name`, the button lists the class's summons.

A **marked space** that has an ongoing effect:

```json
{ "kind": "space", "label": "Warding Lamp", "effect": "You and all allies add +1 attack to all your attacks while in or adjacent to the space." }
```

Its attack bonus is applied automatically to characters in or next to it.

## Example 7: a choice

> Perform one: Heal 3, yourself; or Shield 2.

```json
{ "kind": "choice", "pick": 1, "options": [
  [{ "kind": "heal", "value": 3, "self": true, "range": null, "conditions": [] }],
  [{ "kind": "shield", "value": 2, "self": true }]
] }
```

## Example 8: X values and notes

> Heal X, range 2, where X is the number of active elements.

```json
{ "kind": "heal", "value": 0, "self": false, "range": 2, "conditions": [], "variable": true, "note": "X = number of active elements" }
```

`variable: true` makes the button ask for X. `note` adds a short remark next to the button.

## Example 9: class mechanics

Actions can drive a class's own mechanics (see the
[class mechanics reference](../reference/class-mechanics.md)):

```json
[
  { "kind": "gain", "id": "embers", "counter": "ember", "count": 1 },
  { "kind": "shield", "value": 2, "self": true, "requires": { "spend": { "ember": 2 } } }
]
```

The first adds an Ember to the class counter; the second is only available with 2 Embers and
spends them. Other class actions: `mark` (put a class mark on the target), `play` (put a power
in a limited slot), `give` (hand a pool item to an ally). Bonuses can also depend on
a class state (`"state": "kindled"`) or on a mark on the target (`"targetMark": "glimmer"`).

## Example 10: Command

> Command: your summon performs Attack 2.

```json
{ "kind": "attack", "value": 2, "relative": false, "range": null, "targets": 1, "pierce": 0, "area": null, "conditions": [], "performer": "summon" }
```

`performer` runs the button as one of the character's summons (`"summon"`) or companion
(`"companion"`); `"ally"` and `"enemy"` label actions granted to others.

## Example 11: what doesn't fit

> Whenever an enemy dies adjacent to you this round, gain 1 Ember.

```json
{ "kind": "text", "text": "Whenever an enemy dies adjacent to you this round, gain 1 Ember." }
```

Keep `text` actions short: they show as an information chip.

## Check your work

```sh
node tools/validate-pack.mjs my-pack/index.json
```

reports unknown kinds, missing fields, misspelled conditions or elements, and bonuses without a
trigger. Then import the pack, expand the Skill on a sheet, and click the buttons.
