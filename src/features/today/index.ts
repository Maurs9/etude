import { byId, buttonById } from '../../domain/dom.js';
import * as router from '../../domain/router.js';
import { ITEMS } from '../../core/trainer-items.js';
import type { AppHost, DailyPlanTask, TestSurfaceRegistry, TodayController, TodayShell } from '../../domain/views.js';

const { navGroup, isMovedView, isMergedView, MERGED_VIEWS } = router;

/*
 * Today: the greeting, streak and goal, the review counts and the daily plan. The session it starts belongs to Practice
 * (shell.startReview and shell.earCheck load it on demand).
 */
export function createTodayFeature(host: AppHost, shell: TodayShell): TodayController {
  const t = host.i18n.t;
  const show = host.nav.show;
  const todayN = shell.todayN;
  const { currentStreak, dueItems, newItemsAvail, newQuotaLeft, masteredCount, isNew, itemLabel, catLabel, learnPlanItems } = shell;
  /* ---------- TODAY ---------- */
  function greeting() { const h = new Date().getHours(); return h < 5 ? t('g_late') : h < 12 ? t('g_morning') : h < 18 ? t('g_afternoon') : t('g_evening'); }
  function refreshToday() {
      const gr = greeting();
      byId('greet-title').textContent = /[.?!…]$/.test(gr) ? gr : gr + '.';
      const tn = todayN();
      byId('streakN').textContent = String(currentStreak());
      const goal = host.store.data().settings.goal, done = Math.min(host.store.data().todayDay === tn ? host.store.data().todayCount : 0, goal);
      const gd = byId('goaldots');
      gd.innerHTML = '';
      const dots = 5;
      for (let i = 0; i < dots; i++) {
          const x = (document).createElement('i');
          if (i < Math.round(dots * done / goal))
              x.className = 'on';
          gd.appendChild(x);
      }
      gd.setAttribute('aria-label', t('goal_aria', done, goal));
      byId('goal-txt').textContent = t('goal_txt', done, goal);
      const due = dueItems().length, fresh = Math.min(newItemsAvail().length, newQuotaLeft());
      byId('c-due').textContent = String(due);
      byId('c-new').textContent = String(fresh);
      byId('c-mastered').textContent = String(masteredCount());
      byId('placeBtn').hidden = host.store.data().placed || (host.store.data().totalReviews > 0 && Object.keys(host.store.data().srs).length > 0);
      const next = dueItems()[0] || (fresh ? newItemsAvail()[0] : null);
      byId('nextup').innerHTML = next ? (t('nextup') + ' <b>' + itemLabel(next) + '</b> · ' + catLabel(next.cat).toLowerCase()) : t('nextup_none');
      const caughtUp = due === 0 && fresh === 0;
      buttonById('startBtn').disabled = caughtUp && !ITEMS.some(it => !isNew(it.id));
      byId('startBtn').textContent = caughtUp ? t('start_caught') : t('start');
      byId('hero-title').textContent = caughtUp ? t('hero_caught') : t('hero_session');
      byId('why-text').textContent = caughtUp ? t('why_caught') : t('why_due');
      renderPlan();
  }
  /* ---------- TODAY: daily plan ---------- */
  function toolName(v: string) { return t(v === 'practice' ? 'nav_drills' : v === 'songs' ? 'pr_songs' : v === 'accompany' ? 'pr_along' : 'nav_' + (isMergedView(v) ? MERGED_VIEWS[v] : v)); }
  function renderPlan() {
      const list = byId('plan-list');
      if (!list)
          return;
      const tn = todayN();
      const goal = host.store.data().settings.goal, done = host.store.data().todayDay === tn ? (host.store.data().todayCount || 0) : 0;
      const td = host.store.data().toolDay || {}, ear = host.store.data().earDay === tn ? (host.store.data().earToday || 0) : 0;
      const items: DailyPlanTask[] = [
          { id: 'review', done: done >= goal, partial: done > 0 && done < goal, prog: goal ? Math.min(1, done / goal) : 0, pill: Math.min(done, goal) + '/' + goal, t: t('plan_review'), d: done >= goal ? t('plan_review_done') : t('plan_review_d', done, goal), go: () => shell.startReview() },
          ...learnPlanItems(tn),
          { id: 'read', done: td.read === tn, t: t('plan_read'), d: t('plan_read_d'), go: () => show('read') },
          { id: 'piece', done: td.piece === tn, t: t('plan_piece'), d: t('plan_piece_d'), go: () => show('analysis') }, // toolDay.piece: a piece run completed today
          { id: 'ear', done: ear >= 5, partial: ear > 0 && ear < 5, prog: Math.min(1, ear / 5), pill: Math.min(ear, 5) + '/5', t: t('plan_ear'), d: ear ? t('plan_ear_dn', Math.min(ear, 5)) : t('plan_ear_d'), go: () => shell.earCheck() },
      ];
      const nextIdx = items.findIndex((i) => !i.done);
      list.innerHTML = '';
      items.forEach((it, idx) => {
          const li = (document).createElement('li'), b = (document).createElement('button'), isNext = idx === nextIdx, isPart = !it.done && !!it.partial;
          b.type = 'button';
          b.className = 'plan-item';
          b.dataset.plan = it.id;
          b.dataset.done = it.done ? 'true' : 'false';
          if (isNext)
              b.dataset.next = 'true';
          if (isPart)
              b.dataset.partial = 'true';
          const ckTxt = it.done ? '✓' : String(idx + 1);
          const pillHtml = it.pill ? '<span class="plan-pill">' + it.pill + '</span>' : '';
          const barHtml = (isPart && it.prog !== undefined && it.prog > 0) ? '<span class="plan-bar" aria-hidden="true"><i style="width:' + Math.round(it.prog * 100) + '%"></i></span>' : '';
          b.innerHTML = '<span class="ck" aria-hidden="true">' + ckTxt + '</span><span class="pt">' + it.t + (it.done ? '<span class="visually-hidden"> — ' + t('done_today') + '</span>' : '') + '</span><span class="pd">' + it.d + '</span><span class="plan-end" aria-hidden="true">' + pillHtml + '<span class="plan-go">→</span></span>' + barHtml;
          b.addEventListener('click', it.go);
          li.appendChild(b);
          list.appendChild(li);
      });
      byId('plan-sub').textContent = t('plan_sub', items.filter((i) => i.done).length, items.length);
      const segs = byId('plan-segs');
      if (segs) {
          segs.innerHTML = items.map((it, idx) => '<i data-state="' + (it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo') + '"></i>').join('');
      }
      const nextIt = nextIdx >= 0 ? items[nextIdx] : null, lt = host.store.data().lastTool, cb = byId('plan-continue');
      if (nextIt) {
          cb.hidden = false;
          cb.textContent = t('plan_continue', nextIt.t);
          cb.onclick = nextIt.go;
      }
      else if (lt && lt !== 'today' && (navGroup(lt) || isMovedView(lt) || isMergedView(lt))) {
          cb.hidden = false;
          cb.textContent = t('plan_continue', toolName(lt));
          cb.onclick = () => show(lt);
      }
      else
          cb.hidden = true;
  }

  function enter(_params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
    if (signal.aborted || shell.sesActive()) return;
    byId('today-home').style.display = 'block';
    byId('summary').style.display = 'none';
    refreshToday();
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      greeting: { get: () => greeting },
      renderPlan: { get: () => renderPlan },
      toolName: { get: () => toolName },
    });
  }

  return {
    enter,
    leave: () => {},
    registerTestSurface,
    refresh: refreshToday,
  };
}
