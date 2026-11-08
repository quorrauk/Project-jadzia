import { test, expect } from '@playwright/test';

// Board geometry: 40 units per grid step, viewBox starts at -20 and is 1000 units wide.
const GRID = 40;
const VIEW_W = 1000;

async function openWorkshop(page, { guest = false } = {}) {
  await page.goto('/index.html');
  if (guest) {
    await page.getByTestId('start-guest').click();
  } else {
    await page.getByTestId('name-input').fill('Ada');
    await page.getByTestId('robot-input').fill('Rover');
    await page.getByTestId('enlist-button').click();
  }
  await page.getByTestId('open-workshop').click();
  await expect(page.getByTestId('workshop')).toBeVisible();
}

async function tapCell(page, gx, gy) {
  const board = page.getByTestId('board');
  const box = await board.boundingBox();
  const s = box.width / VIEW_W;
  await board.click({ position: { x: (gx * GRID + 20) * s, y: (gy * GRID + 20) * s } });
}

async function place(page, type, gx, gy) {
  await page.getByTestId(`palette-${type}`).click();
  await tapCell(page, gx, gy);
}

async function wire(page, from, to) {
  await page.getByTestId(`terminal-${from}`).click();
  await page.getByTestId(`terminal-${to}`).click();
}

async function centre(locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const status = (page) => page.getByTestId('status-text');

test.describe('workshop: building', () => {
  test('battery + wire + bulb lights the bulb (tap to place, tap to wire)', async ({ page }) => {
    await openWorkshop(page);
    await expect(status(page)).toContainText('battery');

    await place(page, 'battery', 5, 4);
    await place(page, 'bulb', 13, 7);
    await expect(page.getByTestId('part-B1')).toBeVisible();
    await expect(page.getByTestId('part-BULB1')).toBeVisible();
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'false');

    await wire(page, 'B1.a', 'BULB1.a');
    await expect(status(page)).toContainText('Nothing is flowing');
    await expect(status(page)).toContainText('loop');
    await wire(page, 'BULB1.b', 'B1.b');

    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'true');
    await expect(status(page)).toContainText('Lights on');
  });

  test('dragging a part from the list onto the board places it', async ({ page }) => {
    await openWorkshop(page);
    const from = await centre(page.getByTestId('palette-battery'));
    const board = await page.getByTestId('board').boundingBox();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y - 30, { steps: 4 });
    await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('part-B1')).toBeVisible();
  });

  test('dragging from one dot to another makes a wire', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 5, 3);
    await place(page, 'bulb', 13, 8);
    const a = await centre(page.getByTestId('terminal-B1.a'));
    const b = await centre(page.getByTestId('terminal-BULB1.a'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('wire-W1')).toBeVisible();
  });

  test('moving a part drags its wires along', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 5, 3);
    await place(page, 'bulb', 13, 8);
    await wire(page, 'B1.a', 'BULB1.a');
    const before = await centre(page.getByTestId('terminal-B1.a'));
    const grab = await centre(page.getByTestId('part-B1'));
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 20, grab.y + 40, { steps: 5 });
    await page.mouse.move(grab.x + 80, grab.y + 80, { steps: 5 });
    await page.mouse.up();
    const after = await centre(page.getByTestId('terminal-B1.a'));
    expect(after.x).toBeGreaterThan(before.x + 20);
    expect(after.y).toBeGreaterThan(before.y + 20);
    await expect(page.getByTestId('wire-W1')).toBeVisible();
  });

  test('turning and deleting a part', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'resistor', 8, 5);
    await page.getByTestId('btn-rotate').click();
    await expect(page.getByTestId('part-R1')).toHaveAttribute('transform', /rotate\(90\)/);
    await page.getByTestId('btn-delete').click();
    await expect(page.getByTestId('part-R1')).toHaveCount(0);
  });

  test('keyboard: R turns and Delete removes the selected part', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'bulb', 8, 5);
    await page.keyboard.press('r');
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('transform', /rotate\(90\)/);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('part-BULB1')).toHaveCount(0);
  });

  test('placing on top of another part finds the next free spot instead of failing', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'bulb', 8, 5);
    await place(page, 'bulb', 8, 5);
    await expect(page.getByTestId('part-BULB1')).toBeVisible();
    await expect(page.getByTestId('part-BULB2')).toBeVisible();
  });
});

