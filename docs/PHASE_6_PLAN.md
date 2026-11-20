# Phase 6 plan: Getting around

*Goal (roadmap): Luanda moves the way Luanda moves.*

Opened 2026-11-20, when Phase 4 completed (`docs/completed/PHASE_4_COMPLETE.md`). **Its first line is built before the rest, and before Phase 5**: the founder's order after Phase 4 (D-4.8 to D-4.10) brings forward the things players do together, and hailing a kupapata or a táxi is the first of them (6.2). Then *Convidar para sair* and giving a gift (10.13, for players of 18 or over), then the second bairro, Zango (11.1, 11.2), then the alpha (4B).

## The recheck: what each task depends on

| Task | Depends on | State |
|---|---|---|
| 6.1 The candongueiro network | 1.6, 4.1 | Both met. **Much of it exists**: the vans keep a timetable the zone and every phone agree on; boarding, a seat and getting off are the zone's (F-157), and everyone near sees who rides; the route band and the cobrador's calls (D-4.21). Left: **the fare through the ledger** (rides are free today, and the first hour of `ECONOMY.md` §6 has no fare for that reason), the van as its own room for talk, the cobrador collecting |
| 6.2 Kupapata and táxi | 6.1 | **Brought forward (D-4.8).** Its first line can be built on what 6.1 has: an NPC rider who comes to the player, and a ride along the road |
| 6.3 Owning a vehicle | 4.2 | 4.2 is met. Not begun: vehicles as things held, bought from a stand and from players |
| 6.4 Driving | 0.2, 6.3, 3.3 | `packages/sim/src/vehicle.ts` exists (Phase 0) and nothing drives it yet |
| 6.5 The carta de condução | 6.4 | |
| 6.6 Driving for a living | 4.5, 6.1, 6.2, 6.5 | The biscatos' path (D-4.22) is the pattern for a shift |
| 6.7 Wiring, verification, doc convention | 6.1 to 6.6 | |

## Open questions

- **Q1 What a corrida costs and when it is paid.** `fares.candongueiroLocal` is 200 Mk. Paid on boarding, to the cobrador, through the ledger (the `fare` sink); a player who cannot pay is not let on ("Não tens para a corrida"). *Recommendation: yes; the founder's to confirm the price.*
- **Q2 The moto-táxi and the kupapata: what each costs and how fast.** The roadmap: the moto-táxi quick and for one, the kupapata slower and for two or for a load, the táxi dear and door to door. *Proposed: moto-táxi 500 Mk inside a district, kupapata 400 Mk, táxi 1 500 Mk; in tunables. The founder's.*
- **Q3 Where a ride is hailed.** At corners where moto-taxistas wait (a place in the pack, as the biscatos are, by the paragens, D-4.23), and from the Telemóvel anywhere. *Recommendation: both; the Telemóvel's call takes longer to come.*
- **Q4 The first vehicle a player can own**, and its price: a motorizada? A car is far beyond a first hour (`ECONOMY.md` §6). *The founder's.*
- **Q5 Driving under 18.** *Recommendation: no carta and no driving under 18, as in Angola; a player of 15 to 17 rides.*

## Decisions

**D-6.1 A ride is the zone's, and happens on the road (delegated).** A hired rider comes to the player along the road network the vans use, the player climbs on (seated, seen by everyone), and the ride goes along the road to where it was asked; the price is paid through the ledger when it starts. No menu moves a player (the roadmap: "every journey happens in the world"). *Recommendation: yes.*

**D-6.2 The fare is paid on boarding (delegated).** Through the ledger, to the `fare` sink, once a ride (the boarding's key); the cobrador's call says it. The first hour then costs its corridas, and `primeiraHora` gains them. *Recommendation: yes.*

**D-6.3 A van is its own room for talk (delegated).** What is said inside is heard by everyone inside and nobody outside (UX_UI_SPEC.md §3.3). *Recommendation: yes; the zone already knows who sits in which van.*

**D-6.4 Driving runs on the shared vehicle simulation, decided by the zone (delegated).** The phone proposes steering and pedals as it proposes a stick today; the zone drives. *Recommendation: yes.*

## What "done" means for this phase

From the roadmap: the three ways of getting around are a real choice of price, speed and comfort; a player can own, drive and lose a vehicle; the carta is earned; a shift of driving pays as a biscato does. Measured: a full van's riders on a slow network, and a car's frame time on the reference phone.
