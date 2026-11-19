# Actions

Structured actions describe what a power does, so GloomFoundry can show buttons for it. They live
in `system.actions` (Skills, Talents, items, NPC actions) and in perk cards' `actions`. For a
gentle introduction, read [Tutorial 3](../tutorials/03-actions.md) first.

```json
"actions": {
  "primary": [ /* actions */ ],
  "secondary": [ /* actions */ ]
}
```

| Item type | Keys |
|---|---|
| Skill, Talent | `primary`, `secondary`, `passive` |
| Item (equipment) | `effect` |
| NPC Action | `description` |

When a key has actions, its buttons replace the text on sheets and chat cards (the text stays in a
tooltip). Without actions, buttons are read from the text.

## Conventions

- Numbers are numbers (`3`, not `"3"`).
- Conditions in `conditions` / `effects` lists are **capitalized**: `Bless`, `Curse`,
  `Immobilize`, `Invisible`, `Muddle`, `Pacify`, `Poison`, `Regenerate`, `Safeguard`,
  `Strengthen`, `Stun`, `Ward`, `Wound`. A `condition` action's `id` is **lowercase**.
- Elements are lowercase: `air`, `dark`, `earth`, `fire`, `ice`, `light`.
- Leave optional fields out rather than writing `null`, except where `null` is listed.

## Kinds

### attack

```json
{ "kind": "attack", "value": 3, "relative": false, "range": 2, "targets": 1, "pierce": 0, "area": null, "conditions": ["Wound"], "push": 1 }
```

