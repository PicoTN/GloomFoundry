# Gloomhaven RPG for FoundryVTT: Project Plan

Status: in progress (phases 0–1 implemented, untested in Foundry). Written 2026-11-17. Sources are the core rulebook (Backerkit PDF, v1) and web research on Foundry v14.

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
- **Tooling:** plain ES modules plus a small build step (Vite, or just Sass and the CLI). Start without TypeScript to keep friction low. We can add JSDoc types and `@league-of-foundry-developers/foundry-vtt-types` later if wanted.
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
| **0. Scaffold** | Repo, `system.json`, build, fvtt-cli pack pipeline, dev symlink into the Foundry data dir, CI lint. Spike Card subtypes. |
| **1. Modifier deck** | Card model, base 20-card deck generator, per-actor and GM decks, draw/test/attack chat cards, advantage/disadvantage, Critical/Null reshuffle, Bless/Curse, poker/GH face toggle. **This is the MVP; the game is playable with it plus notes.** |
| **2. Mercenary sheet** | Attributes with click-to-test (TN prompt, background and skill bonuses), HP, rests (Quick Breath / Full Rest automation), backgrounds. |
| **3. Powers** | Talent, Skill and Item types; ready/expended/lost states; Skill loadout; "lose a Skill to negate damage". |
| **4. Perks** | Perk data for the 16 classes (transcribed from pp. 344–347), perk UI that rebuilds the deck. |
| **5. Combat** | Planning-phase picker, initiative, enemy speeds, cleanup automation, element tracker, conditions as status effects / AEs. |
| **6. Enemies** | Enemy actor with level/elite tables, GM deck draws, threat budget helper. |
| **7. Content** | Compendia (see IP note). |

---

## 5. IP and repo hygiene

- The PDF is a **backer copy marked "NOT FOR PRINT"**.
  - **Never commit the PDF** or page renders. Add `*.pdf` to `.gitignore`.
  - Keep **rules text, skill and talent wording, art and icons** out of a public repo.
- Mechanics data is lower risk: card values and stat numbers. Short labels like condition names are fine.
- Full content compendia should wait for Cephalofair's community/fan-content policy, or live in a private/separate content module.
- Iconography (circle and hexagon, element and condition glyphs) needs to be our own or openly licensed, for example game-icons.net (CC BY 3.0).

---

## 6. Decisions (2026-11-17)

- Private repo for now: git@github.com:PicoTN/GloomFoundry.git
- Gloomhaven-style card faces by default. Generated placeholders for now; scans or other art can replace them later. Playing-card faces are a per-client setting.
- Scope: deck + sheet first. Combat automation later, but planned.
- TypeScript from day one (TS 7, fvtt-types, Vite, Vitest).
- English only, with every string in `lang/` so other languages can be added.

## 7. Open questions

1. **Rules check.** Is "−0" vs "+0" on perk cards meaningful? It could be a rolling-modifier marker. Needs a check in the rules.
2. **Advantage + disadvantage together.** The rulebook doesn't say how they combine; we currently cancel them out.
3. **Empty deck.** The rulebook doesn't cover running out of cards; we currently reshuffle the discard pile.
4. **Critical damage.** "Twice your base damage": we currently double the value after +X/−X attack effects, before Shield.
