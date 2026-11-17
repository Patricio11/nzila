# Phase 3: Multiplayer core. Built; not yet proven on real phones

Opened 2026-11-16, built by 2026-11-17. **The phase is not ticked complete:** the roadmap asks for three real phones in a full channel, and no real phone has been in one. Everything else it asks for was built and was measured with real processes on the development machine. It is written up now, as Phase 1 was, so that Phase 4 can open on what exists.

## What exists

- **The zone** (`apps/zone`): a plain WebSocket server on our own protocol (D-3.6 as revised: the room library cost the phone 52 KB of its 300). It alone decides where everyone is. The phone sends its stick; the zone walks only the frames it was sent, at 20 steps a second, and says where everyone near is 10 times a second (the nearest 30 within 60 m, as differences). People are solid to each other.
- **The phone's netcode** (`apps/client/src/net`): the player's own body moves at once and is put right without jumping; others are drawn a moment in the past so that they glide; a line that falls is picked up again for a minute, and the player is the same body in the same place when it comes back.
- **The matchmaker** (`POST /v1/play/join`, `packages/presence` in Redis): everyone in a bairro is put in the same street until it holds 60, then a second copy opens; a copy holds 80. The phone shows the zone a one-time seat, never its session. **Nobody chooses or is invited to a channel, and its number is shown only when there is more than one** (the founder, D-3.12 and D-3.13).
- **Talk and its safety, on the same sheet** (Rule 11): words read within 7 m, a balloon without words to 16 m, three dots while typing, quick phrases, gestures. A tap on someone opens their BI with Falar, Silenciar, Bloquear, Denunciar. A word list (105 Portuguese and English, 13 Angolan, widened at the founder's word), no addresses to anywhere outside the game, a pace. Every line kept 30 days. **Talk is open** (D-3.8); everyone talks to everyone (D-3.9).
- **Meeting someone:** a greeting answered by a greeting, close by, makes two strangers known to each other: a wave, or "Bom dia", "Boa tarde", "Tudo bem?", "Estás bem?" and the like (the founder, 2026-11-17). Someone met is named as they pass.
- **The Estúdio** (`apps/studio`): Moderação (the report queue), Jogadores (found by BI number, with a reason), Canais (who is where, how the steps go, a stuck player pulled out), Registo (the audit log). A sanction is a row the zone carries out within five seconds; the player is told in the game's own words. A password and no second factor yet (D-3.11).
- **The swarm** (`pnpm swarm`) and **the phase's verification** (`pnpm verify:phase3`).

## What was verified, and how

`pnpm verify:phase3` starts zones of its own as real processes, runs the real API, and sends 93 players through the matchmaker. Run on 2026-11-17:

| Asked by the roadmap | Shown |
|---|---|
| A second channel opens at 60 | The first 60 players were all put in channel 1; the 61st was put in channel 2. Sent to channel 1 by name it fills to 80, and the next is told it is full |
| 80 in one channel hold the budgets | Down per client: 1,13 KB a second on the mean, 1,35 at the most (budget 2). **The zone's step time did not hold on this machine**: see Measured |
| A killed zone loses no player for more than 60 s | The zone process was killed outright with 12 players standing in it and another started. All 12 were back in the street in 7,7 to 10,8 s over three runs, each within a centimetre of where they stood, without being asked anything |
| 3 real phones in that channel | **Not done.** The founder's |

The gate (`pnpm test:all`) holds the rest: 116 integration tests against a real PostgreSQL, Redis and sockets (the zone, the API, the Estúdio's routes), and 70 browser tests in which two phones see each other, talk, meet, fall off the network and come back, and a moderator suspends a player who is standing in the street.

## What was deferred, and why

- **Traffic and the people of the street are still each phone's own** (F-152): a van ride takes a player out of their street and puts them back at the paragem. To the zone with Phase 6.
- **Players beyond 60 m are not known to a phone** (the roadmap's "low-rate dots"): the Mapa shows who is near.
- **A ban is weak**: a banned player still walks their own street, and a new guest on the same phone is a new player; a suspended player is not told why and cannot answer (F-175).
- **Whom a player has met is kept on their phone** until friends have a home on the server (10.1, F-179).
- **The bots do not talk**, so what talk costs a full channel in bytes is not measured (F-173).
- **Every player is born on the Marginal** whatever their card says, until a second bairro exists (F-178).

## Measured

On the development machine (a laptop, sharing its processor with a browser, Docker and the bots themselves), not a server:

| What | Measured | Budget |
|---|---|---|
| Down per client, 80 walking in one channel | 1,13 KB/s mean, 1,35 KB/s most | 2 KB/s |
| Others a client is told of | 29 | 30 |
| Back in the street after the zone is killed | 7,7 to 10,8 s | 60 s |
| The game's code on the phone | 293 KB | 300 KB |
| One step of the zone, 80 in a channel | **between 2,7 and 9,7 ms on the mean and 10 and 63 ms at the worst, on different days** | 5 ms mean, 25 ms worst |

**The step time is not settled** (F-182). The zone's own work is small (about 1,5 ms a step for the world and the snapshots, measured with no network; its process was idle 86% of the time while 80 walked). What was read at `/health` changed fourfold between two days with the same code, checked by running the earlier code again on the later day: it measures the laptop, not the zone. It has to be read on the machine the zone will run on, alone.

## Waiting on the founder

1. **Three real phones in one street**, with the swarm filling it: the last line of the phase.
2. **A read of the word lists** as they now stand (`packages/i18n/filter/`), and of the greetings (`packages/i18n/src/greetings.ts`: Kimbundu and Umbundu ones are not in it).
3. **Where the zone will run** (Q2), so that its step time and the round trip from Luanda can be measured there.
4. **Before strangers play:** a second factor for the Estúdio (D-3.11), what a ban should really do, and whether a suspended player is told why (F-175).
5. Carried from before: Resend's key and domain, Phase 1's checks on the reference phones.
