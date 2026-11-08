/* Emergency worker. Deploy this file as sw.js only long enough to remove a broken cache. */
'use strict';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // includeUncontrolled:false limits this to pages the previous worker controlled.
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
    await Promise.all((await caches.keys()).filter(key => key.startsWith('etude-')).map(key => caches.delete(key)));
    await self.registration.unregister();
    await Promise.all(pages.map(page => {
      const url = new URL(page.url);
      url.searchParams.set('sw-kill-switch', 'done');
      return page.navigate(url.href);
    }));
  })());
});
