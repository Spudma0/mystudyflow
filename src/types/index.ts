export type CycleType = 5 | 10;

export interface ClassEntry {
  id: string;
  name: string;
  color: string;
  room: string;
  teacher: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export interface DaySchedule {
  dayIndex: number; // 0-based within the cycle
  dayLabel: string; // "Monday", "Day 1", etc.
  classes: ClassEntry[];
}

export interface Timetable {
  cycleType: CycleType;
  days: DaySchedule[];
  createdAt: number;
}

export type ReminderCategory = 'Exam' | 'Assignment' | 'Personal';

export interface Reminder {
  id: string;
  title: string;
  subject: string;
  category: ReminderCategory;
  dueDate: string; // ISO datetime — for repeating reminders only the time-of-day matters
  enabled: boolean;
  done?: boolean; // checked off via the checklist checkbox
  testName?: string;
  /** Personal reminders only: repeats every day at `dueDate`'s time, with no due date. */
  repeating?: boolean;
}


export interface PracticeProblemEntry {
  id: string;
  createdAt: number;
  imageUri: string;
  note?: string;
}

export interface StudySession {
  id: string;
  subjectName: string;
  startedAt: number;
  endedAt: number;
  durationSec: number; // actual studied seconds (excludes breaks)
  topic?: string;
  breakCount?: number;
  breakSec?: number; // total seconds spent on breaks
  noteImageUris?: string[]; // photos of notes captured in the summary
}

export interface SubjectData {
  practiceProblems: PracticeProblemEntry[];
  studySessions: StudySession[];
}

// ---- Subject profile: the textbook a subject is taught from, and the study
// plan generated from it. One profile per subject name. ----

export interface TextbookUnit {
  title: string;
  summary: string;
  topics: string[];
}

export interface Textbook {
  title: string;
  authors: string;
  edition: string;
  publisher: string;
  year: string;
  /** How sure the scan was that it found the right book. */
  confidence: 'high' | 'medium' | 'low' | string;
  overview: string;
}

export interface TextbookScan {
  book: Textbook;
  units: TextbookUnit[];
  notes: string;
  sources: { title: string; url: string }[];
}

export interface SubjectExamInfo {
  hasExam: boolean;
  /** What the test covers, in the student's own words. */
  topicArea: string;
  /** Whether the test material comes from the textbook. */
  fromTextbook: boolean;
  /** ISO date of the test, when they gave one. */
  date: string | null;
}

export interface Lesson {
  id: string;
  title: string;
  focus: string;
  objectives: string[];
  durationMin: number;
  /** Which textbook unit this lesson draws on. */
  unitTitle: string;
  /**
   * The textbook topic this lesson teaches, copied verbatim from the scan.
   * Stable across students and runs, which is what lets the written lesson be
   * shared rather than regenerated for each person.
   */
  topic: string;
}

export interface LessonQuestion {
  prompt: string;
  /** Multiple-choice options, or null when a written answer is wanted. */
  choices: string[] | null;
  answer: string;
  explanation: string;
  /** 1 (warm-up) to 5 (hardest), rising through the set. */
  difficulty: number;
  /**
   * The question expects a calculator or CAS — the exam's "technology active"
   * section. Optional: lessons written before this existed don't carry it, and
   * are labelled from the wording of the question instead.
   */
  technologyActive?: boolean;
  /** A function worth plotting beside the question, e.g. "y = x^2 - 4x + 3". */
  graph?: string | null;
}

/**
 * The lesson itself: what's taught, then what's asked.
 *
 * The three named blocks are optional because lessons written before they
 * existed don't carry them — those are re-presented from `sections` and `tips`
 * instead, so no lesson has to be regenerated.
 */
export interface LessonContent {
  sections: { heading: string; body: string; keyPoints: string[] }[];
  worked: { problem: string; steps: string[]; answer: string }[];
  tips: string[];
  examTips: string[];
  questions: LessonQuestion[];
  /** The vocabulary the lesson depends on, stated precisely. */
  coreTerms?: string[];
  /** What actually trips students up here. */
  commonMistakes?: string[];
  /** Formulas worth having to hand, each written to stand on its own line. */
  keyFormulas?: string[];
  /** Functions worth seeing plotted, e.g. ["y = x^2", "y = 2x + 3"]. */
  graphs?: string[];
  /** Molecules worth seeing drawn, as SMILES with a caption. */
  structures?: { smiles: string; caption: string }[];
}

/** A question the student kept for another look. */
export interface FlaggedQuestion {
  lessonId: string;
  questionIndex: number;
  flaggedAt: number;
}

export interface LessonMap {
  title: string;
  summary: string;
  lessons: Lesson[];
  generatedAt: number;
}

export interface SubjectProfile {
  subjectName: string;
  /** What the student typed, before the scan cleaned it up. */
  textbookQuery: { title: string; author: string; edition: string };
  scan: TextbookScan;
  exam: SubjectExamInfo;
  /**
   * With no test on the horizon, the area they chose to go deep on instead.
   * Empty when they are preparing for a test, or working through the course.
   */
  focusArea?: string;
  lessonMap: LessonMap | null;
  /** Lesson body + questions, keyed by lesson id. Written as the plan is built. */
  lessonContent: Record<string, LessonContent>;
  completedLessonIds: string[];
  /**
   * How well each finished lesson went, 0–1, keyed by lesson id.
   *
   * Written once, on the first completion: the XP a lesson is worth is derived
   * from this, so letting a retake overwrite it would let the same lesson pay
   * out again. Absent for lessons finished before scoring existed, which fall
   * back to full marks rather than being retrospectively docked.
   */
  lessonScores?: Record<string, number>;
  /** Questions kept for review, newest last. */
  flagged: FlaggedQuestion[];
  completedAt: number;
}
