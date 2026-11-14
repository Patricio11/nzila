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
| F-11 | 0.2 | **A person pressed straight into a wall drawn diagonally on the walk grid stops instead of sliding.** Obstacles (posts, kiosks, vans) slide properly; grid walls slide only along the axes. It will be felt along the curve of the Marginal. | 1.3, when the controller is first walked on a real phone |
| F-12 | 0.2 | **A van that stops on top of a standing person leaves them inside it** until they move. Pedestrians are meant to be pushed aside (6.4). | 6.4 |
| F-13 | 0.2 | **Obstacles are checked one by one.** Fine for a few hundred; a dense district needs a spatial index. | 3.7, if the swarm's tick time says so |
| F-14 | 0.3 | **Some starter tunables are still placeholders.** The founder set the scale on 2026-11-14 (a Makuta buys what a kwanza buys; 25.000 Mk to start; a corrida is 200 Mk). Still guesses, scaled to match: the transfer and stake caps, the assalto ceiling (20.000 Mk), the house cut, the needs rates, the heat weights. | 4.6, by the founder and the economy designer |
| F-15 | 0.3 | **A reversal fails when the Makuta has already been spent.** That is correct for the ledger, but support has no way yet to recover it or to write it off. Needs a decision: a debt on the player, or a loss booked to a named system account. | 4.1 |
| F-16 | 0.4 | **`Input` carries the stick only.** The verbs of `ActionIntent` (board, buy, enter and the rest) have no messages yet; each gets its own when its task builds it. | 4.3, 6.1 and later |
| F-17 | 0.5 | **`player_sessions` is ours for now.** Better Auth brings its own session tables; the two must be reconciled, not run side by side. | 2.1 |
| F-19 | 0.6 | **`docs/legal/BRAND_TERMS.txt` needs the founder's eye.** It was researched from published sources on 2026-11-14 and now holds about 170 terms. Brands whose names are everyday words, dates or places cannot be listed safely and are named at the end of the file for reviewers; three terms on the list (Cuca, Kero, Eka) are also words and may refuse honest copy. | Founder, before 1.5 |
| F-20 | 0.8 | **The catalog and the glossary are first drafts by a non-Luandan.** The founder answered the three marked questions on 2026-11-14 ("1.500 Mk", the kupapata, spelling before the 1990 agreement). One new question is marked: what people call the ordinary motorbike taxi. The full review is still to do. | Founder (Waiting on the founder, item 6) |
| F-21 | 0.10 | **The chat filter's lists are a start, not a filter.** The Portuguese list has a first set of words (2026-11-14); the Angolan list is empty, with candidates switched off, because a wrong entry would silence friendly talk. What the game does with a match is not decided. | 3.6 |
| F-22 | 0.10 | **Retention periods in `docs/legal/RETENTION.md` are proposals,** not legal advice. | Counsel, before 4B |

