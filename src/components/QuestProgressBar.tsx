import React from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { withAlpha } from '../store/useThemeStore';

/**
 * A progress bar that reacts when it advances.
 *
 * The bar itself slides to the new length, and at the same moment the head
 * throws off an expanding ring and a couple of sparks, which fade as they
 * travel. The point is that answering a question should *register* — a bar
 * that silently gets longer while you are reading the explanation is easy to
 * miss entirely.
 *
 * The length runs on the JavaScript driver, because a percentage width cannot
 * be animated natively; the burst is transform and opacity only, so it runs on
 * the native driver and stays smooth regardless.
 */

const SPARKS = [
  { dx: 16, dy: -13 },
  { dx: 11, dy: 12 },
  { dx: 20, dy: 3 },
];

export function QuestProgressBar({
  progress,
  color,
  trackColor,
  height = 8,
  celebrate = true,
}: {
  /** 0–1. */
  progress: number;
  color: string;
  trackColor: string;
  height?: number;
  /**
   * Whether this advance is worth marking. False slides the bar and nothing
   * more — a burst for a wrong answer would be congratulating the student on
   * getting it wrong.
   */
  celebrate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const fill = React.useRef(new Animated.Value(clamped)).current;
  const burst = React.useRef(new Animated.Value(0)).current;
  const previous = React.useRef(clamped);

  React.useEffect(() => {
    const advanced = clamped > previous.current;
    previous.current = clamped;

    Animated.timing(fill, {
      toValue: clamped,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Only going forwards, and only when the advance earned it: restarting the
    // questions rewinds the bar, and a celebration for that would be reading
    // the moment wrong.
    if (!advanced || !celebrate) return;
    burst.setValue(0);
    Animated.timing(burst, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [clamped, fill, burst, celebrate]);

  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // The ring starts tight on the head and opens outwards as it fades.
  const ringScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.35, 2.3] });
  const ringOpacity = burst.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0, 0.85, 0],
  });
  const headGlow = burst.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 1, 0],
  });

  const ring = height * 3.4;

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}>
      <Animated.View
        style={[styles.fill, { width, backgroundColor: color, borderRadius: height / 2 }]}
      >
        {/*
          Pinned to the centre of the fill's rounded end, so the burst is
          concentric with the head and travels with it. There is no separate
          cap: the fill is already a pill, and drawing a circle on top of its
          end only made the bar look like it had a bead stuck to it.
        */}
        <View style={[styles.head, { right: height / 2 }]} pointerEvents="none">
          <Animated.View
            style={[
              styles.ring,
              {
                width: ring,
                height: ring,
                borderRadius: ring / 2,
                borderColor: color,
                borderWidth: Math.max(1.5, height * 0.22),
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.glow,
              {
                width: height * 1.9,
                height: height * 1.9,
                borderRadius: height,
                backgroundColor: withAlpha(color, 0.55),
                opacity: headGlow,
              },
            ]}
          />
          {SPARKS.map((spark, i) => (
            <Animated.View
              key={i}
              style={[
                styles.spark,
                {
                  width: Math.max(2.5, height * 0.34),
                  height: Math.max(2.5, height * 0.34),
                  borderRadius: height,
                  backgroundColor: color,
                  opacity: burst.interpolate({
                    inputRange: [0, 0.2, 0.75],
                    outputRange: [0, 1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateX: burst.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, spark.dx],
                      }),
                    },
                    {
                      translateY: burst.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, spark.dy],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'visible' },
  fill: { height: '100%' },
  head: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  glow: { position: 'absolute' },
  spark: { position: 'absolute' },
});
