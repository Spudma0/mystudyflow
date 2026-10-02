import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Smoothly slides its children open/closed by animating a measured height +
 * opacity. Works consistently on iOS, Android and web (unlike LayoutAnimation).
 */
function Collapsible({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  const [height, setHeight] = useState(0);
  const anim = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: collapsed ? 0 : 1,
      duration: 260,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [collapsed, anim]);

  return (
    <Animated.View
      style={{
        overflow: 'hidden',
        opacity: anim,
        height: height ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) : undefined,
      }}
    >
      {/* Normal-flow child measures its natural height even while the parent clips it. */}
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - height) > 0.5) setHeight(h);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing, APP_MAX_WIDTH } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { withAlpha } from '../../store/useThemeStore';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useSubjectDataStore } from '../../store/useSubjectDataStore';
import { useSubjectProfileStore } from '../../store/useSubjectProfileStore';
import { LessonMap as LessonMapView } from '../../components/LessonMap';
import { formatShortDate, formatStudyHM, WEEKDAY_NAMES, nextCycleClassDate } from '../../lib/date';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StudySummaryContent } from '../../components/StudySummaryContent';
import { StudySession } from '../../types';
import { SubjectsStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SubjectsStackParamList, 'SubjectDetail'>;

export function SubjectDetailScreen({ route, navigation }: Props) {
  const t = useBaseTheme();
  const { subjectName } = route.params;

  const timetable = useTimetableStore((s) => s.timetable);
  const cycleStartDate = useTimetableStore((s) => s.cycleStartDate);
  const getSubjects = useTimetableStore((s) => s.getSubjects);
  const subject = getSubjects().find((s) => s.name === subjectName);

  const subjectData = useSubjectDataStore((s) => s.getSubjectData(subjectName));

  const profile = useSubjectProfileStore((s) => s.bySubject[subjectName]);
  const hasProfile = Boolean(profile?.scan?.units?.length);

  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [viewingSession, setViewingSession] = useState<StudySession | null>(null);
  // Months start collapsed: a term of sessions otherwise buries the lesson map
  // and the start button under a list nobody opened the page to read.
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  // Named lesson the student tried to jump ahead to, for the inline notice.
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const toggleMonth = (label: string) =>
    setExpandedMonths((prev) => ({ ...prev, [label]: !prev[label] }));

  // Study sessions grouped by month, newest first, for the history section.
  const sessionMonths = (() => {
    const sorted = [...subjectData.studySessions].sort((a, b) => b.endedAt - a.endedAt);
    const groups: { label: string; sessions: StudySession[] }[] = [];
    for (const session of sorted) {
      const label = new Date(session.endedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.sessions.push(session);
      else groups.push({ label, sessions: [session] });
    }
    return groups;
  })();

  // Next class: for weekly (5-day) timetables we can resolve the soonest upcoming
  // calendar date across every day the subject appears. A 10-day cycle isn't
  // anchored to the calendar, so we show the cycle day label instead of a date.
  const nextClass = (() => {
    if (!timetable) return null;
    const matchingDays = timetable.days.filter((d) =>
      d.classes.some((c) => c.name === subjectName)
    );
    if (matchingDays.length === 0) return null;

    // If the cycle is anchored to a real date, resolve an exact upcoming date
    // for either a 5- or 10-day cycle.
    if (cycleStartDate) {
      const date = nextCycleClassDate(
        cycleStartDate,
        timetable.cycleType,
        matchingDays.map((d) => d.dayIndex)
      );
      if (date) return { label: formatShortDate(date.toISOString()) };
    }

    if (timetable.cycleType === 5) {
      const now = new Date();
      let best: { date: Date; dayLabel: string } | null = null;
      for (const d of matchingDays) {
        const targetIdx = WEEKDAY_NAMES.indexOf(d.dayLabel);
        if (targetIdx < 0) continue;
        let diff = targetIdx - now.getDay();
        if (diff < 0) diff += 7;
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
        if (!best || date.getTime() < best.date.getTime()) best = { date, dayLabel: d.dayLabel };
      }
      if (best) return { label: formatShortDate(best.date.toISOString()) };
    }

    // 10-day (or non-weekday) cycle: show the day label, not a bogus date.
    return { label: matchingDays[0].dayLabel };
  })();

  // A subject vanishes from here if its classes are removed from the timetable
  // while this screen sits in the stack. Without this the user is stranded on a
  // dead-end "Subject not found." screen that has no back button — pop straight
  // back to the Subjects list instead.
  useEffect(() => {
    if (!subject && navigation.canGoBack()) navigation.goBack();
  }, [subject, navigation]);

  if (!subject) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={t.text} />
          </TouchableOpacity>
          <View style={{ width: 26 }} />
        </View>
        <Text style={[styles.missing, { color: t.secondary }]}>Subject not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>

        {/* Prompt to profile the subject until it's been done; afterwards the
            same corner just offers a way back into the plan. */}
        <TouchableOpacity
          style={[
            styles.profileButton,
            hasProfile
              ? { backgroundColor: t.card, borderColor: t.cardBorder }
              : { backgroundColor: t.accent, borderColor: t.accent },
          ]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SubjectProfile', { subjectName })}
        >
          <Ionicons
            name={hasProfile ? 'map-outline' : 'sparkles'}
            size={14}
            color={hasProfile ? t.accentLight : t.onAccent}
          />
          <Text
            style={[styles.profileButtonLabel, { color: hasProfile ? t.accentLight : t.onAccent }]}
          >
            {hasProfile ? 'Study plan' : 'Complete subject profile'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.colorBar, { backgroundColor: subject.color }]} />
        <Text style={[styles.title, { color: t.text }, !subject.teacher && styles.titleNoTeacher]}>
          {subject.name}
        </Text>
        {!!subject.teacher && <Text style={[styles.subtitle, { color: t.secondary }]}>{subject.teacher}</Text>}

        <Card style={styles.nextClassCard}>
          <Ionicons name="calendar-outline" size={18} color={t.accentLight} />
          <Text style={[styles.nextClassText, { color: t.onCard }]}>
            {nextClass ? `Next class: ${nextClass.label}` : 'No upcoming classes scheduled'}
          </Text>
        </Card>

        {/* The lesson map, once the subject has been profiled. Tapping through
            reopens the wizard so the plan can be rebuilt or retargeted. */}
        {profile?.lessonMap && (
          <Section title="Lesson map">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('SubjectProfile', { subjectName })}
            >
              <Text style={[styles.planTitle, { color: t.text }]}>{profile.lessonMap.title}</Text>
              <Text style={[styles.planSummary, { color: t.secondary }]}>
                {profile.exam.hasExam && profile.exam.topicArea
                  ? `Aimed at: ${profile.exam.topicArea}`
                  : profile.lessonMap.summary}
              </Text>
            </TouchableOpacity>

            {!!lockedNotice && (
              <View style={[styles.lockedNotice, { backgroundColor: withAlpha(colors.amber, 0.14) }]}>
                <Ionicons name="lock-closed" size={14} color={colors.amber} />
                <Text style={[styles.lockedNoticeText, { color: t.text }]}>
                  Finish the lesson before it to unlock “{lockedNotice}”.
                </Text>
              </View>
            )}
            <LessonMapView
              lessons={profile.lessonMap.lessons}
              completedIds={profile.completedLessonIds}
              onPressLesson={(lesson) =>
                navigation.navigate('Lesson', { subjectName, lessonId: lesson.id })
              }
              onPressLocked={(lesson) => setLockedNotice(lesson.title)}
            />

            {/* Under the plan, because that is what it changes — and only for
                a student who chose a deep dive in the first place. It opens
                the wizard at the focus step rather than back at the textbook,
                which is settled by now. */}
            {!profile.exam.hasExam && !!profile.focusArea && (
              <TouchableOpacity
                style={[styles.focusRow, { backgroundColor: withAlpha(t.accent, 0.12) }]}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('SubjectProfile', { subjectName, startAt: 'focus' })
                }
              >
                <Ionicons name="telescope" size={15} color={t.accentLight} />
                <Text style={[styles.focusText, { color: t.text }]} numberOfLines={1}>
                  Deep dive: {profile.focusArea}
                </Text>
                <Text style={[styles.focusAction, { color: t.accentLight }]}>Change focus</Text>
              </TouchableOpacity>
            )}
          </Section>
        )}

        <Section title="Study History">
          {sessionMonths.length === 0 ? (
            <Text style={[styles.emptyHistory, { color: t.muted }]}>
              No study sessions yet. Tap “Start Study Session” below to begin.
            </Text>
          ) : (
            sessionMonths.map((month) => {
              const collapsed = !expandedMonths[month.label];
              return (
              <View key={month.label}>
                <TouchableOpacity
                  style={styles.monthHeader}
                  onPress={() => toggleMonth(month.label)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.monthLabel, { color: t.text }]}>{month.label}</Text>
                  <Ionicons
                    name={collapsed ? 'chevron-down' : 'chevron-up'}
                    size={26}
                    color={t.accentLight}
                  />
                </TouchableOpacity>
                <Collapsible collapsed={!!collapsed}>
                  {month.sessions.map((session) => (
                  <TouchableOpacity
                    key={session.id}
                    style={[styles.sessionRow, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                    activeOpacity={0.8}
                    onPress={() => setViewingSession(session)}
                  >
                    <Text style={[styles.sessionLine, { color: t.onCard }]} numberOfLines={1}>
                      <Text style={{ fontWeight: '700' }}>
                        {new Date(session.endedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={{ color: t.onCardMuted }}>
                        {'  ·  '}{formatStudyHM(session.durationSec)}
                        {session.topic ? `  ·  ${session.topic}` : ''}
                      </Text>
                    </Text>
                    {!!session.noteImageUris?.length && (
                      <Ionicons name="images-outline" size={16} color={t.accentLight} style={{ marginRight: spacing.sm }} />
                    )}
                    <Ionicons name="chevron-forward" size={16} color={t.onCardMuted} />
                  </TouchableOpacity>
                  ))}
                </Collapsible>
              </View>
              );
            })
          )}
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Start Study Session"
          icon="play"
          onPress={() => rootNav.navigate('StudySession', { subjectName })}
        />
      </View>

      <Modal
        visible={!!viewingSession}
        animationType="slide"
        transparent
        onRequestClose={() => setViewingSession(null)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={[styles.modalSheet, { backgroundColor: t.base }]} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Session Summary</Text>
              <TouchableOpacity onPress={() => setViewingSession(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            </View>
            {viewingSession && (
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalDate, { color: t.secondary }]}>
                  {formatShortDate(new Date(viewingSession.endedAt).toISOString())}
                </Text>
                <StudySummaryContent
                  subjectName={subjectName}
                  subjectColor={subject.color}
                  topic={viewingSession.topic}
                  studiedSec={viewingSession.durationSec}
                  breakCount={viewingSession.breakCount ?? 0}
                  breakSec={viewingSession.breakSec ?? 0}
                  imageUris={viewingSession.noteImageUris ?? []}
                />
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Small blurred preview of an upload. Blurred rather than sharp so it reads as a
 * glanceable "this is what you added" marker without turning the row into a
 * gallery — the count badge covers multi-image uploads.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useBaseTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  missing: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxxl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  profileButtonLabel: { fontSize: 12, fontWeight: '800' },
  planTitle: { fontSize: 17, fontWeight: '800' },
  lockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  lockedNoticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  planSummary: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
    minHeight: 56,
  },
  focusText: { flex: 1, fontSize: 14.5, fontWeight: '800' },
  focusAction: { fontSize: 13.5, fontWeight: '800' },
  content: { padding: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  colorBar: { width: 40, height: 5, borderRadius: 3, marginBottom: spacing.md },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  titleNoTeacher: { marginBottom: spacing.xl },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 4, marginBottom: spacing.xl },
  nextClassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  nextClassText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  section: { marginBottom: spacing.xxl },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  // Same shape as a history row, but for the upload that's still being read.
  blurThumbWrap: { marginRight: spacing.md },
  blurThumb: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.cardAlt,
  },
  blurThumbBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurThumbBadgeText: { fontSize: 11, fontWeight: '800' },
  emptyHistory: { fontSize: 14, lineHeight: 20 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.sm },
  monthLabel: { fontSize: 19, fontWeight: '800' },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sessionLine: { flex: 1, fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
    height: '88%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalDate: { fontSize: 14, marginBottom: spacing.lg },
  footer: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
});
