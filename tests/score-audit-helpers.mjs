// Independent ink audit, evaluated in the browser. Empty/hidden pedal output is not a pass.
export function scorePedalCollisions() {
  const root = document.querySelector('#an-roll'), issues = [];
  const expected = new DOMParser().parseFromString(window.__etude.SCORE.xml || '', 'application/xml').querySelectorAll('pedal').length;
  let total = 0;
  const pos = o => o?.PositionAndShape?.AbsolutePosition;
  for (const [page, svg] of [...root.querySelectorAll('svg')].entries()) {
    const ctm = svg.getScreenCTM(), bounds = svg.getBoundingClientRect();
    const ink = el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      const pad = style.stroke !== 'none' ? Math.max(.5, parseFloat(style.strokeWidth) * Math.abs(ctm.d) / 2 || .5) : 0;
      return { left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad };
    };
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .1;
    const obstacles = [...svg.querySelectorAll('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-ledgers path,.vf-ledgers line,.vf-modifiers path,.vf-stavetie path,path.vf-stavetie,.sc-xline,text')]
      .filter(el => !el.closest('.vf-sc-pedal')).map(el => ({ el, r: ink(el) }));
    const pedals = [...svg.querySelectorAll('.vf-sc-pedal path')].filter(el => el.getBoundingClientRect().width > .1);
    total += pedals.length;
    for (const [pedal, el] of pedals.entries()) {
      const r = ink(el), owner = el.closest('.vf-sc-pedal').scPedalOwner, sys = owner?.staffLine.ParentMusicSystem;
      const add = kind => issues.push({ page: page + 1, pedal, kind });
      const shift = (el.getAttribute('transform') || '').slice((el.dataset.pedalBaseTransform || '').length).match(/translate\((-?[\d.]+)[ ,]+(-?[\d.]+)\)/);
      if (shift && (Math.abs(+shift[1]) > 40.01 || Math.abs(+shift[2]) > 40.01)) add('migration');
      if (el.dataset.pedalUnresolved || getComputedStyle(el).visibility === 'hidden') add('unresolved');
      if (r.left < bounds.left - .5 || r.right > bounds.right + .5 || r.top < bounds.top - .5 || r.bottom > bounds.bottom + .5) add('page');
      if (!owner || !sys || !pos(sys)) add('missing-owner');
      else {
        const systems = sys.Parent?.MusicSystems || [], next = systems[systems.indexOf(sys) + 1];
        if (r.top < ctm.f + pos(sys).y * 10 * ctm.d - .5 || (pos(next) && r.bottom > ctm.f + pos(next).y * 10 * ctm.d + .5)) add('system');
        const p = owner.pedal, release = r.right - r.left < (r.bottom - r.top) * 1.3;
        const endpoint = release ? p.endMeasure || p.endVfVoiceEntry?.parentStaffEntry.parentMeasure : p.startVfVoiceEntry?.parentStaffEntry.parentMeasure;
        const measures = owner.staffLine.Measures || [], m = endpoint?.ParentStaffLine?.ParentMusicSystem === sys ? endpoint : release ? measures[measures.length - 1] : measures[0];
        // Cross-system pedals use the visible fragment, not an off-page endpoint measure.
        if (m?.ParentStaffLine?.ParentMusicSystem === sys && pos(m)) {
          const left = ctm.e + pos(m).x * 10 * ctm.a, right = left + m.PositionAndShape.Size.width * 10 * ctm.a, slack = Math.abs(ctm.a) * 40;
          if (r.right < left - slack || r.left > right + slack) add('measure');
        }
      }
      for (const o of obstacles) if (overlap(r, o.r)) {
        if (o.el.matches('.sc-xline,.vf-stavetie path,path.vf-stavetie')) {
          // Independent point-in-ink check: a curve's empty bounding-box interior is not an obstacle.
          const inverse = o.el.getScreenCTM().inverse(), style = getComputedStyle(o.el);
          let hit = false;
          for (let y = Math.max(r.top, o.r.top); y <= Math.min(r.bottom, o.r.bottom) && !hit; y += .5) {
            for (let x = Math.max(r.left, o.r.left); x <= Math.min(r.right, o.r.right) && !hit; x += .5) {
              const point = new DOMPoint(x, y).matrixTransform(inverse);
              hit = (style.fill !== 'none' && o.el.isPointInFill(point)) || (style.stroke !== 'none' && o.el.isPointInStroke(point));
            }
          }
          if (!hit) continue;
        }
        add(o.el.closest('.vf-ledgers') ? 'vf-ledgers' : o.el.getAttribute('class') || o.el.localName);
      }
      for (const other of pedals.slice(pedal + 1)) if (overlap(r, ink(other))) add('pedal');
    }
  }
  if (expected && !total) issues.push({ kind: 'missing-pedals', expected });
  if (+root.dataset.pedalUnresolved > 0 && !issues.some(x => x.kind === 'unresolved')) issues.push({ kind: 'unresolved', count: +root.dataset.pedalUnresolved });
  return issues;
}
