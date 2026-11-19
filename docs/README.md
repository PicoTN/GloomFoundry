# Writing content for GloomFoundry

GloomFoundry ships **rules automation only**: no classes, Skills, items or enemies from the
rulebook. To play, you enter the content from **your own copy** of *Gloomhaven: The Roleplaying
Game*, or your own homebrew. These pages show how.

> **Keep official content private.** Rulebook text, art and icons belong to their publisher.
> Enter them for your own table only: don't publish content packs made from the book, and don't
> commit them to a public repository.

## Two ways to add content

| | By hand in Foundry | As a content pack (JSON files) |
|---|---|---|
| Good for | a few items, one class, homebrew tweaks | a whole class, a bestiary, sharing with your own group |
| Tools | Foundry's sheets | a text editor, then the importer in Foundry |
| Buttons in chat and sheets | read from the text you type | written as structured actions (more precise) |
| Start with | [Tutorial 1](tutorials/01-by-hand.md) | [Tutorial 2](tutorials/02-content-pack.md) |

Both work together: a content pack is imported into world compendiums, and you can edit or add
items by hand afterwards.

## Tutorials

1. [Entering content by hand](tutorials/01-by-hand.md): a class with its Talents, Skills and
   Perks, an item, a Background and an enemy, from Foundry's sidebar.
2. [Building a content pack](tutorials/02-content-pack.md): the folder layout, `index.json`,
   uploading it (including on The Forge) and importing it.
3. [Writing actions](tutorials/03-actions.md): turning a power's text into the buttons players
   click (attacks, areas, element bonuses, summons...).

## Reference

- [Content pack format](reference/content-pack.md): `index.json`, files, folders, images.
- [Item types](reference/item-types.md): every field of Classes, Ancestries, Skills, Talents,
  items, Perks, Backgrounds, Factions and Company benefits.
- [Actions](reference/actions.md): the full structured-action schema.
- [Class mechanics](reference/class-mechanics.md): states, counters, slots, marks, pools,
  summons.
- [NPCs and summons](reference/npcs.md): bestiary stat blocks, NPC actions, summons.
- [Perks and modifier cards](reference/perks.md): card codes and the base deck.
- [Icon pack](reference/icon-pack.md): replacing the default icons with your own.

## Example

[`example-pack/`](example-pack/) is a small, complete pack made of invented content: the
**Lantern Warden** class (Talents, Skills, Perks, mechanics, a summon), four items, two
Backgrounds and an enemy. Import it to see how everything fits, or copy it as a starting point.
Each release has it as `example-pack.zip`: unzip it, upload the `example-pack` folder to your
Foundry data or Forge Assets Library, and import its `index.json` (see
[Tutorial 2](tutorials/02-content-pack.md#7-upload-it)).

## Checking a pack

```sh
node tools/validate-pack.mjs path/to/your-pack/index.json
```

It reads every file of the pack and reports errors (things that won't work) and warnings (things
that may surprise you). It needs [Node.js](https://nodejs.org) 18 or later and nothing else.
