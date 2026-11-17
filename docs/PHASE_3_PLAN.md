# Phase 3 plan: Multiplayer core

**Opened 2026-11-16**, with Phase 2 complete (`docs/completed/PHASE_2_COMPLETE.md`). Phase 1's two founder's checks are still open; nothing goes public before them.

Goal, from the roadmap: other people are in the street, they move smoothly on a bad network, you can talk to them safely, and a load test proves a channel holds 80.

## Recheck of each task's dependencies

| Task | Depends on | State |
|---|---|---|
| 3.1 The zone server | 0.2, 0.4, 2.5 | Ready. The simulation and the protocol exist and are tested in three engines. 2.5 left the last position to this task, on purpose. `apps/zone` is an empty package. |
| 3.2 Matchmaker and channels | 3.1 | After 3.1. Redis is running in the dev services and nothing uses it yet. |
| 3.3 Client netcode | 0.4, 1.7, 3.1 | After 3.1. `WorldProvider` is the seam (S-1); `LocalWorld` answers it today. |
| 3.4 Weak network and reconnect | 3.2, 3.3 | After them. |
| 3.5 Chat and emotes | 2.3, 3.3 | After 3.3. The BI card and the speech balloon exist. |
| 3.6 Player safety v1 | 0.10, 3.5 | After 3.5. The filter's machinery exists; **its Angolan word list is empty** (F-21) and names already depend on it. |
| 3.7 The bot swarm | 3.1 | After 3.1; needed to say anything true about 80 players. |
| 3.8 Estúdio v1 | 2.4, 3.6 | After 3.6. `staff` passes nobody today. |

Order of work: 3.1, 3.3 (a second browser sees the first), 3.2, 3.7 (numbers before more features), 3.4, 3.5, 3.6, 3.8.

## What Phase 2 and its days hand to this phase

- **The street now has rules that live on the phone.** Traffic gives way and vehicles never touch (D-0.53), and people of the street have bodies, all decided by `LocalWorld`. Two phones would each decide for themselves and see a van in two places. **In this phase the zone decides** who waits for whom, by the same rule (`wayAhead`, `touching`), and the phones are told. Until 3.1 does it, this is a known lie between two players.
- **Solidity is in the pack** (the walk grid), so the zone and every phone agree on it without a byte sent.
- **Rate limits must leave the API's memory** when a second process exists (F-111).
- **The player's own pano** is a setting on the phone; it should travel with the player's state.

## Open questions

**Q1. Colyseus.** The roadmap names it. Its current version, its transport on mobile networks, and how it fits a binary protocol we already wrote must be read before building on it.
*Recommendation:* read the docs first, as the roadmap asks of every library; build the room on our own protocol (`packages/protocol`) and use Colyseus for rooms, seats and presence only. If it insists on its own schema for state, write the zone on a plain WebSocket server: the simulation, the snapshots and the area of interest are ours either way.

**Q2. Where the zone runs, and how far from Luanda.** Latency is the whole of how this phase feels. There is no cloud region in Angola for most providers; the nearest are in South Africa and Europe.
*Recommendation:* measure before choosing: a small probe page players in Luanda open on Unitel and Africell, timing round trips to two or three regions. This is the founder's to ask people to run; the code is cheap.

**Q3. What a player sees of someone 60 m away.** The roadmap says the nearest 30 in full and the rest as low-rate dots.
*Recommendation:* keep it; draw the far ones with the light body Phase 1 made for the crowd.

**Q4. Traffic and the people of the street: the zone's, or the clock's?** Today every phone derives them from the clock, which costs no bytes; giving way made them depend on where players stand.
*Recommendation:* the zone owns only the lag each vehicle has fallen behind its timetable (a few bytes a vehicle, sent when it changes); positions stay derived from the clock. The people of the street stay on the clock in this phase and gain the same treatment when they must step round players.

**Q5. Chat safety before chat.** The Angolan word list is empty and a wrong entry would silence friendly talk.
*Recommendation:* chat does not open to the public until the founder and a second Luandan have written and read that list; 3.5 is built and tested with the Portuguese list and a clear flag.

**Q6. Names seen by others.** Answered by the founder on 2026-11-16: see D-3.5.

## Decisions

**D-3.1 The zone is the only thing that says where anyone is (delegated, 2026-11-16).** The client predicts its own avatar with the shared simulation and is corrected; it never tells the zone a position, only inputs. *Recommendation: yes; it is Rule 1.*

