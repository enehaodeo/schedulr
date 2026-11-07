import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/dexie';
import { getProfile } from '../db/repo';
import { courseSubject } from '../lib/courses';
import { parseTags, toggleTag } from './Tags';

/** 可选标签：自己的选课科目 + 所有任务用过的标签 */
function loadTagOptions(): Promise<string[]> {
  return Promise.all([db.long_tasks.toArray(), db.short_tasks.toArray(), getProfile()]).then(
    ([long, short, profile]) => {
      const used = [...long, ...short].filter((t) => !t.deleted).flatMap((t) => t.tags);
      const subjects = profile.courses.map(courseSubject);
      return [...new Set([...subjects, ...used])].sort((a, b) => a.localeCompare(b, 'zh'));
    },
  );
}

/** 标签输入框：可以手打，也可以展开全部可选标签点选 */
export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const options = useLiveQuery(loadTagOptions, []) ?? [];
  const [open, setOpen] = useState(false);
  const selected = parseTags(value);

  return (
    <div>
      <div className="flex gap-2">
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <button type="button" className="btn shrink-0" aria-expanded={open} onClick={() => setOpen(!open)}>
          选择 {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border border-slate-200 p-2">
          {options.map((tag) => {
            const on = selected.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                className={`rounded px-2 py-0.5 text-xs ${
                  on ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
                onClick={() => onChange(toggleTag(value, tag))}
              >
                {tag}
              </button>
            );
          })}
          {options.length === 0 && <span className="text-xs text-slate-400">还没有可选标签，直接输入即可</span>}
        </div>
      )}
    </div>
  );
}
