import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, classColors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { ClassCard } from '../../components/ClassCard';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { useTimetableStore } from '../../store/useTimetableStore';
import { ClassEntry } from '../../types';
import { TimetableStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TimetableStackParamList, 'DayScheduleEditor'>;

export function DayScheduleEditor({ route, navigation }: Props) {
  const t = useBaseTheme();
  const { dayIndex } = route.params;
  const timetable = useTimetableStore((s) => s.timetable);
  const setDayClasses = useTimetableStore((s) => s.setDayClasses);
  const deleteAll = useTimetableStore((s) => s.deleteAll);

  const day = timetable?.days.find((d) => d.dayIndex === dayIndex);
  const [classes, setClasses] = useState<ClassEntry[]>(day?.classes ?? []);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const handleSave = () => {
    setDayClasses(dayIndex, classes);
    navigation.goBack();
  };

  const addClass = () => {
    setClasses((prev) => [
      ...prev,
      {
        id: `class-${Date.now()}`,
        name: '',
        color: classColors[prev.length % classColors.length],
        room: '',
        teacher: '',
        startTime: '',
        endTime: '',
      },
    ]);
  };

  const updateClass = (id: string, patch: Partial<ClassEntry>) =>
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const deleteClass = (id: string) => setClasses((prev) => prev.filter((c) => c.id !== id));

  const handleDeleteAll = () => setDeleteModalVisible(true);

  const confirmDeleteAll = () => {
    deleteAll();
    setDeleteModalVisible(false);
    navigation.navigate('TimetableHome', { openFormatSheet: true });
  };

  if (!day) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]}>
        <Text style={[styles.missing, { color: t.secondary }]}>Day not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.editingLabel, { color: t.muted }]}>EDITING</Text>
          <Text style={[styles.headerTitle, { color: t.text }]}>{day.dayLabel} Schedule</Text>
        </View>
        <TouchableOpacity onPress={handleSave} hitSlop={10}>
          <Text style={[styles.saveLabel, { color: t.accentLight }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {classes.map((c, i) => (
          <ClassCard
            key={c.id}
            index={i}
            entry={c}
            onChange={(patch) => updateClass(c.id, patch)}
            onDelete={() => deleteClass(c.id)}
          />
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addClass} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={t.accentLight} />
          <Text style={[styles.addLabel, { color: t.accentLight }]}>Add Class</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAllButton} onPress={handleDeleteAll} activeOpacity={0.8}>
          <Text style={styles.deleteAllLabel}>🗑 Delete All Timetable Data</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmDeleteModal
        visible={deleteModalVisible}
        title="Delete everything?"
        message="This removes all classes from every day. You'll be asked to choose a timetable format again."
        confirmLabel="Delete All"
        onCancel={() => setDeleteModalVisible(false)}
        onConfirm={confirmDeleteAll}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  missing: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxxl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitleWrap: { alignItems: 'center' },
  editingLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 2 },
  saveLabel: { color: colors.purpleLight, fontWeight: '700', fontSize: 16 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xxl,
  },
  addLabel: { color: colors.purpleLight, fontWeight: '700', fontSize: 15, marginLeft: spacing.sm },
  deleteAllButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteAllLabel: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
