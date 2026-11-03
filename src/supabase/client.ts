import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 未配置环境变量时为 null，应用以纯本地模式运行 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
