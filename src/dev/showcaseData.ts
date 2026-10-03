import { ClassEntry, DaySchedule, Reminder, StudySession, SubjectData } from '../types';
// Type-only, so this module stays free of the store at runtime and can be
// imported by a plain Node script.
import type { WidgetId } from '../store/useWidgetsStore';

/**
 * A term of believable student data, built from nothing but its arguments.
 *
 * Kept apart from the seeder that writes it so it can be built outside the app
 * too — the App Store demo account is filled by a script on a server, where
 * there are no stores to write through and no React to run.
 *
 * Everything here is deterministic: the same subjects produce the same term,
 * every time, so a demo looks the same twice and screenshots don't drift.
 */

// --- Determinism -----------------------------------------------------------

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

export interface SubjectDef {
  name: string;
  color: string;
  room: string;
  teacher: string;
  /** Share of study time, relative to the other subjects. */
  weight: number;
}

/**
 * The showcase subjects.
 *
 * `Math` and `test` are spelled exactly as the existing subject profiles are,
 * because a subject only finds its study plan by name.
 */
export const SHOWCASE_SUBJECTS: SubjectDef[] = [
  { name: 'Math', color: '#8B5CF6', room: 'B12', teacher: 'Mr Whitlock', weight: 30 },
  { name: 'test', color: '#22C55E', room: 'Lab 3', teacher: 'Ms Farrow', weight: 21 },
  { name: 'Chemistry', color: '#F59E0B', room: 'Lab 1', teacher: 'Dr Nashiro', weight: 15 },
  { name: 'English', color: '#3B82F6', room: 'A7', teacher: 'Ms Devlin', weight: 13 },
  { name: 'History', color: '#EC4899', room: 'C4', teacher: 'Mr Callaghan', weight: 8 },
  { name: 'Japanese', color: '#F97316', room: 'D2', teacher: 'Ms Ito', weight: 7 },
  { name: 'Visual Art', color: '#06B6D4', room: 'Art Studio', teacher: 'Ms Brenner', weight: 3 },
  { name: 'PE', color: '#14B8A6', room: 'Gym', teacher: 'Mr Osei', weight: 3 },
];

/**
 * The same, with real subject names.
 *
 * The showcase list carries `test` because that is what one of the generated
 * study plans is called on the developer's own account. An App Store reviewer
 * opening a demo account and finding a subject called "test" would reasonably
 * wonder what else was unfinished, so the demo gets a proper timetable.
 */
export const DEMO_SUBJECTS: SubjectDef[] = SHOWCASE_SUBJECTS.map((s) =>
  s.name === 'Math'
    ? { ...s, name: 'Mathematical Methods' }
    : s.name === 'test'
    ? { ...s, name: 'Biology' }
    : s
);

/** Five periods a day, either side of recess and lunch. */
const PERIODS: { start: string; end: string }[] = [
  { start: '08:50', end: '09:50' },
  { start: '09:50', end: '10:50' },
  { start: '11:10', end: '12:10' },
  { start: '12:10', end: '13:10' },
  { start: '14:00', end: '15:00' },
];

/**
 * The fortnight, by position in the subject list rather than by name, so the
 * same shape of week builds for any set of subjects.
 */
const CYCLE: number[][] = [
  [0, 3, 2, 1, 7],
  [3, 4, 0, 5, 6],
  [1, 2, 3, 0, 4],
  [5, 0, 1, 3, 2],
  [4, 7, 0, 2, 5],
  [3, 0, 1, 6, 4],
  [2, 1, 3, 5, 0],
  [0, 3, 4, 7, 6],
  [1, 5, 2, 0, 3],
  [3, 2, 5, 7, 1],
];

