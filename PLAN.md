# Gloomhaven RPG for FoundryVTT: Project Plan

Status: phases 0–8 implemented (latest release v0.12.0). Only v0.1 has been play-tested on Forge; everything after it is typechecked and unit-tested but not yet tried in a live game. Written 2026-11-17, updated 2026-11-18. Sources are the core rulebook (Backerkit PDF, v1) and web research on Foundry v14.

> PDF page numbers are the printed page number **+3** (printed p.343 is PDF page 346).

---

## 1. What the rules need from us

### 1.1 The Modifier Deck (Ch. 2, pp. 63–64; Appendix, pp. 343–347)

Every attack and every attribute test is resolved with this deck. There are no dice.

- **Decks.** Each player has their own deck. The GM has **one shared deck** for all GM-controlled characters, and it never gains perks.
- **Card values.** A card carries two values:
  - an **attack modifier** (circle): −2…+2, or ×2 (Critical), or Null;
  - an **attribute value** (hexagon): 1…6.
- **Attribute test.** Result = score (0–7) + bonuses + attribute value. Success if the result ≥ the TN.
- **Critical and Bless.** On a test this is a critical success. On an attack it deals ×2 base damage.
- **Null and Curse.** On a test this is a critical failure. On an attack the hit lands but deals 0 damage.
- **Attack order.** Apply ±X attack effects first, then draw and apply the card modifier, then apply the target's Shield. With multiple targets, draw separately for each target.
- **Advantage / disadvantage.** Draw 2 and keep the better or worse card. Both cards go to the discard. The GM arbitrates ties. Strengthen gives advantage, Muddle gives disadvantage.
- **Reshuffle.**
  - In combat, if a Critical or Null was drawn, shuffle the discard back during the **cleanup phase**.
  - Outside combat, shuffle right after resolving it.
  - Every deck is shuffled at the start and end of combat.
- **Bless and Curse.**
  - Shuffle one in when gained, up to **6 of each**; extra gains are ignored.
  - Once drawn, they go back to the supply, never to the discard.
  - All of them are removed on a Full Rest.
  - They can be added to the GM deck for enemies.
- **Perks** permanently remove and/or add cards. Perk cards have ranks 7–10. Each one has an attack modifier, an attribute value, and sometimes an effect such as "Wound", "Infuse Fire" or "Heal 1, yourself".
- **Contests.** Your draw against the GM deck's draw.

### 1.2 Playing-card correspondence (Appendix, p. 343)

Base deck: 20 cards.

| Playing card | Attack | Attribute |
|---|---|---|
| Red Joker | **Null** | – |
| A♥ | −2 | 1 |
| A♣ | −1 | 1 |
| 2♣, 2♦, 2♥ | −1 | 2 |
| 3♥ | −1 | 3 |
| 3♣, 3♦, 3♠ | +0 | 3 |
| 4♣, 4♦, 4♥ | +0 | 4 |
| 4♠ | +1 | 4 |
| 5♣, 5♦, 5♠ | +1 | 5 |
| 6♦ | +1 | 6 |
| 6♠ | +2 | 6 |
| Black Joker | **Critical ×2** | – |

The face cards cover the temporary cards:

- **Black face cards** (J/Q/K of ♠♣, 6 cards) are **Bless**.
- **Red face cards** (J/Q/K of ♥♦, 6 cards) are **Curse**.

6 of each is exactly the in-game cap.

- **Perk cards** use ranks 7–10 (for example, Berserker adds 7♥ / 7♦ / 7♣). Each class has a perk table (pp. 344–347).
- **Transcription.** The icons in those tables are images, so pdftotext can't read them. They must be transcribed by hand or with vision from page renders.
- **Two printings.** The same card can show "+0" or "−0". This probably matters, so check it in the rules before modelling.

**Key insight for the system:** every modifier card has a canonical identity (`suit + rank`). One data model can therefore render each card two ways: as a Gloomhaven-style face (circle and hexagon) or as a classic poker-card face. This is a per-user display setting.

