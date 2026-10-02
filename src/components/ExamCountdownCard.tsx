import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { formatCountdown, formatRelativeDayLabel } from '../lib/date';
import { Reminder } from '../types';

const COUNTDOWN_WINDOW_MS = 1000 * 60 * 60 * 24 * 14; // 14 days used to size the progress bar

export function ExamCountdownCard({ exam, onPress }: { exam: Reminder; onPress?: () => void }) {
  const t = useBaseTheme();
  const [countdown, setCountdown] = useState(() => formatCountdown(exam.dueDate));

  useEffect(() => {
    const interval = setInterval(() => setCountdown(formatCountdown(exam.dueDate)), 1000);
    return () => clearInterval(interval);
  }, [exam.dueDate]);

  const progress = Math.min(1, 1 - countdown.totalMs / COUNTDOWN_WINDOW_MS);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <View style={[styles.pill, { backgroundColor: colors.roseBg }]}>
        <Text style={[styles.pillText, { color: colors.rose }]}>🏆 EXAM</Text>
      </View>
      {/* The reminder's own title heads the card. It used to lead with the
          subject and show the title only when there was no test name, so the
          same exam went by one name here and another on the timetable. */}
      <Text style={[styles.title, { color: t.onCard }]}>{exam.title}</Text>
      <Text style={[styles.subtitle, { color: t.onCardSecondary }]}>
        {[exam.subject, exam.testName].filter(Boolean).join(' · ')}
        {exam.subject || exam.testName ? ' · ' : ''}
        {formatRelativeDayLabel(exam.dueDate)}
      </Text>

      <View style={styles.timerRow}>
        <TimeBlock value={countdown.days} label="DAYS" big />
        <Text style={[styles.dot, { color: t.onCardMuted }]}>·</Text>
        <TimeBlock value={countdown.hours} label="HRS" />
        <TimeBlock value={countdown.minutes} label="MIN" />
        <TimeBlock value={countdown.seconds} label="SEC" />
      </View>

      <View style={[styles.progressTrack, { backgroundColor: t.cardAlt }]}>
        <View style={[styles.progressFill, { width: `${Math.max(4, progress * 100)}%`, backgroundColor: t.accent }]} />
      </View>
    </TouchableOpacity>
  );
}

function TimeBlock({ value, label, big }: { value: number; label: string; big?: boolean }) {
  const t = useBaseTheme();
  return (
    <View style={styles.timeBlockWrap}>
      <View style={[styles.timeBlock, big ? styles.timeBlockBig : { backgroundColor: t.cardAlt }]}>
        <Text style={[styles.timeValue, big && styles.timeValueBig, { color: t.onCard }]}>{value}</Text>
      </View>
      <Text style={[styles.timeLabel, { color: t.onCardMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pill: {
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  pillText: {
    color: colors.purpleLight,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.xl,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.lg,
  },
  dot: {
    color: colors.textMuted,
    fontSize: 24,
    marginHorizontal: spacing.sm,
    marginBottom: 22,
  },
  timeBlockWrap: {
    alignItems: 'center',
    marginRight: spacing.md,
  },
  timeBlock: {
    backgroundColor: colors.cardAlt,
    borderRadius: radii.md,
    minWidth: 56,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  timeBlockBig: {
    backgroundColor: 'transparent',
    minWidth: 44,
    paddingVertical: 0,
  },
  timeValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  timeValueBig: {
    fontSize: 44,
  },
  timeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.purple,
    borderRadius: radii.pill,
  },
});
