# Changelog

Newest first.

## Unreleased

- Steps 4-5 (on branch `step-3c-home-button`, not merged): lesson engine, generated questions, adaptive level, scenario missions, Formula Book, glossary, toys, and Arc 1 projects 1-5. Home screen: Missions, Open workshop and Formula Book at the top. 128 unit tests; lesson e2e needs updating.

- Step 3b: Workshop sandbox. Grid board, six parts (battery, bulb, switch, resistor, dimmer, LED), touch-first placing and wiring, burn-out and repair, friendly status messages, readouts that change with the chosen level, help panel, starter circuit, per-profile saving. 100 unit and 74 e2e tests (laptop + tablet).

- Step 3a: several candidates per browser ("Who's flying today?"), guest mode that is never saved, learner-chosen levels 1-5 (Cadet to Chief Engineer) changeable any time, delete-with-confirm, store v2 with automatic migration of v1 saves, `pickForLevel()` content fallback. `docs/TEACHING-APPROACH.md` added. 53 unit and 34 e2e tests.

- Step 2: DC solver (modified nodal analysis) in `src/engine` with plugins for battery, resistor, variable resistor, wire, switch, bulb, LED. 33 unit tests: kickoff cases, Wheatstone bridge, series LEDs, switch, bulb, edge cases, and seeded random-network KCL checks. `docs/COMPONENTS.md` added.

- Walking skeleton: recruitment screen, progress store, config, unit and e2e smoke tests, CI and Pages workflows, initial docs.
