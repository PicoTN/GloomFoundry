# Tutorial 1: Entering content by hand

This tutorial builds a small homebrew class, the **Lantern Warden**, entirely from Foundry's
sidebar. The same steps work for a class from your rulebook: type its text from your book
instead. Allow about 30 minutes for a class with a handful of Skills.

You need a world using the GloomFoundry system and a GM (or a player allowed to create items).

## 1. Create a folder for the class

In the **Items** sidebar, create a folder named `Lantern Warden`. Everything below goes in it, so
the creation wizard and the Level up dialog can find it (they look at every Item in the world
and in every Item compendium).

## 2. The Talents

Create an Item of type **Talent** named `Lantern Swing`:

| Field | Value |
|---|---|
| Class | `Lantern Warden` (the exact name of the Class item you'll create in step 4) |
| Kind | Active |
| Level | 1 |
| Initiative | 30 |
| Primary action | `Attack 3. If Light is active, add +1 attack.` |
| Secondary action | `Move 3.` |

The **Class** field matters: the Level up dialog offers a character only the Skills and Talents
whose Class matches their class's name.

A **passive** Talent has an effect text instead of actions. Create `Kindled Watch` (Passive,
Level 1): *At the start of each of your turns, if Light is active, gain 1 Ember.*

Talents you gain later work the same way, with their level: a passive Talent at Level 3 or 7.
A **Level 5 upgrade** names the Talent it replaces in **Replaces** (`Lantern Swing+` replaces
`Lantern Swing`); the Level up dialog swaps them at Level 5.

## 3. The Skills

Create an Item of type **Skill** named `Beacon`:

| Field | Value |
|---|---|
| Source | Class |
| Class | `Lantern Warden` |
| Level | 1 |
| Initiative | 15 |
| Primary action | `Attack 2, range 3, target 2. Infuse Light.` |
| Secondary action | `Heal 2, range 2.` |

Tick **Lost on use** for Skills that say "Lose this Skill". Create the others the same way:
Level 1 Skills for the starting set, and higher-level ones (Level 2, 3...) for the Level up
dialog to offer later.

Ancestry Skills are Skills with **Source: Ancestry** and the ancestry's name in **Ancestry**.

### How the buttons are made

When you expand a Skill on a character sheet or post it to chat, GloomFoundry turns its text into
buttons: an **Attack 2 · range 3 · 2 targets** button, an **Infuse Light** button, and so on. It
recognizes these phrasings (capitals matter for names: write `Poison`, `Fire`):

| Text | Button |
|---|---|
| `Move 3`, `Jump 2`, `Teleport 4` | Movement (grants movement in combat; Teleport picks a space) |
| `Attack 3`, with `range 3`, `target 2`, `Pierce 1`, `Push 2`, `Pull 1` and conditions (`Wound`, `Poison`...) in the same clause | Attack, then Push/Pull and condition buttons |
| `Attack 2 on a 3-space cluster within range 3`, `2-space line`, `3-space 120-degree arc`, `cone`, `all enemies within range 2` | Attack with an area to place on the map |
| `Heal 2`, `Heal 3, yourself`, `Heal 2, range 2` | Heal |
| `Shield 1`, `Retaliate 2`, `Taunt` | Abilities until the end of the round |
| `Infuse Fire`, `Infuse Fire or Air`, `Infuse any element` | Element infusion |
| `If Fire is active, add +1 attack and Wound` | Bonus button, highlighted when the element is active |
| `Create one damage 3 trap`, `Create one 1-space obstacle` | Place a trap or obstacle on the map |
| `Summon ...` | Place a summon |
| `Muddle`, `Strengthen`... on their own | Condition buttons |

Anything it doesn't understand stays as text. For full control (choices, marks, Command, class
counters...), write structured actions instead: see [Tutorial 3](03-actions.md).

## 4. The Class

Create an Item of type **Class** named `Lantern Warden`:

- **Health track**: Medium (HP follow the level automatically).
- **Attribute points**: Intuition 2, Understanding 1 (what the class adds at creation).
- **Description**, **Special mechanics**, **Starting gear** (text shown in the creation wizard).
- **Granted items**: drag the Level 1 Talents and the starting Skills from the sidebar onto the
  "Granted items" box. When the class is added to a mercenary, they get copies of these.

Starting equipment is easier to set up in a content pack (`startingItems`, see the
[item types reference](../reference/item-types.md#class)); by hand, players can buy or drag items
instead.

## 5. Perks

Perks change the Modifier Deck. Create an Item of type **Perk** for each line of the class's perk
list. Each **box** of the perk is one checkbox; in each box:

- **Remove**: the playing-card codes of the cards it removes, e.g. `A♥` or `2♣ + 2♦`;
- **Add**: the cards it adds, each with its code, value (or Critical / Null), Attribute test value
  and effect text (`Infuse Light`, `Wound`...).

Codes are written `7♥` or `7H`, `10S`, `AC`, `RJ` / `BJ` for the jokers. The base deck's codes and
values are listed in the [perks reference](../reference/perks.md). Your rulebook's perk table tells
you which cards each official perk uses.

Then drag the Perks onto the Class's **Granted items** too.

> Tip: the Progression tab of a mercenary has an import button that reads a JSON file of perks, if
> you prefer typing them in a text editor.

## 6. An item

Create an Item of type **Item** named `Warden's Lamp`: slot Small, rarity Uncommon, cost 15,
uses 1 per scene, effect `Free action: Infuse Light.` For a weapon taking both hands, set
**Hand slots used** to 2; for armor that adds Small slots, set **Extra Small slots**.

## 7. A Background

Create an Item of type **Background** named `Lamplighter`, category Occupation. Master
occupations are ticked **Master** and name their prerequisite.

## 8. An enemy

In the **Actors** sidebar, create an Actor of type **NPC** named `Ash Wisp`:

- **Stat block**: in "table" mode, fill one row per Campaign Level (0 to 7) for normal and elite
  enemies: HP, Move, Attack, and the "other" Attribute column. The sheet picks the row for the
  current Campaign Level. Townsfolk and allies can use "manual" mode instead (simple stats).
- **Initiative** for fast, normal and slow actions, **Threat** for normal and elite.
- **Actions**: create Items of type **NPC Action** on the sheet, e.g. `Basic` (Fast/Normal/Slow):
  `Move +0. Attack +0, range 2.` The `+0` means "the enemy's own Move/Attack value plus 0".

## 9. Try it

Create a mercenary with the **New mercenary** button of the Actors sidebar: your class, its Talents
and Skills appear in the wizard. Raise a test character a level (scene controls → Gloomhaven →
Level up toggle) to check that the Level 2 Skill is offered.

## Next

When a class has many Skills, a [content pack](02-content-pack.md) is quicker to write and easier
to fix, and you can share it with your group (privately).
