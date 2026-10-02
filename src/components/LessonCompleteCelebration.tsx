import React from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './PrimaryButton';
import { colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';

/**
 * The screen at the end of a lesson's questions.
 *
 * It is staged rather than shown all at once: the headline spells itself out a
 * letter at a time, fireworks go off around it, and only then does it move up
 * to make room for what was earned. The point is to make finishing feel like an
 * event — the numbers are the same either way, but a screen that simply appears
 * reads as a receipt.
 */

/** Each letter springs past its final size and settles back. */
const LETTER_STAGGER = 42;
const HEADLINE_SETTLE = 900;

const FIREWORK_COLOURS = [colors.amber, '#E879C7', '#A78BFA', colors.green];
const FIREWORK_SPOKES = 8;

export function LessonCompleteCelebration({
  xpEarned,
  maxXp,
  correct,
  answered,
  onContinue,
}: {
  xpEarned: number;
  maxXp: number;
  correct: number;
  /** Questions that could be marked — written answers have no verdict. */
  answered: number;
  onContinue: () => void;
}) {
  const t = useBaseTheme();
  const { width, height } = useWindowDimensions();

  const percent = answered > 0 ? Math.round((correct / answered) * 100) : 100;
  const perfect = answered > 0 && correct === answered;

  // One value drives the second half: the headline rising and everything that
  // appears underneath it, so they can't drift apart.
  const reveal = React.useRef(new Animated.Value(0)).current;
  const headline = 'Lesson complete!';
  const letters = React.useRef(
    headline.split('').map(() => new Animated.Value(0))
  ).current;

  React.useEffect(() => {
    const pops = letters.map((value, i) =>
      Animated.sequence([
        Animated.delay(i * LETTER_STAGGER),
        // Low friction is what gives the overshoot: it passes its final size
        // and comes back, rather than easing into it.
        Animated.spring(value, {
          toValue: 1,
          friction: 4.5,
          tension: 150,
          useNativeDriver: true,
        }),
      ])
    );

    Animated.sequence([
      Animated.parallel(pops),
      Animated.delay(HEADLINE_SETTLE),
      Animated.timing(reveal, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [letters, reveal]);

  // The headline starts in the middle of an empty screen and lifts a little to
  // make room, settling just above centre rather than going all the way to the
  // top — it stays the thing being looked at, with the numbers underneath it.
  const headlineShift = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [Math.min(height * 0.40, 380), Math.min(height * 0.24, 235)],
  });

  return (
    <View style={styles.wrap}>
      <Fireworks width={width} height={height} />

      <Animated.View
        style={[styles.headlineBlock, { transform: [{ translateY: headlineShift }] }]}
      >
        <PoppingHeadline text="Lesson" letters={letters} from={0} />
        <PoppingHeadline text="complete!" letters={letters} from={7} />
      </Animated.View>

      {/* Everything earned sits together at the foot of the screen, directly
          above the way out. */}
      <View style={styles.spacer} />

      <Animated.View style={[styles.stats, { opacity: reveal }]}>
        <StatCard
          label="XP EARNED"
          value={`${xpEarned}`}
          tint={colors.amber}
          icon="flash"
          reveal={reveal}
          order={0}
          footnote={xpEarned < maxXp ? `of ${maxXp}` : undefined}
        />
        <StatCard
          label="SCORE"
          value={`${percent}%`}
          tint={colors.green}
          icon="stats-chart"
          reveal={reveal}
          order={1}
          badge={perfect ? 'PERFECT!' : undefined}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.footer,
          {
            opacity: reveal,
            transform: [
              { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
            ],
          },
        ]}
      >
        <PrimaryButton label="CONTINUE" onPress={onContinue} />
      </Animated.View>

    </View>
  );
}

/** One line of the headline, each glyph on its own spring. */
function PoppingHeadline({
  text,
  letters,
  from,
}: {
  text: string;
  letters: Animated.Value[];
  /** Where this line starts in the headline, so the stagger runs unbroken. */
  from: number;
}) {
  return (
    <View style={styles.line}>
      {text.split('').map((character, i) => {
        const value = letters[from + i];
        if (character === ' ') return <View key={i} style={styles.space} />;
        return (
          <Animated.Text
            key={i}
            style={[
              styles.headlineText,
              {
                opacity: value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
                ],
              },
            ]}
          >
            {character}
          </Animated.Text>
        );
      })}
    </View>
  );
}

function StatCard({
  label,
  value,
  tint,
  icon,
  badge,
  footnote,
  reveal,
  order,
}: {
  label: string;
  value: string;
  tint: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  footnote?: string;
  reveal: Animated.Value;
  order: number;
}) {
  const t = useBaseTheme();
  // Each card lands after the one above it, and overshoots the same way the
  // letters do.
  const start = 0.15 + order * 0.2;
  const scale = reveal.interpolate({
    inputRange: [start, start + 0.3, start + 0.45, 1],
    outputRange: [0.7, 1.06, 1, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={[styles.card, { borderColor: tint, backgroundColor: withAlpha(tint, 0.07) }]}>
        <Text style={[styles.cardLabel, { color: t.onCardSecondary }]}>{label}</Text>
        <View style={styles.cardValue}>
          <Ionicons name={icon} size={20} color={tint} />
          <Text style={[styles.cardNumber, { color: tint }]}>{value}</Text>
          {footnote ? (
            <Text style={[styles.cardFootnote, { color: t.onCardMuted }]}>{footnote}</Text>
          ) : null}
        </View>
      </View>

      {badge ? (
        <View style={[styles.badge, { borderColor: tint, backgroundColor: t.base }]}>
          <Text style={[styles.badgeText, { color: tint }]}>{badge}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Starbursts going off across the screen.
 *
 * Each is eight short spokes that fly outwards from a point and fade — the
 * shape reads as a firework at this size far better than a particle spray,
 * and it costs eight views rather than fifty.
 */
function Fireworks({ width, height }: { width: number; height: number }) {
  const bursts = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        key: i,
        x: 0.1 + Math.random() * 0.8,
        y: 0.12 + Math.random() * 0.55,
        colour: FIREWORK_COLOURS[i % FIREWORK_COLOURS.length],
        delay: 420 + i * 260 + Math.random() * 180,
        size: 26 + Math.random() * 20,
      })),
    []
  );

  return (
    <View pointerEvents="none" style={styles.sky}>
      {bursts.map((burst) => (
        <Burst
          key={burst.key}
          left={burst.x * width}
          top={burst.y * height}
          colour={burst.colour}
          delay={burst.delay}
          size={burst.size}
        />
      ))}
    </View>
  );
}

function Burst({
  left,
  top,
  colour,
  delay,
  size,
}: {
  left: number;
  top: number;
  colour: string;
  delay: number;
  size: number;
}) {
  const value = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, {
        toValue: 1,
        duration: 760,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [value, delay]);

  const opacity = value.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0, 1, 0.8, 0] });
  const spread = value.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });

  return (
    <View style={[styles.burst, { left, top }]} pointerEvents="none">
      {Array.from({ length: FIREWORK_SPOKES }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.spoke,
            {
              backgroundColor: colour,
              height: size * 0.34,
              opacity,
              transform: [
                { rotate: `${(360 / FIREWORK_SPOKES) * i}deg` },
                {
                  translateY: spread.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-size * 0.15, -size],
                  }),
                },
                { scaleY: spread },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-start', paddingHorizontal: spacing.xl },
  headlineBlock: { alignItems: 'center', marginTop: spacing.xxxl, marginBottom: spacing.xxl },
  line: { flexDirection: 'row', justifyContent: 'center' },
  headlineText: {
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.amber,
  },
  space: { width: 12 },
  spacer: { flex: 1 },
  stats: { gap: spacing.xl, marginBottom: spacing.xl },
  card: {
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  cardValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardNumber: { fontSize: 22, fontWeight: '900' },
  cardFootnote: { fontSize: 12, fontWeight: '700' },
  // Sits on the card's top edge, breaking the border the way a sticker would.
  badge: {
    position: 'absolute',
    top: -12,
    right: spacing.lg,
    borderRadius: radii.sm,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  footer: { marginBottom: spacing.xxl },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  burst: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  spoke: { position: 'absolute', width: 3, borderRadius: 2 },
});
