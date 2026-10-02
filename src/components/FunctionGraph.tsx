import React from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { PlottableFunction } from '../lib/plot';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { MATH_FONT } from '../theme/mathFont';
import { colors, radii, spacing } from '../theme/theme';

/**
 * A function drawn on axes, that can be dragged and zoomed.
 *
 * Plotted here rather than embedded from a graphing site: the curve is drawn
 * from the same parsed expression the rest of the lesson uses, it works with
 * no network and no third-party key, and it needs no native module — so it
 * ships in the existing build rather than waiting on a new one.
 */

/** Distinct colours for several curves on one pair of axes. */
const CURVE_COLOURS = [colors.green, colors.amber, colors.teal, colors.danger];

interface Viewport {
  /** Centre of the view, in graph units. */
  cx: number;
  cy: number;
  /** Graph units across the full width. */
  span: number;
}

const DEFAULT_VIEW: Viewport = { cx: 0, cy: 0, span: 20 };

/** Grid spacing that lands on 1, 2 or 5 times a power of ten. */
function niceStep(span: number): number {
  const rough = span / 8;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised >= 5 ? 5 : normalised >= 2 ? 2 : 1;
  return step * magnitude;
}

function formatTick(value: number, step: number): string {
  if (Math.abs(value) < step / 100) return '0';
  const decimals = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0;
  return value.toFixed(decimals);
}

