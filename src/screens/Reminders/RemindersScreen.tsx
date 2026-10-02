import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { LineGridBackground } from '../../components/LineGridBackground';
import { useRemindersStore } from '../../store/useRemindersStore';
import { ExamCountdownCard } from '../../components/ExamCountdownCard';
import { effectiveDueTime, formatDayLeftLabel, formatRelativeDayLabel, formatTimeOfDay } from '../../lib/date';
import { RemindersStackParamList } from '../../navigation/types';
import { Reminder, ReminderCategory } from '../../types';

// Sections shown on the reminders page, in order. Only non-empty ones render.
const SECTIONS: { key: ReminderCategory; label: string }[] = [
  { key: 'Personal', label: 'Personal' },
  { key: 'Assignment', label: 'Upcoming Assignments' },
  { key: 'Exam', label: 'Exams' },
];

/**
 * Marks the moment a reminder falls due with a brief pulse, then leaves it on
 * the list labelled overdue.
 *
 * This used to remove the row instead — and to start out removed for anything
 * already past due. That silently swallowed every preloaded reminder whose date
 * had gone by, leaving an empty section heading and no way to tell the reminder
 * was even there. A reminder you haven't ticked off belongs on the list whether
 * or not its time has passed; the checkbox is how it leaves.
 *
 * Only items expiring soon arm a live timer (avoids setTimeout overflow on far
 * dates).
 */
function PulseOnExpiry({
  dueDate,
  repeating,
  children,
}: {
  dueDate: string;
  repeating?: boolean;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (repeating) return; // repeating reminders roll over to tomorrow, never expire
    const ms = new Date(dueDate).getTime() - Date.now();
    if (ms <= 0) return; // already overdue on arrival
    if (ms > 12 * 60 * 60 * 1000) return; // too far off to watch live
    const id = setTimeout(() => {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.35,
          duration: 300,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, ms);
    return () => clearTimeout(id);
  }, [dueDate, repeating, anim]);

  return <Animated.View style={{ opacity: anim }}>{children}</Animated.View>;
}

