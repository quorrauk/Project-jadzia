import { test, expect } from '@playwright/test';

test.describe('recruitment screen', () => {
  test('loads and shows the acceptance message', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByTestId('recruitment')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Application accepted.' })).toBeVisible();
  });

  test('empty submit shows an error and does not enlist', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('enlist-button').click();
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page.getByTestId('candidate')).toHaveCount(0);
  });

  test('entering names issues a candidate ID', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('name-input').fill('Ada');
    await page.getByTestId('robot-input').fill('Rover');
    await page.getByTestId('enlist-button').click();
    await expect(page.getByTestId('welcome')).toContainText('Ada');
    await expect(page.getByTestId('candidate-id')).toHaveText(/^OCP-[A-Z2-9]{6}$/);
    await expect(page.getByTestId('robot-name-display')).toContainText('Rover');
  });

  test('progress survives a reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('name-input').fill('Ada');
    await page.getByTestId('robot-input').fill('Rover');
    await page.getByTestId('enlist-button').click();
    const id = await page.getByTestId('candidate-id').textContent();
    await page.reload();
    await expect(page.getByTestId('candidate-id')).toHaveText(id);
  });

  test('touch targets are at least 44px', async ({ page }) => {
    await page.goto('/index.html');
    for (const testId of ['name-input', 'robot-input', 'enlist-button']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box.height, testId).toBeGreaterThanOrEqual(44);
    }
  });
});
