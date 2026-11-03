import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase/client';
import { toast } from './toast';

export function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!supabase) {
    return (
      <p className="text-sm text-slate-500">
        尚未配置云端（缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），目前数据只保存在本浏览器。
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast('登录成功，正在同步');
      } else {
        const { data, error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
        toast(data.session ? '注册成功，本地数据将同步到云端' : '注册成功，请到邮箱点击确认链接后再登录');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: typeof mode) => (m === mode ? 'font-semibold text-indigo-600' : 'text-slate-500');

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button type="button" className={tab('login')} onClick={() => setMode('login')}>
          登录
        </button>
        <span className="text-slate-300">|</span>
        <button type="button" className={tab('register')} onClick={() => setMode('register')}>
          注册
        </button>
      </div>
      <div>
        <label className="label">邮箱</label>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">密码（至少 6 位）</label>
        <input
          className="input"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {mode === 'login' ? '登录' : '注册'}
      </button>
    </form>
  );
}
