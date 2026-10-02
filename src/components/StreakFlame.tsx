import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Duolingo-style flame: an orange body with a gold tear-drop core, plus a few
// embers that drift up and fade.
//
// A grey "dormant" flame is always rendered in the same spot; the orange flame
// is layered on top and its opacity tracks whether the streak is alive — so a
// dead streak shows a grey flame (never an empty gap) rather than nothing.
//
// Motions:
//   • ambient — a gentle continuous flicker (slight sway/scale) + rising embers,
//     running while the flame is lit.
//   • ignition burst — when a NEW streak begins, the dormant grey flame bursts
//     into colour: the orange flame fades in with a quick scale pop and the
//     embers kick up. Triggered by bumping `igniteNonce`.

const ORANGE = '#FF9600';
const GOLD = '#FFC800';
const ORANGE_EDGE = '#D97800'; // outline that makes the lit flame pop
const GREY_OUTER = '#A2A7AE';
const GREY_INNER = '#C7CBD1';
const GREY_EDGE = '#7E838B';

// viewBox space is 120 wide × 150 tall (embers live in the top ~30 units).
// Rounded Duolingo-style body: a tall main head (top), a medium left head with a
// deep dip between them, and a small third head on the right.
const FLAME_BODY =
  'M69 28 ' +
  'C 76 38 78 50 80 58 ' + // main tip down into the right valley
  'C 82 52 86 47 89 48 ' + // small third head on the right
  'C 94 54 98 66 98 80 ' + // right shoulder down
  'C 98 104 82 122 60 122 ' + // round bottom-right
  'C 40 122 22 100 22 74 ' + // round bottom-left, up the left side
  'C 22 58 32 46 40 43 ' + // medium left head
  'C 44 47 50 53 54 58 ' + // dip between left and main heads
  'C 56 48 58 36 60 30 ' + // left side of the main head rising to a rounder tip
  'C 62 26 66 26 69 28 Z'; // rounded, thicker main tip
const FLAME_CORE =
  'M62 60 C 72 76 78 86 78 97 C 78 110 71 119 62 119 C 53 119 46 110 46 97 ' +
  'C 46 86 52 76 62 60 Z';

type Ember = { cx: number; from: number; to: number; size: number; delay: number; dur: number };
const EMBERS: Ember[] = [
  { cx: 40, from: 34, to: 4, size: 9, delay: 0, dur: 1500 },
  { cx: 56, from: 26, to: 0, size: 6, delay: 700, dur: 1700 },
  { cx: 30, from: 40, to: 12, size: 5, delay: 1200, dur: 1600 },
];

export function StreakFlame({
  lit,
  igniteNonce = 0,
  size = 46,
}: {
  lit: boolean;
  /** Bump this to a new value to play the dormant→flame ignition burst. */
  igniteNonce?: number;
  size?: number;
}) {
  const w = size;
  const h = size * (150 / 120);

  const flicker = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current; // scale, spikes during a burst
  const litT = useRef(new Animated.Value(lit ? 1 : 0)).current; // orange layer opacity
  const emberVals = useRef(EMBERS.map(() => new Animated.Value(0))).current;
  const prevNonce = useRef(igniteNonce);

  // Ambient flicker + embers, running whenever the flame is lit.
  useEffect(() => {
    if (!lit) {
      flicker.setValue(0);
      return;
    }
    const flick = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    flick.start();

    const emberLoops = emberVals.map((v, i) => {
      const e = EMBERS[i];
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(e.delay),
          Animated.timing(v, { toValue: 1, duration: e.dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      loop.start();
      return loop;
    });

    return () => {
      flick.stop();
      emberLoops.forEach((l) => l.stop());
    };
  }, [lit, flicker, emberVals]);

  // Steady state vs. ignition burst.
  useEffect(() => {
    const isBurst = igniteNonce !== prevNonce.current && igniteNonce > 0 && lit;
    prevNonce.current = igniteNonce;

    if (isBurst) {
      litT.setValue(0);
      pop.setValue(0.8);
      Animated.parallel([
        Animated.timing(litT, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(pop, { toValue: 1.16, duration: 380, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }),
          Animated.timing(pop, { toValue: 1, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      litT.setValue(lit ? 1 : 0);
      pop.setValue(1);
    }
  }, [lit, igniteNonce, litT, pop]);

  const sway = flicker.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });
  const scaleY = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <View style={[styles.wrap, { width: w, height: h }]}>
      {EMBERS.map((e, i) => {
        const v = emberVals[i];
        const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -(e.from - e.to)] });
        const opacity = v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.7, 0] });
        const emberSize = (e.size / 120) * w;
        const left = (e.cx / 120) * w - emberSize / 2;
        const top = (e.from / 150) * h - emberSize / 2;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left,
              top,
              width: emberSize,
              height: emberSize,
              borderRadius: emberSize * 0.3,
              backgroundColor: GOLD,
              transform: [{ translateY }, { rotate: '45deg' }],
              opacity,
            }}
          />
        );
      })}

      <Animated.View
        style={{
          width: w,
          height: h,
          transform: [{ scale: pop }, { rotate: sway }, { scaleY }],
        }}
      >
        {/* Dormant grey flame — always present so there's never an empty gap. */}
        <Svg width={w} height={h} viewBox="0 0 120 150" style={StyleSheet.absoluteFill}>
          <Path d={FLAME_BODY} fill={GREY_OUTER} stroke={GREY_EDGE} strokeWidth={3} strokeLinejoin="round" />
          <Path d={FLAME_CORE} fill={GREY_INNER} />
        </Svg>
        {/* Lit orange flame — fades in over the grey one. */}
        <Animated.View style={{ opacity: litT }}>
          <Svg width={w} height={h} viewBox="0 0 120 150">
            <Path d={FLAME_BODY} fill={ORANGE} stroke={ORANGE_EDGE} strokeWidth={3} strokeLinejoin="round" />
            <Path d={FLAME_CORE} fill={GOLD} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end' },
});
