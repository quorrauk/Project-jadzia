# State

Read this first every session.

## Status

Step 1 (walking skeleton) built on branch `step-1-skeleton`. Awaiting CI result and owner confirmation of the live URL.

## Built

- Repo structure, `config/app.config.json`, recruitment screen (name, robot name, candidate ID, reload persistence)
- Progress store (`src/progress/store.js`) with unit tests
- Playwright smoke tests (laptop and tablet viewports)
- `ci.yml` (unit + e2e), `pages.yml` (deploy `main` to GitHub Pages)

## Next 3 steps

1. Owner enables Pages (Source: GitHub Actions) and confirms the live URL loads.
2. Step 2: write solver tests first (hand-calculated cases in the kickoff), then the MNA solver.
3. Step 3: sandbox UI.

## Open questions

- None.

## Known bugs

- None known. Pyodide version in config is still the `PIN-A-VERSION` placeholder; pin it at step 6.
- Docs not yet written: CONTENT-SPEC, PROJECT-TEMPLATE, MENTOR-VOICE, COMPONENTS, TEACHING-APPROACH, PARENT-GUIDE. They land with the features they describe.
- Kickoff says repo is `project-jadzia`; GitHub reports it moved to `Project-jadzia`. Config uses the new name.
