# Phase 4 plan: Economy core

*Goal (roadmap): a player can earn, hold, bank and spend Makuta, and the books always balance.*

Opened 2026-11-17, with Phase 3 built and not yet proven on real phones (`docs/completed/PHASE_3_COMPLETE.md`). Nothing in Phase 4 waits on that proof; it waits on the founder's phones.

**Complete 2026-11-20** (`docs/completed/PHASE_4_COMPLETE.md`). Phases 5 and 6 open: `docs/PHASE_5_PLAN.md`, `docs/PHASE_6_PLAN.md`.

## The recheck: what each task depends on

| Task | Depends on | State |
|---|---|---|
| 4.1 The ledger live, the wallet and the bank | 0.3, 0.5, 2.4 | All ticked. The rules (`packages/economy`: accounts, transfers, the sum-to-zero check) and the tables (`ledger_accounts`, `ledger_transfers`, `balances`) exist and nothing writes to them yet. **The Makuta on a card of origin is a number in `player_origins`, not a balance** |
| 4.2 Items and inventory | 4.1 | Ticked (2026-11-18): things in data, a row of each kind a player holds in a place, the carry limit, the Mochila. Places beyond the Mochila and the house (a vehicle, a business, evidence) join with their phases |
| 4.3 NPC shops and markets | 4.2 | The cantina through its grille is built (2026-11-18). Waits: its inside (interiors are Phase 5's, 5.1), phone top-ups (with the Telemóvel's credit), the market's stalls, selling, the clothes shops |
| 4.4 Needs, lightly | 0.2, 4.3 | The rules exist (`health.ts`, D-0.46, D-0.51) and nothing calls them. The zone now exists to call them |
| 4.5 Biscatos | 4.1, 4.4 | Built (2026-11-20, D-4.22): lavar pratos, levar carga, zunga, lavar carros, and the Biscatos app. The pescador waits for the Ilha (D-0.47) |
| 4.6 Tunables and the economy dashboard | 0.3, 3.8, 4.1 | Built (2026-11-20, D-4.24): live tunables with a dated record, Afinar and Economia in the Estúdio, `docs/ECONOMY.md` |
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

**D-4.19 Great public hospitals carry their real names (the founder, 2026-11-20, agreeing to the recommendation).** The Hospital Josina Machel is L1's hospital, a landmark as the Fortaleza is, shown with respect (no crime, no deaths, no queues made fun of); centros médicos and postos de saúde take invented names; private clinics are brands and are not named (D-0.11). Counsel reads it before the alpha (Waiting item 7). `LUANDA_REFERENCE.md` §6f.

**D-4.22 Biscatos: the four, the path and the pay (2026-11-20, Task 4.5).** *Q2 answered by the founder's own list (2026-11-18):* the four are **lavar pratos** (at a kiosk or the market), **levar carga** (the roboteiro, at the paragem), **zunga** (the bacia along the Marginal) and **lavar carros**; the pescador waits for the Ilha (D-0.47). Each is a place in the street, a pack's point of interest named `biscato-<kind>-<where>` with the `biscatos` sign, and its gold button names it ("Lavar pratos"). The path is D-4.5's: the phone asks the zone to begin; the zone checks the player stands there, on foot, not too tired, and gives a seed; both sides make the same round from it (`packages/sim/src/minigame`); the phone draws it and sends only what the thumb did; the zone replays that to score it (0 to 1 000), takes the Energia and the Fome the work cost, and leaves a note of the score; the phone asks the API, which pays once from the `wage` faucet. The pay: from the biscato's least to its most by score, then a daily taper on what biscatos have already paid that day (all of it up to the first step, half to the second, a quarter after: never a wall, `tunables/biscatos.json`); nothing for a score of nothing. A round may be left early: what was done is scored against the whole round. Built one biscato at a time, lavar pratos first, each on the same path.

**D-4.25 Tax stays, because it is real life; and it is small, fixed and seen (founder, 2026-11-21).** Shown the comments of a competitor's players, more than a third of which are about its tax on earnings (25 to 35 %, "em tudo", `docs/reference/MARKET_NOTES.md` §1g), the founder kept ours: "we need tax because remember it's real life". What the comments teach is how. A tax in this game is **a fixed, small rate that does not rise as a player does well; said on the pay slip or the business's books before the money is earned; taken on wages and a business's takings only**, never on a gift, the family's money, an errand or a biscato; and what it pays for is seen in the bairro. The rates are tunables (Rule 14) and are set with Phase 8 and Phase 9; the faucets stay small, so that the tax can.

**D-4.26 A neighbour asks of a family of little money only what it can put by (delegated by the founder, 2026-11-21; F-275).** The errand "guarda" asks someone whose card is of the tier *aperto* for the least of its amounts (500 Mk); everyone else for any of them. Decided from the card, so that a player's errands are the same all day whatever they hold.

**D-4.24 The tunables are live, version after version (2026-11-20, Task 4.6).** `base.json` is the first version; each change made in the Estúdio (Afinar, the `economy` role) is the next, whole, in `tunables_versions`, with who, when and why, and an audit entry; none is deleted. The zone and the API play by the newest version that reads as valid (a tunable the code gained since is the file's number), looking again every 15 seconds, so a change is in play within half a minute with no restart; a file shipped with a higher version wins. `channels.cap` is read at a zone's start. A change is previewed first: which numbers change, and what the validator refuses.

**D-4.23 Biscatos stand by the taxi stops (the founder, 2026-11-20).** The lavadores beside the Mutamba paragem are right where they are; in every other bairro the lavadores and the roboteiros wait by the paragens of the candongueiros, as they do in Luanda. `WORLD_ATLAS.md` §5.1, step 7.

**D-4.21 The ride's band keeps out of the view (the founder, 2026-11-20).** While riding, a chip under the wallet says where the van is and where it goes; the full route band comes down from the top only after boarding, coming into a paragem and standing at one, and a thumb slides it down or up (UX_UI_SPEC.md §3.3). The band, its styles and the chip are fetched when a van is near, not on the way in.

**D-4.20 The hospital's bill never makes a debt (2026-11-20, Task 4.4).** Energia at zero is a nuisance, never a punishment: the zone takes the body to the hospital and sets Energia and Fome back up; the API asks the bill once a stay, on the zone's note only (the phone cannot ask it twice or for someone else), 1 500 Mk (`needs.hospitalBill`), from the Carteira first and the Banco after, and only what there is. A player with nothing pays nothing and is told so. Nothing carried is taken. The Makuta goes to the ledger's hospital sink, so it leaves the economy as the cantina's does.

**Done on the way, at the founder's word (2026-11-18):** the street's traffic is the zone's to decide, so two players see the same van (F-190); vehicles that began inside each other are parted (F-180); two who arrive together stand side by side (F-189).

## Carried into this phase from the founder's rulings of 2026-11-17

- The family gives a house, empty, of a kind that depends on the family (D-3.13): the family table gains the kind of house in this phase's tunables, so that Phase 5 has it.
- Nobody arrives knowing anybody: the first biscato and the cantina are where a player meets their bairro. A sale between two players in person (4.1) should count as meeting.
- Whoever sleeps in a quick place can be robbed: the Carteira and Banco split (D-4.3) is what makes that mean something.

## What "done" means for this phase

From the roadmap: the ledger sums to zero after a fuzz of 10 000 transfers; a replayed purchase charges once; no Makuta literal in code; a new player's first hour written out with what it earns and costs and checked against a played session.
