import type { StoredSrsEntry } from './storage.js';

export interface PracticeReportTopicInput {
  readonly id: string;
  readonly cat: string;
}

export interface PracticeReportPieceInput {
  readonly title: string;
  readonly source: 'builtin' | 'library';
  readonly learned: boolean;
  readonly bestPct: number | null;
}

export interface PracticeReportReadingInput {
  readonly bookLevel: number;
  readonly bookDone: number;
  readonly bookTotal: number;
  readonly piecesRead: number;
  readonly drillAnswers: number;
  readonly drillCorrect: number;
  readonly stars: number;
}

export interface PracticeReportInput {
  readonly today: number;
  readonly totalReviews: number;
  readonly totalCorrect: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly mastered: number;
  readonly totalItems: number;
  readonly srs: Readonly<Record<string, StoredSrsEntry>>;
  readonly history: Readonly<Record<string, number>>;
  readonly items: readonly PracticeReportTopicInput[];
  readonly categories: readonly string[];
  readonly catLabel: (category: string) => string;
  readonly itemLabel: (item: PracticeReportTopicInput) => string;
  readonly reading: PracticeReportReadingInput;
  readonly pieces: readonly PracticeReportPieceInput[];
  readonly lessonsDone?: number;
}

export type StudioMilestoneId = 'prep' | 'g1' | 'g2' | 'g3' | 'g4' | 'g5';

export interface StudioMilestoneInput {
  readonly mastered: number;
  readonly bookLevel: number;
  readonly piecesRead: number;
  readonly learnedPieces: number;
  readonly lessonsDone: number;
}

export interface StudioMilestone {
  readonly id: StudioMilestoneId;
  readonly labelKey: string;
  readonly reqKey: string;
  readonly done: boolean;
  readonly next: boolean;
}

export interface StudioMilestoneSummary {
  readonly highestId: StudioMilestoneId | null;
  readonly nextId: StudioMilestoneId | null;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly milestones: readonly StudioMilestone[];
}

export interface PracticeReportTopic {
  readonly category: string;
  readonly label: string;
  readonly mastered: number;
  readonly total: number;
  readonly masteryPct: number;
  readonly accuracyPct: number | null;
  readonly reps: number;
}

export interface PracticeReportWeak {
  readonly id: string;
  readonly category: string;
  readonly label: string;
  readonly categoryLabel: string;
  readonly accuracyPct: number;
  readonly reps: number;
  readonly box: number;
}

export interface PracticeReportReading {
  readonly bookLevel: number;
  readonly bookDone: number;
  readonly bookTotal: number;
  readonly piecesRead: number;
  readonly drillAnswers: number;
  readonly drillAccuracyPct: number | null;
  readonly stars: number;
}

export type PracticeReportPiece = PracticeReportPieceInput;

export interface PracticeReport {
  readonly generatedDateIso: string;
  readonly streak: number;
  readonly bestStreak: number;
  readonly mastered: number;
  readonly totalItems: number;
  readonly totalReviews: number;
  readonly accuracyPct: number | null;
  readonly reviews7d: number;
  readonly activeDays7d: number;
  readonly reviews30d: number;
  readonly activeDays30d: number;
  readonly topics: readonly PracticeReportTopic[];
  readonly weakSpots: readonly PracticeReportWeak[];
  readonly reading: PracticeReportReading;
  readonly pieces: readonly PracticeReportPiece[];
  readonly milestones: StudioMilestoneSummary;
}

