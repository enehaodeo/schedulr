-- 周期短期任务：每周固定几天的固定时段，客户端据此生成 short_tasks（recurring_id 指回规则）
-- 检查约束与 src/features/recurring/plan.ts 的 ruleError 保持一致

create table public.recurring_tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  tags text[] not null default '{}',
  weekdays int[] not null,
  start_min int not null,
  end_min int not null,
  start_date date not null,
  end_date date,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp(),
  constraint weekdays_valid check (cardinality(weekdays) > 0 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  constraint time_range_valid check (start_min >= 0 and end_min <= 1440 and start_min < end_min),
  constraint date_range_valid check (end_date is null or end_date >= start_date)
);
create index on public.recurring_tasks (user_id, synced_at);

alter table public.recurring_tasks enable row level security;
create policy "own rows" on public.recurring_tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger touch before insert or update on public.recurring_tasks
  for each row execute function public.touch_synced_at();

alter table public.short_tasks add column recurring_id uuid;
