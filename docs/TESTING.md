# Testing

## Unit (node, no browser)

```
npm install
npm test
```

Runs `node --test "tests/unit/**/*.test.js"`. Covers config shape and the progress store. Solver tests (`tests/unit/solver.test.js`) cover the kickoff hand-calculated cases, a Wheatstone bridge, series LEDs, switch, bulb, edge cases (open, short, floating, wire loops, conflicting batteries) and 600 seeded random networks checked against Kirchhoff's current law. Hand-calculation working is in comments above each case. Sandbox tests (`sandbox-model.test.js`, `sandbox-readouts.test.js`) cover placing, overlap, wiring, netlist building, burn-out and repair, KCL on built boards, number formatting and the readout text at each level. Currently 100 unit tests; 74 e2e (37 per viewport).

Lessons: `lessons.test.js` and `generate.test.js` cover the engine, the expression parser, seeded generation, the adaptive tracker and content QA of every lesson in `content/lessons.json`. `tests/e2e/lessons.spec.js` plays Ignition through by reading the generated numbers off the page; use `?seed=N` in the URL for a repeatable lesson. It also covers auto level, replay, the never-stuck routes and fixing the Boss in Training.

Themes: `theme.test.js` checks every theme defines every colour and that animation only appears under the reduced-motion query. `themes.spec.js` checks contrast (WCAG 4.5:1 for text, status and button text) in every theme, persistence per browser and per profile, and reduced motion.

Totals: 133 unit, 124 e2e (62 per viewport).

## End to end (Playwright)

```
npm install
npx playwright install chromium
npm run test:e2e
```

Starts `python3 -m http.server 8080`, runs each spec on a laptop and a tablet (iPad gen 7) viewport. Selectors use `data-testid`.

## CI

`.github/workflows/ci.yml` runs both on every push and PR. The Playwright report uploads as an artifact on failure.

## Using an installed Chrome

If Playwright's browser download is blocked, point it at an installed Chrome:

```
PW_CHROME_PATH=/usr/bin/google-chrome npm run test:e2e
```
