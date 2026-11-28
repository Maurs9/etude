import { ESTIMATOR_VERSION } from '../../domain/score-difficulty.js';
import type { ImportedDifficultyEstimate } from '../../domain/score-difficulty-import.js';
import type { LibraryHost, LibraryItem, OpenedScoreEstimator } from '../../domain/score-library-types.js';
import { libraryGet, librarySave, libraryUpdateLevels } from '../../domain/score-library-store.js';
import type { LibraryTextKey } from '../../locales/library-runtime.js';
import {
  currentEstimateFor, makeRating, needsRating, referenceTempo, type LibraryEstimate,
} from './library-query.js';
import type { LibraryValues } from './library-dialogs.js';

export function requestStorageProtection(onResult: (granted: boolean) => void): void {
  // Invoked directly during the user's import gesture, not during app initialization.
  const manager = navigator.storage;
  if (!manager?.persist) {
    onResult(false);
    return;
  }
  try {
    void manager.persist().then((granted) => { onResult(granted); })
      .catch(() => { onResult(false); });
  } catch {
    onResult(false);
  }
}

export async function importLibraryFiles(
  selected: readonly File[],
  host: LibraryHost,
  onFailure: (fileName: string) => void,
): Promise<{ added: number; duplicates: number; errors: number }> {
  let added = 0;
  let duplicates = 0;
  let errors = 0;
  for (const file of selected) {
    try {
      const metadata = await host.inspect(file);
      const result = await librarySave(file, metadata);
      if (result.duplicate) duplicates++;
      else added++;
    } catch {
      errors++;
      onFailure(file.name);
    }
  }
  return { added, duplicates, errors };
}

export interface AutoRatingController {
  scoreForItem(id: string, bpm?: number, estimateOpened?: OpenedScoreEstimator): Promise<ImportedDifficultyEstimate | null>;
  queueAutomaticRatings(): void;
  saveRating(id: string, result: ImportedDifficultyEstimate, focus: HTMLButtonElement, manualBpm?: number): void;
}

export interface AutoRatingDeps {
  readonly host: LibraryHost;
  readonly estimates: Map<string, LibraryEstimate>;
  readonly getItems: () => readonly LibraryItem[];
  readonly isBusy: () => boolean;
  readonly ratingAffectsResults: () => boolean;
  readonly updateRowRating: (id: string) => void;
  readonly renderPreservingFocus: () => void;
  readonly refresh: () => Promise<void>;
  readonly run: (action: () => Promise<void>, errorKey?: LibraryTextKey) => Promise<void>;
  readonly notice: (key: LibraryTextKey, values?: LibraryValues) => void;
  readonly getStatusKey: () => LibraryTextKey | undefined;
}

export function createAutoRatingController(deps: AutoRatingDeps): AutoRatingController {
  let ratingWorkerActive = false;
  let ratingRenderTimer = 0;

  const findItem = (id: string) => deps.getItems().find((it) => it.id === id);

  function scoreForItem(
    id: string,
    bpm = referenceTempo(findItem(id)),
    estimateOpened?: OpenedScoreEstimator,
  ): Promise<ImportedDifficultyEstimate | null> {
    const cached = deps.estimates.get(id);
    if (cached && cached.estimatorVersion === ESTIMATOR_VERSION && cached.bpm === bpm) {
      return cached.promise;
    }
    const promise = (estimateOpened
      ? new Promise<void>((resolve) => { window.setTimeout(resolve, 0); }).then(() => estimateOpened(bpm))
      : libraryGet(id).then((stored) => (stored ? deps.host.difficulty(stored.file, bpm) : null))).catch(() => null);
    const pending: LibraryEstimate = { estimatorVersion: ESTIMATOR_VERSION, bpm, promise };
    deps.estimates.set(id, pending);
    void promise.then((result) => {
      pending.result = result;
      if (currentEstimateFor(deps.estimates, id, findItem(id)) !== pending) return;
      deps.updateRowRating(id);
      if (deps.ratingAffectsResults() && !ratingRenderTimer) {
        ratingRenderTimer = window.setTimeout(() => {
          ratingRenderTimer = 0;
          if (!deps.ratingAffectsResults()) return;
          deps.renderPreservingFocus();
        }, 100);
      }
    });
    return promise;
  }

  async function rateAutomatically(id: string): Promise<void> {
    if (deps.isBusy() || document.hidden || !deps.getItems().some((item) => item.id === id && needsRating(deps.estimates, item))) {
      return;
    }
    const pending = scoreForItem(id);
    const estimate = currentEstimateFor(deps.estimates, id, findItem(id));
    const result = await pending;
    const item = findItem(id);
    if (!estimate || currentEstimateFor(deps.estimates, id, item) !== estimate || !item || deps.isBusy()) return;
    estimate.saveAttempted = true;
    const previousRating = item.difficultyRating;
    const rating = result && makeRating(result, estimate.bpm, previousRating?.startingBpm);
    if (!rating) return;
    try {
      const saved = await libraryUpdateLevels([{ id, previousRating, rating }]);
      if (saved === null || !deps.getItems().includes(item)) {
        await deps.refresh();
        if (saved === null && !deps.getItems().includes(item)) estimate.saveAttempted = false;
      } else {
        item.difficultyRating = rating;
        deps.updateRowRating(id);
      }
    } catch {
      deps.notice('save_failed');
    }
  }

  function queueAutomaticRatings(): void {
    if (deps.isBusy() || ratingWorkerActive || document.hidden) return;
    const next = deps.getItems().find((item) => needsRating(deps.estimates, item));
    if (!next) return;
    ratingWorkerActive = true;
    // Read and analyze one original at a time, yielding between scores so large libraries stay usable.
    window.setTimeout(() => {
      void rateAutomatically(next.id).finally(() => {
        ratingWorkerActive = false;
        queueAutomaticRatings();
      });
    }, 0);
  }

  function saveRating(
    id: string,
    result: ImportedDifficultyEstimate,
    focus: HTMLButtonElement,
    manualBpm?: number,
  ): void {
    const item = findItem(id);
    if (deps.isBusy() || !item) return;
    void deps.run(async () => {
      const previousRating = item.difficultyRating;
      const rating = makeRating(result, manualBpm ?? referenceTempo(item), manualBpm ?? previousRating?.startingBpm);
      if (!rating) return;
      const updated = await libraryUpdateLevels([{ id, previousRating, rating }]);
      await deps.refresh();
      if (deps.getStatusKey() !== 'unavailable') {
        if (updated === null) deps.notice('reclassify_conflict');
        else deps.notice('rating_saved', { count: updated });
      }
    }, 'save_failed').then(() => { if (focus.isConnected) focus.focus(); });
  }

  return {
    scoreForItem,
    queueAutomaticRatings,
    saveRating,
  };
}
