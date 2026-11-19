# Class mechanics

Many classes have a rule of their own: a state that strengthens them, tokens they collect,
powers they keep in play, marks they put on enemies, items they hand out, summons. A Class item
declares them in `system.mechanics`; the mercenary sheet shows them in a **Class** panel on the
Character tab, and [actions](actions.md) use them.

Every mechanic has `type`, `id` (used by actions), `label` (shown) and an optional `text` (a short
summary shown as a tooltip). Any mechanic can also have `"talent": "<Talent name>"`: it then only
appears once the character has that Talent.

## state

A condition derived from the character, used by bonuses (`"state": "<id>"`).

```json
{ "type": "state", "id": "kindled", "label": "Kindled", "rule": "hpHalfOrLess", "text": "While at half HP or less." }
```

`rule`: `hpHalfOrLess` (current HP ≤ half the maximum, rounded down) is the only rule for now.

## counters

Tokens the character collects, shown with − / + buttons. Several counters can share one maximum.

```json
{ "type": "counters", "id": "embers", "label": "Embers", "max": 3,
  "counters": [{ "id": "ember", "label": "Ember" }] }
```

- Actions: `{ "kind": "gain", "id": "embers", "counter": "ember", "count": 1 }`.
- Bonuses and requirements: `"spend": { "ember": 2 }` (needs and spends 2), `"counters": { "ember": 2 }`
  in `requires` (needs 2, spends nothing), `"clearCounters": "embers"` (empties them when used).
- `"gainOn": "companionAttack"` adds one of the first counter automatically whenever a Command
  button (`"performer": "companion"`) makes the character's companion attack.

## slot

Powers kept in play, up to a maximum; the oldest leaves when a new one comes in.

```json
{ "type": "slot", "id": "lanterns", "label": "Lit lanterns", "max": 2 }
```

Action: `{ "kind": "play", "id": "lanterns", "name": "<this power's name>", "text": "short effect" }`.
The panel lists what is in play, with a button to end each.

## mark

A mark the character puts on tokens (shown as a token status).

```json
{ "type": "mark", "id": "glimmer", "label": "Glimmer", "on": "enemy", "stacking": true }
```

| Field | Meaning |
|---|---|
| `on` | `"enemy"`, `"ally"` or `"any"`. |
| `stacking` | Several of the same mark add up on one token (shown as a count). |
| `single` | Only one token carries it at a time: marking another removes the first. |
| `options` | `[{ "name", "text", "group"?, "actions"? }]`: the player picks one when marking; the option's actions become buttons. |

Actions: `{ "kind": "mark", "id": "glimmer", "count": 1 }`. Bonuses: `"targetMark": "glimmer"`,
`"perTargetMark": "glimmer"` (once per mark), `"allyMark": "glimmer"`. An icon pack can give the
mark an icon (`mark.glimmer`).

## pool

A set of items the character hands to allies; an item comes back when used up or removed.

```json
{ "type": "pool", "id": "tonics", "label": "Tonics", "random": false,
  "items": [{ "name": "Bright Tonic", "text": "Heal 2, yourself.", "actions": [{ "kind": "heal", "value": 2, "self": true, "range": null, "conditions": [] }] }] }
```

Action: `{ "kind": "give", "id": "tonics" }` (the player picks, or a random one with
`random: true`). The ally gets a consumable item with the text and actions.

## summons

The class's summons, listed first when a `summon` action has no name.

```json
{ "type": "summons", "id": "summons", "label": "Summons", "summons": [{ "name": "Lantern Spirit" }] }
```

Names must match NPC actors (see [NPCs](npcs.md#summons)).

## Example

The example pack's Lantern Warden has Embers (counters) and the Lantern Spirit (summons):
[`classes/lantern-warden.json`](../example-pack/classes/lantern-warden.json).
