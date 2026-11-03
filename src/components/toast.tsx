import { createStore, useStore } from '../lib/store';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

const toasts = createStore<Toast[]>([]);
let seq = 0;

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++seq;
  toasts.set([...toasts.get(), { id, text, kind }]);
  setTimeout(() => toasts.set(toasts.get().filter((t) => t.id !== id)), 5000);
}

export function Toaster() {
  const list = useStore(toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-xs rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
            t.kind === 'error' ? 'bg-rose-600' : 'bg-slate-800'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
