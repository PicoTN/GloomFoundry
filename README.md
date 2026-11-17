# GloomFoundry

An unofficial [Foundry VTT](https://foundryvtt.com) system for **Gloomhaven: The Roleplaying Game** (Cephalofair Games).

> [!NOTE]
> **This is a personal test project.** It is made for my own table. It is experimental, may break between versions, and comes with no support or guarantee. You're welcome to look around or try it, but please don't rely on it for your campaign. Issues and suggestions are appreciated, though I may not act on them.
>
> **It is heavily vibe-coded**: most of the code is written with an AI coding assistant. Review it accordingly.
>
> **It does not and will not include any official assets.** That means no rulebook text, artwork, card scans or icons from Cephalofair Games. You need your own copy of the game to play.

> Status: early development (v0.1). It covers Modifier Decks and mercenary sheets. Combat automation, Skills and Talents, perks and enemies come later; see [PLAN.md](PLAN.md).

## Installation

In Foundry (or The Forge), go to **Install System** and paste this manifest URL:

```
https://github.com/PicoTN/GloomFoundry/releases/latest/download/system.json
```

## Features

- **Per-mercenary Modifier Deck and a shared GM deck.**
  - Each deck is backed by Foundry's built-in Cards documents: a deck plus a discard pile.
  - Decks are created automatically by the GM's client.
- **Attribute tests and attacks drawn from the deck.**
  - Advantage and disadvantage are supported.
  - Critical and Null are resolved, and the result posts to chat as a card.
- **Bless and Curse cards**, capped at 6 each and returned to the supply once drawn.
- **Reshuffle rules:**
  - Critical/Null reshuffles immediately outside combat, or in the cleanup phase in combat.
  - All decks shuffle at the start and end of combat.
- **Card faces.** Gloomhaven-style by default. Each player can switch to playing-card faces in the settings, for groups that use a poker deck (Appendix p. 343).
- **Perks:** a generic editor (you enter the cards from your own book); ticking a box rebuilds the deck.
- **Mercenary sheet:**
  - the six Attributes, with click-to-test
  - HP, level and gold
  - Backgrounds (+1 to a test, then expended)
  - Quick Breath and Full Rest

## Development

Requirements: Node 22+ and a licensed Foundry VTT v13 or v14 install.

```sh
npm install
npm run link -- /path/to/FoundryVTT   # the folder containing Data/; symlinks dist/ as Data/systems/gloomfoundry
npm run watch                         # rebuilds dist/ on change
```

| Script | What it does |
|---|---|
| `npm run build` | Production build into `dist/` |
| `npm run watch` | Development build in watch mode |
| `npm run typecheck` | TypeScript check (uses [fvtt-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-types)) |
| `npm test` | Unit tests for the Foundry-independent rules engine |
| `npm run art` | Regenerates the placeholder card faces in `public/assets/cards/` |
| `npm run check` | typecheck + test + build |

### Layout

```
src/
  gloomfoundry.ts        entry point: registration, hooks, public API (game.gloomfoundry)
  module/rules/          pure rules engine (no Foundry imports), unit-tested
  module/data/           TypeDataModels (Actor, Item, Card subtypes)
  module/deck/           ModifierDeck service, deck lifecycle, combat hooks, draw actions
  module/sheets/         ApplicationV2 sheets
  module/apps/           other windows (GM deck)
public/                  copied verbatim to dist/: system.json, lang/, templates/, assets/
styles/                  SCSS
tests/                   vitest
```

### Localization

Every user-facing string lives in `public/lang/<lang>.json`. To add a language, copy `en.json` and register it under `languages` in `public/system.json`.

### Card art

The card faces in `public/assets/cards/` are generated placeholders. To use other art, replace files using the same names (`atk-p1-attr4.svg`, `critical.svg`, `bless.svg`, …). `faceKey()` in `src/module/rules/modifier.ts` defines the naming scheme.

## Legal

This is an unofficial fan project, not affiliated with Cephalofair Games. Gloomhaven is a registered trademark of Cephalofair Games, LLC. This repository contains no rulebook text or official artwork, and must not include any.
