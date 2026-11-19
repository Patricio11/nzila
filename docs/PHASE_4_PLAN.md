# Phase 4 plan: Economy core

*Goal (roadmap): a player can earn, hold, bank and spend Makuta, and the books always balance.*

Opened 2026-11-17, with Phase 3 built and not yet proven on real phones (`docs/completed/PHASE_3_COMPLETE.md`). Nothing in Phase 4 waits on that proof; it waits on the founder's phones.

## The recheck: what each task depends on

| Task | Depends on | State |
|---|---|---|
| 4.1 The ledger live, the wallet and the bank | 0.3, 0.5, 2.4 | All ticked. The rules (`packages/economy`: accounts, transfers, the sum-to-zero check) and the tables (`ledger_accounts`, `ledger_transfers`, `balances`) exist and nothing writes to them yet. **The Makuta on a card of origin is a number in `player_origins`, not a balance** |
| 4.2 Items and inventory | 4.1 | Ticked (2026-11-18): things in data, a row of each kind a player holds in a place, the carry limit, the Mochila. Places beyond the Mochila and the house (a vehicle, a business, evidence) join with their phases |
| 4.3 NPC shops and markets | 4.2 | The cantina through its grille is built (2026-11-18). Waits: its inside (interiors are Phase 5's, 5.1), phone top-ups (with the Telemóvel's credit), the market's stalls, selling, the clothes shops |
| 4.4 Needs, lightly | 0.2, 4.3 | The rules exist (`health.ts`, D-0.46, D-0.51) and nothing calls them. The zone now exists to call them |
| 4.5 Biscatos | 4.1, 4.4 | Three jobs until the Ilha (D-0.47) |
| 4.6 Tunables and the economy dashboard | 0.3, 3.8, 4.1 | 3.8 is built: the Estúdio has a place for it |
| 4.7 Wiring, verification, doc convention | 4.1 to 4.6 | |

## Open questions

- **Q1 Where does a player rest before they have a house?** 4.4 says resting restores Energia. The family's empty house is the founder's answer (D-3.13) and is Phase 5's. Until then: a bench restores slowly, by day. *The founder's to confirm.*
- **Q2 The fourth biscato**, with the pescador waiting for the Ilha (D-0.47). *The founder's.*
- **Q3 What things cost.** The cantina's list and its prices come from `docs/reference/LUANDA_REFERENCE.md`; the first numbers are a designer's guess until someone from Luanda reads them. *The founder's read.*
- **Q4 What a new player's first hour should earn and cost** (4.7 writes it out). It decides every tunable of this phase. *Proposed in 4.5, the founder's to change.*
- **Q5 Where the caixa and the bank branch stand on the Marginal** (4.1): the atlas, then the pack.
- **Q6 The daily cap for a new account's transfers in person**, and what "new" means. A guard against one phone feeding another.

## Decisions

**D-4.1 The Makuta of the card of origin enters through the ledger (delegated).** One transfer for each player, from the system's account for births to the player's Carteira, keyed by the player's id so that it can never happen twice; made when the card is dealt, and made once for every player who already has a card. From then on the wallet shows a balance, never `player_origins.makuta`. *Recommendation: yes; it is the ledger convention applied to the first Makuta there is.*

**D-4.2 Only the API writes the ledger (delegated).** The zone decides that something happened (a sale at a counter, a biscato scored) and asks the API to record it, with an idempotency key the zone makes; the phone never names an amount. The client proposes, the zone decides, the API records. *Recommendation: yes.*

**D-4.3 A player has two accounts: Carteira and Banco (delegated).** What is in the Carteira is on the body and at risk (theft, Phase 7; sleeping in a quick place, D-3.13); what is in the Banco is safe. Moving between them is a transfer at a caixa or a branch. *Recommendation: yes, as the roadmap says.*

**D-4.4 An item is a row with an owner and a place (delegated).** Not a count on a player: so that it can be handed over, left at home, taken as evidence or stolen as one thing, and so that nothing is ever duplicated by a retry. Stacks are rows with a quantity for things that are all alike. *Recommendation: yes.*

**D-4.5 A biscato is scored by the zone with `packages/sim` and paid by the API (delegated).** The phone plays the minigame and sends its inputs; the score is the zone's. *Recommendation: yes: it is the first place where cheating pays.*

**D-4.6 The rehearsal town has no economy (delegated).** Nothing earned or spent there exists: it is no district of the registry. *Recommendation: yes.*

**D-4.7 Every amount is in tunables from the first line (Rule 14).** Prices, pay, caps and the rates of Fome and Energia are added to `tunables/base.json` as they are needed, and the test that fails the build on a Makuta literal already exists. *Recommendation: yes.*

**D-4.8 After Phase 4, things to do together and a second bairro come before the alpha (the founder, 2026-11-18).** The order is written in `ROADMAP.md` ("The order of building after Phase 4"): taxi and kupapata, asking someone out and giving a gift, a small game for two; then Zango; then the alpha. Phase 4 itself is unchanged, and is built so that those follow at once: a gift is an item bought in a shop (4.2, 4.3) and handed over; a fare is a transfer.

