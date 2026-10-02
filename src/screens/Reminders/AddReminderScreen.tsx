import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { DueDateTimeFields } from '../../components/DueDateTimeFields';
import { useRemindersStore } from '../../store/useRemindersStore';
import { ReminderCategory } from '../../types';

// Registered in two stacks — the reminders list and the timetable — so the
// editor is typed against the params both routes share rather than one list.
type ReminderEditorParams = { AddReminder: { reminderId?: string } | undefined };
type Props = NativeStackScreenProps<ReminderEditorParams, 'AddReminder'>;

export function AddReminderScreen({ route, navigation }: Props) {
  const t = useBaseTheme();
  const reminderId = route.params?.reminderId;
  const isEditing = !!reminderId;

  const reminders = useRemindersStore((s) => s.reminders);
  const addReminder = useRemindersStore((s) => s.addReminder);
  const updateReminder = useRemindersStore((s) => s.updateReminder);
  const deleteReminder = useRemindersStore((s) => s.deleteReminder);

  const existing = reminderId ? reminders.find((r) => r.id === reminderId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [category, setCategory] = useState<ReminderCategory>(existing?.category ?? 'Assignment');
  const [dueDate, setDueDate] = useState(
    existing ? new Date(existing.dueDate) : new Date(Date.now() + 1000 * 60 * 60 * 24)
  );
  const [notifyEnabled, setNotifyEnabled] = useState(existing?.enabled ?? true);
  const [repeating, setRepeating] = useState(existing?.repeating ?? false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const isPersonal = category === 'Personal';
  // Only personal reminders can repeat — switching category off Personal drops it.
  const isRepeating = isPersonal && repeating;
  const canSave = title.trim().length > 0 && (isPersonal || subject.trim().length > 0);

  const titlePlaceholder =
    category === 'Personal'
      ? 'Take vitamins'
      : category === 'Exam'
      ? 'Midterm Exam'
      : 'Physics Lab Notebook';

  const handleSave = () => {
    if (!canSave) return;
    // A repeating reminder has no due date — only a time — so pin it to today's
    // date; everything downstream reads just the time-of-day from it.
    let due = dueDate;
    if (isRepeating) {
      due = new Date();
      due.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
    }
    const input = {
      title: title.trim(),
      subject: isPersonal ? '' : subject.trim(),
      category,
      dueDate: due.toISOString(),
      enabled: notifyEnabled,
      testName: category === 'Exam' ? title.trim() : undefined,
      repeating: isRepeating,
    };
    if (isEditing && reminderId) {
      updateReminder(reminderId, input);
    } else {
      addReminder(input);
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!reminderId) return;
    deleteReminder(reminderId);
    setDeleteModalVisible(false);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>{isEditing ? 'Edit Reminder' : 'New Reminder'}</Text>
        {isEditing ? (
          <TouchableOpacity onPress={() => setDeleteModalVisible(true)} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.fieldLabel, { color: t.muted }]}>TITLE</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={titlePlaceholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        {!isPersonal && (
          <>
            <Text style={[styles.fieldLabel, { color: t.muted }]}>SUBJECT</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="AP Physics C"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </>
        )}

        <Text style={[styles.fieldLabel, { color: t.muted }]}>CATEGORY</Text>
        <View style={styles.categoryRow}>
          {(['Assignment', 'Exam', 'Personal'] as ReminderCategory[]).map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.categoryOption,
                category === c && { backgroundColor: t.accent, borderColor: t.accent },
              ]}
              onPress={() => setCategory(c)}
            >
              <Text
                style={[
                  styles.categoryOptionLabel,
                  category === c && { color: t.onAccent },
                ]}
              >
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {category === 'Exam' && (
          <Text style={styles.examHint}>
            Exams show up in the countdown card at the top of Reminders when they're the soonest upcoming exam.
          </Text>
        )}

        {isPersonal && (
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelWrap}>
              <Text style={[styles.fieldLabel, { color: t.muted, marginTop: 0 }]}>REPEAT DAILY</Text>
              <Text style={[styles.repeatHint, { color: t.muted }]}>
                Repeats every day at the time below — no due date.
              </Text>
            </View>
            <Switch
              value={repeating}
              onValueChange={setRepeating}
              trackColor={{ false: colors.border, true: t.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        )}

        <Text style={[styles.fieldLabel, { color: t.muted }]}>
          {isRepeating ? 'TIME' : 'DUE DATE & TIME'}
        </Text>
        <DueDateTimeFields value={dueDate} onChange={setDueDate} showDate={!isRepeating} />

        <View style={styles.toggleRow}>
          <Text style={[styles.fieldLabel, { color: t.muted }]}>NOTIFY ME</Text>
          <Switch
            value={notifyEnabled}
            onValueChange={setNotifyEnabled}
            trackColor={{ false: colors.border, true: t.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={isEditing ? 'Save Changes' : 'Save Reminder'}
          onPress={handleSave}
          disabled={!canSave}
        />
        {!canSave && (
          <Text style={[styles.saveHint, { color: t.muted }]}>
            {isPersonal ? 'Add a title to save' : 'Add a title and subject to save'}
          </Text>
        )}
      </View>

      <ConfirmDeleteModal
        visible={deleteModalVisible}
        title="Delete reminder?"
        message="This reminder will be permanently removed."
        confirmLabel="Delete"
        onCancel={() => setDeleteModalVisible(false)}
        onConfirm={handleDelete}
      />
    </SafeAreaView>
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
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryRow: { flexDirection: 'row', gap: spacing.md },
  categoryOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
  },
  categoryOptionActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  categoryOptionLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  categoryOptionLabelActive: { color: '#FFFFFF' },
  examHint: {
    color: colors.purpleLight,
    fontSize: 12,
    marginTop: spacing.sm,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  toggleLabelWrap: { flex: 1, paddingRight: spacing.lg },
  repeatHint: { fontSize: 12, lineHeight: 17 },
  footer: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
  saveHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
