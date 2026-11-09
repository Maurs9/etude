# Service-worker kill switch

If a deployed worker serves a broken version, replace the published `sw.js`
with `scripts/sw-kill-switch.js` for one deployment. The emergency worker:

1. waits until it is active;
2. deletes every `etude-` cache;
3. unregisters itself; and
4. navigates each window that the previous worker controlled exactly once.

The app recognizes the `sw-kill-switch=done` query marker and does not
register the kill switch again. Restore the generated worker on the next
deployment after the caches have been cleared. This runbook is intentionally
separate from the normal build; the kill switch must never enter the
precache manifest.
