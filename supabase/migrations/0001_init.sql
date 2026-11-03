-- Schedulr 数据库结构
-- 个人表（long_tasks / short_tasks / availability）与浏览器 IndexedDB 同构：
--   updated_at = 客户端修改时间（毫秒，后写胜出），synced_at = 服务端写入时间（增量拉取游标）

create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  -- clock_timestamp 保证同一事务内每行不同，避免分页游标漏行
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- ---------- 个人信息 ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  courses text[] not null default '{}',
  onboarded boolean not null default false,
  updated_at bigint not null default 0
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- ---------- 长期任务 ----------
create table public.long_tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  duration_days int not null check (duration_days >= 1),
  deadline date not null,
  tags text[] not null default '{}',
  sort_order double precision not null default 0,
  status text not null check (status in ('pool', 'scheduled', 'trash')),
  start_date date,
  source_public_id uuid,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp(),
  -- 结束日不能晚于 deadline
  constraint end_before_deadline check (start_date is null or start_date + duration_days - 1 <= deadline)
);
create index on public.long_tasks (user_id, synced_at);

-- ---------- 短期任务 ----------
create table public.short_tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  duration_min int not null check (duration_min >= 0),
  tags text[] not null default '{}',
  parent_id uuid,
  sort_order double precision not null default 0,
  status text not null check (status in ('pool', 'scheduled', 'trash')),
  start_at bigint,
  end_at bigint,
  source_public_id uuid,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index on public.short_tasks (user_id, synced_at);
create index on public.short_tasks (status, start_at);
create index on public.short_tasks (status, end_at);

-- ---------- 可用时间 ----------
create table public.availability (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('weekly', 'date')),
  weekday int check (weekday between 0 and 6),
  date date,
  start_min int not null,
  end_min int not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index on public.availability (user_id, synced_at);

do $$
declare t text;
begin
  foreach t in array array['long_tasks', 'short_tasks', 'availability'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format(
      'create trigger touch before insert or update on public.%I for each row execute function public.touch_synced_at()', t);
  end loop;
end $$;

-- ---------- 公共任务 ----------
create table public.public_tasks (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  author_name text,
  kind text not null check (kind in ('long', 'short')),
  payload jsonb not null,
  scopes text[] not null check (cardinality(scopes) > 0),
  created_at timestamptz not null default now()
);
create index on public.public_tasks using gin (scopes);
alter table public.public_tasks enable row level security;

create or replace function public.my_courses() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select courses from public.profiles where id = auth.uid()), '{}');
$$;

create policy "visible to scope or author" on public.public_tasks
  for select using (author_id = auth.uid() or scopes && public.my_courses());
create policy "author inserts" on public.public_tasks
  for insert with check (author_id = auth.uid());
create policy "author deletes" on public.public_tasks
  for delete using (author_id = auth.uid());

create table public.public_task_actions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  public_task_id uuid not null references public.public_tasks on delete cascade,
  action text not null check (action in ('added', 'trashed')),
  created_at timestamptz not null default now(),
  primary key (user_id, public_task_id)
);
alter table public.public_task_actions enable row level security;
create policy "own actions" on public.public_task_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 实时推送新公共任务（Realtime 会按 RLS 过滤）
alter publication supabase_realtime add table public.public_tasks;

-- ---------- 推送 ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 只给 Edge Function（service role）用，防止重复提醒；at = 被提醒的时间点，改期后会再次提醒
create table public.reminder_log (
  task_id uuid not null,
  kind text not null check (kind in ('start', 'end')),
  at bigint not null,
  sent_at timestamptz not null default now(),
  primary key (task_id, kind, at)
);
alter table public.reminder_log enable row level security;
