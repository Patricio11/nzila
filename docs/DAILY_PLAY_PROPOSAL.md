# What brings a player back tomorrow: a proposal

For the founder, 2026-11-18. Asked: "daily missions, really fun and great, that will keep the user coming back". Nothing here is decided. Each part says what it needs that is not built yet, and the questions at the end are the founder's to answer.

## The rule this has to keep

The plan already says how Nzila brings people back (Task 10.10): *"A reason to open the game today that is not a reward for logging in"*, and the Álbum *"is found, not ticked off"*. The competitor has a daily chest, a wheel, daily goals and a streak of 7, 30, 100 and 365 days (`MARKET_NOTES.md` §1e). Those work for a week and then they are a chore that punishes a missed day. So the test for every idea below is one question: **is it something a person in the bairro would really be asked to do, or would really want to do, today?** If it is only a box to tick, it is not ours.

So the daily missions are not called missions. They are **recados**: the errands the bairro asks of you, the way a neighbour leans out of a window and says "Filho, passa na cantina e traz-me carvão".

## 1. Os recados do dia (the core)

Every morning (game day, which is a real day), **three people of your bairro ask you for something**. They are the people of the street who already have names (`npc.name.*`) and places they stand: the zungueira at the corner, the kota at the chess table, the dona of the cantina, the cobrador at the paragem.

They ask by **message on the Telemóvel**, in a new app, **Recados**, that looks like the chat everyone in Luanda uses: a photo, a name, a short message, sometimes two. "Bom dia filho. Passa na cantina e traz-me um saco de carvão, depois pago-te. Tia Rosa". The place shows on the Mapa and on the compass in gold.

Each recado is done **in the world, with your hands, in under three minutes** (the Three-Minute Rule):

| Kind | What you do | What it uses |
|---|---|---|
| **Traz-me** | Buy something and take it to someone: carvão to Tia Rosa, pão to the kota at the chess tables, velas before the light goes | The cantina, the Mochila, giving (built today); giving to a person of the street (new) |
| **Leva isto** | Someone gives you a parcel to take to someone at another paragem: you ride the candongueiro there | Riding (built); a parcel item that cannot be sold or opened (new) |
| **Vai ver** | "Vai à Mutamba ver se o meu sobrinho já chegou": go somewhere and come back with the answer | The Mapa, the compass (built) |
| **Guarda** | "Não andes com tanto dinheiro na rua": put money in the Banco at a caixa | The caixa (built) |
| **Uma mão** | A biscato for someone: wash the plates, carry the load at the paragem | Biscatos (4.5) |
| **Cumprimenta** | "O filho da vizinha chegou ontem, vai dizer-lhe bom dia": greet a newcomer (a real player who arrived in the last three days) | Greetings and meeting (built) |

**Paid as the bairro pays:** a little Makuta from the person (from the faucet, through the ledger, with the zone's word that it was done), sometimes a thing instead ("Toma, leva uma gasosa"), and later Respeito with that person (10.10). Never a chest, never a wheel, never a number going up on the screen. The amounts are small and taper: the recados are a reason to walk the bairro, not a job.

**Missed a day?** Nothing is lost. Tomorrow there are three new ones. Tia Rosa does not sulk.

## 2. O prato da família (once a day, at home)

The competitor's "ask your parents for money" once a day is, in the market notes' words, *warm and Angolan and worth having*. Ours, in our own form: **once a day, at home, your family gives you a plate of food and a little for the taxi**. The mother or the aunt in the kitchen (the family that gave you the house, D-3.13): "Come antes de saíres. Toma, para o táxi". It fills Fome (4.4) and puts the fare for the day in the Carteira.

It makes home matter (you live where you were born, D-3.12) and it gives the first minute of every day a warm place to happen. It is the same for a rich family and a poor one in kind, not in amount: the plate is funge or it is a full table, and the taxi money is 200 Mk or 2.000 Mk, by the family's table.

Needs: the family's house as a place you wake (D-3.13, Phase 5), Fome (4.4). Before the house exists it can be the family's message in Recados: "Passa cá em casa para comer".

## 3. O cartão da cantina (the streak, done the Luanda way)

A streak is real in Luanda, only it is not called that: **the cantina's loyalty card**, a small card the dona stamps every day you buy something. **Seven stamps and the next pão is on her.** Then a new card.

What makes it ours and not a chore: the stamps do not need seven days in a row. A missed day costs nothing; the card just fills slower. It lives in the Mochila as a thing you can look at, with the dona's stamp in red, and it is per cantina, so your cantina becomes *your* cantina. After a few cards the dona knows your name (I-26), and with Respeito she sells to you a fiado (10.10).

Needs: only what is built today and a stamp on the receipt. **This one can be built next, in a day.**

## 4. A missão a dois (strangers become kambas)

Phase 10's goal is "reasons to come back that are other people". The single strongest reason a player comes back is someone they met. So **one recado a day needs two players**, and it is the one that pays best:

- "Partilha uma gasosa": buy two, give one, drink together (built today, nearly: giving exists).
- "Apanhem o candongueiro juntos até à Mutamba" (riding together is built).
- "Joguem uma partida de Não te irrites na esplanada" (4B.1).
- "Levem as cadeiras para a festa": a load too heavy for one (with 4.5).

Anyone in the bairro doing the same recado sees the others who have it (a small gold mark over their heads, only for this), so two strangers have a reason to walk up to each other. That is the moment the game is for.

Guarded as money already is: both must be real players, not the same phone, not two accounts of one person (one grant a phone, D-4.11); the pair pays once a day per pair; never across a block.

## 5. O que se passa hoje (the bairro has a day)

Every day the bairro has one thing happening, run from the Estúdio's calendar (Task 10.10's "the week has a shape"), shown in the morning in Recados as **"Hoje na banda"**:

