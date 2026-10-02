import { ClassEntry, DaySchedule, Reminder, StudySession, SubjectData } from '../types';
import { useTimetableStore } from '../store/useTimetableStore';
import { useRemindersStore } from '../store/useRemindersStore';
import { useSubjectDataStore } from '../store/useSubjectDataStore';
import { useWidgetsStore, WidgetId } from '../store/useWidgetsStore';
import { useSubjectProfileStore } from '../store/useSubjectProfileStore';
import { useThemeStore } from '../store/useThemeStore';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Fills the app with a term's worth of believable data, for demonstrating it.
 *
 * Everything is written through the live stores rather than into storage
 * directly, so the normal sync picks the changes up and pushes them to the
 * account — run this on one device and the others catch up.
 *
 * Deliberately *not* touched: subject profiles. The generated study plans for
 * Math and `test` are real work and expensive to rebuild, so the timetable is
 * built around those two names and no profile is created or removed.
 */

// --- Determinism -----------------------------------------------------------
// A fixed seed means re-running produces the same week, so a demo looks the
// same twice and nothing drifts between screenshots.
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

// --- The timetable ---------------------------------------------------------

interface SubjectDef {
  name: string;
  color: string;
  room: string;
  teacher: string;
}

/**
 * `Math` and `test` are spelled exactly as the existing subject profiles are,
 * because a subject only finds its study plan by name.
 */
const SUBJECTS: SubjectDef[] = [
  { name: 'Math', color: '#8B5CF6', room: 'B12', teacher: 'Mr Whitlock' },
  { name: 'test', color: '#22C55E', room: 'Lab 3', teacher: 'Ms Farrow' },
  { name: 'English', color: '#3B82F6', room: 'A7', teacher: 'Ms Devlin' },
  { name: 'Chemistry', color: '#F59E0B', room: 'Lab 1', teacher: 'Dr Nashiro' },
  { name: 'History', color: '#EC4899', room: 'C4', teacher: 'Mr Callaghan' },
  { name: 'Japanese', color: '#F97316', room: 'D2', teacher: 'Ms Ito' },
  { name: 'PE', color: '#14B8A6', room: 'Gym', teacher: 'Mr Osei' },
  { name: 'Visual Art', color: '#06B6D4', room: 'Art Studio', teacher: 'Ms Brenner' },
];

const SUBJECT_BY_NAME = new Map(SUBJECTS.map((s) => [s.name, s]));

/** Five periods a day, either side of recess and lunch. */
const PERIODS: { start: string; end: string }[] = [
  { start: '08:50', end: '09:50' },
  { start: '09:50', end: '10:50' },
  { start: '11:10', end: '12:10' },
  { start: '12:10', end: '13:10' },
  { start: '14:00', end: '15:00' },
];

/** The fortnight, one row per cycle day, one entry per period. */
const CYCLE: string[][] = [
  ['Math', 'English', 'Chemistry', 'test', 'PE'],
  ['English', 'History', 'Math', 'Japanese', 'Visual Art'],
  ['test', 'Chemistry', 'English', 'Math', 'History'],
  ['Japanese', 'Math', 'test', 'English', 'Chemistry'],
  ['History', 'PE', 'Math', 'Chemistry', 'Japanese'],
  ['English', 'Math', 'test', 'Visual Art', 'History'],
  ['Chemistry', 'test', 'English', 'Japanese', 'Math'],
  ['Math', 'English', 'History', 'PE', 'Visual Art'],
  ['test', 'Japanese', 'Chemistry', 'Math', 'English'],
  ['English', 'Chemistry', 'Japanese', 'PE', 'test'],
];

function buildTimetable(): DaySchedule[] {
  return CYCLE.map((names, dayIndex) => ({
    dayIndex,
    dayLabel: `Day ${dayIndex + 1}`,
    classes: names.map((name, period): ClassEntry => {
      const subject = SUBJECT_BY_NAME.get(name)!;
      return {
        id: `class-showcase-${dayIndex}-${period}`,
        name: subject.name,
        color: subject.color,
        room: subject.room,
        teacher: subject.teacher,
        startTime: PERIODS[period].start,
        endTime: PERIODS[period].end,
      };
    }),
  }));
}

// --- Study history ---------------------------------------------------------

/** Nine weeks back, which is about a term. */
const HISTORY_DAYS = 63;
/** The tail that has no gaps, so the streak on the home screen means something. */
const UNBROKEN_TAIL = 16;

