import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from './components/toast';
import { getProfile } from './db/repo';
import { ExpiryWatcher } from './features/expiry/ExpiryWatcher';
import { useInboxCount } from './features/public/inbox';
import { ReminderWatcher } from './features/reminders/ReminderWatcher';
import { useStore } from './lib/store';
import AccountPage from './routes/AccountPage';
import GanttPage from './routes/GanttPage';
import HomePage from './routes/HomePage';
import Onboarding from './routes/Onboarding';
import PublicPage from './routes/PublicPage';
import SchedulePage from './routes/SchedulePage';
import TrashPage from './routes/TrashPage';
import { sessionStore, syncStatus } from './sync/syncEngine';

const STATUS_TEXT = {
  offline: '仅本地',
  idle: '已登录',
  syncing: '同步中…',
  ok: '已同步',
  error: '同步失败',
} as const;

export default function App() {
  const profile = useLiveQuery(getProfile);
  const session = useStore(sessionStore);
  const status = useStore(syncStatus);
  const inbox = useInboxCount();

  if (!profile) return null;
  if (!profile.onboarded) return <Onboarding />;

  const link = ({ isActive }: { isActive: boolean }) =>
    `relative rounded-md px-3 py-1.5 text-sm ${
      isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
          <span className="mr-2 font-bold text-indigo-600">Schedulr</span>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" end className={link}>
              主页
            </NavLink>
            <NavLink to="/gantt" className={link}>
              甘特图
            </NavLink>
            <NavLink to="/schedule" className={link}>
              日程表
            </NavLink>
            <NavLink to="/public" className={link}>
              白板
              {inbox > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                  {inbox}
                </span>
              )}
            </NavLink>
            <NavLink to="/trash" className={link}>
              垃圾桶
            </NavLink>
          </nav>
          <NavLink to="/account" className="ml-auto text-sm text-slate-500 hover:text-indigo-600">
            {profile.display_name || '我'} · {session ? STATUS_TEXT[status] : '未登录'}
          </NavLink>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/gantt" element={<GanttPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/public" element={<PublicPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ExpiryWatcher />
      <ReminderWatcher />
      <Toaster />
    </div>
  );
}
