import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useThemeStore, withAlpha } from '../store/useThemeStore';

/**
 * The faint line pattern behind the welcome screen: evenly spaced vertical
 * hairlines, a few very wide sweeping curves crossing them, and small nodes
 * where they meet. Everything is drawn from the theme's text colour at low
 * alpha, so it stays a whisper of contrast on a light or a dark background.
 */
export function LineGridBackground({
  /** Set on the sign-up flow, which always shows the pattern as part of the brand. */
  always = false,
}: {
  always?: boolean;
} = {}) {
  const t = useBaseTheme();
  const enabled = useThemeStore((s) => s.lineGrid);
  if (!always && !enabled) return null;

  const hair = withAlpha(t.text, 0.07);
  const curve = withAlpha(t.text, 0.05);
  const node = withAlpha(t.text, 0.12);

  // Drawn in a fixed box and scaled with "slice", so the pattern keeps its
  // proportions on any screen size instead of stretching.
  const W = 400;
  const H = 800;
  const columns = [0.17, 0.34, 0.5, 0.66, 0.83];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {columns.map((c) => (
          <Line key={c} x1={c * W} y1={0} x2={c * W} y2={H} stroke={hair} strokeWidth={1} />
        ))}

        {/* Long, shallow arcs — the same slow sweep as the reference. */}
        <Path d={`M -40 ${H * 0.18} C ${W * 0.35} ${H * 0.04}, ${W * 0.7} ${H * 0.3}, ${W + 40} ${H * 0.12}`} stroke={curve} strokeWidth={1} fill="none" />
        <Path d={`M -40 ${H * 0.52} C ${W * 0.3} ${H * 0.38}, ${W * 0.68} ${H * 0.66}, ${W + 40} ${H * 0.46}`} stroke={curve} strokeWidth={1} fill="none" />
        <Path d={`M -40 ${H * 0.84} C ${W * 0.28} ${H * 0.72}, ${W * 0.74} ${H * 0.95}, ${W + 40} ${H * 0.78}`} stroke={curve} strokeWidth={1} fill="none" />

        {/* Nodes sitting on the intersections, as in the reference. */}
        <Circle cx={0.34 * W} cy={H * 0.145} r={2.5} fill={node} />
        <Circle cx={0.66 * W} cy={H * 0.545} r={2.5} fill={node} />
        <Circle cx={0.17 * W} cy={H * 0.79} r={2} fill={node} />
      </Svg>
    </View>
  );
}
