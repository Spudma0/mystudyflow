import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';
import { Lesson } from '../types';

/**
 * The lesson roadmap: each lesson is a tile, and an elbow track runs from one
 * to the next so the path reads as a route rather than a list. Tiles alternate
 * sides, which is what gives the whole thing its winding shape.
 *
 * Three states — done, next up, and locked-looking future lessons — so the one
 * thing to do right now is obvious at a glance.
 */

const TILE = 76;
const ROW_H = 150;
/** How far each tile sits from the centre line. */
const OFFSET = 0.26;

function LessonIcon({ state, color }: { state: 'done' | 'next' | 'later'; color: string }) {
  if (state === 'done') return <Ionicons name="checkmark" size={30} color={color} />;
  if (state === 'next') return <Ionicons name="create-outline" size={28} color={color} />;
  return <Ionicons name="lock-closed" size={22} color={color} />;
}

export function LessonMap({
  lessons,
  completedIds,
  onPressLesson,
  onPressLocked,
}: {
  lessons: Lesson[];
  completedIds: string[];
  onPressLesson?: (lesson: Lesson) => void;
  /** A later lesson was tapped before the one before it was finished. */
  onPressLocked?: (lesson: Lesson) => void;
}) {
  const t = useBaseTheme();
  const done = new Set(completedIds);

  // The first unfinished lesson is the one being pointed at.
  const nextIndex = lessons.findIndex((l) => !done.has(l.id));

  const stateOf = (lesson: Lesson, i: number): 'done' | 'next' | 'later' =>
    done.has(lesson.id) ? 'done' : i === nextIndex ? 'next' : 'later';

  return (
    <View style={styles.wrap}>
      {lessons.map((lesson, i) => {
        const state = stateOf(lesson, i);
        // Alternate sides, starting on the left.
        const left = i % 2 === 0;
        const nextLeft = (i + 1) % 2 === 0;
        const isLast = i === lessons.length - 1;

        const tint =
          state === 'done' ? colors.green : state === 'next' ? t.accent : withAlpha(t.text, 0.35);
        const fill =
          state === 'done'
            ? withAlpha(colors.green, 0.16)
            : state === 'next'
            ? withAlpha(t.accent, 0.2)
            : withAlpha(t.text, 0.05);

        return (
          <View key={lesson.id} style={styles.row}>
            {/* The track to the following lesson, drawn behind the tiles. */}
            {!isLast && (
              <Connector
                fromLeft={left}
                toLeft={nextLeft}
                color={withAlpha(t.text, t.isLight ? 0.18 : 0.16)}
              />
            )}

            <View style={[styles.tileRow, left ? styles.alignLeft : styles.alignRight]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => (state === 'later' ? onPressLocked?.(lesson) : onPressLesson?.(lesson))}
                style={styles.tileTap}
              >
                <View
                  style={[
                    styles.tile,
                    { backgroundColor: fill, borderColor: tint },
                    state === 'next' && { shadowColor: t.accent, ...styles.tileGlow },
                  ]}
                >
                  <LessonIcon state={state} color={tint} />
                </View>

                <Text
                  style={[styles.step, { color: state === 'later' ? t.muted : tint }]}
                  numberOfLines={1}
                >
                  {state === 'done' ? 'Completed' : `Lesson ${i + 1}`}
                </Text>
                <Text
                  style={[styles.title, { color: state === 'later' ? t.secondary : t.text }]}
                  numberOfLines={2}
                >
                  {lesson.title}
                </Text>
                <Text style={[styles.meta, { color: t.muted }]} numberOfLines={1}>
                  {lesson.durationMin} min · {lesson.unitTitle}
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        );
      })}
    </View>
  );
}

/**
 * The elbow between two tiles. Drawn as a rounded S so the route reads as one
 * continuous path rather than a set of separate rules.
 */
function Connector({
  fromLeft,
  toLeft,
  color,
}: {
  fromLeft: boolean;
  toLeft: boolean;
  color: string;
}) {
  const x1 = fromLeft ? OFFSET * 100 : (1 - OFFSET) * 100;
  const x2 = toLeft ? OFFSET * 100 : (1 - OFFSET) * 100;
  // Control points held at the mid-height give the curve its even shoulders.
  const d = `M ${x1} 8 C ${x1} 55, ${x2} 45, ${x2} 96`;
  return (
    <View style={styles.connector} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path
          d={d}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.md },
  row: { height: ROW_H, justifyContent: 'flex-start' },
  connector: {
    position: 'absolute',
    top: TILE / 2,
    left: 0,
    right: 0,
    height: ROW_H,
  },
  tileRow: { flexDirection: 'row' },
  alignLeft: { justifyContent: 'flex-start', paddingLeft: '4%' },
  alignRight: { justifyContent: 'flex-end', paddingRight: '4%' },
  tileTap: { width: '46%', alignItems: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  step: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  title: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  meta: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});
