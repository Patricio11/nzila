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

**D-3.6 Colyseus 0.18, for rooms and seats; the bytes are ours (delegated, 2026-11-16; answers Q1).** Its current documentation was read on 2026-11-16 (docs.colyseus.io; server `colyseus` 0.18, client `@colyseus/sdk` 0.18; MIT). What matters to us is all there: a room may send and receive raw bytes with no schema state of its own (`onMessageBytes`, `client.sendBytes`, `broadcastBytes`; `room.sendBytes` on the client), so `packages/protocol` stays the only wire format; a seat is reserved from our own API (`matchMaker.joinOrCreate`, `reserveSeatFor`) and consumed by the client (`consumeSeatReservation`), which is Task 3.2's matchmaker; a join is checked with a token (`static onAuth(token, options, context)`), which is our session token; a dropped client's seat is held (`allowReconnection(client, seconds)`), which is 3.4; several processes need `@colyseus/redis-presence` and `@colyseus/redis-driver`. The default transport is `ws`; uWebSockets is recommended for production and is looked at with the load test (3.7). WebTransport is experimental and not used. Not found in the docs and to be checked in code: the least version of Node it supports, and the shape in which the client receives raw bytes.

## What "done" means for this phase

From the roadmap: two real phones in the same street see each other move smoothly at 250 ms and 5% loss; a channel holds 80 with the zone's tick inside its budget and a phone on foot under 2 KB/s down; chat is visible as speech in the street, filtered, with block, mute and report working; a moderator can act on a report from the Estúdio.
