# Changelog

Newest first.

## Unreleased

- Step 6: Python sandbox. Pyodide 0.26.4 (pinned, loaded from the jsDelivr CDN on first use) runs in a Web Worker, so an endless loop is stopped after 5 s and Python restarts. Plain-words error messages with line numbers, `expect` checks that never block, hints, Reset. All six Python stages are live.
- Mission Control panel (KISS, on-screen): empty until she builds it. Each finished project installs one part (Ignition: main power + pad lamp; Headlights: LED; Dimmer: dial; Switch Panel: two backups; Power Budget: battery gauge; Mission Day: status display). Python `panel.on("power")`, `panel.off(...)`, `panel.dim(40)` only work on parts she has built, with a friendly nudge to the mission that builds the missing one. Shown on the home screen and beside the Python editor.
- Tests: 155 unit (real Pyodide in node), 142 e2e (CDN served from the npm copy).

- Themes: NASA, Light, T2 and Quantum Leap, chosen from a drop-down on every screen, remembered per browser and per profile, animated (off for reduced motion). Colours moved into CSS variables.
- Steps 4-5: lesson engine (nine stage types, Training/Standard/Stretch, four-rung help ladder, glossary, Formula Book, level variants), generated questions with new numbers every play, scenario missions, adaptive level with manual override, and all six Arc 1 projects (Ignition, Headlights, Dimmer, Switch Panel, Power Budget, Boss: Mission Day Failure). Home screen: Missions, Open workshop and Formula Book at the top.
- Tests: 133 unit, 124 e2e (laptop + tablet).

- Step 3b: Workshop sandbox. Grid board, six parts (battery, bulb, switch, resistor, dimmer, LED), touch-first placing and wiring, burn-out and repair, friendly status messages, readouts that change with the chosen level, help panel, starter circuit, per-profile saving. 100 unit and 74 e2e tests (laptop + tablet).

- Step 3a: several candidates per browser ("Who's flying today?"), guest mode that is never saved, learner-chosen levels 1-5 (Cadet to Chief Engineer) changeable any time, delete-with-confirm, store v2 with automatic migration of v1 saves, `pickForLevel()` content fallback. `docs/TEACHING-APPROACH.md` added. 53 unit and 34 e2e tests.

- Step 2: DC solver (modified nodal analysis) in `src/engine` with plugins for battery, resistor, variable resistor, wire, switch, bulb, LED. 33 unit tests: kickoff cases, Wheatstone bridge, series LEDs, switch, bulb, edge cases, and seeded random-network KCL checks. `docs/COMPONENTS.md` added.

- Walking skeleton: recruitment screen, progress store, config, unit and e2e smoke tests, CI and Pages workflows, initial docs.
