import dayjs from 'dayjs';

/**
 * Calculates consecutive exam dates starting from startDateStr,
 * skipping weekends (Saturday & Sunday).
 */
export function calculateExamDates(startDateStr: string, daysCount: number): string[] {
  if (!startDateStr || daysCount <= 0) return [];
  const result: string[] = [];
  let current = dayjs(startDateStr);

  while (result.length < daysCount) {
    const dayOfWeek = current.day(); // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      result.push(current.format('YYYY-MM-DD'));
    }
    current = current.add(1, 'day');
  }

  return result;
}

/**
 * Returns Korean day of week string for a given YYYY-MM-DD date.
 */
export function getDayOfWeekKorean(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = dayjs(dateStr);
  if (!d.isValid()) return '';
  const days = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];
  return days[d.day()] || '';
}
