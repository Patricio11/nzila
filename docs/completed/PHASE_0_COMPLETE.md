# Phase 0 complete: Foundations

**Closed 2026-11-14.** Thirteen commits, `e88a809` to this one. Goal of the phase: a correct skeleton, with the shared simulation, the economy rules, the protocol, the pack format, the tokens and the budgets in place and tested before anything is drawn.

## What shipped

| Task | What exists |
|---|---|
| 0.1 Skeleton | pnpm workspaces and Turborepo; five apps, seven packages, `tools/`, `content/`, `art/`, `infra/`; dev services in Docker; CI; `CLAUDE.md`. |
| 0.2 `packages/sim` | Integer maths with its own trigonometry, seeded random, the walk grid, collision, the character controller, six vehicles on one arcade model, the world clock (60 real minutes a day, golden hour a quarter of daylight), route vans as a pure function of the clock, the stepped world with copy and hash. Typed stubs for needs, heat, offences, minigame scoring. Drink (`intoxication.ts`), added at the founder's request. Zero dependencies. |
| 0.3 `packages/economy` | Account kinds with four named faucets and ten named sinks; transfer rules with reversal and replay safety; an in-memory book; the audit's arithmetic; economy health; the tunables validator and `tunables/base.json`. Zero dependencies. |
| 0.4 `packages/protocol` | Hand-packed binary messages: Join with version negotiation, Input, delta-compressed Snapshot with area-of-interest selection, Event, Chat, Handoff. |
| 0.5 `packages/db` | Guarded SQL migrations with a journal; the core tables; the ledger and the audit log append-only by trigger; balances kept by the database and refusing any other write; the seed; Drizzle tables. |
| 0.6 `packages/world`, `tools/pack` | The pack manifest schema; the walk grid file format and its hand-written form; `content/registry.json`; `pack export` (Blender: chunks and two levels of detail), `pack build` (Meshopt, KTX2, hashes, sizes, drawing costs, manifest), `pack check` (the gate before publishing). |
| 0.7 `packages/ui` | The Hora Dourada tokens; Fraunces, self-hosted, 35 KB; the drawn wordmark; 22 glyphs; the first components, redrawn to feel like a game (D-0.39); the house-rules tests; `/styleguide`. |
| 0.8 `packages/i18n` | The `pt-AO` catalog; our own small ICU reader; plurals and numbers written by hand; the glossary; checks on copy. |
| 0.9 Harness and budgets | `pnpm budget`; the phone and iPhone browser profiles (`pnpm test:e2e`); `/bench`; `docs/BUDGETS.md`; `pnpm shots`. |
| 0.10 Privacy and safety spine | `audit.log()`; AES-256-GCM field encryption with key rotation; keyed hashes for phone numbers and device ids; consents as a versioned history; the chat filter's machinery and a first Portuguese list; `docs/legal/RETENTION.md`. |

Also begun in this phase, outside its tasks: `docs/FINDINGS.md` (the log of bugs, gaps and ideas), `docs/legal/BRAND_TERMS.txt` (about 170 researched terms), `docs/legal/ASSET_LICENCES.md`, the markets of Luanda in `LUANDA_REFERENCE.md` §6b, and Task 10.16 (drink) in the roadmap.

## What was verified, and how

`pnpm test:all` is green. It runs, in order:

| Step | What it proves | Result |
|---|---|---|
| Typecheck | Every package and tool compiles under strict TypeScript | 13 of 13 |
| Lint | Including the rule that keeps clocks, random sources and engine-dependent maths out of the simulation | Clean |
| Unit tests | 346 tests in 29 files. 100% of lines, branches and functions enforced on `packages/sim`, `packages/economy` and `packages/protocol` | Pass |
| Engine tests | The simulation and protocol tests again inside Chromium, WebKit and Firefox, against the same golden numbers as Node | 588 passes |
| Integration tests | The database against real PostgreSQL (23 tests), and the asset pipeline against real Blender and KTX-Software (4 tests) | 27 pass |
| `pack:check` | Every district with a `district.json` builds and may be published | None exists yet |
| Build, `budget` | The client builds; the shell is inside its budget | 51 KB of 300 KB |
| Browser tests | The built client on the phone and iPhone profiles: errors, sideways scrolling, the look of the styleguide, the bench | 10 of 10 |

Things proved that are worth naming:

