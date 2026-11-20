# Phase 4: Economy core. Complete

Opened 2026-11-17, complete 2026-11-20. **A player can earn, hold, bank and spend Makuta, and the books always balance.** Every check the roadmap sets for the phase is met (below). Lines that wait on later phases are carried by name, with the phase that closes each. What a person feels in a played hour is not yet known: that is the alpha's (Phase 4B).

## What exists

- **Everyone registers** (4.0, D-4.12): an address and a password at the door; the address is proved later, and must be before a player sends Makuta (D-4.11) or asks someone out.
- **The ledger, live** (4.1): every Makuta is a row in `ledger_transfers` with an idempotency key, from a faucet or to a sink; balances are cached and proved every night, and an alarm mails the platform admins if they ever do not sum to zero. **The Carteira** (on you, at risk) and **the Banco** (safe), moved only at a caixa; **Dar Makuta** and **Dar uma coisa** to someone beside you, never from an account of the same phone, never from an account too new.
- **Things and the Mochila** (4.2): the catalogue in data, what each player holds and where, the carry limit.
- **The cantina's grille** (4.3): the dona greets by the hour, the basket is priced on the gold button, a receipt prints, the cartão da casa fills a stamp a day. On the Largo and in the rehearsal town.
- **Fome and Energia** (4.4), kept by the zone: worn by time and by effort (too tired, no running and no jumping), eaten from the Mochila, rested on a bench (which the zone now seats, so everyone sees it, F-205) or in a van; at zero, the hospital: a fade, a small bill on a receipt that never makes a debt (D-4.20), back on one's feet. Hungry, the street names the nearest cantina and the compass points to it.
- **The four biscatos** (4.5, D-4.22): lavar pratos, levar carga, zunga, lavar carros, each at a place in the street by its gold button, each a 75 to 90 second minigame drawn by the phone, scored by the zone from what the thumb did (`@nzila/sim`), paid by the API from the `wage` faucet with a daily taper. The Biscatos app lists what is open nearby.
- **The numbers, live** (4.6, D-4.24): every tunable version kept whole with who, when and why; the zone and the API take a new one up within half a minute; the Estúdio's **Afinar** previews and keeps a change with a reason; **Economia** shows the money at a glance and the day's top gainers. `docs/ECONOMY.md`.
- **Os recados do dia** (4.6b): three errands a day from the neighbours, the family's money for the taxi, the errand for two, the evenings without light, the festa's count.
- Built ahead of their order at the founder's word (D-4.14), in Phase 4B: **the tables** (xadrez, damas as in Luanda, Não te irrites, with the kotas, watching, invitations, the quick game and the ranking) and **kambas**.
- In the street, from the founder's looks along the way: **the van's route band** keeps out of the view (a chip under the wallet, the band down at the paragens, D-4.21).

## What was verified, and how

| Asked by the roadmap | Shown |
|---|---|
| The ledger sums to zero after a fuzz of 10 000 transfers | `packages/db/src/db.integration.test.ts`: 10 000 transfers between 20 people and a faucet, eight at a time against the real database; every balance non-negative, the audit ok and zero. Runs in every gate |
| A replayed purchase charges once | `apps/api/src/api.integration.test.ts`: a cantina basket sent twice with one key is bought once, one receipt, one transfer; the same for a deposit, a gift, an errand, a hospital stay and a biscato's pay |
| No Makuta literal in code | `packages/ui/src/money-rules.test.ts` reads the game's code and fails on any amount written in it (a name of money given a number, or Makuta in text): every price and pay comes from the rules files and the ledger. None found |
| A new player's first hour, written out and checked against a played session | `primeiraHora` writes it from the rules files (`docs/ECONOMY.md` §6); an API test plays the same hour through the routes as a phone would (the card, the taxi money, the three errands done as the street does them, four biscatos, a meal) and ends exactly where the written hour says |

The gate (`pnpm test:all`) holds the rest: 681 unit tests (the economy, the protocol, the simulation and the games at 100% coverage), 816 engine tests, 159 integration tests against a real PostgreSQL, Redis and sockets, and 122 browser tests on two phones, among them each biscato played and paid, the hospital, the ride's band, the Estúdio changing a number and seeing it in play.

## What was deferred, and why

- **Selling, market stalls, clothes shops** (4.3): with the market's art and Phase 8's businesses; the cantina's inside with the interiors (5.1).
- **A centro médico in every município** (4.4, F-234): the zone takes a player to the place whose name begins `hospital` or `centro-medico`, and no pack has one yet; Josina Machel for L1 (D-4.19) is an art task.
- **The pescador** (4.5): fishing is not allowed on the Marginal (D-0.47); the biscato waits for the Ilha.
- **No free interest** (4.1): the bank pays only what it took in on loans, so not until credit exists (Phase 8B).
- **`POST /ledger/transfer`** as an internal route (4.1): transfers are recorded by the API's own code paths; an internal route waits for the worker's jobs that need it (rent, wages).
- **The festa's music** (4.6b): licensed, from real people (D-0.18); the founder's.
- **The other rules files, live** (F-245): only `base.json` changes in the Estúdio; a price or a pay changes with a deploy.
- **Fares through the ledger**: rides are free until 6.1 charges them; the first hour has no fare in it for that reason.

## Measured

On the development machine, from the gate of 2026-11-20:

| What | Measured | Budget |
|---|---|---|
| The way in (everything a player downloads to walk in the street) | 299,0 KB | 300 KB |
| Marginal e Baixa, the pack | 0,81 MB at Poupança, 2,47 MB at Normal, 28 chunks, heaviest 9 130 triangles | 8 MB |
| What the phase added after the way in, each fetched when first opened | a biscato's screen 1,5 to 2 KB (its round's rules and styles once, 7 to 10 KB with the later words); the Biscatos app 1,3 KB; the needs' bars 1,9 KB; the ride's chip and band 1 KB (and its styles) | 20 KB each |
| The zone's step | not measured again: F-182 stands, it measures the laptop | 5 ms mean |

**The way in is full** (F-226): the phase paid for itself twice by moving what only later screens need out of it (the route band, the later components' styles: 1,9 KB in all). What comes next needs the founder's typeface decision (Waiting item 23) or more of the same.

## Waiting on the founder

1. **A played hour on a real phone**, with `docs/ECONOMY.md` §6 beside it: does an hour feel like that one, and does a biscato pay what it feels it should (Q4)?
2. **The typeface cut to one weight** (Waiting item 23, F-226): about 17 KB of room on the way in.
3. **A look at the four biscatos' places in Marginal e Baixa** (Tia Bela's kiosk, the carrinhos and the lavadores either side of the Mutamba paragem, the kitandeiras on the promenade): placed from the map, not yet seen there.
4. **Prices read by someone from Luanda** (Q3): the cantina's list and what each biscato pays.
5. Carried: the festa's music (D-0.18), kambas across the 18 line (item 21), where the Largo 1º de Maio belongs (item 22).
