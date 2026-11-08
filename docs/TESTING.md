# Testing

## Unit (node, no browser)

```
npm install
npm test
```

Runs `node --test "tests/unit/**/*.test.js"`. Covers config shape and the progress store. Solver tests land in step 2.

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
