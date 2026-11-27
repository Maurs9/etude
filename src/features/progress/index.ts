import { byId, downloadBlob, maybeById } from '../../domain/dom.js';
import { xmlEsc } from '../../domain/score-types.js';
import * as scoreLibraryStore from '../../domain/score-library-store.js';
import { CATS, ITEMS } from '../../core/trainer-items.js';
import type { LibraryItem } from '../../domain/score-library-types.js';
import type { buildPracticeReport } from '../../domain/progress-report.js';
import type { AppHost, ProgressController, ProgressShell, ShowOptions, TestSurfaceRegistry } from '../../domain/views.js';

/*
 * Progress: statistics, milestones, the studio summary and the practice report (CSV and print). The report's reading and
 * piece facts still come from the shell (shell.collectPracticeReport) until Read moves into its own feature.
 */
export function createProgressFeature(host: AppHost, shell: ProgressShell): ProgressController {
  const t = host.i18n.t;
  const show = host.nav.show;
  const { collectPracticeReport, storeHasProgress, todayN, currentStreak, masteredCount, itemLabel, catLabel, statHTML, rdRenderStats } = shell;
  let mounted = false;
  /* ---------- PROGRESS ---------- */
  let progressView: typeof import('../../domain/progress-view.js') | null = null;
  function standingLabelOf(report: ReturnType<typeof buildPracticeReport>): string {
      const highest = report.milestones.highestId
          ? report.milestones.milestones.find((m) => m.id === report.milestones.highestId)
          : null;
      return highest ? t(highest.labelKey) : t('prog_ms_none');
  }
  function renderPrintSummaryHtml(report: ReturnType<typeof buildPracticeReport>): string {
      const esc = xmlEsc;
      const piecesLine = report.pieces.length
          ? `<p class="prog-print-pieces"><b>${esc(t('prog_rep_pieces'))}:</b> ${report.pieces.map((p) => {
              const marks = [p.learned ? '✓ ' + t('prog_rep_learned') : '', p.bestPct !== null ? t('prog_rep_best', p.bestPct) : ''].filter(Boolean).join(', ');
              return marks ? `${esc(p.title)} (${esc(marks)})` : esc(p.title);
          }).join(' · ')}</p>`
          : '';
      return `<h2>Étude — ${esc(t('prog_rep_title'))}</h2>`
          + `<p class="prog-print-meta">${esc(report.generatedDateIso)} · ${esc(t('prog_ms_standing', standingLabelOf(report)))} · ${esc(t('prog_rep_7d', report.reviews7d, report.activeDays7d))} · ${esc(t('prog_rep_30d', report.reviews30d, report.activeDays30d))}</p>`
          + piecesLine;
  }
  function updatePrintSummaryHead(buildReport: typeof buildPracticeReport, libraryItems: readonly LibraryItem[] = []): { html: string; report: ReturnType<typeof buildPracticeReport> } {
      const report = collectPracticeReport(buildReport, libraryItems);
      const html = renderPrintSummaryHtml(report);
      const head = maybeById('prog-print-head');
      if (head) head.innerHTML = html;
      return { html, report };
  }
  function renderProgress() {
      if (!progressView) return;
      const { html: printSummaryHtml, report } = updatePrintSummaryHead(progressView.buildPracticeReport);
      const log = host.store.data().practiceLog ?? {};
      const melTotal = log.melTotal || 0;
      const singCleared = Object.values(host.store.data().singCleared || {}).filter(Boolean).length;
      progressView.renderProgress({
          data: host.store.data(), hasActivity: storeHasProgress(), items: ITEMS, categories: Object.keys(CATS), today: todayN(), loc: shell.localeTag(),
          t, currentStreak, masteredCount, itemLabel, catLabel, statHTML, rdRenderStats,
          printSummaryHtml,
          milestones: report.milestones,
          studioSummary: {
              techRuns: log.techRuns || 0,
              techClean: log.techClean || 0,
              techBestBpm: log.techBestBpm || 0,
              melRuns: log.melRuns || 0,
              melAcc: melTotal > 0 ? Math.round(100 * (log.melCorrect || 0) / melTotal) : null,
              singCleared,
              singTotal: 7, // pinned to SS_LEVELS.length in tests/unit/voice-feature.test.mjs
          },
          openStudio(kind) {
              if (kind === 'sing') {
                  show('sing');
                  return;
              }
              const opts: ShowOptions = kind === 'tech' ? { practiceTopic: 'scale', practiceMode: 'tech' } : { practiceTopic: 'melody' };
              void Promise.resolve(show('practice', opts)).then(() => byId('pr-start').focus());
          },
          openDrill(category) {
              void Promise.resolve(show('practice', { practiceTopic: category })).then(() => byId('pr-start').focus());
          },
      });
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
      // progress
      byId('prog-report-csv').addEventListener('click', () => {
          void (async () => {
              const reportModule = progressView;
              if (!reportModule) return;
              const libraryItems = await scoreLibraryStore.libraryList().catch(() => []);
              const report = collectPracticeReport(reportModule.buildPracticeReport, libraryItems);
              const csv = reportModule.formatPracticeReportCsv(report, {
                  title: t('prog_rep_title'),
                  secSummary: t('prog_rep_sec_summary'),
                  secTopics: t('prog_rep_sec_topics'),
                  secWeak: t('prog_rep_sec_weak'),
                  secReading: t('prog_rep_sec_reading'),
                  secPieces: t('prog_rep_sec_pieces'),
                  period7d: t('prog_rep_period', 7),
                  period30d: t('prog_rep_period', 30),
                  dateLabel: t('prog_rep_date'),
                  streakLabel: t('st_streak'),
                  bestStreakLabel: t('st_best'),
                  masteredLabel: t('st_mastered'),
                  reviewsLabel: t('st_reviews'),
                  accuracyLabel: t('st_acc'),
                  categoryCol: t('cat_col'),
                  conceptCol: t('prog_rep_concept'),
                  repsCol: t('prog_rep_reps'),
                  masteryCol: t('mastery_head'),
                  readingLevelCol: t('rd_level'),
                  readingBookCol: t('prog_rep_book'),
                  readingPiecesCol: t('rdn_stat_read'),
                  readingDrillsCol: t('rdx_st_ans'),
                  readingStarsCol: t('rdx_hero_stars'),
                  pieceCol: t('nav_scores'),
                  sourceCol: t('prog_rep_source'),
                  sourceBuiltin: t('prog_rep_builtin'),
                  sourceLibrary: t('prog_rep_library'),
                  learnedCol: t('prog_rep_learned'),
                  bestCol: t('prog_rep_best_col'),
                  yes: t('yes_word'),
                  no: t('no_word'),
                  standingLabel: t('prog_ms_head'),
                  standingValue: standingLabelOf(report),
              });
              downloadBlob(`etude-practice-report-${report.generatedDateIso}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          })();
      });
      byId('prog-report-print').addEventListener('click', () => {
          void (async () => {
              const reportModule = progressView;
              if (!reportModule) return;
              const libraryItems = await scoreLibraryStore.libraryList().catch(() => []);
              updatePrintSummaryHead(reportModule.buildPracticeReport, libraryItems);
              if (typeof window.print === 'function')
                  window.print();
          })();
      });
      byId('prog-export').addEventListener('click', () => byId('exportBtn').click());
      byId('prog-import').addEventListener('click', () => byId('importBtn').click());
      byId('prog-start').addEventListener('click', () => { show('today'); shell.startReview(); });
  }

  // The view module loads on the first visit and is kept; the signal drops a render for a view left meanwhile.
  async function enter(_params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): Promise<void> {
    try {
      await shell.prepareReport();
    }
    catch {
      if (!signal.aborted) host.overlays.showLoadError(async () => { await show('progress'); });
      return;
    }
    if (signal.aborted) return;
    if (!progressView) {
      let module: typeof import('../../domain/progress-view.js');
      try {
        module = await import('../../domain/progress-view.js');
      }
      catch {
        if (!signal.aborted) {
          host.overlays.showLoadError(async () => { await show('progress'); });
          const toast = document.getElementById('locale-load-error');
          if (toast) toast.dataset.lazyOwner = 'progress';
        }
        return;
      }
      if (signal.aborted) return;
      progressView = module;
      document.querySelector('#locale-load-error[data-lazy-owner="progress"]')?.remove();
    }
    renderProgress();
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      renderProgress: { get: () => renderProgress },
      progressView: { get: () => progressView },
    });
  }

  return {
    mount,
    enter,
    leave: () => {},
    onStorageSync: () => { if (host.nav.activeView() === 'progress') renderProgress(); },
    registerTestSurface,
    render: renderProgress,
  };
}
