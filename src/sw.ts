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
      icon: `${import.meta.env.BASE_URL}icon.svg`,
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 服务端发来的是应用内路径（如 /schedule），按部署子路径解析
  const path = ((event.notification.data?.url as string) ?? '/').replace(/^\//, '');
  const url = new URL(path, self.registration.scope).href;
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
