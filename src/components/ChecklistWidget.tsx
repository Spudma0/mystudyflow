import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { useRemindersStore } from '../store/useRemindersStore';
import { formatTimeOfDay } from '../lib/date';
import { Reminder } from '../types';

/** How many fit before the card would have to scroll. */
const SHOWN = 2;

function dueLabel(reminder: Reminder): string {
  const time = formatTimeOfDay(reminder.dueDate);
  if (reminder.repeating) return `Every day ${time}`;
  return `${new Date(reminder.dueDate).toLocaleDateString('en-US')} ${time}`;
}

/** The next few things due, as tickable-looking rows under a heading. */
export function ChecklistWidget() {
  const t = useBaseTheme();
  const getUpcoming = useRemindersStore((s) => s.getUpcoming);
  // Subscribing to the list itself is what makes this re-render when a
  // reminder is added or ticked off — `getUpcoming` is a stable function.
  useRemindersStore((s) => s.reminders);

  const upcoming = getUpcoming().slice(0, SHOWN);

  return (
    <View style={[styles.card, { backgroundColor: t.cardScrim }]}>
      <Text style={[styles.heading, { color: t.accentLight }]}>Check list</Text>

      {upcoming.length === 0 ? (
        <View style={[styles.item, { backgroundColor: withAlpha(t.onTile, 0.08) }]}>
          <Text style={[styles.title, { color: t.onTile }]}>Nothing due</Text>
          <Text style={[styles.meta, { color: t.accentLight }]}>You are all caught up</Text>
        </View>
      ) : (
        upcoming.map((reminder) => (
          <View
            key={reminder.id}
            style={[styles.item, { backgroundColor: withAlpha(t.onTile, 0.08) }]}
          >
            <Text style={[styles.title, { color: t.onTile }]} numberOfLines={1}>
              {reminder.title}
            </Text>
            <Text style={[styles.meta, { color: t.accentLight }]} numberOfLines={1}>
              {dueLabel(reminder)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 118,
  },
  heading: { fontSize: 13, fontWeight: '800' },
  item: { borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
