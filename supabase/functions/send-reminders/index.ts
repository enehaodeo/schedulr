// 由 pg_cron 每分钟调用：给开始 / 结束前 5 分钟的日程任务发推送
import { adminClient, authorized, pushToUsers } from '../_shared/push.ts';

const LEAD = 5 * 60 * 1000;
// 只补发最近 3 分钟内错过的提醒，避免 cron 中断后补发一大堆过时提醒
const WINDOW = 3 * 60 * 1000;

function hhmm(ms: number, tz: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms);
}

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response('unauthorized', { status: 401 });
  const sb = adminClient();
  const now = Date.now();
  const tz = Deno.env.get('APP_TIMEZONE') ?? 'Asia/Shanghai';
  let sent = 0;

  for (const kind of ['start', 'end'] as const) {
    const col = kind === 'start' ? 'start_at' : 'end_at';
    const { data: tasks, error } = await sb
      .from('short_tasks')
      .select(`id, user_id, title, ${col}`)
      .eq('status', 'scheduled')
      .eq('deleted', false)
      .gt(col, now + LEAD - WINDOW)
      .lte(col, now + LEAD);
    if (error) return new Response(error.message, { status: 500 });

    for (const t of tasks ?? []) {
      const at = (t as Record<string, number>)[col];
      // 插入成功才发，主键冲突说明已经发过
      const { error: dup } = await sb.from('reminder_log').insert({ task_id: t.id, kind, at });
      if (dup) continue;
      sent += await pushToUsers(sb, [t.user_id], {
        title: kind === 'start' ? '任务即将开始' : '任务即将结束',
        body: `「${t.title}」将于 ${hhmm(at, tz)} ${kind === 'start' ? '开始' : '结束'}`,
        tag: `${t.id}:${kind}:${at}`,
        url: '/schedule',
      });
    }
  }

  return Response.json({ sent });
});
