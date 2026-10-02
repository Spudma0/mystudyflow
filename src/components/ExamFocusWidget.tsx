import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_MAX_WIDTH, colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { useRemindersStore } from '../store/useRemindersStore';
import { useWidgetsStore } from '../store/useWidgetsStore';
import { formatCountdown, formatRelativeDayLabel } from '../lib/date';
import { Reminder } from '../types';
import { useNow } from '../lib/useNow';

/**
 * One exam the student has chosen to keep in front of them, counting down.
 *
 * The "next exam" widget beside it always shows whichever is soonest; this one
 * is pinned, so the exam that actually matters stays put even when a quiz next
 * week would otherwise push it out of view.
 */

const SECOND = 1000;

export function ExamFocusWidget() {
  const t = useBaseTheme();
  const reminders = useRemindersStore((s) => s.reminders);
  const pinnedExamId = useWidgetsStore((s) => s.pinnedExamId);
  const setPinnedExam = useWidgetsStore((s) => s.setPinnedExam);
  const [picking, setPicking] = React.useState(false);

  // Ticks the countdown. Every second, because the hours and minutes are shown.
  const now = useNow(SECOND);

  const exams = React.useMemo(
    () =>
      reminders
        .filter((r) => r.category === 'Exam' && !r.done && new Date(r.dueDate).getTime() > now.getTime())
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [reminders, now]
  );

  // A pinned exam that has been sat, deleted or ticked off falls back to the
  // soonest one rather than leaving the widget empty.
  const pinned = exams.find((e) => e.id === pinnedExamId) ?? exams[0] ?? null;

  return (
    <>
      <Pressable
        style={[styles.card, { backgroundColor: t.cardScrim }]}
        onPress={() => setPicking(true)}
      >
        <View style={styles.headRow}>
          <View style={[styles.pill, { backgroundColor: withAlpha(colors.rose, 0.22) }]}>
            <Text style={[styles.pillText, { color: colors.rose }]}>EXAM</Text>
          </View>
          <Ionicons name="swap-horizontal" size={14} color={t.onTileMuted} />
        </View>

        {pinned ? (
          <Countdown exam={pinned} tint={t.onTile} muted={t.onTileMuted} />
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: t.onTile }]}>No exams</Text>
            <Text style={[styles.emptyBody, { color: t.onTileMuted }]}>
              Add one in Reminders to track it here
            </Text>
          </View>
        )}
      </Pressable>

      <ExamPicker
        visible={picking}
        exams={exams}
        selectedId={pinned?.id ?? null}
        onSelect={(id) => {
          setPinnedExam(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

function Countdown({ exam, tint, muted }: { exam: Reminder; tint: string; muted: string }) {
  const left = formatCountdown(exam.dueDate);
  return (
    <>
      {/* Headed by the reminder's own title, the same as the reminders list
          and the timetable block, so one exam has one name everywhere. */}
      <Text style={[styles.subject, { color: tint }]} numberOfLines={1}>
        {exam.title}
      </Text>
      <Text style={[styles.meta, { color: muted }]} numberOfLines={1}>
        {[exam.subject, exam.testName].filter(Boolean).join(' · ') ||
          formatRelativeDayLabel(exam.dueDate)}
      </Text>

      <View style={styles.timerRow}>
        <Unit value={left.days} label="d" tint={tint} muted={muted} />
        <Unit value={left.hours} label="h" tint={tint} muted={muted} />
        <Unit value={left.minutes} label="m" tint={tint} muted={muted} />
      </View>
    </>
  );
}

function Unit({
  value,
  label,
  tint,
  muted,
}: {
  value: number;
  label: string;
  tint: string;
  muted: string;
}) {
  return (
    <View style={styles.unit}>
      <Text style={[styles.unitValue, { color: tint }]}>{value}</Text>
      <Text style={[styles.unitLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

function ExamPicker({
  visible,
  exams,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  exams: Reminder[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const t = useBaseTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.base }]}>
          <View style={[styles.handle, { backgroundColor: t.cardBorder }]} />
          <Text style={[styles.sheetTitle, { color: t.text }]}>Which exam?</Text>
          <Text style={[styles.sheetSubtitle, { color: t.secondary }]}>
            Pick the one to keep on your home screen.
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {exams.length === 0 ? (
              <Text style={[styles.sheetEmpty, { color: t.muted }]}>
                No upcoming exams. Add one from the Reminders tab.
              </Text>
            ) : (
              exams.map((exam) => {
                const chosen = exam.id === selectedId;
                return (
                  <TouchableOpacity
                    key={exam.id}
                    activeOpacity={0.85}
                    onPress={() => onSelect(exam.id)}
                    style={[
                      styles.row,
                      {
                        backgroundColor: t.card,
                        borderColor: chosen ? withAlpha(t.accent, 0.8) : t.cardBorder,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: t.onCard }]} numberOfLines={1}>
                        {exam.title}
                      </Text>
                      <Text style={[styles.rowMeta, { color: t.onCardMuted }]} numberOfLines={1}>
                        {[exam.subject, formatRelativeDayLabel(exam.dueDate)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {chosen && <Ionicons name="checkmark-circle" size={22} color={t.accent} />}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.done, { backgroundColor: t.accent }]}
            activeOpacity={0.88}
            onPress={onClose}
          >
            <Text style={[styles.doneText, { color: t.onAccent }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 118,
    justifyContent: 'center',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  subject: { fontSize: 15, fontWeight: '800', marginTop: spacing.sm },
  meta: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginTop: spacing.sm },
  unit: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  unitValue: { fontSize: 22, fontWeight: '900' },
  unitLabel: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  empty: { marginTop: spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyBody: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '80%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  sheetTitle: { fontSize: 22, fontWeight: '800' },
  sheetSubtitle: { fontSize: 13, marginTop: 2, marginBottom: spacing.lg },
  list: { flexGrow: 0 },
  sheetEmpty: { fontSize: 14, paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  done: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  doneText: { fontSize: 16, fontWeight: '800' },
});
