# Gloomhaven RPG for FoundryVTT: Project Plan

Status: phases 0–14 implemented (latest release v0.18.0). v0.13 had a first play-test on Forge (creation, power buttons, areas, elements, summons, Soothsinger Notes worked); v0.13.1 fixes what it found. Written 2026-11-17, updated 2026-11-18. Sources are the core rulebook (Backerkit PDF, v1) and web research on Foundry v14.

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
| **5b. Power actions** ✅ | Structured actions stored on every Skill, Talent, item, NPC action and perk card (`content/ACTIONS.md`), with the text parser as a fallback. Buttons in expandable power rows, chat cards and NPC sheets: attacks (one draw per target, Pierce, areas), heals, conditions, Infuse, Shield/Retaliate/Taunt (round statuses; Shield pre-filled in attacks, Retaliate button), traps, obstacles, marked spaces, summons. Hex area placement (clusters, lines, arcs, cones, all-within-range; rotate and mirror) as Regions that target opposing tokens. Element bonuses and requirements (each element once per turn, consumed only when stated), X values. Planning from the sheet (P/S picks, lock in). |
| **6. NPCs** ✅ | One `npc` actor for enemies, allies, summons and townsfolk. Bestiary stat block by CL (normal/elite, Attribute columns, DFNS/OFNS markers), or manual stats. Adversary and nemesis derived stats. NPC actions (F/N/S, elite-only, break/stunt). Uses the GM deck, or the controller's deck for summons. Switch side (sheet + token HUD), new NPCs Hostile at the current CL. GM window shows M, CL, the Combat Challenge values and scene Threat vs the difficulty max. Printed nemeses (final stats, HP and Threat ×M) are supported. Bestiary transcribed into `content/` (49 actors with portraits). Class summons are NPC actors (Summons compendium, 23), placed for their controller (its side, deck and owners; HP by the controller's level when needed). |
| **10. Mercenary company** ✅ | Company actor shared by the group (concept, service, home district, leader, closest faction, how missions come in, members by drag-and-drop, relationships and notes), level 0–5 with progress pips: "Gain a temporary benefit" (mission, milestone or retirement); the fifth raises the level and offers the permanent benefits it qualifies for. Benefit items with automation: Bless card for every member, gold for every member, Ward at the next combat, a City Watch ally placed at the current CL under a member's control. Mercenary sheets link to their company. Content: benefits and a company guide journal (Reference compendium). |
| **11. Shops & mission rewards** ✅ | `shop` actor (Prosperity 1–5, district, in Gloomhaven, price change %, open to players, resell) whose equipment items are its stock. GM rolls the stock from the Equipment compendiums by Prosperity (highest rarity and display count from p. 269, optional categories and common Basic items) or drops items in. Players browse with Observer rights and buy/sell for one of their mercenaries; the GM applies it. Prices: cost × shop change × (1 − company discounts), +10 g per missing Prosperity step for rarer items, rounded up; selling pays half, rounded down. Level gate (Rare L4, Masterwork L7; never Legendary) as a world setting, the GM can override. Company benefits automated: home-district and Gloomhaven-wide discounts, one-time discount (ticked per purchase), extra mission gold, recruits' gold. "Mission completed" (scene controls and company sheet): reward per mercenary (10–20 g), company extras, treasure, Faction Request outcome and gold per mercenary, extra gold, opens level-ups, grants the company's temporary benefit, counts missions, chat summary. |
| **12. Equipment rules** ✅ | Slots enforced on equip (1 Head, 1 Body, 2 Hand with "(2)" items using both, 1 Feet, Small = half level rounded up + items like the Cloak of Pockets); a full slot opens a swap prompt. In combat: swapping is announced as a primary action, only Hand/Small, never while Stunned (GM can override). 5-space inventory for unequipped items (fractions and quantities) shown on the sheet with warnings. The company sheet has a shared inventory: members leave items there and take them back; shops can deliver there. |
| **13. Combat automation** ✅ | Terrain uses Foundry Regions and movement: "trap" and "hazard" Region Behaviors (system types) react to tokens moving in, including through the path; Fly and GM Displace never trigger them, Jump and Blink (= Teleport) only on the destination; ability traps are used up. Difficult terrain is Foundry's Modify Movement Cost (walk ×2). Players can't end a walk/jump in an obstacle. Marked spaces are recalled at the start of the turn of a token in or next to them. GM "Place terrain" tool. Movement actions limited to Walk, Fly, Jump, Teleport (Blink, ignores walls). Push/Pull buttons on attacks: valid hexes (each step farther/closer, not through tokens, obstacles or movement walls; a flying target passes over them but can't end on a character), moved with Foundry's movement API. Teleport X button: empty spaces within range (line of sight only with a house-rule setting). Invisible: enemies can't target it. Surprise button in round 1. Lasting effects tracked (uses, rounds), Skill Active then expended or lost. |
| **14. Movement in combat** ✅ | World setting (on by default). Outside combat, free movement. In combat, players move only their current combatant's token in the action phase, within the movement granted this turn by Move buttons (powers, NPC actions; relative NPC moves use the NPC's Move) and the tracker's basic Move 4 / Move 3. Jump and Fly need a Jump/Flying move (the button sets the token's movement action); Teleport only through its button; Immobilize and Stun stop movement. Cost comes from Foundry's measure (difficult terrain +1); used movement is the token's movement history, so an undo (Ctrl+Z) gives it back. Used/granted shown in the tracker. The GM, forced movement and teleports are not limited. |
| **7. Content** (local only) | Done in the git-ignored `content/` folder: perks (16 classes, checked against the class chapters), 46 Backgrounds, 16 classes and 8 ancestries with their Talents and Skills, 160 equipment items with each class's starting gear, 20 factions, 49 bestiary actors with portraits, 23 class summons, class mechanics, structured actions for everything (re-checked against the book), and an icon pack (13 conditions, 7 elements, 18 stats). The system loads an icon pack from a JSON manifest, and imports the whole folder into world compendiums from its `index.json` (Settings > Import content, v0.7.0). No compendia are published (see IP note). |
| **8. Character creation** ✅ | Wizard following "Making a Mercenary" (p. 105): identity, ancestry, class, major faction (member at Tier 2), 6 Attribute points (max 3), 4 Backgrounds, class starting gear or 50 g of common gear, personal quest. Opens from a "New mercenary" button in the Actors sidebar, a button on blank sheets, and automatically for players opening their blank mercenary. |
| **8b. Factions & equipment** ✅ | `faction` items: tier 0–5, membership, request successes/failures with automatic rise/fall (p. 234), one faction's benefits active per mission. Equipment can be used per round, scene or rest. |
| **8d. Class mechanics** ✅ | Classes declare mechanics (`content/MECHANICS.md`): states (Berserk), counters (Soothsinger Notes, Wildfury rage tokens, auto-gained on companion attacks), slots in play (Augments, Songs, Invocations), token marks (Doom with its options, stacking Plague, Prescriptions), pools handed to allies as temporary items (Supply, Medical Packs), summons; talent-gated where needed. Class panel on the sheet; actions and bonuses use them (state/mark/counter triggers, spending counters, Command through the companion). Refresh button updates a character's items from the compendiums, keeping their state. |
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
4. **Company gold benefits**: "Missions always offer 10 additional gold" and the recruits' "Gain 50 g between each mission" don't say per mercenary or for the group; the Mission completed dialog pre-fills them per mercenary and the GM can change the amounts.
5. **Rounding in shops**: gold is whole, so purchases round up (5 torches at 1/5 g cost 1 g) and sales round down.
6. **Faction Tier 1 members**: one success brings them back to Tier 2 (the "successes = tier" rule), three failures make them Hostile.

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
| v0.12.1 | Marked spaces (Tinkerer), spending class counters (Concentrated Rage), talent-gated mechanics |
| v0.13.0 | Mercenary company: company actor and sheet, levels and benefits, benefit automation, company content and reference journal |
| v0.13.1 | Play-test fixes: scrolling sheet tabs, icon-pack icons in action buttons, light outline on dark icons, icon and name on traps/obstacles/marked spaces, Player field on mercenaries, summons owned by their summoner, faction goals (content) |
| v0.14.0 | Shops (stock by Prosperity, buying/selling through the GM, company discounts, level gate) and the Mission completed rewards dialog |
| v0.15.0 | Equipment rules: slot limits and swaps, combat swap limits, 5-space inventory, company shared inventory |
| v0.16.0 | Combat automation: terrain (traps, hazards, obstacles, marked spaces), Push/Pull, Invisible targeting, surprise rounds, lasting effects |
| v0.16.1 | Teleporting status; Push/Pull respects movement walls and flying targets |
| v0.16.2 | Teleport X button: empty spaces within range, walls ignored, only the destination triggers terrain; optional line-of-sight house rule |
| v0.17.0 | Terrain rebuilt on Foundry's Region Behaviors and movement actions (traps and hazards now trigger, including along a path; difficult terrain costs movement); Fly/Jump/Teleport are Foundry movement actions |
| v0.17.1 | Stored actions replace the action text (sheets, chat cards, NPC actions); the wording stays in an info tooltip. NPC actions use their stored actions. Play-test: traps trigger along a walking path, not when jumping, flying or teleporting |
| v0.18.0 | Movement enforced in combat: on your turn, within the Move abilities used (buttons, basic Move 4/3), Jump/Fly only with matching moves, Immobilize/Stun; free outside combat |
| v0.18.1 | Used movement read from Foundry's movement history: undoing a move (Ctrl+Z) gives the movement back |

