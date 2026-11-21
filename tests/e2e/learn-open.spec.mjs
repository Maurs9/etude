import { test, expect } from '../helpers/fixtures.mjs';

// Learn has no locked units: a new user can open any lesson, in any order.
test('a new user can open a lesson in the last unit and no lesson is locked', async ({ app }) => {
  const page = await app.open({ hash: 'learn' });
  const lessons = page.locator('#learnToc button[data-li]');
  await expect(lessons.first()).toBeVisible();
  const count = await lessons.count();
  expect(count).toBeGreaterThan(10);
  await expect(page.locator('#learnToc [data-locked], #learnToc .lu-h [role="img"]')).toHaveCount(0);

  await lessons.nth(count - 1).click();
  await expect(lessons.nth(count - 1)).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#learnBody .learn-content')).not.toBeEmpty();
  await expect(page.locator('#learnBody .lu-lock, #learnBody [data-ln="unlock"]')).toHaveCount(0);
  // the unit's matching reading drill is offered right away
  await expect(page.locator('#learnBody .lu-bar')).toBeVisible();
});

test('Learn Circle of Fifths shows all 15 staff signatures and lets users select either ring', async ({ app }) => {
  const page = await app.open({ hash: 'learn', lang: 'ro' });
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation [data-v="solfege"]').click();
  await page.keyboard.press('Escape');

  await page.locator('#learnToc button[data-li]', { hasText: 'Cercul cvintelor' }).click();
  const cof = page.locator('[data-widget="cof"]');
  await expect(cof).toBeVisible();

  const key = (i, ring = 'maj') => cof.locator(`.cof-k[data-i="${i}"][data-ring="${ring}"]`);
  await expect(key(6).locator('.cof-maj')).toHaveText('Fa♯Sol♭');
  await expect(key(6, 'min').locator('.cof-min')).toHaveText('Re♯mMi♭m');

  await expect(cof.locator('.lw-cof-staff-sector')).toHaveCount(12);
  await expect(cof.locator('.lw-cof-staff')).toHaveCount(15);
  for (let fifths = -7; fifths <= 7; fifths++) {
    const staff = cof.locator(`.lw-cof-staff[data-fifths="${fifths}"]`);
    await expect(staff.locator('use')).toHaveCount(1);
    await expect(staff.locator('.ss-glyph')).toHaveCount(Math.abs(fifths));
  }
  for (const fifths of [-7, 7]) {
    const staff = cof.locator(`.lw-cof-staff[data-fifths="${fifths}"]`);
    const glyphs = await staff.evaluate((el) => {
      const scale = el.getScreenCTM().a;
      const boxes = Array.from(el.querySelectorAll('.ss-glyph'), (glyph) => glyph.getBoundingClientRect());
      return boxes.map((box, i) => ({
        height: box.height / scale,
        gap: i ? (box.left - boxes[i - 1].right) / scale : null,
      }));
    });
    for (const glyph of glyphs) {
      expect(glyph.height).toBeGreaterThanOrEqual(17);
      if (glyph.gap !== null) expect(glyph.gap).toBeGreaterThanOrEqual(2);
    }
  }

  await expect(cof.locator('.lw-staff .ss-num')).toHaveCount(0);
  const overflow = await cof.locator('.lw-staff').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const info = cof.locator('.lw-cof-info');
  await expect(info).toContainText('Do major');
  await key(0, 'min').press('Enter');
  await expect(key(0, 'min')).toBeFocused();
  await expect(key(0, 'min')).toHaveAttribute('aria-pressed', 'true');
  await expect(info).toContainText('La minor');
  await expect(info).toContainText('Relativa majoră: Do major');
  await cof.locator('[data-w="cofmin"]').click();
  await expect(info).toContainText('Do major');

  await key(5).click();
  await cof.locator('[data-w="cofenh"]').click();
  await expect(info).toContainText('Do♭ major');
  await expect(info).toContainText('7 bemol(i):');

  await key(6).click();
  await expect(info).toContainText('Fa♯ major');
  await cof.locator('[data-w="cofenh"]').click();
  await expect(info).toContainText('Sol♭ major');
  await expect(info).toContainText('6 bemol(i):');

  await key(7).click();
  await cof.locator('[data-w="cofenh"]').click();
  await expect(info).toContainText('Do♯ major');
  await expect(info).toContainText('7 diez(i):');
});

test('Learn staff notes preserve their hand and can be played with the keyboard', async ({ app }) => {
  const page = await app.open({ hash: 'learn' });
  await page.getByRole('button', { name: /reading sheet music/i }).first().click();
  const note = page.locator('.lstaff .ss-n').first();
  await expect(note).toHaveAttribute('tabindex', '0');
  await expect(note).toHaveAttribute('role', 'button');
  await expect(note).toHaveAttribute('aria-label', /.+/);
  await expect(note).toHaveAttribute('data-hand', /rh|lh/);
  await page.evaluate(() => {
    const preview = window.__etude.previewNote;
    window.__playedLearnNotes = [];
    window.__etude.previewNote = (midi, ...args) => {
      window.__playedLearnNotes.push(midi);
      return preview(midi, ...args);
    };
  });
  await note.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__playedLearnNotes.length)).toBe(1);
});

test('the Learn circle gives all 15 staves room at mobile and desktop widths', async ({ app }) => {
  const page = await app.open({ hash: 'learn', lang: 'ro' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('combobox', { name: 'Capitol' }).selectOption({ label: 'Cercul cvintelor' });
  const wheel = page.locator('.lw-cof-wheel .cof-svg');
  await expect(wheel).toBeVisible();
  await expect(wheel.locator('.lw-cof-staff')).toHaveCount(15);

  for (const width of [320, 375, 520, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    const bounds = await wheel.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);

    const spacing = await wheel.evaluate((svg) => {
      const hub = svg.querySelector('.cof-hub').getBoundingClientRect();
      const centerX = hub.left + hub.width / 2;
      const centerY = hub.top + hub.height / 2;
      const majorTop = svg.querySelector('.cof-k[data-ring="maj"][data-i="0"] .cof-w').getBoundingClientRect().top;
      const outerTop = svg.querySelector('.lw-cof-staff-sector').getBoundingClientRect().top;
      const scale = svg.getScreenCTM().a;

      return Array.from(svg.querySelectorAll('.lw-cof-staff'), (staff) => {
        const { left, right, top, bottom } = staff.getBoundingClientRect();
        const nearest = Math.hypot(Math.max(left - centerX, centerX - right, 0), Math.max(top - centerY, centerY - bottom, 0));
        const farthest = Math.hypot(Math.max(right - centerX, centerX - left), Math.max(bottom - centerY, centerY - top));
        return {
          key: staff.dataset.fifths,
          innerGap: (majorTop - centerY + nearest) / scale,
          outerGap: (centerY - outerTop - farthest) / scale,
        };
      });
    });
    for (const { key, innerGap, outerGap } of spacing) {
      expect(innerGap, `staff ${key} at ${width}px, distance from the major ring`).toBeGreaterThanOrEqual(12);
      expect(outerGap, `staff ${key} at ${width}px, distance from the outer edge`).toBeGreaterThanOrEqual(6);
    }
  }
});
