import { test, expect } from '@playwright/test';

async function enlist(page, name, robot) {
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('robot-input').fill(robot);
  await page.getByTestId('enlist-button').click();
  await expect(page.getByTestId('candidate')).toBeVisible();
}

test.describe('multiple candidates', () => {
  test('a second candidate gets their own ID and the picker lists both', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    const adaId = await page.getByTestId('candidate-id').textContent();

    await page.getByTestId('switch-profile').click();
    await expect(page.getByTestId('picker')).toBeVisible();
    await page.getByTestId('new-profile').click();
    await enlist(page, 'Mr Jones', 'Bolt');
    const jonesId = await page.getByTestId('candidate-id').textContent();
    expect(jonesId).not.toBe(adaId);

    await page.getByTestId('switch-profile').click();
    await expect(page.locator('[data-testid^="profile-"]')).toHaveCount(2);
  });

  test('switching back shows the right person and robot', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('switch-profile').click();
    await page.getByTestId('new-profile').click();
    await enlist(page, 'Mr Jones', 'Bolt');
    await page.getByTestId('switch-profile').click();
    await page.locator('[data-testid^="profile-"]', { hasText: 'Ada' }).click();
    await expect(page.getByTestId('welcome')).toContainText('Ada');
    await expect(page.getByTestId('robot-name-display')).toContainText('Rover');
  });

  test('profile cards are big enough to tap', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('switch-profile').click();
    const box = await page.locator('[data-testid^="profile-"]').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('deleting asks first, and cancelling keeps the candidate', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('delete-profile').click();
    await expect(page.getByTestId('delete-confirm')).toBeVisible();
    await page.getByTestId('cancel-delete').click();
    await expect(page.getByTestId('welcome')).toContainText('Ada');
  });

  test('confirming delete removes only that candidate', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('switch-profile').click();
    await page.getByTestId('new-profile').click();
    await enlist(page, 'Mr Jones', 'Bolt');
    await page.getByTestId('delete-profile').click();
    await page.getByTestId('confirm-delete').click();
    await expect(page.getByTestId('picker')).toBeVisible();
    await expect(page.locator('[data-testid^="profile-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="profile-"]')).toContainText('Ada');
  });
});

test.describe('guest mode', () => {
  test('first-run visitors can try as guest, and nothing is saved', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('start-guest').click();
    await expect(page.getByTestId('welcome')).toContainText('Guest');
    await expect(page.getByTestId('candidate-id')).toHaveText('GUEST');
    await page.reload();
    await expect(page.getByTestId('recruitment')).toBeVisible();
    const saved = await page.evaluate(() => window.localStorage.getItem('jadzia.progress.v2'));
    expect(saved).toBeNull();
  });

  test('a guest on top of a saved candidate leaves that candidate untouched', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    const before = await page.evaluate(() => window.localStorage.getItem('jadzia.progress.v2'));

    await page.getByTestId('switch-profile').click();
    await page.getByTestId('start-guest').click();
    await page.getByTestId('change-level').click();
    await page.getByTestId('level-5').click();
    await expect(page.getByTestId('level-pill')).toContainText('Chief Engineer');
    await page.getByTestId('switch-profile').click();

    const after = await page.evaluate(() => window.localStorage.getItem('jadzia.progress.v2'));
    const parse = (s) => JSON.parse(s).profiles;
    expect(parse(after)).toEqual(parse(before));
  });
});

test.describe('levels', () => {
  test('every level is open from the start and the choice survives a reload', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await expect(page.getByTestId('level-pill')).toContainText('Level 1 · Cadet');

    await page.getByTestId('change-level').click();
    for (const n of [1, 2, 3, 4, 5]) {
      await expect(page.getByTestId(`level-${n}`)).toBeEnabled();
    }
    await page.getByTestId('level-5').click();
    await expect(page.getByTestId('level-pill')).toContainText('Level 5 · Chief Engineer');

    await page.reload();
    await expect(page.getByTestId('level-pill')).toContainText('Level 5 · Chief Engineer');
  });

  test('can go back down again', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('change-level').click();
    await page.getByTestId('level-4').click();
    await page.getByTestId('change-level').click();
    await page.getByTestId('level-2').click();
    await expect(page.getByTestId('level-pill')).toContainText('Level 2 · Pilot');
  });

  test('levels belong to the person, not the browser', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('change-level').click();
    await page.getByTestId('level-5').click();
    await page.getByTestId('switch-profile').click();
    await page.getByTestId('new-profile').click();
    await enlist(page, 'Mr Jones', 'Bolt');
    await expect(page.getByTestId('level-pill')).toContainText('Level 1 · Cadet');
  });

  test('level buttons are big enough to tap', async ({ page }) => {
    await page.goto('/index.html');
    await enlist(page, 'Ada', 'Rover');
    await page.getByTestId('change-level').click();
    for (const n of [1, 5]) {
      const box = await page.getByTestId(`level-${n}`).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test('a v1 save from the first build is carried over', async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('jadzia.progress.v1') && !window.localStorage.getItem('seeded')) {
      window.localStorage.setItem('seeded', '1');
      window.localStorage.setItem(
        'jadzia.progress.v1',
        JSON.stringify({
          version: 1,
          learner: { name: 'Ada', robotName: 'Rover', candidateId: 'OCP-ABC234', enlistedOn: '2026-11-08' },
          completed: [],
        }),
      );
    }
  });
  await page.goto('/index.html');
  await expect(page.getByTestId('welcome')).toContainText('Ada');
  await expect(page.getByTestId('candidate-id')).toHaveText('OCP-ABC234');
});
