import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StudyTopicsState {
  /** User-created, reusable study topics — shown as selectable chips everywhere. */
  topics: string[];
  addTopic: (topic: string) => void;
  removeTopic: (topic: string) => void;
}

export const useStudyTopicsStore = create<StudyTopicsState>()(
  persist(
    (set, get) => ({
      topics: [],
      addTopic: (topic) => {
        const trimmed = topic.trim();
        if (!trimmed) return;
        const exists = get().topics.some((t) => t.toLowerCase() === trimmed.toLowerCase());
        if (exists) return;
        set({ topics: [...get().topics, trimmed] });
      },
      removeTopic: (topic) => set({ topics: get().topics.filter((t) => t !== topic) }),
    }),
    {
      name: 'studyflow-study-topics',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
