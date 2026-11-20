# Phase 5 plan: Casa

*Goal (roadmap): a place of your own, that looks like you, where friends can come.*

Opened 2026-11-20, when Phase 4 completed (`docs/completed/PHASE_4_COMPLETE.md`). **It is built after** the things to do together (6.2's first line, 10.13's first two), **the second bairro, Zango** (11.1, 11.2) and the alpha (4B): the founder's order after Phase 4 (D-4.8 to D-4.10). Zango comes first for this phase too: **the family gives the house in the family's bairro** (D-3.13), and most families' bairros are not the Marginal.

## The recheck: what each task depends on

| Task | Depends on | State |
|---|---|---|
| 5.1 Property model | 4.1 | 4.1 is met. Not begun; it needs: interiors (a new kind of pack content), doors that open on their hinges, houses on plots with a quintal, three ways to be inside (D-0.41), the family's house (D-3.13), living where one was born (D-3.12) |
| 5.2 Renting | 5.1 | The ledger and the worker's jobs exist (the nightly audit is the first job); rent is the first weekly one |
| 5.3 Furnishing | 4.2, 5.1 | Things and the Mochila exist (4.2); furniture is bought, carried home and placed anywhere (the founder, 2026-11-18) |
| 5.4 Doors, visits and housemates | 5.1, 3.5 | 3.5 (talk and safety) is built |
| 5.5 Storage and what is on display | 5.3 | The input to Phase 7's burglary caps |
| 5.7 Appliances that do something | 4.3, 5.3 | A geleira home needs a kupapata (6.2) |
| 5.8 Owning a home and letting it | 5.2, 5.4, 5.7 | |
| 5.9 Cães e gatos | 5.1, 4.2, 1.6 | The six kinds are named (Waiting item 19, answered) |
| 5.10 O quintal e a horta | 5.1, 5.3, 4.2 | |
| 5.11 O terreno e a casa que se escolhe | 5.1, 5.8, 4.1 | D-0.55 |
| 5.6 Wiring, verification, doc convention | 5.1 to 5.5, 5.7, 5.8 | |

## Open questions

- **Q1 The house each family gives**, by how well off it is: a room, a casa de chapa, a casa de bloco, a vivenda (D-3.13 asks for it in tunables, beside the families). *Proposed: aperto a room or a casa de chapa, remediado a casa de bloco, bem a bigger one, ouro a vivenda. The founder's.*
- **Q2 What rent costs.** `docs/ECONOMY.md` §6: an hour of play earns about 2 400 Mk beyond the card and costs 500; money piles up until the sinks that matter exist, and rent is the first. *Proposed: a week's rent for a room about three hours of biscatos (some 7 000 Mk), a T1 twice that; in a rules file, with a grace period. The founder's.*
- **Q3 The inside of an ordinary house** (Waiting item 18: still wanted): photographs of a sala, a quarto, a cozinha and a quintal, so that the interiors are Angolan homes and not a catalogue's.
- **Q4 How much an interior may weigh**, for the first view of it on a slow network. *Proposed: 300 KB at Poupança, fetched at the door, kept once fetched.*
- **Q5 Who may come in.** A visit is asked at the door and let in by someone inside; a key is given by the owner, and taken back. *Recommendation: as the roadmap; the founder's to confirm whether a kamba may come in when nobody is home.*

## Decisions

**D-5.1 An interior is its own small place, entered through the door (delegated).** A home's inside is built from a layout template (quarto, T1, T2, vivenda) as a small pack of its own, entered without a loading screen when it is fetched (a short fade otherwise, UX_UI_SPEC.md §3.5); the street goes on outside its window. Who is inside is the zone's, as the street is. *Recommendation: yes.*

**D-5.2 The family's house cannot be lost (delegated, from D-3.13).** It costs nothing and is never taken for rent or debt; a rented home can be lost, and what was in it is stored, never deleted. *Recommendation: yes.*

**D-5.3 Rent is a weekly job of the worker, through the ledger (delegated).** Notices before it is due (Mensagens), a grace period, and an eviction that stores belongings. The `rent` sink. *Recommendation: yes.*

**D-5.4 Furniture is a thing like any other (delegated).** Bought, carried (or brought by a kupapata), held in the home's own place in `items`, and placed on a grid; what is placed is "à vista", what is stored is not (Phase 7's caps read it). *Recommendation: yes.*

## What "done" means for this phase

From the roadmap: a player has a home that looks like them, friends visit, rent is paid or the home is lost and nothing in it is; the family's house is where they were born. Measured: an interior's weight and its first view on the slow profile, and a full home's frame time on the reference phone.
