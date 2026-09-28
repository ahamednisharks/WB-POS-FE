/**
 * Date helpers. Business dates are plain `yyyy-MM-dd` strings in Asia/Kolkata (IST, UTC+05:30, no DST).
 * Timestamps are ISO strings in UTC.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;

export type DatePreset = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export interface DateRange {
  from: string;
  to: string;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** IST calendar date (yyyy-MM-dd) of an instant. */
export function istDate(value: Date | string | number = new Date()): string {
  const t = new Date(value).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** IST hour (0-23) of an instant. */
export function istHour(value: Date | string): number {
  const t = new Date(value).getTime() + IST_OFFSET_MS;
  return new Date(t).getUTCHours();
}

export function todayIST(): string {
  return istDate(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO instant for a given IST calendar date + time. */
export function istDateTime(dateStr: string, hour: number, minute = 0): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS;
  return new Date(utc).toISOString();
}

/** Calendar arithmetic on yyyy-MM-dd strings. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
export function startOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(dateStr, diff);
}

export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return dt.toISOString().slice(0, 10);
}

export function daysInMonth(month: string): number {
  return Number(endOfMonth(month).slice(8, 10));
}

export function presetRange(preset: Exclude<DatePreset, 'CUSTOM'>): DateRange {
  const today = todayIST();
  switch (preset) {
    case 'TODAY':
      return { from: today, to: today };
    case 'YESTERDAY': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'WEEK':
      return { from: startOfWeek(today), to: today };
    case 'MONTH':
      return { from: startOfMonth(today), to: today };
  }
}

/** Date picked in a PrimeNG DatePicker (local calendar) → yyyy-MM-dd. */
export function dateToStr(date: Date | null | undefined): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** yyyy-MM-dd → local Date for a PrimeNG DatePicker. */
export function strToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Date → yyyy-MM */
export function monthToStr(date: Date | null | undefined): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** yyyy-MM → Date (1st of month) */
export function strToMonth(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** yyyy-MM → "Sep 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${y}`;
}

/** Whole years between a yyyy-MM-dd birth date and today (IST). */
export function ageInYears(dob: string, onDate: string = todayIST()): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = onDate.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

/** yyyy-MM-dd → dd-MM-yyyy */
export function displayDate(value: string | null | undefined): string {
  if (!value) return '';
  const s = value.length > 10 ? istDate(value) : value;
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
}

/** ISO → dd-MM-yyyy hh:mm a (IST) */
export function displayDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const t = new Date(new Date(value).getTime() + IST_OFFSET_MS);
  let h = t.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${displayDate(value)} ${pad(h)}:${pad(t.getUTCMinutes())} ${ampm}`;
}

/** Local-time hh:mm a for an ISO string (IST). */
export function displayTime(value: string | null | undefined): string {
  if (!value) return '';
  return displayDateTime(value).slice(11);
}
