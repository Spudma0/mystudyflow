import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Reminder } from '../types';

/**
 * Local reminder notifications.
 *
 * Scheduling rules (per the app's reminder model):
 *  - Exam / Assignment  → one alert 24 hours before the due date.
 *  - Personal (one-off) → one alert at the exact due time.
 *  - Personal (daily)   → a repeating alert every day at that time.
 *
 * Everything is rescheduled from scratch whenever the reminder list changes,
 * which keeps the OS queue in sync with edits, deletions and completions
 * without having to track individual notification ids.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Notifications are a native module — they're a no-op in the web preview.
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  // Show reminders as a banner even while the app is in the foreground.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return asked.granted;
}

function bodyFor(reminder: Reminder, kind: 'dayBefore' | 'now'): string {
  const subject = reminder.subject?.trim();
  const where = subject ? ` for ${subject}` : '';
  if (kind === 'dayBefore') {
    return reminder.category === 'Exam'
      ? `Your ${reminder.title} exam${where} is tomorrow.`
      : `${reminder.title}${where} is due tomorrow.`;
  }
  return reminder.title;
}

/**
 * Wipes the scheduled queue and re-adds one entry per active reminder.
 * Safe to call often — it's cheap and idempotent.
 */
export async function syncReminderNotifications(reminders: Reminder[]): Promise<void> {
  if (!supported) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();

  for (const r of reminders) {
    if (!r.enabled || r.done) continue;
    const due = new Date(r.dueDate);

    // Daily personal reminder: fires every day at the chosen time.
    if (r.repeating) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Reminder',
          body: bodyFor(r, 'now'),
          data: { reminderId: r.id },
        },
        trigger:
          Platform.OS === 'ios'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour: due.getHours(),
                minute: due.getMinutes(),
                repeats: true,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: due.getHours(),
                minute: due.getMinutes(),
              },
      });
      continue;
    }

    // One-off personal reminder: fires at the exact time.
    if (r.category === 'Personal') {
      if (due.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Reminder',
          body: bodyFor(r, 'now'),
          data: { reminderId: r.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due },
      });
      continue;
    }

    // Exams and assignments: 24 hours before the due date.
    const alertAt = due.getTime() - DAY_MS;
    if (alertAt <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: r.category === 'Exam' ? 'Exam tomorrow' : 'Due tomorrow',
        body: bodyFor(r, 'dayBefore'),
        data: { reminderId: r.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(alertAt) },
    });
  }
}
