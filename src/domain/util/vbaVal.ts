export function vbaVal(s: string): number {
  if (!s) return 0;
  const trimmed = s.trim();
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))/.exec(trimmed);
  if (!match || !match[1]) return 0;
  const num = Number(match[1]);
  return isNaN(num) ? 0 : num;
}
