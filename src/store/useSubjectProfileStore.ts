import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LessonContent, LessonMap, SubjectProfile } from '../types';

/**
 * One profile per subject: the textbook it's taught from, what the scan found
 * in that book, the student's next test, and the lesson map built from all of
 * it. Keyed by subject name, the same key the rest of the app uses.
 */
interface SubjectProfileState {
  bySubject: Record<string, SubjectProfile>;
  getProfile: (subjectName: string) => SubjectProfile | undefined;
  hasProfile: (subjectName: string) => boolean;
  saveProfile: (profile: SubjectProfile) => void;
  setLessonMap: (subjectName: string, map: LessonMap) => void;
  setLessonContent: (subjectName: string, lessonId: string, content: LessonContent) => void;
  toggleLessonComplete: (subjectName: string, lessonId: string) => void;
  /**
   * Record a finished lesson and how well it went, once.
   *
   * A lesson that has already been scored keeps its first score, so its XP
   * can't be farmed by running the questions again.
   */
  completeLesson: (subjectName: string, lessonId: string, accuracy: number) => void;
  /** Keep a question for another look later, or drop it from the queue. */
  toggleFlagged: (subjectName: string, lessonId: string, questionIndex: number) => void;
  isFlagged: (subjectName: string, lessonId: string, questionIndex: number) => boolean;
  deleteProfile: (subjectName: string) => void;
}

export const useSubjectProfileStore = create<SubjectProfileState>()(
  persist(
    (set, get) => ({
      bySubject: {},

      getProfile: (subjectName) => get().bySubject[subjectName],

      // A profile only counts once it has a scanned book behind it — a
      // half-finished wizard shouldn't make the subject look done.
      hasProfile: (subjectName) => Boolean(get().bySubject[subjectName]?.scan?.units?.length),

      saveProfile: (profile) =>
        set((state) => ({
          bySubject: { ...state.bySubject, [profile.subjectName]: profile },
        })),

      setLessonMap: (subjectName, lessonMap) =>
        set((state) => {
          const existing = state.bySubject[subjectName];
          if (!existing) return state;
          return {
            bySubject: { ...state.bySubject, [subjectName]: { ...existing, lessonMap } },
          };
        }),

      setLessonContent: (subjectName, lessonId, content) =>
        set((state) => {
          const existing = state.bySubject[subjectName];
          if (!existing) return state;
          return {
            bySubject: {
              ...state.bySubject,
              [subjectName]: {
                ...existing,
                lessonContent: { ...existing.lessonContent, [lessonId]: content },
              },
            },
          };
        }),

      toggleFlagged: (subjectName, lessonId, questionIndex) =>
        set((state) => {
          const existing = state.bySubject[subjectName];
          if (!existing) return state;
          const flagged = existing.flagged ?? [];
          const at = flagged.findIndex(
            (f) => f.lessonId === lessonId && f.questionIndex === questionIndex
          );
          return {
            bySubject: {
              ...state.bySubject,
              [subjectName]: {
                ...existing,
                flagged:
                  at >= 0
                    ? flagged.filter((_, i) => i !== at)
                    : [...flagged, { lessonId, questionIndex, flaggedAt: Date.now() }],
              },
            },
          };
        }),

      isFlagged: (subjectName, lessonId, questionIndex) =>
        (get().bySubject[subjectName]?.flagged ?? []).some(
          (f) => f.lessonId === lessonId && f.questionIndex === questionIndex
        ),

      toggleLessonComplete: (subjectName, lessonId) =>
        set((state) => {
          const existing = state.bySubject[subjectName];
          if (!existing) return state;
          const done = existing.completedLessonIds.includes(lessonId);
          return {
            bySubject: {
              ...state.bySubject,
              [subjectName]: {
                ...existing,
                completedLessonIds: done
                  ? existing.completedLessonIds.filter((id) => id !== lessonId)
                  : [...existing.completedLessonIds, lessonId],
              },
            },
          };
        }),

      completeLesson: (subjectName, lessonId, accuracy) =>
        set((state) => {
          const existing = state.bySubject[subjectName];
          if (!existing) return state;
          const scores = existing.lessonScores ?? {};
          // First score stands. Re-running the questions is good revision and
          // costs nothing, but it must not pay out twice.
          const alreadyScored = scores[lessonId] !== undefined;
          return {
            bySubject: {
              ...state.bySubject,
              [subjectName]: {
                ...existing,
                completedLessonIds: existing.completedLessonIds.includes(lessonId)
                  ? existing.completedLessonIds
                  : [...existing.completedLessonIds, lessonId],
                lessonScores: alreadyScored
                  ? scores
                  : { ...scores, [lessonId]: Math.max(0, Math.min(1, accuracy)) },
              },
            },
          };
        }),

      deleteProfile: (subjectName) =>
        set((state) => {
          const next = { ...state.bySubject };
          delete next[subjectName];
          return { bySubject: next };
        }),
    }),
    {
      name: 'studyflow-subject-profiles',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
