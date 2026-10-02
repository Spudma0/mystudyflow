export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function todayWeekdayName(): string {
  return WEEKDAY_NAMES[new Date().getDay()];
}

export function formatHeaderDate(date: Date = new Date()): string {
  const weekday = WEEKDAY_NAMES[date.getDay()].toUpperCase();
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${weekday}, ${month} ${date.getDate()}`;
}

export function daysUntil(dateIso: string): number {
  const now = new Date();
  const target = new Date(dateIso);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.ceil(
    (Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      msPerDay
  );
  return diff;
}

export function formatDayLeftLabel(dateIso: string): string {
  const d = daysUntil(dateIso);
  if (d < 0) return 'Overdue';
  if (d === 0) return '0d left';
  return `${d}d left`;
}

export function formatRelativeDayLabel(dateIso: string): string {
  const d = daysUntil(dateIso);
  const target = new Date(dateIso);
  const time = target.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d === 0) return `Today, ${time}`;
  if (d === 1) return `Tomorrow, ${time}`;
  if (d === -1) return `Yesterday, ${time}`;
  // Past dates need the calendar date — a bare weekday would read as upcoming.
  if (d < -1) {
    const date = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${date}, ${time}`;
  }
  const weekday = target.toLocaleDateString('en-US', { weekday: 'long' });
  return `${weekday}, ${time}`;
}

/**
 * Next occurrence of a daily repeating reminder: today at that time if it hasn't
 * passed yet, otherwise tomorrow. Only the time-of-day of `dateIso` is used.
 */
export function nextDailyOccurrence(dateIso: string, from: number = Date.now()): number {
  const src = new Date(dateIso);
  const next = new Date(from);
  next.setHours(src.getHours(), src.getMinutes(), 0, 0);
  if (next.getTime() <= from) next.setDate(next.getDate() + 1);
  return next.getTime();
}

/** When a reminder actually next fires — repeating ones roll over instead of expiring. */
export function effectiveDueTime(dateIso: string, repeating?: boolean): number {
  return repeating ? nextDailyOccurrence(dateIso) : new Date(dateIso).getTime();
}

export function formatTimeOfDay(dateIso: string): string {
  return new Date(dateIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "Good morning" / "Good afternoon" / "Good evening" for the device's local time. */
export function timeGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatShortDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatCountdown(dateIso: string): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const now = Date.now();
  const target = new Date(dateIso).getTime();
  const totalMs = Math.max(0, target - now);

  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((totalMs / (1000 * 60)) % 60);
  const seconds = Math.floor((totalMs / 1000) % 60);

  return { days, hours, minutes, seconds, totalMs };
}

/** Monday-based weekday index (Mon=0 … Fri=4), or null for weekends. */
function mondayIndex(date: Date): number | null {
  const d = date.getDay(); // Sun=0 … Sat=6
  if (d === 0 || d === 6) return null;
  return d - 1;
}

/** The Monday (00:00) of the week containing `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * The cycle dayIndex (0-based) a calendar date maps to, given the cycle's
 * anchor (Day 1 / Week 1 Monday) and length. Returns null on weekends.
 * For a 10-day cycle, week parity relative to the anchor decides Week 1 vs 2.
 */
export function cycleDayIndexForDate(
  date: Date,
  anchorIso: string,
  cycleType: 5 | 10
): number | null {
  const mi = mondayIndex(date);
  if (mi === null) return null;
  if (cycleType === 5) return mi;

  const anchorMonday = mondayOf(new Date(anchorIso));
  const targetMonday = mondayOf(date);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeks = Math.round((targetMonday.getTime() - anchorMonday.getTime()) / msPerWeek);
  const parity = ((weeks % 2) + 2) % 2;
  return parity * 5 + mi;
}

/**
 * Next calendar date (starting today) whose cycle dayIndex is one of
 * `matchIndices`, given the cycle anchor. null if none in the next 3 weeks.
 */
export function nextCycleClassDate(
  anchorIso: string,
  cycleType: 5 | 10,
  matchIndices: number[]
): Date | null {
  if (matchIndices.length === 0) return null;
  const set = new Set(matchIndices);
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 21; i++) {
    const idx = cycleDayIndexForDate(cursor, anchorIso, cycleType);
    if (idx !== null && set.has(idx)) return new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

export function nextOccurrenceOfWeekday(weekdayName: string): Date {
  const targetIdx = WEEKDAY_NAMES.indexOf(weekdayName);
  const now = new Date();
  const result = new Date(now);
  let diff = targetIdx - now.getDay();
  if (diff < 0) diff += 7;
  result.setDate(now.getDate() + diff);
  return result;
}

export function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  return monday;
}

/** Monday–Friday dates for the week `weekOffset` weeks after the current week. */
export function getWeekdayDates(weekOffset: number): Date[] {
  const monday = getMondayOfCurrentWeek();
  monday.setDate(monday.getDate() + weekOffset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatWeekdayShort(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/** "08:00" (24hr) -> "8:00 AM" */
export function formatTimeLabel(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** 24hr "HH:mm" -> Date object (today's date, given time) for feeding a time picker. */
export function time24ToDate(time24: string): Date {
  const d = new Date();
  if (time24) {
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      d.setHours(h, m, 0, 0);
      return d;
    }
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Date object -> 24hr "HH:mm" */
export function dateToTime24(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/** Total seconds → "21h 15m" (hours unpadded, minutes 2-digit). */
export function formatStudyHM(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Total seconds → "320h 22m 31s". */
export function formatStudyHMS(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export function formatSessionDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function formatTimerClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