### 1.3 Other mechanics the system will touch

- **Mercenary**
  - 6 attributes: Cunning, Finesse, Grit, Intuition, Logic, Understanding (0–7)
  - HP, level, gold, ancestry, class, faction(s), backgrounds, personal goal, items with slots
- **Powers:** Talents, Skills and Items.
  - **Talents** have an initiative, a primary action and a secondary action. They are never expended. Some are passive. Some replace another Talent at a higher level.
  - **Skills** have a level, an initiative, an attribute bonus (+X), a primary action and a secondary action. They are **expended** (back at the end of the scene) or **lost** (back at a Full Rest). You can lose one voluntarily to negate damage from one source. You equip 2 ancestry + 4 class Skills, chosen at each Full Rest.
  - **Items** have a slot (Armor, Hand, Small…), an optional initiative and a primary action. They are expended or lost.
  - **Backgrounds** give +1 to a test or let you resist a condition, and are then expended.
- **Combat round:** planning → action → cleanup.
  - **Planning.** Pick a primary and a secondary from different powers, then take the initiative of one of them.
  - **Enemy initiative.** Each enemy type gets a speed (Fast, Normal or Slow), which sets its initiative. Elites act before normals. Summons act just before their controller.
  - **Cleanup.** Run end-of-round effects, reshuffle decks that drew Critical or Null, then decay elements.
- **Elements:** Air, Dark, Earth, Fire, Ice and Light. Each is Strong, Waning or Inert. An infusion becomes Strong at the end of the turn, and elements decay each round.
- **Conditions**
  - Positive: Bless, Invisible, Regenerate, Safeguard, Strengthen, Ward…
  - Negative: Curse, Immobilize, Muddle, Pacify, Poison, Stun, Wound, Plague?…
  - Durations differ between combat and exploration. Many have "Test XX to resist".
- **Rests**
  - **Quick Breath:** expend leftover Skills to heal, then recover expended powers.
  - **Full Rest:** full HP, recover everything, remove Bless and Curse, re-pick Skills.
- **Enemies** (Ch. 9): stat rows by level (0–7) for Normal and Elite. Columns: defense, HP, attack, the three attribute pairs IN/GR, CU/FI, LO/UN, and offenses. Also a Threat cost, three initiative speeds, an action list (P/S/F tags) and variants.

---

## 2. Foundry platform decisions

- **Target:** Foundry **v13 minimum, v14 verified**. The current stable is v14.370.
- **Data:** TypeDataModel subtypes declared in `system.json → documentTypes`. No `template.json`.
- **Sheets:** ApplicationV2 + `HandlebarsApplicationMixin` (ActorSheetV2 / ItemSheetV2). No jQuery, no v1 apps. Editors are ProseMirror only.
- **Active Effects:** in v14 they are V2, with `system.changes`. Use them for conditions and for item or perk bonuses.
- **Packs:** sources are JSON or YAML in the repo. `@foundryvtt/foundryvtt-cli` (`compilePack`/`extractPack`) builds the LevelDB packs.
- **Tooling:** TypeScript 7 with fvtt-types, Vite (library build to `dist/`), Sass and Vitest. Pure rules live in `src/module/rules/` with no Foundry imports and are unit-tested.
- **Reference code:** Foundry's own *Crucible* system, *Daggerheart (Foundryborne)* and dnd5e for modern DataModel + AppV2 patterns. Use *SWADE* for card mechanics built on the core Cards API. The asacolips boilerplate is useful for layout only, because its sheets are outdated.
- **Card modules:** use **none as a hard dependency**. Card modules historically die at major Foundry versions (Monarch and Card Support are dead). *Complete Card Management* (verified on v14) could get optional, soft integration later.

### 2.1 Modifier deck architecture (the core decision)

