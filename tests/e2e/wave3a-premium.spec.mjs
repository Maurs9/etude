import { readFileSync } from 'node:fs';
import { test, expect, todayN } from '../helpers/fixtures.mjs';

async function playSequence(page, midis, gap, { slowIndex = -1 } = {}) {
  for (let index = 0; index < midis.length; index += 1) {
    const dt = index === slowIndex ? gap + 180 : index === slowIndex + 1 ? Math.max(80, gap - 180) : gap;
    await page.clock.runFor(dt);
    await page.evaluate((midi) => {
      window.__etude.handleNoteOn(midi, 90, 'test');
      window.__etude.handleNoteOff(midi, 'test');
    }, midis[index]);
  }
}

test.describe('Wave 3A: studio report, Analysis links, minor technique & differential feedback', () => {
  test('Progress exports a UTF-8 BOM CSV report and populates editorial print summary', async ({ app, page }) => {
    await app.open();
    const tn = todayN();
    await page.evaluate(async (today) => {
      const api = window.__etude;
      api.data.totalReviews = 12;
      api.data.totalCorrect = 10;
      api.data.srs['iv:4'] = { box: 3, reps: 4, lapses: 1, due: today };
      api.data.history[today] = 7;
      api.data.history[today - 10] = 5;
      api.data.sheet.ode = { best: 94, learned: true };
      api.saveAll();
      await api.show('progress');
    }, tn);

    await expect(page.locator('#prog-report-csv')).toBeVisible();
    await expect(page.locator('#prog-report-print')).toBeVisible();
    await expect(page.locator('#prog-print-head')).toBeHidden();
    await expect(page.locator('#prog-print-head')).toContainText('Ode to Joy');
    await expect(page.locator('#prog-print-head')).toContainText('7 days: 7 reviews');
    await expect(page.locator('#prog-print-head')).toContainText('30 days: 12 reviews');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#prog-report-csv').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^etude-practice-report-\d{4}-\d{2}-\d{2}\.csv$/);
    const filePath = await download.path();
    const csv = readFileSync(filePath, 'utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Practice report');
    expect(csv).toContain('Last 7 days');
    expect(csv).toContain('Ode to Joy,Built-in repertoire,Yes,94%');
  });

  test('Analysis micro-links (NCT and cadence) navigate straight into the matching Learn lesson', async ({ app, page }) => {
    await app.open({ hash: 'analysis' });
    if (!await page.locator('#pc-pick').evaluate((d) => d.open))
      await page.locator('#pc-sum').click();
    await page.locator('#pc-list .pc-item[data-piece="ode"]').click();
    await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.source?.id === 'ode' && !!window.__etude.SCORE.geo);

    await page.locator('#an-side-btn').click();
    await expect(page.locator('#an-side')).toBeVisible();
    const nctLink = page.locator('#an-now .an-learn-link[data-learn="nct"]').first();
    await expect(nctLink).toBeVisible();
    await nctLink.click();

    await expect(page.locator('#view-learn')).toHaveClass(/active/);
    await page.waitForFunction(() => window.__etude.data.learnSelId === 'nct');

    // Return to Analysis and import a two-bar G7 -> C progression to verify clickable cadence badges.
    await page.evaluate(() => window.__etude.show('analysis'));
    await expect(page.locator('#view-analysis')).toHaveClass(/active/);
    const xml = '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'
      + '<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
      + '<note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><type>whole</type></note>'
      + '<note><chord/><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>'
      + '<note><chord/><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>'
      + '<note><chord/><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>'
      + '<measure number="2">'
      + '<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>'
      + '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>'
      + '<note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>'
      + '<note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>whole</type></note></measure>'
      + '</part></score-partwise>';
    await page.locator('#an-file').setInputFiles({ name: 'cadence.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.source?.kind !== 'example' && !!window.__etude.SCORE.geo);

    if (!await page.locator('#an-side').isVisible())
      await page.locator('#an-side-btn').click();
    await expect(page.locator('#an-side')).toBeVisible();
    await page.locator('#an-tabs [data-tab="piece"]').click();
    const cadLink = page.locator('#an-ws .an-cad.an-learn-link[data-learn="cad"]').first();
    await expect(cadLink).toBeVisible();
    await cadLink.click();

    await expect(page.locator('#view-learn')).toHaveClass(/active/);
    await page.waitForFunction(() => window.__etude.data.learnSelId === 'cad');
  });

  test('Technique supports melodic minor with natural descent and flags thumb-crossing timing bottlenecks', async ({ app, page }) => {
    await app.open({ hash: 'practice', dock: true });
    await page.clock.install();
    await page.locator('#pr-t-scale').click();
    await page.locator('#pr-mode button[data-v="tech"]').click();
    await page.locator('#pr-keys [data-v="9"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#tq-drill')).toBeVisible();

    await page.locator('#tq-drill [data-tq="kind"] button[data-v="melodicMinor"]').click();
    await expect(page.locator('#q-prompt')).toHaveText('A melodic minor scale');
    await expect(page.locator('#tq-drill .tq-how')).toContainText('natural minor');
    await expect(page.locator('#tq-drill .tq-cell').nth(5)).toContainText('F♯');
    await expect(page.locator('#tq-drill .tq-cell').nth(6)).toContainText('G♯');

    // Ascend A melodic minor (slowing down on D5 thumb pass at index 3), verify top reversal updates strip to G / F, then descend.
    await playSequence(page, [69, 71, 72, 74, 76, 78, 80, 81], 280, { slowIndex: 3 });
    await expect(page.locator('#tq-drill .tq-cell').nth(6)).toContainText('G');
    await expect(page.locator('#tq-drill .tq-cell').nth(5)).toContainText('F');
    await playSequence(page, [79, 77, 76, 74, 72, 71, 69], 280);

    await expect(page.locator('#q-elab')).toContainText('recommended thumb crossing');
    await expect(page.locator('#q-elab')).toContainText('finger 1');
  });

  test('Practice ear drill explains the semitone difference between confused intervals', async ({ app, page }) => {
    await app.open({ hash: 'practice', dock: true });
    await page.locator('#pr-t-interval').click();
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#q-answers button').first()).toBeVisible();

    await page.evaluate(() => {
      const q = window.__etude.SES.q;
      const wrong = [...document.querySelectorAll('#q-answers button')].find((b) => b.dataset.k !== String(q.it.semi));
      wrong?.click();
    });

    await expect(page.locator('#q-elab .elab-diff')).toBeVisible();
    await expect(page.locator('#q-elab .elab-diff')).toContainText('Compare:');
    await expect(page.locator('#q-elab .elab-diff')).toContainText('semitone(s)');
  });
});
