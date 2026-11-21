# Phase 10 plan: the lines brought forward

*Goal (roadmap): life with other people.*

Phase 10 is not open. **Two of its lines are built now**, in the founder's order after Phase 4 (D-4.8 to D-4.10): *Convidar para sair* and giving a gift, the first two lines of 10.13, after hailing a ride (6.2, D-6.5) and before the second bairro (Zango, 11.1 and 11.2). The rest of 10.13 (namoro on the BI, the wedding, the shared home) waits for its dependencies (5.4, 10.7, 10.12) and for Phase 10 to open.

## The recheck: what the two lines stand on

| Needs | Where it is | State |
|---|---|---|
| A player's sheet, with block and report on it | `apps/client/src/conversa/sheet.tsx` | Built (3.6, 4B.2) |
| An ask the other answers in one tap, limited per hour, never across a block | the tables' invitation (4B.1): `apps/zone/src/mesas.ts`, `apps/client/src/mesas/ui.tsx` | Built; the pattern to follow |
| Each player's age band | `players.age_band` (Phase 2) | The zone learns on entry whether a player is 18 or over, and nothing else (`adultOf`, 2026-11-21) |
| Things bought in a shop, through the ledger | `buy` in `packages/db/src/items.ts`, `/v1/shop/buy` | Built (4.2, 4.3) |
| A thing handed to someone | `/v1/items/give`, "Dar uma coisa" on the sheet | Built, but **nothing records it and the one given to is never told** |
| Things that are gifts | | **None**: the only shop is the cantina, food and the house |
| Places to go in the bairro | the pack's points of interest | The Marginal's miradouro, pontão, gelados, Largo |
| A ride for two | `apps/zone/src/corridas.ts` | The táxi takes two (2026-11-21); the moto and the kupapata one |

## Decisions

**D-10.1 The gifts are sold at a banca by the mercado (founder, 2026-11-20).** A stall near the Largo's mercado, a shop like the cantina (a point of interest whose glyph is `banca`, `SHOP_GLYPHS`), selling **ramo de flores 500 Mk, perfume 2.500 Mk, pano 3.000 Mk** (the roadmap's "capulana" is Mozambique's word: in Luanda the cloth is *pano*; confirmed by the founder, 2026-11-20) (founder's prices; `shops.json`, kind `banca`). They are items of a new kind, `presente`, bought through the ledger as everything is, carried in the Mochila, and handed over with "Dar um presente" on the other's sheet. The chocolate and the rebuçados of the cantina are gifts too. A phone as a gift waits for Phase 5's phones.