**Recommendation:** build on **core `Cards`/`Card` documents** and wrap them in our own `ModifierDeck` service. Don't rely on the stock Cards UI for play.

- **Card subtype `modifier`**, with `system` fields:
  - `attack: {kind: "number" | "critical" | "null", value}`
  - `attribute` (1–6 | null)
  - `effects` (text plus structured tags such as wound, infuse:fire, heal:1…)
  - `category: base | perk | bless | curse`
  - `playingCard: {suit, rank}`
  - optional `rolling`/`sign` flag (pending the −0 question)
- **Cards documents per owner.**
  - Each mercenary gets a `deck` and a `pile` (discard). Their IDs are stored on the actor, and the player owns them.
  - The GM gets one world-level deck and pile, referenced in a world setting.
  - Bless and Curse supply decks are GM-owned, and their cards are passed in and out with `pass()`.
- **Service API (sketch):**
  - `draw({mode: "attack" | "test", advantage, disadvantage})` returns a result and posts a chat card
  - `addBless(n)`, `addCurse(n)` (capped at 6)
  - `flagReshuffle()`, `cleanup()`, `shuffleAll()`
  - `applyPerk(perk)`, `rebuildFromPerks()`
- **Cross-ownership writes go through a GM socket relay.** Examples: a player cursing an enemy writes to the GM deck, and a player drawing for a summon writes to a deck they don't own.
- **Chat card.** It shows the drawn card or cards, which one was kept for advantage or disadvantage, and the result vs the TN, or the damage after Shield. It is rendered in the user's chosen face style (Gloomhaven or poker).
- **Alternative considered:** keep deck state as arrays on the actor (no Cards documents). This would make permissions simpler and updates atomic. We reject it because we lose native card visuals, piles, and future table or hand modules. Revisit if the spike below shows that Card subtypes are painful.

**Spike (phase 0):** the v14 type definitions confirm that `Card` and `Cards` support system subtypes (TypeDataField). Still to verify in a running Foundry: draw and shuffle performance, and permissions with a non-GM player.

---

## 3. Data model (first cut)

> Superseded in places by the implementation: enemies, allies and summons are one `npc` actor type, `gear` became `equipment`, and NPC actions are `npcAction` items. See `src/module/data/`.

**Actors**

- `mercenary`
  - attributes ×6, hp {value, max}, level, gold, xp?
  - ancestry, class, factions [{id, tier}], backgrounds, personalGoal
  - deck/pile IDs, perk checkboxes state
- `enemy`
  - level, variant (normal/elite)
  - stats table (by level), threat, speeds {fast, normal, slow}
  - actions, tactics rating
- `summon` / `npc` (later)

**Items**

- `talent`: level, initiative, primary, secondary, passive?, replaces
- `skill`: source (ancestry | class), level, initiative, attrBonus, primary, secondary, onUse (expend | lose), state (ready | expended | lost), equipped
- `gear`: slot, cost, initiative?, primary, onUse, state, equipped
- `background`: state (ready | expended)
- `class` / `ancestry`: grant talents, skills, HP-by-level and perk list on drop
- `perk`: class, checkboxes, ops [{remove: [...], add: [...]}, choice groups]

**Combat**

- Combatant data: the chosen powers and initiative
- Combat hooks: round end runs cleanup (reshuffle flags, decay elements, end-of-round effects)
- An element tracker app (6 elements × 3 states), visible to all and writable by the GM or through a socket

---

## 4. Roadmap

