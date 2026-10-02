import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

/**
 * A ring of small capsule lights that burn out as a countdown drains — the
 * whole ring is lit at the start and the lamps go dark one by one, clockwise
 * from the top, until none are left.
 */
export function SegmentRing({
  size,
  /** 0 = every lamp out, 1 = every lamp lit. */
  progress,
  color,
  segments = 24,
  children,
}: {
  size: number;
  progress: number;
  color: string;
  segments?: number;
  children?: React.ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const segH = size * 0.17;
  const segW = size * 0.055;
  const radius = size / 2 - segH / 2 - size * 0.02;

  const clamped = Math.max(0, Math.min(1, progress));
  const lit = Math.round(clamped * segments);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {Array.from({ length: segments }, (_, i) => {
          const angle = (360 / segments) * i;
          const on = i < lit;
          const x = cx - segW / 2;
          const y = cy - radius - segH / 2;
          const rotate = `rotate(${angle} ${cx} ${cy})`;
          return (
            <React.Fragment key={i}>
              {/* A wider, faint copy behind each lit lamp stands in for a glow. */}
              {on && (
                <Rect
                  x={x - segW * 0.55}
                  y={y - segW * 0.55}
                  width={segW * 2.1}
                  height={segH + segW * 1.1}
                  rx={segW}
                  fill={color}
                  fillOpacity={0.18}
                  transform={rotate}
                />
              )}
              <Rect
                x={x}
                y={y}
                width={segW}
                height={segH}
                rx={segW / 2}
                fill={color}
                fillOpacity={on ? 0.95 : 0.13}
                transform={rotate}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      {children ? <View style={styles.center} pointerEvents="none">{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
