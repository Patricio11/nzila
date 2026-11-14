# Budgets

Every number the game is held to, how it is measured, and what stops a change that breaks it. The numbers come from Rules 1 and 2 of `TO_START_EVERY_SESSION.md` and from D-0.30. A feature is done when it is inside these on the reference phone, not on a laptop.

**The reference phone (D-0.5):** 2 GB of memory, an entry-level eight-core processor, Android 11 Go or newer, Chrome. The founder buys two real units of whatever sells most in Luanda. Until they arrive, a slowed-down browser profile stands in for them; it is a guess at the class, and the real units overrule it.

## How things are measured

| Tool | What it is | Run it with |
|---|---|---|
| The size check | Weighs the shell and every built pack, as compressed as the network carries them | `pnpm budget` (after `pnpm build`) |
| The pack check | Checks a pack before it can be published: sizes, drawing costs, reachability, copy | `pnpm pack:check` |
| The phone profile | Chromium at 360×740 with the processor slowed four times and a network of 1.6 Mbit/s with 150 ms of delay | `pnpm test:e2e` |
| The iPhone profile | WebKit at iPhone size | `pnpm test:e2e` |
| The bench | A fixed run that times every frame and the simulation. Open `/bench` on any phone, press Start, read the numbers | by hand, and by `pnpm test:e2e` |
| Screenshots | Every page at phone and desktop size, with a slow-scroll video | `pnpm shots <label>` |

All but the last are part of `pnpm test:all`, the gate before any commit, and of CI.

## Megabytes are money (Rule 2)

| Budget | Limit | Measured by | Enforced | Today |
|---|---|---|---|---|
| The shell: HTML, CSS, JS and fonts, the renderer included (D-1.2) | 300 KB compressed | The size check; and the phone profile, which counts the bytes the first visit really downloads | Yes | 180 KB in all, of which the renderer is 133 KB; the front door alone downloads 17 KB |
| First play, shell included | 6 MB | The pack check holds a district's first view to 5,7 MB (6 MB less the shell) | Yes, from the first pack | No pack yet |
| A district at the Normal tier | 8 MB | The pack check and the size check | Yes, from the first pack | No pack yet |
| One streamed chunk at the Normal tier | 400 KB | The pack check and the size check | Yes, from the first pack | No pack yet |
| An interior | 1 MB | The pack check records each interior's size | From Task 5.6 | — |
| Standing in a busy street | 10 MB an hour of network traffic | The bot swarm records bytes per client | From Task 3.7 | — |
| One client's downstream on foot | 2 KB a second | The swarm; today a test holds a snapshot of 30 walking avatars under 300 bytes, which is under 3 KB a second with everyone moving at once | Message sizes: yes. The rate: from 3.7 | 30 avatars: under 600 bytes whole, under 300 walking, 10 standing |
| An `Input` message | 20 bytes for four frames (200 bytes a second upstream) | A test in `packages/protocol` | Yes | 20 bytes |
| Any download over 1 MB | The size is shown before it starts | Screens, from Task 1.2 | From 1.2 | — |
| Music | About 14 MB an hour, so always the player's choice and off in Modo Poupança | D-0.18 | From 10.15 | — |
| The display typeface | 40 KB | A test in `packages/ui` | Yes | 35 KB |

## The reference phone (Rule 1)

| Budget | Limit | Measured by | Enforced | Today |
|---|---|---|---|---|
| Frame rate at the Poupança tier | 30 frames a second, sustained: 95 frames in every 100 are at least that fast, after half a second of warm-up | The bench, on the phone profile and by hand on the real units | Yes, where the browser has a real graphics card to draw with | 59 on the phone profile, on the test scene of boxes (Task 1.1). No real phone yet |
| Draw calls in view | 120 | The renderer's own count, on the bench path and at every tier; and the pack check's estimate from each spawn and paragem | Yes | 14 at Poupança, 19 at Alta, on the test scene |
| Triangles in view | 120 000 | The same | Yes | 2 200 at Poupança, 3 800 at Alta, on the test scene |
| Texture memory | 96 MB | The renderer's count of what it has uploaded | From 1.1 | — |
| JavaScript heap | 180 MB | Chromium's memory report on the phone profile, after ten minutes of play | From 1.9 | — |
| Input to visible response | 100 ms | The phone profile, from a tap to the next frame that shows it | From 1.4 | — |
| A simulation step | Well inside its 50 ms; the harness fails at 25 ms | The bench steps 80 people and 20 vehicles | Yes | 0,9 ms on the phone profile |

### The draw-call split at Poupança (D-0.30)

The 120 draw calls are shared out so that no part of the picture can spend another's share. The bench reports each line from Task 1.3.

| What | Draw calls |
|---|---|
| The world: buildings, ground, props | 60 |
| Skinned avatars, the 8 nearest | 8 |
| The instanced crowd and traffic | 12 |
| Water and sky | 4 |
| Effects, and spare | 36 |
| **Total** | **120** |

The pack check holds a district to the world's 60 from wherever a player can stand.

### Quality tiers

| Tier | Internal resolution | Skinned avatars | For |
|---|---|---|---|
| Poupança | 540p, down to 432p | 8 | The reference phone, and what Modo Poupança forces |
| Normal | 720p | 16 | Mid-range phones |
| Alta | Up to 1080p | 30 | Good phones and laptops |

The game must be beautiful at Poupança. The budgets above are Poupança's.

## The network (Rule 12)

| Budget | Limit | Measured by | Enforced |
|---|---|---|---|
| Playable latency | 250 ms | The network conditioner and its tests | From Task 3.4 |
| Playable packet loss | 5% | The same | From 3.4 |
| Recovery from a dropped connection | 60 seconds, with no completed action, position or Makuta lost | The same | From 3.4 |
| A channel | 80 players | The bot swarm | From 3.7 |

## What the profiles cannot tell us

- **The phone profile is a guess.** A processor slowed four times is not a cheap phone: it has a desktop's graphics, memory and storage. It catches a change that makes things much slower; it does not prove the game runs on the reference phone. Only the bench on the real units does (Rule 1).
- **The iPhone profile is not an iPhone.** It is the same browser engine drawing without a graphics card, so its frame rate means nothing and is recorded but not judged. It does catch what Safari refuses to run. A real iPhone is measured by hand in Task 1.9.
- **Reference pictures belong to one operating system.** Text is drawn differently on Windows, Linux and macOS. The pictures in `tests/e2e/reference/` were made on Windows; on another system the comparison is skipped, and says so, until its own are made (`pnpm test:e2e --update-snapshots`, then look at each before committing).
- **The test scene is not the game.** The bench draws twenty boxes, a road and the bay: a few thousand triangles. A real district has many times that. Its numbers show the renderer's fixed costs and that the harness works; the budgets are proved on the first real district (Task 1.5).
- **A frame rate is judged only with a real graphics card.** On a machine without one the browser draws with the processor, and the tests record the number without judging it. The counts of draw calls and triangles are judged everywhere, because they do not depend on the machine.
