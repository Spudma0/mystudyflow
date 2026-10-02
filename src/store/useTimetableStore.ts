import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClassEntry, CycleType, DaySchedule, Timetable } from '../types';

interface SubjectSummary {
  name: string;
  color: string;
  room: string;
  teacher: string;
}

interface TimetableState {
  timetable: Timetable | null;
  /** Calendar date (ISO) of Day 1 / Week 1 Monday — anchors the cycle to real dates. */
  cycleStartDate: string | null;
  createTimetable: (cycleType: CycleType) => void;
  setDayClasses: (dayIndex: number, classes: ClassEntry[]) => void;
  replaceDays: (days: DaySchedule[], cycleType: CycleType) => void;
  setCycleStartDate: (isoDate: string | null) => void;
  deleteAll: () => void;
  getSubjects: () => SubjectSummary[];
  getClassesForWeekday: (weekdayName: string) => ClassEntry[];
  /** Which cycle day a real date falls on, or null at the weekend / with no timetable. */
  getCycleDayIndex: (date: Date) => number | null;
  /** Classes on a real calendar date — resolves 10-day cycles via the cycle start. */
  getClassesForDate: (date: Date) => ClassEntry[];
  getNextOccurrence: (subjectName: string) => { dayLabel: string; dayIndex: number } | null;
}

const FIVE_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * Signed number of school days (Mon–Fri) from `from` to `to`. Negative when the
 * target is before the start, so a cycle that begins in the future still maps
 * today onto a cycle day — the pattern repeats in both directions.
 */
function weekdayOffset(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  const sign = b >= a ? 1 : -1;
  const lo = sign > 0 ? a : b;
  const hi = sign > 0 ? b : a;
  let n = 0;
  const cur = new Date(lo);
  // Guard against a nonsense date dragging this into a long loop.
  for (let i = 0; cur < hi && i < 4000; i += 1) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return n * sign;
}

function buildEmptyDays(cycleType: CycleType): DaySchedule[] {
  const labels =
    cycleType === 5 ? FIVE_DAY_LABELS : Array.from({ length: 10 }, (_, i) => `Day ${i + 1}`);
  return labels.map((dayLabel, dayIndex) => ({ dayIndex, dayLabel, classes: [] }));
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set, get) => ({
      timetable: null,
      cycleStartDate: null,

      createTimetable: (cycleType) =>
        set({
          timetable: {
            cycleType,
            days: buildEmptyDays(cycleType),
            createdAt: Date.now(),
          },
        }),

      setDayClasses: (dayIndex, classes) =>
        set((state) => {
          if (!state.timetable) return state;
          const days = state.timetable.days.map((d) =>
            d.dayIndex === dayIndex ? { ...d, classes } : d
          );
          return { timetable: { ...state.timetable, days } };
        }),

      replaceDays: (days, cycleType) =>
        set({ timetable: { cycleType, days, createdAt: Date.now() } }),

      setCycleStartDate: (isoDate) => set({ cycleStartDate: isoDate }),

      deleteAll: () => set({ timetable: null, cycleStartDate: null }),

      getSubjects: () => {
        const t = get().timetable;
        if (!t) return [];
        const map = new Map<string, SubjectSummary>();
        t.days.forEach((day) => {
          day.classes.forEach((c) => {
            if (!c.name.trim()) return;
            if (!map.has(c.name)) {
              map.set(c.name, { name: c.name, color: c.color, room: c.room, teacher: c.teacher });
            }
          });
        });
        return Array.from(map.values());
      },

      getClassesForWeekday: (weekdayName) => {
        const t = get().timetable;
        if (!t || t.cycleType !== 5) return [];
        const day = t.days.find((d) => d.dayLabel === weekdayName);
        return day ? day.classes : [];
      },

      // The single source of truth for "what cycle day is this date?" — both the
      // home screen and the timetable page resolve through here, so they can't
      // disagree about which day a date belongs to.
      getCycleDayIndex: (date) => {
        const t = get().timetable;
        if (!t) return null;
        const dow = date.getDay();
        if (dow === 0 || dow === 6) return null; // no school at the weekend

        if (t.cycleType === 5) return dow - 1;

        // A 10-day cycle needs Day 1 pinned to a real date. Until it is, fall
        // back to Mon–Fri = Days 1–5 so the week still shows something.
        const startIso = get().cycleStartDate;
        if (!startIso) return dow - 1;
        const offset = weekdayOffset(new Date(startIso), date);
        return ((offset % t.days.length) + t.days.length) % t.days.length;
      },

      getClassesForDate: (date) => {
        const t = get().timetable;
        const index = get().getCycleDayIndex(date);
        if (!t || index === null) return [];
        const day = t.days.find((d) => d.dayIndex === index);
        return day ? day.classes : [];
      },

      getNextOccurrence: (subjectName) => {
        const t = get().timetable;
        if (!t) return null;
        for (let offset = 0; offset < t.days.length; offset++) {
          const idx = offset % t.days.length;
          const day = t.days[idx];
          if (day.classes.some((c) => c.name === subjectName)) {
            return { dayLabel: day.dayLabel, dayIndex: day.dayIndex };
          }
        }
        return null;
      },
    }),
    {
      name: 'studyflow-timetable',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
