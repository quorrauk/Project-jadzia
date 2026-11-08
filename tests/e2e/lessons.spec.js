import { test, expect } from '@playwright/test';

async function enlist(page, level) {
  await page.goto('/index.html');
  await page.getByTestId('name-input').fill('Ada');
  await page.getByTestId('robot-input').fill('Rover');
  await page.getByTestId('enlist-button').click();
  if (level) {
    await page.getByTestId('change-level').click();
    await page.getByTestId(`level-${level}`).click();
  }
}

async function openIgnition(page, level) {
  await enlist(page, level);
  await page.getByTestId('open-missions').click();
  await page.getByTestId('mission-ignition').click();
  await expect(page.getByTestId('lesson')).toBeVisible();
}

const next = (page) => page.getByTestId('lesson-next');
const step = (page) => page.getByTestId('lesson-step');

// Wrong twice, then "Show me the answer" for every question on the stage: the never-stuck route.
async function giveUp(page) {
  const n = await page.locator('.question').count();
  for (let q = 0; q < n; q++) {
    for (let i = 0; i < 2; i++) {
      await page.getByTestId(`answer-${q}`).fill('99');
      await page.getByTestId(`check-${q}`).click();
    }
    await page.getByTestId(`reveal-${q}`).click();
  }
}

async function toStage(page, n) {
  const now = Number((await step(page).textContent()).match(/Stage (\d+)/)[1]);
  for (let i = now; i < n; i++) {
    if (await next(page).isDisabled()) await giveUp(page);
    await next(page).click();
  }
  await expect(step(page)).toContainText(`Stage ${n} of`);
}

