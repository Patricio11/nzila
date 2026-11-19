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
- Errors are a status and a one-word code (`invalid`, `unauthenticated`, `slow_down`, `forbidden`, `not_found`, `failed`, for a name `name_taken`, `name_refused`, `name_spent`, `not_confirmed` for a deletion without its proof, for a code `wrong_code`, `has_account`, `no_account`, and for a password `wrong_login`). No message, no stack, no detail of what was wrong: the client has the words, and an attacker learns nothing.
- `staff` passes nobody until the Estúdio exists (Phase 12).

**2. Sessions (Task 2.1).**
- A guest is made with no personal data (Rule 16). The device keeps a random 256-bit token; the database keeps only its SHA-256, so the database alone lets nobody in.
- A device id is a hint for support and abuse, never a key: it is stored only as a keyed hash (`HASH_PEPPER`), and presenting one proves nothing.
- A session lasts 90 days from last use, can be revoked, and dies with a player who is suspended, banned or deleted.
- The token travels in the `Authorization` header, never in an address, and is kept by the client in local storage. A script injected into the page could read it: the defence is that the game loads no third-party script and writes no player's words into the page as markup (chat, Phase 3, must keep to that).

**2c. Client to zone (Phase 3).**
- The line is a plain WebSocket carrying `packages/protocol` and nothing else. A message is at most 1 KB or is not read; text is not read; sixty messages a second are read and the rest are not; five that cannot be read, or five floods, and the line is closed (`ZONE_CLOSE.MISBEHAVED`). A line that does not say who it is within ten seconds is closed.
- **A phone never shows a zone its session.** It asks the API where to play (`POST /v1/play/join`, a player's route), and is given a **ticket**: a random name for a seat reserved in one channel of one zone, kept in Redis for thirty seconds and taken once (`GETDEL`). The zone learns who the player is from the seat, not from the phone. A ticket for another zone, another district or a spent one lets nobody in. A zone takes a session in place of a ticket only with `ZONE_SESSIONS=on`, which is for the swarm and a developer's machine and must be off wherever players reach.
- **A client sends its stick and never a place** (D-3.1). The zone walks only frames it was sent, in order, one a step and never faster than time, with three steps of slack: a client that sends more gains nothing. Walls, benches and other people stop a walk in the zone as on the phone.
- The one thing a phone says about where it is: the paragem it got off a van at, by its id. The zone believes a paragem of its own district and nothing else. It is a free hop between paragens until the vans are the zone's (F-157).
- What the zone tells a phone about another player is their name and their look, each checked as it leaves the zone and again as it arrives; a look is twelve numbers, not text.
- **Talk** (Rule 11). A line is tidied by the zone (one line, no control or invisible characters, 200 characters), refused when it has a listed word or an address to anywhere outside the game, and paced (a line every half second, six in ten). Words are sent only to phones within reading distance: one farther off is told that someone spoke and never what. A client's claim about who is typing is ignored: the zone knows who is on each line. What another player said is put on the page as text, never as markup. Every line is kept for moderation for thirty days. Block is the server's and both ways; report copies the reported player's last lines. Talk is open since the word lists were written and read (D-3.8); a zone started with `CHAT=off` passes nothing on and keeps nothing. Nothing limits talk by age band (D-3.9, the founder; not yet read by counsel).
- **The Estúdio** (Task 3.8, Rule 16). Staff are not players: their accounts are in `staff`, made only from the server, and a staff token opens no player route as a player's opens no staff one. Sign-in is an address and a password kept as a salted scrypt hash, five tries a minute from an address, the same answer and the same time for a wrong password and an unknown address; a session lasts twelve hours, is not kept alive by use, and only its hash is kept. **There is no second factor yet (D-3.11).** Every staff route names the roles that may call it, and `declare` will not build one that names none; the platform admin may do what any role may. A player is read only with a reason, which is written to the audit log before the answer is given; what is done to a player (mute, suspend, ban, kick, and lifting one) is written with its audit row in one transaction, so neither happens without the other. What staff are shown of a player is the BI, where they are, what was done to them and their last lines: never how they saved their BI, their devices or their sessions. The Estúdio keeps its token for the tab only.
- **Another player's BI** is asked by its number and shows what a card shows: name, number, bairro, day of arrival. Nothing else of a player can be asked by another. *(Since 4B.2 the card also says where the one looking stands to them: kambas, an ask either way, or nothing. That is the looker's own, not the other's.)*
- **The tables (Task 4B.1).** The zone seats, deals, rolls and judges every move; a phone asks and is answered. A finished game is written by the zone straight to the database (`recordPartida`, one transaction holding the players' rows), never by a phone or through a route; the points are counted there (`packages/games/src/classificacao.ts`). The ranking route takes a game and a bairro and answers names and points, never a player's id.
- **Fome and Energia (Task 4.4).** The zone alone keeps and writes them; a phone is told them and never says them. The run and the jump of a player too tired are let go by the zone whatever the phone sends. Eating is asked of the zone by a thing's name: it must be one of the catalogue's that is eaten or drunk in the street, and carried; the thing and what it gives are written together.
- **Kambas (Task 4B.2).** A kamba is made only by a yes from the one asked, or by two asks crossing; anyone shut out by either side can neither ask nor write, and blocking ends a kamba. **Where a player stands is told only to their kambas**, only while they play, and from the zone's own note of where they are (never the phone's word); no answer carries another player's id. Messages pass only between kambas and through the API, which tidies them and applies the street's word list and its refusal of addresses to elsewhere; they are kept thirty days and a report copies what the reported player wrote the reporter. A player of 15 to 17 and an adult are not made kambas (D-4.17, proposed).
- A line that falls without a word keeps its player's body in the channel for sixty seconds, and only its own player can come back to it (by a ticket from the API, which knows who is asking). A body kept is a place taken: at the most one a player, for a minute.
- The zone's `/health` says how many are in each channel and how long its steps take. It names nobody. It should not be reachable from outside where that count is thought private.

**2b. Age (Task 2.6).** The year of birth is typed on the phone and never sent: the client works out the band with the rule it shares with the API and sends the band. It is self-declared either way; what is gained is that the server never holds a year of birth. Nobody under 15 is given an account, and nothing of them is stored on the phone or the server.

**2c. What the server decides for a player (Task 2.3).**
- **The look:** the client proposes it; the API records it only when every part is in the catalogue both read (`packages/protocol/src/look.ts`), and refuses it whole otherwise. A look read back is checked again, so a wardrobe that has changed cannot hand out what no longer exists.
- **The name:** its shape is a rule both sides share (`packages/protocol/src/name.ts`); the server alone says whether it is reserved, whether the filter objects, and whether it is taken. Uniqueness is an index on the plain form of the name, so two requests at the same instant cannot both win. A name reaches a page only as text, never as markup.
- **The card of origin:** dealt by the server with its own dice (`crypto.randomInt`), once a player, inside a transaction that holds the player's row; a trigger refuses to rewrite a card. The Makuta on it is a record, not money, until the ledger pays it (Task 4.1). The client keeps a copy to show with no network; nothing reads that copy as truth.

**2d. What a player may ask of their own data (Task 2.6).** Their consents (analytics and notifications, off until a yes; playing itself is agreed to by coming in and ended by deleting), everything kept of them as a file, and deletion. Deletion needs the player's own BI number in the request, so that a request sent by mistake or by another page deletes nobody; it runs in one transaction, ends every session, and is written to the audit log, as an export is. The row stays, emptied, so the ledger stays whole and becomes anonymous.

**2e. Saving the BI with a phone number (Task 2.2). Switched off (`PHONE_CODES`, D-2.11): nobody pays a provider to send the codes, the three routes refuse, and the game does not offer it.**
- A one-time code: six digits from the server's dice, kept only as a keyed hash bound to the number, alive ten minutes, used once, dead after five tries. Every try is counted in a statement of its own, so a refusal later in the request cannot give the try back.
- A number is sent at most three codes in a quarter of an hour, wherever they are asked from, on top of the limit by address: each code costs money and rings a stranger's phone.
- Asking for a code answers the same for every number. Whether a number has an account is said only to someone who has given a right code for it.
- The number itself is stored encrypted (AES-256-GCM, bound to its column) and as a keyed hash for finding the account; it is on no phone and in no answer of the API.
- Signing in ends every other session of the player (one active session; the newer wins).

**2f. Saving the BI with an email address and a password (Task 2.2, D-2.10).**
- The password is stretched with scrypt (2^15 blocks of 8, a salt of its own) and only the result is kept; a wrong guess costs the server the same work whether or not the address has an account.
- A wrong password and an unknown address get the same answer, `wrong_login`.
- Five wrong guesses close the account to guessing for fifteen minutes, counted on the account itself, whatever address they come from; the limit by address is on top.
- The address is kept encrypted and as a keyed hash, never in the clear; neither it nor the password stays on the phone.
- **The address is proved** by a six-digit code sent to it and typed back (hashed, ten minutes, five tries, three letters a quarter of an hour an address, as codes to a number are). Until it is, the BI says so; an unproved address still opens the account with its password.
- **A forgotten password:** a code to the address, then a new password with it. Asking answers the same for any address, and does not wait for the letter, so neither the answer nor its timing says whether the address has a BI. Whoever has the code has the mailbox: the reset proves the address, ends every session and opens one here.
- **A password changed** needs the old one (wrong tries count toward the same lock); every other session ends.
- **Mail** goes through Resend with a key that is read from the environment, sent in one header, and never logged; without a key letters are printed on the API's console, which is right for development only. A letter that cannot be sent never undoes what was asked for and is never the player's to hear about.
- **Still true:** saving with an address that already has a BI says so. Hiding that would mean accepting the save and saying so only by mail; it is a small leak of who plays, accepted for now.

**3. Personal data (Task 0.10).** Fields that identify a person are encrypted with AES-256-GCM under a rotating keyring, bound to their column; phone numbers and device ids are matched by keyed hash. A guest has none.

## Known gaps

- Rate limits are counted in the memory of one API process. More than one process needs them in Redis (finding F-111).
- No idempotency keys yet: they arrive with the first route that moves Makuta (Phase 4), and no such route exists.
- **A card can be rerolled by someone determined:** the card belongs to the device's first guest, but a device is known only by the id it gives itself, and wiping the browser makes a new one (finding F-114).
- The API is reached at `/api` on the game's own address (a proxy in development and in the browser tests), so there is no cross-origin policy to get wrong; production must keep it so (Phase 14).
- **Sending codes is public and will cost money** once a real sender is behind it: the limits by address and by number are in the memory of one process and one table. Before a real provider is switched on: a global ceiling a day, an alarm on it, and the limits in Redis (F-111).
- **Whether a name is taken can be asked** by any player, ninety times a minute: names are public, but the list of them can be walked slowly.
- No transport security in development; production terminates TLS in front of the API (Phase 14).
- The service worker caches only same-origin GETs and passes anything under `/api/` straight to the network; when API answers become cacheable this must be revisited.
