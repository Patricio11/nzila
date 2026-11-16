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

**The founder on 2026-11-15:** D-2.4 (our own guest sessions) and Q3 (the card is drawn now, paid when the ledger has its API) stand. The words of the look chooser and the Telemóvel are good.

**D-2.5 The year of birth stays on the phone (delegated, 2026-11-15).** The age question is asked on the front door's way in, before the look chooser (Q5). The year is typed on the game's own keys and never leaves the device: the client works out the band with the rule it shares with the API (`packages/protocol/src/age.ts`) and only the band is sent and stored. Whoever turns 15 this year may play; someone counts as 18 or over only when they are 18 whatever the month (the year alone cannot say whether the birthday has passed, and the adult band opens staked tables and namoro). Under 15: turned away kindly, nothing kept on the phone, nothing sent, and the door stays shut for that visit. *Recommendation: yes.*

**D-2.6 The table of origins, first draft (founder's direction, 2026-11-15: "father conselheiro do Presidente, mother ministra is a rich family; father mecânico, mother zungueira").** Seventeen families in four ways of living, in `packages/economy/tunables/origins.json`, for the founder to change:

| How they live | Share | Starts with | Families (father, mother; bairro) |
|---|---|---|---|
| No aperto | 64% | 1.500 to 4.000 Mk | mecânico, zungueira (Cazenga) · motorista de candongueiro, quitandeira (Rangel) · pedreiro, lavadeira (Viana) · roboteiro, zungueira (Zango) · guarda, empregada doméstica (Sambizanga) · pescador, peixeira (Ilha) · kupapata, kínguila (Palanca) |
| Remediados | 27% | 4.500 to 10.000 Mk | professor, enfermeira (Prenda) · polícia, costureira (Golf 2) · funcionário público, professora (Vila Alice) · camionista, cabeleireira (Benfica) |
| Bem na vida | 8% | 15.000 to 50.000 Mk | engenheiro de petróleos, médica (Kilamba) · bancário, advogada (Maianga) · comerciante, empresária (Kilamba, Talatona) |
| Berço de ouro | 1% | 250.000 Mk | conselheiro do Presidente, ministra (Talatona) · general, deputada (Talatona) · embaixador, juíza (Maianga) |

Amounts fall on steps of 500. The province the family came from is drawn apart (Luanda three in ten, the other twenty by rough weight). Each family has a line on its card, written to be screenshotted. The average start is about 8.800 Mk a player, against the flat 25.000 it replaces. A family leaves the deal by a weight of nothing and is never deleted, so a card dealt once can always be read. No office on a card names a real person. **For the founder:** the shares, the amounts, the families, the bairros, and every line on a card.

**D-2.7 No rerolls, as far as a device can be known (delegated).** The server deals the card with its own dice, once a player; the database refuses to rewrite one. A second guest made on a device that already has one is dealt the first one's card. A device id is only what a phone says of itself, so a player who wipes the browser's storage is a new device and gets a new draw: closing that needs something that costs to replace (a linked phone number, Task 2.2), and the guest limit per address slows it meanwhile (finding F-114). *Recommendation: accept for guests.*

**D-2.8 Names and the BI number (delegated, 2026-11-15; Q4).** A name is 3 to 16 characters: Latin letters with their accents, digits after the first letter, single spaces, hyphens or apostrophes between. Two names are the same name when they differ only by case, accents or separators. The game keeps some for itself (anything containing "nzila", "admin", "moderador", "suporte", "equipa", "oficial"), and the chat filter's word lists apply. **A guest arrives named "Caluanda" and the number of their BI** ("Caluanda 1042"), and may change the name once for nothing, in the BI app, where the server says while it is typed whether it can be had; a correction of the same name (an accent, a capital) is not a change. What a later change costs is for Phase 4 to set; until then there is none. **The BI number is the order of arrival** ("00001042-LA", from 1001): whoever came first holds the lowest, which is worth something to the first players, and tells anyone who looks how many players there have been. **For the founder:** "Caluanda" as the arrival name; whether the count of players may be read off a BI.

**D-2.9 Linking: the phone number first, the rest when the founder has opened the accounts (delegated, 2026-11-15; Q1, Q2).** Built without Better Auth: saving a BI is two routes and a table of hashed codes on top of the sessions we already have, and the player's id never moves. A code is six digits, lives ten minutes, answers five tries, and a number is sent three in a quarter of an hour whoever asks. Asking for a code says nothing about whether the number has an account. **A guest who proves a number that already has an account** is told so (only after a right code) and chooses: go into that account, leaving the guest behind, or stay. **One active session a player:** signing in ends every older session. **Waiting on the founder:** (1) the provider that sends the code to Angolan numbers, WhatsApp first, on delivery and price: until then the code is printed on the API's console and no real number can be used; (2) a Google sign-in client and (3) a sender of email, each of which needs an account opened in the company's name. Better Auth is worth another look when Google is added, for the OAuth dance alone.

**D-2.10 An email address and a password, the ordinary way (founder, 2026-11-15: "Google and email sign-in we can leave for now; we can use normal signup and login, can use email").** Beside the phone number, a BI is saved with an email address and a password, and opened on another phone with them. Nothing is sent to the address, so it waits on no provider. The password is at least 8 characters, with no rule about capitals or signs (length is what counts), and may not be the address itself or one of the first things anyone tries; it is kept only as a salted scrypt hash, and the address only encrypted and as a keyed hash. A wrong password and an address nobody has are answered the same; five wrong guesses close an account to guessing for a quarter of an hour. **What this cannot do until email can be sent:** prove the address is the player's own, or send a forgotten password anywhere: a player who forgets it and saved no phone number has lost the way back (finding F-140). Google sign-in is left, by the founder's word.

## What "done" means for this phase

From the roadmap, Task 2.7: a guest upgraded on one device appears whole on another; deletion removes personal data and keeps anonymous ledger rows; every route is guarded, and a test fails the build on one that is not.
