import { CycleType } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  StudySession: { subjectName: string };
};

export type RootTabParamList = {
  HomeTab: undefined;
  TimetableTab: undefined;
  SubjectsTab: undefined;
  RemindersTab: undefined;
  ProfileTab: undefined;
};

export type TimetableStackParamList = {
  TimetableHome: { openFormatSheet?: boolean } | undefined;
  DayScheduleEditor: { dayIndex: number; cycleType: CycleType };
  AIImportPreview: { cycleType: CycleType; fileUri: string; mimeType?: string };
  /** The reminder editor, pushed inside this tab so closing it lands back on
   *  the timetable rather than dumping you on the reminders list. */
  AddReminder: { reminderId?: string } | undefined;
};

export type SubjectsStackParamList = {
  SubjectsHome: undefined;
  SubjectDetail: { subjectName: string };
  /** The textbook-scan / lesson-map wizard for one subject. */
  /**
   * `startAt: 'focus'` opens straight at the deep-dive step, for a student who
   * only wants to change what they're focusing on and has already told us
   * which textbook they use.
   */
  SubjectProfile: { subjectName: string; startAt?: 'focus' };
  /** One lesson from a subject's plan: the teaching, then the questions. */
  Lesson: { subjectName: string; lessonId: string };
};

export type RemindersStackParamList = {
  RemindersHome: undefined;
  AddReminder: { reminderId?: string } | undefined;
};

export type HomeStackParamList = {
  HomeHome: undefined;
  StudyBreakdown: undefined;
  StudyCalendar: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
};
