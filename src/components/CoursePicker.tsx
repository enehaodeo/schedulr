import { COURSES } from '../lib/courses';

export function CoursePicker({
  value,
  onChange,
  allowSelectAll,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  allowSelectAll?: boolean;
}) {
  const all = value.length === COURSES.length;
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <div>
      {allowSelectAll && (
        <label className="mb-2 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={all}
            onChange={() => onChange(all ? [] : COURSES.map((c) => c.code))}
          />
          全选
        </label>
      )}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {COURSES.map((c) => (
          <label
            key={c.code}
            className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm ${
              value.includes(c.code) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
            }`}
          >
            <input type="checkbox" checked={value.includes(c.code)} onChange={() => toggle(c.code)} />
            {c.name}
          </label>
        ))}
      </div>
    </div>
  );
}
