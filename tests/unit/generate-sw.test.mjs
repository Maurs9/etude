import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { workerSource } from '../../scripts/generate-sw.mjs';

it('settles outstanding installs before deleting a failed precache and skips queued assets', async () => {
  const events = [];
  const requests = [];
  const hash = createHash('sha256').update('ok').digest('hex');
  const names = ['failure', 'slow1', 'slow2', 'slow3', 'slow4', 'slow5', 'queued'];
  let install;
  let settled;
  const waits = [];
  const cache = { match: async () => undefined, put: async url => events.push(new URL(url).pathname) };

  runInNewContext(workerSource(names.map(url => ({ url, hash }))), {
    URL, Request, Response, crypto,
    self: {
      registration: { scope: 'https://app.test/' },
      addEventListener: (name, listener) => { if (name === 'install') install = listener; },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => events.push('deleted') },
    fetch: request => {
      const name = new URL(request.url).pathname.slice(1);
      requests.push(name);
      if (name === 'failure') return new Response('', { status: 503 });
      return new Promise(resolve => waits.push(() => resolve(new Response('ok'))));
    },
  });
  install({ waitUntil: promise => { settled = expect(promise).rejects.toThrow('Precache request failed'); } });
  await new Promise(resolve => setImmediate(resolve));
  expect(waits).toHaveLength(5);
  expect(events).toEqual([]);
  waits.forEach(release => release());
  await settled;
  expect(events.at(-1)).toBe('deleted');
  expect(events).toHaveLength(6);
  expect(requests).not.toContain('queued');
});
