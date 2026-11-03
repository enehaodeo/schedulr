import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

export interface PushMessage {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/** 给一批用户的所有设备推送；失效的订阅（404/410）直接删除 */
export async function pushToUsers(sb: SupabaseClient, userIds: string[], msg: PushMessage): Promise<number> {
  if (!userIds.length) return 0;
  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) throw error;
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 600 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
        else console.error('push failed', code, e);
      }
    }),
  );
  return sent;
}

/** 只允许带共享密钥的调用（pg_cron / 数据库触发器），见 supabase/setup_jobs.sql */
export function authorized(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET');
  return !!secret && req.headers.get('x-cron-secret') === secret;
}
