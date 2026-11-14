# Findings

What building the game turns up along the way: bugs, gaps, and ideas that would make it better. The founder asked for this on 2026-11-14: nothing found while working on a task is to be lost.

**How it is kept**

- Something found during a task is fixed in that task when it can be, with a test, and recorded here either way.
- What cannot be fixed yet stays under **Open** with the task that will close it, and the same note goes on that task in `ROADMAP.md`.
- An idea that would make the game better goes under **Ideas**. The founder decides which become tasks; one that does moves to `ROADMAP.md` and is struck here.
- Entries are numbered `F-n` and never renumbered. An entry is closed by moving it to **Fixed** with the date, not by deleting it.

---

## Open

| # | Found in | What | Closes in |
|---|---|---|---|
| F-9 | 0.6 | **`pack build` cannot process art yet.** The Blender export, Meshopt and KTX2 compression, chunking and LODs are not built. Blender 5.3 and KTX-Software 4.4.2 were installed on 2026-11-14 with the founder's permission, so the only thing missing now is art to run them on. | 1.5, with the first real chunk |
| F-11 | 0.2 | **A person pressed straight into a wall drawn diagonally on the walk grid stops instead of sliding.** Obstacles (posts, kiosks, vans) slide properly; grid walls slide only along the axes. It will be felt along the curve of the Marginal. | 1.3, when the controller is first walked on a real phone |
| F-12 | 0.2 | **A van that stops on top of a standing person leaves them inside it** until they move. Pedestrians are meant to be pushed aside (6.4). | 6.4 |
| F-13 | 0.2 | **Obstacles are checked one by one.** Fine for a few hundred; a dense district needs a spatial index. | 3.7, if the swarm's tick time says so |
| F-14 | 0.3 | **Some starter tunables are still placeholders.** The founder set the scale on 2026-11-14 (a Makuta buys what a kwanza buys; 25.000 Mk to start; a corrida is 200 Mk). Still guesses, scaled to match: the transfer and stake caps, the assalto ceiling (20.000 Mk), the house cut, the needs rates, the heat weights. | 4.6, by the founder and the economy designer |
| F-15 | 0.3 | **A reversal fails when the Makuta has already been spent.** That is correct for the ledger, but support has no way yet to recover it or to write it off. Needs a decision: a debt on the player, or a loss booked to a named system account. | 4.1 |
| F-16 | 0.4 | **`Input` carries the stick only.** The verbs of `ActionIntent` (board, buy, enter and the rest) have no messages yet; each gets its own when its task builds it. | 4.3, 6.1 and later |
| F-17 | 0.5 | **`player_sessions` is ours for now.** Better Auth brings its own session tables; the two must be reconciled, not run side by side. | 2.1 |
| F-18 | 0.6 | **Three numbers in `pack check` are placeholders:** what each quality tier downloads, and the two view distances behind the triangle and draw-call estimates. | 1.1, by measurement |
| F-19 | 0.6 | **`docs/legal/BRAND_TERMS.txt` needs the founder's eye.** It was researched from published sources on 2026-11-14 and now holds about 170 terms. Brands whose names are everyday words, dates or places cannot be listed safely and are named at the end of the file for reviewers; three terms on the list (Cuca, Kero, Eka) are also words and may refuse honest copy. | Founder, before 1.5 |
| F-20 | 0.8 | **The catalog and the glossary are first drafts by a non-Luandan.** The founder answered the three marked questions on 2026-11-14 ("1.500 Mk", the kupapata, spelling before the 1990 agreement). One new question is marked: what people call the ordinary motorbike taxi. The full review is still to do. | Founder (Waiting on the founder, item 6) |
| F-21 | 0.10 | **The chat filter's lists are a start, not a filter.** The Portuguese list has a first set of words (2026-11-14); the Angolan list is empty, with candidates switched off, because a wrong entry would silence friendly talk. What the game does with a match is not decided. | 3.6 |
| F-22 | 0.10 | **Retention periods in `docs/legal/RETENTION.md` are proposals,** not legal advice. | Counsel, before 4B |

| F-23 | 0.7 | **The spec's examples still show the old scale** ("Apanhar · 150 Mk" and others). A note at the top of the typography rules says to read 200; the examples themselves are corrected when each screen is built. | With each screen, from 1.4 |
| F-24 | 0.6 | **Blender moved to version 5** since the roadmap was written, and the export scripts of Task 1.5 must be written against its current scripting interface, read from its documentation, not from memory. | 1.5 |

## Fixed