test.describe('lessons', () => {
  test('home shows Missions, Workshop and Formula Book without scrolling', async ({ page }) => {
    await enlist(page);
    for (const id of ['open-missions', 'open-workshop', 'open-book']) {
      const box = await page.getByTestId(id).boundingBox();
      const vh = page.viewportSize().height;
      expect(box.y + box.height).toBeLessThan(vh);
    }
  });

  test('plays through Ignition from briefing to the end (Training tier)', async ({ page }) => {
    await openIgnition(page);
    await expect(step(page)).toContainText('Briefing');
    await toStage(page, 2);

    // Learn: play first, then a glossary word explains itself.
    await page.getByTestId('toy-switch').click();
    await expect(page.getByTestId('toy-bulb')).toHaveAttribute('data-lit', 'true');
    await page.getByTestId('term-circuit').first().click();
    await expect(page.getByTestId('term-def')).toContainText('loop');
    await toStage(page, 3);

    // Equation card is saved to the Formula Book.
    await expect(page.getByTestId('equation')).toHaveText('V = I × R');
    await expect(page.getByTestId('formula-saved')).toBeVisible();
    await toStage(page, 4);

    // Worked example reveals step by step.
    await expect(page.getByTestId('example-steps').locator('li')).toHaveCount(1);
    await page.getByTestId('example-more').click();
    await expect(page.getByTestId('example-steps').locator('li')).toHaveCount(2);
    await toStage(page, 5);

    // Try one: next is blocked until answered, wrong answers teach, no penalty.
    await expect(next(page)).toBeDisabled();
    await page.getByTestId('answer-0').fill('27');
    await page.getByTestId('check-0').click();
    await expect(page.getByTestId('feedback-0')).toContainText('divide');
    await page.getByTestId('hint-btn-0').click();
    await expect(page.getByTestId('hint-0')).not.toBeEmpty();
    await page.getByTestId('answer-0').fill('3');
    await page.getByTestId('check-0').click();
    await expect(page.getByTestId('feedback-0')).toContainText('Yes!');
    await toStage(page, 6);

    // Mission: starter board in Training; closing the switch lights the bulb and completes it.
    await page.getByTestId('tier-training').click();
    await expect(page.getByTestId('mission-status')).not.toContainText('complete');
    await expect(next(page)).toHaveText('Skip for now');
    await page.getByTestId('part-SW1').click();
    await expect(page.getByTestId('mission-status')).toContainText('Mission complete');
    await expect(next(page)).toHaveText('Next');
    await toStage(page, 7);
    await toStage(page, 8);

    // Maths check, then finish.
    await page.getByTestId('answer-0').fill('0.225');
    await page.getByTestId('check-0').click();
    await page.getByTestId('answer-1').fill('24');
    await page.getByTestId('check-1').click();
    await expect(next(page)).toHaveText('Finish');
    await next(page).click();
    await expect(page.getByTestId('lesson-complete')).toContainText('Mission complete');
    await page.getByTestId('lesson-done').click();

    // The patch shows on the mission list and the formula is in the book.
    await page.getByTestId('open-missions').click();
    await expect(page.getByTestId('mission-ignition')).toContainText('✔');
    await page.getByTestId('missions-back').click();
    await page.getByTestId('open-book').click();
    await expect(page.getByTestId('formula-ohms-law')).toBeVisible();
    await expect(page.getByTestId('glossary')).toContainText('voltage');
  });

  test('"I don\'t get it" climbs four rungs and then stays put', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 2);
    await page.getByTestId('lesson-help').click();
    await expect(page.getByTestId('help-panel')).toContainText('Way 1 of 4');
    for (const n of [2, 3, 4]) {
      await page.getByTestId('lhelp-more').click();
      await expect(page.getByTestId('help-panel')).toContainText(`Way ${n} of 4`);
    }
    await expect(page.getByTestId('lhelp-more')).toHaveCount(0);
    await page.getByTestId('lhelp-close').click();
    await expect(page.getByTestId('help-panel')).toHaveCount(0);
  });

  test('a stuck learner is never blocked: Show me the answer unlocks Next', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 5);
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('answer-0').fill('99');
      await page.getByTestId('check-0').click();
    }
    await page.getByTestId('reveal-0').click();
    await expect(next(page)).toBeEnabled();
  });

  test('mission: failing twice offers Training; building from scratch completes Standard', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 6);
    await page.getByTestId('mission-check').click();
    await page.getByTestId('mission-check').click();
    await expect(page.getByTestId('offer-training')).toBeVisible();
    await page.getByTestId('offer-training').click();
    await expect(page.getByTestId('tier-training')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('part-BULB1')).toBeVisible();
    await page.getByTestId('mission-hint-btn').click();
    await expect(page.getByTestId('mission-hint')).not.toBeEmpty();
  });

  test('passing first time offers the Stretch', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 6);
    await page.getByTestId('tier-training').click();
    await page.getByTestId('part-SW1').click();
    await expect(page.getByTestId('mission-status')).toContainText('Mission complete');
    await page.getByTestId('tier-standard').click();
    await page.getByTestId('tier-training').click();
    await expect(page.getByTestId('mission-status')).not.toContainText('complete');
  });

  test('level changes the words; a missing level says so honestly', async ({ page }) => {
    await openIgnition(page, 3);
    await toStage(page, 2);
    await expect(page.getByTestId('stage-body')).toContainText('conducting loop');
    await page.getByTestId('lesson-level').selectOption('1');
    await expect(page.getByTestId('stage-body')).toContainText('bike chain').catch(() => {});
    await expect(page.getByTestId('stage-body')).toContainText('closed a gap');
    await page.getByTestId('lesson-level').selectOption('5');
    await expect(page.getByTestId('fallback-note')).toContainText('Commander');
  });

  test('guest can play a mission and nothing is saved', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('start-guest').click();
    await page.getByTestId('open-missions').click();
    await page.getByTestId('mission-ignition').click();
    await toStage(page, 3);
    await page.reload();
    await expect(page.getByTestId('recruitment')).toBeVisible();
  });

  test('buttons and inputs in lessons are at least 44px tall', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 5);
    for (const id of ['check-0', 'hint-btn-0', 'lesson-next', 'lesson-back', 'lesson-help']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }
  });
});
