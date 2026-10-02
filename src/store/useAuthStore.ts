import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useThemeStore } from './useThemeStore';
import { pullAll, pushAll, startSync, stopSync, clearLocalData } from '../lib/sync';

/** Same backend the AI features use. */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export interface Profile {
  id: string;
  full_name: string;
  school: string;
  year_level: string;
  accent_color: string;
  base_color: string;
  card_color: string;
}

/**
 * 'loading'    – restoring a stored session on launch (show the splash)
 * 'signedOut'  – no session; show welcome / sign-in / sign-up
 * 'onboarding' – signed in but the profile has never been filled in
 * 'ready'      – signed in with a complete profile; show the app
 */
export type AuthStatus = 'loading' | 'signedOut' | 'onboarding' | 'ready';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  /** Set when the last auth call failed, for display on the form. */
  error: string | null;
  busy: boolean;

  init: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Permanently removes the account and everything stored against it. */
  deleteAccount: () => Promise<boolean>;
  saveProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<boolean>;
  finishOnboarding: () => Promise<void>;
  clearError: () => void;
}

/** Push a loaded profile's colours into the live theme. */
function applyProfileTheme(p: Profile) {
  const theme = useThemeStore.getState();
  if (p.accent_color) theme.setAccentColor(p.accent_color);
  if (p.base_color) theme.setBaseColor(p.base_color);
  if (p.card_color) theme.setCardColor(p.card_color);
}

/** A profile counts as complete once the questions we ask have answers. */
function isComplete(p: Profile | null): boolean {
  return !!p && p.full_name.trim().length > 0 && p.year_level.trim().length > 0;
}

/**
 * The last profile we successfully loaded.
 *
 * Kept on the device so a launch with no network still knows who you are.
 * Without it, a failed profile fetch reads as "profile missing" and throws a
 * signed-in user back into registration.
 */
const PROFILE_CACHE_KEY = 'studyflow-profile-cache';

async function cacheProfile(p: Profile | null): Promise<void> {
  try {
    if (p) await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    else await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // A profile we can't cache just means one more fetch next launch.
  }
}

async function cachedProfile(userId: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    return p?.id === userId ? p : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the profile, distinguishing "this account has no profile" from "we
 * couldn't ask". Only the first should ever send someone to registration.
 */
async function fetchProfile(
  userId: string
): Promise<{ profile: Profile | null; reachable: boolean }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, school, year_level, accent_color, base_color, card_color')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { profile: null, reachable: false };
    return { profile: (data as Profile) ?? null, reachable: true };
  } catch {
    return { profile: null, reachable: false };
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, school, year_level, accent_color, base_color, card_color')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return (data as Profile) ?? null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  session: null,
  profile: null,
  error: null,
  busy: false,

  init: async () => {
    if (!isSupabaseConfigured) {
      set({ status: 'signedOut' });
      return;
    }

    const applySession = async (session: Session | null) => {
      if (!session) {
        stopSync();
        set({ status: 'signedOut', session: null, profile: null });
        return;
      }

      const { profile: fetched, reachable } = await fetchProfile(session.user.id);
      // Fall back to the copy on the device when the server can't be reached,
      // so a launch on a flaky connection doesn't look like a new account.
      const profile = reachable ? fetched : await cachedProfile(session.user.id);
      if (reachable) await cacheProfile(fetched);
      if (profile) applyProfileTheme(profile);

      if (isComplete(profile)) {
        await pullAll(session.user.id);
        startSync(session.user.id);
        set({ status: 'ready', session, profile });
      } else if (!reachable) {
        // Signed in, but we genuinely don't know whether the profile is
        // finished. Registration would wipe out a real one, so wait instead.
        set({ status: 'ready', session, profile });
        startSync(session.user.id);
      } else {
        set({ status: 'onboarding', session, profile });
      }
    };

    const { data } = await supabase.auth.getSession();
    await applySession(data.session);

    // Keeps the app in step with token refreshes and sign-out from anywhere.
    supabase.auth.onAuthStateChange((_event, session) => {
      const current = get().session;
      if (session?.user.id === current?.user.id) {
        set({ session });
        return;
      }
      applySession(session);
    });
  },

  signUp: async (email, password) => {
    set({ busy: true, error: null });
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      set({ busy: false, error: error.message });
      return false;
    }
    // With email confirmation switched on there is no session yet.
    if (!data.session) {
      set({ busy: false, error: 'Check your inbox to confirm your email, then sign in.' });
      return false;
    }
    const profile = await loadProfile(data.session.user.id);
    set({ busy: false, status: 'onboarding', session: data.session, profile });
    return true;
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session) {
      set({ busy: false, error: error?.message ?? 'Could not sign in.' });
      return false;
    }
    const profile = await loadProfile(data.session.user.id);
    if (profile) applyProfileTheme(profile);
    if (isComplete(profile)) {
      await pullAll(data.session.user.id);
      startSync(data.session.user.id);
      set({ busy: false, status: 'ready', session: data.session, profile });
    } else {
      set({ busy: false, status: 'onboarding', session: data.session, profile });
    }
    return true;
  },

  signOut: async () => {
    stopSync();
    await cacheProfile(null);
    await supabase.auth.signOut();
    clearLocalData();
    set({ status: 'signedOut', session: null, profile: null, error: null });
  },

  /**
   * Deletes the account for good.
   *
   * The deletion itself happens on the backend: removing an auth user needs
   * the service role key, which must never be in the app. Local state is only
   * cleared once the server confirms, so a failed call leaves the user signed
   * in with their data rather than stranded with neither.
   */
  deleteAccount: async () => {
    const session = get().session;
    if (!session) return false;

    set({ busy: true, error: null });
    try {
      const res = await fetch(`${API_URL}/api/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        set({ busy: false, error: body.error || `Could not delete the account (${res.status}).` });
        return false;
      }
    } catch {
      set({
        busy: false,
        error: "Couldn't reach the server. Check your connection and try again.",
      });
      return false;
    }

    // The account is gone; tear down the session and everything on the device.
    stopSync();
    await cacheProfile(null);
    await supabase.auth.signOut().catch(() => {});
    clearLocalData();
    set({ busy: false, status: 'signedOut', session: null, profile: null, error: null });
    return true;
  },

  saveProfile: async (patch) => {
    const session = get().session;
    if (!session) return false;
    set({ busy: true, error: null });
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...patch })
      .eq('id', session.user.id)
      .select('id, full_name, school, year_level, accent_color, base_color, card_color')
      .single();
    if (error) {
      set({ busy: false, error: error.message });
      return false;
    }
    await cacheProfile(data as Profile);
    set({ busy: false, profile: data as Profile });
    return true;
  },

  // Called at the end of registration: the account now has everything it needs.
  finishOnboarding: async () => {
    const session = get().session;
    if (!session) return;
    await pushAll(session.user.id);
    startSync(session.user.id);
    set({ status: 'ready' });
  },

  clearError: () => set({ error: null }),
}));
