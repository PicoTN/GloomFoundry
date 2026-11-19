# Content pack format

A content pack is a folder with an `index.json` and JSON files of Foundry documents. It is
imported as GM from **Game Settings → Configure Settings → GloomFoundry → Import content into
compendiums**. See [Tutorial 2](../tutorials/02-content-pack.md) for a walkthrough.

## `index.json`

```json
{
  "name": "Pack name (shown after import)",
  "iconPack": "icons/iconpack.json",
  "packs": [
    {
      "name": "my-classes",
      "label": "My classes",
      "type": "Item",
      "files": [
        { "path": "classes/my-class.json", "folder": "My Class" }
      ]
    }
  ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `name` | no | A name for the pack. |
| `iconPack` | no | Path (relative to `index.json`) of an [icon pack](icon-pack.md) manifest, loaded after the import (the page reloads). |
| `packs[].name` | yes | Compendium id: `world.<name>`. Lowercase letters, digits, dashes. |
| `packs[].label` | yes | Compendium title. |
| `packs[].type` | yes | `Item`, `Actor` or `JournalEntry`. |
| `packs[].files[].path` | yes | File path relative to `index.json`. |
| `packs[].files[].folder` | no | Compendium folder for the file's documents; `/` makes subfolders (`"Armor/Body"`). |

Several files can share a folder and a pack. Importing again **empties** each listed compendium
and fills it again.

## Files

A file holds one document (an object) or several (an array). Each is a Foundry document as you
would get from **Export Data**, without `_id`:

```json
{ "name": "...", "type": "skill", "img": "icons/svg/book.svg", "system": { }, "flags": { "gloomfoundry": { } } }
```

- `type`: an Item type (`class`, `ancestry`, `skill`, `talent`, `equipment`, `perk`,
  `background`, `faction`, `companyBenefit`, `npcAction`) in an Item pack; an Actor type (`npc`,
  usually) in an Actor pack. Journal entries need no type.
- `system`: the type's fields ([item types](item-types.md), [NPCs](npcs.md)). Missing fields
  take their default.
- Actors may carry embedded `items` (an NPC's actions) and a `prototypeToken`.

## Flags read by GloomFoundry

All under `flags.gloomfoundry`:

| Flag | On | Effect |
|---|---|---|
| `class` | Skills, Talents, Perks, summons | The class name: the Level up dialog offers class Skills/Talents of the character's class; summons are listed for that class. |
| `ancestry` | ancestry Skills | The ancestry name, for the Level up dialog. |
| `folder` | any | Compendium subfolder for this document (overrides the automatic one). |
| `category` | equipment | Shown as the item's category; used to filter a shop's stock (e.g. `Hand`, `Small`, `Armor`, `Basic`). |
| `hands` | equipment | `2` for two-handed items (same as `system.hands`). |
| `summon` | NPC actors | Marks the actor as a summon. |
| `hpByLevel` | summons | 9 HP values, one per controller level (1-9), applied when placed. |
| `source` | any | Free text: where the content comes from. |

Without a `folder`, Talents go to *Talents*, Skills to *Skills/Level N*, Perks to *Perks*,
Backgrounds to their category.

## Images

`img` and `prototypeToken.texture.src` may be:

- a Foundry path (`icons/svg/fire.svg` and the other core icons are always available);
- a path starting with `./`, **relative to `index.json`**: the importer turns it into the full
  path, so the folder can live anywhere (Foundry data, Forge Assets Library).

Embedded items' images are resolved the same way.

## Checking

```sh
node tools/validate-pack.mjs path/to/index.json
```
