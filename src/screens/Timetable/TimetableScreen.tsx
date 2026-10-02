import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { DayTimeGrid, GridReminder } from '../../components/DayTimeGrid';
import { EmptyState } from '../../components/EmptyState';
import { WheelDatePicker } from '../../components/WheelPicker';
import { ChooseFormatSheet } from '../../components/ChooseFormatSheet';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useRemindersStore } from '../../store/useRemindersStore';
import { CycleType } from '../../types';
import { TimetableStackParamList } from '../../navigation/types';
import { getWeekdayDates, isSameDate, formatWeekdayShort } from '../../lib/date';
import { useIsTablet } from '../../lib/useIsTablet';
import {
  MonthGrid,
  TimetableView,
  ViewSwitcher,
  WeekGrid,
  entriesForClasses,
  DayEntry,
} from '../../components/TimetableViews';

// Same category accents the home screen and reminders list use.
function reminderColor(category: string): string {
  if (category === 'Exam') return colors.rose;
  if (category === 'Personal') return colors.green;
  return colors.amber;
}

type Props = NativeStackScreenProps<TimetableStackParamList, 'TimetableHome'>;

export function TimetableScreen({ route, navigation }: Props) {
  const t = useBaseTheme();
  const timetable = useTimetableStore((s) => s.timetable);
  const createTimetable = useTimetableStore((s) => s.createTimetable);
  const cycleStartDate = useTimetableStore((s) => s.cycleStartDate);
  const setCycleStartDate = useTimetableStore((s) => s.setCycleStartDate);
  const reminders = useRemindersStore((s) => s.reminders);
  const getCycleDayIndex = useTimetableStore((s) => s.getCycleDayIndex);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedOffset, setSelectedOffset] = useState<number>(0); // 0–4 within the shown week
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Week and month need a tablet's width to stay readable, so the phone has
  // only the day view and never shows the switcher.
  const isTablet = useIsTablet();
  const [view, setView] = useState<TimetableView>('day');
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const effectiveView: TimetableView = isTablet ? view : 'day';

  const weekDates = useMemo(() => getWeekdayDates(weekIndex), [weekIndex]);
  const today = useMemo(() => new Date(), []);

  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.openFormatSheet) {
        setSheetVisible(true);
        navigation.setParams({ openFormatSheet: undefined });
      }
    }, [route.params?.openFormatSheet, navigation])
  );

  useEffect(() => {
    if (!timetable) return;
    const todayIdxInWeek = weekDates.findIndex((d) => isSameDate(d, today));
    setSelectedOffset(todayIdxInWeek >= 0 ? todayIdxInWeek : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetable?.cycleType]);

  const handleToggleWeek = () => setWeekIndex(weekIndex === 0 ? 1 : 0);

  const handleSelectFormat = (cycleType: CycleType) => {
    createTimetable(cycleType);
    setWeekIndex(0);
    setSelectedOffset(0);
    setSheetVisible(false);
  };

  const handleImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    navigation.navigate('AIImportPreview', {
      cycleType: timetable?.cycleType ?? 5,
      fileUri: asset.uri,
      mimeType: asset.mimeType,
    });
  };

  const handleEdit = () => {
    navigation.navigate('DayScheduleEditor', {
      dayIndex: selectedDayIndex,
      cycleType: timetable?.cycleType ?? 5,
    });
  };

  const isTenDay = timetable?.cycleType === 10;
  const selectedDate = weekDates[selectedOffset];
  // Resolved through the store so this page and the home screen always agree on
  // which cycle day a given date is.
  const selectedDayIndex = selectedDate ? getCycleDayIndex(selectedDate) ?? 0 : 0;
  const selectedDay = timetable?.days.find((d) => d.dayIndex === selectedDayIndex);

  // Reminders due on the day being shown, drawn in the same grid as the classes
  // so a reminder landing inside a period splits that row instead of hiding it.
  // Daily repeating reminders land on every day.
  const dayReminders: GridReminder[] = useMemo(() => {
    if (!selectedDate) return [];
    return reminders
      .filter((r) => {
        if (r.done || !r.enabled) return false;
        const due = new Date(r.dueDate);
        return r.repeating || isSameDate(due, selectedDate);
      })
      .map((r) => {
        const due = new Date(r.dueDate);
        return {
          id: r.id,
          title: r.title,
          color: reminderColor(r.category),
          minutes: due.getHours() * 60 + due.getMinutes(),
          meta: r.subject || (r.repeating ? 'Every day' : ''),
        };
      });
  }, [reminders, selectedDate]);

  // Classes plus reminders for any date, which is what the week and month
  // views place. Resolved through the store so every view agrees on which
  // cycle day a date falls on.
  const entriesFor = React.useCallback(
    (date: Date): DayEntry[] => {
      const index = getCycleDayIndex(date);
      const classes = index === null ? [] : timetable?.days.find((d) => d.dayIndex === index)?.classes ?? [];
      const dayEntries = entriesForClasses(classes);

      const due: DayEntry[] = reminders
        .filter((r) => {
          if (r.done || !r.enabled) return false;
          return r.repeating || isSameDate(new Date(r.dueDate), date);
        })
        .map((r) => {
          const at = new Date(r.dueDate);
          const minutes = at.getHours() * 60 + at.getMinutes();
          return {
            id: `${r.id}-${date.toDateString()}`,
            title: r.title,
            color: reminderColor(r.category),
            startMinutes: minutes,
            endMinutes: minutes + 30,
            meta: r.subject || (r.repeating ? 'Every day' : ''),
            isReminder: true,
          };
        });

      return [...dayEntries, ...due].sort((a, b) => a.startMinutes - b.startMinutes);
    },
    [timetable, reminders, getCycleDayIndex]
  );

  const openDay = React.useCallback(
    (date: Date) => {
      const index = weekDates.findIndex((d) => isSameDate(d, date));
      if (index >= 0) setSelectedOffset(index);
      setView('day');
    },
    [weekDates]
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={[typography.screenTitle, { color: t.text }]}>Timetable</Text>

        {/* Absolutely centred so it sits in the middle of the header, not in
            the middle of the space the title and buttons leave over. */}
        {timetable && isTablet && (
          <View style={styles.headerCenter} pointerEvents="box-none">
            <ViewSwitcher value={view} onChange={setView} />
          </View>
        )}
        <View style={styles.headerButtons}>
          {timetable && (
            <TouchableOpacity style={styles.editButton} onPress={handleEdit} activeOpacity={0.85}>
              <Ionicons name="pencil" size={14} color={colors.textPrimary} />
              <Text style={styles.editLabel}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: t.accent }]}
            onPress={handleImport}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={t.onAccent} />
            <Text style={[styles.importLabel, { color: t.onAccent }]}>Import</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!timetable ? (
        <View style={styles.centerFill}>
          <EmptyState
            icon="calendar-outline"
            title="No timetable yet"
            subtitle="Set up your weekly schedule or import one with AI"
            actionLabel="Timetable"
            actionIcon="add"
            onAction={() => setSheetVisible(true)}
          />
        </View>
      ) : (
        <>
          {/* The cycle's week toggle drives which five days are shown, so it
              belongs to the day and week views and means nothing in a month. */}
          {isTenDay && effectiveView !== 'month' && (
            <>
              <View style={styles.weekRow}>
                <View style={{ width: 40 }} />
                {/* Tapping the week title is how the cycle start is changed once
                    it's been set — the row itself no longer sits on the page. */}
                <TouchableOpacity onPress={() => setDatePickerOpen(true)} activeOpacity={0.7} hitSlop={10}>
                  <Text style={[styles.weekLabel, { color: t.text }]}>Week {weekIndex + 1}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.weekChevron}
                  onPress={handleToggleWeek}
                  activeOpacity={0.85}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={weekIndex === 0 ? 'chevron-forward' : 'chevron-back'}
                    size={18}
                    color={t.accentLight}
                  />
                </TouchableOpacity>
              </View>

              {/* Before a date is set this is a prominent prompt. Once it's set the
                  control collapses to a quiet one-line record of the date, which
                  can still be tapped to change it. */}
              {!cycleStartDate && !datePickerOpen && (
                <TouchableOpacity
                  style={[styles.cycleStartRow, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                  onPress={() => setDatePickerOpen(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flag-outline" size={15} color={t.onCardSecondary} />
                  <Text style={[styles.cycleStartLabel, { color: t.onCardSecondary }]}>Cycle start (Day 1)</Text>
                  <Text style={[styles.cycleStartValue, { color: t.onCard }]}>Set date</Text>
                  <Ionicons name="chevron-down" size={15} color={t.onCardMuted} />
                </TouchableOpacity>
              )}

              {datePickerOpen && (
                <View style={styles.datePickerPanel}>
                  <WheelDatePicker
                    value={cycleStartDate ? new Date(cycleStartDate) : new Date()}
                    onChange={(d) => setCycleStartDate(d.toISOString())}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      // Record the wheel's current value even if it was never moved.
                      if (!cycleStartDate) setCycleStartDate(new Date().toISOString());
                      setDatePickerOpen(false);
                    }}
                    style={styles.datePickerDone}
                  >
                    <Text style={[styles.datePickerDoneText, { color: t.accentLight }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {effectiveView === 'week' && (
            <View style={styles.gridWrap}>
              <WeekGrid dates={weekDates} entriesFor={entriesFor} today={today} onPressDay={openDay} />
            </View>
          )}

          {effectiveView === 'month' && (
            <>
              <View style={styles.monthNav}>
                <TouchableOpacity
                  onPress={() =>
                    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))
                  }
                  hitSlop={10}
                >
                  <Ionicons name="chevron-back" size={20} color={t.accentLight} />
                </TouchableOpacity>
                <Text style={[styles.monthNavLabel, { color: t.text }]}>
                  {monthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))
                  }
                  hitSlop={10}
                >
                  <Ionicons name="chevron-forward" size={20} color={t.accentLight} />
                </TouchableOpacity>
              </View>
              <View style={styles.gridWrap}>
                <MonthGrid
                  month={monthAnchor}
                  entriesFor={entriesFor}
                  today={today}
                  onPressDay={openDay}
                />
              </View>
            </>
          )}

          {effectiveView === 'day' && (
            <>
            {/* Compact date strip: small weekday label beside the date, with the
                selected day's number sitting in a filled circle. Today keeps the
                accent colour when it isn't the selection, so it stays findable. */}
            <View style={[styles.dayStripRow, { borderBottomColor: t.cardBorder }]}>
              {weekDates.map((date, i) => {
                const isSelected = i === selectedOffset;
                const isToday = isSameDate(date, today);
                return (
                  <TouchableOpacity
                    key={date.toISOString()}
                    style={styles.dayItem}
                    onPress={() => setSelectedOffset(i)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayWeekday,
                        { color: isSelected ? t.text : t.muted },
                      ]}
                    >
                      {formatWeekdayShort(date)}
                    </Text>
                    <View style={[styles.dayCircle, isSelected && { backgroundColor: t.accent }]}>
                      <Text
                        style={[
                          styles.dayNumber,
                          {
                            color: isSelected ? t.onAccent : isToday ? t.accentLight : t.text,
                          },
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Names the one day on screen, so the pills above read as a day
                switcher rather than the grid looking like a whole week. */}
            <View style={[styles.dayHeading, { borderBottomColor: t.cardBorder }]}>
              <Text style={[styles.dayHeadingText, { color: t.text }]}>
                {selectedDay?.dayLabel ?? ''}
              </Text>
            </View>

            {/* The grid always renders, so an empty day still reads as a calendar
                rather than switching to a different kind of screen. */}
            <View style={styles.gridWrap}>
              <DayTimeGrid
                classes={selectedDay?.classes ?? []}
                reminders={dayReminders}
                isToday={selectedDate ? isSameDate(selectedDate, today) : false}
                onPressClass={handleEdit}
                onPressReminder={(id) => navigation.navigate('AddReminder', { reminderId: id })}
              />
              {!selectedDay?.classes.length && !dayReminders.length && (
                <View style={styles.emptyOverlay} pointerEvents="box-none">
                  <Text style={[styles.emptyDayText, { color: t.muted }]}>
                    Nothing scheduled for {selectedDay?.dayLabel ?? 'this day'}
                    {isTenDay ? ` · Week ${weekIndex + 1}` : ''}
                  </Text>
                  <TouchableOpacity
                    style={[styles.addClassesButton, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                    onPress={handleEdit}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="pencil" size={14} color={t.accentLight} />
                    <Text style={[styles.addClassesLabel, { color: t.accentLight }]}>Add classes</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            </>
          )}
        </>
      )}

      <ChooseFormatSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSelect={handleSelectFormat}
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
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editLabel: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.xs,
  },
  importLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  centerFill: { flex: 1, justifyContent: 'center' },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  weekLabel: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  cycleStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  cycleStartLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  cycleStartLogged: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  cycleStartLoggedText: { fontSize: 12, fontWeight: '600' },
  cycleStartValue: { fontSize: 13, fontWeight: '700' },
  datePickerPanel: { marginHorizontal: spacing.xl, marginTop: -spacing.xs, marginBottom: spacing.xs, alignItems: 'center' },
  datePickerDone: { alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: spacing.xl },
  datePickerDoneText: { fontWeight: '700', fontSize: 15 },
  weekChevron: {
    width: 40,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStripRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    // A rule of its own separates the date picker from the day it selects, so
    // the two rows don't read as one block of header.
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  dayItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
  },
  dayWeekday: { fontSize: 12, fontWeight: '600' },
  dayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: { fontSize: 13, fontWeight: '700' },
  dayHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  dayHeadingText: { fontSize: 17, fontWeight: '800' },
  dayHeadingDate: { fontSize: 13, fontWeight: '600' },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  monthNavLabel: { fontSize: 17, fontWeight: '800', minWidth: 190, textAlign: 'center' },
  gridWrap: { flex: 1 },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyDayText: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.lg },
  addClassesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  addClassesLabel: { color: colors.purpleLight, fontWeight: '700', fontSize: 14 },
  classCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  classCardName: { fontWeight: '800', fontSize: 16 },
  classDivider: { height: 1, borderRadius: 1, marginVertical: spacing.sm },
  classCardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  classCardTime: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  classCardMeta: { color: colors.textSecondary, fontSize: 12, flex: 1 },
});
