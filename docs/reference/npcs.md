# NPCs and summons

Enemies, allies, summons and townsfolk are Actors of type `npc`. In a content pack they go in an
`Actor` pack.

```json
{
  "name": "Ash Wisp",
  "type": "npc",
  "img": "./art/ash-wisp.webp",
  "system": { },
  "prototypeToken": { "name": "Ash Wisp", "texture": { "src": "./art/ash-wisp.webp" }, "disposition": -1, "actorLink": false, "bar1": { "attribute": "hp" } },
  "items": [ /* NPC actions */ ],
  "flags": { "gloomfoundry": { "source": "My homebrew" } }
}
```

`disposition` -1 for enemies, 1 for allies and summons. Keep `actorLink: false` so each token has
its own HP.

## Stat block (`system`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `mode` | `"table"` \| `"manual"` | `"table"` | Table: stats by Campaign Level. Manual: fixed stats (townsfolk, summons). |
| `category` | `"normal"` \| `"elite"` \| `"adversary"` \| `"nemesis"` | `"normal"` | Picked per token at the table. |
| `level` | 0-7 | 0 | Enemy level (the current Campaign Level by default). |
| `hp` | `{value, max}` | | Set from the table when placed. |
| `stats.normal`, `stats.elite` | 8 rows | | One row per level 0-7: `{hp, move, attack, other, defense, offense}`. |
| `columns` | `{move, attack, other}` | | Which two Attributes each stat column stands for (e.g. `"move": ["intuition", "grit"]`). |
| `threat` | `{normal, elite}` | 2, 4 | Threat values. |
| `initiative` | `{fast, normal, slow}` | 20, 50, 80 | Initiative of fast, normal and slow actions. |
| `markers` | `{defense, offense}` | `""` | What the defense/offense markers in the table mean for this enemy, e.g. `"■ = Shield 1"`. |
| `adversaryBoost` | `"move"` \| `"attack"` | `"attack"` | What an adversary gets +1 to. |
| `printedNemesis` | boolean | `false` | The table holds a nemesis's final stats (HP and Threat per mercenary). |
| `manual` | `{move, attack, attributes, threat}` | | Manual mode stats. |
| `tactics` | 0-5 | 1 | Tactics rating. |
| `stunts` | `{value, max}` | 0, 2 | |
| `description`, `tacticsText` | HTML | `""` | |

`defense` and `offense` in the rows hold the table's markers as text (e.g. `"■"`), explained by
`markers`.

## NPC actions

Embedded Items of type `npcAction`:

```json
{
  "name": "Flicker",
  "type": "npcAction",
  "img": "icons/svg/fire.svg",
  "system": {
    "speeds": { "fast": true, "normal": true, "slow": false },
    "kind": "action",
    "eliteOnly": false,
    "nemesisOnly": false,
    "description": "<p>Jump +1. Attack -1, range 3, Muddle.</p>",
    "actions": { "description": [
      { "kind": "move", "value": 1, "relative": true, "jump": true },
      { "kind": "attack", "value": -1, "relative": true, "range": 3, "targets": 1, "pierce": 0, "area": null, "conditions": ["Muddle"] }
    ] }
  }
}
```

| Field | Meaning |
|---|---|
| `speeds` | Which speeds the action is available at (F / N / S). |
| `kind` | `"action"`, `"break"` (nemesis Break) or `"stunt"`. |
| `eliteOnly`, `nemesisOnly` | Only for elites / nemeses. |
| `description` | The action's text. |
| `actions.description` | [Structured actions](actions.md). Use `relative: true` for `Move +1` / `Attack -1`: they add to the enemy's stat for its level. |

## Summons

Class summons are `npc` actors in **manual** mode, with flags:

```json
"flags": { "gloomfoundry": { "class": "Lantern Warden", "summon": true, "hpByLevel": [4, 4, 5, 5, 6, 6, 7, 7, 8] } }
```

- The name must match the class's `summons` mechanic and the `summon` actions.
- `hpByLevel` (optional): HP by the controller's level 1-9, applied when placed.
- When placed, the summon joins its controller's side, uses their Modifier Deck, and belongs to
  the controller's player.

Give them NPC actions like enemies; their `Move +0` / `Attack +0` add to the manual stats.