| Phase | Deliverable |
|---|---|
| **0. Scaffold** ✅ | Repo, `system.json`, build, fvtt-cli pack pipeline, dev symlink into the Foundry data dir, CI lint. Spike Card subtypes. |
| **1. Modifier deck** ✅ | Card model, base 20-card deck generator, per-actor and GM decks, draw/test/attack chat cards, advantage/disadvantage, Critical/Null reshuffle, Bless/Curse, poker/GH face toggle. **This is the MVP; the game is playable with it plus notes.** |
| **2. Mercenary sheet** ✅ | Attributes with click-to-test (TN prompt, background and skill bonuses), HP, rests (Quick Breath / Full Rest automation), backgrounds. |
| **3. Powers** ✅ | Talent, Skill, equipment, Class and Ancestry item types; ready/expended/lost; Skill loadout (2+4); Skill test bonus and Razor's Edge; heal 3 / lose to negate; Quick Breath and Full Rest recovery; equipment slots; classes/ancestries grant items and set HP by health track. Backgrounds have categories and Master (+2). Content (Skill/Talent text) is entered by players or kept in the local `content/` folder. |
| **4. Perks** ✅ | Generic perk editor (no class data bundled: players enter perks from their own book); ticking boxes rebuilds the deck, keeping Bless/Curse. |
| **4b. Conditions** ✅ | Gloomhaven conditions replace Foundry's token statuses (plus Unconscious/Dead). Sheet toggles with resist tests; Strengthen/Muddle and the target's Poison/Ward pre-fill the draw dialogs; Bless/Curse from the token HUD add deck cards; rests and end of combat clear conditions; Unconscious follows HP. Durations wait for combat (phase 5). |
| **5. Combat** ✅ (first pass) | Planning phase each round: mercenaries pick primary/secondary powers and initiative, the GM picks enemy speeds (no repeat), elites before normals, summons before their controller; ascending order. Then the action phase. Turn start: Regenerate, then Wound. Turn end: infusions become Strong, "until end of next turn" conditions expire, planned Skills/items are expended or lost. Round end: elements decay, Critical/Null decks reshuffle. Element tracker in the combat sidebar. "Apply damage" on attack cards (Ward, Regenerate). End of combat: unconscious mercenaries heal 1. Not yet: persistent/round effects, surprise, targeting rules for Invisible. |
| **6. NPCs** ✅ | One `npc` actor for enemies, allies, summons and townsfolk. Bestiary stat block by CL (normal/elite, Attribute columns, DFNS/OFNS markers), or manual stats. Adversary and nemesis derived stats. NPC actions (F/N/S, elite-only, break/stunt). Uses the GM deck, or the controller's deck for summons. Switch side (sheet + token HUD), new NPCs Hostile at the current CL. GM window shows M, CL, the Combat Challenge values and scene Threat vs the difficulty max. Printed nemeses (final stats, HP and Threat ×M) are supported. Bestiary transcribed into `content/` (49 actors with portraits). Next: summon actors for class summons. |
| **7. Content** (local only) | Done in the git-ignored `content/` folder: perks (16 classes, checked against the class chapters), 46 Backgrounds, 16 classes and 8 ancestries with their Talents and Skills, 160 equipment items with each class's starting gear, 20 factions, 49 bestiary actors with portraits, and an icon pack (13 conditions, 7 elements, 17 stats). The system loads an icon pack from a JSON manifest, and imports the whole folder into world compendiums from its `index.json` (Settings > Import content, v0.7.0). No compendia are published (see IP note). |
| **8. Character creation** ✅ | Wizard following "Making a Mercenary" (p. 105): identity, ancestry, class, major faction (member at Tier 2), 6 Attribute points (max 3), 4 Backgrounds, class starting gear or 50 g of common gear, personal quest. Opens from a "New mercenary" button in the Actors sidebar, a button on blank sheets, and automatically for players opening their blank mercenary. |
| **8b. Factions & equipment** ✅ | `faction` items: tier 0–5, membership, request successes/failures with automatic rise/fall (p. 234), one faction's benefits active per mission. Equipment can be used per round, scene or rest. |
| **8c. Level up** ✅ | GM toggle in a Gloomhaven scene-controls group shows a Level up button on mercenary sheets. The dialog applies p. 120: level +1 (HP follows the track, the gain is healed), 1 Attribute point (cap 2 + half level), 1 Perk box, a class Skill (L2, 4, 5, 6, 8, 9), a passive Talent and an ancestry Skill (L3, 7), the level-5 Talent upgrades. Options come from the class's/ancestry's powers in the world and compendiums. |

