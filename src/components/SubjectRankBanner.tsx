import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { RankProgress } from '../lib/rank';
import { RankBadge } from './RankBadge';

/**
 * One subject as a rank banner: the crest, the subject's name, its current rank
 * and a bar showing how far through the tier it is. The banner takes its colour
 * from the rank rather than the subject, so the ladder is legible at a glance
 * down the whole list.
 */
export function SubjectRankBanner({
  name,
  subjectColor,
  progress,
  onPress,
}: {
  name: string;
  subjectColor: string;
  progress: RankProgress;
  onPress: () => void;
}) {
  const t = useBaseTheme();
  const fill = useRef(new Animated.Value(0)).current;

  // The bar fills on mount so opening the tab feels like progress being counted.
  useEffect(() => {
    Animated.timing(fill, {
      toValue: progress.progress,
      duration: 760,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress.progress, fill]);

  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.wrap}>
      <LinearGradient
        colors={[withAlpha(progress.rank.colors[0], t.isLight ? 0.3 : 0.34), withAlpha(progress.rank.colors[1], t.isLight ? 0.12 : 0.14)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.banner,
          { borderColor: withAlpha(progress.rank.colors[0], 0.45), shadowColor: progress.rank.colors[1] },
        ]}
      >
        {/* Subject colour stays present as a spine down the left edge, so the
            subject is still identifiable when several share a rank. */}
        <View style={[styles.spine, { backgroundColor: subjectColor }]} />

        <View style={styles.badgeWrap}>
          <RankBadge rank={progress.rank} tier={progress.tier} size={52} />
        </View>

        <View style={styles.body}>
          <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.rank, { color: progress.rank.accent }]} numberOfLines={1}>
            {progress.label}
          </Text>

          <View style={[styles.track, { backgroundColor: withAlpha(t.text, 0.12) }]}>
            <Animated.View style={[styles.trackFill, { width, backgroundColor: progress.rank.accent }]} />
          </View>

          <Text style={[styles.xp, { color: t.muted }]} numberOfLines={1}>
            {progress.isMax
              ? `${progress.totalXp.toLocaleString()} XP · maxed out`
              : `${progress.xpToNext.toLocaleString()} XP to next rank`}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  spine: { width: 4, alignSelf: 'stretch', marginRight: spacing.md },
  badgeWrap: { marginRight: spacing.md },
  body: { flex: 1 },
  name: { fontSize: 17, fontWeight: '800' },
  rank: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, marginTop: 1 },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: spacing.sm },
  trackFill: { height: 7, borderRadius: 4 },
  xp: { fontSize: 11, fontWeight: '600', marginTop: 5 },
});
