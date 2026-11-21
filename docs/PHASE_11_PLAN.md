# Phase 11 plan: Zango, brought forward

*Goal (roadmap): a second district, and the road between two.*

Phase 11 is not open. **Its first two tasks and a district are built now**, in the founder's order after Phase 4 (D-4.8): the second bairro is **Zango**, and the pack pipeline's hardening (11.1) and the handoff between districts (11.2) come with it. The Ilha (11.3) and the phase's own gate (11.4) keep their place.

## The recheck: what Zango stands on

| Needs | Where it is | State |
|---|---|---|
| A pack made from our own kit, checked and budgeted | `art/scripts/make_l1.py`, `tools/pack`, `pnpm pack:check` | Built for L1 (0.6, 1.5). **1.5's art pass 1 is not ticked**: Zango is made with the kit as it is, and grows it |
| Gateways in the manifest | `packages/world/src/manifest.ts` (`gateways`, a spawn of kind `gateway`) | In the schema; **no pack has one, and nothing reads them** |
| A zone that runs more than one district | `apps/zone/src/index.ts` (`ZONE_PACKS`), `e2e-server.ts` | Built (3.2): each district has its own channels |
| A seat in a channel of a named district | `POST /play/join` | Built (3.2) |
| The handoff message | `MSG.HANDOFF`, `HANDOFF_REASON.TRAVEL` in `packages/protocol` | On the wire; **nothing sends it** |
| The candongueiro, ridden with others | the vans of 1.6, riding together (F-157) | Built on the phone and seated by the zone; **6.1 (the zone's own vans, fares) is not ticked**: the ride between bairros is its own short moment (D-11.4), not a van of the street |
| A fare through the ledger | `/v1/corridas`, the fare sink | Built (6.2) |
| Where a card says one was born | `packages/economy/tunables/origins.json` (`bairros`), `player_origins.bairro` | Dealt; **everyone wakes on the Marginal** |
| What is known of Zango | `docs/reference/BAIRROS.md` §3 (Viana), `WORLD_ATLAS.md` (D-0.48: paragens not organised) | Researched 2026-11-19 |
| District ids in the code | `apps/`, `packages/` | L1's id and name are written in places (the door, tests, the client's default pack): 11.1's invariant finds them |

## Decisions

**D-11.1 Families of little money wake in Zango (founder, 2026-11-21).** Every family of the tier *aperto* (their cards say Cazenga, Rangel, Viana, Zango, Sambizanga, Ilha or Palanca) wakes in Zango until its own bairro is built; the card keeps the name of its bairro, and they are moved there when it exists. The other tiers go on waking on the Marginal. Where a player wakes is the server's word (a district id on `/play/join` from the origin), never the phone's.

**D-11.2 Between bairros by candongueiro, paid (founder, 2026-11-21).** At a paragem that is a gateway, the van to the other bairro: a fare from the Carteira through the ledger (tunable `fares.entreBairros`; *proposed 300 Mk*, a little more than a ride inside a bairro), a short ride while the other bairro's first chunks arrive with the megabytes shown, and one gets off at the paragem there. The táxi does the same, dearer, later (6.2). Someone without the fare is not stranded: the first crossing each day is on the house *(delegated; recommendation: yes, so that nobody is shut in a bairro on the day they have nothing)*.

**D-11.3 What Zango has on its first day (founder, 2026-11-21).** Rows of identical single-storey resettlement houses on 15 m plots, extended by their owners each in their own way; long straight earth streets off **one tarred road**, the only tar; a **paragem that is not organised** (a corner and a tree, vans two abreast, kupapatas and motos in their knot, D-0.48); and, the founder's list: **a mercado de rua, a campo de terra, an igreja, a chafariz, damas, a geladaria and a cantina**. The banca of things to give stands in the mercado. The cantina, the geladaria and the banca are shops as L1's are (D-10.1); the damas are tables as the Largo's (4B.1); the campo and the chafariz are places people stand at first, and games and a biscato (carrying water) later.

**D-11.4 Crossing is a gateway, not a seam (roadmap 11.2).** A pack names its gateways: a paragem, the district it leads to and where one arrives there. Crossing saves where one stood, pays, reserves a seat in a channel of the other district, and the zone sends the phone there (`HANDOFF`, reason TRAVEL); the phone shows the ride (the inside of the van, the road going by, "Zango · 1,2 MB") while the first view arrives, then stands the player at the paragem. Two who are out together (D-10.5) and cross together arrive in the same channel. Seamless borders are a Phase 18 question.