## 10. What remains

**Keep play-testing on Forge.** v0.1–v0.9 have been tried live (decks, sheets, creation, level up, a first combat round). Everything from v0.10 (power buttons, area placement, planning from the sheet, structured actions, round abilities, class mechanics, summons) still needs a live run.

Combat:
- Movement grants pool for the turn (a Move 3 and a Move 2 give 5 to spend in any order, also split around an attack).
- Lasting effects are tracked but their bonuses aren't applied automatically (the attack dialog doesn't add "+1 attack this round").
- Nemesis Break actions at half HP and Stunts per round.
- "Activate" (trigger a trap at range with a GR test) and destroying objects with HP.

Content model gaps found while transcribing actions (currently notes or text actions):
- Class mechanics still text: damage per Plague on all enemies, talents that change a mechanic's limits (Oppressive Strikes: two Augments), Bestial Rage's companion bonuses (the token is tracked), "grant your summons a primary action", triggers on an enemy's death, Doomstalker's two Dooms with Inescapable Fate.
- Push/Pull/damage without an attack and conditions on several targets are notes; granted/controlled actions are labelled but run as the acting mercenary.

Character, factions and items:
- Faction boons are text only: Keepers' prayers, Guild Bazaar, Freebooters' sovereigns and Night Market, Sect rituals and charges, Shields' titles (Vanguard removes modifier cards), University Thesis and citations, Robin deathfeathers. Keepers' Hostile (Bless becomes Curse) could be automated.
- Equipment: "Armed to the Teeth" (free Hand swap) and the Freebooters' Coat of Way Too Many Pockets are text; extra items taken from the shared inventory aren't tracked per mission.
- Starting above level 1 (p. 120–121): extra levels, faction tier by level.
- Retirement benefits for new characters (p. 121) in the creation wizard (and the company's retirement temporary benefit).

NPCs and content:
- Fill the Rogue Mercenary's missing "bandit commander" base actions if the book ever prints them.
- Company benefits still text: the Level 5 "+1 faction rank for 100 g", "one less Faction Request", crafting intervals, Loaned Gear. Crafting projects and haggling (contested CU or LO vs CU) aren't automated; the GM changes prices by hand.
- Faction shops (Merchant's Guild special shop by tier, Night Market) are just shops the GM sets up.
- Icons on the modifier card faces themselves (the effect currently shows as a star, with the text and icons below the cards in chat).

Polish:
- Scanned card art once the physical decks arrive (replace the generated faces via the icon pack's `card.<key>` entries).
- Compendium build pipeline (`fvtt-cli`) for anything shippable, if a fan-content policy allows it. (Private content already goes into world compendiums through the importer.)
- Other languages (all strings are already in `lang/en.json`).
