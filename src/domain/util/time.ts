export function getForTime(timeStr: string | null): string {
  if (!timeStr) return 'XX분';
  const clean = timeStr.replace(/\s/g, '');
  const parts = clean.split('~');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 'XX분';
  
  const parseMin = (t: string): number | null => {
    const [hStr, mStr] = t.split(':');
    if (!hStr || !mStr) return null;
    const h = Number(hStr);
    const m = Number(mStr);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  
  const t1 = parseMin(parts[0]);
  const t2 = parseMin(parts[1]);
  if (t1 === null || t2 === null) return 'XX분';
  const diff = t2 - t1;
  return `${diff}분`;
}
