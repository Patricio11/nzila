# Phase 1 plan: Primeiro Passeio

**Opened 2026-11-14.** Goal, from the roadmap: on a real cheap phone, open a link and within a minute walk the Marginal of Luanda at golden hour, ride a candongueiro, see the bay, open the Telemóvel. No server. This phase answers the question that matters first: does it look and feel better than what exists, on the phone people own?

Dependency gate: Phase 0 complete (`docs/completed/PHASE_0_COMPLETE.md`). The first district is L1, Marginal e Baixa (`WORLD_ATLAS.md` §2).

## Recheck of each task's dependencies

| Task | Depends on | State |
|---|---|---|
| 1.1 Renderer core and the Hora Dourada look | 0.9 | Ready |
| 1.2 Chunk streaming with a data meter | 0.6, 1.1 | After 1.1 |
| 1.3 The avatar | 0.2, 1.1 | After 1.1. Needs a CC0 base rig read and filed before a file is imported (Q4), and the founder's kuduro video for one emote (not blocking the rest) |
| 1.4 Touch controls and the HUD shell | 0.7, 0.8, 1.3 | After 1.3 |
| 1.5 District L1 | 0.6, 1.1, 1.2 | After 1.2. Greybox needs nothing from the founder; art pass 2 on the six landmarks needs his photographs (Waiting, item 3) |
| 1.6 Ambient life | 0.2, 1.5 | After 1.5. The cobrador's call needs the founder's words |
| 1.7 The Telemóvel shell | 0.7, 0.8, 1.4 | After 1.4 |
| 1.8 The front door and the PWA | 1.2 | After 1.2 |
| 1.9 Wiring, verification, doc convention | 1.1 to 1.8 | Needs the reference phones, one iPhone, and five Luandans (Q1, Q7) |

Order of work: the build order of `UX_UI_SPEC.md` §14. Its step 1 (tokens, the typeface, glyphs, the styleguide, the contrast test) was done in Task 0.7.

## Open questions

**Q1. There is no reference phone.** Step 2 of the build order says: measure on the reference phone before going further; if it does not hold 30 fps there, nothing later will. The two units have not been bought.
*Recommendation:* go on, measuring three ways until they arrive: the phone profile in the gate; the founder's own phone on `/bench` over wifi, whatever model it is; and a note in every measurement of which of the two it came from. Buy the units before 1.9. If the founder's phone is mid-range or better, treat its numbers as an upper bound, never as a pass.

**Q2. How heavy is the renderer?** Three.js is the largest thing the client will load. The shell budget is 300 KB and stands at 51 KB.
*Recommendation:* see D-1.2.

**Q3. Which camera ships?** D-0.29 fixed the order of preference (free; street-level follow; fixed three-quarter) and said the choice is made by measurement at step 2.
*Recommendation:* build the camera module with the first two from the start; decide on the numbers of Q1.

**Q4. The base rig.** The roadmap names Quaternius's universal base characters as first candidate, and says: read the licence at the source and file it before a file is imported.
*Recommendation:* do exactly that at the start of 1.3; if the licence is not plainly CC0 or the rig does not suit a phone (bone count), say so and bring two alternatives.

**Q5. How is distance drawn?** (F-34, F-18.) Impostor cards, or only the reduced models fading into haze.
*Recommendation:* see D-1.4.

**Q6. Greybox first, or model first?** (Idea I-6.)
*Recommendation:* see D-1.5.

**Q7. What can be done without the founder, and what cannot.** Building 1.1 to 1.8 needs him for words (place names with wit, the cobrador's calls) and for his eye on every screen and model (D-0.23), not for code. Task 1.9 needs him entirely: the real phones and the look test with five Luandans.
*Recommendation:* see D-1.6.

**Q8. Sound.** The cobrador's call is the district's signature and must come from a real one.
*Recommendation:* build the sound system and its visual twin (the route band) with a marked placeholder; no invented call ships. The founder records or writes the calls.

**Q9. Kit models for art pass 1** (stub S-2).
*Recommendation:* choose a CC0 kit at the start of 1.5, file its licence in `docs/legal/ASSET_LICENCES.md`, and keep every kit model behind the pack's `artPass` so none reaches the public below pass 2 on a landmark.

## Decisions

**D-1.1 The order of work is the build order of the spec, §14 (delegated, 2026-11-14).** Renderer and bench first; streaming; avatar and camera; the HUD shell; the L1 greybox; ambient life; the Telemóvel; the front door; then art.

**D-1.2 The renderer is its own download, counted against the shell (proposed).** Three.js and the game's render code load as a separate chunk after the front door is on screen, so the first paint stays at 17 KB. The budget of 300 KB is held for the front door and the renderer together; `pnpm budget` reports both. If the renderer cannot fit, that is reported with the numbers before anything is cut.

**D-1.3 Until the reference phones arrive, every frame-rate number says where it came from (proposed).** "Profile" for the slowed browser, "founder's phone" with its model, "reference" only for the real units. Nothing is called measured on the reference phone until it is.

**D-1.4 Distance is haze first (proposed; built so in 1.1 and 1.2).** At Poupança a chunk beyond the near range is drawn at its second level of detail and fades into the distance haze, which is also what hides streaming. Impostor cards are added only if the bench shows the second level is too dear at 90 m. This keeps the pipeline simple and suits the look: far buildings as silhouettes at golden hour.

**D-1.5 L1 is walked as a greybox before it is modelled (proposed).** The district is first built from the atlas brief as boxes and a hand-written walk grid, and walked on a phone. Its scale and the places of the landmarks are corrected with the founder before any modelling. A district that is wrong in greybox is cheap to fix; one that is wrong in art is not.

**D-1.6 Phase 2 may open when 1.1 to 1.8 are built (founder, 2026-11-14).** The founder said to carry on into Phase 2 once Phase 1 is done. The parts of 1.9 that only he can do, the measurement on the reference phones and the look test with five Luandans, stay open and are not skipped: they are recorded as open in the Phase 1 completion document, and nothing is shown to the public (Phase 4B) before both are done. *The wording of this decision is mine; the founder's words were: "After you done with Phase 1 you can commit and continue to Phase 2 alright just make sure."*

## What "done" means for this phase

From the roadmap, Task 1.9: first play under 6 MB and under 60 seconds on a slow network; 30 fps on the bench path; input response and memory inside their budgets; the same walk on one real iPhone; and five Luandans who have never seen it name where they are without being told.
