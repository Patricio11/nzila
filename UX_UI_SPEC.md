# NZILA · ART DIRECTION, UX AND UI SPECIFICATION (v1.0 · "Hora Dourada")
**Companion to `ROADMAP.md`. Deep on Phases 1 to 4, with the screens of Phases 5 to 12 specified so their data is known early.**
**Working name: Nzila. A multiplayer life game set in Angola, in the phone's browser, in Angolan Portuguese.**

> Read `TO_START_EVERY_SESSION.md` first. Every rule there governs this document, above all the
> **Reference-Phone Rule** (30 fps on a cheap Android), the **Megabytes-Are-Money Rule**, the **One-Thumb Rule**
> and the **World-First Rule** (the world is the screen; the HUD gets out of the way).
>
> **The set:** `TO_START_EVERY_SESSION.md` (context and rules) · `ROADMAP.md` (phased tasks with dependencies) ·
> `docs/reference/WORLD_ATLAS.md` (places and packs) · **this file** (how it looks, sounds and behaves).
>
> **Language:** component and type names are English. Every label a player reads is shown here in Portuguese of Angola exactly as a first draft for the catalog. The founder corrects the Portuguese; nobody else's ear counts more.

---

## 0. ART DIRECTION · "HORA DOURADA"

One sentence: *Luanda at five in the afternoon, when the sun is low over the bay, the buildings turn gold, the shadows go long and blue, the candongueiros are full and somebody is grilling fish.* The game's default light is that hour. Everything else follows from it.

**The three things people remember:**
1. **The light.** The world clock makes golden hour long (a quarter of the day). Screenshots of this game are warm. That alone separates it from every grey city game.
2. **The cobrador's call.** Each candongueiro route has a called name, and each district has that call as its signature sound. Close your eyes and you know where you are. (With the sound off, the route band on the HUD carries the same information.)
3. **The paper.** The BI card and the receipt. Angolans carry documents and keep receipts; the game's interface is made of them. Every transaction ends in a small paper receipt you can open again from the bank statement.

### 0.1 The world's look
- **Stylised low-poly, confident colour.** Clean shapes, slightly exaggerated proportions (palms a little taller, vans a little rounder), no photo textures. One shared palette atlas colours most of the world; landmarks get a few hand-painted details.
- **Light does the work.** One sun, one sky gradient, soft ambient, distance haze that turns far buildings into silhouettes (and hides streaming). Baked ambient occlusion in vertex colours. No real-time shadows on the low tier: soft blob shadows under people and vehicles.
- **Angola in the details, not in a flag.** Hand-painted shop signs, satellite dishes, water tanks on roofs, a generator humming on a balcony, laundry lines, acacias and imbondeiros, red earth where the tar ends, the blue and white vans, a zungueira's bacia balanced perfectly.
- **People.** Slightly stylised adults with real variety of skin tone, build, age and dress. Hair done properly: tranças, afro, dreads, corte baixo, lenço. Clothes from the street: football shirts (invented clubs), panos with samakaka-inspired geometric prints (our own patterns), fato on a Sunday.
- **Night is blue, not black.** Warm windows, street lamps that pool light, the bay reflecting the towers. Dim alleys read as dim; that is information (heat), not a horror filter.

### 0.2 How it is distinctive AND disciplined
| Distinctive comes from | NOT from |
|---|---|
| A default time of day with a strong mood | A neutral noon |
| One palette atlas, used boldly | Thousands of textures and megabytes |
| The interface made of a BI, a receipt, a route band, a phone | Glass panels, neon outlines, fantasy frames |
| Sound that belongs to a place | A generic loop under everything |
| Angolan Portuguese in every label | Translated game jargon |
| A HUD of five small things | Bars, counters and badges on every edge |
| Detail where the eye rests (landmarks, faces, signs) | Detail everywhere |

**The three generic tells we refuse (checked at review):** a row of currency counters with plus buttons across the top; a red notification dot on everything; a popup that offers something the moment the game opens. If a screen has one, it is redesigned before it ships.

### 0.4 Made by hand (D-0.23: it must never look machine-made)
What makes work look generated is sameness, smoothness and detail without decisions. The rules that prevent it:
- **One art bible, obeyed.** `docs/ART_BIBLE.md` fixes proportions, the palette, how edges are bevelled, how a window is built. Everything is checked against it. Consistency is what reads as authored.
- **Decisions you can name.** Every landmark has three choices written down before it is modelled (what is exaggerated, what is left out, what colour carries it). If nobody can say why a thing looks the way it does, it is redone.
- **Imperfection on purpose.** Shop signs are lettered by hand (drawn by a person, scanned or traced, each one different, with real Luandan sign-painter habits: drop shadows, uneven baselines). Walls have repairs. No two market stalls are the same.
- **Nothing generated ships.** No generated images, textures, icons, music, voices or text. Scripts may place and vary things a person designed; they do not design.
- **Words written by a person from there.** Every line of copy passes the founder. Jokes, greetings and signs come from real ones.
- **Fewer, better.** Ten props made with care beat two hundred from a kit. The kit models of stub S-2 are scaffolding and are all gone before beta.
- **The tells we check for at review:** identical repeated props in one view; lettering that is almost a real font; symmetrical faces; colours that are all equally saturated; text that says nothing in many words.

