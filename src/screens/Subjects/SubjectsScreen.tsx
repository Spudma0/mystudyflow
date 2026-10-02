import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';
import { colors, spacing, typography } from '../../theme/theme';
import { useBaseTheme } from '../../theme/useBaseTheme';
import { LineGridBackground } from '../../components/LineGridBackground';
import { EmptyState } from '../../components/EmptyState';
import { useTimetableStore } from '../../store/useTimetableStore';
import { useSubjectDataStore } from '../../store/useSubjectDataStore';
import { useSubjectProfileStore } from '../../store/useSubjectProfileStore';
import { SubjectRankBanner } from '../../components/SubjectRankBanner';
import { rankFromXp, xpForCompletedLessons, xpForSessions } from '../../lib/rank';
import { SubjectsStackParamList } from '../../navigation/types';
import { RootTabParamList } from '../../navigation/types';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<SubjectsStackParamList, 'SubjectsHome'>,
  BottomTabNavigationProp<RootTabParamList>
>;

export function SubjectsScreen() {
  const t = useBaseTheme();
  const navigation = useNavigation<Nav>();
  const getSubjects = useTimetableStore((s) => s.getSubjects);
  const timetable = useTimetableStore((s) => s.timetable);
  const subjects = getSubjects();
  const bySubject = useSubjectDataStore((st) => st.bySubject);
  // Finished lessons count towards the rank too, not just time on the clock.
  const profiles = useSubjectProfileStore((st) => st.bySubject);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.base }]} edges={['top']}>
      <LineGridBackground />
      <View style={styles.headerRow}>
        <Text style={[typography.screenTitle, { color: t.text }]}>Subjects</Text>
      </View>

      {subjects.length === 0 ? (
        <View style={styles.centerFill}>
          <EmptyState
            icon="layers-outline"
            title="No subjects yet"
            subtitle="Add classes to your timetable and they'll appear here"
            actionLabel="Go to Timetable"
            actionIcon="calendar-outline"
            onAction={() => navigation.navigate('TimetableTab')}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {subjects.map((s) => {
            // XP is derived from the work already recorded for the subject —
            // the sessions logged and the lessons finished — so ranks reflect
            // the full history rather than starting at zero.
            const sessions = bySubject[s.name]?.studySessions ?? [];
            const xp = xpForSessions(sessions) + xpForCompletedLessons(profiles[s.name]);
            return (
              <SubjectRankBanner
                key={s.name}
                name={s.name}
                subjectColor={s.color}
                progress={rankFromXp(xp)}
                onPress={() => navigation.navigate('SubjectDetail', { subjectName: s.name })}
              />
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  headerRow: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  centerFill: { flex: 1, justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
});