- **The same inputs give the same world everywhere.** A simulated minute of 80 people and 24 vehicles in a generated town reaches the same six checkpoints in Node and in three browser engines.
- **The books cannot be made to lie.** After each of 10 000 requests, valid and invalid, with replays and reversals, all accounts sum to zero and nothing but a faucet is below zero. In the database, forty transfers at the same instant against 1 000 Mk record exactly ten; a balance cannot be written except by recording a transfer; a transfer cannot be changed or removed.
- **Decoders take anything.** Random bytes and cut-off messages only ever fail as a `ProtocolError`.
- **An old client is told to refresh.** The layouts of `Join` and `JoinRefused` are pinned by golden bytes.
- **A pack that should not be published is refused,** with every problem named: tampering, a size or drawing budget, a place nobody can walk to, a missing string, fewer than five positive points of interest, a brand name.
- **The road from Blender to a pack works end to end** on a generated test scene, and the same source builds the same pack byte for byte.

## Measured budgets

| Budget | Limit | Measured |
|---|---|---|
| Shell (HTML, CSS, JS, font) | 300 KB | 51 KB; the front door alone downloads 17 KB, in 1,0 s on the slow-phone profile |
| Display typeface | 40 KB | 35 KB |
| Snapshot, 30 avatars sent whole | 600 bytes | Under 600 |
| Snapshot, 30 avatars walking | (2 KB/s per client) | Under 300 bytes, so under 3 KB/s with everyone moving at once |
| Snapshot, 30 avatars standing | | 10 bytes |
| Input, four frames | | 20 bytes (200 bytes/s upstream) |
| Frame rate, sustained | 30 fps | 59 fps on the phone profile, **on the stand-in scene, which is not the game** |
| One simulation step, 80 people and 20 vehicles | 50 ms | 0,9 ms on the phone profile |

Frame time, megabytes per district and bandwidth per player in a real channel cannot be measured yet: there is no renderer, no district and no zone server. `docs/BUDGETS.md` says for each budget whether it is enforced today or from which task.

**Nothing in this phase was measured on a real phone.** The phone profile is a desktop browser slowed down; the reference units (D-0.5) have not been bought.

## What was deferred, and why

Every open item is in `docs/FINDINGS.md` with the task that closes it. Those that matter for Phase 1:

| Finding | What | Closes in |
|---|---|---|
| F-32 | No real phone has run anything. The two reference units and one iPhone are needed. | Founder; before 1.9 |
| F-18 | What each quality tier downloads, and the view distances behind the triangle and draw-call estimates, are placeholders. | 1.1, by measurement |
| F-34 | Impostors are not made; the renderer decides how distance is drawn. | 1.1 decides, 1.5 builds |
| F-35 | A walk grid cannot be drawn in Blender, only written by hand. | 1.5 |
| F-11 | A person pressed straight into a diagonal wall on the walk grid stops instead of sliding. | 1.3 |
| F-23 | The spec's examples still show the old price scale (150 Mk). | With each screen |
| F-31, F-36 | CI has no reference pictures and no Blender or KTX-Software, so it does not check the look or the asset pipeline. There is no remote yet. | When the repository first runs on CI |

Others, for later phases: F-12, F-13 (simulation, Phases 3 and 6), F-14, F-15 (economy, Phase 4), F-16, F-17 (protocol and sessions, Phases 2 to 6), F-19 to F-22 (the founder's and counsel's reviews of brands, copy, the chat filter and retention).

**Deliberate differences from the roadmap as written,** each recorded where it was taken:

- `packages/sim` keeps entities in plain arrays, not `bitecs`: the stack asked for both `bitecs` and zero dependencies.
- Migrations are hand-written guarded SQL, not generated by drizzle-kit: generated SQL is not guarded against a re-run.
- `Input` carries the stick only; each verb gets its own message when it is built.
- The display typeface is Fraunces, not Bricolage Grotesque (D-0.38).
- Plurals and number formats are written by hand, not taken from the browser, which writes "0 minuto" for `pt-AO`.
- The bench judges "sustained" as 95 frames in 100, on the best of three runs.

## Decisions taken during the phase

D-0.9 amended (a Makuta buys what a kwanza buys; 25.000 Mk to start; a corrida is 200 Mk; "1.500 Mk"), D-0.37 (drink; not served to players of 15 to 17), D-0.38 (Fraunces and the drawn wordmark), D-0.39 (the interface feels like a game and is drawn by us). The findings and screenshots conventions were added at the founder's request.

## Waiting on the founder

The list is in `TO_START_EVERY_SESSION.md`. Three items gate Phase 1 itself: the reference phones (item 2), photographs of the L1 landmarks (item 3), and the cobrador's calls (in `LUANDA_REFERENCE.md` §5).
