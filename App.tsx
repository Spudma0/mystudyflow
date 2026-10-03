import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { APP_MAX_WIDTH } from './src/theme/theme';
import { TABLET_MAX_WIDTH, TABLET_MIN_WIDTH } from './src/lib/useIsTablet';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useRemindersStore } from './src/store/useRemindersStore';
import { syncReminderNotifications } from './src/lib/notifications';
import { seedShowcase, renameSubject } from './src/dev/showcaseSeed';
import { useSubjectProfileStore } from './src/store/useSubjectProfileStore';

// Development only: lets the demo data be loaded from a console, without
// shipping anything to a release build. The stores are exposed too, so a
// screen that needs particular data to photograph — a built study plan, say —
// can be set up without running the generator against it.
if (__DEV__) {
  Object.assign(globalThis as Record<string, unknown>, {
    seedShowcase,
    renameSubject,
    stores: { subjectProfiles: useSubjectProfileStore },
  });
}

export default function App() {
  // Lock the app to portrait by default; the study timer temporarily unlocks it.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ReminderNotifications />
        <ExpiredExamSweep />
        <PhoneFrame>
          <RootNavigator />
        </PhoneFrame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Keeps the OS notification queue in step with the reminder list — reschedules
 * on every add, edit, delete or check-off.
 */
function ReminderNotifications() {
  const reminders = useRemindersStore((s) => s.reminders);
  useEffect(() => {
    syncReminderNotifications(reminders).catch(() => {});
  }, [reminders]);
  return null;
}

/**
 * Clears out exams once their date has passed.
 *
 * Checked on the minute rather than on a timer per exam, and again whenever
 * the app comes back to the foreground — a phone left asleep overnight doesn't
 * run intervals, so coming back is when most of these are actually due to go.
 */
function ExpiredExamSweep() {
  const prune = useRemindersStore((s) => s.pruneExpiredExams);

  useEffect(() => {
    prune();
    const timer = setInterval(prune, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') prune();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [prune]);

  return null;
}

/**
 * The web build runs in a device-shaped frame rather than filling the browser.
 *
 * The frame follows the window: a narrow window gets a phone, a window wide
 * enough for a tablet gets a tablet. Capping it at phone width unconditionally
 * made the preview lie — the app measured the browser and laid itself out for
 * a tablet while being drawn into a 430px column.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return <>{children}</>;

  const maxWidth = width >= TABLET_MIN_WIDTH ? TABLET_MAX_WIDTH : APP_MAX_WIDTH;

  return (
    <View style={styles.webBackdrop}>
      <View style={[styles.webPhone, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    // @ts-expect-error web-only CSS unit, ignored on native
    minHeight: '100vh',
  },
  webPhone: {
    flex: 1,
    width: '100%',
    // @ts-expect-error web-only CSS unit, ignored on native
    maxHeight: '100vh',
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#2c2c2e',
    boxShadow: '0 0 60px rgba(0,0,0,0.6)',
  },
});
