// 由 public_tasks 的插入触发器调用：通知可见范围内的用户
import { adminClient, authorized, pushToUsers } from '../_shared/push.ts';

interface Body {
  record: {
    id: string;
    author_id: string;
    author_name: string | null;
    kind: 'long' | 'short';
    payload: { title: string };
    scopes: string[];
  };
}

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response('unauthorized', { status: 401 });
  const { record } = (await req.json()) as Body;
  const sb = adminClient();

  const { data: users, error } = await sb
    .from('profiles')
    .select('id')
    .overlaps('courses', record.scopes)
    .neq('id', record.author_id);
  if (error) return new Response(error.message, { status: 500 });

  const sent = await pushToUsers(
    sb,
    (users ?? []).map((u) => u.id),
    {
      title: '白板有新任务',
      body: `${record.author_name ?? '有人'}发布了${record.kind === 'long' ? '长期' : '短期'}任务「${record.payload.title}」`,
      tag: `public:${record.id}`,
      url: '/public',
    },
  );
  return Response.json({ sent });
});
