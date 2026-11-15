# Phase 2 plan: Identity

**Opened 2026-11-15**, under D-1.6: Phase 1's tasks 1.1 to 1.8 are built; its two founder's checks (reference phones, the look test) stay open and are recorded in `docs/completed/PHASE_1_COMPLETE.md`. Nothing goes public before them.

Goal, from the roadmap: a player exists, looks like themselves, and is still there tomorrow.

## Recheck of each task's dependencies

| Task | Depends on | State |
|---|---|---|
| 2.1 Guest accounts | 0.5, 1.8 | Ready. `players`, `devices` and `player_sessions` exist (migration 0001); the front door exists. |
| 2.2 Linking an account | 2.1 | After 2.1. The code provider is not chosen (S-5, Q2). |
| 2.3 Avatar creator and the BI | 1.3, 1.7 | **Largely ahead:** the look chooser was built in Phase 1 (`/provador`) and is already a new player's first step. What is left: saving the look to the server, the lotaria da vida (D-0.44), the name, the BI card filled from real data. |
| 2.4 API skeleton, sessions, guards | 0.5, 2.1 | Start here, with 2.1: `apps/api` is an empty Fastify app. |
| 2.5 Persistence of the player | 2.2, 2.4 | After 2.4. `LocalWorld` keeps settings and the look on the device today; the provider is where the server goes behind them. |
| 2.6 Age gate, consent, privacy | 0.10, 2.1 | After 2.1. The consents history and field encryption exist (0.10). |
| 2.7 Wiring, verification, doc convention | 2.1 to 2.6 | Last. |

Order of work: 2.4 and 2.1 together (the API and a guest), 2.6 (the age gate sits before the look chooser), 2.3 (look saved, lotaria, name, BI), 2.5, 2.2, 2.7.

## Open questions

**Q1. Better Auth's anonymous plugin.** The roadmap says to confirm it against current documentation before building on it.
*Recommendation:* read the docs first; if anonymous sessions cannot be upgraded without losing the player's id, write the guest session ourselves on `player_sessions` (a random token, hashed, bound to a device) and use Better Auth only for linking.

**Q2. The code provider for phone numbers (S-5).** WhatsApp first, SMS as fallback, chosen on delivery and price to Angolan numbers.
*Recommendation:* build 2.2 against an interface with a development provider that prints the code; the founder chooses the real one with numbers from two providers. No provider's key is needed to finish the phase.

**Q3. The lotaria da vida (D-0.44).** The lowest start is 1.500 Mk and "some can start with 2.500"; the highest amount and each family's share are not set.
*Recommendation:* ship the draw with placeholder families and shares in tunables, clearly marked, and ask the founder for the table. The draw is made by the server, once, and paid through the ledger from a named faucet: this needs the ledger's API, which is Phase 4. **So in Phase 2 the card is drawn and recorded; the Makuta is paid when 4.1 exists.** The wallet chip shows the drawn amount from the record until then.

**Q4. Names.** Unique, filtered, in Portuguese of Angola.
*Recommendation:* 3 to 16 characters, letters, spaces and a few marks; the chat filter's word list (0.10) applied; uniqueness without regard to case or accents; a guest gets a friendly generated name they can change once for free.

**Q5. Where the age question goes.** The roadmap puts it at first play; the look chooser is now the first thing a new player does.
*Recommendation:* the year of birth is asked on the front door's way in, before the look chooser; under 15 is turned away kindly with nothing stored.

**Q6. What "the same player on a second device" means before there is a world server.**
*Recommendation:* in this phase: the look, the name, the settings, the drawn card and the last position. "One active world session" is enforced in Phase 3, where sessions with a zone exist; here the rule is recorded and tested at the API (the newer session invalidates the older).

## Decisions

**D-2.1 The look is data, validated by the server (delegated, 2026-11-15).** A look is the small object of `render/wardrobe.ts`. The server keeps a catalogue of what may be worn (the wardrobe's own list) and refuses anything outside it: the client proposes, the API records. *Recommendation: yes.*

**D-2.2 A guest is a real player (delegated).** No feature is held back from a guest except what needs a way to reach them (recovering the account on another device). The upgrade keeps the same player id. *Recommendation: yes.*

**D-2.3 The provider stays the seam (delegated).** Pages go on asking `WorldProvider`; a `ServerWorld` sits beside `LocalWorld` and takes over what the server now owns (identity, look, settings), one thing at a time. *Recommendation: yes.*

**D-2.4 Guest sessions are our own, for now (delegated, 2026-11-15; the founder may overrule).** The roadmap names Better Auth's anonymous sessions and says to confirm the plugin first (Q1). A guest needs one table that already exists and forty lines: a random token, its hash, an expiry. Writing it ourselves keeps the player's id fixed from the first second and adds no dependency to trust before it has been read. Better Auth is looked at again at Task 2.2, where linking by phone, Google and email is real work it may save. *Recommendation: yes.*

## What "done" means for this phase

From the roadmap, Task 2.7: a guest upgraded on one device appears whole on another; deletion removes personal data and keeps anonymous ledger rows; every route is guarded, and a test fails the build on one that is not.
