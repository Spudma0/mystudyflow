import { useTimetableStore } from '../store/useTimetableStore';
import { useRemindersStore } from '../store/useRemindersStore';
import { useSubjectDataStore } from '../store/useSubjectDataStore';
import { useWidgetsStore } from '../store/useWidgetsStore';
import { useSubjectProfileStore } from '../store/useSubjectProfileStore';
import { useThemeStore } from '../store/useThemeStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  SHOWCASE_SUBJECTS,
  SHOWCASE_THEME,
  SHOWCASE_WIDGETS,
  buildReminders,
  buildStudyHistory,
  buildTimetable,
  thisMonday,
} from './showcaseData';

/**
 * Fills the app with a term's worth of believable data, for demonstrating it.
 *
 * Everything is written through the live stores rather than into storage
 * directly, so the normal sync picks the changes up and pushes them to the
 * account — run this on one device and the others catch up.
 *
 * The data itself is built in showcaseData, which the demo-account seeding
 * script shares, so the App Store demo and this are the same term of work.
 *
 * Deliberately *not* touched: subject profiles. The generated study plans for
 * Math and `test` are real work and expensive to rebuild, so the timetable is
 * built around those two names and no profile is created or removed.
 */

// --- Renaming --------------------------------------------------------------

/**
 * Renames a subject everywhere it appears.
 *
 * A subject has no id — its name is the key that ties the timetable, the study
 * history, the reminders and the generated study plan together — so renaming
 * means rewriting all four at once. Doing it any other way orphans the plan,
 * which is expensive to rebuild.
 */
export function renameSubject(from: string, to: string): string {
  if (!from || !to || from === to) return 'nothing to do';

  const timetable = useTimetableStore.getState().timetable;
  if (timetable) {
    useTimetableStore.getState().replaceDays(
      timetable.days.map((day) => ({
        ...day,
        classes: day.classes.map((c) => (c.name === from ? { ...c, name: to } : c)),
      })),
      timetable.cycleType
    );
  }

  const data = { ...useSubjectDataStore.getState().bySubject };
  if (data[from]) {
    data[to] = {
      ...data[from],
      studySessions: data[from].studySessions.map((s) => ({ ...s, subjectName: to })),
    };
    delete data[from];
    useSubjectDataStore.setState({ bySubject: data });
  }

  const profiles = { ...useSubjectProfileStore.getState().bySubject };
  if (profiles[from]) {
    profiles[to] = { ...profiles[from], subjectName: to };
    delete profiles[from];
    useSubjectProfileStore.setState({ bySubject: profiles });
  }

  useRemindersStore.setState({
    reminders: useRemindersStore
      .getState()
      .reminders.map((r) => (r.subject === from ? { ...r, subject: to } : r)),
  });

  return `renamed "${from}" to "${to}"`;
}

// --- Entry point -----------------------------------------------------------

/**
 * Replaces the timetable, reminders, study history, widgets and theme.
 *
 * Returns a one-line summary so whoever ran it can see it did something.
 */
export async function seedShowcase(): Promise<string> {
  const days = buildTimetable(SHOWCASE_SUBJECTS);
  useTimetableStore.getState().replaceDays(days, 10);
  // Anchor Day 1 to the Monday of this week so the cycle lines up with real
  // dates rather than starting wherever the old data happened to start.
  useTimetableStore.getState().setCycleStartDate(thisMonday());

  const bySubject = buildStudyHistory(SHOWCASE_SUBJECTS);
  useSubjectDataStore.setState({ bySubject });

  const reminders = buildReminders(SHOWCASE_SUBJECTS);
  useRemindersStore.setState({ reminders });

  useWidgetsStore.setState({ widgets: SHOWCASE_WIDGETS });

  const theme = useThemeStore.getState();
  theme.setAccentColor(SHOWCASE_THEME.accent);
  theme.setBaseColor(SHOWCASE_THEME.base);
  theme.setCardColor(SHOWCASE_THEME.card);

  // Saved on the profile too, so the colours follow the account onto another
  // device instead of living only on this one.
  await useAuthStore
    .getState()
    .saveProfile({
      school: 'Riverwood Secondary College',
      accent_color: SHOWCASE_THEME.accent,
      base_color: SHOWCASE_THEME.base,
      card_color: SHOWCASE_THEME.card,
    })
    .catch(() => false);

  const sessions = Object.values(bySubject).reduce((n, d) => n + d.studySessions.length, 0);
  const hours = Object.values(bySubject).reduce(
    (n, d) => n + d.studySessions.reduce((m, s) => m + s.durationSec, 0),
    0
  );
  return `${SHOWCASE_SUBJECTS.length} subjects · ${sessions} study sessions · ${Math.round(
    hours / 3600
  )}h logged · ${reminders.length} reminders`;
}
