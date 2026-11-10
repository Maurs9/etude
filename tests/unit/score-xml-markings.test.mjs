import { describe, expect, it } from 'vitest';
import { scoreDetectPartHands } from '../../src/domain/score-xml-markings.ts';

class MockNode {
  constructor(localName, attrs = {}, text = '', children = []) {
    this.localName = localName;
    this.attrs = attrs;
    this.textContent = text;
    this.children = children;
    children.forEach(c => { c.parentElement = this; });
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const results = [];
    const parts = selector.split('>').map(s => s.trim());

    const matchStep = (node, stepIndex) => {
      const step = parts[stepIndex];
      const match = node.localName === step;
      if (!match) return;
      if (stepIndex === parts.length - 1) {
        results.push(node);
        return;
      }
      for (const child of node.children) {
        matchStep(child, stepIndex + 1);
      }
    };

    if (parts.length === 1) {
      const searchDescendants = (node) => {
        for (const child of node.children) {
          if (child.localName === parts[0]) results.push(child);
          searchDescendants(child);
        }
      };
      searchDescendants(this);
    } else {
      for (const child of this.children) {
        matchStep(child, 0);
      }
    }
    return results;
  }
}

class MockDocument {
  constructor(root) {
    this.documentElement = root;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    if (selector.startsWith('score-partwise > ')) {
      const sub = selector.slice('score-partwise > '.length);
      return this.documentElement.querySelectorAll(sub);
    }
    return this.documentElement.querySelectorAll(selector);
  }
}

function buildScoreDoc({ partListChildren, parts = [] }) {
  const pl = new MockNode('part-list', {}, '', partListChildren);
  const partNodes = parts.map((p, i) => {
    const staves = p.staves ? [new MockNode('staves', {}, String(p.staves))] : [];
    const attrs = new MockNode('attributes', {}, '', staves);
    const measure = new MockNode('measure', { number: '1' }, '', [attrs]);
    return new MockNode('part', { id: p.id || `P${i + 1}` }, '', [measure]);
  });
  const root = new MockNode('score-partwise', {}, '', [pl, ...partNodes]);
  return new MockDocument(root);
}