export interface PracticeReportCsvLabels {
  readonly title: string;
  readonly secSummary: string;
  readonly secTopics: string;
  readonly secWeak: string;
  readonly secReading: string;
  readonly secPieces: string;
  readonly period7d: string;
  readonly period30d: string;
  readonly dateLabel: string;
  readonly streakLabel: string;
  readonly bestStreakLabel: string;
  readonly masteredLabel: string;
  readonly reviewsLabel: string;
  readonly accuracyLabel: string;
  readonly standingLabel?: string;
  readonly standingValue?: string;
  readonly categoryCol: string;
  readonly conceptCol: string;
  readonly repsCol: string;
  readonly masteryCol: string;
  readonly readingLevelCol: string;
  readonly readingBookCol: string;
  readonly readingPiecesCol: string;
  readonly readingDrillsCol: string;
  readonly readingStarsCol: string;
  readonly pieceCol: string;
  readonly sourceCol: string;
  readonly sourceBuiltin: string;
  readonly sourceLibrary: string;
  readonly learnedCol: string;
  readonly bestCol: string;
  readonly yes: string;
  readonly no: string;
}

function windowActivity(history: Readonly<Record<string, number>>, today: number, days: number): { reviews: number; activeDays: number } {
  let reviews = 0;
  let activeDays = 0;
  const start = today - days + 1;
  for (let day = start; day <= today; day += 1) {
    const count = Number(history[String(day)] ?? 0);
    if (count > 0) {
      reviews += count;
      activeDays += 1;
    }
  }
  return { reviews, activeDays };
}

const STUDIO_MILESTONE_DEFS: readonly {
  readonly id: StudioMilestoneId;
  readonly labelKey: string;
  readonly reqKey: string;
  readonly met: (input: StudioMilestoneInput) => boolean;
}[] = [
  {
    id: 'prep',
    labelKey: 'prog_ms_prep',
    reqKey: 'prog_ms_prep_req',
    met: (input) => input.mastered >= 4 && input.piecesRead >= 2 && input.lessonsDone >= 1,
  },
  {
    id: 'g1',
    labelKey: 'prog_ms_g1',
    reqKey: 'prog_ms_g1_req',
    met: (input) => input.mastered >= 10 && input.bookLevel >= 2 && input.piecesRead >= 5 && input.lessonsDone >= 4,
  },
  {
    id: 'g2',
    labelKey: 'prog_ms_g2',
    reqKey: 'prog_ms_g2_req',
    met: (input) => input.mastered >= 18 && input.bookLevel >= 2 && input.piecesRead >= 10 && input.learnedPieces >= 2 && input.lessonsDone >= 8,
  },
  {
    id: 'g3',
    labelKey: 'prog_ms_g3',
    reqKey: 'prog_ms_g3_req',
    met: (input) => input.mastered >= 26 && input.bookLevel >= 3 && input.piecesRead >= 18 && input.learnedPieces >= 4 && input.lessonsDone >= 12,
  },
  {
    id: 'g4',
    labelKey: 'prog_ms_g4',
    reqKey: 'prog_ms_g4_req',
    met: (input) => input.mastered >= 36 && input.bookLevel >= 4 && input.piecesRead >= 28 && input.learnedPieces >= 6 && input.lessonsDone >= 16,
  },
  {
    id: 'g5',
    labelKey: 'prog_ms_g5',
    reqKey: 'prog_ms_g5_req',
    met: (input) => input.mastered >= 46 && input.bookLevel >= 5 && input.piecesRead >= 40 && input.learnedPieces >= 8 && input.lessonsDone >= 20,
  },
];

/** Evaluates sequential Studio / ABRSM Prep and Grade 1–5 standing from persisted mastery, reading, repertoire, and lesson progress. */
export function computeStudioMilestones(input: StudioMilestoneInput): StudioMilestoneSummary {
  let prevDone = true;
  let highestId: StudioMilestoneId | null = null;
  let nextId: StudioMilestoneId | null = null;
  let completedCount = 0;

  const doneStates = STUDIO_MILESTONE_DEFS.map((def) => {
    const done = prevDone && def.met(input);
    prevDone = done;
    if (done) {
      highestId = def.id;
      completedCount += 1;
    } else if (nextId === null) {
      nextId = def.id;
    }
    return done;
  });

  const milestones: StudioMilestone[] = STUDIO_MILESTONE_DEFS.map((def, index) => ({
    id: def.id,
    labelKey: def.labelKey,
    reqKey: def.reqKey,
    done: doneStates[index],
    next: def.id === nextId,
  }));

  return {
    highestId,
    nextId,
    completedCount,
    totalCount: STUDIO_MILESTONE_DEFS.length,
    milestones,
  };
}