export function buildTimetable(subjects: SubjectDef[] = SHOWCASE_SUBJECTS): DaySchedule[] {
  return CYCLE.map((indices, dayIndex) => ({
    dayIndex,
    dayLabel: `Day ${dayIndex + 1}`,
    classes: indices.map((subjectIndex, period): ClassEntry => {
      const subject = subjects[subjectIndex % subjects.length];
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

function pickSubject(subjects: SubjectDef[], random: () => number): string {
  const total = subjects.reduce((n, s) => n + s.weight, 0);
  let roll = random() * total;
  for (const s of subjects) {
    roll -= s.weight;
    if (roll <= 0) return s.name;
  }
  return subjects[0].name;
}

/**
 * Sessions across the term, evenings and weekend afternoons.
 *
 * Every subject in the timetable gets some, whether or not it has a study plan
 * — the hours are the point, not the plan.
 */
export function buildStudyHistory(
  subjects: SubjectDef[] = SHOWCASE_SUBJECTS
): Record<string, SubjectData> {
  const random = makeRandom(20260930);
  const bySubject: Record<string, SubjectData> = {};
  subjects.forEach((s) => {
    bySubject[s.name] = { practiceProblems: [], studySessions: [] };
  });

  // Every subject is guaranteed at least one session, so no subject page is
  // empty even if the weighting never rolls its way.
  const owed = new Set(subjects.map((s) => s.name));

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
      const name = owed.size ? [...owed][0] : pickSubject(subjects, random);
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

export function buildReminders(subjects: SubjectDef[] = SHOWCASE_SUBJECTS): Reminder[] {
  // By position, so the reminders name whichever subjects were passed in.
  const name = (i: number) => subjects[i % subjects.length].name;

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
    make(1, 'Methods Unit 2 SAC', name(0), 'Exam', at(6, 9, 0), {
      testName: 'Application task — rates of change',
    }),
    make(2, 'Unit 2 topic test', name(1), 'Exam', at(12, 11, 10), {
      testName: 'Cell structure and membrane transport',
    }),
    make(3, 'Chemistry practical assessment', name(2), 'Exam', at(23, 9, 50), {
      testName: 'Rates of reaction prac',
    }),
    make(4, 'English text response draft', name(3), 'Assignment', at(2, 23, 59)),
    make(5, 'History source analysis', name(4), 'Assignment', at(9, 23, 59)),
    make(6, 'Japanese oral — record practice run', name(5), 'Assignment', at(15, 20, 0)),
    make(7, 'Visual Art folio checkpoint', name(6), 'Assignment', at(19, 16, 0)),
    make(8, 'Review flashcards', '', 'Personal', at(0, 19, 30), { repeating: true }),
    make(9, 'Pack PE uniform', '', 'Personal', at(1, 7, 30)),
    // A couple already dealt with, so the completed side of the list isn't bare.
    make(10, 'Chemistry problem set 4', name(2), 'Assignment', at(-3, 23, 59), { done: true }),
    make(11, 'English essay plan', name(3), 'Assignment', at(-6, 23, 59), { done: true }),
    make(12, 'Methods worksheet 7B', name(0), 'Assignment', at(-9, 23, 59), { done: true }),
  ];
}

// --- The theme -------------------------------------------------------------

/**
 * All three are palette entries, so the pickers on the profile screen show the
 * chosen swatch rather than nothing. The accent has to be a dark colour: text
 * on the home tile is picked for contrast against it, and a light accent
 * leaves dark labels sitting on the dark half of the gradient.
 */
export const SHOWCASE_THEME = {
  /** Top-left of the home tile, buttons, rings, every highlight. */
  accent: '#EC4899',
  /** Page background and the bottom-right of the tile gradient. */
  base: '#0A0A0F',
  /** Cards and button surfaces. */
  card: '#241A2E',
};

/**
 * The home strip: the four new widgets alongside the three stat cards.
 *
 * Shared with the demo account, which syncs its layout like any other account,
 * so a reviewer opening the app sees the strip as it is meant to look rather
 * than the three defaults.
 */
export const SHOWCASE_WIDGETS: WidgetId[] = [
  'clock',
  'analogClock',
  'date',
  'checklist',
  'streak',
  'exam',
  'classesLeft',
];

/** The Monday of the current week, where Day 1 of the cycle lands. */
export function thisMonday(): string {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.toISOString();
}
