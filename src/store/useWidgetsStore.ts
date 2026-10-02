import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Every widget that can sit in the home tile's customisable strip. */
export type WidgetId =
  | 'streak'
  | 'exam'
  | 'classesLeft'
  | 'studyToday'
  | 'nextLesson'
  | 'clock'
  | 'analogClock'
  | 'date'
  | 'checklist'
  | 'examFocus';

export type WidgetSpan = 'third' | 'half' | 'full';

/** How many widgets of each span share a row. */
export const SPAN_CAPACITY: Record<WidgetSpan, number> = { third: 3, half: 2, full: 1 };

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  subtitle: string;
  icon: string;
  span: WidgetSpan;
  /**
   * Width to use once there is a tablet's worth of room. A third of an iPad is
   * wider than a whole phone, so widgets that need a full row on a phone fit a
   * single cell there.
   */
  tabletSpan?: WidgetSpan;
  /**
   * The widget paints its own card. Without this the strip wraps it in the
   * standard centred stat tile, which is wrong for anything with its own
   * heading or padding.
   */
  bare?: boolean;
}

/** The width a widget should use at the current screen size. */
export function spanFor(meta: WidgetMeta, tablet: boolean): WidgetSpan {
  return (tablet && meta.tabletSpan) || meta.span;
}

export const WIDGET_CATALOGUE: WidgetMeta[] = [
  {
    id: 'streak',
    title: 'Day streak',
    subtitle: 'Consecutive days you have studied',
    icon: 'flame-outline',
    span: 'third',
  },
  {
    id: 'exam',
    title: 'Next exam',
    subtitle: 'Days until your soonest exam',
    icon: 'school-outline',
    span: 'third',
  },
  {
    id: 'classesLeft',
    title: 'Classes left',
    subtitle: 'Lessons still to come today',
    icon: 'layers-outline',
    span: 'third',
  },
  {
    id: 'studyToday',
    title: 'Studied today',
    subtitle: 'Minutes logged since midnight',
    icon: 'hourglass-outline',
    span: 'third',
  },
  {
    id: 'nextLesson',
    title: 'Lesson countdown',
    subtitle: 'Full-width timer until your next lesson',
    icon: 'timer-outline',
    span: 'full',
    tabletSpan: 'third',
    bare: true,
  },
  {
    id: 'clock',
    title: 'Clock',
    subtitle: 'The time, with the weather where you are',
    icon: 'time-outline',
    span: 'third',
  },
  {
    id: 'analogClock',
    title: 'Clock face',
    subtitle: 'A round dial with hour and minute hands',
    icon: 'alarm-outline',
    span: 'third',
  },
  {
    id: 'date',
    title: 'Date',
    subtitle: "Today's weekday, month and day",
    icon: 'calendar-outline',
    span: 'third',
    bare: true,
  },
  {
    id: 'examFocus',
    title: 'Exam countdown',
    subtitle: 'An exam you pick, counting down',
    icon: 'trophy-outline',
    span: 'full',
    tabletSpan: 'third',
    bare: true,
  },
  {
    id: 'checklist',
    title: 'Check list',
    subtitle: 'The next couple of reminders due',
    icon: 'checkbox-outline',
    span: 'full',
    tabletSpan: 'third',
    bare: true,
  },
];

export const WIDGET_META: Record<WidgetId, WidgetMeta> = WIDGET_CATALOGUE.reduce(
  (acc, w) => ({ ...acc, [w.id]: w }),
  {} as Record<WidgetId, WidgetMeta>
);

const DEFAULT_WIDGETS: WidgetId[] = ['streak', 'exam', 'classesLeft'];

interface WidgetsState {
  /** Enabled widgets, in the order they're laid out. */
  widgets: WidgetId[];
  /**
   * Reminder id of the exam pinned to the countdown widget. Null means show
   * whichever is soonest.
   */
  pinnedExamId: string | null;
  setPinnedExam: (id: string | null) => void;
  toggleWidget: (id: WidgetId) => void;
  /** Shifts a widget one slot earlier (-1) or later (+1) in the strip. */
  moveWidget: (id: WidgetId, direction: -1 | 1) => void;
  resetWidgets: () => void;
}

export const useWidgetsStore = create<WidgetsState>()(
  persist(
    (set, get) => ({
      widgets: DEFAULT_WIDGETS,
      pinnedExamId: null,

      setPinnedExam: (id) => set({ pinnedExamId: id }),

      toggleWidget: (id) =>
        set((state) => {
          if (state.widgets.includes(id)) {
            // The strip never empties — the last widget can't be switched off.
            if (state.widgets.length === 1) return state;
            return { widgets: state.widgets.filter((w) => w !== id) };
          }
          return { widgets: [...state.widgets, id] };
        }),

      moveWidget: (id, direction) =>
        set((state) => {
          const from = state.widgets.indexOf(id);
          const to = from + direction;
          if (from < 0 || to < 0 || to >= state.widgets.length) return state;
          const next = [...state.widgets];
          [next[from], next[to]] = [next[to], next[from]];
          return { widgets: next };
        }),

      resetWidgets: () => set({ widgets: DEFAULT_WIDGETS }),
    }),
    {
      name: 'studyflow-widgets',
      storage: createJSONStorage(() => AsyncStorage),
      // Drop ids from older builds so a renamed widget can't leave a blank slot.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<WidgetsState>)?.widgets;
        const clean = Array.isArray(saved)
          ? saved.filter((id): id is WidgetId => id in WIDGET_META)
          : [];
        return {
          ...current,
          widgets: clean.length ? clean : DEFAULT_WIDGETS,
          pinnedExamId: (persisted as Partial<WidgetsState>)?.pinnedExamId ?? null,
        };
      },
    }
  )
);