### 0.3 Quality tiers (chosen automatically, changeable in Definições)
| Tier | Internal resolution | Shadows | Draw distance | Crowd | Textures | For |
|---|---|---|---|---|---|---|
| **Poupança** | 540p, dynamic down to 432p | blobs | 90 m then silhouettes | 12 NPCs | half | the reference phone; also what Modo Poupança forces |
| **Normal** | 720p dynamic | blobs + sun shadow near the player | 140 m | 24 NPCs | full | mid-range phones |
| **Alta** | device, capped at 1080p | one cascade | 220 m | 40 NPCs | full + landmark detail | good phones, laptops |

The game must be beautiful at Poupança. If it is only beautiful at Alta, the art direction has failed.

---

## 1. DESIGN SYSTEM (the HUD and the sheets)

### 1.1 Typography
- **Display (names of places, numbers on receipts, the BI, headings):** one variable display face with character, self-hosted, subset to Portuguese (`á à â ã ç é ê í ó ô õ ú`), under 40 KB. **Fraunces**, a soft serif, chosen by the founder on 2026-11-14 from five candidates (D-0.38): it makes the BI and the receipt read as printed paper. Licence confirmed (SIL OFL 1.1), subset 35 KB. The first choice written here before was Bricolage Grotesque, a sans-serif, set aside because the leading game in the market is also set in one. **Also check it beside the market (`MARKET_NOTES.md`):** the leading game there uses a heavy grotesque on cream with yellow highlights. Our type and our posts must not be mistakable for theirs at thumbnail size; if the face reads too close, choose one with more character (a humanist or a slab) before anything is published.
- **Everything else:** the system font stack. Zero bytes, sharp on every phone, familiar.

```css
--font-display: "Fraunces", Georgia, "Times New Roman", serif;
--font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
font-variant-numeric: tabular-nums;   /* every number that changes */
```

| Token | Size / line | Face | Use |
|---|---|---|---|
| `place` | 28 / 1.1 | Display 700 | District name on arrival, sheet titles |
| `number-l` | 32 / 1 | Display 700 | Totals on receipts, scores, balances |
| `title` | 20 / 1.2 | Display 600 | App titles, card titles |
| `body` | 16 / 1.45 | UI 400 | Default |
| `label` | 15 / 1.2 | UI 600 | Buttons, the context action |
| `small` | 14 / 1.35 | UI 400 | Secondary lines, timestamps. Nothing is smaller than 14. |

Rules: sentence case everywhere; no all-caps labels; a number and its unit stay on one line (`1.500 Mk`, `3,2 MB`, `12 min`); thousands separated by a point, decimals with a comma (founder, 2026-11-14). Prices are those of Luanda: a Makuta buys what a kwanza buys (D-0.9), so a corrida is 200 Mk; where this document still shows 150 Mk on a button, read 200.

### 1.2 Colour
The world supplies the colour; the HUD stays quiet. Text over the 3D view always sits on a scrim or a solid chip (Readable-In-The-Sun Rule).

```css
/* Sheets and chips (dark, the default over the world) */
--n-noite:        #0F1B2A;   /* sheet background */
--n-noite-2:      #18283B;   /* raised surface */
--n-luz:          #FBF8F1;   /* text on dark */
--n-luz-suave:    #B8C2CE;
--n-linha:        rgba(255,255,255,.14);
--n-scrim:        rgba(15,27,42,.62);   /* behind any text on the world */

/* Paper (the BI, receipts, documents) */
--n-papel:        #F6F1E7;
--n-papel-2:      #EAE2D2;
--n-tinta:        #17202B;   /* text on paper and on gold */
--n-tinta-suave:  #5A6675;

/* Identity */
--n-dourado:      #F2A93B;   /* the one primary action colour. Text on it is --n-tinta. */
--n-azul:         #1E63C4;   /* candongueiro blue: transport, routes, links */
--n-mar:          #17877F;   /* the bay: bank, water, calm */
--n-terra:        #B5502E;   /* red earth: home, land */

/* Meaning */
--n-ganho:        #2E9E5B;   /* Makuta in */
--n-gasto:        #D9483B;   /* Makuta out, danger, errors */
--n-escudo:       #7FB2F0;   /* the novato shield */
--n-calor-1:      #F2C84B;   /* heat: warm */
--n-calor-2:      #F08A3C;   /* heat: hot */
--n-calor-3:      #D9483B;   /* heat: very hot */
```

Rules: gold is only ever "the thing to press"; one gold element per screen. Blue is only ever transport. Red is only ever loss or danger. Heat always has a word and an icon with its colour. All text pairs meet WCAG AA; checked by a test against the brightest and darkest reference frames.

**The house pattern.** A geometric band inspired by Angolan pano prints, drawn by us (not a copy of any registered design), in black, red, gold and white. It appears in exactly three places: the edge of the BI, the loading screen, and stamps in the Passaporte. Nowhere else.

### 1.3 Space, shape, elevation
- Spacing (px): 4 / 8 / 12 / 16 / 24 / 32. Edges of the screen keep 12 plus the device safe area.
- Radius: chips `999px`; buttons `14px`; sheets `20px` on the top corners only; paper `4px` (paper is not rounded). Different shapes mean different things.
- Elevation: sheets cast one soft shadow up onto the world; chips have none (the scrim is enough); paper has a hard 1 px edge and a slight tilt of one degree on receipts.
- Targets: at least 48 px; the context action 64 px; the joystick zone the whole lower-left (or right) third.

