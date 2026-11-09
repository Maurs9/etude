import { test, expect } from '../helpers/fixtures.mjs';

const note = (step, accidental = '', extra = '') => `<note><pitch><step>${step}</step>${accidental ? '<alter>1</alter>' : ''}<octave>5</octave></pitch><duration>6</duration><type>quarter</type><dot/>${accidental ? `<accidental>${accidental}</accidental>` : ''}${extra}</note>`;
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Unclassified editorial title</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>4</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><barline location="left"><repeat direction="forward"/></barline>
<direction placement="above"><direction-type><segno/></direction-type><sound segno="S"/></direction>
<direction placement="above"><direction-type><words>ritardando</words></direction-type></direction>
<direction placement="above"><direction-type><other-direction smufl="ornamentTrill" relative-y="20"/></direction-type></direction>
<direction placement="above"><direction-type><octave-shift type="down" size="8"/></direction-type></direction>
<note><grace slash="yes"/><pitch><step>B</step><octave>4</octave></pitch><type>eighth</type></note>
${note('C', 'sharp', '<notehead parentheses="yes">normal</notehead><notations><articulations><accent/></articulations></notations>')}${note('D')}
</measure><measure number="2"><direction><direction-type><words>m.d. m.s.</words></direction-type></direction>${note('E')}${note('F')}<barline location="right"><ending number="1" type="start"/><repeat direction="backward"/></barline></measure>
<measure number="3"><direction><direction-type><octave-shift type="stop" size="8"/></direction-type></direction><direction><direction-type><words>Coda</words><coda/></direction-type><sound coda="C"/></direction><direction><direction-type><words>loco</words></direction-type></direction>${note('G')}${note('A')}<barline location="right"><ending number="1" type="stop"/><bar-style>light-heavy</bar-style></barline></measure>
</part></score-partwise>`;

for (const lang of ['en', 'ro']) {
  test(`full words and rendered navigation marks have hover/keyboard explanations (${lang})`, async ({ app, page }) => {
    await app.open({ hash: 'analysis', lang });
    await page.locator('#an-file').setInputFiles({ name: 'markings.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const result = await page.evaluate(() => ({
      parts: window.__etude.scoreTermParts('ritardando rallentando accelerando crescendo diminuendo espressivo sostenuto simile'),
      kinds: [...new Set(window.__etude.SCORE.syms.map(s => s.kind))],
      uncovered: [...document.querySelectorAll('#an-roll .vf-repetition,#an-roll .vf-textbracket,#an-roll .vf-volta')].filter(el => el.getBoundingClientRect().width && !el.closest('[data-sym]')).map(el => el.getAttribute('class')),
      blank: window.__etude.SCORE.syms.filter(s => !window.__etude.scoreSymText(s).body.trim() || /sym_\w+/.test(window.__etude.scoreSymText(s).line)).map(s => ({ kind: s.kind, val: s.val })),
    }));
    expect(result.parts.length).toBeGreaterThanOrEqual(8);
    // OSMD interprets this standalone coda sign as a To Coda instruction;
    // the collection regression separately exercises Ballade's Coda destination.
    const expectedKinds = ['text', 'segno', 'tocoda', 'ottava', 'volta', 'accidental_sharp', 'dot', 'accent', 'repeat_start', 'repeat_end', 'grace', 'parenthesized'];
    expect(expectedKinds.filter(kind => !result.kinds.includes(kind)), 'source markings omitted by the renderer or tooltip binder').toEqual([]);
    expect(await page.locator('.sc-note-parentheses').count()).toBe(1);
    expect(await page.evaluate(() => window.__etude.AN.notes.length)).toBe(6);
    expect(await page.evaluate(() => window.__etude.SCORE.syms.some(s => s.kind === 'text' && s.val === 'tr' && /tr/i.test(window.__etude.scoreSymText(s).body)))).toBe(true);
    expect(result.uncovered).toEqual([]);
    expect(result.blank).toEqual([]);
    const ritardando = page.locator('#an-roll [data-sym]').filter({ hasText: /^ritardando$/ });
    await expect(ritardando).toHaveCount(1);
    await ritardando.hover();
    await expect(page.locator('#an-hover')).toContainText(lang === 'ro' ? 'încetinește treptat' : 'gradually slow down');
    await ritardando.focus();
    await expect(page.locator('#an-roll .sc-tip')).toContainText(lang === 'ro' ? 'încetinește treptat' : 'gradually slow down');
    expect(await page.locator('.osmd-title [data-sym],.osmd-title[data-sym]').count()).toBe(0);
    await page.evaluate(() => { window.__etude.SCORE.layout = 'cont'; window.__etude.SCORE.look = 'night'; window.__etude.scoreLayout(); });
    expect(await page.evaluate(() => window.__etude.SCORE.syms.some(s => s.kind === 'text' && s.val === 'ritardando'))).toBe(true);
  });
}

test('native metronomes and long performance directions retain complete explanations', async ({ app, page }) => {
  await app.open({ hash: 'analysis', lang: 'ro' });
  const instruction = 'Si deve suonare tutto questo pezzo delicatissimamente e senza sordini';
  const directions = `<direction placement="above"><direction-type><metronome><beat-unit>half</beat-unit><beat-unit-dot/><per-minute>57.5</per-minute></metronome></direction-type><sound tempo="172.5"/></direction><direction placement="above"><direction-type><words>${instruction}</words></direction-type></direction>`;
  await page.locator('#an-file').setInputFiles({ name: 'performance.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml.replace('</attributes>', '</attributes>' + directions)) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  const text = page.locator('#an-roll .osmd-words').filter({ hasText: instruction });
  await expect(text).toHaveCount(1);
  await text.focus();
  await expect(page.locator('#an-hover')).toContainText('extrem de delicat');
  const metronome = page.locator('#an-roll .vf-stavetempo');
  await expect(metronome).toHaveCount(1);
  await expect(metronome).toHaveAttribute('data-sym', /\d+/);
  await metronome.hover();
  await expect(page.locator('#an-hover')).toContainText('57.5');
  await expect(page.locator('#an-hover')).toContainText('metronom');
  expect(await page.evaluate(() => {
    const element = document.querySelector('.vf-stavetempo');
    return window.__etude.SCORE.syms.find(s => s.el === element)?.val;
  })).toBe('𝅗𝅥. = 57.5');
});
