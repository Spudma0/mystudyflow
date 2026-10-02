import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { classColors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useTimetableStore } from '../store/useTimetableStore';
import { useSubjectDataStore } from '../store/useSubjectDataStore';
import { formatStudyHM, formatStudyHMS } from '../lib/date';
import { SubjectBarChart } from './SubjectBarChart';

function fallbackColor(name: string): string {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return classColors[h % classColors.length];
}

export function StudyTotalsCard({ onPressDetails }: { onPressDetails?: () => void }) {
  const t = useBaseTheme();
  const getSubjects = useTimetableStore((s) => s.getSubjects);
  const bySubject = useSubjectDataStore((s) => s.bySubject);

  // Count every subject that has logged study — including ones no longer in the
  // timetable — so the total always matches the actual sessions (never partial).
  const subjectColor = new Map(getSubjects().map((s) => [s.name, s.color]));
  const totals = Object.entries(bySubject)
    .map(([name, data]) => ({
      name,
      color: subjectColor.get(name) ?? fallbackColor(name),
      seconds: data.studySessions.reduce((sum, x) => sum + x.durationSec, 0),
    }))
    .filter((x) => x.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const totalAll = totals.reduce((sum, x) => sum + x.seconds, 0);

  const bars = totals.map((x) => ({
    name: x.name,
    color: x.color,
    value: x.seconds / 3600,
  }));

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={onPressDetails}
        disabled={!onPressDetails}
        activeOpacity={0.7}
      >
        <Text style={[styles.title, { color: t.onCard }]}>
          Total <Text style={styles.titleTime}>{formatStudyHMS(totalAll)}</Text>
        </Text>
        <Ionicons name="chevron-forward" size={20} color={t.onCardMuted} />
      </TouchableOpacity>

      {totalAll === 0 ? (
        <Text style={[styles.empty, { color: t.onCardMuted }]}>
          No study time logged yet. Start a study session on a subject to see your breakdown.
        </Text>
      ) : (
        <>
          <View style={styles.chartWrap}>
            <Text style={[styles.chartUnit, { color: t.onCardMuted }]}>HOURS</Text>
            <SubjectBarChart data={bars} />
          </View>

          <View style={styles.legend}>
            {totals.map((x) => (
              <View key={x.name} style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: x.color }]} />
                <Text style={[styles.legendName, { color: t.onCard }]} numberOfLines={1}>
                  {x.name}
                </Text>
                <View style={styles.legendRight}>
                  <Text style={[styles.legendTime, { color: t.onCard }]}>{formatStudyHM(x.seconds)}</Text>
                  <Text style={[styles.legendPct, { color: t.onCardMuted }]}>
                    {Math.round((x.seconds / totalAll) * 100)}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800' },
  titleTime: { fontWeight: '800' },
  empty: { fontSize: 14, marginTop: spacing.lg, lineHeight: 20 },
  chartWrap: { marginTop: spacing.lg, marginBottom: spacing.xl },
  chartUnit: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm },
  legend: { gap: spacing.md },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  legendName: { flex: 1, fontSize: 15, fontWeight: '600' },
  legendRight: { alignItems: 'flex-end' },
  legendTime: { fontSize: 15, fontWeight: '700' },
  legendPct: { fontSize: 12, marginTop: 1 },
});
