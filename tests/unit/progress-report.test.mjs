import { describe, expect, it } from 'vitest';
import {
  buildPracticeReport,
  computeStudioMilestones,
  csvSafeCell,
  formatPracticeReportCsv,
} from '../../src/domain/progress-report.ts';

const LABELS = {
  title: 'Practice report',
  secSummary: 'Summary',
  secTopics: 'Topics',
  secWeak: 'Needs work',
  secReading: 'Reading',
  secPieces: 'Pieces',
  period7d: 'Last %s days',
  period30d: 'Last %s days',
  dateLabel: 'Date',
  streakLabel: 'Streak',
  bestStreakLabel: 'Best streak',
  masteredLabel: 'Mastered',
  reviewsLabel: 'Total reviews',
  accuracyLabel: 'Accuracy',
  categoryCol: 'Topic',
  conceptCol: 'Concept',
  repsCol: 'Reviews',
  masteryCol: 'Mastery by topic',
  readingLevelCol: 'Level',
  readingBookCol: 'Book pieces',
  readingPiecesCol: 'Pieces read',
  readingDrillsCol: 'Answers',
  readingStarsCol: 'Stars',
  pieceCol: 'Pieces',
  sourceCol: 'Source',
  sourceBuiltin: 'Built-in repertoire',
  sourceLibrary: 'My Library',
  learnedCol: 'Learned',
  bestCol: 'Best accuracy',
  yes: 'Yes',
  no: 'No',
};

