import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { AuthTextField } from '../../components/AuthTextField';
import { DueDateTimeFields } from '../../components/DueDateTimeFields';
import { WidgetSettingsSheet } from '../../components/WidgetSettingsSheet';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useRemindersStore } from '../../store/useRemindersStore';
import { useWidgetsStore, WIDGET_META } from '../../store/useWidgetsStore';
import { transcribeTimetableFromFile } from '../../lib/ai';
import { ReminderCategory } from '../../types';

const CATEGORIES: ReminderCategory[] = ['Assignment', 'Exam', 'Personal'];

/**
 * The last registration step: get the user's real timetable and first reminder
 * in before they ever see the app, so it opens with their data rather than an
 * empty shell. Everything here is optional — both cards can be left alone.
 */
export function SetupStep() {
  const t = useBaseTheme();
  const replaceDays = useTimetableStore((s) => s.replaceDays);
  const getSubjects = useTimetableStore((s) => s.getSubjects);
  const addReminder = useRemindersStore((s) => s.addReminder);
  const reminders = useRemindersStore((s) => s.reminders);

  const widgets = useWidgetsStore((s) => s.widgets);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [widgetSheetOpen, setWidgetSheetOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<ReminderCategory>('Assignment');
  const [due, setDue] = useState(new Date(Date.now() + 1000 * 60 * 60 * 24));

  const isPersonal = category === 'Personal';
  const canAddReminder = title.trim().length > 0 && (isPersonal || subject.trim().length > 0);

  const handleImport = async () => {
    setImportError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    setImporting(true);
    try {
      const result = await transcribeTimetableFromFile(asset.uri, asset.mimeType);
      replaceDays(result.days, result.cycleType);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Couldn't read that timetable. You can add it later."
      );
    } finally {
      setImporting(false);
    }
  };

  const handleAddReminder = () => {
    if (!canAddReminder) return;
    addReminder({
      title: title.trim(),
      subject: isPersonal ? '' : subject.trim(),
      category,
      dueDate: due.toISOString(),
      enabled: true,
      testName: category === 'Exam' ? title.trim() : undefined,
    });
    setTitle('');
    setSubject('');
  };

  const subjectCount = getSubjects().length;

  return (
    <>
      {/* ---- Timetable ---- */}
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="calendar-outline" size={18} color={t.accentLight} />
          <Text style={[styles.cardTitle, { color: t.onCard }]}>Your timetable</Text>
        </View>

        {/* An empty timetable can already exist without anything having been
            imported, so the confirmation keys off actual subjects, not the object. */}
        {subjectCount > 0 ? (
          <View style={styles.doneRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <Text style={[styles.doneText, { color: t.onCardSecondary }]}>
              {subjectCount} subject{subjectCount === 1 ? '' : 's'} imported
            </Text>
          </View>
        ) : (
          <Text style={[styles.cardBody, { color: t.onCardSecondary }]}>
            Take a photo of your school timetable, or pick a PDF — it gets read for you.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.cardAction, { borderColor: t.cardBorder, backgroundColor: t.cardAlt }]}
          onPress={handleImport}
          activeOpacity={0.85}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator color={t.accentLight} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color={t.accentLight} />
              <Text style={[styles.cardActionLabel, { color: t.accentLight }]}>
                {subjectCount > 0 ? 'Import a different one' : 'Import my timetable'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {!!importError && <Text style={styles.error}>{importError}</Text>}
      </View>

      {/* ---- First reminder ---- */}
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="notifications-outline" size={18} color={t.accentLight} />
          <Text style={[styles.cardTitle, { color: t.onCard }]}>Your first reminder</Text>
        </View>

        {reminders.length > 0 && (
          <View style={styles.doneRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <Text style={[styles.doneText, { color: t.onCardSecondary }]}>
              {reminders.length} added
            </Text>
          </View>
        )}

        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                activeOpacity={0.85}
                style={[
                  styles.categoryChip,
                  { backgroundColor: active ? t.accent : t.cardAlt, borderColor: active ? t.accent : t.cardBorder },
                ]}
              >
                <Text style={[styles.categoryText, { color: active ? t.onAccent : t.onCardSecondary }]}>
                  {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <AuthTextField
          label="What's due?"
          value={title}
          onChangeText={setTitle}
          placeholder={category === 'Personal' ? 'Take vitamins' : 'Physics lab report'}
        />
        {!isPersonal && (
          <AuthTextField
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="AP Physics C"
          />
        )}

        <Text style={[styles.fieldLabel, { color: t.muted }]}>Due</Text>
        <DueDateTimeFields value={due} onChange={setDue} />

        <TouchableOpacity
          style={[
            styles.cardAction,
            { borderColor: t.cardBorder, backgroundColor: t.cardAlt },
            !canAddReminder && { opacity: 0.45 },
          ]}
          onPress={handleAddReminder}
          activeOpacity={0.85}
          disabled={!canAddReminder}
        >
          <Ionicons name="add" size={16} color={t.accentLight} />
          <Text style={[styles.cardActionLabel, { color: t.accentLight }]}>Add reminder</Text>
        </TouchableOpacity>
      </View>

      {/* ---- Home widgets ---- */}
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="grid-outline" size={18} color={t.accentLight} />
          <Text style={[styles.cardTitle, { color: t.onCard }]}>Your home widgets</Text>
        </View>

        <Text style={[styles.cardBody, { color: t.onCardSecondary }]}>
          Pick what sits at the top of your home screen. You can always hold a widget later to
          change it.
        </Text>

        <View style={styles.widgetChips}>
          {widgets.map((id) => (
            <View
              key={id}
              style={[styles.widgetChip, { backgroundColor: t.accentSoftBg, borderColor: t.cardBorder }]}
            >
              <Ionicons
                name={WIDGET_META[id].icon as keyof typeof Ionicons.glyphMap}
                size={13}
                color={t.accentLight}
              />
              <Text style={[styles.widgetChipText, { color: t.onCardSecondary }]}>
                {WIDGET_META[id].title}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.cardAction, { borderColor: t.cardBorder, backgroundColor: t.cardAlt }]}
          onPress={() => setWidgetSheetOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="options-outline" size={16} color={t.accentLight} />
          <Text style={[styles.cardActionLabel, { color: t.accentLight }]}>Customise widgets</Text>
        </TouchableOpacity>
      </View>

      <WidgetSettingsSheet visible={widgetSheetOpen} onClose={() => setWidgetSheetOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardBody: { fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  doneText: { fontSize: 13, fontWeight: '600' },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  cardActionLabel: { fontSize: 14, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  categoryChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  categoryText: { fontSize: 13, fontWeight: '700' },
  widgetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  widgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  widgetChipText: { fontSize: 12, fontWeight: '700' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  error: { color: '#F87171', fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
});
