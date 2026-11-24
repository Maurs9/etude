import { byId } from './dom.js';
import type { StoredSrsEntry } from './storage.js';

interface ProgressItem {
    id: string;
    cat: string;
    short: string;
}

interface ProgressOptions<Item extends ProgressItem> {
    data: {
        totalReviews: number;
        totalCorrect: number;
        bestStreak: number;
        srs: Readonly<Record<string, StoredSrsEntry>>;
        history: Readonly<Record<string, number>>;
    };
    hasActivity?: boolean;
    items: readonly Item[];
    categories: readonly string[];
    today: number;
    loc: string;
    t: (key: string, ...values: Array<string | number>) => string;
    currentStreak: () => number;
    masteredCount: () => number;
    catLabel: (category: string) => string;
    itemLabel: (item: Item) => string;
    statHTML: (value: number | string, label: string) => string;
    openDrill: (category: Item['cat']) => void;
    rdRenderStats: () => void;
    printSummaryHtml?: string;
}

export function renderProgress<Item extends ProgressItem>(options: ProgressOptions<Item>) {
    const { data, items: allItems, categories, loc, t, currentStreak, masteredCount, itemLabel, catLabel, statHTML, openDrill, rdRenderStats, printSummaryHtml } = options;
    const tn = options.today;
    const acc = data.totalReviews ? Math.round(100 * data.totalCorrect / data.totalReviews) : 0;
    const printHead = document.getElementById('prog-print-head');
    if (printHead && printSummaryHtml !== undefined)
        printHead.innerHTML = printSummaryHtml;
    byId('prog-empty').hidden = options.hasActivity ?? ((data.totalReviews || 0) > 0);
    byId('progStats').innerHTML =
        statHTML(currentStreak(), t('st_streak')) + statHTML(data.bestStreak || 0, t('st_best')) +
            statHTML(masteredCount() + ' / ' + allItems.length, t('st_mastered')) +
            statHTML(data.totalReviews || 0, t('st_reviews')) + statHTML(acc + '%', t('st_acc'));
    const boxOf = (id: string) => data.srs[id]?.box ?? 0;
    // mastery rows + answer accuracy per topic (from each concept's review history)
    const mr = byId('masteryRows');
    mr.innerHTML = '';
    categories.forEach((cat) => {
        const items = allItems.filter((it) => it.cat === cat);
        const score = items.reduce((s, it) => s + Math.min(boxOf(it.id), 6), 0);
        const max = items.length * 6;
        const pct = Math.round(100 * score / max);
        const mastered = items.filter((it) => boxOf(it.id) >= 4).length;
        let reps = 0, lapses = 0;
        items.forEach((it) => { const r = data.srs[it.id]; if (r) {
            reps += r.reps || 0;
            lapses += r.lapses || 0;
        } });
        const accLine = reps ? t('cat_acc_line', Math.round(100 * Math.max(0, reps - lapses) / reps), reps) : t('cat_acc_none');
        const row = (document).createElement('div');
        row.className = 'mrow';
        row.innerHTML = '<div class="top"><b>' + catLabel(cat) + '</b><span>' + mastered + '/' + items.length + ' ' + t('mastered_of') + '</span></div><div class="mbar" role="img" aria-label="' + catLabel(cat) + ': ' + pct + '%"><i style="width:' + pct + '%"></i></div><div class="acc">' + accLine + '</div>';
        mr.appendChild(row);
    });
    // weakest concepts → one click to drill that topic
    const weak = allItems.map((it) => ({ it, r: data.srs[it.id] })).filter((x) => x.r && x.r.reps >= 2 && x.r.lapses > 0).sort((a, b) => (b.r.lapses / b.r.reps) - (a.r.lapses / a.r.reps) || a.r.box - b.r.box).slice(0, 6);
    byId('weak-wrap').hidden = !weak.length;
    const wl = byId('weakList');
    wl.innerHTML = '';
    weak.forEach(({ it, r }) => { const b = (document).createElement('button'); b.type = 'button'; b.innerHTML = itemLabel(it) + '<small>' + catLabel(it.cat) + ' · ' + t('weak_acc', Math.round(100 * Math.max(0, r.reps - r.lapses) / r.reps), r.reps) + '</small>'; b.addEventListener('click', () => openDrill(it.cat)); wl.appendChild(b); });
    // forecast next 7 days
    const fc = byId('forecast');
    fc.innerHTML = '';
    const counts = [0, 0, 0, 0, 0, 0, 0];
    allItems.forEach((it) => { const s = data.srs[it.id]; if (s && s.reps > 0) {
        const d = Math.max(0, s.due - tn);
        if (d < 7)
            counts[d]++;
    } });
    const maxc = Math.max(1, ...counts);
    const names = counts.map((_, i) => i === 0 ? t('fc_today') : new Date((tn + i) * 86400000).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }));
    counts.forEach((c, i) => { const day = (document).createElement('div'); day.className = 'day'; day.innerHTML = '<i style="height:' + (c / maxc * 60 + 3) + 'px" title="' + c + '"></i><span>' + names[i] + '</span><span class="num" style="color:var(--ink)">' + c + '</span>'; fc.appendChild(day); });
    const fcAny = counts.some((c) => c > 0);
    fc.hidden = !fcAny;
    byId('fc-none').hidden = fcAny;
    // practice heatmap — last 12 weeks
    const hm = byId('heatmap');
    if (hm) {
        hm.innerHTML = '';
        const h: Record<number, number> = data.history || {};
        const days = 84, start = tn - days + 1;
        let active = 0, sum = 0;
        const pad = new Date(start * 86400000).getUTCDay(); // day numbers are UTC-based
        for (let i = 0; i < pad; i++) {
            const x = (document).createElement('i');
            x.style.visibility = 'hidden';
            hm.appendChild(x);
        }
        for (let d = start; d <= tn; d++) {
            const c = h[d] || 0;
            const x = (document).createElement('i');
            if (c) {
                active++;
                sum += c;
            }
            x.dataset.l = String(c === 0 ? 0 : c < 5 ? 1 : c < 12 ? 2 : c < 20 ? 3 : 4);
            x.title = new Date(d * 86400000).toLocaleDateString(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' · ' + c + ' ' + t('reviews_word');
            hm.appendChild(x);
        }
        const meta = t('heat_meta', active, sum);
        hm.setAttribute('aria-label', t('heat_aria') + ' — ' + meta);
        const sw = ['var(--line)', '#d8c79a', 'var(--gold)', '#7fae8b', 'var(--good)'].map((c) => '<i style="background:' + c + '"></i>').join('');
        byId('heat-meta').innerHTML = '<span>' + meta + '</span><span class="hm-key" aria-hidden="true">' + t('heat_less') + ' ' + sw + ' ' + t('heat_more') + '</span>';
    }
    // every concept, grouped by topic
    const g = byId('itemGrid');
    g.innerHTML = '';
    categories.forEach((cat) => {
        const sec = (document).createElement('div');
        sec.className = 'ig-cat';
        sec.innerHTML = '<h3>' + catLabel(cat) + '</h3>';
        const grid = (document).createElement('div');
        grid.className = 'grid-items';
        allItems.filter((it) => it.cat === cat).forEach((it) => {
            const b = boxOf(it.id);
            const c = (document).createElement('div');
            c.className = 'cell';
            c.dataset.b = String(b);
            const lbl = itemLabel(it);
            const st = !data.srs[it.id]?.reps ? t('grid_new') : (t('grid_box') + ' ' + b);
            c.title = lbl + ' — ' + st;
            c.setAttribute('role', 'img');
            c.setAttribute('aria-label', lbl + ' — ' + st);
            c.textContent = (it.cat === 'interval' || it.cat === 'chord') ? it.short : lbl.replace(/\s*\(.*\)\s*/, '');
            grid.appendChild(c);
        });
        sec.appendChild(grid);
        g.appendChild(sec);
    });
    // Reading: the reading drills' statistics, with their own Reset button.
    rdRenderStats();
}
