# Nzila

Before doing anything in this repository, read these in order:

1. `TO_START_EVERY_SESSION.md` (context, current state, decisions, stack, non-negotiable rules)
2. `ROADMAP.md` (the phase and task you were given, with its `Depends on` lines)
3. `UX_UI_SPEC.md` (when the task has anything a player sees)
4. `docs/reference/WORLD_ATLAS.md` (when the task touches world content, districts or provinces)
5. `docs/GROWTH_PLAN.md` and `docs/reference/MARKET_NOTES.md` (when the task touches the front door, sharing or anything public)
6. `docs/PHASE_N_PLAN.md` for the active phase, if it exists

Then:

- Check the task's `Depends on` line. If a dependency is not ticked, stop and say so.
- Player-facing text is Portuguese of Angola and lives in `packages/i18n`. Code, comments and commits are English.
- The client proposes, the zone decides, the API records. Never trust the client.
- No Makuta moves outside the ledger.
- Nothing is done until it is measured against the reference-phone and data budgets.
- When a phase ships, follow the doc convention in `TO_START_EVERY_SESSION.md`.
- When a task changes something visible, run `pnpm build` then `pnpm shots <task-label>`: screenshots go to `screenshots/<task-label>/` (not in git), and you look at every one of them (the `todas_N.png` sheets are for this) before calling the task done.
- A bug, a gap or an idea found while working on a task is never lost: fix it in the task when you can, and record it in `docs/FINDINGS.md` either way (the convention is at the top of that file).

Two gates (the founder, 2026-11-21):

- **Before any commit, the quick gate: `pnpm test:quick "<names of the browser tests of what changed>"`** (a few minutes: types, lint, unit tests with coverage, house rules, integration tests, the build and its budget, then on the Android profile the three browser tests every player passes through and those named). After a change to `art/scripts`, rebuild that pack first; after a change to a kit file (`kit*.py`), rebuild every bairro (`pnpm pack:bairros`): they all draw from it (F-282).
- **When a whole piece of work is done (a bairro, a phase), and always before anything reaches players, the full gate: `pnpm test:all`** (about half an hour: everything, both phone profiles, every browser's engine, every pack rebuilt).

Say in each report which gate a commit went in on. A commit made on the quick gate may carry a fault that only the full gate finds: that is the trade, and it is why the full gate is never skipped at the end.
