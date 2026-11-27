import type { AppView } from '../domain/router.js';
import type { FeatureController, TestSurfaceRegistry } from '../domain/views.js';

export type EnsureFeatureFn = (view: AppView) => Promise<FeatureController | null>;

const TEST_SURFACE_FEATURES: readonly AppView[] = ['explore', 'sing', 'learn'];

/**
 * Loaded exclusively via dynamic `import()` under `import.meta.env.DEV || __ETUDE_TEST_SURFACE__`.
 *
 * Production builds (`DEV === false && __ETUDE_TEST_SURFACE__ === false`) dead-code-eliminate
 * the caller branch, so feature modules wired here never enter the production entry chunk.
 * Extracted lazy features are loaded through the shell's `ensureFeature` singleton loader and
 * register their `window.__etude` test hooks here before `data-app-pending` is removed.
 */
export async function wireFeatureTestSurfaces(
  registry: TestSurfaceRegistry,
  ensureFeature: EnsureFeatureFn,
): Promise<void> {
  const controllers = await Promise.all(TEST_SURFACE_FEATURES.map((view) => ensureFeature(view)));
  for (const controller of controllers) {
    controller?.registerTestSurface?.(registry);
  }
}