| F-23 | 0.7 | **The spec's examples still show the old scale** ("Apanhar · 150 Mk" and others). A note at the top of the typography rules says to read 200; the examples themselves are corrected when each screen is built. | With each screen, from 1.4 |
| F-31 | 0.9 | **Reference pictures exist for Windows only.** On CI, which runs Linux, the look of the styleguide is not compared (the test says so). | When the repository first runs on CI: make the Linux pictures there, look at each, commit them |
| F-32 | 0.9 | **Nothing in the harness is an iPhone or a cheap phone.** The profiles catch large regressions; they do not prove the budgets. The numbers that count come from the bench on real units. | Founder: the two reference phones (D-0.5); one real iPhone in 1.9 |
| F-34 | 0.6 | **Impostors are not made.** The manifest has a place for a chunk's far-away picture, and the pack check counts a distant chunk as one flat card, but nothing renders that picture yet: how the renderer draws distance (one card, crossed cards, or only silhouettes in haze) decides what to render. | 1.1 decides; 1.5 builds |
| F-35 | 0.6 | **A walk grid cannot be drawn in Blender yet.** Grids are written by hand as rows of characters, which is enough for a greybox. Turning a walkable mesh into a grid is needed before a district with real slopes. | 1.5 |
| F-36 | 0.6 | **CI does not check the asset pipeline:** Blender and KTX-Software are not installed there, and the test skips itself with a printed warning. | When the repository first runs on CI: install both in the workflow |
| F-39 | 1.1 | **Edges are stair-stepped at Poupança.** The picture is drawn 540 pixels tall with no smoothing and stretched to the screen, which shows on every roofline. Smoothing costs frames on a cheap phone, so it was left out on purpose; whether the look survives that is for the real phones and the look test to say. A cheap smoothing pass is the remedy if not. | 1.9, on the reference phones |
| F-40 | 1.1 | **The test scene is boxes and its colours are a first guess.** The light is what was built; the ground under it at golden hour may be too orange. The founder judges the light on `/cena`, and the first real district replaces the scene. | Founder, on `/cena`; 1.5 |
| F-41 | 1.1 | **The iPhone profile cannot tell a real graphics card from a pretend one:** Playwright's WebKit always calls itself "Apple GPU". Its frame rate is therefore never judged. | Stays so; a real iPhone in 1.9 |
| F-44 | 1.2 | **Nothing but eyes checks that a reduced model looks right.** The lowest tier draws only the reduced model, and a tool that reduces triangles can wreck a shape while every number stays inside its budget (F-46). The rule now protects light meshes, but a real landmark reduced badly would pass every test. | 1.5: each landmark's reduced model is looked at in `/cena` on the lowest tier before its pack is published; a line for the pack checklist |
| F-45 | 1.2 | **Textured models cannot be shown yet.** Chunks coloured from the palette need no texture. A model with a painted texture of its own (a landmark's detail, on Normal and Alta) arrives as KTX2, and the client has no decoder for it loaded: it costs about 100 KB, so it is fetched only by the tiers that use it. | 1.5, with the first painted landmark |

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
| F-25 | 0.7 | Engine code named a place: the pack schema's error messages gave the first district's id as their example (Rule 9). Caught by the new house-rules test on its first run. | The messages describe the shape of an id without naming one. | 2026-11-14 |
| F-26 | 0.7 | The size budget did not count the font, which is the largest single file a first visit downloads. | Fonts count toward the shell budget at their full weight. The shell is 52 KB of its 300 KB. | 2026-11-14 |
| F-27 | 0.7 | Seen in the browser screenshots, not by any test: the front door sat at the top of the screen instead of the middle; titles on paper inherited a pale colour from the page around them; long stop names broke in the middle of a word; the loading placeholder had no width. | All four fixed and looked at again. | 2026-11-14 |
| F-30 | 0.7 | The first components were correct but plain: flat buttons, a route band that was a list of dots, a banner that was a line of text. The founder: "it must all feel like a game". | Redrawn the same day: depth and press on buttons, the breathing gold button, the van driving along the route band, the road mark in place of any spinner, the receipt that prints, the BI that is stamped. Rules in `UX_UI_SPEC.md` §1.3b, D-0.39. | 2026-11-14 |
| F-28 | 0.7 | Nothing compared how a screen looks with how it looked before. | The browser tests keep a reference picture of `/styleguide` for the phone and the iPhone profile and fail when it changes by more than one pixel in a hundred. | 2026-11-14 |
| F-29 | 0.7 | The glyphs and components had not been seen by the founder (D-0.23). | Seen and approved on 2026-11-14 after the redraw of F-30 ("I like it, you did well"). | 2026-11-14 |
| F-33 | 0.9 | The bench first judged a run by its worst one per cent of frames, which in a short run is two or three frames and measured start-up hitches, not the scene. | The pass mark is now what "sustained" means: 95 frames in 100 at 30 a second or better, after half a second of warm-up. The worst one per cent is still shown. | 2026-11-14 |
| F-9 | 0.6 | `pack build` could not process art: no Blender export, no compression, no chunking, no LODs. | Built once Blender and KTX-Software were installed: `pnpm pack:export` and the compression step in `pack build`, tested for real from a Blender scene to a pack that passes the check. | 2026-11-14 |
| F-24 | 0.6 | Blender had moved to version 5 since the roadmap was written. | The export script was written against the installed 5.3, with the exporter's options read from the program itself and not from memory. | 2026-11-14 |
| F-37 | 0.6 | The texture compressor refused the pictures Blender writes, because they carry no statement of their colour space and it will not guess. | The build tells it they are sRGB, and passes on the tool's own message when it fails. | 2026-11-14 |
| F-38 | 0.9 | The bench test failed once in a full run of the gate and passed alone: the machine was still busy from the tests before it, and a frame rate measured then is the machine's, not the page's. | The bench is judged on the best of three runs. | 2026-11-14 |
| F-42 | 1.1 | The moon's direction was not a unit vector, and one long frame was enough to make the picture shrink. Both caught by the first run of the new tests. | The direction is normalised; no one frame counts for more than two, and it takes several slow ones in a row to move the picture. | 2026-11-14 |
| F-43 | 1.1 | At golden hour the ground looked muddy: with the sun low, flat ground gets little of it directly. Seen in the first screenshots. | The light from the sky at golden hour is warmer and stronger, as the glow of the whole western sky is. | 2026-11-14 |
| F-18 | 0.6 | What each quality tier downloads, and how far it sees, were placeholders in the pack tools. | One table, `STREAM` in `packages/world`: the lowest tier sees 90 m and only ever the reduced model; Normal 140 m with full detail inside 60 m; Alta 220 m and 100 m. The renderer's haze, the streamer and `pack check` all read it. | 2026-11-14 |
| F-46 | 1.2 | The reduced models were wrecked: boxes "simplified" to a third of their twelve triangles became spikes. Every budget passed; only the screenshot of the lowest tier showed it. | A mesh of 48 triangles or fewer is left whole; larger ones are reduced; small detail marked `lod0_only` is left out of the reduced model. | 2026-11-14 |
| F-47 | 1.2 | Everything in a streamed district was one colour. Two causes: the build threw away the coordinates that point each face at its palette square, as unused; and the palette picture was laid out from the bottom while a model counts from the top. | The coordinates are kept, and the palette counts from the top everywhere, tested. | 2026-11-14 |
| F-48 | 1.2 | A walk grid was only small if the server compressed it: the meter read 769 KB where the pack claimed 340 KB. | A pack carries its walk grids already compressed (`.walkz`), thirty times smaller, and the same bytes on every machine. | 2026-11-14 |
| F-49 | 1.2 | The lowest tier would have downloaded full-detail models when the player stood inside a chunk. Caught by the first test of the streaming rules. | A tier whose near distance is zero never shows full detail. | 2026-11-14 |
| F-50 | 1.2 | A rebuilt development pack was not served: the build reused a cached result, because the generated folder is ignored by git and so was not counted as an input. | The build watches `public/`. | 2026-11-14 |

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