describe('practice report domain helpers', () => {
  it('summarizes 7-day and 30-day practice windows, weak spots, reading, and practiced pieces', () => {
    const today = 20000;
    const report = buildPracticeReport({
      today,
      totalReviews: 40,
      totalCorrect: 32,
      streak: 4,
      bestStreak: 9,
      mastered: 2,
      totalItems: 3,
      srs: {
        'iv:4': { box: 5, reps: 10, lapses: 1, due: today + 4 },
        'iv:3': { box: 2, reps: 5, lapses: 2, due: today },
        'ch:maj': { box: 4, reps: 6, lapses: 0, due: today + 2 },
      },
      history: {
        '20000': 5,
        '19995': 3,
        '19975': 10,
        '19960': 22,
      },
      items: [
        { id: 'iv:4', cat: 'interval' },
        { id: 'iv:3', cat: 'interval' },
        { id: 'ch:maj', cat: 'chord' },
      ],
      categories: ['interval', 'chord'],
      catLabel: (c) => (c === 'interval' ? 'Intervals' : 'Chords'),
      itemLabel: (it) => (it.id === 'iv:3' ? 'Minor 3rd' : it.id === 'iv:4' ? 'Major 3rd' : 'Major triad'),
      reading: {
        bookLevel: 3,
        bookDone: 4,
        bookTotal: 16,
        piecesRead: 12,
        drillAnswers: 25,
        drillCorrect: 20,
        stars: 18,
      },
      pieces: [
        { title: 'Ode to Joy', source: 'builtin', learned: true, bestPct: 96 },
        { title: 'Unplayed Piece', source: 'builtin', learned: false, bestPct: null },
        { title: 'My Nocturne', source: 'library', learned: false, bestPct: 88 },
      ],
    });

    expect(report.generatedDateIso).toBe('2024-10-04');
    expect(report.accuracyPct).toBe(80);
    expect(report.reviews7d).toBe(8);
    expect(report.activeDays7d).toBe(2);
    expect(report.reviews30d).toBe(18);
    expect(report.activeDays30d).toBe(3);
    expect(report.weakSpots.map((w) => w.id)).toEqual(['iv:3', 'iv:4']);
    expect(report.reading.drillAccuracyPct).toBe(80);
    expect(report.pieces).toHaveLength(2);
    expect(report.pieces.map((p) => p.title)).toEqual(['Ode to Joy', 'My Nocturne']);
  });

  it('neutralizes spreadsheet formula injection and applies RFC 4180 CSV quoting', () => {
    expect(csvSafeCell('=CMD()')).toBe("'=CMD()");
    expect(csvSafeCell('+1+2')).toBe("'+1+2");
    expect(csvSafeCell('-1+2')).toBe("'-1+2");
    expect(csvSafeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvSafeCell('\ttab')).toBe("'\ttab");
    expect(csvSafeCell(-3)).toBe('-3');
    expect(csvSafeCell('-12.5')).toBe('-12.5');
    expect(csvSafeCell('85%')).toBe('85%');
    expect(csvSafeCell('Ode, Op. "1"')).toBe('"Ode, Op. ""1"""');
  });

  it('formats a UTF-8 BOM CSV with escaped untrusted titles', () => {
    const report = buildPracticeReport({
      today: 20000,
      totalReviews: 1,
      totalCorrect: 1,
      streak: 1,
      bestStreak: 1,
      mastered: 0,
      totalItems: 1,
      srs: {},
      history: { '20000': 1 },
      items: [{ id: 'iv:4', cat: 'interval' }],
      categories: ['interval'],
      catLabel: () => 'Intervals',
      itemLabel: () => 'Major 3rd',
      reading: { bookLevel: 1, bookDone: 0, bookTotal: 16, piecesRead: 0, drillAnswers: 0, drillCorrect: 0, stars: 0 },
      pieces: [{ title: '=HYPERLINK("http://evil")', source: 'library', learned: false, bestPct: 91 }],
    });

    const csv = formatPracticeReportCsv(report, {
      ...LABELS,
      period7d: 'Last 7 days',
      period30d: 'Last 30 days',
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).not.toContain('\r\n');
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")",My Library,No,91%');
    expect(csv).toContain('Summary');
    expect(csv).toContain('Topics');
    expect(csv).toContain('Pieces');
  });

  it('computes sequential Studio & ABRSM Prep and Grade 1-5 milestones without skipping unmet levels', () => {
    const empty = computeStudioMilestones({ mastered: 0, bookLevel: 1, piecesRead: 0, learnedPieces: 0, lessonsDone: 0 });
    expect(empty.highestId).toBeNull();
    expect(empty.nextId).toBe('prep');
    expect(empty.completedCount).toBe(0);
    expect(empty.milestones).toHaveLength(6);
    expect(empty.milestones[0]?.next).toBe(true);

    // Grade 2 metrics without Grade 1 bookLevel (bookLevel: 1) stops monotonically after Prep.
    const gated = computeStudioMilestones({ mastered: 25, bookLevel: 1, piecesRead: 12, learnedPieces: 3, lessonsDone: 10 });
    expect(gated.highestId).toBe('prep');
    expect(gated.nextId).toBe('g1');
    expect(gated.completedCount).toBe(1);
    expect(gated.milestones.find((m) => m.id === 'g1')?.next).toBe(true);
    expect(gated.milestones.find((m) => m.id === 'g2')?.done).toBe(false);

    const g3 = computeStudioMilestones({ mastered: 28, bookLevel: 3, piecesRead: 20, learnedPieces: 4, lessonsDone: 12 });
    expect(g3.highestId).toBe('g3');
    expect(g3.nextId).toBe('g4');
    expect(g3.completedCount).toBe(4);

    const g5 = computeStudioMilestones({ mastered: 50, bookLevel: 5, piecesRead: 42, learnedPieces: 9, lessonsDone: 22 });
    expect(g5.highestId).toBe('g5');
    expect(g5.nextId).toBeNull();
    expect(g5.completedCount).toBe(6);
    expect(g5.milestones.every((m) => m.done && !m.next)).toBe(true);
  });

  it('includes Standing row in CSV when standingLabel and standingValue are provided', () => {
    const report = buildPracticeReport({
      today: 20000,
      totalReviews: 12,
      totalCorrect: 10,
      streak: 3,
      bestStreak: 5,
      mastered: 12,
      totalItems: 60,
      srs: {},
      history: { '20000': 5 },
      items: [{ id: 'iv:4', cat: 'interval' }],
      categories: ['interval'],
      catLabel: () => 'Intervals',
      itemLabel: () => 'Major 3rd',
      reading: { bookLevel: 2, bookDone: 5, bookTotal: 16, piecesRead: 6, drillAnswers: 10, drillCorrect: 9, stars: 6 },
      pieces: [],
      lessonsDone: 5,
    });
    expect(report.milestones.highestId).toBe('g1');

    const csv = formatPracticeReportCsv(report, {
      ...LABELS,
      period7d: 'Last 7 days',
      period30d: 'Last 30 days',
      standingLabel: 'Studio & ABRSM milestones',
      standingValue: 'Grade 1',
    });
    expect(csv).toContain('Studio & ABRSM milestones,Grade 1');
  });
});
