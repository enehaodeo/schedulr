import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tags } from '../components/Tags';
import { db } from '../db/dexie';
import type { LongTask, ShortTask } from '../db/types';
import { endDate, isLongActive } from '../features/longTasks/gantt';
import { inboxStore, pendingTasks } from '../features/public/inbox';
import { addDaysStr, dateMinToMs, diffDays, fmtDuration, fromDateStr, todayStr, WEEKDAYS } from '../lib/dates';
import { useStore } from '../lib/store';
import { useNow } from '../lib/useNow';
import { supabase } from '../supabase/client';
import { sessionStore } from '../sync/syncEngine';
import { LoginHint, PendingTaskCard } from './PublicPage';

export default function HomePage() {
  const long = useLiveQuery(() => db.long_tasks.filter((t) => !t.deleted).toArray(), []) ?? [];
  const short = useLiveQuery(() => db.short_tasks.filter((t) => !t.deleted).toArray(), []) ?? [];
  const session = useStore(sessionStore);
  const inbox = useStore(inboxStore);
  const now = useNow(30_000);
  const today = todayStr(now);
  const d = fromDateStr(today);

  const activeLong = long.filter((t) => isLongActive(t, today)).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const dayStart = dateMinToMs(today, 0);
  const dayEnd = dateMinToMs(addDaysStr(today, 1), 0);
  const todayShort = short
    .filter((t) => t.status === 'scheduled' && t.start_at !== null && t.start_at >= dayStart && t.start_at < dayEnd)
    .sort((a, b) => a.start_at! - b.start_at!);
  const pending = pendingTasks(inbox, session?.user.id);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">
        {format(d, 'M月d日')} {WEEKDAYS[d.getDay()]}
      </h1>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Section title="进行中的长期任务" to="/gantt" linkText="甘特图">
          {activeLong.map((t) => (
            <LongRow key={t.id} task={t} today={today} />
          ))}
          {activeLong.length === 0 && <Empty>现在没有进行中的长期任务</Empty>}
        </Section>

        <Section title="今日安排" to="/schedule" linkText="日程表">
          {todayShort.map((t) => (
            <ShortRow key={t.id} task={t} now={now} />
          ))}
          {todayShort.length === 0 && <Empty>今天还没有安排任务</Empty>}
        </Section>

        <Section title="白板新任务" to="/public" linkText="白板">
          {!supabase || !session ? (
            <LoginHint />
          ) : (
            <>
              {pending.map((t) => (
                <PendingTaskCard key={t.id} task={t} />
              ))}
              {inbox.loaded && pending.length === 0 && <Empty>白板上暂时没有新任务</Empty>}
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  to,
  linkText,
  children,
}: {
  title: string;
  to: string;
  linkText: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link to={to} className="text-xs text-indigo-600 hover:underline">
          去{linkText} →
        </Link>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

function LongRow({ task, today }: { task: LongTask; today: string }) {
  const day = diffDays(today, task.start_date!) + 1;
  const left = diffDays(task.deadline, today);
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{task.title}</span>
        <span className={`shrink-0 text-xs ${left <= 3 ? 'text-amber-600' : 'text-slate-500'}`}>
          {left === 0 ? '今天截止' : `${left} 天后截止`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(day / task.duration_days) * 100}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          第 {day} / {task.duration_days} 天
        </span>
        <span>计划 {endDate(task.start_date!, task.duration_days)} 结束</span>
        <Tags tags={task.tags} />
      </div>
    </div>
  );
}

function ShortRow({ task, now }: { task: ShortTask; now: number }) {
  const start = task.start_at!;
  const end = task.end_at!;
  const past = end <= now;
  const current = start <= now && !past;
  return (
    <div className={`card p-3 ${past ? 'opacity-60' : ''} ${current ? 'border-indigo-400' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{task.title}</span>
        {current && <span className="shrink-0 text-xs text-indigo-600">进行中</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
        </span>
        <span>{fmtDuration(task.duration_min)}</span>
        <Tags tags={task.tags} />
      </div>
    </div>
  );
}
