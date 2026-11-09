import { test, expect } from '../helpers/fixtures.mjs';

// Three deliberately sparse systems on one page. The slur changes both staff and
// voice, and its starting voice has NO entry in the middle (or final) system.
// Reusing either endpoint just because it belongs to the same SVG is unsafe.
const CONTINUATION = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Absent-voice continuation</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration>
        <voice>1</voice><type>whole</type><staff>1</staff>
        <notations><slur type="start" number="1" placement="above"/></notations>
      </note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration>
        <voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <print new-system="yes"><system-layout><system-distance>120</system-distance></system-layout></print>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration>
        <voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="3">
      <print new-system="yes"><system-layout><system-distance>120</system-distance></system-layout></print>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>2</duration>
        <voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>F</step><octave>3</octave></pitch><duration>2</duration>
        <voice>2</voice><type>half</type><staff>2</staff>
        <notations><slur type="stop" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

// Read ownership from source measures, not from SVG identity, proximity, or the
// implementation's choice of fallback note. Bounds are SVG units (10 / space),
// so the same assertions apply after continuous layout and zoom.
function continuationGeometry() {
  const { AN, SCORE } = window.__etude;
  const sheet = SCORE.engine.readLayout().graphicSheet;
  const svgs = [...document.querySelectorAll('#an-roll svg')];
  const systems = sheet.MusicPages.flatMap((page, pi) => page.MusicSystems.map(system => ({
    system, svg: svgs[pi], page: pi,
    measures: system.StaffLines[0].Measures.map(m => m.parentSourceMeasure.MeasureNumber),
    top: Math.min(...system.StaffLines.map(s => s.PositionAndShape.AbsolutePosition.y * 10)),
    bottom: Math.max(...system.StaffLines.map(s => (s.PositionAndShape.AbsolutePosition.y + s.StaffHeight) * 10)),
  })));
  const systemOf = note => sheet.MeasureList.find(row => row.some(m => m &&
    note.start >= m.parentSourceMeasure.AbsoluteTimestamp.RealValue * 4 - .001 &&
    note.start < (m.parentSourceMeasure.AbsoluteTimestamp.RealValue + m.parentSourceMeasure.Duration.RealValue) * 4 - .001
  ))?.find(Boolean)?.ParentMusicSystem;
  const links = AN.source.links.filter(link => link.kind === 'slur');
  const segments = links.flatMap(link => {
    const start = systems.findIndex(s => s.system === systemOf(AN.notes[link.a]));
    const end = systems.findIndex(s => s.system === systemOf(AN.notes[link.b]));
    const key = `${link.a}:${link.b}`;
    return systems.slice(start, end + 1).map((owner, segment) => {
      const paths = [...document.querySelectorAll('#an-roll .sc-xline[data-kind="slur"]')]
        .filter(path => path.dataset.link === key && path.dataset.segment === String(segment));
      return {
        segment, measures: owner.measures, count: paths.length,
        paths: paths.map(path => {
          const bounds = path.getBBox();
          const length = path.getTotalLength();
          const samples = Array.from({ length: 65 }, (_, i) => path.getPointAtLength(length * i / 64));
          return {
            correctPage: path.ownerSVGElement === owner.svg,
            visible: getComputedStyle(path).visibility === 'visible' && getComputedStyle(path).display !== 'none',
            nonempty: bounds.width > 0 && length > 0,
            withinStaffArea: bounds.y >= owner.top - .5 && bounds.y + bounds.height <= owner.bottom + .5,
            // Sample the actual curve as well as its bounding box. A same-page
            // diagonal may have valid endpoints but crosses another system's gap.
            whitespaceCrossings: systems.filter((s, i) => s.page === owner.page && systems[i + 1]?.page === s.page)
              .filter(s => {
                const next = systems[systems.indexOf(s) + 1];
                const gapMiddle = (s.bottom + next.top) / 2;
                return samples.some(p => p.y < gapMiddle) && samples.some(p => p.y > gapMiddle);
              }).map(s => s.measures),
            bounds: { top: bounds.y, bottom: bounds.y + bounds.height },
            staffArea: { top: owner.top, bottom: owner.bottom },
          };
        }),
      };
    });
  });
  return {
    pages: sheet.MusicPages.length,
    systems: systems.map(s => ({ page: s.page, measures: s.measures })),
    links: links.map(link => ({
      kind: link.kind,
      from: { staff: AN.notes[link.a].staff, voice: AN.notes[link.a].voice, start: AN.notes[link.a].start },
      to: { staff: AN.notes[link.b].staff, voice: AN.notes[link.b].voice, start: AN.notes[link.b].start },
    })),
    middleNotes: AN.notes.filter(n => n.start >= 4 && n.start < 8).map(n => ({ staff: n.staff, voice: n.voice })),
    totalPaths: document.querySelectorAll('#an-roll .sc-xline[data-kind="slur"]').length,
    segments,
  };
}

test('cross-system slur stays complete and local when its starting voice is absent in the middle system', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#an-file').setInputFiles({
    name: 'absent-voice-continuation.musicxml', mimeType: 'application/xml', buffer: Buffer.from(CONTINUATION),
  });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);

  for (const [label, layout, zoom] of [
    ['page', 'page', 1], ['continuous', 'cont', 1], ['page restored', 'page', 1], ['page zoomed', 'page', 1.25],
  ]) {
    await test.step(label, async () => {
      await page.evaluate(({ layout, zoom }) => {
        window.__etude.SCORE.layout = layout;
        window.__etude.SCORE.zoom = zoom;
        window.__etude.scoreLayout();
      }, { layout, zoom });
      const result = await page.evaluate(continuationGeometry);
      expect(result.links).toEqual([{
        kind: 'slur', from: { staff: 1, voice: 1, start: 0 }, to: { staff: 2, voice: 2, start: 10 },
      }]);
      expect(result.middleNotes).toEqual([{ staff: 2, voice: 2 }]);
      expect(result.pages).toBe(1);
      expect(result.systems).toEqual(layout === 'page'
        ? [{ page: 0, measures: [1] }, { page: 0, measures: [2] }, { page: 0, measures: [3] }]
        : [{ page: 0, measures: [1, 2, 3] }]);
      expect.soft(result.totalPaths, JSON.stringify(result.segments)).toBe(result.systems.length);
      expect(result.segments).toHaveLength(result.systems.length);
      for (const segment of result.segments) {
        expect.soft(segment.count, JSON.stringify(segment)).toBe(1);
        for (const path of segment.paths) {
          expect(path.correctPage, JSON.stringify(segment)).toBe(true);
          expect(path.visible).toBe(true);
          expect(path.nonempty).toBe(true);
          expect.soft(path.withinStaffArea, JSON.stringify(segment)).toBe(true);
          expect.soft(path.whitespaceCrossings, JSON.stringify(segment)).toEqual([]);
        }
      }
      // A second repair must replace the segments rather than duplicate them.
      await page.evaluate(() => window.__etude.scoreXLines());
      expect(await page.evaluate(continuationGeometry)).toEqual(result);
    });
  }
});
