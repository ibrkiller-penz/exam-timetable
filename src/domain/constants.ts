import { DayIdx, PeriodIdx, ExamDay, ExamTime, Timetable } from './types';

export const DAYS: DayIdx[] = [1, 2, 3, 4, 5];
export const PERIODS: PeriodIdx[] = [1, 2, 3, 4, 5];
export const DEFAULT_TIME = '09:00 ~ 09:50';
export const DEFAULT_PERIOD_TIMES: Record<PeriodIdx, string> = {
  1: '09:00 ~ 09:50',
  2: '10:10 ~ 11:00',
  3: '11:20 ~ 12:10',
  4: '13:00 ~ 13:50',
  5: '14:00 ~ 14:50',
};
export const EXTRA_ROOM_DEFAULT = 30;
export const MAX_COMPAT = 999;
export const APP_VERSION = '1.0.0';

export const createInitialDays = (): ExamDay[] => [
  { day: 1, date: null },
  { day: 2, date: null },
  { day: 3, date: null },
  { day: 4, date: null },
  { day: 5, date: null },
];

export const createInitialTimes = (): ExamTime[] => {
  const times: ExamTime[] = [];
  for (const day of DAYS) {
    for (const period of PERIODS) {
      times.push({ day, period, time: null });
    }
  }
  return times;
};

export const createInitialTimetable = (): Timetable => {
  const tt: Partial<Timetable> = {};
  for (const d of DAYS) {
    for (const p of PERIODS) {
      tt[`${d}_${p}`] = { subjects: [] };
    }
  }
  return tt as Timetable;
};

export interface SubjectColorStyle {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  hoverBg: string;
}

export const SUBJECT_COLOR_PALETTES: SubjectColorStyle[] = [
  { bg: 'bg-sky-50', text: 'text-sky-950', border: 'border-sky-300', badgeBg: 'bg-sky-600', badgeText: 'text-white', hoverBg: 'hover:bg-sky-100' },
  { bg: 'bg-[#e5f6ec]', text: 'text-emerald-950', border: 'border-emerald-300', badgeBg: 'bg-emerald-600', badgeText: 'text-white', hoverBg: 'hover:bg-emerald-100' },
  { bg: 'bg-[#e6f1f8]', text: 'text-indigo-950', border: 'border-indigo-300', badgeBg: 'bg-indigo-600', badgeText: 'text-white', hoverBg: 'hover:bg-[#cce3f0]' },
  { bg: 'bg-purple-50', text: 'text-purple-950', border: 'border-purple-300', badgeBg: 'bg-purple-600', badgeText: 'text-white', hoverBg: 'hover:bg-purple-100' },
  { bg: 'bg-rose-50', text: 'text-rose-950', border: 'border-rose-300', badgeBg: 'bg-rose-600', badgeText: 'text-white', hoverBg: 'hover:bg-rose-100' },
  { bg: 'bg-amber-50', text: 'text-amber-950', border: 'border-amber-300', badgeBg: 'bg-amber-600', badgeText: 'text-white', hoverBg: 'hover:bg-amber-100' },
  { bg: 'bg-teal-50', text: 'text-teal-950', border: 'border-teal-300', badgeBg: 'bg-teal-600', badgeText: 'text-white', hoverBg: 'hover:bg-teal-100' },
  { bg: 'bg-cyan-50', text: 'text-cyan-950', border: 'border-cyan-300', badgeBg: 'bg-cyan-600', badgeText: 'text-white', hoverBg: 'hover:bg-cyan-100' },
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-950', border: 'border-fuchsia-300', badgeBg: 'bg-fuchsia-600', badgeText: 'text-white', hoverBg: 'hover:bg-fuchsia-100' },
  { bg: 'bg-lime-50', text: 'text-lime-950', border: 'border-lime-300', badgeBg: 'bg-lime-600', badgeText: 'text-white', hoverBg: 'hover:bg-lime-100' },
  { bg: 'bg-orange-50', text: 'text-orange-950', border: 'border-orange-300', badgeBg: 'bg-orange-600', badgeText: 'text-white', hoverBg: 'hover:bg-orange-100' },
  { bg: 'bg-[#e6f1f8]', text: 'text-blue-950', border: 'border-blue-300', badgeBg: 'bg-[#005691]', badgeText: 'text-white', hoverBg: 'hover:bg-blue-100' },
];

export function getSubjectColor(subject: string): SubjectColorStyle {
  if (!subject) return SUBJECT_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 31 + subject.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % SUBJECT_COLOR_PALETTES.length;
  return SUBJECT_COLOR_PALETTES[idx];
}