| Field | Meaning |
|---|---|
| `value` | Attack value. |
| `relative` | `true` for NPC actions written `Attack +1` (added to the NPC's Attack). |
| `range` | `null` = melee. |
| `targets` | Number of targets. |
| `pierce` | Pierce X. |
| `push`, `pull` | Optional: Push X / Pull X (a button picks where each target goes). |
| `area` | An [area](#area) or `null`. |
| `conditions` | Conditions applied by the attack (each gets a button). |

### move

```json
{ "kind": "move", "value": 3, "jump": true }
```

Optional: `relative` (NPC `Move +1`), `jump`, `flying`, `teleport` (pick an empty space within
range `value`). In combat the button grants that much movement for the turn.

### heal

```json
{ "kind": "heal", "value": 2, "self": false, "range": 2, "conditions": [], "targets": 2 }
```

`self: true` for "yourself"; `range: null` with `self: false` for an adjacent ally. `targets` is
optional.

### shield, retaliate, taunt

```json
{ "kind": "shield", "value": 1, "self": true }
{ "kind": "retaliate", "value": 2, "range": 2 }
{ "kind": "taunt" }
```

Until the end of the round unless `"duration": "persistent"`. `self: false` when given to an ally;
optional `range`.

### condition

```json
{ "kind": "condition", "id": "strengthen", "self": false, "range": 3 }
```

A condition given outside an attack or heal ("grant an ally Strengthen", "gain Invisible").

### infuse

```json
{ "kind": "infuse", "elements": ["fire", "air"], "either": true }
{ "kind": "infuse", "elements": [], "either": true, "any": true }
```

`either: true` for "Fire or Air" (one of them), `false` for "Fire and Air" (both); `any` for "any
element".

### area

```json
{ "kind": "area", "area": { "shape": "circle", "size": 2 } }
```

An area that isn't an attack's (a heal or an effect on everyone in it). The button places it on
the map and targets the enemies inside; for allies, target them by hand.

### trap, obstacle, space

```json
{ "kind": "trap", "count": 1, "damage": 3, "effects": ["Poison"], "range": 2 }
{ "kind": "obstacle", "count": 2 }
{ "kind": "space", "label": "Warding Lamp", "effect": "You and all allies add +1 attack to all your attacks while in or adjacent to the space.", "count": 1 }
```

Placed on the map as regions. Traps trigger on a token walking in (and disappear); obstacles block
ending a move there; marked spaces are recalled at the start of the turn of a token in or next to
them, and an attack bonus in their `effect` applies to attackers in or next to them.

### summon

```json
{ "kind": "summon", "name": "Lantern Spirit" }
```

Places the NPC actor of that name (world or compendium). Without `name`, the player picks one of
the class's summons.

### forced

```json
{ "kind": "forced", "dir": "push", "value": 2 }
```

Push or Pull X without an attack.

### choice

```json
{ "kind": "choice", "pick": 2, "options": [ [ /* actions */ ], [ /* actions */ ], [ /* actions */ ] ] }
```

"Perform 2 of the following".

### Class mechanics

See the [class mechanics reference](class-mechanics.md) for the mechanics these use.

```json
{ "kind": "mark", "id": "glimmer", "option": "Option name", "targets": 1, "range": 3 }
{ "kind": "gain", "id": "embers", "counter": "ember", "count": 1 }
{ "kind": "play", "id": "lanterns", "name": "Name of this power", "text": "short effect" }
{ "kind": "give", "id": "tonics", "item": "Item name", "count": 1 }
```

- `mark`: put a class mark on the targeted token(s); `count` for stacking marks; `option` or
  `group` to pre-select a mark option.
- `gain`: add `count` to the counter `counter` of the counters mechanic `id` (`"any"` lets the
  player choose).
- `play`: put this power in the slot mechanic `id` (the oldest leaves when full).
- `give`: hand pool items to the targeted ally (`random: true` for a random one).

### text

```json
{ "kind": "text", "text": "Short description of what can't be automated" }
```

## Common fields

Any action may also have:

| Field | Meaning |
|---|---|
| `bonuses` | Array of [bonuses](#bonus): extra buttons with the bonus applied, highlighted when their trigger is met. |
| `requires` | A [trigger](#bonus) the whole action needs (the button is dimmed otherwise). Also accepts `counters` (`{"ember": 2}`: class counters needed) and `clearCounters` (a counters mechanic id emptied when used). |
| `variable` | `true` when the value is "X": the button asks for it. |
| `note` | Short text shown next to the button. |
| `performer` | `"companion"` or `"summon"`: Command, run as the character's summon; `"ally"` / `"enemy"`: an action granted to someone else (shown only). |

## Bonus

```json
{ "elements": ["fire"], "attack": 1, "conditions": ["Wound"] }
```

**Trigger** (at least one):

| Field | Meaning |
|---|---|
| `elements` | Elements that must be active (all of them, or one with `anyOf: true`). |
| `anyElement` | Any active element. |
| `consume` | The element is consumed (only when the text says so; using an element normally doesn't consume it). |
| `when` | A condition in words, shown but not checked ("if you have not moved this turn", "if the target is adjacent to an ally"). |
| `state` | A class `state` mechanic id that must be active (e.g. a rage state). |
| `targetMark` | The target has this mark. |
| `perTargetMark` | Applied once per mark of this kind on the target. |
| `allyMark` | An ally has this mark. |
| `spend` | Class counters spent when used: `{"ember": 2}`. |

**Effect**: `attack`, `range`, `targets`, `pierce`, `push`, `pull`, `heal`, `move`, `shield`,
`retaliate` (numbers added), `conditions` (added), `area` (replaces the area), `text`.

## Area

```json
{ "shape": "cluster", "size": 3, "anchor": "range" }
```

| Field | Values |
|---|---|
| `shape` | `cluster`, `line`, `arc`, `cone`, `circle`, `all` |
| `size` | Number of spaces (for `all`: the range). |
| `anchor` | `"adjacent"`: must touch the character (lines "extending from you", arcs); `"range"`: one space must be within the attack's range. |
| `degrees` | Arcs: 60 per space around the character (`120`, `180`...). |

Clusters are as round as possible (3 = triangle, 4 = rhombus, 7 = a hex and its ring). Players
rotate areas with the mouse wheel or R, and mirror them with M.
