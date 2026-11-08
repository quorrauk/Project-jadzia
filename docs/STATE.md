# State

Read this first every session.

## Status

Phase 1 steps 1-5 done and on `main`: skeleton, solver, profiles and levels, workshop, lesson engine, all six Arc 1 projects, and a theme drop-down. Remaining in Phase 1: step 6 (Python sandbox), step 7 (progress map, export/import, Certificate 1), step 8 (Arc 2-4 stubs and remaining docs). Owner play-test of Arc 1 not done yet.

## Built

- Walking skeleton: repo structure, `config/app.config.json`, recruitment screen, Playwright smoke tests (laptop + iPad viewports), `ci.yml`, `pages.yml`. Live at https://quorrauk.github.io/Project-jadzia/
- DC solver (`src/engine`): MNA, plugin registry, battery, resistor, variable resistor, wire, switch, bulb, LED. Hand-calculated tests plus random-network KCL checks.
- Profiles and levels (`src/progress`): several candidates per browser, guest mode (never saved), levels 1-5 chosen by the learner at any time, `pickForLevel()` fallback, v1 save migration.
- Teaching rules recorded in `docs/TEACHING-APPROACH.md`.

- Workshop sandbox (`src/sandbox`): 24x14 grid board, tap-to-place or drag from the palette, tap-tap or drag wiring, rotate/delete/repair, switch toggle, dimmer slider, LED colours. Live status line, level-aware readouts (plain words at 1, V/I/R at 2, power and standard form at 3, Kirchhoff checks at 4, node-voltage table at 5). Always-visible "I don't get it" help, starter circuit, confirm-twice before replacing a board. Burnt parts go dead until repaired. Board saved per profile.

- Lesson engine (`src/lessons`, `src/ui/lessons.js`, `src/ui/toys.js`): stages from JSON, Training/Standard/Stretch tiers, four-rung "I don't get it" ladder, glossary words you can tap, Formula Book, level variants with honest fallback. Generated questions (`generate.js`: seeded numbers, per-level ranges, safe expression parser) so every replay has new numbers; scenario missions so a replay is a new challenge. Adaptive level (`adaptive.js`): 3 clean answers in a row moves up, 2 struggles moves down, in auto mode (on by default, undo offered) or as a suggestion with auto off. A manual level choice always wins. Home screen now has Missions, Open workshop and Formula Book buttons at the top.
- Themes (`src/ui/theme.js`, `themes.css`): NASA (default, drifting stars), Light, T2 (red HUD, scanlines, sweep), Quantum Leap (imaging-chamber grid, colour bar). Drop-down on every screen, kept per browser and per profile. Animations only run when the device allows motion. Contrast is tested for every theme.
- Arc 1 content (`content/projects`): Ignition, Headlights, Dimmer, Switch Panel, Power Budget, Boss: Mission Day Failure. Each has a toy, an equation card, a worked example, a generated "Try one", a scenario mission with three tiers, a debrief, a Python stage and a generated maths check. Python stages are data only: the player shows the starter code and "the Python lab switches on in the next update" (step 6).
- Content QA (`validateLesson`): every question is generated at all 5 levels with 40 seeds and must fill in, give a positive number and have hints; every mission scenario x tier must ship a solution board that meets its goal, and the start board must not already meet it.

## Next steps

1. Owner play-test of Arc 1 on the tablet: is it fun, is it clear for a 13-year-old, is any project too hard or too easy.
2. Step 6: Python sandbox (Pyodide, pin the version in `config/app.config.json`) and the circuit bridge. The Python stages already exist as data and show "coming soon". Rules for `expect` are in DECISIONS.
3. Step 7: progress map, per-profile export/import, Certificate 1.
4. Step 8: Arc 2-4 stubs and the remaining docs (CONTENT-SPEC, PROJECT-TEMPLATE, MENTOR-VOICE, PARENT-GUIDE).
5. Arc 1 text for levels 4-5.

## Open questions

- Teachers: is guest mode enough, or do they want a view of her progress? Parked in ROADMAP ideas.

## Known bugs / gaps

- Arc 1 text is written for levels 1-3. Levels 4 and 5 fall back to level 3 and say so on screen. Workshop readouts do cover 4-5.
- No mission scenario has been play-tested by a person. The solver proves each is winnable; nobody has judged whether it is fun. Series/parallel and standard-form content has not been read by a teacher or checked against a 13-year-old. The owner should play it before Arc 1 is called done.

- Pyodide version in config is still `PIN-A-VERSION`; pin it at step 6.
- Docs not yet written: CONTENT-SPEC, PROJECT-TEMPLATE, MENTOR-VOICE, PARENT-GUIDE. They land with the features they describe.
- Local e2e needs `PW_CHROME_PATH` in the build sandbox because Playwright's browser download is blocked there; CI is unaffected.
- LED model is piecewise linear (no smooth knee). Fine for Arc 1; revisit if a project needs the curve.
- Deleting a candidate is a confirm click, not a PIN. Anyone with the browser can delete (see DECISIONS).
