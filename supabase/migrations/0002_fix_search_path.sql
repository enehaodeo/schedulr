-- 固定触发器函数的 search_path（Supabase 安全检查建议）
alter function public.touch_synced_at() set search_path = '';