**D-3.2 The rules written for the phone's own street move to the zone unchanged (delegated).** `wayAhead`, `touching`, the bodies of benches and people: the same functions, in a package both can import, run by the zone. No second version of a rule. *Recommendation: yes.*

**D-3.3 `LocalWorld` stays, for development, the bench and playing with no network (delegated).** A build for players cannot reach it by accident: a test fails the production build if it can. *Recommendation: yes, as the roadmap says.*

**D-3.4 Numbers before features (delegated).** The bot swarm (3.7) is built as soon as two browsers can see each other, and every later task is measured with 80 in a channel. *Recommendation: yes.*

**D-3.5 A name shows over whoever stands still, when you are near (founder, 2026-11-16).** "I was thinking to show the name when they stop, the NPC as well as the players: if they stop then the name shows, as if you get close." Someone walking has no label; someone who stops, or sits, is named to whoever is within about fourteen metres, the nearest six at once, so that a street is never a wall of labels and whoever can be talked to says who they are. Built on 2026-11-16 for the people of the street (`render/names.ts`): each has a name of their own, the same every day, and what they do under it when that is worth saying (zungueira, polícia, cobrador). **Players wear the same tags by the same rule** when there are other players (3.3, 3.5), with their own name; the BI opens on a tap (3.5).

**D-3.7 A line with a listed word is said to nobody (delegated, 2026-11-17; confirmed by the founder the same day).** The speaker alone is told, kindly, and may say it another way; the line is kept for moderation, marked as not said. Hiding only the word leaves a sentence whose meaning everyone still reads; letting it through and logging it leaves the harm done. *Recommendation: as built.*

**D-3.8 Talk is open (the founder, 2026-11-17).** It was held shut until the word lists had been written and read. The founder read the Portuguese list, found it good, and asked for more words and for the Angolan list to be written here: both were done that day (`packages/i18n/filter/`, each with what was left out on purpose and why). So a zone opens talk unless it is started with `CHAT=off`, which stays as the switch to throw if talk must stop while the game goes on: a zone with it off tells nobody talk is open, passes nothing on and keeps nothing. The lists go on being corrected from the first reports of real players.

**D-3.9 Everyone talks to everyone (the founder, 2026-11-17).** Nothing limits talk by age band: a player of 15 to 17 and an adult speak in the street like anyone else. What keeps them safe is what is on every sheet (block, mute, report), the filter, no addresses to anywhere outside the game, and every line kept thirty days for moderation. Counsel has not read this yet (it goes with the other questions for counsel).

**D-3.10 With no zone the game still opens, and goes on looking (the founder, 2026-11-17: "do what is best for the game").** A player who cannot reach a zone walks their own street rather than look at a closed door: the megabytes were paid and the street is theirs (Rule 2). They are told nothing, and the phone looks again every half minute at the most for as long as they play, so that they are among people as soon as there are people to be among. This settles D-3.3: `LocalWorld` is reachable in a build for players, on purpose, and the roadmap's test that would forbid it is not written.

**D-3.12 One street for everyone who is in it; nobody is invited anywhere (the founder, 2026-11-17).** In his words: players who are in the same area, or going to it, all interact there; there is no invite. You live where you were born, where your house is; you can take a taxi, travel, sleep in a hotel or a hospedaria and spend money doing it; and you can rent a house in another area. What this means for what is built:
- **A channel is not a place and never something a player chooses.** It is only what happens when more people are in one bairro at the same moment than a cheap phone can be among: a second copy of the same street opens (at 60; a copy holds 80). Below that, everyone in a bairro is in the one street, with no step taken by anyone. Nothing that belongs to the world may differ between copies: a house, a shop, a price, the hour are the same in all of them (the roadmap already says so for homes and lots).
- **Where a player is, is decided by the world and not by a link:** their home, and from there the road (on foot, a candongueiro, a kupapata, a táxi, a journey). The matchmaker's invited channel (`channel` on `POST /v1/play/join`, `&canal=N`) stays as a tool for development and tests only and is not offered to players.
- **Left open, the founder's to say:** when a bairro is so full that it has two copies, whether two people who know each other are put in the same one without asking (the roadmap's "friends-first placement", 10.1) and whether one can go to the other ("Ir ter com"). Recommendation: yes to both, automatically, with no invitation shown: otherwise two friends standing at the same paragem cannot see each other.

**D-3.11 The Estúdio's staff sign in with a password alone for now (the founder, 2026-11-17).** No second factor yet. It is added before anyone outside the founder's own hands has an account there.