test.describe('workshop: the circuit reacts', () => {
  test('a battery wired straight to itself is a short circuit', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 8, 5);
    await wire(page, 'B1.a', 'B1.b');
    await expect(status(page)).toContainText('Short circuit');
  });

  test('an LED with no resistor pops, and fixing the cause lets it be repaired', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 5, 4);
    await place(page, 'led', 13, 7);
    await wire(page, 'B1.a', 'LED1.a');
    await wire(page, 'LED1.b', 'B1.b');

    await expect(page.getByTestId('part-LED1')).toHaveAttribute('data-burnt', 'true');
    await expect(status(page)).toContainText('retired early');
    await expect(status(page)).toContainText('resistor');

    // Repairing without fixing the cause pops it again. Funny, not fatal.
    await page.getByTestId('part-LED1').click();
    await page.getByTestId('btn-repair').click();
    await expect(page.getByTestId('part-LED1')).toHaveAttribute('data-burnt', 'true');

    // Fix the cause: a 1.5 V cell cannot push a red LED, so nothing burns.
    await page.getByTestId('part-B1').click();
    await page.getByTestId('chip-voltage-1.5').click();
    await page.getByTestId('part-LED1').click();
    await page.getByTestId('btn-repair').click();
    await expect(page.getByTestId('part-LED1')).toHaveAttribute('data-burnt', 'false');
  });

  test('a resistor makes the LED safe and it lights', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 4, 3);
    await place(page, 'resistor', 12, 3);
    await place(page, 'led', 12, 8);
    await wire(page, 'B1.a', 'R1.a');
    await wire(page, 'R1.b', 'LED1.a');
    await wire(page, 'LED1.b', 'B1.b');
    await expect(page.getByTestId('part-LED1')).toHaveAttribute('data-lit', 'true');
    await expect(page.getByTestId('part-LED1')).toHaveAttribute('data-burnt', 'false');
  });

  test('the dimmer slider changes the current', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 4, 3);
    await place(page, 'variable_resistor', 12, 3);
    await wire(page, 'B1.a', 'VR1.a');
    await wire(page, 'VR1.b', 'B1.b');
    await page.getByTestId('part-VR1').click();
    const slider = page.getByTestId('vr-slider');
    await slider.fill('100');
    const low = await status(page).textContent();
    await slider.fill('900');
    const high = await status(page).textContent();
    expect(low).not.toEqual(high);
  });
});

test.describe('workshop: help and starter', () => {
  test('the starter circuit teaches the switch: dark, then tap, then lit, then dark', async ({ page }) => {
    await openWorkshop(page);
    await page.getByTestId('btn-starter').click();
    await expect(page.getByTestId('part-SW1')).toBeVisible();
    await expect(status(page)).toContainText('switch');
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'false');

    await page.getByTestId('part-SW1').click();
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'true');
    await expect(status(page)).toContainText('Lights on');

    await page.getByTestId('part-SW1').click();
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'false');
  });

  test('"I don\'t get it" explains in plain steps and can load a working circuit', async ({ page }) => {
    await openWorkshop(page);
    await page.getByTestId('btn-help').click();
    await expect(page.getByTestId('help')).toBeVisible();
    await expect(page.getByTestId('help')).toContainText('Make a loop');
    await page.getByTestId('help-starter').click();
    await expect(page.getByTestId('part-SW1')).toBeVisible();
    await expect(page.getByTestId('help')).toBeHidden();
  });

  test('replacing or clearing a board you built asks first', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 5, 4);

    await page.getByTestId('btn-starter').click();
    await expect(page.getByTestId('btn-starter')).toContainText('Sure?');
    await expect(page.getByTestId('part-B1')).toBeVisible();
    await page.getByTestId('btn-clear').click();
    await expect(page.getByTestId('btn-clear')).toContainText('Tap again');
    await page.getByTestId('btn-clear').click();
    await expect(page.locator('[data-part]')).toHaveCount(0);
  });
});

