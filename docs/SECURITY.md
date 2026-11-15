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
- Errors are a status and a one-word code (`invalid`, `unauthenticated`, `slow_down`, `forbidden`, `not_found`, `failed`, and for a name `name_taken`, `name_refused`, `name_spent`). No message, no stack, no detail of what was wrong: the client has the words, and an attacker learns nothing.
- `staff` passes nobody until the Estúdio exists (Phase 12).

**2. Sessions (Task 2.1).**
- A guest is made with no personal data (Rule 16). The device keeps a random 256-bit token; the database keeps only its SHA-256, so the database alone lets nobody in.
- A device id is a hint for support and abuse, never a key: it is stored only as a keyed hash (`HASH_PEPPER`), and presenting one proves nothing.
- A session lasts 90 days from last use, can be revoked, and dies with a player who is suspended, banned or deleted.
- The token travels in the `Authorization` header, never in an address, and is kept by the client in local storage. A script injected into the page could read it: the defence is that the game loads no third-party script and writes no player's words into the page as markup (chat, Phase 3, must keep to that).

**2b. Age (Task 2.6).** The year of birth is typed on the phone and never sent: the client works out the band with the rule it shares with the API and sends the band. It is self-declared either way; what is gained is that the server never holds a year of birth. Nobody under 15 is given an account, and nothing of them is stored on the phone or the server.

**2c. What the server decides for a player (Task 2.3).**
- **The look:** the client proposes it; the API records it only when every part is in the catalogue both read (`packages/protocol/src/look.ts`), and refuses it whole otherwise. A look read back is checked again, so a wardrobe that has changed cannot hand out what no longer exists.
- **The name:** its shape is a rule both sides share (`packages/protocol/src/name.ts`); the server alone says whether it is reserved, whether the filter objects, and whether it is taken. Uniqueness is an index on the plain form of the name, so two requests at the same instant cannot both win. A name reaches a page only as text, never as markup.
- **The card of origin:** dealt by the server with its own dice (`crypto.randomInt`), once a player, inside a transaction that holds the player's row; a trigger refuses to rewrite a card. The Makuta on it is a record, not money, until the ledger pays it (Task 4.1). The client keeps a copy to show with no network; nothing reads that copy as truth.

**3. Personal data (Task 0.10).** Fields that identify a person are encrypted with AES-256-GCM under a rotating keyring, bound to their column; phone numbers and device ids are matched by keyed hash. A guest has none.

## Known gaps

- Rate limits are counted in the memory of one API process. More than one process needs them in Redis (finding F-111).
- No idempotency keys yet: they arrive with the first route that moves Makuta (Phase 4), and no such route exists.
- **A card can be rerolled by someone determined:** the card belongs to the device's first guest, but a device is known only by the id it gives itself, and wiping the browser makes a new one (finding F-114).
- The API is reached at `/api` on the game's own address (a proxy in development and in the browser tests), so there is no cross-origin policy to get wrong; production must keep it so (Phase 14).
- **Whether a name is taken can be asked** by any player, ninety times a minute: names are public, but the list of them can be walked slowly.
- No transport security in development; production terminates TLS in front of the API (Phase 14).
- The service worker caches only same-origin GETs and passes anything under `/api/` straight to the network; when API answers become cacheable this must be revisited.
