import { test, expect } from '@playwright/test';

const THEMES = ['nasa', 'light', 't2', 'quantum-leap'];

async function enlist(page) {
  await page.goto('/index.html');
  await page.getByTestId('name-input').fill('Ada');
  await page.getByTestId('robot-input').fill('Rover');
  await page.getByTestId('enlist-button').click();
}

// WCAG contrast between two CSS rgb() strings.
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('themes', () => {
  test('NASA is the default and the drop-down lists all four', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'nasa');
    const options = await page.getByTestId('theme-select').locator('option').allTextContents();
    expect(options).toEqual(['NASA', 'Light', 'T2', 'Quantum Leap']);
  });

  test('the drop-down is on every screen, at least 44px tall', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByTestId('theme-select')).toBeVisible();
    await enlist(page);
    await expect(page.getByTestId('theme-select')).toBeVisible();
    await page.getByTestId('open-workshop').click();
    await expect(page.getByTestId('theme-select')).toBeVisible();
    const box = await page.getByTestId('theme-select').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  for (const id of THEMES) {
    test(`${id}: switches, stays after reload, and text is readable`, async ({ page }) => {
      await enlist(page);
      await page.getByTestId('theme-select').selectOption(id);
      await expect(page.locator('body')).toHaveAttribute('data-theme', id);
      await page.reload();
      await expect(page.locator('body')).toHaveAttribute('data-theme', id);
      await expect(page.getByTestId('theme-select')).toHaveValue(id);

      const c = await page.evaluate(() => {
        const bg = getComputedStyle(document.querySelector('.panel')).backgroundColor;
        const probe = (cls) => {
          const e = document.createElement('span');
          e.className = cls;
          document.querySelector('.panel').append(e);
          const col = getComputedStyle(e).color;
          e.remove();
          return col;
        };
        const root = getComputedStyle(document.body);
        const btn = document.querySelector('.panel button:not(.secondary)');
        return {
          bg,
          text: getComputedStyle(document.querySelector('.panel p, .panel label, .panel .dialogue')).color,
          muted: probe('muted'),
          ok: getComputedStyle(document.querySelector('.panel .status')).color,
          warn: root.getPropertyValue('--warn').trim(),
          btnText: btn ? getComputedStyle(btn).color : null,
          btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
        };
      });
      expect(contrast(c.text, c.bg), 'body text').toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.ok, c.bg), 'status text').toBeGreaterThanOrEqual(4.5);
      if (c.btnText) expect(contrast(c.btnText, c.btnBg), 'button text').toBeGreaterThanOrEqual(4.5);
    });
  }

  test('a profile keeps its own theme when switching candidates', async ({ page }) => {
    await enlist(page);
    await page.getByTestId('theme-select').selectOption('t2');
    await page.getByTestId('switch-profile').click();
    await page.getByTestId('new-profile').click();
    await page.getByTestId('name-input').fill('Sam');
    await page.getByTestId('robot-input').fill('Bolt');
    await page.getByTestId('enlist-button').click();
    await page.getByTestId('theme-select').selectOption('light');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('switch-profile').click();
    await page.getByText('Ada').first().click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 't2');
  });

  test('reduced motion switches the animation off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    for (const id of THEMES) {
      await page.getByTestId('theme-select').selectOption(id);
      const names = await page.evaluate(() => ['::before', '::after'].map((p) => getComputedStyle(document.body, p).animationName));
      expect(names, id).toEqual(['none', 'none']);
    }
  });

  test('with motion allowed, the animated themes animate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/index.html');
    await page.getByTestId('theme-select').selectOption('t2');
    const t2 = await page.evaluate(() => getComputedStyle(document.body, '::before').animationName);
    expect(t2).not.toBe('none');
    await page.getByTestId('theme-select').selectOption('light');
    const light = await page.evaluate(() => getComputedStyle(document.body, '::before').animationName);
    expect(light).toBe('none');
  });

  test('themes do not break the workshop: board and palette still usable', async ({ page }) => {
    await enlist(page);
    for (const id of THEMES) {
      await page.getByTestId('theme-select').selectOption(id);
      await page.getByTestId('open-workshop').click();
      await page.getByTestId('btn-starter').click().catch(() => {});
      await expect(page.getByTestId('board')).toBeVisible();
      await expect(page.getByTestId('palette-battery')).toBeVisible();
      await page.getByTestId('ws-back').click();
    }
  });
});
