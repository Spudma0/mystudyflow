import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppOpenState {
  /** Start-day key of the streak we last played the ignition burst for. */
  lastStreakIgniteKey: string | null;
  /**
   * True the first time it's called for a given streak (identified by the day
   * the streak began). Records the key so the burst plays once per new streak —
   * not again while that streak is merely being extended.
   */
  consumeStreakIgnite: (streakStartKey: string) => boolean;
}

export const useAppOpenStore = create<AppOpenState>()(
  persist(
    (set, get) => ({
      lastStreakIgniteKey: null,
      consumeStreakIgnite: (streakStartKey) => {
        if (get().lastStreakIgniteKey === streakStartKey) return false;
        set({ lastStreakIgniteKey: streakStartKey });
        return true;
      },
    }),
    {
      name: 'studyflow-app-open',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
