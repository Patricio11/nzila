# Security: who decides what

*Opened 2026-11-15 with Task 2.4. Grows with every phase that adds a boundary.*

## The authority model

**The client proposes, the zone decides, the API records.** Nothing a client sends is believed.

| Part | Trusted with | Never trusted with |
|---|---|---|
| **Client** (a browser on a phone) | Drawing the world; predicting its own avatar with the shared simulation; what the player chose on this device (quality, hand, sound). | Where anyone really is, what anything costs, what anyone owns, who anyone is. It can be modified by whoever holds the phone. |
| **Zone** (Phase 3) | The truth of the world it runs: positions, who is near whom, the outcome of every action, by the same simulation the client predicts with. | Money and identity: it asks the API. |
| **API** | Identity, sessions, the ledger, everything that must still be true tomorrow. | Anything a client says about itself beyond its token. |
| **Database** | Refusing what the API should never have asked: the ledger and the audit log are append-only by trigger; balances refuse any write but the ledger's. | |

## Trust boundaries, as built

**1. Client to API (Phase 2).**
- Every route is declared through `declare()` (`apps/api/src/routes.ts`) with a **guard** (`public`, `player`, `staff`), a **shape** checked with Zod before the handler runs (unknown fields are refused, bodies are capped at 16 KB), and a **rate limit**. A route registered any other way stops the app from being built, and a test walks every route. The list of public routes is written out in that test: adding one is a deliberate act.
- Errors are a status and a one-word code (`invalid`, `unauthenticated`, `slow_down`, `forbidden`, `not_found`, `failed`). No message, no stack, no detail of what was wrong: the client has the words, and an attacker learns nothing.
- `staff` passes nobody until the Estúdio exists (Phase 12).

**2. Sessions (Task 2.1).**
- A guest is made with no personal data (Rule 16). The device keeps a random 256-bit token; the database keeps only its SHA-256, so the database alone lets nobody in.
- A device id is a hint for support and abuse, never a key: it is stored only as a keyed hash (`HASH_PEPPER`), and presenting one proves nothing.
- A session lasts 90 days from last use, can be revoked, and dies with a player who is suspended, banned or deleted.
- The token travels in the `Authorization` header, never in an address, and is kept by the client in local storage. A script injected into the page could read it: the defence is that the game loads no third-party script and writes no player's words into the page as markup (chat, Phase 3, must keep to that).

**3. Personal data (Task 0.10).** Fields that identify a person are encrypted with AES-256-GCM under a rotating keyring, bound to their column; phone numbers and device ids are matched by keyed hash. A guest has none.

## Known gaps

- Rate limits are counted in the memory of one API process. More than one process needs them in Redis (finding F-111).
- No idempotency keys yet: they arrive with the first route that moves Makuta (Phase 4), and no such route exists.
- No transport security in development; production terminates TLS in front of the API (Phase 14).
- The service worker caches only same-origin GETs and never an API answer; when API answers become cacheable this must be revisited.
