import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
import { toast } from '../../components/toast';
import { db } from '../../db/dexie';
import { MIN_MS } from '../../lib/dates';

const LEAD = 5 * MIN_MS;

async function notify(title: string, body: string, tag: string) {
  toast(`${title}：${body}`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  // 与服务端推送使用相同 tag，系统会合并而不是重复弹出
  if (reg) await reg.showNotification(title, { body, tag, icon: `${import.meta.env.BASE_URL}icon.svg` });
  else new Notification(title, { body, tag });
}

/** 页面打开时的本地提醒：日程任务开始和结束前 5 分钟 */
export function ReminderWatcher() {
  const last = useRef(Date.now());

  useEffect(() => {
    async function tick() {
      const now = Date.now();
      const from = last.current;
      last.current = now;
      const tasks = await db.short_tasks.where('status').equals('scheduled').filter((t) => !t.deleted).toArray();
      for (const t of tasks) {
        if (t.start_at !== null && t.start_at - LEAD > from && t.start_at - LEAD <= now) {
          await notify('任务即将开始', `「${t.title}」将于 ${format(t.start_at, 'HH:mm')} 开始`, `${t.id}:start:${t.start_at}`);
        }
        if (t.end_at !== null && t.end_at - LEAD > from && t.end_at - LEAD <= now) {
          await notify('任务即将结束', `「${t.title}」将于 ${format(t.end_at, 'HH:mm')} 结束`, `${t.id}:end:${t.end_at}`);
        }
      }
    }
    const timer = setInterval(() => void tick(), 15_000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
