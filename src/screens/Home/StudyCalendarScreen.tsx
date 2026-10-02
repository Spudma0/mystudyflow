import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { lighten, darken, mix, withAlpha, contrastText } from '../../store/useThemeStore';

// A "full" study day for the heatmap's darkest shade. Study is scored against
// this absolute cap (not the month's max), so light study stays a light shade.
const CAP_SEC = 5 * 3600;
import { useSubjectDataStore } from '../../store/useSubjectDataStore';
import { formatStudyHM } from '../../lib/date';
import { HomeStackParamList } from '../../navigation/types';
import { StudySession } from '../../types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function hoursLabel(sec: number) {
  return (sec / 3600).toFixed(1);
}

export function StudyCalendarScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const bySubject = useSubjectDataStore((s) => s.bySubject);

  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(dayKey(today));
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const allSessions: StudySession[] = useMemo(
    () => Object.values(bySubject).flatMap((d) => d.studySessions),
    [bySubject]
  );

  // Per-day total seconds (for the heatmap).
  const dayTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allSessions) {
      const k = dayKey(new Date(s.endedAt));
      m.set(k, (m.get(k) ?? 0) + s.durationSec);
    }
    return m;
  }, [allSessions]);

  // Build the calendar grid for the viewed month.
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadBlanks = new Date(year, month, 1).getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const heatColor = (sec: number) => {
    if (sec <= 0) return t.cardIsLight ? darken(t.card, 0.03) : lighten(t.card, 0.04);
    // Continuous scale against an absolute cap (so a light day stays a light
    // shade, and a 0.1h difference still shifts the colour): same hue as the
    // tile's top-left (accent) colour, darkening with more study.
    const tNorm = Math.min(1, sec / CAP_SEC);
    return mix(lighten(t.accent, 0.8), darken(t.accent, 0.32), tNorm);
  };

  // Selected-day breakdown.
  const selectedSessions = allSessions.filter((s) => dayKey(new Date(s.endedAt)) === selectedKey);
  const selectedTotal = selectedSessions.reduce((sum, s) => sum + s.durationSec, 0);
  const [sy, sm, sd] = selectedKey.split('-').map(Number);
  const selectedDate = new Date(sy, sm, sd);

  const bySubjectSecs = new Map<string, number>();
  const byTopicSecs = new Map<string, Map<string, number>>();
  for (const s of selectedSessions) {
    bySubjectSecs.set(s.subjectName, (bySubjectSecs.get(s.subjectName) ?? 0) + s.durationSec);
    if (!byTopicSecs.has(s.subjectName)) byTopicSecs.set(s.subjectName, new Map());
    const tm = byTopicSecs.get(s.subjectName)!;
    const topic = s.topic?.trim() || 'General';
    tm.set(topic, (tm.get(topic) ?? 0) + s.durationSec);
  }
  const subjectList = Array.from(bySubjectSecs.entries())
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  const activeSubject = selectedSubject && bySubjectSecs.has(selectedSubject) ? selectedSubject : subjectList[0]?.name ?? null;
  const topicList = activeSubject
    ? Array.from(byTopicSecs.get(activeSubject)?.entries() ?? [])
        .map(([topic, seconds]) => ({ topic, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
    : [];

  const changeMonth = (delta: number) => {
    setViewMonth(new Date(year, month + delta, 1));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Study Calendar</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Month switcher */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={t.accent} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: t.text }]}>
            {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={10}>
            <Ionicons name="arrow-forward" size={22} color={t.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendar}>
        {/* Weekday header */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} style={[styles.weekday, { color: t.muted }]}>
              {w}
            </Text>
          ))}
        </View>

        {/* Calendar heatmap grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((d, di) => {
              if (!d) return <View key={di} style={styles.cell} />;
              const sec = dayTotals.get(dayKey(d)) ?? 0;
              const selected = dayKey(d) === selectedKey;
              const bg = heatColor(sec);
              // Always pick a readable colour for the square's own shade.
              const textColor = contrastText(bg);
              return (
                <TouchableOpacity
                  key={di}
                  style={styles.cell}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedKey(dayKey(d));
                    setSelectedSubject(null);
                  }}
                >
                  <View
                    style={[
                      styles.cellInner,
                      { backgroundColor: bg },
                      selected && { borderWidth: 2, borderColor: t.accent },
                    ]}
                  >
                    <Text style={[styles.cellDate, { color: textColor }]}>{d.getDate()}</Text>
                    {sec > 0 && <Text style={[styles.cellHours, { color: textColor }]}>{hoursLabel(sec)}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        </View>

        {/* Selected-day summary */}
        <View style={[styles.summaryRow, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={[styles.summaryDate, { color: t.onCard }]}>
            {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Text style={[styles.summaryTime, { color: t.onCardMuted }]}>
            {selectedTotal > 0 ? formatStudyHM(selectedTotal) : 'No study'}
          </Text>
        </View>

        {subjectList.length === 0 ? (
          <Text style={[styles.empty, { color: t.muted }]}>No study logged on this day.</Text>
        ) : (
          <>
            {/* Subject boxes */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
              {subjectList.map((s) => {
                const active = s.name === activeSubject;
                return (
                  <TouchableOpacity
                    key={s.name}
                    activeOpacity={0.85}
                    onPress={() => setSelectedSubject(s.name)}
                    style={[
                      styles.subjectBox,
                      { backgroundColor: active ? t.accent : t.card, borderColor: active ? t.accent : t.cardBorder },
                    ]}
                  >
                    <Text style={[styles.subjectName, { color: active ? t.onAccent : t.accent }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={[styles.subjectHours, { color: active ? t.onAccent : t.onCard }]}>
                      {hoursLabel(s.seconds)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Topic breakdown, split by dashed (accent) separators */}
            <View style={styles.topicList}>
              {topicList.map((tp) => (
                <View
                  key={tp.topic}
                  style={[styles.topicRow, { borderTopColor: withAlpha(t.accent, 0.5) }]}
                >
                  <Text style={[styles.topicName, { color: t.text }]} numberOfLines={1}>
                    {tp.topic}
                  </Text>
                  <Text style={[styles.topicHours, { color: t.secondary }]}>{hoursLabel(tp.seconds)}h</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  // Cells are square, so on a wide screen an uncapped grid turns each day into
  // a tile the size of a playing card. Capping the grid keeps the squares the
  // size they are meant to be and centres the month.
  calendar: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  monthTitle: { fontSize: 18, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', marginBottom: spacing.sm },
  cell: { flex: 1, aspectRatio: 1, padding: 2 },
  cellInner: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDate: { fontSize: 13, fontWeight: '800' },
  cellHours: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  summaryDate: { fontSize: 15, fontWeight: '800' },
  summaryTime: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 14, textAlign: 'center', marginTop: spacing.xxl },
  subjectRow: { gap: spacing.md, paddingVertical: spacing.lg },
  subjectBox: {
    minWidth: 96,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  subjectName: { fontSize: 14, fontWeight: '800' },
  subjectHours: { fontSize: 20, fontWeight: '800' },
  topicList: { marginTop: spacing.sm },
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  topicName: { fontSize: 15, fontWeight: '600', flex: 1 },
  topicHours: { fontSize: 14, fontWeight: '700' },
});