export function RemindersScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RemindersStackParamList>>();
  const reminders = useRemindersStore((s) => s.reminders);
  const toggleDone = useRemindersStore((s) => s.toggleDone);
  const deleteReminder = useRemindersStore((s) => s.deleteReminder);

  const byDate = (a: Reminder, b: Reminder) =>
    effectiveDueTime(a.dueDate, a.repeating) - effectiveDueTime(b.dueDate, b.repeating);

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: reminders.filter((r) => r.category === s.key).sort(byDate),
  })).filter((s) => s.items.length > 0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <LineGridBackground />
      <View style={styles.headerRow}>
        <Text style={[typography.screenTitle, { color: t.text }]}>Reminders</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: t.accent }]}
          onPress={() => navigation.navigate('AddReminder')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={24} color={t.onAccent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {sections.length === 0 ? (
          <Text style={[styles.emptyText, { color: t.muted }]}>No reminders yet</Text>
        ) : (
          sections.map((section) => (
            <View key={section.key}>
              <Text style={[styles.sectionLabel, { color: t.muted }]}>{section.label}</Text>
              {section.items.map((r) =>
                r.category === 'Exam' ? (
                  <PulseOnExpiry key={r.id} dueDate={r.dueDate}>
                    <View style={styles.examCardWrap}>
                      <ExamCountdownCard
                        exam={r}
                        onPress={() => navigation.navigate('AddReminder', { reminderId: r.id })}
                      />
                    </View>
                  </PulseOnExpiry>
                ) : (
                  <PulseOnExpiry key={r.id} dueDate={r.dueDate} repeating={r.repeating}>
                    <ReminderRow
                      reminder={r}
                      onToggleDone={() => toggleDone(r.id)}
                      onPress={() => navigation.navigate('AddReminder', { reminderId: r.id })}
                      onDelete={() => deleteReminder(r.id)}
                    />
                  </PulseOnExpiry>
                )
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function categoryStyle(category: ReminderCategory): { color: string; bg: string; label: string } {
  if (category === 'Exam') return { color: colors.rose, bg: colors.roseBg, label: 'Exams' };
  if (category === 'Personal') return { color: colors.teal, bg: colors.tealBg, label: 'Personal' };
  return { color: colors.amber, bg: colors.amberBg, label: 'Assignments' };
}

function ReminderRow({
  reminder,
  onToggleDone,
  onPress,
  onDelete,
}: {
  reminder: Reminder;
  onToggleDone: () => void;
  onPress: () => void;
  onDelete: () => void;
}) {
  const t = useBaseTheme();
  const isExam = reminder.category === 'Exam';
  const done = !!reminder.done;
  const cat = categoryStyle(reminder.category);
  const swipeRef = useRef<Swipeable>(null);

  const card = (
    <View style={[styles.reminderCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.cardBody}>
        <View style={styles.reminderHeader}>
          <View style={[styles.categoryPill, { backgroundColor: cat.bg }]}>
            <Text style={[styles.categoryPillText, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <Text style={[styles.daysLeft, { color: t.onCardMuted }]}>
            · {reminder.repeating ? 'Daily' : formatDayLeftLabel(reminder.dueDate)}
          </Text>
        </View>
        <Text
          style={[
            styles.reminderTitle,
            { color: done ? t.onCardMuted : t.onCard },
            done && styles.strikethrough,
          ]}
        >
          {reminder.title}
        </Text>
        {!!reminder.subject && (
          <Text style={[styles.reminderSubject, { color: t.onCardSecondary }]}>{reminder.subject}</Text>
        )}
        <View style={styles.dueRow}>
          <Ionicons
            name={reminder.repeating ? 'repeat-outline' : 'notifications-outline'}
            size={14}
            color={t.onCardMuted}
          />
          <Text style={[styles.dueText, { color: t.onCardSecondary }]}>
            {reminder.repeating
              ? `Every day at ${formatTimeOfDay(reminder.dueDate)}`
              : formatRelativeDayLabel(reminder.dueDate)}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Checklist checkbox */}
      <TouchableOpacity
        style={styles.checkboxWrap}
        onPress={onToggleDone}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: done ? t.accent : t.onCardMuted },
            done && { backgroundColor: t.accent },
          ]}
        >
          {done && <Ionicons name="checkmark" size={16} color={t.onAccent} />}
        </View>
      </TouchableOpacity>
    </View>
  );

  // Exams are managed via the countdown/edit flow — no swipe-to-delete.
  if (isExam) return card;

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, drag) => (
        <TouchableOpacity
          style={styles.deleteAction}
          activeOpacity={0.85}
          onPress={() => {
            swipeRef.current?.close();
            onDelete();
          }}
        >
          <Animated.View
            style={{
              transform: [
                {
                  scale: drag.interpolate({
                    inputRange: [-80, -40, 0],
                    outputRange: [1, 0.8, 0.4],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            }}
          >
            <Ionicons name="trash" size={22} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      )}
    >
      {card}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  examCardWrap: { marginBottom: spacing.md },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: spacing.xxxl },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  reminderCard: {
    position: 'relative',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardBody: { paddingRight: 44 },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  checkboxWrap: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  categoryPillText: { fontWeight: '800', fontSize: 12 },
  daysLeft: { fontSize: 12, marginLeft: spacing.sm, fontWeight: '700' },
  reminderTitle: { fontWeight: '700', fontSize: 16 },
  strikethrough: { textDecorationLine: 'line-through' },
  reminderSubject: { fontSize: 13, marginTop: 2 },
  dueRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.xs },
  dueText: { fontSize: 12 },
  deleteAction: {
    width: 80,
    marginBottom: spacing.md,
    marginLeft: spacing.md,
    backgroundColor: colors.danger,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
