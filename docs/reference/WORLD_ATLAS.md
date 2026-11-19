# NZILA · WORLD ATLAS (v1.0)
**Companion to `ROADMAP.md` (Phases 1, 11, 15, 16) and `TO_START_EVERY_SESSION.md` (Rules 7, 8, 9).**
**What this is:** every place the game plans to hold, in the order it plans to open them, and the exact process for adding one.

> A place in this atlas is a plan, not a promise to players. Nothing here is announced until its pack is at art pass 2.
> Real geography below comes from general knowledge and a short check on 2026-11-14. **Section 6 lists what must be verified by the founder or a local before any art is made.** When this atlas and a Luandan disagree, the Luandan is right and the atlas is corrected.

---

## 1. HOW THE WORLD IS ORGANISED

```
Angola
└── Province            registry row · its own zone pool · price and wage overrides · ambient set
    └── District        one pack · up to 8 MB · runs as 1..n channels of up to 80 players
        ├── Chunks      streamed pieces of about 64 m, each under 400 KB
        ├── Interiors   small separate instances: homes, shops, the school, the shopping centre
        └── Gateways    the only ways in and out: a causeway, a paragem, a pier, a station, an airport
```

**Ids.** Province: ISO-style, lower case (`ao-lua` Luanda, `ao-bgu` Benguela, `ao-hui` Huíla, `ao-mal` Malanje). District: province id plus a short code (`ao-lua/l1`). Ids never change once published; display names live in the catalog.

**Scale (D-0.8).** Postcard scale: about one eighth of real distances. The rule for a builder: keep the landmarks, the street names, the order you meet things in, and the skyline from the main viewpoints; drop the repetition between them. A district should cross on foot in three to four minutes and by vehicle in under one.

**Channels (D-0.7).** Players in different channels of a district do not see each other, but they see the same owned homes, the same businesses with the same stock and prices, the same candongueiros at the same stops, the same hour and the same heat. Kambas are placed together.

**What is global.** The player, the BI, the bank, items, homes, businesses, the ledger and friendships are the same everywhere. A player in Benguela can message a kamba in Luanda and pay rent on a room in Kilamba.

**The crowd rule.** A new district or province opens only when the existing ones hold at least two full channels at the evening peak (a tunable, decided by the founder each time). New places divide the crowd; an empty beautiful place is worse than a busy familiar one.

**Capacity planning for a district.** Decide the target crowd first, then size the pack:

| Target peak players | Channels | Commercial lots | Home units | Paragens | Notes |
|---|---|---|---|---|---|
| 400 | 5 | 20 to 30 | 300 to 500 | 3 to 4 | a first district |
| 1 500 | 19 | 40 to 60 | 1 500+ | 5 to 8 | needs a housing district beside it |
| 5 000+ | 63+ | lots are scarce by design | Kilamba-style towers | many | lots become valuable; that is the economy working |

Lots are the same in every channel, so they are scarce on purpose. Homes are instanced, so they are plentiful.

---

## 2. LUANDA (`ao-lua`), district by district

The order is the plan. It follows three things: what is most recognisable, what adds a new thing to do, and what is next door.

| # | District | Opens in | One line | The new thing it brings |
|---|----------|----------|----------|-------------------------|
| | **The order of building (founder, 2026-11-18):** L1, then **Zango** (out of L6, a district of its own, with Zango 0 and Zango 1 to follow as it fills), **Cazenga** (out of L7), **Maianga** (new to this list: the old middle-class centre above the Baixa), **Ilha de Luanda**, **Mussulo**. The L numbers below are names, not the order | | | |
| L1 | Marginal e Baixa | Phase 1 | The postcard: the bay, the fortress, the old city | The game itself |
| L2 | Ilha de Luanda | Phase 11 | Beach on one side, bay on the other, mufete in the middle | Swimming, beach life, restaurants, the pipeline proof |
| L3 | Mussulo | 15.1 | The quiet sand across the water | Boats and motas de água |
| L4 | Talatona | 15.2 | The new money south | The shopping centre, condominiums, better cars |
| L5 | Kilamba | 15.3 | The towers | Homes for everyone |
| L6 | Viana | 15.4 | Where things are made and moved | Industry careers, the big market, the railway |
| L7 | Cazenga, Sambizanga e Rangel | 15.5 | Where the music comes from | Street kuduro, the best football, quintal parties |
| L8 | Sul: Benfica, Miradouro da Lua, Barra do Kwanza | 15.6 | The road south | The first long drive, the craft market, the lookout |
| L9 | Gateways: aeroporto e terminais | 15.7 | The way out to the rest of Angola | Intercity travel |

