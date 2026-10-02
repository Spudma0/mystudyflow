import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { useNow } from '../lib/useNow';

const MINUTE = 60 * 1000;

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * A round clock face: hours printed inside a dashed minute track, with the
 * hands meeting under a hollow hub.
 *
 * Only the hour and minute hands are drawn, so nothing has to animate — both
 * move on the minute, which is what the widget already refreshes on.
 */
/**
 * Sized so the tile it sits in comes out the same height as the streak / next
 * exam / classes-left tiles beside it: the card adds its own padding around
 * this, and anything larger makes the whole row taller than the others.
 */
const DEFAULT_SIZE = 92;

export function AnalogClockWidget({ size = DEFAULT_SIZE }: { size?: number }) {
  const t = useBaseTheme();
  const now = useNow(MINUTE);

  // Black or white, whichever reads against the tile — an accent tint
  // disappears when the tile is that same accent colour.
  const ink = t.onTile;

  const centre = size / 2;
  const numeralSize = size * 0.115;
  /** Box a numeral is centred in — scaled so two digits still fit. */
  const numeralBox = size * 0.2;
  // Close under the hour dashes, with just enough air not to touch them.
  const numeralRadius = centre - size * 0.165;
  /** Outer end of every dash, just inside the rim. */
  const trackRadius = centre - size * 0.028;
  const hubRadius = size * 0.026;

  const hourAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
  const minuteAngle = now.getMinutes() * 6;

  return (
    <View
      style={[
        styles.face,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: withAlpha(ink, 0.3),
        },
      ]}
    >
      {/* Numerals are text, so they sit outside the drawing and keep the app's
          font rather than becoming paths. */}
      {HOURS.map((hour, i) => {
        // −90° puts 12 at the top; each hour is another 30° clockwise.
        const angle = ((i * 30 - 90) * Math.PI) / 180;
        return (
          <Text
            key={hour}
            style={[
              styles.numeral,
              {
                color: ink,
                fontSize: numeralSize,
                width: numeralBox,
                left: centre + numeralRadius * Math.cos(angle) - numeralBox / 2,
                top: centre + numeralRadius * Math.sin(angle) - numeralSize * 0.62,
              },
            ]}
          >
            {hour}
          </Text>
        );
      })}

      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* The minute track: a short dash a minute, and a longer, heavier one
            on each hour, sitting under its numeral. */}
        {Array.from({ length: 60 }, (_, minute) => {
          const onHour = minute % 5 === 0;
          const angle = ((minute * 6 - 90) * Math.PI) / 180;
          // The hour dash is measured a little shorter because its round cap
          // adds half a stroke width back on at each end.
          const inner = trackRadius - (onHour ? size * 0.044 : size * 0.026);
          return (
            <Line
              key={minute}
              x1={centre + trackRadius * Math.cos(angle)}
              y1={centre + trackRadius * Math.sin(angle)}
              x2={centre + inner * Math.cos(angle)}
              y2={centre + inner * Math.sin(angle)}
              stroke={ink}
              strokeOpacity={onHour ? 1 : 0.45}
              strokeWidth={onHour ? size * 0.028 : size * 0.012}
              strokeLinecap={onHour ? 'round' : 'butt'}
            />
          );
        })}

        <G x={centre} y={centre}>
          <Path
            d={handPath(centre * 0.52, size * 0.021, hubRadius)}
            fill={ink}
            transform={`rotate(${hourAngle})`}
          />
          <Path
            d={handPath(centre * 0.84, size * 0.016, hubRadius)}
            fill={ink}
            transform={`rotate(${minuteAngle})`}
          />
        </G>

        {/* Hollow, so the two hands read as joined through a movement rather
            than as bars crossing. */}
        <Circle
          cx={centre}
          cy={centre}
          r={hubRadius}
          fill="none"
          stroke={ink}
          strokeWidth={size * 0.013}
        />
      </Svg>
    </View>
  );
}

/**
 * One hand, pointing straight up from the origin.
 *
 * It leaves the hub as a thin neck, flares to its full width over the first
 * third, then runs parallel to a rounded tip — the shape a watch hand has, and
 * what keeps the pair legible where they overlap near the centre.
 */
function handPath(length: number, halfWidth: number, start: number): string {
  const neck = halfWidth * 0.32;
  const flare = start + (length - start) * 0.22;
  const tip = length - halfWidth;
  return [
    `M ${-neck} ${-start}`,
    `L ${-halfWidth} ${-flare}`,
    `L ${-halfWidth} ${-tip}`,
    `A ${halfWidth} ${halfWidth} 0 0 1 ${halfWidth} ${-tip}`,
    `L ${halfWidth} ${-flare}`,
    `L ${neck} ${-start}`,
    'Z',
  ].join(' ');
}

const styles = StyleSheet.create({
  face: { alignSelf: 'center', borderWidth: 1 },
  numeral: { position: 'absolute', textAlign: 'center', fontWeight: '700', zIndex: 1 },
});
