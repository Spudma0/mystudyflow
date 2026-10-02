import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radii, spacing } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useSubjectDataStore } from '../../store/useSubjectDataStore';
import { formatStudyHM } from '../../lib/date';
import { HomeStackParamList } from '../../navigation/types';
import { StudySession } from '../../types';

export function StudyBreakdownScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const getSubjects = useTimetableStore((s) => s.getSubjects);
  const bySubject = useSubjectDataStore((s) => s.bySubject);

  // Per subject: total + a breakdown of the topics studied (most-studied first).
  // Includes every subject with logged study so the totals stay consistent with
  // the home study-stats card.
  const subjectColor = new Map(getSubjects().map((s) => [s.name, s.color]));
  const subjects = Object.entries(bySubject)
    .map(([name, data]) => {
      const sessions: StudySession[] = data.studySessions;
      const total = sessions.reduce((sum, x) => sum + x.durationSec, 0);

      const byTopic = new Map<string, number>();
      for (const session of sessions) {
        const topic = session.topic?.trim() || 'General';
        byTopic.set(topic, (byTopic.get(topic) ?? 0) + session.durationSec);
      }
      const topics = Array.from(byTopic.entries())
        .map(([topic, seconds]) => ({ topic, seconds }))
        .sort((a, b) => b.seconds - a.seconds);

      return { name, color: subjectColor.get(name) ?? colors.purple, total, topics };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Study Breakdown</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {subjects.length === 0 ? (
          <Text style={[styles.empty, { color: t.muted }]}>
            No study time logged yet. Start a study session on a subject to see your breakdown.
          </Text>
        ) : (
          <>
            {subjects.map((s) => (
              <View key={s.name} style={[styles.subjectCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
                <View style={styles.subjectHeader}>
                  <Text style={[styles.subjectName, { color: t.accentLight }]}>{s.name}</Text>
                  <Text style={[styles.subjectTotal, { color: t.accentLight }]}>{formatStudyHM(s.total)}</Text>
                </View>

                {s.topics.map((tp, i) => (
                  <View
                    key={tp.topic}
                    style={[
                      styles.dayRow,
                      i !== s.topics.length - 1 && [styles.dayRowBorder, { borderBottomColor: t.cardBorder }],
                    ]}
                  >
                    <Text style={[styles.dayLabel, { color: t.onCardSecondary }]} numberOfLines={1}>
                      {tp.topic}
                    </Text>
                    <Text style={[styles.dayTime, { color: t.onCard }]}>{formatStudyHM(tp.seconds)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
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
  headerTitle: { fontSize: 17, fontWeight: '800' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  empty: { fontSize: 14, marginTop: spacing.xxxl, textAlign: 'center', lineHeight: 20 },
  subjectCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subjectName: { flex: 1, fontSize: 18, fontWeight: '800' },
  subjectTotal: { fontSize: 18, fontWeight: '800' },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  dayRowBorder: { borderBottomWidth: 1, borderStyle: 'dashed' },
  dayLabel: { fontSize: 14, fontWeight: '600' },
  dayTime: { fontSize: 14, fontWeight: '700' },
});
