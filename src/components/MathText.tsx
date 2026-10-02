import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { layoutMath, styleMathWords, typesetMath } from '../lib/mathNotation';
import { MathPieceView, MathRuns, StyledText } from './MathFormula';

/**
 * Text with any maths in it set the way it looks on paper.
 *
 * Lesson content is stored as plain text — `x^2`, `A_0`, `lim_(h->0)`,
 * `(a+b)/(c-d)` — which is hard to read printed literally. Indices are raised
 * and lowered, variables lean, and a fraction or a limit inside a sentence is
 * stacked properly instead of falling back to a slash and brackets.
 *
 * Most sentences render as one ordinary `Text`, which is what lets them wrap
 * and justify normally. Only a sentence that actually contains a stacked piece
 * needs the wrapping row below, where each word is its own box: that costs a
 * node per word, so it is used where it earns its keep and nowhere else.
 */

/** Style properties that belong to the paragraph, not to a word inside it. */
const LAYOUT_KEYS = [
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'width',
  'maxWidth',
  'minWidth',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginVertical',
  'marginHorizontal',
];

export function MathText({
  children,
  style,
  color,
  bullet,
  bulletWidth = 16,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
  /**
   * A dot or icon set beside the text, in a bulleted list.
   *
   * It belongs to this component rather than the row outside because only
   * this component knows how tall the first line is. A line carrying a
   * stacked fraction is two and a half times the height of a plain one, and a
   * bullet positioned from the top of the row then sits well above the words
   * — which reads as the bullet being on a line of its own.
   */
  bullet?: React.ReactNode;
  /** How far the text is indented past the bullet, wrapped lines included. */
  bulletWidth?: number;
  numberOfLines?: number;
}) {
  const source = children ?? '';
  const pieces = React.useMemo(() => layoutMath(source), [source]);
  const stacked = pieces.some(
    (piece) => piece.kind === 'frac' || piece.kind === 'under' || piece.kind === 'supfrac'
  );

  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const textStyle = { ...flat, ...(color ? { color } : null) } as TextStyle;

  // Truncation only works within a single Text, so a clamped line keeps the
  // flowing form even when it holds a fraction.
  const size = typeof textStyle.fontSize === 'number' ? textStyle.fontSize : 14;
  const lineHeight = typeof textStyle.lineHeight === 'number' ? textStyle.lineHeight : size * 1.4;

  const wrapStyle: Record<string, unknown> = {};
  const wordStyle: Record<string, unknown> = { ...textStyle };
  for (const key of LAYOUT_KEYS) {
    if (flat[key] === undefined) continue;
    wrapStyle[key] = flat[key];
    delete wordStyle[key];
  }

  /**
   * The bullet, boxed to exactly one plain line and centred within it.
   *
   * Sizing the box rather than nudging the bullet is what makes it land in the
   * same place on both paths: beside a plain first line the box is that line,
   * and beside a tall one the box is centred in it along with the words.
   */
  const markerBox = (extra?: ViewStyle) =>
    bullet ? (
      <View style={[{ width: bulletWidth, height: lineHeight }, styles.marker, extra]}>
        {bullet}
      </View>
    ) : null;

  if (!stacked || numberOfLines) {
    const text = (
      <MathRuns
        style={bullet ? [wordStyle as TextStyle, styles.flowText] : textStyle}
        baseSize={size}
        numberOfLines={numberOfLines}
      >
        {typesetMath(source)}
      </MathRuns>
    );
    // A column of its own for the text indents the wrapped lines by itself.
    if (!bullet) return text;
    return (
      <View style={[styles.flowRow, wrapStyle as ViewStyle]}>
        {markerBox()}
        {text}
      </View>
    );
  }

  const tint = (color ?? textStyle.color ?? '#000') as string;

  return (
    // The bullet flows with the words so it lands on the first line whatever
    // that line's height, and the padding it is pulled out of is what indents
    // every line after it.
    <View
      style={[styles.wrap, bullet ? { paddingLeft: bulletWidth } : null, wrapStyle as ViewStyle]}
    >
      {markerBox({ marginLeft: -bulletWidth })}
      {pieces.flatMap((piece, i) => {
        if (piece.kind !== 'plain') {
          return [
            <MathPieceView
              key={`${i}`}
              piece={piece}
              size={size}
              color={tint}
              weight={textStyle.fontWeight}
            />,
          ];
        }
        // A word at a time, so the paragraph still wraps between words. The
        // space rides along with the word it follows, where a line break hides
        // it; stacked pieces carry their own margins.
        return styleMathWords(piece.text).map((runs, w) => (
          <StyledText
            key={`${i}-${w}`}
            runs={[...runs, { text: ' ', italic: false, math: false }]}
            style={wordStyle as TextStyle}
            baseSize={size}
          />
        ));
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  flowRow: { flexDirection: 'row', alignItems: 'flex-start' },
  marker: { justifyContent: 'center', alignItems: 'flex-start' },
  flowText: { flex: 1 },
});