/** Roughly how often each subject gets picked — the two with plans dominate. */
const WEIGHTS: [string, number][] = [
  ['Math', 30],
  ['test', 21],
  ['Chemistry', 15],
  ['English', 13],
  ['History', 8],
  ['Japanese', 7],
  ['Visual Art', 3],
  ['PE', 3],
];

const WEIGHT_TOTAL = WEIGHTS.reduce((n, [, w]) => n + w, 0);

function pickSubject(random: () => number): string {
  let roll = random() * WEIGHT_TOTAL;
  for (const [name, weight] of WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return WEIGHTS[0][0];
}

/**
 * Sessions across the term, evenings and weekend afternoons.
 *
 * Every subject in the timetable gets some, whether or not it has a study plan
 * — the hours are the point, not the plan.
 */
function buildStudyHistory(): Record<string, SubjectData> {
  const random = makeRandom(20260930);
  const bySubject: Record<string, SubjectData> = {};
  SUBJECTS.forEach((s) => {
    bySubject[s.name] = { practiceProblems: [], studySessions: [] };
  });

  // Every subject is guaranteed at least one session, so no subject page is
  // empty even if the weighting never rolls its way.
  const owed = new Set(SUBJECTS.map((s) => s.name));

  for (let back = HISTORY_DAYS - 1; back >= 0; back -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - back);
    day.setHours(0, 0, 0, 0);

    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const recent = back < UNBROKEN_TAIL;
    // Older weeks have the odd day off; the recent run never does.
    if (!recent && random() < (weekend ? 0.45 : 0.18)) continue;

    const sessions = 1 + (random() < (weekend ? 0.7 : 0.45) ? 1 : 0) + (random() < 0.2 ? 1 : 0);
    // Weekends start after lunch, school nights after dinner.
    let cursor = weekend ? 13 * 60 + 30 : 17 * 60 + 30;
    cursor += Math.floor(random() * 50);

    for (let i = 0; i < sessions; i += 1) {
      const name = owed.size ? [...owed][0] : pickSubject(random);
      owed.delete(name);

      const minutes = 20 + Math.round(random() * 55);
      const breakCount = minutes > 45 ? 1 + (random() < 0.35 ? 1 : 0) : random() < 0.25 ? 1 : 0;
      const breakSec = breakCount * (240 + Math.round(random() * 240));

      const startedAt = new Date(day).setMinutes(cursor);
      const endedAt = startedAt + minutes * 60 * 1000 + breakSec * 1000;

      bySubject[name].studySessions.unshift({
        id: `session-showcase-${back}-${i}`,
        subjectName: name,
        startedAt,
        endedAt,
        durationSec: minutes * 60,
        breakCount,
        breakSec,
      } satisfies StudySession);

      cursor += minutes + Math.round(breakSec / 60) + 10 + Math.round(random() * 25);
    }
  }

  // Newest first, matching what `logStudySession` builds up over time.
  Object.values(bySubject).forEach((d) => d.studySessions.sort((a, b) => b.endedAt - a.endedAt));
  return bySubject;
}

// --- Reminders -------------------------------------------------------------

