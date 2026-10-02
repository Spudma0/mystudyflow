import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/**
 * A mechanical split-flap flip clock digit card.
 *
 * The card is split into a top and bottom half joined at a centre hinge. On a
 * value change:
 *   • Phase 1 (0→½): the upper flap (showing the OLD top) folds down around the
 *     hinge to −90°, revealing the NEW top printed on the static upper half.
 *   • Phase 2 (½→1): the lower flap (showing the NEW bottom) folds up from +90°
 *     into place over the static lower half (which still shows the OLD bottom).
 * A shadow deepens as each flap approaches the hinge and softens as it settles,
 * and a 3D perspective makes the flaps rotate rather than merely scale.
 */
/**
 * How far a digit sits below the centre of its own line box, as a fraction of
 * the font size. Measured from the font metrics: half the unused ascent minus
 * half the unused descent.
 */
const DIGIT_OPTICAL_SHIFT = 0.0625;

export function FlipDigit({
  value,
  digitColor,
  cardColor = '#141418',
  size = 64,
}: {
  value: string;
  digitColor: string;
  cardColor?: string;
  size?: number;
}) {
  const [shown, setShown] = useState(value);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value === shown) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShown(value);
        anim.setValue(0);
      }
    });
  }, [value, shown, anim]);

  const W = size * 1.5;
  const H = size * 1.36;
  const halfH = H / 2;

  const newVal = value;
  const oldVal = shown;

  // Upper flap: OLD top, folds down (0° → −90°) during the first half.
  const topRot = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-90deg', '-90deg'] });
  const topOpacity = anim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const topShadow = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.45, 0.45], extrapolate: 'clamp' });

  // Lower flap: NEW bottom, folds up (+90° → 0°) during the second half.
  const botRot = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['90deg', '90deg', '0deg'] });
  const botOpacity = anim.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });
  const botShadow = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 0.45, 0], extrapolate: 'clamp' });

  const faceProps = { W, H, halfH, size, cardColor, digitColor };

  return (
    <View style={{ width: W, height: H }}>
      {/* Static upper half — the NEW digit's top, revealed as the flap folds away. */}
      <View style={styles.abs}>
        <HalfFace half="top" text={newVal} {...faceProps} />
      </View>
      {/* Static lower half — the OLD digit's bottom, until the flap covers it. */}
      <View style={[styles.abs, { top: halfH }]}>
        <HalfFace half="bottom" text={oldVal} {...faceProps} />
      </View>

      {/* Upper flap (OLD top) folding down around the hinge. */}
      <Animated.View
        style={[
          styles.abs,
          {
            opacity: topOpacity,
            transform: [{ perspective: 900 }, { translateY: halfH / 2 }, { rotateX: topRot }, { translateY: -halfH / 2 }],
          },
        ]}
      >
        <HalfFace half="top" text={oldVal} {...faceProps} shadow={topShadow} />
      </Animated.View>

      {/* Lower flap (NEW bottom) folding up into place. */}
      <Animated.View
        style={[
          styles.abs,
          {
            top: halfH,
            opacity: botOpacity,
            transform: [{ perspective: 900 }, { translateY: -halfH / 2 }, { rotateX: botRot }, { translateY: halfH / 2 }],
          },
        ]}
      >
        <HalfFace half="bottom" text={newVal} {...faceProps} shadow={botShadow} />
      </Animated.View>

      <View style={[styles.seam, { top: halfH - 1 }]} pointerEvents="none" />
    </View>
  );
}

function HalfFace({
  half,
  text,
  W,
  H,
  halfH,
  size,
  cardColor,
  digitColor,
  shadow,
}: {
  half: 'top' | 'bottom';
  text: string;
  W: number;
  H: number;
  halfH: number;
  size: number;
  cardColor: string;
  digitColor: string;
  shadow?: Animated.AnimatedInterpolation<string | number>;
}) {
  const isTop = half === 'top';
  return (
    <View
      style={{
        width: W,
        height: halfH,
        overflow: 'hidden',
        backgroundColor: cardColor,
        borderTopLeftRadius: isTop ? 14 : 0,
        borderTopRightRadius: isTop ? 14 : 0,
        borderBottomLeftRadius: isTop ? 0 : 14,
        borderBottomRightRadius: isTop ? 0 : 14,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: isTop ? 0 : -halfH,
          width: W,
          height: H,
          alignItems: 'center',
          justifyContent: 'center',
          // Centring puts the *line box* on the hinge, not the digit. A line
          // box reserves room for descenders and digits have none, so the
          // glyph ends up sitting below the seam — measured at 4px low for a
          // 64px digit, which is what made the split look off centre.
          transform: [{ translateY: -size * DIGIT_OPTICAL_SHIFT }],
        }}
      >
        <Text style={{ fontSize: size, color: digitColor, fontWeight: '800', fontVariant: ['tabular-nums'], includeFontPadding: false }}>
          {text}
        </Text>
      </View>
      {shadow != null && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000000', opacity: shadow }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', top: 0, left: 0 },
  seam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
});