**The bairros as they are built (founder's maps, 2026-11-19).** `docs/reference/BAIRROS.md` holds, for Kilamba, Viana, Nova Vida, Cazenga, Cidade Alta, Ingombota, São Paulo, Vila Alice, Rangel, Catambor and Maculusso (Vila Flor dropped by the founder), the street pattern the maps show (superblocks, organic lanes, numbered streets, grids that meet at angles), plot and road sizes, what stands there, the landmarks and paragens, and rules for making each one, with every source. Read it before a district's brief; what it marks **[founder]** is asked before it is used.

### 2b. What stands in each district (the housing mix, founder 2026-11-14)

Most of Angola lives in houses. A district's brief states its mix before a single model is placed, and the pack is judged against it in the look test. Sources and detail: `LUANDA_REFERENCE.md` §6c.

| District | Mostly | Also | Never |
|---|---|---|---|
| L1 Marginal e Baixa | Colonial sobrados, late-colonial modernist blocks with galleries, a few new towers on the bay | The fortress, the bank, churches, a small market | Rows of identical blocks |
| L2 Ilha de Luanda | Low beach restaurants, fishermen's houses, vivendas | A few hotels | Towers inland |
| L3 Mussulo | Beach houses, bungalows, palm shelters | The cais | Tar roads |
| L4 Talatona | Gated condominiums, vivendas behind walls | The shopping centre, car dealers, offices | Open streets of houses |
| L5 Kilamba | Blocks of 5 to 13 storeys in a few clear colours, wide avenues | Schools and shops built into the plan | Self-built houses |
| L6 Viana | Casas de bloco on plots, warehouses, factories | The big market, the railway | Glass towers |
| L7 Cazenga, Sambizanga e Rangel | Casas de bloco and de chapa with quintais, earth streets, becos | Cantinas, a football pitch of earth, a market | Blocks of flats, except the few old colonial ones |
| L8 Sul | Scattered houses, craft stalls, open land | The lookout | Dense streets |
| A provincial capital | Houses, with a small centre of colonial and modern buildings | The governo provincial, the church, the market, the station | A Luanda skyline |

**Roads, pitches and green (founder, 2026-11-14).** A district's brief also states its roads: finished (tar, kerbs, markings, lamps) in Talatona, Maianga, Kilamba and the Baixa; not done (earth, ruts, puddles, a strip of tar on the main street at most) in the other bairros. Every district has at least one place to play football (a painted court, an earth pitch, a beach) and at least one green place to sit; the Marginal has lawns, a cycle lane and the long walk by the water.

**The kit grows to match** (`art/scripts/kit.py`), each part made by us: casa de bloco (plastered and painted, or bare), casa de chapa, vivenda, the wall and gate of a plot, the quintal's furniture (the tank, the washing line, the brazier, plastic chairs), cantina, container shop, roulotte, sobrado, modernist block with galleries, Kilamba block; and the trees of the country beside the palm and the acácia rubra: imbondeiro, mulemba, mangueira.

### 2c. What a paragem is, by district (founder 2026-11-15, D-0.48)

| District | Its paragens |
|---|---|
| L1 Marginal e Baixa, L4 Talatona, L5 Kilamba | **Organised:** a shelter, a sign, a bay at the kerb, vans standing in line, one cobrador calling at a time. |
| L2 Ilha de Luanda | Organised at the causeway end; further along, a known spot by the road. |
| L6 Viana (and Zango), L7 Cazenga, Sambizanga e Rangel | **Not organised:** a corner, a tree or the mouth of a market that everyone knows. No shelter, no sign. Vans two and three abreast and half in the road, kupapatas and moto-táxis in their own knot beside them, cobradores calling over each other, zungueiras selling to the queue. Loud, crowded, slow to get away from. |

Every district brief names each paragem and says which kind it is; the manifest carries it.

### L1 · Marginal e Baixa (the first slice)
- **Researched detail:** `docs/reference/LUANDA_REFERENCE.md` holds what published sources say about each landmark, the candongueiros, the light and the seasons, and the decision each fact leads to. Read it before building this pack.
- **Why first:** it is the image of Luanda every Angolan carries. If a Luandan recognises it on a cheap phone in ten seconds, the project works.
- **Landmarks (art pass 2):** the Marginal promenade (Avenida 4 de Fevereiro) with its palms and the curve of the bay; the Fortaleza de São Miguel on its hill; the pink colonial bank building with the dome; the Largo da Mutamba; the Palácio de Ferro; one old church front; the skyline of towers behind.
- **Layout:** a crescent. The bay to the north, the promenade along it, two streets of the Baixa behind, the fortress hill at the west end with a path up to a viewpoint, the causeway to the Ilha beside it (a closed gateway with a sign until L2).
- **From the research:** two sports courts and a cycle lane on the promenade (the rented bicycle is a player's first vehicle); a kiosk row; a small stage; a police post; wedding parties posing against the bay at golden hour on game weekends.
- **Things to do:** the four biscatos (zungueiro on the promenade, roboteiro at the small market, lavador de carros in a side street; **no pescador here: fishing is not allowed on the Marginal and the police run off whoever tries (D-0.47), so that biscato is the Ilha's**); the viewpoint at the fortress; benches at golden hour.
- **Size:** 24 commercial lots (most locked until Phase 8), 4 residential buildings of 100 units, 3 paragens, 2 candongueiro routes that loop.
- **Positive points of interest (twelve, a line each in the catalog):** the sunset from the promenade, the pontão over the bay (not the fishermen's: D-0.47), the fortress viewpoint, the square's chess tables, the bookseller under the arcade, the old cinema front, the ice-cream corner, the mural, the palm avenue, the market's fruit row, the musicians on the steps, the candongueiro stop with the loudest cobrador in town.
- **Heat inputs:** well lit along the promenade (low heat at night); the two alleys behind the market are dim (heat rises after dark and falls when players are present).
- **Care:** the fortress houses a military museum and the bank building belongs to a state institution. Show the architecture; no emblems, flags of institutions or official names on signs (Rule 8). The memorial obelisk to the south appears on the skyline only.

### L2 · Ilha de Luanda
- **Landmarks:** the causeway; the long ocean beach; the bay side with moored boats; the fishermen's quarter and its fish market; a row of restaurants and esplanadas; the small old church near the tip; the point (Ponta da Ilha) at the end.
- **New:** swimming at the shore (shallow water only); the pescador career moves onto boats; beach football on the sand; restaurants as the natural first player businesses; evenings that run late.
- **Event:** the island's own festival of the sea and its spirit, the Kianda, in the events calendar (verify the form and dates with local advice before building).
- **Gateways:** the causeway to L1; a pier for Mussulo later.
- **Care:** the fishing community is real and has lived there for generations. It is shown with respect, as owners of the place, not as scenery.

### L3 · Mussulo
- **Reached by:** boat from a pier on the mainland (verify the real embarkation point) and from the Ilha.
- **Landmarks:** the lagoon side, calm and shallow; the ocean side; coconut palms; beach houses; a sandbank at low tide.
- **New:** water vehicles in `packages/sim` (boat, mota de água); owning and mooring them; holiday houses as a second home; a low-heat district where the game is simply pleasant.

### L4 · Talatona
- **Landmarks:** the shopping centre (invented name) as one large interior with many shop lots; wide avenues; gated condominiums; the convention-centre silhouette; car showrooms.
- **New:** homes with guards (the top lock level, and a harder, riskier target); premium cars; office careers.

### L5 · Kilamba
- **Landmarks:** the grid of coloured towers, block after block; the central avenue; schools and courts between the blocks.
- **New:** thousands of apartment units. This is where "every player wants a home" is answered. A weekly feira in the central avenue. A school (Phase 9 content).

### L6 · Viana
- **Landmarks:** warehouses and factories; the big market; the railway station on the line to Malanje; the road east.
- **New:** industry and logistics careers (loading, forklift, delivery driving); wholesale supplies for player businesses; the train, which becomes the gateway to Malanje in 16.2.

### L7 · Cazenga, Sambizanga e Rangel
- **What it is in the game:** the heart. Kuduro was born in streets like these; so were most of the footballers.
- **Landmarks:** dense streets and alleys; painted walls; the football pitches with a crowd around them; a big street market; quintais with music; a famous old stadium silhouette nearby.
- **New:** street dance circles (a rhythm minigame, with licensed kuduro); the best pitches and the bairro league; quintal parties any player can host; the cheapest rooms in Luanda and the strongest neighbours (in a tight street, witnesses are many: burglary is harder here than in a quiet rich street).
- **Heat:** dim alleys heat up fast at night and cool with light and people. This is mechanics, the same as everywhere; no label (Rule 7).
- **Care, in bold because it is the district most likely to be done badly:** **the founder and at least three people who live or grew up there review the brief, the greybox and the copy before any art is made.** No poverty as decoration. The district must be the one players are proud to say they are from.

### L8 · Sul: Benfica, Miradouro da Lua, Barra do Kwanza
- **Landmarks:** the craft market at Benfica; the coastal road; the Miradouro da Lua's eroded cliffs at sunset; the Museu da Escravatura on its headland (shown with gravity; a place to read, not to play); the mouth of the Kwanza river and its bridge.
- **New:** the first long drive (a stretch of road as its own streamed district, where a car finally matters); souvenirs made by craftsmen; river fishing.

### L9 · Gateways: aeroporto e terminais
- **What it is:** two small hub districts, the airport and the intercity bus terminal. Little to do, on purpose: ticket desks, a waiting hall, a café lot, a taxi rank.
- **New:** the travel service of 16.2.

### Later Luanda candidates (not scheduled)
Maianga and Alvalade; Miramar; Cacuaco and its beach; the stadium district on a match day; the Ilha's far point at night; Cabo Ledo for surfing (south, toward the next province).

---

## 3. THE PROVINCES

Angola has **21 provinces** since the administrative division of Lei 14/24 came into force in 2025 (Icolo e Bengo out of Luanda; Cuando and Cubango out of Cuando Cubango; Moxico Leste out of Moxico). The game uses the current names.

### 3.1 The first four

| Order | Province | Districts at opening | The reason to go | Travel from Luanda |
|---|---|---|---|---|
| 1 | **Luanda** `ao-lua` | L1 to L9 above | The capital | you are here |
| 2 | **Benguela** `ao-bgu` | Benguela city and Praia Morena; Lobito and the Restinga; Baía Azul | The best beaches in the game; fishing; the railway to the east | plane, bus, road |
| 3 | **Huíla** `ao-hui` | Lubango under the Cristo Rei; the Serra da Leba road; **Fenda da Tundavala** | Mountains, cold nights, the drive of the game, the first Wonder | plane, bus |
| 4 | **Malanje** `ao-mal` | Malanje city; **Quedas de Kalandula**; Pedras Negras de Pungo Andongo | The train journey, the waterfall, the black rocks | **train from Viana**, bus, plane |

Why these three after Luanda: together they give sea, mountain and waterfall; they hold two of the Seven Wonders; and each is reached a different way, which exercises every travel mode in 16.2.

### 3.2 The Seven Natural Wonders of Angola (the Passaporte das Maravilhas)
Chosen by public vote in 2014.

| # | Wonder | Province | Opens with | What a player does there |
|---|--------|----------|------------|--------------------------|
| 1 | Fenda da Tundavala | Huíla | 16.4 | Walk to the edge, the view to the coastal plain, the photo, the stamp |
| 2 | Quedas de Kalandula | Malanje | 16.5 | The viewpoint, the path down to the mist, the sound |
| 3 | Floresta do Maiombe | Cabinda | 16B | A guided forest walk: the canopy, the birds, the quiet |
| 4 | Morro do Moco | Huambo | 16B | The climb to the highest point in Angola, in stages |
| 5 | Grutas do Nzenzo | Uíge | 16B | The caves by lamplight |
| 6 | Lagoa Carumbo | Lunda Norte | 16B | The lake at dawn, by canoe, with its legend told |
| 7 | Quedas do Rio Chiumbe | Lunda Sul | 16B | The falls and the river |

Wonder districts are small, beautiful, low on systems and high on views. Each has a guide NPC who tells the real story (written with a local source), a photo spot, a stamp, and a souvenir for the home. No crime mechanics inside a wonder district (heat is fixed at zero there: a tunable override, not a label).

### 3.3 All 21, so none is forgotten
Each province needs one reason to go that no other has. These are starting ideas; each is confirmed with someone from the province before its brief is written.

| Province | A reason to go (to verify locally) | Status |
|---|---|---|
| Luanda | The capital | Phases 1, 11, 15 |
| Benguela | Beaches, Lobito, the railway | 16.3 |
| Huíla | Tundavala, Serra da Leba, Lubango | 16.4 |
| Malanje | Kalandula, Pungo Andongo | 16.5 |
| Cabinda | Floresta do Maiombe | 16B |
| Huambo | Morro do Moco, the planalto | 16B |
| Uíge | Grutas do Nzenzo, coffee | 16B |
| Lunda Norte | Lagoa Carumbo | 16B |
| Lunda Sul | Quedas do Rio Chiumbe | 16B |
| Namibe | The desert, the welwitschia, the coast | 16B |
| Zaire | Mbanza Kongo, the old capital of the Kongo kingdom; the river mouth | backlog |
| Cuanza Sul | Waterfalls and the coast road | backlog |
| Cuanza Norte | The botanical garden; the great river and its dams | backlog |
| Bengo | Beaches north of the capital | backlog |
| Icolo e Bengo | The river plain; the wildlife park south of the Kwanza (verify which province holds it today) | backlog |
| Bié | The centre of the country | backlog |
| Cunene | The far south, the border, cattle country | backlog |
| Cubango | The headwaters of the Okavango | backlog |
| Cuando | Wild country and wildlife | backlog |
| Moxico | The great plains and the park | backlog |
| Moxico Leste | The far east, toward the source of the Zambezi | backlog |

---

## 4. THE PACK FORMAT

A district is one directory under `content/<province>/<district>/`. `tools/pack build` turns it into immutable, content-hashed files on the CDN. The manifest is the contract between world builders and the engine; `packages/world` owns its schema.

```jsonc
{
  "id": "ao-lua/l1",
  "province": "ao-lua",
  "version": 7,
  "nameKey": "world.ao-lua.l1.name",            // display name lives in the catalog
  "artPass": 2,                                  // 0 greybox · 1 kit · 2 final (S-2)
  "bounds": { "minX": 0, "minZ": 0, "maxX": 512, "maxZ": 384 },   // metres at postcard scale
  "ambient": { "set": "coast-luanda", "soundBeds": ["sea", "square", "traffic"] },

  "chunks": [                                    // streamed; each under 400 KB at the Normal tier
    { "id": "c-03-02", "aabb": [192,0,128, 256,40,192],
      "lods": ["c-03-02.l0.<hash>.glb", "c-03-02.l1.<hash>.glb", "c-03-02.imp.<hash>.ktx2"],
      "walkGrid": "c-03-02.walk.<hash>.walkz", "bytes": { "poupanca": 141000, "normal": 322000, "alta": 610000 } }
  ],

  "spawns":   [ { "id": "arrival", "pos": [210, 2, 150], "facing": 90, "kind": "first_arrival" } ],
  "gateways": [ { "id": "causeway", "pos": [40, 2, 120], "to": "ao-lua/l2", "arrive": "causeway", "mode": "walk|ride",
                  "openFlag": "district.ao-lua.l2.open" } ],

  "pois": [ { "id": "sunset-bench", "pos": [260, 2, 96], "nameKey": "…", "lineKey": "…", "positive": true, "stamp": false } ],

  "routes": [ { "id": "r-mutamba-loop", "kind": "candongueiro", "spline": "r-mutamba-loop.<hash>.bin",
               "stops": ["p-mutamba", "p-marginal", "p-fortaleza"], "headwaySeconds": 90, "fareKey": "fare.candongueiro.local" } ],
  "paragens": [ { "id": "p-mutamba", "pos": [300, 2, 200], "nameKey": "…" } ],

  "lots": [ { "id": "lot-014", "pos": [280, 2, 180], "front": "shopfront-b", "interior": "int-restaurant-s",
             "kinds": ["restaurante", "cantina"], "rentKey": "rent.lot.l1.b", "adSlots": ["window", "table"] } ],
  "residences": [ { "id": "res-02", "pos": [330, 2, 240], "units": 100, "layouts": ["quarto", "t1"], "rentKey": "rent.home.l1.a" } ],
  "interiors":  [ { "id": "int-restaurant-s", "file": "int-restaurant-s.<hash>.glb", "bytes": 240000 } ],

  "npc": { "crowd": "crowd.l1.json", "vendors": "vendors.l1.json", "police": "police.l1.json" },

  "heat": {                                       // inputs only; heat itself is computed (Rule 7)
    "lighting": "light.l1.<hash>.bin",            // per-block street lighting
    "policePosts": [ [250, 2, 110] ],
    "override": null                              // "zero" only for wonder districts
  },

  "adSlots": [ { "id": "outdoor-01", "kind": "outdoor", "pos": [200, 8, 100], "size": [6, 3] } ],
  "strings": "strings.pt-AO.json",
  "sizes": { "firstView": 2100000, "total": { "poupanca": 3400000, "normal": 7600000, "alta": 14800000 } }
}
```

**What the engine may read from a pack:** only this manifest and the files it names. **What it may never contain:** code, a real brand or person (Rule 8), a danger label (Rule 7), text outside the strings file (Rule 10).

**`pack:check` fails a pack when:** the schema does not validate; a chunk or the total is over budget for any tier; the estimated triangles or draw calls from any spawn or paragem exceed Rule 1; a spawn, paragem, lot door or gateway is not reachable on the walk grid; a string key is missing from `pt-AO`; fewer than five `positive` points of interest; a forbidden term from `docs/legal/BRAND_TERMS.txt` appears in any string or texture name; a gateway points at a district that does not exist in the registry.

---

## 5. THE CHECKLISTS

### 5.1 Adding a district (the Phase 11 process, repeated)
1. **Brief.** One page in `docs/briefs/<id>.md`: why now (the crowd rule), the one new thing it brings, the landmarks, the target crowd and the sizing from §1.
2. **References.** Photos the project has the right to use (the founder's own, commissioned, or openly licensed) and a street map. Never trace a copyrighted map.
3. **Local review of the brief.** At least two people who know the place. Their notes go in the brief. For L7 and for any place outside Luanda, three.
4. **Greybox at postcard scale.** Blocks only. Walk it on the reference phone. Does it cross in three to four minutes? Are the landmarks where a local expects them?
5. **Walk grid, spawns, gateways.** Every door and stop reachable. Gateways agreed with the neighbouring districts.
6. **Routes and paragens.** Candongueiro routes with real-sounding route names; at least one route to a neighbour.
7. **Points of interest.** At least five positive ones, each with a line of copy. **And a centro médico (founder, 2026-11-19): every município has one, in the district that holds its centre, or its hospital where a real one stands there; it is where a player whose Energia runs out wakes (Task 4.4). Which real hospitals stand in Luanda and how they may be named: `LUANDA_REFERENCE.md` §6f.**
8. **Lots and residences.** Counts from the sizing table; rents by reference to tunables keys.
9. **NPC tables.** Who is in the street at each hour; vendors and what they sell; police posts.
10. **Heat inputs.** The lighting map and police posts. No labels.
11. **The new thing.** The one new activity or system the district brings, built and tested.
12. **Strings.** All names and lines in `pt-AO`, reviewed against the glossary.
13. **Art pass 1.** Kit models. `pack:check` green. Budgets measured on the reference phone.
14. **Staging channel.** Staff and invited locals play it for a week.
15. **Art pass 2.** The landmarks made properly. Budgets measured again.
16. **Publish.** Staged rollout through the Estúdio (12.3): 5%, 25%, everyone. The gateway's flag opens.
17. **Completion doc.** Days spent, megabytes per tier, frame times, what the locals said, what the next district should do differently.

**A district is not allowed to need:** a change in `apps/` or `packages/` other than the one new thing in step 11, which must be written generally (a boat is a vehicle parameter set, not "the Mussulo boat").

### 5.2 Adding a province (the Phase 16 process, repeated)
1. **The crowd rule** holds for the country as it stands, and the founder says go.
2. **A cultural advisor from the province** is engaged before the brief is written.
3. **Registry row:** id, name key, the zone pool it runs in, its gateways from existing hubs.
4. **Travel:** which modes reach it (plane, train, bus, road), ticket prices and journey lengths in tunables, the travel scene for each.
5. **Economy overrides:** what is cheaper and dearer here and why (a short paragraph the economy designer signs).
6. **Ambient set:** climate and light (the planalto is cool and clear, the coast is hazy and warm, the forest is green and wet), the vegetation kit, the sound of the place, a commissioned music loop in a style that belongs there.
7. **Voice:** greetings and a few words in the main local language as flavour on NPCs (Umbundu, Kimbundu, Kikongo, Cokwe, Nyaneka, Oshikwanyama, Ibinda and others, by province), written and checked by a native speaker. Portuguese stays the language of the interface.
8. **The reason to go:** the one thing no other province has, and the Wonder if it holds one.
9. **An event** for the calendar that belongs to the province.
10. **The first district pack**, by checklist 5.1, usually the capital city; then the wonder or signature district.
11. **Homes and businesses:** how many, and the rule for owning in more than one province.
12. **Completion doc** as for a district, plus the travel numbers: how many players made the journey in the first week and how many stayed.

**A province is not allowed to need:** any change in `apps/` or `packages/`. If it seems to, the framework in 16.1 is missing something general; fix the framework, then add the province.

---

## 6. TO VERIFY BEFORE ANY ART IS MADE
The founder or a local source confirms each of these; the answer and its date are written beside it.

- [ ] The landmark list and their relative positions for L1 (which buildings a Luandan expects to see from the promenade today).
- [ ] How the pink bank building and the fortress may be shown and named (Rule 8).
- [ ] Candongueiro route names and the way a cobrador calls them; current liveries.
- [ ] The Ilha: the names people use for its parts; the festival of the Kianda and whether and how it may be shown.
- [ ] The real embarkation point for Mussulo.
- [ ] Which present-day province holds each place planned for L8 and for Icolo e Bengo (the 2025 division moved some).
- [ ] The railway: that the Luanda to Malanje service and the Viana station are as assumed.
- [ ] Each Wonder: the correct name and spelling, the legend or story a local guide tells, and permission to tell it.
- [ ] Dishes, their names and what they are served with, for the restaurant menus in 8.2.
- [ ] The glossary: which words are warm and which are rude, by generation.

## 7. SENSITIVITIES (read before writing any brief)
- **Places are homes.** Every district is where somebody is from. Write it so they would show it to their mother.
- **No politics.** No parties, no politicians, no slogans, no flags of movements. The national flag appears only where it would in real life and never as decoration on merchandise.
- **Faith with respect.** Churches and sanctuaries are architecture and community; they are never a setting for crime, comedy or commerce in the game. Real, historic churches stay architecture only. The Sunday culto (D-0.33, Task 10.12) happens in an invented congregation's church with an invented name and no denomination: a choir, a full room, neighbours talking outside afterwards. We write no sermon and no doctrine. The brief is reviewed by the founder and two churchgoers before it is built.
- **Marriage with respect.** The pedido and the alambamento are real customs that differ by family and by people. They are not in the game for now (founder, 2026-11-14): any two players who agree may marry. If they are ever added, it is only in a form the founder has written (D-0.34), never as a purchase.
- **History with gravity.** The slavery museum, war memorials and battle sites are places to read and be quiet. No minigames, no heat, no businesses.
- **The police are invented in name and insignia.** They dress as the police do, in dark blue (founder, 2026-11-15, D-0.49); the force's name, its emblem and every badge are the game's own.
- **Ethnicity and language are flavour offered with care, never a mechanic.** No stat, price or risk ever depends on an avatar's look, name or speech.
- **Wildlife is seen, not hunted.**

---

*Last updated: 2026-11-14 · Version 1.0 · Working name: Nzila*