/** Pure client-side summary of reviews, weak concepts, reading progress, and repertoire for teacher/student reports. */
export function buildPracticeReport(input: PracticeReportInput): PracticeReport {
  const generatedDateIso = new Date(input.today * 86400000).toISOString().slice(0, 10);
  const accuracyPct = input.totalReviews > 0 ? Math.round((100 * input.totalCorrect) / input.totalReviews) : null;
  const w7 = windowActivity(input.history, input.today, 7);
  const w30 = windowActivity(input.history, input.today, 30);

  const topics: PracticeReportTopic[] = input.categories.map((category) => {
    const group = input.items.filter((it) => it.cat === category);
    const boxScore = group.reduce((sum, it) => sum + Math.min(input.srs[it.id]?.box ?? 0, 6), 0);
    const maxScore = group.length * 6;
    const masteryPct = maxScore > 0 ? Math.round((100 * boxScore) / maxScore) : 0;
    const mastered = group.filter((it) => (input.srs[it.id]?.box ?? 0) >= 4).length;
    let reps = 0;
    let lapses = 0;
    for (const item of group) {
      const entry = input.srs[item.id];
      if (entry) {
        reps += entry.reps || 0;
        lapses += entry.lapses || 0;
      }
    }
    const topicAcc = reps > 0 ? Math.round((100 * Math.max(0, reps - lapses)) / reps) : null;
    return {
      category,
      label: input.catLabel(category),
      mastered,
      total: group.length,
      masteryPct,
      accuracyPct: topicAcc,
      reps,
    };
  });

  const weakSpots: PracticeReportWeak[] = input.items
    .map((item) => ({ item, entry: input.srs[item.id] }))
    .filter((pair): pair is { item: PracticeReportTopicInput; entry: StoredSrsEntry } =>
      !!pair.entry && pair.entry.reps >= 2 && pair.entry.lapses > 0,
    )
    .sort((a, b) => (b.entry.lapses / b.entry.reps) - (a.entry.lapses / a.entry.reps) || a.entry.box - b.entry.box)
    .slice(0, 6)
    .map(({ item, entry }) => ({
      id: item.id,
      category: item.cat,
      label: input.itemLabel(item),
      categoryLabel: input.catLabel(item.cat),
      accuracyPct: Math.round((100 * Math.max(0, entry.reps - entry.lapses)) / entry.reps),
      reps: entry.reps,
      box: entry.box,
    }));

  const drillAccuracyPct = input.reading.drillAnswers > 0
    ? Math.round((100 * input.reading.drillCorrect) / input.reading.drillAnswers)
    : null;

  const pieces = input.pieces.filter((piece) => piece.learned || piece.bestPct !== null);
  const learnedPieces = input.pieces.filter((piece) => piece.learned).length;
  const milestones = computeStudioMilestones({
    mastered: input.mastered,
    bookLevel: input.reading.bookLevel,
    piecesRead: input.reading.piecesRead,
    learnedPieces,
    lessonsDone: input.lessonsDone ?? 0,
  });

  return {
    generatedDateIso,
    streak: input.streak,
    bestStreak: input.bestStreak,
    mastered: input.mastered,
    totalItems: input.totalItems,
    totalReviews: input.totalReviews,
    accuracyPct,
    reviews7d: w7.reviews,
    activeDays7d: w7.activeDays,
    reviews30d: w30.reviews,
    activeDays30d: w30.activeDays,
    topics,
    weakSpots,
    reading: {
      bookLevel: input.reading.bookLevel,
      bookDone: input.reading.bookDone,
      bookTotal: input.reading.bookTotal,
      piecesRead: input.reading.piecesRead,
      drillAnswers: input.reading.drillAnswers,
      drillAccuracyPct,
      stars: input.reading.stars,
    },
    pieces,
    milestones,
  };
}

