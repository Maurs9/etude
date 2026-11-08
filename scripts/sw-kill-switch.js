/* Emergency worker. Deploy this file as sw.js only long enough to remove a broken cache. */
'use strict';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // skipWaiting can make the old controller disappear before this
    // activation callback runs. The scope and URL marker below keep this
    // limited to each previous app tab, exactly once.
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all((await caches.keys()).filter(key => key.startsWith('etude-')).map(key => caches.delete(key)));
    await self.registration.unregister();
    await Promise.all(pages.map(page => {
      const url = new URL(page.url);
      if (url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
      if (url.searchParams.get('sw-kill-switch') === 'done') return;
      url.searchParams.set('sw-kill-switch', 'done');
      return page.navigate(url.href);
    }));
  })());
});