*(Found on the recheck: the invariant is already kept. `content/registry.json` is the registry, `packages/db/src/seed.ts` and `pack check` read it, and `packages/ui/src/house-rules.test.ts` fails on any id of it in `apps`, `packages` or `tools`. What 11.1 still owes is below.)*

**D-11.5 The pack says everything about its district (roadmap 11.1).** What L1 needed that was written in code moves into the manifest or the registry: which pack a district id is, its name, its places for an outing (done, D-10.4), its shops and tables (done). The invariant test `province-is-content` fails the build on a district or province id or name in `apps/` or `packages/` outside content, fixtures and the registry seed. `pack:check` grows what L1 taught: a gateway leads to a district that exists and to a spawn in it; a shop's kind has a shelf in `shops.json`; a place for an outing has its two words; every seat is reachable.

**D-11.6 There are many Zangos (founder, 2026-11-21, with two pictures).** "Zango 1, 2, 3 and so on", and Zango 8000. They are not alike:

- *The earth street by day* (his first picture): a wide street of red-brown earth, rutted, with a patch of concrete paving and a step before a barbearia with its name painted on the wall; stalls of zinc on poles with lean-to roofs; **a kiosk of block painted in the three phone companies' colours** (red, yellow, blue-green) where airtime is sold; big dark mangueiras and acácias over the roofs; one lamp post with its arm and wires sagging from pole to pole; an old car parked half on the verge; a woman walking, another seated by a red basin. Low, single-storey, lived-in. **This is the Zango that is built first** (D-11.3 describes it).
- *Zango 8000 at night, from the air* (his second): planned and tarred, **every street lit orange by sodium lamps**, three- and four-storey apartment blocks in rows, walled compounds with white light in their yards, long roofs of sheet. A different bairro to the eye: it is the next Zango when the first fills (Q3), not a variation of it.

