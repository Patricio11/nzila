# Retention: what is kept, and for how long

One row per table (Task 0.10). **The periods are proposals written by the developer, not legal advice.** Counsel reviews them against Lei 22/11 (Angola) and POPIA (South Africa) before the alpha (Waiting on the founder, item 7; `docs/FINDINGS.md` F-22). A table added by a migration gets its row here in the same commit.

"Deleted with the account" means: when a player deletes their account, or a guest is inactive for the period given for `players`, the row is removed or stripped of everything that could identify the person.

| Table | What it holds | Personal data | Kept for | How it ends |
|---|---|---|---|---|
| `provinces`, `districts`, `packs` | The world | None | As long as the game runs | Never deleted |
| `players` | One row per player: status, in-game name, BI number, age band, last position; for linked accounts an encrypted phone number and its keyed hash | Yes | While the account lives. A guest who has not played for 12 months is deleted. | Deleted with the account: the row is kept with `status = 'deleted'` and every personal column emptied, so the ledger rows that point at it stay valid and anonymous |
| `devices` | A keyed hash of each device a player used; never the device id | Pseudonymous | 12 months after the device was last seen | Deleted by a scheduled job, and with the account |
| `player_sessions` | A hash of each session token | Pseudonymous | 30 days after it expires or is revoked | Deleted by a scheduled job, and with the account |
| `avatars` | How the player's avatar looks | No, but tied to a player | While the account lives | Deleted with the account |
| `player_origins` | The card a player was dealt at first play: the family, the province, the bairro, the Makuta they start with | No, but tied to a player | While the account lives | Deleted with the account. What was paid of it stays in the ledger, anonymous |
| `consents` | Each yes and no a player gave, with the version of the words shown | Yes: it is the proof of consent | 5 years after the account is deleted | Deleted by a scheduled job. Kept past the account because it is what shows that the player agreed |
| `staff`, `staff_roles` | Staff accounts and their permissions | Yes (staff) | While employed, then 2 years | Disabled at once on leaving; deleted by hand after the period |
| `audit_log` | Who did what to whom, and why | Staff ids; player ids as subjects | 5 years | Append-only: it cannot be edited or emptied. Rows past the period are removed by a migration reviewed for the purpose, never by a job with standing permission to delete |
| `feature_flags` | Switches | None | As long as the game runs | Edited through the Estúdio, each change audited |
| `ledger_accounts`, `ledger_transfers`, `balances` | Every movement of Makuta | Account ids contain a player id | As long as the game runs | Never deleted: the books must always add up to zero. When an account is deleted the player row is anonymised, which makes these rows anonymous too |
| `schema_migrations` | Which migrations ran | None | As long as the game runs | Never deleted |

## Not in the database yet

| What | Planned rule | Task |
|---|---|---|
| Sanctions (mute, suspend, ban, kick) | Kept while the account exists: a moderator judging a second report must see the first. Each has its reason; a lifted one stays, marked lifted. The player reads them in "Os meus dados" (what, when, why; not which moderator). **Built 2026-11-17.** What happens to them when an account is deleted is not decided (they stay under a player who is by then nobody) | 3.8 |
| Staff sessions | Twelve hours, then dead; the rows are not yet swept | 3.8 |
| Chat messages | Kept for moderation for 30 days, then deleted; a message attached to a report is kept until the report is closed, then 90 days. **Built 2026-11-17:** every line sent to the street, said or refused, is in `chat_lines`; the last twenty lines of a reported player are copied into the report as it is made; the zone deletes lines after 30 days and closed reports after 90, as it starts and every hour (`expireTalk`). A deleted account's lines stay their thirty days under a player who is by then nobody. | 3.6 |
| Reports and moderation decisions | 2 years after the decision | 3.6, 3.8 |
| Analytics events | No player id; sampled; 13 months | 4B.4 |
| Real-money purchases | As tax and consumer law require; in their own store, never in the ledger | 14B |
