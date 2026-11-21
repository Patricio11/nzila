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

**D-6.6 The seat on the candongueiro is the cheapest ride (delegated; the founder: "you should handle this", 2026-11-21).** The candongueiro is 200 Mk, the founder's anchor (a corrida in Luanda costs 200 Kz, D-0.9). The moto-táxi was 200 too: a ride to the door, alone and at once, for the price of a shared seat on a fixed line, so nobody had a reason to wait at a paragem, and the van is where people sit together. The founder's ladder of 2026-11-20 (200, 250, 300) keeps its steps, fifty higher: **moto-táxi 250, kupapata 300, táxi 350**. The crossing between bairros stays 300. They are tunables: the Estúdio changes them without a release.

## Open questions

- **Q1 What a corrida costs and when it is paid.** `fares.candongueiroLocal` is 200 Mk. Paid on boarding, to the cobrador, through the ledger (the `fare` sink); a player who cannot pay is not let on ("Não tens para a corrida"). *Recommendation: yes; the founder's to confirm the price.*
- **Q2 The moto-táxi and the kupapata: what each costs and how fast.** *(**Settled by the founder, 2026-11-20: moto-táxi 200 Mk, kupapata 250 Mk, táxi 300 Mk** (500, 400 and 1 500 were proposed, agreed, then lowered the same day). In the live tunables, version 7; D-6.5.)* The roadmap: the moto-táxi quick and for one, the kupapata slower and for two or for a load, the táxi dear and door to door. *Proposed: moto-táxi 500 Mk inside a district, kupapata 400 Mk, táxi 1 500 Mk; in tunables. The founder's.*
- **Q3 Where a ride is hailed.** At corners where moto-taxistas wait (a place in the pack, as the biscatos are, by the paragens, D-4.23), and from the Telemóvel anywhere. *Recommendation: both; the Telemóvel's call takes longer to come.*
- **Q4 The first vehicle a player can own**, and its price: a motorizada? A car is far beyond a first hour (`ECONOMY.md` §6). *The founder's.*
- **Q5 Driving under 18.** *Recommendation: no carta and no driving under 18, as in Angola; a player of 15 to 17 rides.*

## Decisions

**D-6.1 A ride is the zone's, and happens on the road (delegated).** A hired rider comes to the player along the road network the vans use, the player climbs on (seated, seen by everyone), and the ride goes along the road to where it was asked; the price is paid through the ledger when it starts. No menu moves a player (the roadmap: "every journey happens in the world"). *Recommendation: yes.*

**D-6.2 The fare is paid on boarding (delegated).** Through the ledger, to the `fare` sink, once a ride (the boarding's key); the cobrador's call says it. The first hour then costs its corridas, and `primeiraHora` gains them. *Recommendation: yes.*

**D-6.3 A van is its own room for talk (delegated).** What is said inside is heard by everyone inside and nobody outside (UX_UI_SPEC.md §3.3). *Recommendation: yes; the zone already knows who sits in which van.*

**D-6.4 Driving runs on the shared vehicle simulation, decided by the zone (delegated).** The phone proposes steering and pedals as it proposes a stick today; the zone drives. *Recommendation: yes.*

**D-6.5 A ride asked for from the Telemóvel (6.2's first line, built 2026-11-20).** In the Mapa a place is touched, and under *Marcar* the three rides are offered with what each costs now: *De moto-táxi · 200 Mk*, *De kupapata · 250 Mk*, *De táxi · 300 Mk* (`fares` in the live tunables, the founder's prices, Q2). The path is the biscatos' (D-4.22): **the API takes the fare** through the ledger to the `fare` sink when it is asked (once a ride, its id the key) and leaves a note in presence; **the zone gives the ride** on that note: it plans along the road cells (`@nzila/world/estrada`, 1 m cells, then straightened into as few legs as stay on the road), sends it from 90 m along the road, and tells every phone in the channel each ride's way, speed and starting moment on its own clock, so that every phone draws the same moto in the same place. It waits 45 s at the kerb nearest the player; the gold button says *Apanhar* within reach; seated behind the mototaxista (the kupapata's bench, the táxi's back seat), the player is carried by the zone along the road and set down on the pavement by the place asked (*Chegaste.*), or wherever *Descer aqui* is pressed. Called off before getting on, or with no road there, the fare comes back by a reversal in the ledger, once, on the zone's note. A chip under the wallet says where the ride is. The stick does nothing on the way. **This settles D-6.2 for hired rides: they are paid when asked, not on boarding.** Moto-táxi 9 m/s, kupapata 6,5, táxi 8 (`apps/zone/src/corridas.ts`). Left for the rest of 6.2: F-248 and F-249.

*Founder, 2026-11-20: the prices first agreed as proposed, then "make it 200 Mk, 250 Mk, and táxi 300 Mk". I agree a ride nobody gets on: if the player doesn't come within 45 s" (it goes, and the fare is kept). "A player who is a táxi driver or has a car or bought a bike, they can drive."* So the prices are 200, 250 and 300 Mk, a ride not got on in 45 s keeps its fare, and the NPC rider is the stand-in for players: when 6.3, 6.4 and 6.6 are built, a player who owns a motorizada, a kupapata or a car and has set themselves available is offered a call nearby before an NPC rider is sent (an NPC still comes when no player takes it, so a call is never left unanswered), and a player may drive their own vehicle wherever they like instead of hiring one.

## What "done" means for this phase

From the roadmap: the three ways of getting around are a real choice of price, speed and comfort; a player can own, drive and lose a vehicle; the carta is earned; a shift of driving pays as a biscato does. Measured: a full van's riders on a slow network, and a car's frame time on the reference phone.
