import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { useIsTablet } from '../lib/useIsTablet';

/**
 * Study hours per subject, as a column chart.
 *
 * This replaced a pie, which could not do the job: a subject worth one percent
 * is a sliver too thin to see or to label, and neighbouring wedges of similar
 * size are genuinely hard to rank by eye. Bars share a baseline, so the same
 * numbers can be read off and compared directly.
 */

/** Room for the tallest y-axis label. */
const AXIS_WIDTH = 32;
const MIN_GAP = 10;
/** Bars shrink to fit until this, then the chart scrolls sideways instead. */
const MIN_BAR = 20;
/**
 * A gap wider than this much of a bar reads as a mistake rather than spacing,
 * so past it the bars are centred and the slack is left at the sides.
 */
const MAX_GAP_RATIO = 1.1;

export interface BarDatum {
  name: string;
  color: string;
  /** Hours, the unit the axis is labelled in. */
  value: number;
}

/**
 * A top-of-axis that lands on a round number, with ticks that do the same.
 *
 * Aiming for four intervals and snapping the step up to the next 1 / 2 / 2.5 /
 * 5 × a power of ten keeps the labels readable whether the total is three
 * hours or three hundred.
 */
function niceScale(max: number): { top: number; ticks: number[]; step: number } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1], step: 1 };
  const rough = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough - 1e-9) ?? 10 * magnitude;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { top, ticks, step };
}

function tickLabel(value: number, step: number): string {
  return step < 1 ? value.toFixed(1) : String(Math.round(value));
}

export function SubjectBarChart({ data }: { data: BarDatum[] }) {
  const t = useBaseTheme();
  const tablet = useIsTablet();
  const [width, setWidth] = React.useState(0);

  // A tall plot on a wide card; the phone's proportions look squat stretched
  // across an iPad.
  const plotHeight = tablet ? 260 : 170;
  /** A bar wider than this stops reading as a bar and starts reading as a block. */
  const maxBar = tablet ? 104 : 56;

  const max = data.reduce((n, d) => Math.max(n, d.value), 0);
  const { top, ticks, step } = niceScale(max);

  // Bars fill the width they are given, within limits, so two subjects don't
  // become two enormous slabs and twelve don't become hairlines.
  const available = Math.max(0, width - AXIS_WIDTH);
  const count = data.length;
  const fitted = count > 0 ? (available - MIN_GAP * (count - 1)) / count : MIN_BAR;
  const barWidth = Math.max(MIN_BAR, Math.min(maxBar, Math.floor(fitted)));

  // Once the bars have hit their maximum there is width left over. Spending it
  // on the gaps keeps the row spanning the plot, so the bars stay under the
  // gridlines that measure them instead of bunching against the axis.
  const slack = available - count * barWidth;
  const spread = count > 1 ? Math.floor(slack / (count - 1)) : 0;
  const gap = Math.max(MIN_GAP, Math.min(spread, Math.round(barWidth * MAX_GAP_RATIO)));

  const contentWidth = count * barWidth + Math.max(0, count - 1) * gap;
  // Only scroll once the bars have already been squeezed as far as they go.
  const scrolls = contentWidth > available + 1;

  const gridColor = withAlpha(t.onCard, 0.1);

  const plot = (
    <View style={{ width: scrolls ? contentWidth : available }}>
      <View style={[styles.plot, { height: plotHeight }]}>
        {/* Gridlines run behind the bars, one per axis label. */}
        {ticks.map((value) => (
          <View
            key={value}
            style={[
              styles.gridline,
              {
                backgroundColor: value === 0 ? withAlpha(t.onCard, 0.25) : gridColor,
                bottom: (value / top) * plotHeight,
              },
            ]}
          />
        ))}

        <View style={[styles.bars, { gap }]}>
          {data.map((d) => (
            <View
              key={d.name}
              style={{
                width: barWidth,
                // Never fully flat: a subject with minutes on it should still
                // show as a stub rather than vanishing into the axis.
                height: Math.max(3, (d.value / top) * plotHeight),
                backgroundColor: d.color,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
              }}
            />
          ))}
        </View>
      </View>

      <View style={[styles.labels, { gap }]}>
        {data.map((d) => (
          <Text
            key={d.name}
            numberOfLines={1}
            style={[styles.label, { width: barWidth, color: t.onCardMuted }]}
          >
            {d.name}
          </Text>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.axis, { height: plotHeight }]}>
        {ticks.map((value) => (
          <Text
            key={value}
            style={[
              styles.axisLabel,
              // Half the line height lifts the text so it centres on its own
              // gridline rather than sitting above it.
              { color: t.onCardMuted, bottom: (value / top) * plotHeight - 6 },
            ]}
          >
            {tickLabel(value, step)}
          </Text>
        ))}
      </View>

      {width === 0 ? null : scrolls ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {plot}
        </ScrollView>
      ) : (
        plot
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  axis: { width: AXIS_WIDTH },
  axisLabel: {
    position: 'absolute',
    right: 8,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  plot: { justifyContent: 'flex-end' },
  gridline: { position: 'absolute', left: 0, right: 0, height: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  labels: { flexDirection: 'row', marginTop: 6 },
  label: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
