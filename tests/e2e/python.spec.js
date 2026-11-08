import { test, expect } from '@playwright/test';
import { servePyodide } from './pyodide-route.js';

test.beforeEach(async ({ context }) => { await servePyodide(context); });

async function enlist(page, completed = []) {
  await page.goto('/index.html');
  await page.getByTestId('name-input').fill('Ada');
  await page.getByTestId('robot-input').fill('Rover');
  await page.getByTestId('enlist-button').click();
  if (completed.length) {
    await page.evaluate((done) => {
      const d = JSON.parse(localStorage.getItem('jadzia.progress.v2'));
      d.profiles[0].completed = done;
      localStorage.setItem('jadzia.progress.v2', JSON.stringify(d));
    }, completed);
    await page.reload();
  }
}

async function giveUp(page) {
  const n = await page.locator('.question').count();
  for (let q = 0; q < n; q++) {
    for (let i = 0; i < 2; i++) {
      await page.getByTestId(`answer-${q}`).fill('99999');
      await page.getByTestId(`check-${q}`).click();
    }
    await page.getByTestId(`reveal-${q}`).click();
  }
}

// Move through the lesson the never-stuck way until `done()` is true. Optionally win the Ignition mission on the way.
async function advance(page, done, { winMission = false } = {}) {
  const next = page.getByTestId('lesson-next');
  for (let i = 0; i < 14 && !(await done()); i++) {
    if (winMission && (await page.getByTestId('tier-training').isVisible())) {
      await page.getByTestId('tier-training').click();
      await page.getByTestId('part-SW1').click();
      await expect(page.getByTestId('mission-status')).toContainText('Mission complete');
    }
    if (await next.isDisabled()) await giveUp(page);
    await next.click();
  }
  expect(await done()).toBe(true);
}

async function openPython(page, id = 'ignition') {
  await page.getByTestId('open-missions').click();
  await page.getByTestId(`mission-${id}`).click();
  await advance(page, () => page.getByTestId('py-editor').isVisible());
}

const run = async (page) => { await page.getByTestId('py-run').click(); await expect(page.getByTestId('py-run')).toHaveText('Run', { timeout: 60000 }); };

test.describe('python lab', () => {
  test('home panel starts empty and says what builds the first part', async ({ page }) => {
    await enlist(page);
    await expect(page.getByTestId('dash-empty')).toBeVisible();
    await expect(page.getByTestId('dash-next')).toContainText('Ignition');
    await expect(page.getByTestId('dash-count')).toHaveText('0 of 6 parts built');
  });

  test('panel grows with finished missions', async ({ page }) => {
    await enlist(page, ['ignition', 'headlights', 'dimmer']);
    await expect(page.getByTestId('dash-count')).toHaveText('3 of 6 parts built');
    await expect(page.getByTestId('dash-dimmer')).toBeVisible();
    await expect(page.getByTestId('dash-gauge')).toBeHidden();
    await page.getByTestId('sw-power').click();
    await page.getByTestId('sw-headlight').click();
    await expect(page.getByTestId('lamp-headlight')).toHaveAttribute('data-lit', 'true');
    await page.getByTestId('dimmer').fill('0');
    await expect(page.getByTestId('lamp-headlight')).toHaveAttribute('data-lit', 'false');
  });

  test('runs code, shows output, and the starter meets the mission', async ({ page }) => {
    await enlist(page);
    await openPython(page);
    await run(page);
    await expect(page.getByTestId('py-output')).not.toContainText('Press Run');
    await expect(page.getByTestId('py-verdict')).toContainText('Yes!');
  });

  test('errors are in plain words with a line number, and never block Next', async ({ page }) => {
    await enlist(page);
    await openPython(page);
    await page.getByTestId('py-editor').fill('print(volts)');
    await run(page);
    await expect(page.getByTestId('py-error')).toContainText('On line 1: Python does not know the name "volts"');
    await page.getByTestId('py-tech').locator('summary').click();
    await expect(page.getByTestId('py-tech')).toContainText('NameError');
    await expect(page.getByTestId('lesson-next')).toBeEnabled();
    await page.getByTestId('py-reset').click();
    await expect(page.getByTestId('py-editor')).toHaveValue(/print\(/);
  });

  test('an endless loop is stopped, and Python works again afterwards', async ({ page }) => {
    await enlist(page);
    await openPython(page);
    await page.getByTestId('py-editor').fill('while True:\n    pass');
    await run(page);
    await expect(page.getByTestId('py-error')).toContainText('took too long');
    await page.getByTestId('py-editor').fill('print("back")');
    await run(page);
    await expect(page.getByTestId('py-output')).toContainText('back');
  });

  test('panel.on drives the panel only for parts she has built', async ({ page }) => {
    await enlist(page, ['ignition']);
    await openPython(page);
    await page.getByTestId('py-editor').fill('panel.on("power")');
    await run(page);
    await expect(page.getByTestId('lamp-pad')).toHaveAttribute('data-lit', 'true');
    await page.getByTestId('py-editor').fill('panel.on("headlight")');
    await run(page);
    await expect(page.getByTestId('py-error')).toContainText('not installed yet');
    await expect(page.getByTestId('py-error')).toContainText('Headlights');
  });

  test('hints work, and a failed check says what is missing without blocking', async ({ page }) => {
    await enlist(page);
    await openPython(page);
    await page.getByTestId('py-editor').fill('x = 1');
    await run(page);
    await expect(page.getByTestId('py-verdict')).toContainText('Not quite yet');
    await page.getByTestId('py-hint-btn').click();
    await expect(page.getByTestId('py-hint')).not.toBeEmpty();
    await expect(page.getByTestId('lesson-next')).toBeEnabled();
  });

  test('when Python cannot load, she is told kindly and can carry on', async ({ page, context }) => {
    await context.unroute('https://cdn.jsdelivr.net/pyodide/**');
    await context.route('https://cdn.jsdelivr.net/pyodide/**', (r) => r.abort());
    await enlist(page);
    await openPython(page);
    await run(page);
    await expect(page.getByTestId('py-error')).toContainText('could not start');
    await expect(page.getByTestId('lesson-next')).toBeEnabled();
  });
});

test('finishing a mission announces the part it builds', async ({ page }) => {
  await enlist(page);
  await page.getByTestId('open-missions').click();
  await page.getByTestId('mission-ignition').click();
  await advance(page, () => page.getByTestId('lesson-complete').isVisible(), { winMission: true });
  await expect(page.getByTestId('part-installed')).toContainText('Main power switch');
  await page.getByTestId('lesson-done').click();
  await expect(page.getByTestId('dash-power')).toBeVisible();
  await expect(page.getByTestId('dash-count')).toHaveText('1 of 6 parts built');
});
