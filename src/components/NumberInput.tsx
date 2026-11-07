/** 只保留数字并去掉开头多余的 0；超过 max 时取 max。允许为空，方便先删除再输入 */
export function cleanDigits(raw: string, max?: number): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return max !== undefined && Number(digits) > max ? String(max) : digits;
}

/** 非负整数输入框：值用字符串保存，输入过程中可以清空；手机上弹出数字键盘 */
export function NumberInput({
  value,
  onChange,
  max,
  required,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  max?: number;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      className="input"
      type="text"
      inputMode="numeric"
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(cleanDigits(e.target.value, max))}
      onFocus={(e) => e.target.select()}
    />
  );
}
