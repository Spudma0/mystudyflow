import { supabase, isSupabaseConfigured } from './supabase';
import { useTimetableStore } from '../store/useTimetableStore';
import { useRemindersStore } from '../store/useRemindersStore';
import { useSubjectDataStore } from '../store/useSubjectDataStore';
import { useStudyTopicsStore } from '../store/useStudyTopicsStore';
import { useSubjectProfileStore } from '../store/useSubjectProfileStore';

/**
 * Sync between the local zustand stores and the `user_data` table.
 *
 * Each store is pushed as one JSON payload keyed by name. On sign-in the remote
 * copy replaces the local one, so signing in on a new phone restores the
 * timetable, reminders and study history. After that, local changes are pushed
 * up (debounced) as the source of truth for that device.
 */

type StoreKey = 'timetable' | 'reminders' | 'subject-data' | 'study-topics' | 'subject-profiles';

// Each entry knows how to read the syncable slice of its store and write it back.
const STORES: {
  key: StoreKey;
  read: () => Record<string, unknown>;
  write: (payload: any) => void;
}[] = [
  {
    key: 'timetable',
    read: () => {
      const s = useTimetableStore.getState();
      return { timetable: s.timetable, cycleStartDate: s.cycleStartDate };
    },
    write: (p) => {
      if (!p.timetable && useTimetableStore.getState().timetable) return;
      useTimetableStore.setState({
        timetable: p.timetable ?? null,
        cycleStartDate: p.cycleStartDate ?? null,
      });
    },
  },
  {
    key: 'reminders',
    read: () => ({ reminders: useRemindersStore.getState().reminders }),
    write: (p) => {
      if (!Array.isArray(p.reminders)) return;
      // An empty remote list is almost always a stale row, not a real deletion
      // of everything — keep what's here rather than emptying the app.
      if (!p.reminders.length && useRemindersStore.getState().reminders.length) return;
      useRemindersStore.setState({ reminders: p.reminders });
    },
  },
  {
    key: 'subject-data',
    read: () => ({ bySubject: useSubjectDataStore.getState().bySubject }),
    // Merged, local first — see pullAll. A remote copy that predates the work
    // on this device must not delete it.
    write: (p) =>
      p.bySubject &&
      useSubjectDataStore.setState({
        bySubject: { ...p.bySubject, ...useSubjectDataStore.getState().bySubject },
      }),
  },
  {
    key: 'study-topics',
    read: () => ({ topics: useStudyTopicsStore.getState().topics }),
    write: (p) => Array.isArray(p.topics) && useStudyTopicsStore.setState({ topics: p.topics }),
  },
  {
    key: 'subject-profiles',
    read: () => ({ bySubject: useSubjectProfileStore.getState().bySubject }),
    write: (p) =>
      p.bySubject &&
      useSubjectProfileStore.setState({
        bySubject: { ...p.bySubject, ...useSubjectProfileStore.getState().bySubject },
      }),
  },
];

let currentUserId: string | null = null;
let unsubscribers: (() => void)[] = [];
const pending: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Block until every persisted store has finished reading AsyncStorage.
 *
 * Rehydration is asynchronous, so a pull that starts before it lands races it:
 * whichever finishes second wins, and the other one's data is gone. Waiting
 * first means the pull always merges into the real local state.
 */
function whenHydrated(): Promise<void> {
  const stores = [
    useTimetableStore,
    useRemindersStore,
    useSubjectDataStore,
    useStudyTopicsStore,
    useSubjectProfileStore,
  ];

  return Promise.all(
    stores.map(
      (store) =>
        new Promise<void>((resolve) => {
          const p = (store as any).persist;
          if (!p || p.hasHydrated?.()) return resolve();
          const unsub = p.onFinishHydration(() => {
            unsub?.();
            resolve();
          });
          // Never hang the sign-in on a storage read that doesn't come back.
          setTimeout(() => {
            unsub?.();
            resolve();
          }, 3000);
        })
    )
  ).then(() => undefined);
}

/**
 * Bring down whatever the account has stored, without losing local work.
 *
 * Pulls used to replace local state outright. Combined with a debounced push,
 * that silently destroyed data: create a subject profile, close the app before
 * the push fires, and the next launch overwrote the good local copy with the
 * older remote one. Keyed stores are merged instead, and local wins any
 * conflict, so the device you're holding is never the one that loses.
 */
export async function pullAll(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  await whenHydrated();

  const { data, error } = await supabase
    .from('user_data')
    .select('store_key, payload')
    .eq('user_id', userId);
  if (error || !data) return;

  for (const row of data) {
    const entry = STORES.find((s) => s.key === row.store_key);
    if (entry && row.payload) {
      try {
        entry.write(row.payload);
      } catch {
        // A malformed payload should never take the app down — skip that store.
      }
    }
  }

  // Anything the account hadn't caught up on is now pushed back up.
  await pushAll(userId).catch(() => {});
}

async function push(userId: string, key: StoreKey, payload: Record<string, unknown>) {
  if (!isSupabaseConfigured) return;
  await supabase
    .from('user_data')
    .upsert({ user_id: userId, store_key: key, payload }, { onConflict: 'user_id,store_key' });
}

/** Push everything once — used right after onboarding creates the first data. */
export async function pushAll(userId: string): Promise<void> {
  for (const s of STORES) await push(userId, s.key, s.read());
}

/**
 * Watch every store and mirror changes up to the account. Writes are debounced
 * so a burst of edits (dragging a wheel, typing a reminder) becomes one request.
 */
export function startSync(userId: string): void {
  stopSync();
  currentUserId = userId;

  for (const s of STORES) {
    const store =
      s.key === 'timetable'
        ? useTimetableStore
        : s.key === 'reminders'
        ? useRemindersStore
        : s.key === 'subject-data'
        ? useSubjectDataStore
        : s.key === 'study-topics'
        ? useStudyTopicsStore
        : useSubjectProfileStore;

    const unsub = (store as any).subscribe(() => {
      if (currentUserId !== userId) return;
      clearTimeout(pending[s.key]);
      pending[s.key] = setTimeout(() => push(userId, s.key, s.read()).catch(() => {}), 1200);
    });
    unsubscribers.push(unsub);
  }
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  Object.values(pending).forEach(clearTimeout);
  currentUserId = null;
}

/** Wipe local app data — used on sign-out so the next account starts clean. */
export function clearLocalData(): void {
  useTimetableStore.setState({ timetable: null, cycleStartDate: null });
  useRemindersStore.setState({ reminders: [] });
  useSubjectDataStore.setState({ bySubject: {} });
  useStudyTopicsStore.setState({ topics: [] });
  useSubjectProfileStore.setState({ bySubject: {} });
}
