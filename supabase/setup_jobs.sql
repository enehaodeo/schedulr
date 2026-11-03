-- 在迁移和 Edge Functions 部署完成后，于 Supabase SQL Editor 中执行一次。
-- 先把下面两处占位符替换掉：
--   <PROJECT_REF>   项目 ID（Project URL 里 https://<PROJECT_REF>.supabase.co 的那段）
--   <CRON_SECRET>   与 `supabase secrets set CRON_SECRET=...` 相同的随机字符串

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1', 'functions_url');
select vault.create_secret('<CRON_SECRET>', 'cron_secret');

create or replace function public.call_function(fn text, body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  perform net.http_post(
    url := base || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := body
  );
end $$;
revoke execute on function public.call_function(text, jsonb) from public, anon, authenticated;

-- 每分钟检查日程提醒
select cron.schedule('send-reminders', '* * * * *', $$select public.call_function('send-reminders', '{}'::jsonb)$$);

-- 新公共任务 → 通知可见范围内的用户
create or replace function public.on_public_task_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.call_function('notify-public-task', jsonb_build_object('record', to_jsonb(new)));
  return new;
end $$;

create trigger notify_public_task after insert on public.public_tasks
  for each row execute function public.on_public_task_insert();