| # | Found in | What was wrong | What was done | Date |
|---|---|---|---|---|
| F-1 | 0.2 | A long vehicle could not climb a hill: the whole body was judged against the height under its middle, so a slope a car's length long looked like a wall. Found by the test that drives up a ramp. | Each axle is judged against the ground under itself. | 2026-11-14 |
| F-2 | 0.2 | Integer helpers could return negative zero, which compares equal to zero but is not the same value, a trap for tests and for hashes. | The helpers return a true zero; a motorizada told to reverse is tested to hold exactly 0. | 2026-11-14 |
| F-3 | 0.2 | The busiest determinism test could time out on a loaded machine while coverage was being measured, failing the gate for no real reason. | Boxes far from a body are now ruled out before any trigonometry (four times faster), and the test has room. | 2026-11-14 |
| F-4 | 0.3 | Reversing a transfer twice was answered "insufficient funds", which hid the real reason. | A reversal is checked against its original first; the answer is "already reversed". | 2026-11-14 |
| F-5 | 0.4 | A signed number at the very edge of the exact range could not be written. | The limit is one bit lower and tested at the edge. | 2026-11-14 |
| F-6 | 0.8 | The browser's own rule for `pt-AO` writes "0 minuto", and its number format changes between browser versions. | Plurals and numbers are written by hand: only exactly one is singular, and every phone shows the same. | 2026-11-14 |
| F-7 | 0.8 | The message reader kept a trailing space on option names, so no plural was ever found. Caught by the first test run. | Fixed; every message in the catalog is parsed and filled in by a test. | 2026-11-14 |
| F-8 | 0.10 | The chat filter could be dodged by sticking a digit or a symbol on the end of a word ("…1", "…!!!"). | Text is read twice, once with such ends removed. Tested. | 2026-11-14 |
| F-10 | 0.5 | Another program on the development machine already listens on port 6379, the port the game's Redis used, so anything connecting to `localhost:6379` could reach the wrong Redis. | The game's Redis is published on port 6380 (`infra/docker-compose.yml`, `.env.example`). CI keeps 6379 inside its own runner. | 2026-11-14 |

## Ideas

Not decided. Each says where it came from and what it would cost.

| # | From | Idea | Cost |
|---|---|---|---|
| I-1 | 0.2 | **"Chega em 2 minutos" at every paragem.** The route code already answers when the next van arrives, for free and without network traffic. Show it on the paragem's sign and in the Mapa app; at night say plainly that the vans have stopped and offer a kupapata. | Small, in 1.6 or 6.1. The catalog line exists (`route.nextVan`). |
| I-2 | 0.2 | **Catch drift before a player sees it.** The simulation can reduce its whole state to one number. If the client sends that number now and then, the zone can tell when a phone has drifted from the truth and correct it quietly, and we learn which phones drift. | Small, in 3.3. |
| I-3 | 0.2 | **The last van home.** Vans finish the lap they started when service closes. That moment can be felt: the cobrador calls the last corrida of the day, and missing it means a dearer ride home in the dark. A reason to watch the clock that comes from the city itself. | Small, in 6.1. |
| I-4 | 0.4 | **Privacy you can see.** Chat too far away to read is never sent to the phone at all. That is a promise worth making in the privacy page in plain words: nobody can read you from across the square, not even with a modified client. | None in code; one line for counsel in the privacy page (4B). |
| I-5 | 0.3 | **The economy on one line for the founder.** The health sums (paid out, taken in, supply growth) fit in one sentence a day. Send it to the founder's phone during the alpha, before the Estúdio dashboard exists. | Small, in 4B.4. |
| I-6 | 0.6 | **Greybox a district as text.** A walk grid can now be written by hand as rows of characters. With boxes for buildings, the whole of L1 could be walked on a phone, and its scale corrected with Luandans, before any modelling starts. | Medium, at the start of 1.5; needs the renderer (1.1). |
| I-7 | Founder, 2026-11-14 | **Drink changes how you move and what you see.** Now Task 10.16 and D-0.37; the part that decides the wandering is built and tested in `packages/sim`. Open for the founder: the four words for the states, and that players of 15 to 17 are not served. | Decided: a task. |
| I-8 | 0.6 research | **A market each known for one thing.** Luanda's markets each have a speciality (phone repair at the Congolenses, fish at Mabunda, wholesale produce at the 30, crafts at Benfica). Giving each market district the one thing it sells best and cheapest gives players a reason to cross the city, and gives traders a route to run. The São Paulo market, with stalls inside and sellers outside, is the model for the first. | Design only until a market district is scheduled; notes in `LUANDA_REFERENCE.md` §6b. |
| I-9 | 0.6 research | **The kupapata as a delivery job.** It is a cargo three-wheeler: a player who owns one can be hired by other players to carry what does not fit in a mochila (a geleira, sacks for a stall, stock for a cantina). Players paying players for real work, through the ledger. | Small, inside 6.6; noted on that task. |