export function FunctionGraph({
  functions,
  height = 200,
  caption,
}: {
  functions: PlottableFunction[];
  height?: number;
  caption?: string;
}) {
  const t = useBaseTheme();
  const [width, setWidth] = React.useState(0);
  const [view, setView] = React.useState<Viewport>(DEFAULT_VIEW);
  // The viewport at the moment a drag started, so movement is measured from
  // there rather than accumulating rounding on every frame.
  const dragStart = React.useRef<Viewport>(DEFAULT_VIEW);

  const perPixel = width > 0 ? view.span / width : 0;
  const unitsTall = perPixel * height;

  /**
   * Where the reader is pointing, in screen pixels, or null.
   *
   * A press reads the curve off at that x — the value, and a dropped line to
   * the axis — because that is the question a graph in a lesson is usually
   * being asked: what is it *there*. A drag of any distance means they meant
   * to move the view instead, so the readout gives way to panning.
   */
  const [traceX, setTraceX] = React.useState<number | null>(null);
  const mode = React.useRef<'trace' | 'pan'>('trace');

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          dragStart.current = view;
          mode.current = 'trace';
          setTraceX(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e, g) => {
          if (mode.current === 'trace' && Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
            setTraceX(e.nativeEvent.locationX);
            return;
          }
          if (mode.current === 'trace') {
            mode.current = 'pan';
            setTraceX(null);
          }
          const scale = dragStart.current.span / Math.max(width, 1);
          setView({
            ...dragStart.current,
            cx: dragStart.current.cx - g.dx * scale,
            // Screen y grows downward; the graph's does not.
            cy: dragStart.current.cy + g.dy * scale,
          });
        },
      }),
    [view, width]
  );

  const zoom = (factor: number) => {
    setTraceX(null);
    setView((v) => ({ ...v, span: Math.min(1000, Math.max(0.5, v.span * factor)) }));
  };

  /** Round the traced value to something a reader would actually write down. */
  const readable = (value: number, step: number) => {
    const decimals = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step)) + 1) : step < 5 ? 2 : 1;
    return Number(value.toFixed(decimals)).toString();
  };

  if (!functions.length) return null;

  const left = view.cx - view.span / 2;
  const right = view.cx + view.span / 2;
  const bottom = view.cy - unitsTall / 2;
  const top = view.cy + unitsTall / 2;

  const toScreenX = (x: number) => ((x - left) / view.span) * width;
  const toScreenY = (y: number) => height - ((y - bottom) / unitsTall) * height;

  const step = niceStep(view.span);
  const gridX: number[] = [];
  const gridY: number[] = [];
  if (width > 0) {
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) gridX.push(x);
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) gridY.push(y);
  }

  /**
   * Sample the curve a pixel at a time, lifting the pen where it isn't there.
   *
   * A break is either an undefined value or a jump too large to be a curve —
   * which is what stops 1/x being drawn with a vertical line through the
   * asymptote joining the two branches.
   */
  const pathFor = (fn: PlottableFunction): string => {
    if (width <= 0) return '';
    let d = '';
    let penDown = false;
    let previous = NaN;
    const limit = unitsTall * 4;

    for (let px = 0; px <= width; px += 1) {
      const x = left + px * perPixel;
      const y = fn.at(x);
      const drawable = Number.isFinite(y) && Math.abs(y - view.cy) < limit;
      const jumped = penDown && Number.isFinite(previous) && Math.abs(y - previous) > unitsTall;

      if (!drawable || jumped) {
        penDown = false;
      } else {
        const sy = toScreenY(y);
        d += `${penDown ? 'L' : 'M'}${px.toFixed(1)} ${sy.toFixed(1)}`;
        penDown = true;
      }
      previous = y;
    }
    return d;
  };

  const axisColour = withAlpha(t.text, 0.55);
  const gridColour = withAlpha(t.text, 0.12);

  /** The point under the reader's finger, read off the first drawable curve. */
  const trace = (() => {
    if (traceX === null || width <= 0) return null;
    const px = Math.max(0, Math.min(width, traceX));
    const x = left + px * perPixel;
    for (let i = 0; i < functions.length; i += 1) {
      const y = functions[i].at(x);
      if (!Number.isFinite(y)) continue;
      // The marker is pinned to the edge when the value is off the top or
      // bottom of the view, because the reading is still the answer to what
      // was asked — silently showing nothing reads as the graph being broken.
      const py = toScreenY(y);
      return {
        px,
        py: Math.max(3, Math.min(height - 3, py)),
        x,
        y,
        colour: CURVE_COLOURS[i % CURVE_COLOURS.length],
        variable: functions[i].variable,
        // The axis when it is on screen, the bottom edge when it is not.
        baseY: bottom <= 0 && top >= 0 ? toScreenY(0) : height,
      };
    }
    return null;
  })();

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} fill="transparent" />

            {gridX.map((x) => (
              <Line
                key={`gx${x}`}
                x1={toScreenX(x)}
                y1={0}
                x2={toScreenX(x)}
                y2={height}
                stroke={gridColour}
                strokeWidth={1}
              />
            ))}
            {gridY.map((y) => (
              <Line
                key={`gy${y}`}
                x1={0}
                y1={toScreenY(y)}
                x2={width}
                y2={toScreenY(y)}
                stroke={gridColour}
                strokeWidth={1}
              />
            ))}

            {/* The axes only appear when zero is actually in view. */}
            {left <= 0 && right >= 0 && (
              <Line x1={toScreenX(0)} y1={0} x2={toScreenX(0)} y2={height} stroke={axisColour} strokeWidth={1.5} />
            )}
            {bottom <= 0 && top >= 0 && (
              <Line x1={0} y1={toScreenY(0)} x2={width} y2={toScreenY(0)} stroke={axisColour} strokeWidth={1.5} />
            )}

            <G>
              {gridX.map((x) =>
                Math.abs(x) < step / 100 ? null : (
                  <SvgText
                    key={`lx${x}`}
                    x={toScreenX(x)}
                    y={Math.min(height - 4, Math.max(12, toScreenY(0) + 13))}
                    fill={withAlpha(t.text, 0.6)}
                    fontSize={10}
                    fontFamily={MATH_FONT}
                    textAnchor="middle"
                  >
                    {formatTick(x, step)}
                  </SvgText>
                )
              )}
              {gridY.map((y) =>
                Math.abs(y) < step / 100 ? null : (
                  <SvgText
                    key={`ly${y}`}
                    x={Math.max(4, Math.min(width - 6, toScreenX(0) - 5))}
                    y={toScreenY(y) + 3.5}
                    fill={withAlpha(t.text, 0.6)}
                    fontSize={10}
                    fontFamily={MATH_FONT}
                    textAnchor="end"
                  >
                    {formatTick(y, step)}
                  </SvgText>
                )
              )}
            </G>

            {functions.map((fn, i) => (
              <Path
                key={i}
                d={pathFor(fn)}
                stroke={CURVE_COLOURS[i % CURVE_COLOURS.length]}
                strokeWidth={2.2}
                fill="none"
              />
            ))}

            {trace && (
              <G>
                {/* Dropped to the axis, so the reading can be taken off the
                    horizontal scale as well as from the label. */}
                <Line
                  x1={trace.px}
                  y1={trace.py}
                  x2={trace.px}
                  y2={trace.baseY}
                  stroke={withAlpha(t.text, 0.45)}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <Line
                  x1={trace.px}
                  y1={trace.py}
                  x2={Math.max(2, toScreenX(0))}
                  y2={trace.py}
                  stroke={withAlpha(t.text, 0.28)}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <Circle cx={trace.px} cy={trace.py} r={4.5} fill={trace.colour} />
                <Circle cx={trace.px} cy={trace.py} r={8} fill={withAlpha(trace.colour, 0.25)} />
              </G>
            )}
          </Svg>
        )}
      </View>

      {trace && (
        <View
          pointerEvents="none"
          style={[
            styles.readout,
            {
              backgroundColor: withAlpha(trace.colour, 0.16),
              borderColor: withAlpha(trace.colour, 0.5),
              // Beside the point rather than over it, and never off the edge.
              left: Math.max(4, Math.min(width - 118, trace.px - 56)),
            },
          ]}
        >
          <Text style={[styles.readoutText, { color: t.text }]}>
            ({trace.variable} = {readable(trace.x, step)}, {readable(trace.y, step)})
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.legend}>
          {functions.map((fn, i) => (
            <View key={i} style={styles.legendItem}>
              <View
                style={[styles.swatch, { backgroundColor: CURVE_COLOURS[i % CURVE_COLOURS.length] }]}
              />
              <Text style={[styles.legendLabel, { color: t.onCardSecondary }]} numberOfLines={1}>
                {fn.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.buttons}>
          <GraphButton icon="remove" onPress={() => zoom(1.4)} />
          <GraphButton icon="add" onPress={() => zoom(1 / 1.4)} />
          <GraphButton icon="refresh" onPress={() => setView(DEFAULT_VIEW)} />
        </View>
      </View>

      {caption ? (
        <Text style={[styles.caption, { color: t.onCardMuted }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

function GraphButton({ icon, onPress }: { icon: string; onPress: () => void }) {
  const t = useBaseTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: withAlpha(t.text, 0.08) }]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={6}
    >
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={15} color={t.onCardSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.md,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  legend: { flex: 1, gap: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
  legendLabel: { flex: 1, fontSize: 11.5, fontFamily: MATH_FONT },
  buttons: { flexDirection: 'row', gap: 6 },
  button: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 11, marginTop: spacing.sm },
  readout: {
    position: 'absolute',
    top: spacing.md + 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  readoutText: { fontSize: 12, fontWeight: '700', fontFamily: MATH_FONT },
});
