# State

Read this first every session.

## Status

Steps 1 and 2 done. Live site confirmed loading by the owner.

## Built

- Walking skeleton: repo structure, `config/app.config.json`, recruitment screen, progress store, Playwright smoke tests (laptop + iPad viewports), `ci.yml`, `pages.yml`. Live at https://quorrauk.github.io/Project-jadzia/
- DC solver (`src/engine`): MNA, plugin registry, battery, resistor, variable resistor, wire, switch, bulb, LED. 33 unit tests passing locally.

## Next 3 steps

1. Step 3: sandbox UI. Place, move, delete parts; wire; live meters. Pointer events, snap-to-grid, tap-to-place, 44px targets, bottom drawer on tablet. Adds `draw` to each component plugin.
2. Step 4: lesson engine (9 stages from JSON), Formula Book, glossary.
3. Step 5: Arc 1 content, project by project.

## Open questions

- None.

## Known bugs / gaps

- Pyodide version in config is still `PIN-A-VERSION`; pin it at step 6.
- Docs not yet written: CONTENT-SPEC, PROJECT-TEMPLATE, MENTOR-VOICE, TEACHING-APPROACH, PARENT-GUIDE. They land with the features they describe.
- Local e2e needs `PW_CHROME_PATH` here because Playwright's browser download is blocked in the build sandbox; CI is unaffected.
- LED model is piecewise linear (no smooth knee). Fine for Arc 1; revisit if a project needs the curve.
