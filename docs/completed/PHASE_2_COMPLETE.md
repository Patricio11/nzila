# Phase 2: Identity. Complete

**Closed 2026-11-16.** Goal of the phase: a player exists, looks like themselves, and is still there tomorrow.

A new player opens the game, says the year they were born, chooses how they look, is dealt the family they were born into, and walks into Luanda with a name and a BI. They can save that BI with an email address and a password and open it on any phone. They can see everything the game keeps of them, take it away, and delete it.

Phase 2 was opened under D-1.6 with Phase 1's two founder's checks still open (the reference phones, the look test). They are still open, and nothing goes public before them.

## What exists

| Task | What exists |
|---|---|
| 2.1 Guest accounts | The first open on a device makes a guest: a player, a device known only by a keyed hash, a session known only by the hash of its token. Our own sessions on `player_sessions` (D-2.4). With no server the game opens on what the phone knows and asks again next visit. |
| 2.2 Saving the BI | **An email address and a password** (D-2.10): kept as an encrypted copy and a keyed hash, and a salted scrypt hash. **A code sent to the address proves it** and **"Esqueci-me" chooses a new password** with one (D-2.11); a password can be changed in "Os meus dados". Mail goes through **Resend** when the API has a key, and to the API's console when it has none. On a second phone the address and the password bring the whole player; every older session ends and the phone it was on is told why. A phone number and a code is built and **switched off** (D-2.11). |
| 2.3 Avatar and BI | The look chooser of Phase 1, now recorded by the server against a catalogue the game and the API share (D-2.1). **A lotaria da vida:** a card dealt by the server, once, from a first table of seventeen families in four lots (D-2.6); no rerolls as far as a device can be known (D-2.7). **The BI:** name (unique whatever the case and accents, one free change, D-2.8), number (the order of arrival), bairro, day of arrival, and a photograph taken in the look chooser. |
| 2.4 The API | Fastify. Every route goes through `declare()` with a guard, a Zod shape and a rate limit; one registered any other way stops the app from being built, and a test walks the list. Errors are a status and one word. `docs/SECURITY.md` states who is trusted with what. |
| 2.5 Persistence | The look, the name, the BI, the card and the consents are the server's and come back on any phone. |
| 2.6 Age, consent, privacy | The year of birth is typed on the game's own keys and never leaves the phone; only the band is sent (D-2.5). Under 15 is turned away kindly and nothing is kept. "Os meus dados": analytics and notifications as switches, off until a yes, kept as history; everything kept of the player as a file; deletion asked twice, which empties the player's row and keeps it for the ledger. |
| 2.7 Verification | Below. |

Also built in these days, at the founder's word, outside the phase's own list: **the interface wears the pano Samakaka** and each player chooses their own (D-0.52); **nothing passes through anything** (D-0.53): solidity is read from every surface built, people and benches have bodies, traffic gives way and vehicles never touch; **the land is Angola's** (the imbondeiro, the mangueira, the red earth, outdoors by the road); **a sign floats over every place** saying what it is.

## What was verified, and how

`pnpm test:all` is green on the closing commit.

| Step | Result |
|---|---|
| Typecheck, lint | 13 of 13; clean |
| Unit tests | 100% of lines, branches and functions on `packages/sim`, `economy`, `protocol` (which now holds the rules the game and the API share: age band, look, name, email, password) |
| Engine tests | The simulation and the protocol again in Chromium, WebKit and Firefox |
| Integration (PostgreSQL) | The API on a real database: guests, sessions, the look, the card (twenty requests at once deal one; a second guest on a device gets the first one's card; a card cannot be rewritten), names (four players asking for one at once: one gets it), consents, export, deletion, the phone and the email ways of saving, the code that proves an address, the forgotten password, the password changed |
| Browser (phone and iPhone profiles) | Against the real API on a database of its own: the whole way in; the age question; the BI and its name; "Os meus dados" to the end of an account; saving by email, proving the address, a second phone, a forgotten password |

**The phase's own definition of done (Task 2.7):**

- *A guest upgraded on one device appears whole on another.* Tested in both browsers with two phones: the name, the BI, the look and the card arrive; the first phone is put out and told.
- *Deletion removes personal data and keeps anonymous ledger rows.* Tested in PostgreSQL: after deletion the player's row has no name, number, address or band; the devices, sessions, look and card are gone; ledger rows written for that player are all there, their balance unchanged, the books adding up to what they did.
- *Every route is guarded, and a test fails the build on one that is not.* `apps/api/src/app.test.ts`; an unguarded route also stops the app from being built. The list of public routes is written out in the test.

## What was deferred, and why

| What | Why | Where it goes |
|---|---|---|
| **Real mail** | Resend needs an account and a key, which are the founder's to open. Until then every letter is printed on the API's console and reaches nobody: an address cannot really be proved and a password cannot really be recovered outside development. | The founder: `RESEND_API_KEY` and a verified `EMAIL_FROM` (`.env.example`) |
| **Saving with a phone number** | The codes need a paid provider (founder, 2026-11-16: "that will cost money, for now no need"). Built, tested, switched off (`PHONE_CODES`). | When a provider is chosen |
| **Google sign-in** | Left by the founder ("will need setup"). | If ever asked for |
| **Better Auth** | Not used. Guests, sessions, the email way and the phone way are a few hundred lines on tables we already had, with the player's id fixed from the first second. Its gain is social sign-in, which is not wanted now. | Looked at again only with Google |
| **Rate limits in Redis; idempotency keys** (2.4) | Limits are counted in the memory of the one API process there is. Redis matters when there are two processes; idempotency keys matter with the first route that moves Makuta. | 3.1 (limits), 4.1 (keys) |
| **Last position, settings, tutorial** (2.5) | Where a player is, is the zone's to know. Settings are the phone's own on purpose (quality and hand belong to a device); the chosen pano is one of them and should follow the player. There is no tutorial yet. | 3.1; the pano with 3.1's player state |
| **The card pays nothing** | The Makuta on the card of origin is a record until the ledger has its API. | 4.1 |
| **Scheduled clean-up** | No job yet deletes idle guests, old sessions and devices, spent codes, or consents after their period (`docs/legal/RETENTION.md`). | A worker, Phase 4 or 13 |
| **Recovery without the mailbox** | A player who loses both password and mailbox has no way back. | Support tooling, Phase 12 |

Every one of these has its entry in `docs/FINDINGS.md`.

## Measured

| What | Number |
|---|---|
| The shell a player downloads | about 275 KB of 300 KB |
| First play, slow profile | inside 6 MB and 60 s (the permanent test); the way in is now five steps (door, year, look, card, world) |
| Marginal e Baixa | 2,30 MB at Normal, 0,76 MB at Poupança, of a budget of 8 |
| Cells closed by "nothing passes through anything" | 3.397 in Marginal e Baixa's and the rehearsal town's walk grids that were open with something built on them |

**Nothing has run on a real phone yet.** That is Phase 1's debt and it stands.

## Waiting on the founder

*(2026-11-16, his answers: the Resend key will come, everything is ready for it; the words are fine; the phones will be checked later, the browser serves for now.)*

1. A Resend account: the key, and a domain to send from. **He will give it.**
2. ~~His ear on the words.~~ **"It is okay."**
3. The table of origins: shares, amounts, families, bairros.
4. Whether the count of players may be read off a BI number.
5. Phase 1's two checks.
