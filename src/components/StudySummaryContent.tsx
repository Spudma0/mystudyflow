import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { formatStudyHM } from '../lib/date';

export function StudySummaryContent({
  subjectName,
  subjectColor,
  topic,
  studiedSec,
  breakCount = 0,
  breakSec = 0,
  imageUris = [],
}: {
  subjectName: string;
  subjectColor?: string;
  topic?: string;
  studiedSec: number;
  breakCount?: number;
  breakSec?: number;
  imageUris?: string[];
}) {
  const t = useBaseTheme();

  return (
    <View>
      <View style={styles.subjectRow}>
        {!!subjectColor && <View style={[styles.dot, { backgroundColor: subjectColor }]} />}
        <Text style={[styles.subject, { color: t.text }]}>{subjectName}</Text>
      </View>
      {!!topic && <Text style={[styles.topic, { color: t.secondary }]}>{topic}</Text>}

      <View style={[styles.statCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <View style={styles.statRow}>
          <View style={styles.statIconWrap}>
            <Ionicons name="hourglass-outline" size={18} color={t.accentLight} />
          </View>
          <Text style={[styles.statLabel, { color: t.onCardSecondary }]}>Studied</Text>
          <Text style={[styles.statValue, { color: t.onCard }]}>{formatStudyHM(studiedSec)}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: t.cardBorder }]} />

        <View style={styles.statRow}>
          <View style={styles.statIconWrap}>
            <Ionicons name="cafe-outline" size={18} color={t.accentLight} />
          </View>
          <Text style={[styles.statLabel, { color: t.onCardSecondary }]}>Breaks</Text>
          <Text style={[styles.statValue, { color: t.onCard }]}>
            {breakCount > 0 ? `${breakCount} · ${formatStudyHM(breakSec)}` : 'None'}
          </Text>
        </View>
      </View>

      {imageUris.length > 0 && (
        <>
          <Text style={[styles.notesLabel, { color: t.muted }]}>CAPTURED NOTES</Text>
          <View style={styles.imageGrid}>
            {imageUris.map((uri) => (
              <Image key={uri} source={{ uri }} style={[styles.thumb, { borderColor: t.cardBorder }]} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subjectRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  subject: { fontSize: 24, fontWeight: '800' },
  topic: { fontSize: 15, marginTop: 4, marginBottom: spacing.lg },
  statCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
  statIconWrap: { width: 28, alignItems: 'center', marginRight: spacing.sm },
  statLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  statValue: { fontSize: 16, fontWeight: '800' },
  divider: { height: 1 },
  notesLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  thumb: { width: 96, height: 96, borderRadius: radii.md, borderWidth: 1 },
});
