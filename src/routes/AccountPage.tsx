import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { AuthForm } from '../components/AuthForm';
import { CoursePicker } from '../components/CoursePicker';
import { toast } from '../components/toast';
import { db } from '../db/dexie';
import { addAvailability, getProfile, removeAvailability, saveProfile } from '../db/repo';
import { enableNotifications } from '../features/reminders/push';
import { fmtMin, parseHHMM, WEEKDAYS } from '../lib/dates';
import { useStore } from '../lib/store';
import { sessionStore, signOut, syncNow, syncStatus } from '../sync/syncEngine';

export default function AccountPage() {
  const session = useStore(sessionStore);
  const status = useStore(syncStatus);
  const profile = useLiveQuery(getProfile);
  const [name, setName] = useState('');
  const [courses, setCourses] = useState<string[]>([]);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name);
      setCourses(profile.courses);
    }
  }, [profile?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveInfo() {
    if (!courses.length) {
      toast('请至少选择一门课程', 'error');
      return;
    }
    await saveProfile({ display_name: name.trim(), courses });
    toast('已保存');
  }

  async function notifications() {
    try {
      const r = await enableNotifications();
      const text = {
        push: '已开启推送，关闭网页也能收到提醒',
        local: '已开启通知（登录并配置推送后，关闭网页也能收到）',
        denied: '通知权限被拒绝，请在浏览器设置中允许',
        unsupported: '当前浏览器不支持通知（iOS 需先“添加到主屏幕”）',
      }[r];
      toast(text, r === 'push' || r === 'local' ? 'info' : 'error');
    } catch (e) {
      toast(`开启推送失败：${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">账号与同步</h2>
        {session ? (
          <>
            <p className="text-sm">
              已登录：{session.user.email}
              <span className="ml-2 text-xs text-slate-500">状态：{status}</span>
            </p>
            <div className="flex gap-2">
              <button className="btn" onClick={() => void syncNow()}>
                立即同步
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  if (confirm('退出登录会清除本浏览器中的数据（云端数据保留），继续？')) await signOut();
                }}
              >
                退出登录
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">未登录时数据只保存在本浏览器；登录后会把本地数据同步到云端。</p>
            <AuthForm />
          </>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">提醒</h2>
        <p className="text-xs text-slate-500">
          日程任务开始和结束前 5 分钟提醒，新公共任务也会提醒。登录后开启可在关闭网页时收到推送；iPhone / iPad 需先用 Safari
          “添加到主屏幕”再从主屏幕打开。
        </p>
        <button className="btn-primary" onClick={notifications}>
          开启通知
        </button>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">个人信息</h2>
        <div>
          <label className="label">名字</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">选课</label>
          <CoursePicker value={courses} onChange={setCourses} />
        </div>
        <button className="btn-primary" onClick={saveInfo}>
          保存
        </button>
      </section>

      <WeeklyTemplate />
    </div>
  );
}

function WeeklyTemplate() {
  const rows = useLiveQuery(() => db.availability.where('kind').equals('weekly').filter((a) => !a.deleted).toArray(), []) ?? [];
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('21:00');

  async function add() {
    const s = parseHHMM(start);
    const e = parseHHMM(end);
    if (e <= s) {
      toast('结束时间必须晚于开始时间', 'error');
      return;
    }
    await addAvailability({ kind: 'weekly', weekday, date: null, start_min: s, end_min: e });
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">每周可用时间模板</h2>
      <p className="text-xs text-slate-500">日程表在没有单独设置的日子使用这里的时间。也可以在日程表里直接框选。</p>
      <div className="space-y-1 text-sm">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const list = rows.filter((r) => r.weekday === wd).sort((a, b) => a.start_min - b.start_min);
          return (
            <div key={wd} className="flex flex-wrap items-center gap-1">
              <span className="w-10 text-slate-500">{WEEKDAYS[wd]}</span>
              {list.length === 0 && <span className="text-xs text-slate-300">无</span>}
              {list.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 text-xs text-emerald-800">
                  {fmtMin(r.start_min)}-{fmtMin(r.end_min)}
                  <button className="text-rose-500" onClick={() => removeAvailability(r.id)} aria-label="删除">
                    ×
                  </button>
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select className="input w-auto" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <option key={wd} value={wd}>
              {WEEKDAYS[wd]}
            </option>
          ))}
        </select>
        <input className="input w-auto" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
        <span>-</span>
        <input className="input w-auto" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="btn" onClick={add}>
          添加
        </button>
      </div>
    </section>
  );
}
