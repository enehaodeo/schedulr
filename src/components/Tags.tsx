export function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded bg-indigo-50 px-1.5 text-xs text-indigo-700">
          {t}
        </span>
      ))}
    </span>
  );
}

export function parseTags(s: string): string[] {
  return [...new Set(s.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean))];
}

/** 在标签文本里加入或去掉一个标签 */
export function toggleTag(value: string, tag: string): string {
  const tags = parseTags(value);
  return (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]).join(', ');
}
