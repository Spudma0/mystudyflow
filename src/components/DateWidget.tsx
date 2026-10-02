import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radii } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { useNow } from '../lib/useNow';

/** Checked every minute — cheap, and it means midnight rolls the date over. */
const MINUTE = 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "st", "nd", "rd" or "th" for a day of the month.
 *
 * The teens are the exception that catches everyone out: 11, 12 and 13 take
 * "th" even though they end in 1, 2 and 3.
 */
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
}

/**
 * Today's date, built like a wall calendar: a banner across the top naming the
 * day and month, and the date itself filling the page below it.
 */
export function DateWidget() {
  const t = useBaseTheme();
  const now = useNow(MINUTE);
  const day = now.getDate();

  return (
    <View style={[styles.card, { backgroundColor: t.cardScrim }]}>
      {/* The accent fills the banner the way a wall calendar's month block is
          printed in its one colour. Text takes the contrast colour for the
          accent rather than the tile's, since the accent is what it sits on. */}
      <View style={[styles.banner, { backgroundColor: t.accent }]}>
        <Text style={[styles.bannerText, { color: t.onAccent }]} numberOfLines={1}>
          {WEEKDAYS[now.getDay()]}{' '}
          <Text style={{ color: withAlpha(t.onAccent, 0.72) }}>{MONTHS[now.getMonth()]}</Text>
        </Text>
      </View>

      <View style={styles.body}>
        {/* Nested rather than a sibling, so the suffix shares the number's
            baseline instead of floating against its middle. */}
        <Text style={[styles.day, { color: t.onTile }]}>
          {day}
          <Text style={styles.suffix}>{ordinal(day)}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Draws its own surface so the banner can run edge to edge, the way the
  // heading does on a calendar page.
  card: { flex: 1, borderRadius: radii.lg, overflow: 'hidden', minHeight: 118 },
  banner: { paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  bannerText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 44, lineHeight: 50, fontWeight: '800' },
  suffix: { fontSize: 17, fontWeight: '800' },
});