### 1.4 Motion and haptics
- Sheets rise in 180 ms (transform only). Receipts print: they slide out line by line in 300 ms, once.
- The context action label cross-fades in 100 ms when what it does changes.
- Makuta changes tick in place with a 120 ms colour flash (green or red). No coin fountains.
- Arrival in a district: the place name sets in display type over the world for two seconds, then leaves.
- Haptics where the browser allows: a light tick on the context action, a double tick on a receipt, a long one on arrest.
- `prefers-reduced-motion`: everything cuts; camera shake and screen tints are off.

### 1.5 Sound
- Per district: a signature (the cobrador's call), three ambient beds, footsteps by surface.
- Interface: a paper sound for receipts, a soft click for the context action, the phone's own tones for messages (invented, not a real handset's).
- Music lives in the world (a radio in a van, a quintal, the discoteca), never as a permanent soundtrack. All of it original or licensed (D-0.18).
- Everything streams, is off in Modo Poupança unless turned on, and has a visual twin (Sound-Is-Optional Rule).

### 1.6 Signature components (`packages/ui`)
- **`<ContextAction>`** · the one gold button. It always says what it will do in one or two words ("Entrar", "Falar", "Apanhar", "Sentar", "Comprar"). With a cost, the price is on the button ("Apanhar · 150 Mk").
- **`<Joystick>`** · floating, appears where the thumb lands in its zone; left or right handed.
- **`<WalletChip>`** · cash on hand, with a small bank glyph that opens Banco. Flashes green or red on change.
- **`<Compass>`** · a small round map of the block: you, kambas, the next paragem, your target. Tap for the Mapa app.
- **`<RouteBand>`** · the blue and white band shown while riding: route name, the stops as dots, the next stop, the fare paid, "Sair na próxima".
- **`<PhoneSheet>`** · the Telemóvel: a sheet that rises to cover three quarters of the screen (the world stays visible above), with a home grid of apps and a back gesture.
- **`<IdCard>`** · the BI: paper, the avatar's photo, name, number, bairro, arrival date, certificates, and the ficha when there is one. Small variant on tap of any player; full variant in the BI app.
- **`<Receipt>`** · paper, monospace-aligned lines, what, how many, how much, the total in display type, time, place, a short reference. Every ledger transfer can render one.
- **`<PriceTag>`** · any cost before a tap: Makuta, minutes or megabytes, with its glyph.
- **`<SpeechBalloon>`** and **`<ChatBar>`** · proximity chat; quick phrases as chips above the keyboard. Three dots float over anyone typing. Within a few metres a balloon shows its words; farther away it is an empty balloon, so you can see two people talking across the square without reading them. Two players facing each other and talking turn their heads to one another.
- **`<EmoteWheel>`** · hold the avatar or the emote button; six slots.
- **`<NeedsBars>`** · Fome and Energia as two thin bars under the wallet chip; hidden when both are above half.
- **`<HeatLine>`** · one calm line when entering a hot block ("Zona quente agora. Fica atento.") with the heat glyph; never a siren.
- **`<Banner>`** · the single system line at the top: reconnecting, saving, maintenance.
- **`<DataMeter>`** · megabytes this session and this month, in Definições and on any download prompt.
- **`<Sheet>`**, **`<Button>`**, **`<Field>`**, **`<Picker>`**, **`<Stepper>`**, **`<Toggle>`**, **`<EmptyState>`**, **`<Skeleton>`**, **`<Toast>`** · house components; native selects and date inputs are not used.
- **`<Stamp>`** · the Passaporte's stamps, with the house pattern.
- **`<MinigameFrame>`** · the common shell for every minigame: goal in one line, a timer, the score, "Sair" that always works.

