import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PracticeProblemEntry, StudySession, SubjectData } from '../types';

interface SubjectDataState {
  bySubject: Record<string, SubjectData>;
  addPracticeProblem: (subject: string, entry: PracticeProblemEntry) => void;
  logStudySession: (subject: string, session: StudySession) => void;
  getSubjectData: (subject: string) => SubjectData;
  getStreak: (subject: string) => number;
  getOverallStreak: () => number;
  getStudiedSubjectsOn: (date: Date) => string[];
  hasAnySessions: () => boolean;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function allSessions(state: Record<string, SubjectData>): StudySession[] {
  return Object.values(state).flatMap((d) => d.studySessions);
}

function streakFromDays(studyDays: Set<string>): number {
  const cursor = new Date();
  if (!studyDays.has(dayKey(cursor))) {
    // Today not studied yet — start counting from yesterday so an
    // active streak isn't broken before the day is over.
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (studyDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const emptyData: SubjectData = { practiceProblems: [], studySessions: [] };

function ensure(state: Record<string, SubjectData>, subject: string): SubjectData {
  return state[subject] ?? emptyData;
}

export const useSubjectDataStore = create<SubjectDataState>()(
  persist(
    (set, get) => ({
      bySubject: {},

      addPracticeProblem: (subject, entry) =>
        set((state) => {
          const current = ensure(state.bySubject, subject);
          return {
            bySubject: {
              ...state.bySubject,
              [subject]: {
                ...current,
                practiceProblems: [entry, ...current.practiceProblems],
              },
            },
          };
        }),

      logStudySession: (subject, session) =>
        set((state) => {
          const current = ensure(state.bySubject, subject);
          return {
            bySubject: {
              ...state.bySubject,
              [subject]: {
                ...current,
                studySessions: [session, ...current.studySessions],
              },
            },
          };
        }),

      getSubjectData: (subject) => ensure(get().bySubject, subject),

      getStreak: (subject) => {
        const sessions = ensure(get().bySubject, subject).studySessions;
        if (sessions.length === 0) return 0;
        return streakFromDays(new Set(sessions.map((s) => dayKey(new Date(s.endedAt)))));
      },

      getOverallStreak: () => {
        const sessions = allSessions(get().bySubject);
        if (sessions.length === 0) return 0;
        return streakFromDays(new Set(sessions.map((s) => dayKey(new Date(s.endedAt)))));
      },

      getStudiedSubjectsOn: (date) => {
        const key = dayKey(date);
        const sessions = allSessions(get().bySubject)
          .filter((s) => dayKey(new Date(s.endedAt)) === key)
          .sort((a, b) => a.endedAt - b.endedAt);
        const seen: string[] = [];
        for (const s of sessions) {
          if (!seen.includes(s.subjectName)) seen.push(s.subjectName);
        }
        return seen;
      },

      hasAnySessions: () => allSessions(get().bySubject).length > 0,
    }),
    {
      name: 'studyflow-subject-data',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
