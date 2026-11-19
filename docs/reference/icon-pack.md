# Icon pack

GloomFoundry draws conditions, elements and stats with Foundry's generic icons and text. An
**icon pack** replaces them with your own images: in chat, on sheets (perk descriptions, action
buttons), in the token status palette and on modifier card faces.

Load one from **Game Settings → Configure Settings → GloomFoundry → Icon pack**, or name it in a
content pack's `index.json` (`"iconPack": "icons/iconpack.json"`).

> Icons scanned or extracted from the rulebook are the publisher's art: keep such a pack private.

## Manifest

```json
{
  "name": "My icons",
  "icons": {
    "condition.wound": "conditions/wound.webp",
    "element.fire": "elements/fire.webp",
    "stat.attack": "stats/attack.webp"
  }
}
```

Paths are relative to the manifest. Any key can be left out: the default is used.

## Keys

| Key | Used for |
|---|---|
| `condition.<id>` | Conditions: `bless`, `curse`, `immobilize`, `invisible`, `muddle`, `pacify`, `poison`, `regenerate`, `safeguard`, `strengthen`, `stun`, `ward`, `wound`. Also `shield`, `retaliate`, `taunt` for the round abilities' token icons. |
| `element.<id>` | Elements: `air`, `dark`, `earth`, `fire`, `ice`, `light`, and `any` (any element). |
| `stat.<id>` | Inline icons in texts and buttons: `attack`, `damage`, `heal`, `jump`, `move`, `pierce`, `pull`, `push`, `range`, `retaliate`, `shield`, `target`, `taunt`, `persistent`, and also `hp`, `initiative`, `lose`, `round`. |
| `mark.<id>` | Class marks on tokens (e.g. `mark.glimmer`). |
| `card.<key>` | Modifier card faces: `back`, `bless`, `curse`, `critical`, `null`, `critical-attrN` / `null-attrN` (N = 1-7), `atk-<m3 to p4>-attrN` (attack −3 to +4: `m3`, `m2`, `m1`, `p0`... `p4`; Attribute value N = 0-7). The defaults are in `public/assets/cards/` of the system. |

Stat icons are expected to be dark on a transparent background; GloomFoundry gives them a light
backdrop on dark themes. Other icons get a thin light outline.
