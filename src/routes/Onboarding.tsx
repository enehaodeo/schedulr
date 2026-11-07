import { useState } from 'react';
import { AuthForm } from '../components/AuthForm';
import { CoursePicker } from '../components/CoursePicker';
import { toast } from '../components/toast';
import { saveProfile } from '../db/repo';
import { supabase } from '../supabase/client';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [courses, setCourses] = useState<string[]>([]);
  const [showLogin, setShowLogin] = useState(false);

  async function start() {
    if (!courses.length) {
      toast('请至少选择一门课程', 'error');
      return;
    }
    await saveProfile({ display_name: name.trim(), courses, onboarded: true });
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-indigo-600">欢迎使用 Schedulr</h1>
      <p className="mb-6 text-sm text-slate-500">先填写名字和选课，白板上的任务会按课程推送给你。</p>
      <div className="card space-y-4 p-5">
        <div>
          <label className="label">名字</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：张三" />
        </div>
        <div>
          <label className="label">选课（可多选）</label>
          <CoursePicker value={courses} onChange={setCourses} />
        </div>
        <button className="btn-primary w-full" onClick={start}>
          开始使用
        </button>
      </div>
      {supabase && (
        <div className="mt-6 text-center text-sm">
          {showLogin ? (
            <div className="card mx-auto max-w-sm p-5 text-left">
              <AuthForm />
            </div>
          ) : (
            <button className="text-indigo-600 hover:underline" onClick={() => setShowLogin(true)}>
              已有账号？直接登录
            </button>
          )}
        </div>
      )}
    </div>
  );
}
