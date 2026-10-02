import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { LineGridBackground } from '../../components/LineGridBackground';
import { Avatar } from '../../components/Avatar';
import { StreakFlame } from '../../components/StreakFlame';
import { StudyTotalsCard } from '../../components/StudyTotalsCard';
import { WeeklyStudyCard } from '../../components/WeeklyStudyCard';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useRemindersStore } from '../../store/useRemindersStore';
import { useSubjectDataStore } from '../../store/useSubjectDataStore';
import { useAppOpenStore } from '../../store/useAppOpenStore';
import {
  useWidgetsStore,
  WIDGET_META,
  WidgetId,
  SPAN_CAPACITY,
  spanFor,
} from '../../store/useWidgetsStore';
import { useIsTablet } from '../../lib/useIsTablet';
import { NextLessonWidget } from '../../components/NextLessonWidget';
import { ClockWidget } from '../../components/ClockWidget';
import { AnalogClockWidget } from '../../components/AnalogClockWidget';
import { DateWidget } from '../../components/DateWidget';
import { ChecklistWidget } from '../../components/ChecklistWidget';
import { ExamFocusWidget } from '../../components/ExamFocusWidget';
import { WidgetSettingsSheet } from '../../components/WidgetSettingsSheet';
import { formatDayLeftLabel, formatHeaderDate, todayWeekdayName, formatTimeLabel, daysUntil, formatShortDate, formatTimeOfDay, timeGreeting } from '../../lib/date';
import { useAuthStore } from '../../store/useAuthStore';
import { RootTabParamList, HomeStackParamList } from '../../navigation/types';

type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList>,
  BottomTabNavigationProp<RootTabParamList>
>;

/** First name for the greeting; falls back to something friendly if it's blank. */
function firstNameOf(fullName?: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first || 'there';
}