**D-3.6, as revised the same day: no room library; a plain WebSocket and our own protocol (delegated, 2026-11-16; answers Q1).** The zone was first built on Colyseus 0.18 (below), and worked. Then the budget was weighed: **its client is 52 KB compressed on the phone, of a budget of 300 KB for all the game's code**, for things our own messages already say (`Join`, `JoinAccepted`, `JoinRefused` were written in Phase 0 for exactly a plain socket). Megabytes are money (Rule 2), so the library went, on both ends: `apps/zone/src/server.ts` is a WebSocket server of about two hundred lines (`ws`), the phone uses the browser's own `WebSocket` and downloads nothing for it. What the library would have given later is now ours to write, and is small: holding a seat for a dropped line (3.4) is the "same player on a new line stands where the old one stood" rule that already exists; many processes (3.2) is a registry in Redis. The roadmap's word "Colyseus" in Task 3.1 and in the stack notes is superseded by this.

*What was decided first, kept for the record:* **Colyseus 0.18, for rooms and seats; the bytes are ours.** Its current documentation was read on 2026-11-16 (docs.colyseus.io; server `colyseus` 0.18, client `@colyseus/sdk` 0.18; MIT). What matters to us is all there: a room may send and receive raw bytes with no schema state of its own (`onMessageBytes`, `client.sendBytes`, `broadcastBytes`; `room.sendBytes` on the client), so `packages/protocol` stays the only wire format; a seat is reserved from our own API (`matchMaker.joinOrCreate`, `reserveSeatFor`) and consumed by the client (`consumeSeatReservation`), which is Task 3.2's matchmaker; a join is checked with a token (`static onAuth(token, options, context)`), which is our session token; a dropped client's seat is held (`allowReconnection(client, seconds)`), which is 3.4; several processes need `@colyseus/redis-presence` and `@colyseus/redis-driver`. The default transport is `ws`; uWebSockets is recommended for production and is looked at with the load test (3.7). WebTransport is experimental and not used. Not found in the docs and to be checked in code: the least version of Node it supports, and the shape in which the client receives raw bytes.

## Built so far

**3.1, 2026-11-16.** `apps/zone`: a channel that is the only word on where anyone is (`channel.ts`, no network in it, thirteen tests), a room round it that knows lines and the database (`room.ts`), a WebSocket server (`server.ts`), the district read from the pack (`district.ts`), and a process that listens (`pnpm dev:zone`, port 2567). Nine tests run a real zone on a real database with clients on real sockets: who is let in and who is refused, two players seeing each other walk, a place kept and come back to, a second phone putting the first out, a client that floods or sends nonsense put out. People are solid to each other in the shared simulation (`solidPeople`), so the phone will predict the same thing the zone decides. Left open, with their reasons, in F-152 and F-153: the far ones as dots, Redis, the street's own rules moving to the zone, and what to do about a doorway with people standing in it.

Built first on a room library and rebuilt the same day without one (D-3.6, as revised): the tests did not have to change what they ask, only how they connect. `GET /health` on the zone says what is running and how long its steps take.

**3.3, 2026-11-16.** The phone's half. `net/link.ts` opens the line (the browser's own WebSocket: nothing is downloaded for it); `net/predict.ts` keeps the player's own body ahead of the zone and `net/others.ts` draws everyone else a moment behind it; `net/session.ts` is what the walking page asks; `render/players.ts` gives the others bodies in their own looks. The zone says who each body is once (`Who`: the name on the BI and the look), runs both the rehearsal town and Marginal e Baixa in one process, and knows the benches (`packages/world/src/solids.ts`, read by the phone and the zone alike: the first of the street's rules to move, D-3.2). The browser tests now start a real zone beside the real API.

Two things learnt the hard way, both now held by tests: a zone must never walk a step it was not sent a frame for (F-158), and "where you arrive" must be said once (F-159). What is left is in F-157: the largest is that vans and the people of the street are still each phone's own, so a rider steps out of the channel and a person of the street stops a player dead.

**3.7, 2026-11-16.** `tools/swarm`: headless players, their accounts made and taken away, and the budgets a run is held to. The first numbers (the development machine, Marginal e Baixa, 80 in one channel): **1,15 KB a second down per phone, 1,33 at the most, of a budget of 2; a step of the zone 2,7 ms on the mean, 10 at the worst, of 50.** A slowed browser among 24 players: 45 frames a second, no corrections. Looking at that crowd found two things, both fixed: everyone who had not chosen a look was the same woman (the zone now gives each newcomer a look of their own, `arrivalLook`), and the names of people standing together were written over each other (the nearer keeps theirs). And a whole channel can now arrive at one door: there was room for thirty-three.