What the pictures add to the kit: the phone-company kiosk (ours: three bands of our own colours and the word "Saldo", no company's name or mark), the barbearia's painted wall, the zinc stall on poles, sagging wires, the orange street at night (the lamp's colour is the district's, in the pack's ambient).

**D-11.7 The ball is the zone's, and anyone on the campo plays (delegated; the founder asked for things to do, 2026-11-21).** A pack names its pitches (`campos`: the edges and the width of the goals). The zone keeps one ball on each: whoever walks or runs into it kicks it the way they are going, harder the faster they go; it rolls and slows by a rule every phone shares (`packages/protocol/src/bola.ts`), so the zone speaks only at a kick, a bounce and a goal; it comes back off the edges; between the posts it is a goal for whoever kicked it last, said to everyone near ("Golo de Ana. Já são 2."), and the ball is put back in the middle. No sides, no clock, no Makuta: whoever is there plays, and goals are counted until the campo has stood empty five minutes. Nothing the phone says moves the ball: only where the zone has the player. Sides, a match with a beginning and an end, and a wager between adults (4B.1's stakes) are for later.

**D-11.8 A new bairro is a script, a line of the registry and its words (delegated, 2026-11-21; F-279).** The registry (`content/registry.json`) says of each bairro the folder of its pack and the script that draws it; the pack's build (`pnpm pack:bairro <pack>`, `pnpm pack:bairros` for all, which the full gate runs), the zone and the test server read it, and nothing else lists bairros. The front door's first-visit cost is the registry's first bairro's. A paragem may lead to more than one bairro: a pack gives it several gateways at the same place; the zone says every way out the player stands at, the API lists them with the one price and sells the one named, and the sheet asks where to before it shows the corrida. What a bairro's lamps and lit windows glow after dark is the pack's (`ambient.lamps`: `sodio` is Zango's orange; left out, the palette's warm white).

**D-11.9 The card says why one wakes in Zango (delegated; the founder: "you should handle this", 2026-11-21).** A card of a family of little money says where the player grew up (Cazenga, the Ilha, the Rangel) and the player wakes in Zango. The card now says why, in the family's own story and in Luanda's: *A família foi realojada no Zango. É lá que acordas.* Zango is where the city rehoused families from its older bairros; nothing is invented. Said only when the bairro of the card is not the one woken in, under the family's line. When Cazenga or the Ilha is built, those who grew up there still live in Zango (one lives where one was born into the game), and may cross to see it.

**D-11.10 Hair is changed at a barbearia, and what a bairro is made of is kit (the founder, 2026-11-21: "the base can be used in other areas"; the barbearia's rule delegated).** Three pieces of `art/scripts/kit_baixa.py` that any bairro may stand: `quiosque_bar` (a kiosk bar with its chapa and plastic tables: the founder asked for it in place of the airtime kiosk, "where they sell burger, and drinks and should have some chairs to sit"), `frente_de_barbearia` (the pole, the mirror, two chairs, a bench: set before any house) and `igreja`. A place named `bar-<where>` is a shop of the kind *bar* (`tunables/shops.json`: hambúrguer 1.000, bifana 700, batata frita 400, água, sumo, gasosa) and a place two may go out to. A place named `servico-<kind>-<where>` is where something is done for the player and paid for: the zone says who stands there, the API sells it. The first is the cut (`servicos.corte`, 500 Mk, a tunable): **hair and its colour are chosen freely the first time, and after that only at a barbearia**; the mirror at home (the BI) changes everything else and says where the hair is changed. The API refuses a change of hair with no cut paid for in the last quarter of an hour; a change of body brings its own hair. Why: a barbearia with nothing to do is a painted wall, and a cut is what one goes there for; it is a small, fair sink (real life stays); and it is one more reason to cross to Zango, the only bairro with one until the Marginal has its own. A lenço and a boné are tied and set there too, for now (F-281).

## What is built (2026-11-21)

- **Zango, art pass 1** (`art/scripts/make_zango.py`, `pnpm pack:zango`): 320 m by 256 m, twenty chunks, 2,1 MB at Normal and 0,4 MB at Poupança; one tarred road, five earth streets and two lanes; some 150 resettlement houses on 15 m plots, each grown its own way; the Mangueira (the paragem), the mercado da estrada with Tia Minga's banca, the "Saldo" kiosk, the cantina do Kota Beto, the damas da mangueira (two of damas and a Não te irrites), the caixa, the geladaria, a barbearia, the igreja, the campo de terra and the chafariz; poles and slack wires down every street; people, kupapatas of both kinds, motos and a candongueiro line. Its Normal views are 100 to 119 thousand triangles.
- **D-11.1**: `content/registry.json` says which pack each bairro is and which tiers of family wake in it; `GET /v1/me/place`; the matchmaker refuses a bairro one is not in and says which is theirs, and the phone goes there; the card's page asks before it opens anything.
- **D-11.2 and D-11.4**: a pack's `gateways`; the zone says who stands at one ("porta"); `GET` and `POST /v1/viagens` (migration 0017, the tunable `fares.entreBairros`, the first crossing of each day free); the gold button "Sair do bairro", the sheet with the fare and the megabytes, the moment on the road, and arrival at the paragem there (`apps/client/src/andar/entre-bairros.tsx`, fetched at a way out).
- **11.1**: the invariant was already kept; the registry carries what the code needed to know.

- **Things to do, first of the second pass (2026-11-21):** water carried from the chafariz and the taças washed at the geladaria (two biscatos), and a ball on the campo.

- **The ball on the campo (D-11.7, 2026-11-21).**

What it leaves is F-273.

## The order of work

1. **11.1 first**: the registry of districts (id, pack, name), the invariant test, the new checks. Small, and everything after stands on it.
2. **Zango's pack, art pass 1** (`art/scripts/make_zango.py`, kit grown: the resettlement house and its extensions, the earth street, the roadside market, the campo, the chafariz, the igreja): walk grid, spawns, points of interest with their lines, a route for the vans inside it, the unorganised paragem. Under the budgets, on the reference phone's tier first.
3. **11.2**: gateways in both packs, the fare, the handoff, the ride between, arrival; D-11.1 at the door.
4. Wiring: the Mapa shows the other bairro and the way to the paragem; the tests (two phones cross and meet); the shots; the docs.

## Open questions

- ~~**Q1 The fare between bairros** and the first crossing of the day on the house (D-11.2)~~: the founder agreed to both, 2026-11-21: 300 Mk, and the first crossing each day free.
- **Q2 Zango's own names**: the paragem's (they are named after what stands there: a fuel station, a bridge), the mercado's, the igreja's. Proposed from the research; the founder corrects.
- **Q3 Zango 0 and Zango 1** follow "as it fills" (D-3.13): what "full" is, in channels.
