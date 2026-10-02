import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder, ReminderCategory } from '../types';
import { effectiveDueTime } from '../lib/date';

interface RemindersState {
  reminders: Reminder[];
  addReminder: (input: {
    title: string;
    subject: string;
    category: ReminderCategory;
    dueDate: string;
    enabled: boolean;
    testName?: string;
    repeating?: boolean;
  }) => void;
  updateReminder: (
    id: string,
    input: {
      title: string;
      subject: string;
      category: ReminderCategory;
      dueDate: string;
      enabled: boolean;
      testName?: string;
      repeating?: boolean;
    }
  ) => void;
  deleteReminder: (id: string) => void;
  /** Drops exams whose date has been and gone. */
  pruneExpiredExams: () => void;
  toggleReminder: (id: string) => void;
  toggleDone: (id: string) => void;
  getUpcoming: () => Reminder[];
  getNextExam: () => Reminder | null;
}


export const useRemindersStore = create<RemindersState>()(
  persist(
    (set, get) => ({
      // A new account starts empty — no demo reminders or exams.
      reminders: [],

      addReminder: (input) =>
        set((state) => ({
          reminders: [
            ...state.reminders,
            { id: `reminder-${Date.now()}`, done: false, ...input },
          ],
        })),

      updateReminder: (id, input) =>
        set((state) => ({
          reminders: state.reminders.map((r) => (r.id === id ? { ...r, ...input } : r)),
        })),

      deleteReminder: (id) =>
        set((state) => ({
          reminders: state.reminders.filter((r) => r.id !== id),
        })),

      /**
       * An exam that has been sat is no longer a reminder, so it goes once its
       * date passes. Only exams: an overdue assignment or a personal reminder
       * is still something the student has to do, and deleting those would
       * lose work rather than tidy it away. A date that won't parse is kept,
       * because the one thing worse than a stale exam is a deleted one.
       */
      pruneExpiredExams: () =>
        set((state) => {
          const now = Date.now();
          const kept = state.reminders.filter((r) => {
            if (r.category !== 'Exam' || r.repeating) return true;
            const due = new Date(r.dueDate).getTime();
            return Number.isNaN(due) || due > now;
          });
          return kept.length === state.reminders.length ? state : { reminders: kept };
        }),

      toggleReminder: (id) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r
          ),
        })),

      toggleDone: (id) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, done: !r.done } : r
          ),
        })),

      getUpcoming: () => {
        // Repeating reminders never fall out of the list — they roll to tomorrow.
        return [...get().reminders]
          .filter((r) => r.enabled && !r.done && (r.repeating || new Date(r.dueDate).getTime() > Date.now()))
          .sort((a, b) => effectiveDueTime(a.dueDate, a.repeating) - effectiveDueTime(b.dueDate, b.repeating));
      },

      getNextExam: () => {
        const exams = get()
          .reminders.filter(
            (r) => r.category === 'Exam' && !r.done && new Date(r.dueDate).getTime() > Date.now()
          )
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        return exams[0] ?? null;
      },
    }),
    {
      name: 'studyflow-reminders',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
