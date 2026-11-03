/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] };

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  const data: PushPayload = event.data?.json() ?? { title: 'Schedulr', body: '' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icon.svg',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins[0];
      if (win) {
        await win.focus();
        await win.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
