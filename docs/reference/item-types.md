# Item types

Fields of each Item type's `system` object. Text fields marked *HTML* hold HTML
(`"<p>...</p>"`). Fields you leave out take the default shown. `actions` is described in the
[actions reference](actions.md).

## Class

Granted to a mercenary at creation (one class per mercenary).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `description` | HTML | `""` | Shown in the creation wizard. |
| `hpTrack` | `"low"` \| `"medium"` \| `"high"` | `"medium"` | Health track: max HP by level (6-14, 8-20, 10-26). |
| `attributes` | `{cunning, finesse, grit, intuition, logic, understanding}` | all 0 | Attribute points the class adds at creation. |
| `specialMechanics` | HTML | `""` | Rules summary shown in the wizard. |
| `startingGear` | text | `""` | Starting gear as text (shown when `startingItems` is empty). |
| `startingItems` | array of equipment Items | `[]` | Full Item data, offered as "class starting gear" in the wizard. |
| `startingGold` | integer | 0 | Gold that comes with the starting gear. |
| `mechanics` | array | `[]` | [Class mechanics](class-mechanics.md). |
| `grants` | array of Items | `[]` | Full Item data copied onto the mercenary with the class: Level 1 Talents, starting Skills, Perks. |

The class's **name** links it to its Skills and Talents (`flags.gloomfoundry.class`).

## Ancestry

| Field | Type | Default | Meaning |
|---|---|---|---|
| `description` | HTML | `""` | |
| `traditionalClasses` | text | `""` | Shown in the wizard. |
| `grants` | array of Items | `[]` | Usually the ancestry's starting Skills. |

## Skill

| Field | Type | Default | Meaning |
|---|---|---|---|
| `source` | `"class"` \| `"ancestry"` | `"class"` | Class Skills and ancestry Skills fill separate loadout slots (4 + 2). |
| `level` | integer ≥ 1 | 1 | Level at which it can be learned. |
| `initiative` | 1-100 or `null` | `null` | Initiative when chosen in planning. |
| `bonusOverride` | integer or `null` | `null` | Attribute test bonus when expended; `null` = half the level, rounded up. |
| `flavor` | text | `""` | Italic flavor line. |
| `primary`, `secondary` | HTML | `""` | Action texts. |
| `lostOnUse` | boolean | `false` | Lost (until a Full Rest) instead of expended. |
| `prepared` | boolean | `false` | In the current loadout (players toggle it). |
| `state` | `"ready"` \| `"active"` \| `"expended"` \| `"lost"` | `"ready"` | Usage state (players change it). |
| `actions` | `{primary?, secondary?}` | `{}` | Structured actions. |

Flags: `class` (class Skills) or `ancestry` (ancestry Skills), for the Level up dialog.

## Talent

| Field | Type | Default | Meaning |
|---|---|---|---|
| `level` | integer | 1 | 1 (starting), 3 and 7 (passive Talents gained), 5 (upgrades). |
| `kind` | `"active"` \| `"passive"` | `"active"` | Passive Talents have an effect instead of actions. |
| `initiative` | 1-100 or `null` | `null` | |
| `primary`, `secondary` | HTML | `""` | Active Talents. |
| `passive` | HTML | `""` | Passive Talents' effect. |
| `replaces` | text | `""` | Level 5 upgrades: the name of the Talent this replaces. |
| `actions` | `{primary?, secondary?, passive?}` | `{}` | |

Flag: `class`.

## Item (`equipment`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `slot` | `"head"` \| `"body"` \| `"hand"` \| `"feet"` \| `"small"` \| `"none"` | `"none"` | `none` = carried only (basic items). |
| `effect` | HTML | `""` | |
| `initiative` | 1-100 or `null` | `null` | Items with a primary action (Hand items). |
| `uses.max` | integer or `null` | `null` | Uses before expended; `null` = unlimited. |
| `uses.spent` | integer | 0 | |
| `uses.per` | `"round"` \| `"scene"` \| `"rest"` | `"scene"` | When uses come back. |
| `rarity` | `"common"` \| `"uncommon"` \| `"rare"` \| `"masterwork"` \| `"legendary"` | `"common"` | Shops and level gates. |
| `cost` | number | 0 | Gold (fractions allowed, e.g. 0.2). |
| `space` | number | 1 | Inventory space when not equipped. |
| `hands` | 1 \| 2 | 1 | Hand slots used. |
| `smallSlots` | integer | 0 | Extra Small slots while equipped. |
| `consumable` | boolean | `false` | Stacks; used up. |
| `quantity` | integer | 1 | |
| `equipped` | boolean | `false` | |
| `lostOnUse` | boolean | `false` | Lost instead of expended when its uses run out. |
| `state` | as Skills | `"ready"` | |
| `crafting` | text | `""` | Crafting type, shown on the sheet. |
| `actions` | `{effect?}` | `{}` | |

Flag: `category` (e.g. `Hand`, `Small`, `Armor`, `Basic`), used by shops to filter their stock.

## Perk

| Field | Type | Default | Meaning |
|---|---|---|---|
| `description` | text | `""` | Short reminder (the card codes, for instance). |
| `steps` | array | one empty step | One entry per checkbox; see [perks](perks.md). |
| `taken` | integer | 0 | Boxes ticked (players tick them). |

The perk's **name** is shown on the sheet; the sheet also writes the steps out in words.

## Background

| Field | Type | Default | Meaning |
|---|---|---|---|
| `category` | `"occupation"` \| `"origin"` \| `"social"` | `"occupation"` | |
| `master` | boolean | `false` | Master occupation (+2 instead of +1). |
| `prerequisite` | text | `""` | Base occupation a master one needs. |
| `description` | HTML | `""` | |
| `expended` | boolean | `false` | |

## Faction

| Field | Type | Default | Meaning |
|---|---|---|---|
| `major` | boolean | `true` | Major factions can be chosen at creation. |
| `description` | HTML | `""` | |
| `boons` | HTML | `""` | How the faction's benefits work. |
| `tiers` | array of `{tier, title, benefits}` | `[]` | One per tier 0-5 (`benefits` is HTML). |
| `tier`, `member`, `successes`, `failures`, `active` | | 1, false, 0, 0, false | The character's standing (set at the table). |

## Company benefit (`companyBenefit`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `kind` | `"temporary"` \| `"permanent"` | `"temporary"` | |
| `level` | 0-5 | 0 | Company level a permanent benefit needs. |
| `description` | HTML | `""` | |
| `automation` | see below | `""` | What GloomFoundry does with it. |
| `amount` | integer | 0 | Gold, percent or extra gold, depending on the automation. |

Automations: `bless` (a Bless card for each member), `gold` (`amount` gold each), `ward` (Ward at
the next combat), `ally` (places a City Watch ally: an NPC actor named `Guard (City Watch)` or `Archer (City Watch)` must exist in the world or a compendium), `discountHome` / `discountCity` /
`discountOnce` (`amount` % off in shops of the home district / in Gloomhaven / once),
`missionGold` and `recruitGold` (`amount` gold per mercenary in the Mission completed dialog).

## NPC Action (`npcAction`)

Embedded in NPC actors; see [NPCs](npcs.md).