function initialsOf(fullName?: string, email?: string): string {
  const source = (fullName ?? '').trim() || (email ?? '');
  const parts = source.split(/[\s@.]+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// Side-bar accent colour per reminder category: exam=pink, assignment=orange, personal=green.
function reminderAccentColor(category: string): string {
  if (category === 'Exam') return colors.rose;
  if (category === 'Personal') return colors.green;
  return colors.amber;
}

// Urgency pill colour by days until due: ≤2d red, 3–5d amber, 6d+ green.
function urgencyStyle(dueDate: string): { color: string; bg: string } {
  const d = daysUntil(dueDate);
  if (d <= 2) return { color: colors.danger, bg: colors.dangerBg };
  if (d <= 5) return { color: colors.amber, bg: colors.amberBg };
  return { color: colors.green, bg: 'rgba(34, 197, 94, 0.14)' };
}

function timeToMinutes(time24: string): number | null {
  if (!time24) return null;
  const [h, m] = time24.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Slides + fades its child in from the side as it crosses the top of the
 * viewport — so scrolling back up to the schedule reveals each slot smoothly.
 * Position is derived from the live scroll offset, so it re-plays each time the
 * row re-enters view.
 */
function RevealRow({
  scrollY,
  baseY,
  children,
}: {
  scrollY: Animated.Value;
  baseY: number;
  children: React.ReactNode;
}) {
  const [rowY, setRowY] = useState(0);
  const ready = rowY > 0;
  const abs = baseY + rowY;
  // A long, eased run-out: the row barely stirs for the first half of the travel
  // and only lets go close to the top, so it dissolves rather than blinking out.
  const range = [abs - 190, abs - 142, abs - 98, abs - 56, abs - 14];
  const track = (output: number[]) =>
    ready
      ? scrollY.interpolate({ inputRange: range, outputRange: output, extrapolate: 'clamp' })
      : output[0];
  const translateX = track([0, 2, 9, 24, 44]);
  const opacity = track([1, 0.98, 0.84, 0.42, 0]);
  const scale = track([1, 1, 0.995, 0.975, 0.95]);
  return (
    <Animated.View
      onLayout={(e) => setRowY(e.nativeEvent.layout.y)}
      style={{ opacity, transform: [{ translateX }, { scale }] }}
    >
      {children}
    </Animated.View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const insets = useSafeAreaInsets();

  const profile = useAuthStore((s) => s.profile);
  const email = useAuthStore((s) => s.session?.user.email);

  const timetable = useTimetableStore((s) => s.timetable);
  const getClassesForDate = useTimetableStore((s) => s.getClassesForDate);
  const getSubjects = useTimetableStore((s) => s.getSubjects);

  const reminders = useRemindersStore((s) => s.reminders);
  const getUpcoming = useRemindersStore((s) => s.getUpcoming);

  const bySubject = useSubjectDataStore((s) => s.bySubject); // subscribed so streak/dots refresh when sessions log
  const getOverallStreak = useSubjectDataStore((s) => s.getOverallStreak);
  const consumeStreakIgnite = useAppOpenStore((s) => s.consumeStreakIgnite);
  // Bumped to replay the dormant→flame ignition burst when a new streak begins.
  const [igniteNonce, setIgniteNonce] = useState(0);
  const getStudiedSubjectsOn = useSubjectDataStore((s) => s.getStudiedSubjectsOn);

  const t = useBaseTheme();

  // --- Stat button data ---
  const streak = getOverallStreak();

  // Play the ignition burst once per new streak: identify the streak by the day
  // it began (today − (streak−1) days). When the user re-lights the flame after a
  // gap, that start-day is new, so returning to Home plays the burst.
  useFocusEffect(
    useCallback(() => {
      if (streak <= 0) return;
      const start = new Date();
      start.setDate(start.getDate() - (streak - 1));
      const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
      if (consumeStreakIgnite(key)) setIgniteNonce((n) => n + 1);
    }, [streak, consumeStreakIgnite])
  );

  const todaysClasses = timetable ? getClassesForDate(new Date()) : [];
  const sortedClasses = [...todaysClasses].sort(
    (a, b) => (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0)
  );
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const classesLeft = todaysClasses.filter((c) => {
    const end = timeToMinutes(c.endTime);
    return end === null || end > nowMin;
  }).length;

  // --- Calendar strip: 7 days centered on today ---
  const subjectColorByName = new Map(getSubjects().map((s) => [s.name, s.color]));
  const calendarDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + (i - 3));
    return d;
  });
  const todayDate = now.getDate();

  // The dot row only earns its height when one of the seven days on screen
  // actually has study to show — otherwise the pill hugs the date numbers.
  const showDots = calendarDays.some((d) => getStudiedSubjectsOn(d).length > 0);

  const upcomingReminders = getUpcoming();
  // Next exam (soonest upcoming) + whole days until it, for the home stat button.
  const nextExam =
    [...reminders]
      .filter((r) => r.category === 'Exam' && !r.done && new Date(r.dueDate).getTime() > Date.now())
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] ?? null;
  const examDays = nextExam ? Math.max(0, daysUntil(nextExam.dueDate)) : null;

  // Minutes studied since midnight, for the "studied today" widget.
  const minutesToday = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const from = midnight.getTime();
    let seconds = 0;
    Object.values(bySubject).forEach((data) =>
      data.studySessions.forEach((s) => {
        if (s.startedAt >= from) seconds += s.durationSec;
      })
    );
    return Math.round(seconds / 60);
  }, [bySubject]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const [scheduleTop, setScheduleTop] = useState(0);

  // --- Customisable widget strip ---
  const isTablet = useIsTablet();
  const widgetIds = useWidgetsStore((s) => s.widgets);
  const [widgetSheetOpen, setWidgetSheetOpen] = useState(false);
  const [strip, setStrip] = useState({ y: 0, height: 0 });

  // Widgets share a row with others of the same width, up to that width's
  // capacity — three small, two medium, one full. A widget may ask for a
  // different width on a tablet, where a single cell is already phone-sized.
  const widgetRows = useMemo(() => {
    const rows: WidgetId[][] = [];
    widgetIds.forEach((id) => {
      const meta = WIDGET_META[id];
      if (!meta) return;
      const span = spanFor(meta, isTablet);
      const last = rows[rows.length - 1];
      const canJoin =
        last && spanFor(WIDGET_META[last[0]], isTablet) === span && last.length < SPAN_CAPACITY[span];
      if (canJoin) last.push(id);
      else rows.push([id]);
    });
    return rows;
  }, [widgetIds, isTablet]);

  // The strip dissolves as it slides under the top of the screen, on the same
  // easing as the schedule rows below it. The runway is scaled to the strip's
  // own height, so adding a tall widget doesn't make the fade feel rushed.
  const stripRange = [
    strip.y - 40,
    strip.y + strip.height * 0.2,
    strip.y + strip.height * 0.55,
    strip.y + strip.height * 0.95,
  ];
  const stripTrack = (output: number[]) =>
    strip.height > 0
      ? scrollY.interpolate({ inputRange: stripRange, outputRange: output, extrapolate: 'clamp' })
      : output[0];
  const stripOpacity = stripTrack([1, 0.96, 0.5, 0]);
  const stripShift = stripTrack([0, -4, -14, -28]);

  const widgetAction: Partial<Record<WidgetId, () => void>> = {
    exam: () => navigation.navigate('RemindersTab'),
    classesLeft: () => navigation.navigate('TimetableTab'),
    nextLesson: () => navigation.navigate('TimetableTab'),
    studyToday: () => navigation.navigate('StudyBreakdown'),
    checklist: () => navigation.navigate('RemindersTab'),
    date: () => navigation.navigate('StudyCalendar'),
  };

  function renderWidgetBody(id: WidgetId) {
    switch (id) {
      case 'streak':
        return (
          <>
            <View style={styles.flameWrap}>
              <StreakFlame lit={streak > 0} igniteNonce={igniteNonce} size={44} />
            </View>
            <Text style={[styles.statNumber, styles.statNumberBig, { color: t.onTile }]}>{streak}</Text>
            <Text style={[styles.statLabel, { color: t.onTileMuted }]}>day streak</Text>
          </>
        );
      case 'exam':
        return (
          <>
            <Text style={[styles.statNumber, styles.statNumberBig, { color: t.onTile }]}>
              {examDays !== null ? examDays : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: t.onTileMuted }]}>
              {examDays !== null ? `days to${'\n'}next exam` : 'no exams'}
            </Text>
          </>
        );
      case 'classesLeft':
        return (
          <>
            <Text style={[styles.statNumber, styles.statNumberBig, { color: t.onTile }]}>{classesLeft}</Text>
            <Text style={[styles.statLabel, { color: t.onTileMuted }]}>classes left{'\n'}today</Text>
          </>
        );
      case 'studyToday':
        return (
          <>
            <Text style={[styles.statNumber, styles.statNumberBig, { color: t.onTile }]}>{minutesToday}</Text>
            <Text style={[styles.statLabel, { color: t.onTileMuted }]}>minutes{'\n'}studied today</Text>
          </>
        );
      case 'nextLesson':
        return <NextLessonWidget />;
      case 'clock':
        return <ClockWidget />;
      case 'analogClock':
        return <AnalogClockWidget />;
      case 'date':
        return <DateWidget />;
      case 'checklist':
        return <ChecklistWidget />;
      case 'examFocus':
        return <ExamFocusWidget />;
      default:
        return null;
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: t.base }]}>
      <LineGridBackground />
      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {/* Overscroll patch: pulling down past the top would otherwise expose the
            page background as a thin bar above the tile. This pulls the tile's own
            colour up behind the bounce so nothing of the background shows. */}
        <View
          pointerEvents="none"
          style={[styles.overscrollPatch, { backgroundColor: t.tileGradient[0] }]}
        />

        {/* ---- Elevated gradient tile (accent → base) ---- */}
        <LinearGradient
          colors={t.tileGradient}
          locations={[0.3, 0.5, 0.7]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { paddingTop: insets.top + spacing.xl }]}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, { color: t.onTile }]}>
                {timeGreeting()}, {firstNameOf(profile?.full_name)}
              </Text>
              <Text style={[styles.dateLabel, { color: t.onTileMuted }]}>{formatHeaderDate()}</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('ProfileTab')}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.slotPressed}
            >
              <Avatar initials={initialsOf(profile?.full_name, email)} />
            </Pressable>
          </View>

          {/* ---- Widget strip — long-press any widget to rearrange it ---- */}
          <Animated.View
            onLayout={(e) =>
              setStrip({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })
            }
            style={[styles.widgetStrip, { opacity: stripOpacity, transform: [{ translateY: stripShift }] }]}
          >
            {widgetRows.map((row, i) => (
              <View key={i} style={styles.statRow}>
                {row.map((id) => {
                  const bare = WIDGET_META[id].bare;
                  return (
                    <Pressable
                      key={id}
                      onPress={widgetAction[id]}
                      onLongPress={() => setWidgetSheetOpen(true)}
                      delayLongPress={350}
                      style={({ pressed }) => [
                        bare ? styles.bareSlot : [styles.statCard, { backgroundColor: t.cardScrim }],
                        pressed && styles.slotPressed,
                      ]}
                    >
                      {renderWidgetBody(id)}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Animated.View>

          {/* ---- Calendar strip (fixed styling — never themed) ---- */}
          <View style={styles.calendarPill}>
            {calendarDays.map((d) => {
              const isToday = d.getDate() === todayDate && d.getMonth() === now.getMonth();
              const isPast = d < now && !isToday;
              const studied = getStudiedSubjectsOn(d);
              const dotColors = studied.slice(0, 3).map((name) => subjectColorByName.get(name) ?? t.accent);
              return (
                <View key={d.toISOString()} style={styles.calendarDay}>
                  <View style={[styles.calendarDateWrap, isToday && styles.calendarToday]}>
                    <Text
                      style={[
                        styles.calendarDate,
                        isPast && styles.calendarDatePast,
                        isToday && styles.calendarDateToday,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                  {showDots && (
                    <View style={styles.dotRow}>
                      {dotColors.map((c, i) => (
                        <View key={i} style={[styles.dot, { backgroundColor: c }]} />
                      ))}
                      {studied.length > 3 && (
                        <View style={styles.dotPlusWrap}>
                          <Text style={styles.dotPlus}>+</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </LinearGradient>

        {/* ---- Base layer content ---- */}
        <View style={styles.baseContent} onLayout={(e) => setScheduleTop(e.nativeEvent.layout.y)}>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>TODAY'S SCHEDULE</Text>
          {sortedClasses.length === 0 ? (
            <Text style={[styles.emptyText, { color: t.muted }]}>No classes today</Text>
          ) : (
            sortedClasses.map((c) => (
              <RevealRow key={c.id} scrollY={scrollY} baseY={scheduleTop}>
                <View style={styles.timelineRow}>
                  <Text style={[styles.timelineTime, { color: t.text }]}>
                    {c.startTime ? formatTimeLabel(c.startTime).replace(/ [AP]M/, '') : '--'}
                  </Text>
                  <View style={[styles.timelineCard, { backgroundColor: c.color }]}>
                    <Text style={styles.timelineName}>{c.name || 'Untitled Class'}</Text>
                    <View style={styles.timelineDivider} />
                    <View style={styles.timelineMetaRow}>
                      <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.timelineMeta}>
                        {c.startTime}{c.endTime ? `– ${c.endTime}` : ''}
                      </Text>
                    </View>
                    {Boolean(c.room || c.teacher) && (
                      <View style={styles.timelineMetaRow}>
                        <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
                        <Text style={styles.timelineMeta}>
                          {[c.room, c.teacher].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </RevealRow>
            ))
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: t.muted }]}>UPCOMING REMINDERS</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RemindersTab')}>
              <Text style={[styles.seeAll, { color: t.accentLight }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {upcomingReminders.length === 0 ? (
            <Text style={[styles.emptyText, { color: t.muted }]}>No upcoming reminders</Text>
          ) : (
            upcomingReminders.map((r) => {
              // Repeating reminders aren't "urgent" — they just recur, so they get
              // the neutral Personal colour rather than the red/amber/green scale.
              const urgency = r.repeating
                ? { color: colors.teal, bg: colors.tealBg }
                : urgencyStyle(r.dueDate);
              return (
                <View key={r.id} style={[styles.reminderCard, { backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder }]}>
                  <View style={[styles.reminderAccent, { backgroundColor: reminderAccentColor(r.category) }]} />
                  <View style={styles.reminderBody}>
                    <View style={styles.reminderTopRow}>
                      <Text style={[styles.reminderTitle, { color: t.onCard }]} numberOfLines={1}>
                        {r.title}
                      </Text>
                      <View style={[styles.reminderPill, { backgroundColor: urgency.bg }]}>
                        <Text style={[styles.reminderPillText, { color: urgency.color }]}>
                          {r.repeating ? 'Daily' : formatDayLeftLabel(r.dueDate).replace(' left', '')}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.reminderDivider, { backgroundColor: t.cardBorder }]} />
                    <Text style={[styles.reminderDue, { color: t.onCardMuted }]}>
                      {r.repeating
                        ? `Every day at ${formatTimeOfDay(r.dueDate)}`
                        : `Due on ${formatShortDate(r.dueDate)}`}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          <Text style={[styles.sectionLabel, { color: t.muted, marginTop: spacing.xxl }]}>
            STUDY STATS
          </Text>
          <StudyTotalsCard onPressDetails={() => navigation.navigate('StudyBreakdown')} />
          <WeeklyStudyCard onPressDetails={() => navigation.navigate('StudyCalendar')} />
        </View>
      </Animated.ScrollView>

      <WidgetSettingsSheet visible={widgetSheetOpen} onClose={() => setWidgetSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl },
  overscrollPatch: { height: 600, marginTop: -600 },
  tile: {
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    // No edge line along the lip — depth comes purely from a soft drop shadow,
    // so the tile reads as sitting above the page rather than being outlined on it.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  greeting: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  dateLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  widgetStrip: { gap: spacing.md, marginBottom: spacing.xl },
  statRow: { flexDirection: 'row', gap: spacing.md },
  bareSlot: { flex: 1 },
  slotPressed: { opacity: 0.82 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(10, 8, 18, 0.55)',
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 118,
  },
  flameWrap: {
    height: 44,
    justifyContent: 'flex-end',
    marginBottom: -12,
  },
  statNumber: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  statNumberBig: { fontSize: 34 },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  calendarPill: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  calendarDay: { flex: 1, alignItems: 'center' },
  calendarDateWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarToday: { backgroundColor: '#111111' },
  calendarDate: { color: '#1A1A1A', fontSize: 15, fontWeight: '700' },
  calendarDatePast: { color: '#B9B9C2' },
  calendarDateToday: { color: '#FFFFFF' },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 10,
    marginTop: 2,
    gap: 3,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotPlusWrap: {
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotPlus: { color: '#8A8A93', fontSize: 11, fontWeight: '800', lineHeight: 11 },
  baseContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  emptyText: { fontSize: 14, marginBottom: spacing.xl },
  timelineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  timelineTime: {
    width: 52,
    fontSize: 13,
    fontWeight: '700',
  },
  timelineCard: {
    flex: 1,
    // Squarer than the cards elsewhere on the page: a schedule reads as a
    // column of blocks, and the softer corner made each lesson float.
    borderRadius: 10,
    padding: spacing.lg,
  },
  timelineName: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  timelineDivider: { height: 1, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.28)', marginVertical: spacing.sm },
  timelineMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  timelineMeta: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  seeAll: { color: colors.purpleLight, fontWeight: '700', fontSize: 14 },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  reminderAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: spacing.md,
  },
  reminderBody: { flex: 1 },
  reminderTopRow: { flexDirection: 'row', alignItems: 'center' },
  reminderTitle: { flex: 1, color: colors.textPrimary, fontWeight: '700', fontSize: 15, marginRight: spacing.sm },
  reminderPill: {
    backgroundColor: colors.dangerBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  reminderPillText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  reminderDivider: { height: 1, borderRadius: 1, marginVertical: spacing.sm },
  reminderDue: { fontSize: 12, fontWeight: '600' },
});
