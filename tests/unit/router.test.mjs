import { describe, expect, it } from 'vitest';
import { formatAnalysisHash, parseAnalysisHash, viewFromHash } from '../../src/domain/router.ts';

describe('analysis sub-route parser & formatter', () => {
  it('parses catalog, builtin, and library sub-routes cleanly', () => {
    expect(parseAnalysisHash('#analysis')).toEqual({ kind: 'catalog' });
    expect(parseAnalysisHash('analysis')).toEqual({ kind: 'catalog' });
    expect(parseAnalysisHash('#analysis/builtin/brahms')).toEqual({ kind: 'builtin', id: 'brahms' });
    expect(parseAnalysisHash('#analysis/lib/abc%20123')).toEqual({ kind: 'lib', id: 'abc 123' });
    expect(parseAnalysisHash('#analysis/lib/piece_1-2')).toEqual({ kind: 'lib', id: 'piece_1-2' });
  });

  it('rejects unknown sub-routes and malformed encodings without throwing', () => {
    expect(parseAnalysisHash('#analysis/')).toBeNull();
    expect(parseAnalysisHash('#analysis/other/foo')).toBeNull();
    expect(parseAnalysisHash('#analysis/builtin/')).toBeNull();
    expect(parseAnalysisHash('#analysis/builtin/a/b')).toBeNull();
    expect(parseAnalysisHash('#analysis/builtin/%E0%A4%A')).toBeNull();
    expect(parseAnalysisHash('#analysis/builtin/a%2Fb')).toBeNull();
  });

  it('formats routes back into encoded hashes', () => {
    expect(formatAnalysisHash({ kind: 'catalog' })).toBe('#analysis');
    expect(formatAnalysisHash({ kind: 'builtin', id: 'canon' })).toBe('#analysis/builtin/canon');
    expect(formatAnalysisHash({ kind: 'lib', id: 'id with spaces' })).toBe('#analysis/lib/id%20with%20spaces');
  });

  it('maps valid analysis sub-routes to analysis view and unknown hashes to today', () => {
    expect(viewFromHash('#analysis')).toBe('analysis');
    expect(viewFromHash('#analysis/builtin/canon')).toBe('analysis');
    expect(viewFromHash('#analysis/lib/xyz')).toBe('analysis');
    expect(viewFromHash('#analysis/unknown')).toBe('today');
    expect(viewFromHash('#analysis/builtin/%E0%A4%A')).toBe('today');
    expect(viewFromHash('#missing')).toBe('today');
  });
});
