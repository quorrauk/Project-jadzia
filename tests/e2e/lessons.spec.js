import { test, expect } from '@playwright/test';

async function enlist(page, { level, search = '' } = {}) {
  await page.goto(`/index.html${search}`);
  await page.getByTestId('name-input').fill('Ada');
  await page.getByTestId('robot-input').fill('Rover');
  await page.getByTestId('enlist-button').click();
  if (level) {
    await page.getByTestId('change-level').click();
    await page.getByTestId(`level-${level}`).click();
  }
}

async function openLesson(page, id, opts) {
  await enlist(page, opts);
  await page.getByTestId('open-missions').click();
  await page.getByTestId(`mission-${id}`).click();
  await expect(page.getByTestId('lesson')).toBeVisible();
}

const openIgnition = (page, opts) => openLesson(page, 'ignition', opts);
const next = (page) => page.getByTestId('lesson-next');
const step = (page) => page.getByTestId('lesson-step');
const nums = (text) => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const prompt = async (page, q = 0) => (await page.getByTestId(`q-${q}`).locator('p').first().textContent()) ?? '';

// Wrong twice, then "Show me the answer" for every question on the stage: the never-stuck route.
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

async function toStage(page, n) {
  const now = Number((await step(page).textContent()).match(/Stage (\d+)/)[1]);
  for (let i = now; i < n; i++) {
    if (await next(page).isDisabled()) await giveUp(page);
    await next(page).click();
  }
  await expect(step(page)).toContainText(`Stage ${n} of`);
}

// Ignition at level 1. Stages: 1 briefing, 2 learn, 3 equation, 4 example, 5 try, 6 mission, 7 debrief, 8 python, 9 maths.
async function answerIgnitionMaths(page) {
  for (let q = 0; q < 3; q++) {
    const text = await prompt(page, q);
    const n = nums(text);
    let answer;
    if (/squeeze \(resistance\)/.test(text)) answer = n[1] / n[0]; // {I} A ... {V} V
    else if (/volts/i.test(text)) answer = n[0] * n[1]; // squeeze {R}, flow {I}
    else answer = n[0] / 1000; // mA to A
    await page.getByTestId(`answer-${q}`).fill(String(answer));
    await page.getByTestId(`check-${q}`).click();
    await expect(page.getByTestId(`feedback-${q}`)).toContainText('Yes!');
  }
}

