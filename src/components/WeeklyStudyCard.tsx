import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { radii, shadow, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useSubjectDataStore } from '../store/useSubjectDataStore';
import { formatStudyHM } from '../lib/date';

const VB_W = 300;
const CHART_H = 150;
const PAD_X = 12;
const TOP_PAD = 62;
const BOT_PAD = 24;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Catmull-Rom → cubic bezier for a smooth wave through the points. Control points
// are clamped to the baseline so the curve never dips below zero, and a segment
// between two zero-value days stays a flat straight line (no phantom dips).
function smoothPath(pts: { x: number; y: number }[], baselineY: number): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;

    // Both endpoints at the baseline → keep the segment perfectly flat.
    if (p1.y >= baselineY && p2.y >= baselineY) {
      d += ` L ${p2.x} ${p2.y}`;
      continue;
    }

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    // Clamp control-point y to the baseline so overshoot can't dip below zero.
    const cp1y = Math.min(p1.y + (p2.y - p0.y) / 6, baselineY);
    const cp2y = Math.min(p2.y - (p3.y - p1.y) / 6, baselineY);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function WeeklyStudyCard({ onPressDetails }: { onPressDetails?: () => void }) {
  const t = useBaseTheme();
  const bySubject = useSubjectDataStore((s) => s.bySubject);

  const now = new Date();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });

  const allSessions = Object.values(bySubject).flatMap((d) => d.studySessions);
  const dailySec = days.map((day) =>
    allSessions
      .filter((s) => dayKey(new Date(s.endedAt)) === dayKey(day))
      .reduce((sum, x) => sum + x.durationSec, 0)
  );
  const weekTotal = dailySec.reduce((sum, x) => sum + x, 0);

  const [selected, setSelected] = useState(now.getDay());

  const maxVal = Math.max(...dailySec, 1);
  const baselineY = CHART_H - BOT_PAD;
  const xs = days.map((_, i) => PAD_X + (i * (VB_W - 2 * PAD_X)) / 6);
  const ys = dailySec.map((v) => baselineY - (v / maxVal) * (CHART_H - TOP_PAD - BOT_PAD));
  const points = xs.map((x, i) => ({ x, y: ys[i] }));

  const line = smoothPath(points, baselineY);
  const area = `${line} L ${xs[6]} ${CHART_H} L ${xs[0]} ${CHART_H} Z`;

  const selXPct = (xs[selected] / VB_W) * 100;
  // Frosted, translucent selection column (like the reference): a light veil on
  // dark themes, a soft white veil on light ones, with a hairline border.
  const pillBg = t.cardIsLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.07)';
  const pillBorder = t.cardIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)';
  const pillTime = t.cardIsLight ? '#1A1A24' : '#F5F5F7';
  const dateLabel = `${days[selected].getMonth() + 1}/${days[selected].getDate()}`;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.onCard }]}>
          Week <Text style={styles.titleTime}>{formatStudyHM(weekTotal)}</Text>
        </Text>
        <TouchableOpacity onPress={onPressDetails} disabled={!onPressDetails} activeOpacity={0.7} hitSlop={10}>
          <Text style={[styles.todayLabel, { color: t.onCardMuted }]}>Today ›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chartArea}>
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${VB_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="studyFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={t.accent} stopOpacity={0.35} />
              <Stop offset="1" stopColor={t.accent} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#studyFill)" />
          <Path d={line} stroke={t.accent} strokeWidth={2.5} fill="none" vectorEffect="non-scaling-stroke" />
        </Svg>

        {/* Selected-day frosted column + tooltip */}
        <View style={[styles.tooltip, { left: `${selXPct}%`, backgroundColor: pillBg, borderColor: pillBorder }]}>
          <Text style={[styles.tooltipDate, { color: t.accent }]}>{dateLabel}</Text>
          <Text style={[styles.tooltipTime, { color: pillTime }]}>{formatStudyHM(dailySec[selected])}</Text>
        </View>

        {/* Marker dot on the curve */}
        <View
          style={[
            styles.dot,
            { left: `${selXPct}%`, top: ys[selected] - 6, backgroundColor: t.accent },
          ]}
        />

        {/* Touch columns to select a day */}
        <View style={styles.touchRow}>
          {days.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={styles.touchCol}
              activeOpacity={1}
              onPress={() => setSelected(i)}
            />
          ))}
        </View>
      </View>

      <View style={styles.labelsRow}>
        {DAY_LABELS.map((l, i) => (
          <Text
            key={i}
            style={[
              styles.dayLabel,
              { color: i === selected ? t.accent : t.onCardMuted },
              i === selected && styles.dayLabelActive,
            ]}
          >
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800' },
  titleTime: { fontWeight: '800' },
  todayLabel: { fontSize: 13, fontWeight: '600' },
  chartArea: { position: 'relative', height: CHART_H, marginTop: spacing.sm },
  tooltip: {
    position: 'absolute',
    top: -6,
    width: 66,
    marginLeft: -33,
    height: CHART_H + 12,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
    ...shadow.card,
  },
  tooltipDate: { fontSize: 12, fontWeight: '800' },
  tooltipTime: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  touchRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  touchCol: { flex: 1 },
  labelsRow: { flexDirection: 'row', marginTop: spacing.sm },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  dayLabelActive: { fontWeight: '800' },
});
