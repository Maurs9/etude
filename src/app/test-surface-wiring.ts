import type { TestSurfaceRegistry } from '../domain/views.js';

/**
 * Loaded exclusively via dynamic `import()` under `import.meta.env.DEV || __ETUDE_TEST_SURFACE__`.
 *
 * Production builds (`DEV === false && __ETUDE_TEST_SURFACE__ === false`) dead-code-eliminate
 * the caller branch, so feature modules wired here never enter the production entry chunk.
 * Extracted lazy features register their `window.__etude` test hooks here once moved out of
 * `src/domain/views-runtime.ts`.
 */
export async function wireFeatureTestSurfaces(_registry: TestSurfaceRegistry): Promise<void> {
  // Phase 2+ extracted lazy features register their test-surface getters/setters here.
}