test.describe('workshop: levels', () => {
  async function selectBulbInLitStarter(page) {
    await page.getByTestId('btn-starter').click();
    await page.getByTestId('part-SW1').click();
    await page.getByTestId('part-BULB1').click();
  }

  test('readouts get deeper as the level goes up, and she can change level right here', async ({ page }) => {
    await openWorkshop(page);
    await selectBulbInLitStarter(page);
    const readout = page.getByTestId('readout');

    await expect(readout).toContainText('Push');
    await expect(readout).not.toContainText('P = V × I');

    await page.getByTestId('ws-level-select').selectOption('2');
    await expect(readout).toContainText('R = V ÷ I');

    await page.getByTestId('ws-level-select').selectOption('3');
    await expect(readout).toContainText('P = V × I');

    await page.getByTestId('ws-level-select').selectOption('4');
    await expect(readout).toContainText('Kirchhoff');

    await page.getByTestId('ws-level-select').selectOption('5');
    await expect(readout).toContainText('Ground');
    await expect(readout).toContainText('V(BULB1.a)');

    await page.getByTestId('ws-level-select').selectOption('1');
    await expect(readout).toContainText('Push');
  });

  test('the level chosen in the workshop is the level on the home screen', async ({ page }) => {
    await openWorkshop(page);
    await page.getByTestId('ws-level-select').selectOption('4');
    await page.getByTestId('ws-back').click();
    await expect(page.getByTestId('level-pill')).toContainText('Level 4 · Specialist');
  });
});

test.describe('workshop: saving', () => {
  test('a candidate\'s board is still there after leaving and after a reload', async ({ page }) => {
    await openWorkshop(page);
    await page.getByTestId('btn-starter').click();
    await page.getByTestId('part-SW1').click();
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'true');

    await page.getByTestId('ws-back').click();
    await page.reload();
    await page.getByTestId('open-workshop').click();
    await expect(page.getByTestId('part-SW1')).toBeVisible();
    await expect(page.getByTestId('part-BULB1')).toHaveAttribute('data-lit', 'true');
  });

  test('each candidate has their own board', async ({ page }) => {
    await openWorkshop(page);
    await page.getByTestId('btn-starter').click();
    await page.getByTestId('ws-back').click();
    await page.getByTestId('switch-profile').click();
    await page.getByTestId('new-profile').click();
    await page.getByTestId('name-input').fill('Mr Jones');
    await page.getByTestId('robot-input').fill('Bolt');
    await page.getByTestId('enlist-button').click();
    await page.getByTestId('open-workshop').click();
    await expect(page.locator('[data-part]')).toHaveCount(0);
  });

  test('a guest can build freely and nothing is saved', async ({ page }) => {
    await openWorkshop(page, { guest: true });
    await page.getByTestId('btn-starter').click();
    await expect(page.getByTestId('part-SW1')).toBeVisible();
    await page.reload();
    const saved = await page.evaluate(() => window.localStorage.getItem('jadzia.progress.v2'));
    expect(saved).toBeNull();
    await expect(page.getByTestId('recruitment')).toBeVisible();
  });
});

test.describe('workshop: touch', () => {
  test('dots, palette buttons and chips are all at least 44px', async ({ page }) => {
    await openWorkshop(page);
    await place(page, 'battery', 5, 4);
    for (const id of ['terminal-B1.a', 'terminal-B1.b', 'palette-battery', 'palette-led', 'ws-back', 'btn-help']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    }
    const chip = await page.getByTestId('chip-voltage-4.5').boundingBox();
    expect(chip.height).toBeGreaterThanOrEqual(44);
  });
});