### 1.7 Layout shells
- **`<WorldShell>`** · the canvas full-bleed. HUD anchors: top-left wallet and needs; top-right compass and clock; bottom-left (or right) joystick zone; bottom-right context action, run, emote; bottom-centre chat bar; one Telemóvel button above the context action. In landscape the same anchors hold; the chat bar moves up the left edge.
- **`<PhoneSheet>`** · as above; in landscape it docks to the right half.
- **`<InteriorShell>`** · as `<WorldShell>` with the camera pulled in and a "Sair" door action always present.
- **`<DriveShell>`** · steering on the left (a wheel-shaped slider or tilt, the player's choice), accelerate and brake on the right, horn, "Sair do carro"; the compass grows.
- **`<MinigameShell>`** · the world dims behind `<MinigameFrame>`.
- **`<FrontDoorShell>`** · the landing and loading pages: paper and gold over a slow view of the bay.
- **`<StudioShell>`** · the staff console: light, dense, a left index, nothing shared with the game's look except the tokens.

---

## 2. THE FRONT DOOR (Phases 1 and 2)

### 2.1 Landing (`/`)
```
┌──────────────────────────────┐
│   (slow view of the bay at   │
│        golden hour)          │
│                              │
│   Nzila                      │
│   O teu caminho começa aqui. │   draft; the founder writes the final line
│                              │
│  ┌────────────────────────┐  │
│  │   Entrar em Luanda     │  │   gold
│  └────────────────────────┘  │
│   Primeira vez: 5,4 MB       │   the real number for this device's tier
│   Já tenho conta             │
└──────────────────────────────┘
```
The line and the button never contain the phrase "vida na banda" in any form: it is another game's name (earlier drafts of this page did, by accident). One line, one button, the size. No carousel, no feature list, no invented player count. On a return visit with the pack cached the line reads "Já tens tudo. 0 MB."

### 2.2 Loading
The bar shows megabytes ("2,1 de 5,4 MB"), not a percentage of nothing. Under it, one rotating line of something true about the place ("A Marginal chama-se Avenida 4 de Fevereiro."). On a slow network it offers "Entrar em Modo Poupança (3,4 MB)".

### 2.3 Age and arrival
"Em que ano nasceste?" with a year picker. Under 15 gets a kind page and no account. Only the age band is kept, never the year. Then straight into the world as a guest: the avatar steps off a candongueiro at the Mutamba. The creator comes after the first thirty seconds of walking, not before (people leave on creators).

### 2.4 Avatar creator
The avatar turns under the thumb. Tabs along the bottom: Corpo · Pele · Rosto · Cabelo · Roupa. Six to ten choices per tab at the start. "Está bom" in gold. Under twenty seconds to something you like; everything can be changed later at a salão or a shop.

### 2.5 The BI
The card prints like a receipt: photo, "Nome" (the player types it; checked for uniqueness and the filter as they type), number, "Chegou a Luanda em 14 de Novembro". "Guardar o meu BI" offers to link a phone number, Google or email, with one honest line: "Sem isto, o teu progresso fica só neste telemóvel."

### 2.6 The first day (tutorial as a day, not as popups)
A kamba NPC meets the player at the stop and walks them through one real loop, each step a normal game action: buy a pastel (the wallet, a receipt), ride one stop (the route band), do a biscato (a minigame, pay), put half in the bank (Banco), look at a room (Casa). Skippable at any step. It ends with the novato shield explained in one line: "Durante os primeiros dias ninguém te pode roubar. E tu também não."

---

## 3. THE WORLD AND THE HUD

### 3.1 On foot, portrait (360×740 base)
```
┌──────────────────────────────┐
│ ◉ 1 240 Mk  ⌂            ◎  │  wallet chip + bank glyph · compass
│ ▂▂▂▂ ▂▂▂                17:42│  needs (only when low) · world clock
│                              │
│        (the world)           │
│                              │
│              "Bom dia!"      │  speech balloon over a player
│                              │
│                              │
│                        ▢     │  Telemóvel
│                    ☺  ⇧      │  emote · run
│   (joystick zone)     ┌────┐ │
│                       │Falar│ │  context action, gold
│  [ Escreve aqui…    ] └────┘ │  chat bar
└──────────────────────────────┘
```
- Drag anywhere on the upper two thirds to look. Tap a player or NPC to target them; the context action follows the target.
- Nothing else is on screen. Quests, offers and counters do not exist as HUD elements.
- Arrival: "Marginal · Canal 2" sets over the world for two seconds.

### 3.2 The context action, in full
It is the game's main verb. Its rules: it names exactly one action; it shows a cost when there is one; when two things are in reach the nearer wins and a small "…" opens the others; it never performs a spend over a tunable threshold without a confirm sheet.

| Near | Label | Then |
|---|---|---|
| A door | Entrar | interior loads (size shown if over 1 MB and not cached) |
| A paragem with a van | Apanhar · 150 Mk | board, route band appears |
| An NPC vendor | Comprar | shop sheet |
| A player | Falar | chat focuses; long press opens their BI card |
| A bench | Sentar | Energia recovers slowly |
| A job board | Biscatos | the app opens on what is nearby |
| Your vehicle | Conduzir | drive shell |
| A caixa | Banco | deposit and withdraw sheet |

### 3.3 Riding
```
┌──────────────────────────────┐
│▓▓ Mutamba · Ilha ▓▓▓▓▓▓▓▓▓▓▓│  route band, blue and white
│ ● Mutamba  ○ Marginal  ○ Fortaleza  ○ Ilha │
│ Próxima: Marginal · corrida paga 150 Mk            │
│                              │
│   (the world from a window   │
│    seat; drag to look)       │
│                              │
│  ┌────────────────────────┐  │
│  │   Sair na próxima      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```
You see the other passengers in their seats and can turn to look at them and out of every window. The van is its own chat room: what is said inside is heard by everyone inside and nobody outside. The ride is a rest: chat works, the Telemóvel works, Energia recovers. A route that crosses to another district shows the download size on the band before the gateway.

### 3.4 Driving, landscape preferred
Steering left, pedals right, horn, the compass enlarged with the road ahead, fuel as a small gauge that turns red under a fifth. Portrait works with the same controls stacked. A fine arrives as a receipt.

### 3.5 Interiors
A door is a short fade, not a loading screen, when the interior is cached. Shops show their counter; homes show the build-mode button to their owner; "Sair" is always the context action at the door.

---

## 4. THE TELEMÓVEL (every system is an app)

Home grid, three by three. An app that has nothing yet says so honestly ("Ainda não tens casa. Vê os quartos perto de ti.").

```
┌ Telemóvel ───────────────────┐
│  Mapa      Mensagens   Banco │
│  Biscatos  Casa      Garagem │
│  Negócio   BI      Definições│
└──────────────────────────────┘
```

### 4.1 Mapa
The district drawn in the game's own style, north up. Layers as chips: Paragens · Lojas · Biscatos · Kambas · Calor. The heat layer tints blocks by current heat with a legend in words ("calmo, atento, quente"). Tap a place: its name, one line, "Marcar" (the compass points to it). A tab "Luanda" shows the districts and their gateways, with sizes and cached marks; a tab "Angola" arrives with Phase 16 and shows the provinces, with the ones not yet open drawn plainly as "Em breve", never as locked rewards.

### 4.2 Mensagens
Conversations with kambas and turmas; system notices in their own thread (rent due, a break-in, a job offer) so they are never lost among chats. Every conversation has Silenciar, Bloquear, Denunciar in its header.

### 4.3 Banco
```
┌ Banco ───────────────────────┐
│ Na carteira        1 240 Mk  │   at risk
│ No banco          18 600 Mk  │   safe
│ [ Depositar ] [ Levantar ]   │   only at a caixa or a branch
│ [ Enviar a um kamba ]        │   in person
│ Movimentos                   │
│  Hoje 17:20  Biscato zunga  +420 │  → opens its receipt
│  Hoje 16:02  Candongueiro   −150 │
│  Ontem       Renda semanal −2 000 │
│ Seguro: sem seguro · Ver     │
└──────────────────────────────┘
```
The two balances are always shown together with the words "at risk" and "safe" in Portuguese under them, because that difference is the heart of Phase 7.

### 4.4 Biscatos
What is open nearby, each with pay range, time and distance ("Zunga na Marginal · 300 a 500 Mk · 2 min · a 80 m"). Later: careers with their ladder, vacancies posted by player businesses, your shifts.

### 4.5 Casa
Before a home: rooms and apartments to rent, by district, with rent per week, deposit, the lock level, a photo from inside, "Visitar". With a home: rent due date and "Pagar agora", housemates, the lock, the insurance state, "Ir para casa" (sets the compass), and the list of who has a key.

### 4.6 Garagem
Your vehicles: where each is, fuel, condition, "Marcar no mapa". A vehicle in the parque shows the fee to release it.

### 4.7 Negócio
Before a business: lots to lease, with footfall as words not invented numbers ("rua movimentada", "rua calma"). With one: today's sales and costs, stock that is running out or going off, staff on shift, vacancies, the menu and prices, the books by day and week (sales, supplies, wages, rent, tax, profit), the poster in your own ad slots.

### 4.8 BI
The full card; Respeito by bairro, in words; Mestria by craft; the Álbum; certificates; the Passaporte das Maravilhas; the ficha if any, with the date it fades; "Os meus dados" (export, delete account, linked sign-ins).

### 4.9 Definições
Qualidade (Poupança, Normal, Alta) · Modo Poupança · Dados usados (session and month) · Som · Mão (direita, esquerda) · Tamanho do texto · Menos movimento · Conta · Regras da comunidade · Ajuda.

---

## 5. MONEY, SHOPS, WORK (Phase 4)

### 5.1 Buying
A shop sheet: items as rows with a small picture, name, price; a stepper; the total on a gold button ("Pagar 450 Mk"). Then the receipt prints. Not enough cash: the button says "Faltam 120 Mk" and is not gold.

### 5.2 The receipt
```
   ┌─────────────────────────┐
   │ Cantina da Mutamba      │
   │ 2 × pastel        300   │
   │ 1 × sumo          150   │
   │ ───────────────────     │
   │ Total          450 Mk   │   display type
   │ 14 Nov · 17:21 · ref 7K2F│
   └─────────────────────────┘
```
Tap to dismiss; it stays in Banco. A wage, a fine, a rent payment and a kixikila payout all use the same component.

### 5.3 A biscato (the minigame pattern)
Every minigame follows one shape: one line that says the goal ("Vende 8 coisas antes do sol se pôr"), a timer, a score, a single mechanic for one thumb, 60 to 120 seconds, an end card with the pay and what would have earned more. The server scores from the inputs; the client only draws.
- **Zunga:** walk the promenade, read what each passer-by wants from a small icon, tap the right item from the bacia in time.
- **Roboteiro:** carry stacked loads through the market without tipping; balance with the joystick.
- **Pescador:** cast, wait for the bob, pull against the fish with a rhythm.
- **Lavador:** scrub the dirt patches as cars come through.

### 5.4 Needs
When Fome or Energia falls under half, the thin bars appear. Under a fifth: a gentle line ("Estás com fome. Há uma cantina a 40 m.") and the compass points to food. At zero: fade to the hospital, a small bill as a receipt, back on your feet. Never a death screen.

---

## 6. HOME (Phase 5)
- **Visiting a room to rent:** walk inside it as it is, empty, with the rent and deposit on the context action ("Arrendar · 2 000 Mk por semana").
- **Build mode:** the camera lifts to three-quarter view; furniture from the Mochila as a tray along the bottom; drag to place on the grid, twist with two fingers or a rotate button, "Guardar". Each placed item shows a small eye (à vista) or a lock (guardado no cofre); tap to change. A line explains once why it matters.
- **Appliances:** each shows what it does in one line when placed ("A comida dura 3 dias"). When the light goes, lit windows go dark down the street and the home shows one line: "A luz foi. O gerador está a trabalhar." or "A luz foi. A geleira aguenta 2 horas."
- **Renting from a player:** the listing shows the owner's BI card, what is included item by item, the rent, the deposit and the rules, then one paper contract to sign. The tenant's Casa app shows the next rent date and "Sair do contrato"; the owner's shows each tenant, rent received and "Terminar com aviso".
- **The door:** shows the lock level to its owner; knocking rings the owner's Telemóvel; an invited kamba's context action says "Entrar".
- **Rent due:** a notice two days before, the day before and on the day, in Mensagens, never as a popup over play.

---

## 7. CRIME AND JUSTICE (Phase 7) · the screens that must be right
- **Heat on entry:** `<HeatLine>` once per visit to a hot block. In the Mapa, the Calor layer.
- **Attempting an offence** is never the default context action. It sits behind the "…" on a target and asks for a confirm that states the risk in plain words ("Se fores apanhado: multa até 3 000 Mk ou 12 min de cadeia.").
- **Assalto, the victim's view:** the world dims slightly, the offender's name is hidden, three large choices for one thumb: "Entregar" (shows the capped amount), "Resistir" (a short contest), "Fugir". A line under them: "Só te podem levar parte do que tens na carteira. O banco está seguro."
- **Arrombamento, the owner's view:** the Telemóvel rings: "Alguém está a forçar a tua porta em Kilamba." Actions: "Chamar a polícia", "Ir para casa". Afterwards a clear list of what was taken, what is insured, and "Fazer queixa".
- **Pursuit:** the compass shows the police; no stars, no meter. Losing them is breaking line of sight for long enough.
- **At the esquadra:** a paper charge sheet: the offence, what was returned to its owner, then two buttons of equal weight: "Pagar multa · 2 400 Mk" and "Cumprir · 10 min". 
- **In the cadeia:** a small yard interior; chat works; a work minigame shortens the time; a kamba outside can pay fiança from their Telemóvel. A clear timer. Leaving the game does not stop the clock.
- **The ficha:** on the BI, with the date it fades and what it closes meanwhile.
- **The novato shield:** a small blue shield on the wallet chip with days left; tapping explains it.

---

## 8. BUSINESS, SCHOOL, SOCIAL (Phases 8 to 10)
- **Leasing a lot:** stand in the empty shop; the context action shows rent and the alvará fee and wait.
- **The kitchen:** orders arrive as tickets on a rail; drag ingredients to stations; timing rings. Built on `<MinigameFrame>`, so a cook employee and the owner see the same thing.
- **Serving a player:** the customer sees the real menu at the owner's prices and pays the owner's till; both get a receipt.
- **Hiring:** a vacancy is a card (role, wage per shift, hours); applicants show their BI and certificates; "Contratar".
- **A lesson:** two to four minutes, one idea, a quiz of three questions or a small practical; a certificate prints onto the BI.
- **The horta:** stand on your ground and the context action is the next sensible thing ("Plantar", "Regar", "Colher"). Each bed shows its crop as the plant itself at its real stage, with one small tag only when it needs something. A seed packet shows days to harvest and the season. Harvest goes to the Mochila with its freshness as a number of days.
- **Animals:** a coop or pen you walk into. Each animal can be named. "Dar de comer" is one action for the pen. Eggs are picked up by hand.
- **The bancada:** set it down and arrange each thing by dragging it onto the board; write the price on a card with a stepper. From the street it is the goods that advertise it, not a floating icon. A passer-by's context action is "Ver a bancada".
- **The feira stall:** your produce laid out on a cloth; a price on a hand-written card for each; passers-by stop; players buy from you face to face.
- **The bank branch:** take a ticket, wait your turn on a bench (short), sit at the desk. Every product is one paper sheet: what you put in, what you get, when, and what happens if you do not pay, in plain words before "Assinar".
- **Kambas:** add from a player's BI card; the Contactos list shows who is online and where, with "Ir ter com".
- **Football:** at the campo, "Marcar jogo" opens a sheet (time, team size, who is in). The match is top-down three-quarter, a joystick and two buttons (passar, rematar), four minutes. The result is a card to keep.
- **A desafio:** an invitation card between two captains (place, time, a side, the pot). In the fight, participants carry their turma's colour and a small marker; a band at the top shows fighters standing on each side and the clock. A spectator's screen says once, "Estás a assistir. Ninguém te pode tocar." and offers cheer emotes; the crowd's noise shows as a rising meter both sides can see.
- **Kixikila:** a paper ledger for the group: members in order, the amount, who has received, who is next, who is late. Joining shows exactly what you commit to.
- **The discoteca:** the room shares one beat; dance emotes land on it; the DJ's sheet is two decks and a crowd meter.
- **A mesa de jogo:** the context action at a table is "Sentar". The board lies on the table in the world and rises to fill the lower two thirds of the screen; the faces of the other players stay visible above it. One thumb: tap the die, tap the piece. A turn timer as a thin band. People standing round see the board small and can react. Leaving mid-game asks once and hands your seat to an NPC hand. A table shows what it is before you sit: "A brincar" or "Aposta · 200 Mk cada", and the context action carries it ("Sentar · 200 Mk"). The pot sits on the table as a paper slip; the winner's share prints as a receipt.
- **Respeito:** never a bar on the HUD. It shows in the world (a neighbour says your name, the cantina's context action gains "A fiado") and as one line per bairro on the BI, in words ("Conhecido na Mutamba", "Da casa no Rangel").
- **Um turno:** after the opening minigame a paper slip prints: the job, when the shift ends, what it will pay. "Podes fechar o jogo. O turno continua." On return the wage prints as a receipt.
- **O culto:** the church door says "Entrar" and the hour of the next culto. Inside, the HUD is at its smallest: no wallet chip, no heat. "Cantar no coro" or "Sentar". The hymn's words appear as captions.
- **O casamento:** the invitation is a paper card in Mensagens with the date and the place. During the convoy the route band becomes white with ribbons. The photograph on the Marginal uses photo mode with the couple's names set in display type.
- **O Carnaval:** a band at the top shows the grupo on parade and the crowd's noise; a spectator's context action is "Aplaudir".
- **A rádio:** inside a van, a single caption line under the route band carries the song's name, the true news lines and dedicatórias ("Para a Weza, do Kiluanje: parabéns").
- **Um cartão para enviar:** any BI, receipt, result or photo has "Enviar". It becomes one image in the paper style with a short link and the line "Abre no telemóvel · 5,4 MB". The phone's own share sheet does the rest.
- **O Álbum:** in the BI app, pages of photographs with a date and a place under each. No empty frames, no counters.
- **Photo mode:** the HUD leaves; pose and expression pickers; a frame with the place name in display type; "Guardar no telemóvel" saves to the real device.

---

## 9. TRAVEL (Phases 11, 15, 16)
- **To another district:** at a gateway the context action carries the size ("Ir para a Ilha · 3,1 MB" or "· já tens"). The crossing is a ride or a walk across the causeway while the first chunks arrive.
- **To another province:** a ticket desk. A ticket shows mode, price, journey length and download size together. Train journeys can be sat through (a window, the landscape changing, chat with the carriage) or skipped.
- **Arrival in a province:** its name in display type, its sound, one line from a local NPC in the local language and Portuguese.
- **At a Wonder:** a marked viewpoint; the guide's story; the stamp pressed into the Passaporte with the house pattern.

---

## 10. CROSS-CUTTING STATES (define once, reuse)
For EVERY surface:
- **Loading:** megabytes and progress; a skeleton with the final layout's height; never a bare spinner.
- **Empty:** what would be here and the action that starts it.
- **Error:** what happened in plain Portuguese, "Tentar de novo", a short code ("ref K-2F9").
- **Reconnecting:** `<Banner>` "A ligar de novo…"; the world keeps drawing; your own actions queue and show a small clock; others freeze gently, they do not vanish. After 60 seconds: "Sem rede. Guardámos onde estavas." with "Tentar de novo".
- **Saving:** "A guardar" then "Guardado". Only the server's answer may say "Guardado".
- **Offline at open:** the shell opens from cache and says so; nothing playable is faked.
- **Low data (Modo Poupança):** a small leaf on the clock; streams off; downloads ask first.
- **Shielded (novato):** crime actions are absent, not disabled, with one line in the BI explaining why.
- **Jailed:** only the cadeia's actions exist.
- **Maintenance:** a kind full-screen page with the time it will end.
- **Version too old:** "Há uma versão nova. Actualizar (0,3 MB)".

A game is judged on its edge cases on a bad network at eleven at night.

---

## 11. RESPONSIVE, ACCESSIBILITY, LOCALISATION
- **Sizes:** portrait 360×640 (floor) · 360×740 (base) · 412×915; landscape 740×360 and up; tablet and desktop get the same HUD at a larger scale with a wider field of view, never a different design.
- **Controls:** touch first; keyboard and mouse complete on desktop (WASD, E for the context action, Tab for the Telemóvel).
- **Accessibility:** text size in three steps; left-handed layout; colour never alone; reduced motion; captions for every spoken or called line (the cobrador's call appears on the route band); the HUD's DOM labelled; a high-contrast HUD option.
- **Localisation:** `pt-AO` only at launch; ICU plurals ("1 minuto", "2 minutos"); context action labels at most 14 characters; currency, numbers and dates in Angolan format; names of real places never translated.
- **Voice of the copy:** short, warm, direct, second person singular ("tu"), the way a friend from Luanda would text. Angolan words from the glossary where they are natural, never forced into every line. No exclamation marks from the system; players supply those.

---

## 12. DATA SHAPES (so the client and the server agree early)
Typed in `packages/protocol` (messages) and `packages/db` (rows). The client reads the world only through `WorldProvider`; `LocalWorld` (Phase 1, stub S-1) and `NetWorld` (Phase 3) both implement it.

```ts
export type ProvinceId = string;                 // "ao-lua"
export type DistrictId = string;                 // "ao-lua/l1"
export type Mk = number;                         // integer Makuta, never a float

export interface PlayerPublic {                  // what other players may see. Nothing else leaves the server.
  id: string; name: string; biNumber: string; avatar: AvatarSpec;
  arrivedAt: string; homeDistrict: DistrictId | null; shielded: boolean;
}

export interface AvatarSpec {
  body: number; skin: number; face: number; hair: number; hairColour: number;
  top: string; bottom: string; shoes: string; accessory: string | null;   // item type ids
}

export interface EntityState {                   // one row of a snapshot, before delta packing
  id: number; kind: "player" | "npc" | "vehicle";
  x: number; y: number; z: number; yaw: number;  // millimetres, centidegrees
  anim: number; vehicleId: number | null; seat: number | null;
}

export interface InputFrame { seq: number; dx: number; dz: number; run: boolean; action: ActionIntent | null; }

export type ActionIntent =
  | { kind: "enter"; target: string }
  | { kind: "board"; routeId: string; stopId: string; actionId: string }
  | { kind: "buy"; shopId: string; lines: { itemType: string; qty: number }[]; actionId: string }
  | { kind: "minigame_input"; sessionId: string; t: number; data: number[] }
  | { kind: "offence"; offence: OffenceKind; target: string; actionId: string }
  /* … one variant per verb; every mutating variant carries actionId (the idempotency key) */;

export interface LedgerTransfer {                // append-only
  id: string; debitAccount: string; creditAccount: string; amount: Mk;
  reason: TransferReason; ref: string | null; actionId: string;
  provinceId: ProvinceId | null; districtId: DistrictId | null; createdAt: string;
  reverses: string | null;
}
export type TransferReason =
  | "wage" | "purchase" | "fare" | "rent" | "deposit" | "fuel" | "fine" | "fiance" | "tax"
  | "p2p" | "bank_in" | "bank_out" | "business_sale" | "business_wage" | "supply"
  | "insurance_premium" | "insurance_payout" | "theft" | "theft_return" | "fence" | "kixikila" | "hospital"
  | "grant" | "stake" | "fee" | "utilities";   // added in Task 0.3; the list in packages/economy is the source

export interface ReceiptView { title: string; lines: { label: string; qty?: number; amount: Mk }[]; total: Mk; at: string; place: string; ref: string; }

export interface Item { id: string; type: string; ownerId: string;
  location: { kind: "person" | "home" | "vehicle" | "business" | "evidence"; id: string };
  onDisplay: boolean; hotUntil: string | null; }

export interface HomeUnit { id: string; districtId: DistrictId; residenceId: string; number: number; layout: "quarto" | "t1" | "t2" | "vivenda";
  tenantIds: string[]; rentPerWeek: Mk; rentDueAt: string; lockLevel: 0 | 1 | 2 | 3; insuredUntil: string | null; }

export interface Business { id: string; districtId: DistrictId; lotId: string; ownerId: string;
  kind: "restaurante" | "cantina" | "barbearia" | "oficina" | "roulotte" | "discoteca";
  name: string; open: boolean; hours: [number, number]; tillAccount: string; rating: number | null; }

export type OffenceKind = "furto" | "carteirista" | "assalto" | "arrombamento" | "roubo_viatura";
export interface OffenceRecord { id: string; offenderId: string; victimId: string | null; kind: OffenceKind;
  districtId: DistrictId; at: string; outcome: "escaped" | "caught"; fine: Mk | null; sentenceMin: number | null;
  recoveredItemIds: string[]; }

export interface HeatCell { blockId: number; value: number; band: 0 | 1 | 2 | 3; }   // band is what the UI shows

export interface WorldProvider {
  join(district: DistrictId, channelHint?: string): Promise<JoinResult>;
  sendInput(frame: InputFrame): void;
  onSnapshot(cb: (s: Snapshot) => void): Unsubscribe;
  onEvent(cb: (e: WorldEvent) => void): Unsubscribe;
  clock(): WorldClock;
  leave(): Promise<void>;
}
```

Rules for these shapes: Makuta is always an integer; positions are integers; a client never sends an amount, a price or a result, only an intention; anything personal (phone, email, device) has no type here because it never reaches a client.

---

## 13. THE ESTÚDIO (staff console, Phases 3 and 12)
Light, dense, fast, desktop first. A left index: Jogadores · Canais · Moderação · Economia · Mundo · Packs · Plataforma · (Parceiros in Phase 17). Every page that shows a player's data asks for a reason first and writes the audit row. Every destructive action asks the staff member to type the BI number. A tunable change shows before and after and who approved it. A pack release shows its sizes per tier against the budget in green or red before the button is live.

---

## 14. BUILD ORDER FOR PHASE 1 (do in this sequence)
1. Tokens, the display font subset, the house glyphs for the HUD, `/styleguide` with every component in every state, the contrast test against a bright and a dark reference frame.
2. The renderer core with the Hora Dourada light on a test scene of twenty kit buildings; the three tiers; the bench path. **Measure on the reference phone before going further.** If it does not hold 30 fps here, nothing later will.
3. Chunk streaming and the data meter on that test scene.
4. The avatar: skeleton, three body types, eight hairstyles, the starter wardrobe, the core animations; the controller and the camera in both orientations.
5. `<WorldShell>`: joystick, look, the context action, the wallet chip (static), compass, clock.
6. L1 greybox by the atlas brief; walk it; fix scale until it crosses in three to four minutes and the landmarks sit where a Luandan expects.
7. Ambient life: the crowd, traffic, candongueiros on routes, boarding and riding with the route band, the cobrador's call.
8. `<PhoneSheet>` with Mapa and Definições; the `WorldProvider` seam with `LocalWorld`.
9. The front door: landing, loading with megabytes, the service worker, install.
10. L1 art pass 1, then pass 2 on the six landmarks.
11. Measure everything in `docs/BUDGETS.md` on the reference phone. Run the founder's look test with five Luandans. Only then call Phase 1 done.

Ship Phase 1 as a link you can send to anyone in Luanda: they open it, it costs them under 6 MB, and within a minute they are standing on the Marginal at golden hour saying where they are. Everything after that is building a life in a place people already believe in.

---

*Last updated: 2026-11-14 · Version 1.0 (Hora Dourada) · Working name: Nzila*
