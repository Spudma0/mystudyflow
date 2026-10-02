import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { ClassCard } from '../../components/ClassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useTimetableStore } from '../../store/useTimetableStore';
import { transcribeTimetableFromFile } from '../../lib/ai';
import { ClassEntry, CycleType, DaySchedule } from '../../types';
import { TimetableStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TimetableStackParamList, 'AIImportPreview'>;

export function AIImportPreview({ route, navigation }: Props) {
  const t = useBaseTheme();
  const { cycleType, fileUri, mimeType } = route.params;
  const replaceDays = useTimetableStore((s) => s.replaceDays);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DaySchedule[]>([]);
  // Cycle length is detected by the AI from the timetable; the route param is
  // only a fallback until the result comes back.
  const [detectedCycle, setDetectedCycle] = useState<CycleType>(cycleType);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    transcribeTimetableFromFile(fileUri, mimeType)
      .then((result) => {
        if (!cancelled) {
          setDays(result.days);
          setDetectedCycle(result.cycleType);
          setSelectedDayIndex(0);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong reading your timetable.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileUri, mimeType, retryKey]);

  const updateClass = (dayIndex: number, classId: string, patch: Partial<ClassEntry>) => {
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex === dayIndex
          ? { ...d, classes: d.classes.map((c) => (c.id === classId ? { ...c, ...patch } : c)) }
          : d
      )
    );
  };

  const deleteClass = (dayIndex: number, classId: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex === dayIndex ? { ...d, classes: d.classes.filter((c) => c.id !== classId) } : d
      )
    );
  };

  const handleConfirm = () => {
    replaceDays(days, detectedCycle);
    navigation.popToTop();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={t.accent} />
          <Text style={[styles.loadingTitle, { color: t.text }]}>Reading your timetable…</Text>
          <Text style={[styles.loadingSubtitle, { color: t.secondary }]}>
            Extracting class names, times, rooms, and teachers.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]}>
        <View style={styles.loadingWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={t.accent} />
          <Text style={[styles.loadingTitle, { color: t.text }]}>Couldn't read your timetable</Text>
          <Text style={[styles.loadingSubtitle, { color: t.secondary }]}>{error}</Text>
          <View style={styles.errorActions}>
            <PrimaryButton label="Try Again" icon="refresh" onPress={() => setRetryKey((k) => k + 1)} />
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.goBackButton}>
              <Text style={[styles.goBackLabel, { color: t.secondary }]}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const activeDay = days[selectedDayIndex];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Review Import</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayTabsRow}
      >
        {days.map((d, i) => (
          <TouchableOpacity
            key={d.dayIndex}
            style={[
              styles.dayTab,
              i === selectedDayIndex && { backgroundColor: t.accent, borderColor: t.accent },
            ]}
            onPress={() => setSelectedDayIndex(i)}
          >
            <Text
              style={[
                styles.dayTabLabel,
                i === selectedDayIndex && { color: t.onAccent },
              ]}
            >
              {d.dayLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.helperText, { color: t.secondary }]}>
          Double-check the details extracted for {activeDay.dayLabel} before saving.
        </Text>
        {activeDay.classes.map((c, i) => (
          <ClassCard
            key={c.id}
            index={i}
            entry={c}
            onChange={(patch) => updateClass(activeDay.dayIndex, c.id, patch)}
            onDelete={() => deleteClass(activeDay.dayIndex, c.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Save Timetable" icon="checkmark" onPress={handleConfirm} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  loadingTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 17, marginTop: spacing.xl },
  loadingSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorActions: { alignSelf: 'stretch', marginTop: spacing.xl },
  goBackButton: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  goBackLabel: { fontSize: 14, fontWeight: '700' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  dayTabsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  dayTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayTabActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  dayTabLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  dayTabLabelActive: { color: '#FFFFFF' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  helperText: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.lg },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
