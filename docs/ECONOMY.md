# The economy of Nzila

*For whoever changes a price, a pay or a cap, and for whoever is asked why the money looks the way it does. Written 2026-11-20, with Phase 4 (Tasks 4.1 to 4.6). What a Makuta is and what it buys: D-0.9, "a Makuta buys what a kwanza buys".*

## 1. The one rule

**No Makuta moves outside the ledger.** Every Makuta a player holds was paid out by a **faucet** (a system account whose balance runs negative) through a transfer recorded in `ledger_transfers`, and every Makuta that leaves the game goes into a **sink**. Every transfer has an idempotency key (`action_id`): the same action sent twice moves money once. The sum of every balance is zero, always; a worker proves it every night (`nightlyLedgerAudit`), and the Estúdio's Registo says when it was last proved. If it ever does not balance, the platform admins get an email and nobody touches money until someone knows why.

The phone never names an amount. **The client proposes, the zone decides, the API records** (D-4.2): the zone says where a player stands and what a round scored; the API reads the price or the pay from the rules, and writes the transfer.

## 2. Where Makuta comes from (the faucets)

Named in `packages/economy/src/accounts.ts` (`FAUCETS`). The Estúdio's Economia page shows each one's day.

| Faucet | Pays | Where the number lives |
|---|---|---|
| `grant` | The card of origin: what a family gives someone new (once) | `tunables/origins.json`, the floor in `base.json` (`player.startingFloor`) |
| `family` | The family's money for the taxi, once a day | `tunables/recados.json` (`familia`) |
| `errand` | Os recados do dia, less for each after the first; the errand for two | `tunables/recados.json` (`pay`, `aDois`) |
| `wage` | Biscatos (4.5), by score, with the day's taper; later, shifts | `tunables/biscatos.json` |
| `npc_customer`, `insurance_payout` | Not built yet (later phases) | |

The biscatos' taper is the economy's main brake: a day's biscatos pay in full up to 2 000 Mk, half to 4 000, a quarter after. It never stops: a player who wants to keep working always can, for less (`taperPercent`).

## 3. Where Makuta goes (the sinks)

`SINKS` in `accounts.ts`. Built so far: **`npc_shop`** (the cantina's grille, `tunables/shops.json`), **`hospital`** (the bill when Energia runs out, `needs.hospitalBill`, never more than the player has: D-4.20), **`fee`** (the house's cut of a staked table, `stakes.houseCutPermille`). Fares, rent, fuel, fines and the rest arrive with their phases.

## 4. The numbers, and how to change one

There are two kinds of numbers.

**The tunables** (`packages/economy/tunables/base.json`, checked by `tunables.ts`): fares, the caps on handing money over, stakes, Fome and Energia, crime, heat, channels. **These are live** (D-4.24):

1. They are kept in the database, version after version (`tunables_versions`): the file is the first, and every change made in the Estúdio is the next, whole, with who made it, when and why. Nothing is ever deleted.
2. A change is made in the **Estúdio, Afinar** (staff with the `economy` role). Change the numbers; **Ver o que muda** shows exactly which numbers change, from what to what, and anything the rules refuse (a range, or a rule between numbers, such as "a new account may not send more than an established one"); then a reason, and **Guardar**. The audit log records it.
3. The zone and the API look for a new version every quarter of a minute: **a change is in play everywhere within half a minute**, with no restart. A version the code cannot read as valid is never played; the last good one stays.
4. **One exception:** `channels.cap` (how many a channel holds) is read by a zone when it starts. A change to it takes effect as each zone restarts.
5. When a developer adds a tunable, the file gives its number to every older version until someone changes it. When a developer raises the file's `version` above every recorded one, the file wins: they meant it to.

**The other rules files** (`items.json`, `shops.json`, `origins.json`, `recados.json`, `biscatos.json`) ship with the code. A change to a price, a pay or the taper is a code change: edit the file, run the gate (each file is checked as it loads, and the economy's tests run), and deploy. Making these live as well is recorded in `FINDINGS.md` (F-245).

**Before changing anything, look at the Economia page.** A good change is small, has a reason a colleague would agree with, and is watched for a day afterwards.

## 5. Reading the economy (the Estúdio, Economia)

For the `economy` and `live_ops` roles. Looking is written to the audit log, because it names players.

- **Dinheiro dos jogadores:** everything in players' Carteiras and in the Banco, and how many players hold any.
- **O que tem o jogador do meio:** the median of what one player holds. If the total grows and the median does not, a few players are getting rich.
- **Entrou e saiu, dia a dia:** what the faucets paid in and the sinks took out, the last 14 days, by the day in Luanda. Today by faucet and by sink, by name.
- **Quem ganhou mais nas últimas 24 horas:** the players whose holdings grew most from outside themselves (the Banco is not a gain). **This is the first sign of an exploit:** a player who gained ten times the next is looked at (staff with Jogadores open them there, with a reason).

## 6. What a first hour earns and costs

Written out by `primeiraHora` (`packages/economy/src/primeira-hora.ts`, from the rules files, so these numbers move when the rules do) and **checked against a session played through the API's routes** as a phone plays it (`apps/api/src/api.integration.test.ts`, "a new player's first hour"): the card, the taxi money, the day's three errands done as the street does them, a round of each biscato, a meal; the Carteira and the Banco together end exactly where the written hour says. Q4 of `PHASE_4_PLAN.md`: the founder's to change.

The hour: the family's card; the money for the taxi; the three errands (300, 250 and 200 Mk; one that asks for a pão costs 50 Mk at the cantina); one round of each biscato at a middling score (lavar pratos and zunga at 600 points, levar carga and lavar carros at 500); two pães, a gasosa and a water (450 Mk).

| The family | The card | Taxi money | Errands | Biscatos | Spent | **Holds after an hour** |
|---|---|---|---|---|---|---|
| Aperto (a card of 1 500 to 4 000; say 2 500) | 2 500 | 200 | 750 | 1 460 | 500 | **4 410** |
| Remediado (4 500 to 10 000; say 7 000) | 7 000 | 400 | 750 | 1 460 | 500 | **9 110** |
| Bem (15 000 to 50 000; say 15 000) | 15 000 | 1 000 | 750 | 1 460 | 500 | **17 710** |
| Ouro (250 000) | 250 000 | 3 000 | 750 | 1 460 | 500 | **254 710** |

**What it says.** An hour of play earns about 2 400 Mk beyond the card and the taxi money, the same for everyone, and costs 500: **money piles up**, because the sinks that matter (rent, Phase 5; fares through the ledger, Phase 6; fuel, fines) are not built yet. When they are, an hour's rent and fares should take roughly what an hour's work brings, so that a player who works keeps a little, and one who does not falls behind. The day's taper on biscatos (§2) is what stops a long session from printing money meanwhile. The cards set the gap between families, and a family of means keeps it: that is intended (D-0.44), and Phase 7 is where it can be lost.

**A played session by a person** (the founder's phone, a real hour) is the check that matters most, and is to be done with Phase 4B's alpha: it says whether an hour feels like this one.