---

## 5. IP and repo hygiene

- The PDF is a **backer copy marked "NOT FOR PRINT"**.
  - **Never commit the PDF** or page renders. Add `*.pdf` to `.gitignore`.
  - Keep **rules text, skill and talent wording, art and icons** out of a public repo.
- Mechanics data is lower risk: card values and stat numbers. Short labels like condition names are fine.
- Full content compendia should wait for Cephalofair's community/fan-content policy, or live in a private/separate content module.
- Iconography (circle and hexagon, element and condition glyphs) needs to be our own or openly licensed, for example game-icons.net (CC BY 3.0). Official icons are only used through a local icon pack the user uploads to their own server.

---

## 6. Decisions (2026-11-17)

- Repo: git@github.com:PicoTN/GloomFoundry.git, public since v0.1 (personal test project, no official assets). Releases are built by GitHub Actions on `v*` tags; the manifest is `releases/latest/download/system.json`.
- Gloomhaven-style card faces by default. Generated placeholders for now; scans or other art can replace them later. Playing-card faces are a per-client setting.
- Scope: deck + sheet first. Combat automation later, but planned.
- TypeScript from day one (TS 7, fvtt-types, Vite, Vitest).
- English only, with every string in `lang/` so other languages can be added.

## 6b. Sides and Invisible (implemented)

A token's side is its Foundry **disposition**: Friendly (mercenaries, allied NPCs) vs Hostile (enemies). Neutral and Secret are never opposed.
**Invisible** makes a token undetectable by the vision of tokens on the *opposing* side only, by wrapping every detection mode's `_canDetect`. Allies keep seeing each other. A GM looking through an enemy token doesn't see invisible mercenaries. A GM with no token selected sees everything.
This only matters on scenes with Token Vision enabled. Targeting is not blocked yet; that could come with combat automation.

## 7. Rules clarifications

- Modifiers are always written "+0", never "−0". The "−0" seen in the extracted perk tables was a rendering artefact.
- A Modifier Deck never runs out: drawing Critical/Null always reshuffles the discard pile back in. The code keeps an empty-deck reshuffle only as a safety net.
- Damage order: attack bonuses and penalties, then the modifier card, then Shield, then Ward (p. 77, 84). Ward halves the damage with the reduction rounded up, so 5 damage becomes 2. This matches the board game; the exact wording ("reduce that damage by half (rounded up)") is slightly ambiguous.

## 8. Open questions

