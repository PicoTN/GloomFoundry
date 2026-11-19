# Perks and modifier cards

Each mercenary has a **Modifier Deck** of 20 base cards. A Perk removes and adds cards. In
GloomFoundry every card is identified by a **playing-card code**, which also lets you play with a
physical deck of playing cards.

## Card codes

`<rank><suit>`: rank `A`, `2`-`10`, `J`, `Q`, `K`; suit `♥` `♦` `♣` `♠` (or `H` `D` `C` `S`, any
case). `RJ` and `BJ` are the red and black jokers. Examples: `7♥`, `7H`, `10s`, `AC`, `RJ`.

In a list, separate codes with spaces, commas or `+`: `2♣ + 2♦`.

## The base deck

| Code | Attack | Attribute value |
|---|---|---|
| `RJ` | Null | – |
| `A♥` | −2 | 1 |
| `A♣` | −1 | 1 |
| `2♣` `2♦` `2♥` | −1 | 2 |
| `3♥` | −1 | 3 |
| `3♣` `3♦` `3♠` | +0 | 3 |
| `4♣` `4♦` `4♥` | +0 | 4 |
| `4♠` | +1 | 4 |
| `5♣` `5♦` `5♠` | +1 | 5 |
| `6♦` | +1 | 6 |
| `6♠` | +2 | 6 |
| `BJ` | Critical (×2) | – |

The black face cards (J, Q, K of ♠ and ♣) are Bless cards and the red ones (♥ and ♦) Curse
cards. Codes not used by the base deck (5♥, 6♣, 6♥, 7 and above...) are free for the cards perks
add. Official perks say which codes they use (see your rulebook's perk table).

## A perk

```json
{
  "name": "Add one +1, Infuse Light card",
  "type": "perk",
  "img": "icons/svg/card-hand.svg",
  "system": {
    "description": "Add 7♣ (+1, Infuse Light); second box: add 7♦",
    "taken": 0,
    "steps": [
      { "remove": "", "add": [
        { "card": "7♣", "attackKind": "number", "attackValue": 1, "attribute": 7, "effect": "Infuse Light",
          "actions": [{ "kind": "infuse", "elements": ["light"], "either": false }] }
      ] },
      { "remove": "", "add": [
        { "card": "7♦", "attackKind": "number", "attackValue": 1, "attribute": 7, "effect": "Infuse Light",
          "actions": [{ "kind": "infuse", "elements": ["light"], "either": false }] }
      ] }
    ]
  },
  "flags": { "gloomfoundry": { "class": "Lantern Warden" } }
}
```

- `steps`: one entry per **checkbox**. Ticking N boxes applies the first N steps, in order.
- `remove`: codes of the cards removed (from the base deck or added by an earlier step).
- `add`: the cards added:

| Field | Meaning |
|---|---|
| `card` | Its code (must not already be in the deck). |
| `attackKind` | `"number"`, `"critical"` or `"null"`. |
| `attackValue` | The modifier (`1` for +1, `-1`...), for `"number"` cards. |
| `attribute` | The value used for Attribute tests (0-9), or `null`. |
| `effect` | Text printed on the card (`Wound`, `Heal 1, yourself`, `Infuse Fire`...): shown in chat with icons. |
| `actions` | Optional [actions](actions.md): buttons shown when the card is drawn. |

To **replace** a card, remove it and add the new one in the same step (it may reuse the same
code).

When the boxes change, the deck is rebuilt (Bless and Curse cards in it are kept). The sheet
reports codes that don't exist or are used twice.

## Entering perks without JSON

The Perk sheet edits the same data: one block per box, with **Remove** codes and **Add** cards.
A mercenary's Progression tab can also import a JSON file of perks.