- **"Hoje a luz vai às 19h."** At seven the street lamps and the windows go dark across the bairro. Velas sell at the cantina all afternoon (her line "Ontem a luz foi. As velas estão a sair muito" was written for this). A player with velas in the Mochila lights the way for whoever walks beside them. A *apagão* is the most Angolan event there is, and it costs us nothing but a switch on the lighting.
- **"Chegou pão quente às 7h"**, "Chegou peixe fresco" (with the Ilha), "Há jogo no campo às 17h" (with 10.3), "Sexta à noite: kizomba no largo" (with the discoteca), "Domingo: almoço de família" (the plate is bigger).

These are not rewards. They are the street being alive, and they are why tomorrow is not the same as today.

## 6. A festa do bairro (the week's story, all together)

Once a week, **one goal for everyone in the bairro together**, because everyone in an area is together (D-3.12): "O Kota Zé faz anos no sábado. O bairro está a preparar a festa". During the week every player's recados feed one shared bar on the Largo's board: *gasosas juntas 340 de 500, cadeiras 40 de 60, convidados 85*. On Saturday evening the festa happens in the street, with music and the people of the street dancing, and **everyone who helped is in the photograph** (the Álbum). Whoever did not help can still come; they are just not in the photo.

This is the strongest of all, and the most work: it needs a party in the street, music, the board on the Largo, and enough players in a bairro for the bar to move.

## What it costs and what it needs

| Part | Needs first | Size |
|---|---|---|
| 3. Cartão da cantina | Nothing new | A day |
| 1. Recados (traz-me, vai ver, guarda, cumprimenta) | Giving a thing to a person of the street; the Recados app; the zone deciding a recado is done | About a week |
| 4. Missão a dois (gasosa, candongueiro) | Recados | Two or three days after 1 |
| 5. Hoje na banda: o apagão | Recados; a lighting switch for the district | Two days |
| 2. O prato da família | The family's house (Phase 5), Fome (4.4) | With Phase 5 |
| 1. Uma mão | Biscatos (4.5) | With 4.5 |
| 6. A festa do bairro | Recados, a party in the street, the Álbum (10.10) | Two weeks, before or at the alpha |

Every reward goes through the ledger from a named faucet with a daily cap that tapers (the same rule as biscatos, 4.5). The zone decides that a recado was done; the phone never says so; the API pays once by the recado's own key. A recado's message is a few hundred bytes. Notifications only to those who said yes (they are off by default): at most one a day, and only in a person's voice ("A Tia Rosa ainda espera pelo carvão"), never "Volta! Tens recompensas".

## Questions for the founder

1. **Recados as messages from the people of the bairro, in a new app on the Telemóvel.** Yes, or another way of asking?
2. **The cantina's stamped card instead of a streak.** Build it next?
3. **The missão a dois: one a day that needs another player, paying best.** Yes?
4. **The apagão as a daily event** (the lights of the whole bairro go out for an evening and candles matter). Too much, or exactly right?
5. **The festa do bairro**, one goal a week for the whole bairro: before the alpha, or after?
6. **Where it goes in the order.** Proposed: the cantina's card now; recados and the missão a dois right after Task 4.4 (needs) and 4.5 (biscatos), so that the alpha measures them; the festa with the alpha.