test.describe('lessons', () => {
  test('home shows Missions, Workshop and Formula Book without scrolling', async ({ page }) => {
    await enlist(page);
    for (const id of ['open-missions', 'open-workshop', 'open-book']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.y + box.height).toBeLessThan(page.viewportSize().height);
    }
  });

  test('all six Arc 1 missions are listed', async ({ page }) => {
    await enlist(page);
    await page.getByTestId('open-missions').click();
    for (const id of ['ignition', 'headlights', 'dimmer', 'switch-panel', 'power-budget', 'mission-day-failure']) {
      await expect(page.getByTestId(`mission-${id}`)).toBeVisible();
    }
  });

  test('plays through Ignition from briefing to the end (Training tier)', async ({ page }) => {
    await openIgnition(page);
    await expect(step(page)).toContainText('Briefing');
    await toStage(page, 2);

    await page.getByTestId('toy-switch').click();
    await expect(page.getByTestId('toy-bulb')).toHaveAttribute('data-lit', 'true');
    await page.getByTestId('term-circuit').first().click();
    await expect(page.getByTestId('term-def')).toContainText('loop');
    await toStage(page, 3);

    await expect(page.getByTestId('equation')).toHaveText('V = I × R');
    await expect(page.getByTestId('formula-saved')).toBeVisible();
    await toStage(page, 4);

    await expect(page.getByTestId('example-steps').locator('li')).toHaveCount(1);
    await page.getByTestId('example-more').click();
    await expect(page.getByTestId('example-steps').locator('li')).toHaveCount(2);
    await toStage(page, 5);

    // Try one: Next is blocked until answered. A multiply-instead-of-divide slip gets a teaching reply, no penalty.
    await expect(next(page)).toBeDisabled();
    const [V, R] = nums(await prompt(page));
    await page.getByTestId('answer-0').fill(String(V * R));
    await page.getByTestId('check-0').click();
    await expect(page.getByTestId('feedback-0')).toContainText('divide');
    await page.getByTestId('hint-btn-0').click();
    await expect(page.getByTestId('hint-0')).not.toBeEmpty();
    await page.getByTestId('answer-0').fill(String(V / R));
    await page.getByTestId('check-0').click();
    await expect(page.getByTestId('feedback-0')).toContainText('Yes!');
    await toStage(page, 6);

    // Mission, Training: closing the switch lights the bulb and completes it.
    await page.getByTestId('tier-training').click();
    await expect(page.getByTestId('mission-status')).not.toContainText('complete');
    await expect(next(page)).toHaveText('Skip for now');
    await page.getByTestId('part-SW1').click();
    await expect(page.getByTestId('mission-status')).toContainText('Mission complete');
    await expect(next(page)).toHaveText('Next');
    await toStage(page, 8);
    await expect(page.getByTestId('python-starter')).toContainText('print(');
    await expect(page.getByTestId('python-soon')).toBeVisible();
    await toStage(page, 9);

    await answerIgnitionMaths(page);
    await expect(next(page)).toHaveText('Finish');
    await next(page).click();
    await expect(page.getByTestId('lesson-complete')).toContainText('Mission complete');
    await page.getByTestId('lesson-done').click();

    await page.getByTestId('open-missions').click();
    await expect(page.getByTestId('mission-ignition')).toContainText('✔');
    await page.getByTestId('missions-back').click();
    await page.getByTestId('open-book').click();
    await expect(page.getByTestId('formula-ohms-law')).toBeVisible();
    await expect(page.getByTestId('glossary')).toContainText('voltage');
  });

  test('"I don\'t get it" climbs four rungs and then stays put, without losing typed answers', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 5);
    await page.getByTestId('answer-0').fill('42');
    await page.getByTestId('lesson-help').click();
    await expect(page.getByTestId('help-panel')).toContainText('Way 1 of 4');
    await expect(page.getByTestId('answer-0')).toHaveValue('42');
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
      await page.getByTestId('answer-0').fill('99999');
      await page.getByTestId('check-0').click();
    }
    await page.getByTestId('reveal-0').click();
    await expect(next(page)).toBeEnabled();
  });

  test('mission: failing twice offers Training, hints work', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 6);
    await page.getByTestId('mission-check').click();
    await page.getByTestId('mission-check').click();
    await page.getByTestId('offer-training').click();
    await expect(page.getByTestId('tier-training')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('part-BULB1')).toBeVisible();
    await page.getByTestId('mission-hint-btn').click();
    await expect(page.getByTestId('mission-hint')).not.toBeEmpty();
  });

  test('numbers are generated: different seeds give different questions, the same seed repeats', async ({ page }) => {
    const seen = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      await openIgnition(page, { search: `?seed=${seed}` });
      await toStage(page, 5);
      seen.add(await prompt(page));
      await page.evaluate(() => localStorage.clear());
    }
    expect(seen.size).toBeGreaterThan(1);
    await openIgnition(page, { search: '?seed=3' });
    await toStage(page, 5);
    const first = await prompt(page);
    await page.evaluate(() => localStorage.clear());
    await openIgnition(page, { search: '?seed=3' });
    await toStage(page, 5);
    expect(await prompt(page)).toBe(first);
  });

  test('replay starts again with new numbers available and the stage list reset', async ({ page }) => {
    await openIgnition(page);
    await toStage(page, 9);
    await giveUp(page);
    await next(page).click();
    await expect(page.getByTestId('lesson-complete')).toContainText('Nearly there');
    await page.getByTestId('lesson-replay').click();
    await expect(step(page)).toContainText('Stage 1 of');
  });

  test('auto level: three clean answers move the next stage up, and Keep my level undoes it', async ({ page }) => {
    await openIgnition(page);
    await expect(page.getByTestId('auto-toggle')).toHaveAttribute('aria-pressed', 'true');
    await toStage(page, 5);
    const [V, R] = nums(await prompt(page));
    await page.getByTestId('answer-0').fill(String(V / R));
    await page.getByTestId('check-0').click(); // clean 1
    await toStage(page, 9);
    await answerIgnitionMaths(page); // clean 2, 3, 4: moves up after the third
    await expect(page.getByTestId('level-note')).toContainText('Level 2');
    await page.getByTestId('level-undo').click();
    await expect(page.getByTestId('level-note')).toHaveCount(0);
    await expect(page.getByTestId('lesson-level')).toHaveValue('1');
  });

  test('auto level off: it only suggests, and one tap switches level', async ({ page }) => {
    await openIgnition(page);
    await page.getByTestId('auto-toggle').click();
    await expect(page.getByTestId('auto-toggle')).toHaveAttribute('aria-pressed', 'false');
    await toStage(page, 9);
    await answerIgnitionMaths(page);
    await expect(page.getByTestId('level-suggest')).toBeVisible();
    await expect(page.getByTestId('lesson-level')).toHaveValue('1');
    await page.getByTestId('level-suggest').click();
    await expect(page.getByTestId('lesson-level')).toHaveValue('2');
  });

  test('struggling twice in auto mode eases off a level, and a manual pick always wins', async ({ page }) => {
    // Level 4: the try question and then three maths questions are all given up on. 4 -> 3 -> 2.
    await openIgnition(page, { level: 4 });
    await toStage(page, 9);
    await giveUp(page);
    await expect(page.getByTestId('level-note')).toContainText('Level 2');
    await page.getByTestId('lesson-level').selectOption('5');
    await expect(page.getByTestId('lesson-level')).toHaveValue('5');
    await expect(page.getByTestId('level-note')).toHaveCount(0);
  });

  test('level changes the words; a missing level says so honestly', async ({ page }) => {
    await openIgnition(page, { level: 3 });
    await toStage(page, 2);
    await expect(page.getByTestId('stage-body')).toContainText('conducting loop');
    await page.getByTestId('lesson-level').selectOption('1');
    await expect(page.getByTestId('stage-body')).toContainText('closed a gap');
    await page.getByTestId('lesson-level').selectOption('5');
    await expect(page.getByTestId('fallback-note')).toContainText('Commander');
  });

  test('boss, Training: a missing wire can be found and fixed by tapping two dots', async ({ page }) => {
    await openLesson(page, 'mission-day-failure');
    await toStage(page, 3);
    await page.getByTestId('tier-training').click();
    await expect(page.getByTestId('part-LED1')).toBeVisible();
    await expect(page.getByTestId('mission-status')).not.toContainText('complete');
    await page.getByTestId('terminal-SW1.b').click();
    await page.getByTestId('terminal-R1.a').click();
    await expect(page.getByTestId('mission-status')).toContainText('Mission complete');
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
