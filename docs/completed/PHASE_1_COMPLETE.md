# Phase 1: Primeiro Passeio. Built, and not yet proven on a phone

**Tasks 1.1 to 1.8 built by 2026-11-15; Phase 2 opens under D-1.6.** Goal of the phase: on a real cheap phone, open a link and within a minute walk the Marginal of Luanda at golden hour, ride a candongueiro, see the bay, open the Telemóvel. No server.

**This phase is not finished in the roadmap's sense.** Task 1.9 asks for two things only the founder can do, and neither has been done: the measurement on the reference phones, and the look test with five Luandans. He ruled (D-1.6) that Phase 2 may open once 1.1 to 1.8 are built, with those two recorded as open and nothing shown to the public (Phase 4B) before both. This document is that record. The phase header in `ROADMAP.md` is marked built, not complete.

## What exists

| Task | What exists |
|---|---|
| 1.1 Renderer | Three.js behind `render/world-renderer.ts`: the Hora Dourada light for any second of the day, sky, bay, shadows, three quality tiers with dynamic resolution, one palette material for the whole world. It waits out a lost graphics context and draws again. |
| 1.2 Streaming | Chunks streamed round the player with two levels of detail; every byte counted by the data meter. |
| 1.3 The avatar | Bodies, a skeleton of 17 bones, and all movement made by us as code: walk, run, jump (D-0.45), sit, five gestures with a kuduro keyed from the founder's films. **The wardrobe and the look chooser** (`/provador`): body, skin, ten ways of wearing hair in six colours, each piece of clothing and its colour, brincos, óculos, boné, barba, bigode, height and build. A light body (a fifth of the triangles) for the far side of the street. |
| 1.4 Controls and HUD | Floating joystick for either hand, camera drag, the gold context action, run, jump, gestures, the Telemóvel button, wallet, compass, clock, chat bar (asleep until 3.5); keyboard and mouse. |
| 1.5 District L1 | **Marginal e Baixa**, 448 m by 256 m, made by `art/scripts/make_l1.py` from the founder's photographs: the promenade, the avenue, the Baixa's streets with their real names on plates, the Largo da Mutamba, the fortress, the pink building and the Palácio de Ferro at art pass 2, the viaduct with its painted bank and the market in its shade, the mural, the national flag where it flies. 2,24 MB at Normal, 0,76 MB at Poupança (budget 8). |
| 1.6 Ambient life | People on timetables the pack carries, the same on every phone: walkers, zungueiras (one with a baby on her back), sellers seated with their bacias, the man who fishes and the officer who runs him off (D-0.47), the zungueira run off from before the pink building (D-0.49). The candongueiro, a car in four colours, the kupapata and the moto-táxi, made by us; two linhas by the clock; boarding, riding from a seat inside with the cobrador calling the paragem, lit after dark; each van's phrase on its back window. First sounds, synthesised at no cost in data. |
| 1.7 Telemóvel | The phone sheet with nine apps; Mapa (the district, paragens, places, lines, vans, you, a place marked for the compass) and Definições working; the rest say "Em breve". `WorldProvider` with `LocalWorld` behind it (S-1). |
| 1.8 Front door, PWA | The door states the megabytes before a byte is fetched and has a light door into Modo Poupança; a living postcard of the Marginal on the door and on the arriving screen; a new player chooses their look before arriving; web manifest, icons, a service worker that keeps what was fetched, the offer to install after the first ride. |

Founder's rulings taken during the phase: D-0.40 to D-0.51 in `TO_START_EVERY_SESSION.md` (everything made by us and Angolan; houses, not blocks; the three ways of being inside a home; burglary and security; starting money by family; jumping; effort and hunger cost Energia; no fishing on the Marginal; organised and unorganised paragens; the police in dark blue, the flag, where zunga is not allowed; explicit glyphs, real street names, a place's own preposition).

## What was verified, and how

`pnpm test:all` is green on the closing commit. It now also builds both packs (`pack:dev`, `pack:l1`) and checks L1 for publication.

| Step | Result |
|---|---|
| Typecheck, lint | 13 of 13; clean |
| Unit tests | 393 in 32 files; 100% of lines, branches and functions on `packages/sim`, `economy`, `protocol` |
| Engine tests | 624 passes in Chromium, WebKit and Firefox against the same golden numbers |
| Integration | 28 (PostgreSQL; Blender and KTX-Software) |
| Browser tests | 46 on the phone and iPhone profiles: the door, going in, first play, the look chooser, the walk, the HUD, the Telemóvel, the vans, a ride, the street's people, a lost context, working offline |

Every screen and every piece of the world was looked at in screenshots before it was called done (`screenshots/<task>/`, not in git), and the founder reviewed and corrected many of them in the same hours.

## Measured budgets

All on a slowed desktop browser (processor four times slower, 1,6 Mbit/s, 150 ms). **None of it on a phone.**

| Budget | Limit | Measured |
|---|---|---|
| First play, door to standing in the Marginal, look chooser included | 6 MB, 60 s | **2,63 MB, 26 s** |
| Shell | 300 KB | 253 KB |
| District at Normal / Poupança | 8 MB | 2,24 MB / 0,76 MB |
| Triangles in view at Normal | 120.000 | up to 117.000 round the Mutamba and the Palácio de Ferro: within 3% |
| Draw calls | 120 | up to 52 |
| People drawn | by tier | 9, 18 or 30, of whom 3, 6 or 10 in their whole body |

## Open, and carried into later phases

**The founder's, before anything is public (Task 1.9):**
1. The measurement on the two reference phones and one iPhone: first play, 30 fps on the bench path, input response, memory. Nothing here has run on a phone, the sound has not been heard on one, and the install offer has not been seen on one.
2. The look test: five Luandans who have never seen it name where they are without being told.

**Built in part, each with its finding in `docs/FINDINGS.md`:**
- The district (F-82): the church, the cinema, the kiosks and the far towers are still art pass 1; no commercial lot can be entered; the viaduct cannot be walked or driven.
- The crowd and the body (F-71, F-90, F-101): one face per body; the far crowd is not baked or instanced; people of the street collide with nothing and do not follow the hour of the day; skinned models skip the optimiser.
- Traffic and the ride (F-87, F-92): nobody brakes; the fare is not charged (no ledger in this phase); nobody inside the van can be spoken to; kupapatas and moto-táxis cannot be hired.
- Sound (F-108): every sound is a stand-in of noise and tones. The cobrador's call and recorded beds are owed; music needs signed licences (D-0.18, F-81).
- The triangle budget (F-62): any further detail round the Mutamba must be paid for.
- The Telemóvel (F-98), the front door and the PWA (F-99), the HUD on the styleguide (F-78).
- Movements not made: getting in and out of a vehicle, carrying.

**Waiting on the founder's ear or hand:** the words listed in F-87, F-92, F-98, F-99 and F-101; the highest starting amount and the families' shares (D-0.44); track and artist names for the music he wants on the radio.