*(D-10.1 built 2026-11-20: `kit_baixa.banca_de_presentes`, the place `banca-mercado` (glyph `flores`), items of kind `presente`, the shop kinds `banca` and `gelados` in `shops.json`; the shop's sheet takes its paint and its keeper's words from the kind of shop. The card of the house stays the cantina's alone.)*

**D-10.2 A gift is recorded and the one given to is told (delegated).** Every thing handed from one player to another is written down (`presentes`: who, to whom, what, how many, when): for the one given to ("Ana deu-te um ramo de flores."), for moderation (things passed to move value, the same watch as 4B.1's stakes), and for the Álbum later (10.10). A thing given cannot be given back within the hour to the one who gave it (no ping-pong of value). *Recommendation: yes.* *(Built 2026-11-20: migration 0016, `giveThings`, `lastPresente` on `/v1/me/balance`; a gift is for every age and needs no kamba, as a gasosa shared never did.)*

**D-10.3 Convidar para sair is the zone's, for two adults only (delegated, D-0.34).** On the sheet of someone in the street, "Convidar para sair" appears only when **both** are 18 or over and neither has blocked the other: the zone learns each player's age band on entry (the API's card says only whether the button is there, never the other's band). The ask names a place; the other answers "Vamos", "Agora não", or another of the places ("Prefiro o Miradouro"), and the first answers that the same way: they choose together. Saying no costs nothing and says nothing more than "Agora não". Limits: three asks an hour, and someone who said no is not asked again by the same player for half an hour. Never across the age bands and never across a block, checked by the zone at every step. *Recommendation: yes.*

*(D-10.3 built 2026-11-21: `apps/zone/src/saidas.ts` keeps the rules (three asks an hour, half an hour after a no, an ask forgotten after ninety seconds, one outing at a time); the room checks the two are adults and not shut out at every ask and every answer, and says "Agora não dá." the same whichever it was. The card's `sair` is the API's word on whether the button is there. On the phone: `apps/client/src/sair/`, fetched when a card is opened or an ask arrives. An answer with another place is not counted against the hour.)*

**D-10.4 The places of an outing are the bairro's (founder, 2026-11-20).** In the Marginal: **o Pontão ao pôr do sol, o Miradouro, os gelados, o Largo**. A shopping, a restaurant, the cinema, the campo and a hospedaria are added as each is built (the hospedaria is a door that closes: nothing is shown or described). At the gelados, a gelado is bought like anything else and may be given (D-10.1, D-10.2). *(Founder, 2026-11-20, with a picture: "na geladaria tem que ter mesa e cadeiras". Built: the Geladaria da Marginal, west of the kiosk row, `kit_baixa.geladaria`: its counter under a striped awning, and a deck of tables and plastic chairs under sunshades; the chairs are seats, so the two of an outing sit down together. A pack marks a place for an outing with `outing: true` and gives it two more words, how the chooser names it and how one goes to it: "O Pontão ao pôr do sol" / "ao Pontão", "O Miradouro", "Os gelados", "O Largo" (the tables of the Largo).)*

**D-10.5 They really go: on foot, or a táxi for two (founder, 2026-11-20).** Agreed, both have the place on the compass and a chip says who they are out with and where. Either may call a táxi for two from the chip (300 Mk, the táxi's fare, paid by whoever calls it): it comes as D-6.5's do, both get in the back, and it sets them down together. When both stand at the place: "Chegaram ao Pontão." The outing ends when either ends it, when they have been apart a while, or at the day's end.

*(D-10.5 built 2026-11-21: the place is a gold mark on the compass and a chip under the wallet ("A sair com Ana · Os gelados · 28 m"); pressed, the chip offers "Táxi para dois · 300 Mk" and "Terminar a saída". The táxi comes as any ride does; each gets in with the gold button, the caller on one side of the back seat and the other beside them; it goes when both are in, or with the caller alone when its wait runs out; it sets them down a step apart. Arrived is both within twelve metres of the place. Apart is more than seventy metres for four minutes; the day's end is forty-five minutes for now (F-268). Someone who leaves the street ends it, and the other is told.)*

**D-10.6 Gestures for two: the aperto de mão for anyone, the abraço between two adults (founder, 2026-11-21).** Asked for by a competitor's players ("não dá para abraçar", "dar um aperto de mão": `docs/reference/MARKET_NOTES.md` §1g) and agreed by the founder the same day. From someone's card, "Aperto de mão" and, where both are 18 or over and neither has shut the other out (the same word of the API as "Convidar para sair"), "Abraço". The other is asked and answers in one tap; nothing is made without the yes; a no says only "agora não". Made, the two turn to each other and come together on every phone that sees them. The zone decides all of it (within arm's reach, on foot, not across a block, never a hug across the age bands, one offer a second), and **a handshake is a greeting: the two have met**, as after a wave answered. *(Built 2026-11-21: `MSG.A_DOIS`, `EVENT.A_DOIS`, `aDois` in `apps/zone/src/room.ts`; the poses with the other gestures in `apps/client/src/render/dancar.ts`; the ask and the prompt in `apps/client/src/sair/`.)* More of them (a kiss on each cheek, dancing as two) wait for the founder's word.

**D-10.7 An outing lasts at most 45 minutes, and that is a safety, not a rule of play (delegated; the founder: "you should handle this", 2026-11-21).** A game day is 60 real minutes. An outing ends when the two part, when one leaves the street, or when either says so; the 45 minutes only close one that was forgotten open. Tying it to the game's midnight was looked at and left: two who went out at 23h would be parted in two minutes for no reason they could see.

## Open questions

- **Q1 Namoro on the BI** and the rest of 10.13: when Phase 10 opens.
- **Q2 What an outing leaves**: a photograph in the Álbum (10.10) when it exists.
