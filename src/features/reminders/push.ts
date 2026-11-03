import { supabase } from '../../supabase/client';
import { sessionStore } from '../../sync/syncEngine';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** 申请通知权限；登录且配置了 VAPID 时同时订阅服务端推送（关闭网页也能收到） */
export async function enableNotifications(): Promise<'push' | 'local' | 'denied' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';

  const session = sessionStore.get();
  if (!pushSupported() || !VAPID || !supabase || !session) return 'local';

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) }));
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: session.user.id, endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
  return 'push';
}