describe('scoreDetectPartHands', () => {
  it('detects two parts grouped with a brace bracket (Viva La Vida & Sur le Fil style)', () => {
    const groupStart = new MockNode('part-group', { type: 'start', number: '1' }, '', [
      new MockNode('group-symbol', {}, 'brace'),
    ]);
    const sp1 = new MockNode('score-part', { id: 'P1' }, '', [
      new MockNode('part-name', {}, ''),
    ]);
    const sp2 = new MockNode('score-part', { id: 'P2' }, '', [
      new MockNode('part-name', {}, ''),
    ]);
    const groupStop = new MockNode('part-group', { type: 'stop', number: '1' });

    const doc = buildScoreDoc({
      partListChildren: [groupStart, sp1, sp2, groupStop],
      parts: [{ id: 'P1', staves: 1 }, { id: 'P2', staves: 1 }],
    });

    const result = scoreDetectPartHands(doc);
    expect(result.hands.get(0)).toBe('rh');
    expect(result.hands.get(1)).toBe('lh');
    expect(result.sisters.get(0)).toBe(1);
    expect(result.sisters.get(1)).toBe(0);
  });

  it('detects two parts named Right Hand and Left Hand', () => {
    const sp1 = new MockNode('score-part', { id: 'P_RH' }, '', [
      new MockNode('part-name', {}, 'Right Hand'),
      new MockNode('part-abbreviation', {}, 'R.H.'),
    ]);
    const sp2 = new MockNode('score-part', { id: 'P_LH' }, '', [
      new MockNode('part-name', {}, 'Left Hand'),
      new MockNode('part-abbreviation', {}, 'L.H.'),
    ]);

    const doc = buildScoreDoc({
      partListChildren: [sp1, sp2],
      parts: [{ id: 'P_RH', staves: 1 }, { id: 'P_LH', staves: 1 }],
    });

    const result = scoreDetectPartHands(doc);
    expect(result.hands.get(0)).toBe('rh');
    expect(result.hands.get(1)).toBe('lh');
    expect(result.sisters.get(0)).toBe(1);
    expect(result.sisters.get(1)).toBe(0);
  });

  it('detects French/Italian/German hand names (MD/MS, etc.)', () => {
    const sp1 = new MockNode('score-part', { id: 'P1' }, '', [
      new MockNode('part-name', {}, 'Main droite'),
      new MockNode('part-abbreviation', {}, 'M.D.'),
    ]);
    const sp2 = new MockNode('score-part', { id: 'P2' }, '', [
      new MockNode('part-name', {}, 'Main gauche'),
      new MockNode('part-abbreviation', {}, 'M.G.'),
    ]);

    const doc = buildScoreDoc({
      partListChildren: [sp1, sp2],
      parts: [{ id: 'P1', staves: 1 }, { id: 'P2', staves: 1 }],
    });

    const result = scoreDetectPartHands(doc);
    expect(result.hands.get(0)).toBe('rh');
    expect(result.hands.get(1)).toBe('lh');
    expect(result.sisters.get(0)).toBe(1);
    expect(result.sisters.get(1)).toBe(0);
  });

  it('detects exactly two single-staff parts as RH and LH even without explicit grouping', () => {
    const sp1 = new MockNode('score-part', { id: 'P1' }, '', [
      new MockNode('part-name', {}, 'Piano 1'),
    ]);
    const sp2 = new MockNode('score-part', { id: 'P2' }, '', [
      new MockNode('part-name', {}, 'Piano 2'),
    ]);

    const doc = buildScoreDoc({
      partListChildren: [sp1, sp2],
      parts: [{ id: 'P1', staves: 1 }, { id: 'P2', staves: 1 }],
    });

    const result = scoreDetectPartHands(doc);
    expect(result.hands.get(0)).toBe('rh');
    expect(result.hands.get(1)).toBe('lh');
    expect(result.sisters.get(0)).toBe(1);
  });

  it('leaves single-part grand staff (2 staves) untouched', () => {
    const sp1 = new MockNode('score-part', { id: 'P1' }, '', [
      new MockNode('part-name', {}, 'Piano'),
    ]);

    const doc = buildScoreDoc({
      partListChildren: [sp1],
      parts: [{ id: 'P1', staves: 2 }],
    });

    const result = scoreDetectPartHands(doc);
    expect(result.hands.size).toBe(0);
    expect(result.sisters.size).toBe(0);
  });

  it('detects braced piano parts in a 3-part score with solo instrument', () => {
    const spSolo = new MockNode('score-part', { id: 'P_Vln' }, '', [
      new MockNode('part-name', {}, 'Violin'),
    ]);
    const groupStart = new MockNode('part-group', { type: 'start', number: '1' }, '', [
      new MockNode('group-symbol', {}, 'brace'),
      new MockNode('group-name', {}, 'Piano'),
    ]);
    const spPno1 = new MockNode('score-part', { id: 'P_Pno1' }, '', [
      new MockNode('part-name', {}, ''),
    ]);
    const spPno2 = new MockNode('score-part', { id: 'P_Pno2' }, '', [
      new MockNode('part-name', {}, ''),
    ]);
    const groupStop = new MockNode('part-group', { type: 'stop', number: '1' });

    const doc = buildScoreDoc({
      partListChildren: [spSolo, groupStart, spPno1, spPno2, groupStop],
      parts: [
        { id: 'P_Vln', staves: 1 },
        { id: 'P_Pno1', staves: 1 },
        { id: 'P_Pno2', staves: 1 },
      ],
    });

    const result = scoreDetectPartHands(doc);
    expect(result.hands.get(0)).toBeUndefined();
    expect(result.hands.get(1)).toBe('rh');
    expect(result.hands.get(2)).toBe('lh');
    expect(result.sisters.get(1)).toBe(2);
    expect(result.sisters.get(2)).toBe(1);
  });
});