**3.2, 2026-11-17.** The matchmaker. `packages/presence` is what many processes must agree on, in Redis (or in memory for tests, behind the same interface and held to the same list of questions): which zones are alive and who is in their channels, seats reserved, and where each player stands. `POST /v1/play/join` picks the channel (`pickChannel`: together until comfortably full, then a new one) and gives a ticket; the zone takes tickets, once, and with that **a session never leaves the API** (`docs/SECURITY.md`, 2c). Places are noted every five seconds, with the way a player faces. The browser tests go the whole road: phone, API, Redis, zone, and "Canal 1" on the Mapa. A look became twelve bytes on the way (F-165). What is left: F-166.

**3.4, 2026-11-17.** A weak network and a fallen line. The zone tells a goodbye (a close with a reason) from a fall (a close without one, or silence when asked "are you there?"), and keeps a fallen player's body standing for a minute; `packages/presence` says which channel is keeping the place, and the matchmaker sends them back to it; they come back as the same body. On the phone: quick quiet tries, the others kept where they were last seen, "A ligar de novo…" only after a second, "Sem rede. Guardámos onde estavas." after a minute (`net/retry.ts`, `net/session.ts`). `&rede=250,5` makes any line a weak one (`net/conditioner.ts`). The browser tests take the network away and give it back, and play at 250 ms with 5% lost. What is left: F-168.

So the channel holds its eighty with room to spare on both budgets, before chat, before the far ones as dots, before vehicles. Those must each be weighed the same way when they arrive.

**3.5 and most of 3.6, 2026-11-17.** Talk, with its safety on the same sheet (Rule 11): they were built together because one may not ship without the other. The zone: `talk.ts` (who hears, who reads, the filter, the pace, no addresses), the room carries lines, dots and gestures, keeps every line for moderation and reads who has shut whom out. The API: the BI of someone met, block and unblock, report with the last lines copied in. The database: `chat_lines`, `player_blocks`, `reports` (migration 0008), swept by the zone on the periods of the retention doc. The phone: `conversa/` (the line, the log, the sheet of someone met), balloons that ride heads, a mute that is remembered.

Found on the way and fixed: the camera's own account of itself is stale between two pictures, so anything placed on the screen from the world must bring it up to date first (F-170); a stalled line left the player's stick late for good (F-171); a phone noticed a dead line only when the browser did (F-172).

**3.8, 2026-11-17.** The Estúdio. The database: `staff_sessions`, `sanctions` and a password on `staff` (migration 0009); `packages/db/src/studio.ts` holds what is read and written, and whatever changes a player's standing writes its audit row in the same transaction. The API: `apps/api/src/studio.ts`, every route guarded "staff" and naming its roles (`declare` refuses to build a staff route that names none); the matchmaker seats nobody who is suspended or banned. The zone: `heed()`, one question a channel every five seconds; its card now says who is in each channel and how its steps went since it last spoke. The phone: a banner for someone kept out, a line for someone silenced. The page: `apps/studio` (Moderação, Jogadores, Canais, Registo), in the game's own cloth and paper. Held by `api.integration.test.ts` ("the Estúdio"), two tests in `zone.integration.test.ts`, and `tests/e2e/studio.spec.ts`, where a moderator suspends a player who is standing in the street on a phone and that phone is told.

## What is the founder's to say (Phase 3)

Said on 2026-11-17: the word lists (D-3.8), a refused line (D-3.7), who may talk to whom (D-3.9), playing with no zone (D-3.10), the Estúdio's sign-in (D-3.11). Still open:

1. **A read of the two word lists as they now stand** (`packages/i18n/filter/pt.txt`, `ao.txt`): the Angolan one was written here at the founder's word and no Luandan has read it yet. Three words to look at first: "matumbo" (friends say it too), "langa" (it is also a surname), "tuji".
2. **How far a voice carries**: words within 7 m, a balloon without words to 16 m.
3. **Where the zone will run** (Q2): players in Luanda timing a few regions before one is chosen.

## What "done" means for this phase

From the roadmap: two real phones in the same street see each other move smoothly at 250 ms and 5% loss; a channel holds 80 with the zone's tick inside its budget and a phone on foot under 2 KB/s down; chat is visible as speech in the street, filtered, with block, mute and report working; a moderator can act on a report from the Estúdio.