**D-4.9 Nobody ages and nobody dies (the founder, 2026-11-18).** "Only under 18 can": read here as the children of a household, who grow (10.17), and a player of 15 to 17, who becomes 18 by the calendar. *That reading is the founder's to confirm.* For this phase it means what 4.4 already says: an empty bar is a hospital bill, never a death.

**D-4.10 The bairros, in order: Zango, Cazenga, Maianga, Ilha de Luanda, Mussulo (the founder, 2026-11-18).** The jet ski is a game on the water of the Ilha and Mussulo. The card of origin's bairros are these, and a family is given its house (D-3.13) only in a bairro that exists.

**D-4.11 A new account cannot send Makuta for its first three days, and has a daily limit after that (the founder, 2026-11-18; answers Q6).** Both numbers live in tunables. Receiving is never limited. With it: one grant of starting Makuta a phone (F-185).

**D-4.12 There are no guests: everyone registers (the founder, 2026-11-18; built the same day, Task 4.0).** An address and a password at the door, the address proved later, before sending Makuta or asking someone out; then the character; then the family. As first written, when it was a question: He proposed that everyone registers, to keep things simple. The recommendation given to him: yes to one kind of player, with registration as an address and a password and nothing else before the first step, and the address proved (the code by mail, already built) before a player may send Makuta or ask someone out. Registration alone does not stop one person making many accounts: D-4.11 and the proof of the address do. What it costs is the door that asks for nothing, which was the one thing our front door had over the competitor's.

**D-4.13 Damas as it is played in Luanda (the founder, 2026-11-19).** The Portuguese rules (the board with a dark corner on the right, capturing obligatory and taking the most pieces, a crowned dama that flies), with men capturing backward as well as forward, "as in Luanda", where the federation's text has them capture forward only. Built and checked move by move (F-204, F-222).

**D-4.14 The tables and the kambas before the rest of Phase 4 (the founder, 2026-11-19).** "Continue with the three-minute game, then recording results with a ranking, then kambas, with inviting a friend from another bairro." Tasks 4B.1 and 4B.2 are built ahead of the order of D-4.8, while 4.4 to 4.7 wait; the alpha itself (4B.3 to 4B.5) still waits for Phase 4 and the second bairro.

**D-4.15 The ranking is counted the way chess counts it (delegated, 2026-11-19).** Points per game and per bairro, from 1.000; a kota stands at the points of its strength (the beginner 800, the good player 1.100, the feared 1.400), so beating the feared kota is worth about three times beating the beginner, as the founder asked; a kota's points never move. `packages/games/src/classificacao.ts`, F-224.

**D-4.16 The bairros of the founder's maps: Vila Alice and Maculusso, not Vila Flor (the founder, 2026-11-19).** "Forget about Vila Flor, we do Vila Alice; and add the Bairro do Maculusso." Researched in `docs/reference/BAIRROS.md` with the founder's photographs (F-223).

**D-4.17 A player of 15 to 17 and an adult are not made kambas (proposed, 2026-11-19; the founder to confirm).** Private messages between a minor and an adult stranger are the risk a game with chat is judged by, and the age is self-declared. *Recommendation: keep it until counsel has read the terms; the softer choice is kambas across the line with no private messages.* Waiting on the founder, item 21; F-225.

**D-4.18 The zone is the only keeper of Fome and Energia (delegated, 2026-11-19).** It reads them as a player comes in, wears them with the steps they play and the effort the channel counts, and writes them every half minute and as they leave; eating is asked of the zone, which takes the thing and writes what it gave in one transaction. One writer, so that nothing is lost between two. The needs are kept as what was last set plus the steps, fast steps and jumps since, so that the tunables' rates hold exactly (the rules round down: a slice at a time would lose a sixth of the rate). *Recommendation: yes; built.*

**Done on the way, at the founder's word (2026-11-18):** the street's traffic is the zone's to decide, so two players see the same van (F-190); vehicles that began inside each other are parted (F-180); two who arrive together stand side by side (F-189).

## Carried into this phase from the founder's rulings of 2026-11-17

- The family gives a house, empty, of a kind that depends on the family (D-3.13): the family table gains the kind of house in this phase's tunables, so that Phase 5 has it.
- Nobody arrives knowing anybody: the first biscato and the cantina are where a player meets their bairro. A sale between two players in person (4.1) should count as meeting.
- Whoever sleeps in a quick place can be robbed: the Carteira and Banco split (D-4.3) is what makes that mean something.

## What "done" means for this phase

From the roadmap: the ledger sums to zero after a fuzz of 10 000 transfers; a replayed purchase charges once; no Makuta literal in code; a new player's first hour written out with what it earns and costs and checked against a played session.