/** `days` from today at `hour`, as an ISO string. */
function at(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function buildReminders(): Reminder[] {
  const make = (
    n: number,
    title: string,
    subject: string,
    category: Reminder['category'],
    dueDate: string,
    extra: Partial<Reminder> = {}
  ): Reminder => ({
    id: `reminder-showcase-${n}`,
    title,
    subject,
    category,
    dueDate,
    enabled: true,
    done: false,
    ...extra,
  });

  return [
    make(1, 'Methods Unit 2 SAC', 'Math', 'Exam', at(6, 9, 0), {
      testName: 'Application task — rates of change',
    }),
    make(2, 'Unit 2 topic test', 'test', 'Exam', at(12, 11, 10), {
      testName: 'Cell structure and membrane transport',
    }),
    make(3, 'Chemistry practical assessment', 'Chemistry', 'Exam', at(23, 9, 50), {
      testName: 'Rates of reaction prac',
    }),
    make(4, 'English text response draft', 'English', 'Assignment', at(2, 23, 59)),
    make(5, 'History source analysis', 'History', 'Assignment', at(9, 23, 59)),
    make(6, 'Japanese oral — record practice run', 'Japanese', 'Assignment', at(15, 20, 0)),
    make(7, 'Visual Art folio checkpoint', 'Visual Art', 'Assignment', at(19, 16, 0)),
    make(8, 'Review flashcards', '', 'Personal', at(0, 19, 30), { repeating: true }),
    make(9, 'Pack PE uniform', '', 'Personal', at(1, 7, 30)),
    // A couple already dealt with, so the completed side of the list isn't bare.
    make(10, 'Chemistry problem set 4', 'Chemistry', 'Assignment', at(-3, 23, 59), { done: true }),
    make(11, 'English essay plan', 'English', 'Assignment', at(-6, 23, 59), { done: true }),
    make(12, 'Methods worksheet 7B', 'Math', 'Assignment', at(-9, 23, 59), { done: true }),
  ];
}

// --- The theme -------------------------------------------------------------

/**
 * All three are palette entries, so the pickers on the profile screen show the
 * chosen swatch rather than nothing. The accent has to be a dark colour: text
 * on the home tile is picked for contrast against it, and a light accent
 * leaves dark labels sitting on the dark half of the gradient.
 */
const SHOWCASE_THEME = {
  /** Top-left of the home tile, buttons, rings, every highlight. */
  accent: '#EC4899',
  /** Page background and the bottom-right of the tile gradient. */
  base: '#0A0A0F',
  /** Cards and button surfaces. */
  card: '#241A2E',
};

const SHOWCASE_WIDGETS: WidgetId[] = [
  'clock',
  'analogClock',
  'date',
  'checklist',
  'streak',
  'exam',
  'classesLeft',
];

// --- Renaming --------------------------------------------------------------

/**
 * Renames a subject everywhere it appears.
 *
 * A subject has no id — its name is the key that ties the timetable, the study
 * history, the reminders and the generated study plan together — so renaming
 * means rewriting all four at once. Doing it any other way orphans the plan,
 * which is expensive to rebuild.
 */
export function renameSubject(from: string, to: string): string {
  if (!from || !to || from === to) return 'nothing to do';

  const timetable = useTimetableStore.getState().timetable;
  if (timetable) {
    useTimetableStore.getState().replaceDays(
      timetable.days.map((day) => ({
        ...day,
        classes: day.classes.map((c) => (c.name === from ? { ...c, name: to } : c)),
      })),
      timetable.cycleType
    );
  }

  const data = { ...useSubjectDataStore.getState().bySubject };
  if (data[from]) {
    data[to] = {
      ...data[from],
      studySessions: data[from].studySessions.map((s) => ({ ...s, subjectName: to })),
    };
    delete data[from];
    useSubjectDataStore.setState({ bySubject: data });
  }

  const profiles = { ...useSubjectProfileStore.getState().bySubject };
  if (profiles[from]) {
    profiles[to] = { ...profiles[from], subjectName: to };
    delete profiles[from];
    useSubjectProfileStore.setState({ bySubject: profiles });
  }

  useRemindersStore.setState({
    reminders: useRemindersStore
      .getState()
      .reminders.map((r) => (r.subject === from ? { ...r, subject: to } : r)),
  });

  return `renamed "${from}" to "${to}"`;
}

// --- Entry point -----------------------------------------------------------

/**
 * Replaces the timetable, reminders, study history, widgets and theme.
 *
 * Returns a one-line summary so whoever ran it can see it did something.
 */
export async function seedShowcase(): Promise<string> {
  const days = buildTimetable();
  useTimetableStore.getState().replaceDays(days, 10);
  // Anchor Day 1 to the Monday of this week so the cycle lines up with real
  // dates rather than starting wherever the old data happened to start.
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  useTimetableStore.getState().setCycleStartDate(monday.toISOString());

  const bySubject = buildStudyHistory();
  useSubjectDataStore.setState({ bySubject });

  const reminders = buildReminders();
  useRemindersStore.setState({ reminders });

  useWidgetsStore.setState({ widgets: SHOWCASE_WIDGETS });

  const theme = useThemeStore.getState();
  theme.setAccentColor(SHOWCASE_THEME.accent);
  theme.setBaseColor(SHOWCASE_THEME.base);
  theme.setCardColor(SHOWCASE_THEME.card);

  // Saved on the profile too, so the colours follow the account onto another
  // device instead of living only on this one.
  await useAuthStore
    .getState()
    .saveProfile({
      school: 'Riverwood Secondary College',
      accent_color: SHOWCASE_THEME.accent,
      base_color: SHOWCASE_THEME.base,
      card_color: SHOWCASE_THEME.card,
    })
    .catch(() => false);

  const sessions = Object.values(bySubject).reduce((n, d) => n + d.studySessions.length, 0);
  const hours = Object.values(bySubject).reduce(
    (n, d) => n + d.studySessions.reduce((m, s) => m + s.durationSec, 0),
    0
  );
  return `${SUBJECTS.length} subjects · ${sessions} study sessions · ${Math.round(
    hours / 3600
  )}h logged · ${reminders.length} reminders`;
}