/** Neutralizes spreadsheet formula injection on untrusted text and applies RFC 4180 CSV quoting. */
export function csvSafeCell(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const raw = String(value);
  const trimmedNumeric = /^-?\d+(\.\d+)?$/.test(raw);
  const startsFormula = raw !== '-' && (
    /^[\s]*[=+@]/.test(raw) ||
    raw.startsWith('\t') ||
    raw.startsWith('\r') ||
    (raw.startsWith('-') && !trimmedNumeric)
  );
  const safe = startsFormula ? `'${raw}` : raw;
  return /[,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvRow(cells: readonly (string | number | boolean)[]): string {
  return cells.map(csvSafeCell).join(',');
}

/** Formats a UTF-8 BOM + LF CSV report suitable for teachers, studios, and self-review. */
export function formatPracticeReportCsv(report: PracticeReport, labels: PracticeReportCsvLabels): string {
  const pct = (value: number | null) => (value === null ? '—' : `${value}%`);
  const rows: string[] = [
    csvRow([labels.title, report.generatedDateIso]),
    '',
    csvRow([labels.secSummary]),
    csvRow([labels.dateLabel, report.generatedDateIso]),
    csvRow([labels.streakLabel, report.streak]),
    csvRow([labels.bestStreakLabel, report.bestStreak]),
    csvRow([labels.masteredLabel, `${report.mastered}/${report.totalItems}`]),
    csvRow([labels.reviewsLabel, report.totalReviews]),
    csvRow([labels.accuracyLabel, pct(report.accuracyPct)]),
    ...(labels.standingLabel && labels.standingValue ? [csvRow([labels.standingLabel, labels.standingValue])] : []),
    csvRow([labels.period7d, report.reviews7d, report.activeDays7d]),
    csvRow([labels.period30d, report.reviews30d, report.activeDays30d]),
    '',
    csvRow([labels.secTopics]),
    csvRow([labels.categoryCol, labels.masteredLabel, labels.masteryCol, labels.accuracyLabel, labels.repsCol]),
    ...report.topics.map((topic) =>
      csvRow([topic.label, `${topic.mastered}/${topic.total}`, `${topic.masteryPct}%`, pct(topic.accuracyPct), topic.reps]),
    ),
    '',
    csvRow([labels.secWeak]),
    csvRow([labels.conceptCol, labels.categoryCol, labels.accuracyLabel, labels.repsCol]),
    ...report.weakSpots.map((spot) =>
      csvRow([spot.label, spot.categoryLabel, `${spot.accuracyPct}%`, spot.reps]),
    ),
    '',
    csvRow([labels.secReading]),
    csvRow([
      labels.readingLevelCol,
      labels.readingBookCol,
      labels.readingPiecesCol,
      labels.readingDrillsCol,
      labels.accuracyLabel,
      labels.readingStarsCol,
    ]),
    csvRow([
      report.reading.bookLevel,
      `${report.reading.bookDone}/${report.reading.bookTotal}`,
      report.reading.piecesRead,
      report.reading.drillAnswers,
      pct(report.reading.drillAccuracyPct),
      report.reading.stars,
    ]),
    '',
    csvRow([labels.secPieces]),
    csvRow([labels.pieceCol, labels.sourceCol, labels.learnedCol, labels.bestCol]),
    ...report.pieces.map((piece) =>
      csvRow([
        piece.title,
        piece.source === 'builtin' ? labels.sourceBuiltin : labels.sourceLibrary,
        piece.learned ? labels.yes : labels.no,
        pct(piece.bestPct),
      ]),
    ),
  ];
  return '\uFEFF' + rows.join('\n') + '\n';
}
