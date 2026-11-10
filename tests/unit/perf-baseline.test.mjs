import { describe, it, expect } from 'vitest';

// Dynamic import keeps a missing implementation an explicit assertion failure.
const helpers = async () => import('../../scripts/perf-baseline.mjs').catch(() => ({}));

describe('performance baseline helpers', () => {
  it('accounts for CDP counters resetting at navigation instead of producing negative durations', async () => {
    const { startupCpu } = await helpers();
    expect(startupCpu).toBeTypeOf('function');
    expect(startupCpu({ NavigationStart: 1, TaskDuration: 3, ScriptDuration: 2 },
      { NavigationStart: 2, TaskDuration: 0.2, ScriptDuration: 0.1 })).toEqual({ taskMs: 200, scriptMs: 100, accounting: 'navigation-reset' });
    expect(startupCpu({ NavigationStart: 1, TaskDuration: 1, ScriptDuration: 1 },
      { NavigationStart: 1, TaskDuration: 2, ScriptDuration: 1.5 })).toEqual({ taskMs: 1000, scriptMs: 500, accounting: 'counter-delta' });
    expect(() => startupCpu({}, {})).toThrow();
    expect(() => startupCpu({ NavigationStart: 1, TaskDuration: 2, ScriptDuration: 1 },
      { NavigationStart: 1, TaskDuration: 1, ScriptDuration: 1 })).toThrow();
  });
  it('totals only JavaScript resources, preserving zero cache transfers', async () => {
    const { scriptTotals } = await helpers();
    expect(scriptTotals).toBeTypeOf('function');
    expect(scriptTotals([
      { name: 'http://localhost/a.js?v=1', transferSize: 123, encodedBodySize: 100, decodedBodySize: 200 },
      { name: 'http://localhost/cached.mjs', transferSize: 0, encodedBodySize: 50, decodedBodySize: 50 },
      { name: 'http://localhost/a.css', transferSize: 99, encodedBodySize: 99, decodedBodySize: 99 },
    ])).toEqual({ jsResourceCount: 2, jsTransferBytes: 123, jsEncodedBytes: 150, jsDecodedBytes: 250 });
    expect(scriptTotals([]).jsTransferBytes).toBe(0);
  });
  it('parses CLI options, enforces at least three samples and rejects unknown flags', async () => {
    const { parseArgs } = await helpers();
    expect(parseArgs).toBeTypeOf('function');
    expect(parseArgs([])).toEqual({ samples: 3, help: false });
    expect(parseArgs(['--samples', '5'])).toEqual({ samples: 5, help: false });
    expect(parseArgs(['--help']).help).toBe(true);
    for (const args of [['--samples', '2'], ['--samples', '3.5'], ['--samples'], ['--wat']]) {
      expect(() => parseArgs(args)).toThrow();
    }
  });
  it('aggregates finite scalar metrics with sample counts and nearest-rank p95', async () => {
    const { summarize } = await helpers();
    expect(summarize).toBeTypeOf('function');
    expect(summarize([{ readyMs: 30 }, { readyMs: 10 }, { readyMs: 20 }], ['readyMs'])).toEqual({
      readyMs: { count: 3, median: 20, p95: 30, min: 10, max: 30 },
    });
    expect(() => summarize([{ readyMs: null }], ['readyMs'])).toThrow();
    expect(() => summarize([], ['readyMs'])).toThrow();
  });
  it('defines nearest-rank percentiles without mutating samples', async () => {
    const { percentile } = await helpers();
    expect(percentile).toBeTypeOf('function');
    const values = [30, 10, 20];
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(30);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([7], 0)).toBe(7);
    expect(values).toEqual([30, 10, 20]);
    expect(() => percentile([], 0.5)).toThrow();
    expect(() => percentile([NaN], 0.5)).toThrow();
    expect(() => percentile([1], 1.1)).toThrow();
  });
});