1. **Advantage + disadvantage together.** The rulebook doesn't say how they combine; we currently cancel them out.
2. **Critical damage.** "Twice your base damage": we currently double the value after +X/−X attack effects, before Shield and Ward.
3. **Leftover gold** when buying the 50 g of starting gear: we keep it (p. 118 doesn't say).
4. **Faction Tier 1 members**: one success brings them back to Tier 2 (the "successes = tier" rule), three failures make them Hostile.

## 9. Releases

| Version | Content |
|---|---|
| v0.1.0–v0.1.1 | Scaffold, Modifier Decks (personal + GM), mercenary sheet, attribute tests, attack draws, release workflow |
| v0.2.0 | Ward after Shield, perks editor and JSON import |
| v0.3.0 | Gloomhaven conditions as token statuses, opposed-side Invisible, switch side |
| v0.4.0 | Powers: Skills, Talents, equipment, classes, ancestries, richer Backgrounds |
| v0.5.0 | NPCs: enemies, allies, summons, stat blocks by CL, Threat |
| v0.6.0 | Combat flow (planning/action/cleanup), element tracker, damage application, icon packs |
| v0.6.1 | Printed nemeses |
| v0.7.0 | Content importer: a private content folder becomes world compendiums; enemies from a compendium start at the current CL |
| v0.7.1 | Nested compendium folders (Talents, Skills/Level N, Perks; Backgrounds by category) |
| v0.8.0 | Character creation wizard, factions, Equipment and Factions compendiums, per-round item uses |
| v0.9.0 | Level up dialog behind a GM toggle (Gloomhaven scene controls), perks worded like the class chapters |
| v0.9.1 | Perks drawn from their card data: attack circle, Attribute hexagon, effect icons from the icon pack |
| v0.9.2 | Level up button fix; icons in power, item and NPC action texts and in drawn card effects; "Infuse X or Y" |
| v0.10.0 | Power action buttons (attack, heal, conditions, infuse, areas, traps, obstacles, summons) in sheets and chat; hex area placement as Regions; expandable power rows; planning from the sheet |
| v0.11.0 | Structured actions stored on powers, items, NPC actions and perk cards (parser as fallback); element bonuses with once-per-turn tracking; area anchors, "all within range", mirroring; card effect buttons |
| v0.11.1 | Action requirements ("only if Dark is active", "only if Berserk") and X values that ask for a number |
| v0.12.0 | Shield/Retaliate/Taunt as round statuses (auto Shield in attacks, Retaliate button); class mechanics (Berserk, Notes and Songs, Augments, Doom, Plague, Supply, Medical Packs, Prescriptions, Invocations, Command, summons) with a Class panel; Summons compendium; refresh items from compendiums |

## 10. What remains

**First: play-test v0.6.1 on Forge.** Run a mercenary with a class, perks and powers against a few imported bestiary enemies through a full combat round, and fix what breaks. The sheets' tabs, planning dialogs and tracker panel have never run in a live Foundry.

Combat:
- Move, Shield and Retaliate actions are shown but not automated (round/persistent effects); "Attack X" formulas and choices still need the player to pick.
- Traps and obstacles are Regions with no automation (damage on entry, blocking movement).
- Persistent and round effects (bonuses that last a round, or until a condition is met).
- Surprise rounds.
- Invisible: block targeting by opposed tokens, not just vision.
- Retaliate, Pierce, Push/Pull and other attack effects are text only; decide how much to automate.
- Nemesis Break actions at half HP and Stunts per round.

Content model gaps found while transcribing actions (currently notes or text actions):
- Class mechanics still text: damage per Plague on all enemies, marked board spaces (Tinkerer), Wildfury rage tokens, talents that change a mechanic's limits (Oppressive Strikes), "grant your summons a primary action", triggers on an enemy's death.
- Push/Pull/damage without an attack, conditions on several targets, "granted to an ally/summon" and "controlled enemy" actions are notes.
- Persistent and round effects ("the next 2 times...", "this round") are text.

Character, factions and items:
- Faction boons are text only: Keepers' prayers, Guild Bazaar, Freebooters' sovereigns and Night Market, Sect rituals and charges, Shields' titles (Vanguard removes modifier cards), University Thesis and citations, Robin deathfeathers. Keepers' Hostile (Bless becomes Curse) could be automated.
- Equipment rules: equipped limits (1 head, 1 body, 2 hands with two-handed items, 1 feet, small slots by level), the 5-space inventory, swapping in combat, buying limits by level and shop rarity, selling at half price.
- Starting above level 1 (p. 120–121): extra levels, faction tier by level.
- Retirement benefits for new characters (p. 121) in the creation wizard.

NPCs and content:
- Fill the Rogue Mercenary's missing "bandit commander" base actions if the book ever prints them.
- Icons on the modifier card faces themselves (the effect currently shows as a star, with the text and icons below the cards in chat).

Polish:
- Scanned card art once the physical decks arrive (replace the generated faces via the icon pack's `card.<key>` entries).
- Compendium build pipeline (`fvtt-cli`) for anything shippable, if a fan-content policy allows it. (Private content already goes into world compendiums through the importer.)
- Other languages (all strings are already in `lang/en.json`).
