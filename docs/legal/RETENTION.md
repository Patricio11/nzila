# Retention: what is kept, and for how long

One row per table (Task 0.10). **The periods are proposals written by the developer, not legal advice.** Counsel reviews them against Lei 22/11 (Angola) and POPIA (South Africa) before the alpha (Waiting on the founder, item 7; `docs/FINDINGS.md` F-22). A table added by a migration gets its row here in the same commit.

"Deleted with the account" means: when a player deletes their account, or a guest is inactive for the period given for `players`, the row is removed or stripped of everything that could identify the person.

| Table | What it holds | Personal data | Kept for | How it ends |
|---|---|---|---|---|
| `provinces`, `districts`, `packs` | The world | None | As long as the game runs | Never deleted |
| `players` | One row per player: status, in-game name, BI number, age band, last position, Fome and Energia; for linked accounts an encrypted phone number and its keyed hash | Yes | While the account lives. A guest who has not played for 12 months is deleted. | Deleted with the account: the row is kept with `status = 'deleted'` and every personal column emptied, so the ledger rows that point at it stay valid and anonymous |
| `devices` | A keyed hash of each device a player used; never the device id | Pseudonymous | 12 months after the device was last seen | Deleted by a scheduled job, and with the account |
| `player_sessions` | A hash of each session token | Pseudonymous | 30 days after it expires or is revoked | Deleted by a scheduled job, and with the account |
| `avatars` | How the player's avatar looks | No, but tied to a player | While the account lives | Deleted with the account |
| `player_origins` | The card a player was dealt at first play: the family, the province, the bairro, the Makuta they start with | No, but tied to a player | While the account lives | Deleted with the account. What was paid of it stays in the ledger, anonymous |
| `consents` | Each yes and no a player gave, with the version of the words shown | Yes: it is the proof of consent | 5 years after the account is deleted | Deleted by a scheduled job. Kept past the account because it is what shows that the player agreed |
| `staff`, `staff_roles` | Staff accounts and their permissions | Yes (staff) | While employed, then 2 years | Disabled at once on leaving; deleted by hand after the period |
| `audit_log` | Who did what to whom, and why | Staff ids; player ids as subjects | 5 years | Append-only: it cannot be edited or emptied. Rows past the period are removed by a migration reviewed for the purpose, never by a job with standing permission to delete |
| `feature_flags` | Switches | None | As long as the game runs | Edited through the Estúdio, each change audited |
| `ledger_accounts`, `ledger_transfers`, `balances` | Every movement of Makuta | Account ids contain a player id | As long as the game runs | Never deleted: the books must always add up to zero. When an account is deleted the player row is anonymised, which makes these rows anonymous too |
| `login_codes` | A keyed hash of each one-time code sent to prove an address, with when it expires | Pseudonymous | Minutes in use; **the rows are not yet swept** (F-229) | To be deleted a day after they expire |
| `staff_sessions` | A hash of each staff session token | Pseudonymous (staff) | Twelve hours in use; **the rows are not yet swept** (F-229) | To be deleted thirty days after they end |
| `chat_lines` | Every line said in the street, passed on or refused, with how many heard it | Yes: what a player wrote | 30 days | Deleted by the zone's daily sweep. A line copied into a report lives with the report. After an account is deleted, its lines stay their 30 days under a player who is nobody |
| `player_blocks` | Who shut out whom | Player ids | While both accounts live | Deleted with either account. Blocking also ends a kamba between the two |
| `reports` | A player's report, the reported player's last lines (and what they wrote the reporter in Mensagens) copied as they were | Yes | Until closed, then 90 days | Deleted by the zone's daily sweep after the 90 days |
| `sanctions` | Mutes, suspensions, bans and kicks, each with its reason | Player ids, staff ids | While the account exists; a lifted one stays, marked lifted | The player reads them in "Os meus dados" |
| `items` | Each thing a player holds, where it is | Player ids | While it exists in the game | Eaten, given or sold, it goes; an account's things stay under a player who is nobody |
| `receipts` | Every purchase's receipt, line by line | Player ids | As long as the game runs, as the ledger | Never deleted: each matches a ledger transfer |
| `recados_feitos`, `cartoes_cheios` | Which of the day's errands a player did, and the cantina's stamp cards | Player ids | As long as the game runs | Never deleted: each payment matches a ledger transfer |
| `partidas`, `partida_lugares` | Every game finished at a table with a player at it: where, which game, each seat's player or kota, the result and the points before and after | Player ids | As long as the game runs | A deleted account's games stay, as games, under a player who is nobody |
| `classificacao` | Each player's points, games, wins, draws and losses at each game in each bairro | Player ids | While the account lives | Deleted with the account; in "Os meus dados" |
| `kamba_pedidos`, `kambas` | Who asked whom to be a kamba; who are kambas, since when, and whether a conversation is muted | Player ids | While both accounts live | Ended by either (Deixar de ser kamba, Bloquear) and deleted with either account; in "Os meus dados" |
| `mensagens` | What kambas wrote to each other, and when it was read | Yes: what a player wrote | 30 days, as what is said in the street | Deleted by the zone's daily sweep. What the reported player wrote the reporter is copied into the report. In "Os meus dados", what the player wrote and to whom by BI number |
| `schema_migrations` | Which migrations ran | None | As long as the game runs | Never deleted |

## Not in the database yet

| What | Planned rule | Task |
|---|---|---|
| Analytics events | No player id; sampled; 13 months | 4B.4 |
| Real-money purchases | As tax and consumer law require; in their own store, never in the ledger | 14B |
