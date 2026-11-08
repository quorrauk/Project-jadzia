# State

Read this first every session.

## Status

Steps 1, 2 and 3a done. Live site confirmed loading by the owner.

## Built

- Walking skeleton: repo structure, `config/app.config.json`, recruitment screen, Playwright smoke tests (laptop + iPad viewports), `ci.yml`, `pages.yml`. Live at https://quorrauk.github.io/Project-jadzia/
- DC solver (`src/engine`): MNA, plugin registry, battery, resistor, variable resistor, wire, switch, bulb, LED. Hand-calculated tests plus random-network KCL checks.
- Profiles and levels (`src/progress`): several candidates per browser, guest mode (never saved), levels 1-5 chosen by the learner at any time, `pickForLevel()` fallback, v1 save migration.
- Teaching rules recorded in `docs/TEACHING-APPROACH.md`.

## Next 3 steps

1. Step 3b: sandbox UI. Place, move, delete parts; wire; live meters. Pointer events, snap-to-grid, tap-to-place, 44px targets, bottom drawer on tablet. Level-aware readouts (plain words at 1, units and V = IR at 2, power at 3, Kirchhoff checks at 4, node-voltage table at 5). An always-visible "I don't get it" help and a starter circuit. Burnt parts go dead until repaired.
2. Step 4: lesson engine (9 stages from JSON, Training/Standard/Stretch tiers, four-rung help ladder, level variants), Formula Book, glossary.
3. Step 5: Arc 1 content, project by project, levels 1-3.

## Open questions

- Teachers: is guest mode enough, or do they want a view of her progress? Parked in ROADMAP ideas.

## Known bugs / gaps

- Pyodide version in config is still `PIN-A-VERSION`; pin it at step 6.
- Docs not yet written: CONTENT-SPEC, PROJECT-TEMPLATE, MENTOR-VOICE, PARENT-GUIDE. They land with the features they describe.
- Local e2e needs `PW_CHROME_PATH` in the build sandbox because Playwright's browser download is blocked there; CI is unaffected.
- LED model is piecewise linear (no smooth knee). Fine for Arc 1; revisit if a project needs the curve.
- Deleting a candidate is a confirm click, not a PIN. Anyone with the browser can delete (see DECISIONS).
