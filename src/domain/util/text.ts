export function onlySubject(subject: string): string {
  if (!subject) return '';
  const idx = subject.lastIndexOf('(');
  if (idx !== -1 && subject.endsWith(')')) {
    return subject.slice(0, idx).trim();
  }
  return subject.trim();
}

export function hakbun(grade: string, ban: string, num: number): string {
  const g = grade ? grade.charAt(0) : '1';
  const b = ban.length > 3 ? ban : ban.replace('반', '').padStart(2, '0');
  const n = String(num).padStart(2, '0');
  return `${g}${b}${n}`;
}
