import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import {
  MathPiece,
  StyledRun,
  layoutMath,
  splitWorkingLines,
  styleMathRuns,
} from '../lib/mathNotation';
import { mathTextStyle } from '../theme/mathFont';
import { useBaseTheme } from '../theme/useBaseTheme';
import { withAlpha } from '../store/useThemeStore';

/**
 * A formula set on its own line, the way it appears in a textbook.
 *
 * This is display maths, not inline maths, and the difference matters: a
 * formula on its own line is a block, so it can be laid out with a stacked
 * fraction, a limit with its condition underneath and a root under a bar.
 * The same pieces are used inside prose by `MathText`, so a limit reads the
 * same whether it stands alone or sits in a sentence.
 */

/**
 * The space a sloped letter needs after it.
 *
 * Every italic letter leans into whatever follows, which is why typesetting
 * adds an italic correction. In a serif `f` is the extreme case: its hook
 * overhangs so far that `f(x)` sets the bracket underneath it unless the gap
 * is opened up. Letter spacing is the way to add it here, since a variable is
 * a single character and the space therefore lands after it.
 */
function italicCorrection(text: string, baseSize = 14): TextStyle {
  const overhangs = /[fj]/.test(text);
  return { letterSpacing: baseSize * (overhangs ? 0.19 : 0.03) };
}

/**
 * Already-styled runs as one flowing `Text`.
 *
 * Maths takes the mathematical face and variables lean; the prose around it
 * keeps the interface font. Nested `Text` is what makes that possible without
 * breaking the line: a box per run would stop the sentence wrapping.
 */
export function StyledText({
  runs,
  style,
  baseSize,
  numberOfLines,
}: {
  runs: StyledRun[];
  style?: StyleProp<TextStyle>;
  /** The size of the surrounding text, so maths can be scaled to match it. */
  baseSize?: number;
  numberOfLines?: number;
}) {
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {runs.map((run, i) => {
        if (!run.math && !run.italic) return run.text;
        return (
          <Text
            key={i}
            style={[
              run.math && mathTextStyle(baseSize),
              run.italic && styles.variable,
              run.italic && italicCorrection(run.text, baseSize),
            ]}
          >
            {run.text}
          </Text>
        );
      })}
    </Text>
  );
}

/** Typeset maths as text, with variables leaning and names upright. */
export function MathRuns({
  children,
  style,
  baseSize,
  forceMath,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  baseSize?: number;
  /** Everything here is maths — used inside a displayed formula. */
  forceMath?: boolean;
  numberOfLines?: number;
}) {
  const runs = React.useMemo(
    () => styleMathRuns(children ?? '', forceMath),
    [children, forceMath]
  );
  return (
    <StyledText runs={runs} style={style} baseSize={baseSize} numberOfLines={numberOfLines} />
  );
}

/** One piece of two-dimensional maths: a fraction, a limit, a root. */
export function MathPieceView({
  piece,
  size,
  color,
  weight,
}: {
  piece: MathPiece;
  size: number;
  color: string;
  /** Inherited from the text around it, so maths in a bold line stays bold. */
  weight?: TextStyle['fontWeight'];
}) {
  const textStyle: TextStyle = { fontSize: size, color, lineHeight: size * 1.35, fontWeight: weight };
  // Everything inside a stacked piece is maths, whatever it looks like.
  const math = { ...textStyle, ...mathTextStyle(size) };

  if (piece.kind === 'frac') {
    return (
      <View style={styles.frac}>
        <MathRuns style={[textStyle, styles.fracPart]} baseSize={size} forceMath>
          {piece.top}
        </MathRuns>
        <View style={[styles.fracBar, { backgroundColor: color }]} />
        <MathRuns style={[textStyle, styles.fracPart]} baseSize={size} forceMath>
          {piece.bottom}
        </MathRuns>
      </View>
    );
  }

  if (piece.kind === 'supfrac') {
    // Index-sized and lifted clear of the baseline, so it reads as one index
    // rather than as a fraction the rest of the expression sits inside.
    const small = size * 0.62;
    const indexStyle: TextStyle = {
      ...textStyle,
      ...mathTextStyle(small),
      lineHeight: small * 1.15,
    };
    return (
      <View style={[styles.frac, styles.supfrac, { marginBottom: size * 0.62 }]}>
        <MathRuns style={[indexStyle, styles.fracPart]} baseSize={small} forceMath>
          {piece.top}
        </MathRuns>
        <View style={[styles.fracBar, styles.supfracBar, { backgroundColor: color }]} />
        <MathRuns style={[indexStyle, styles.fracPart]} baseSize={small} forceMath>
          {piece.bottom}
        </MathRuns>
      </View>
    );
  }

  if (piece.kind === 'under') {
    const small = size * 0.68;
    return (
      <View style={styles.under}>
        <Text style={math}>{piece.operator}</Text>
        <MathRuns
          style={[textStyle, { fontSize: small, lineHeight: size * 0.9 }]}
          baseSize={small}
          forceMath
        >
          {piece.condition}
        </MathRuns>
      </View>
    );
  }

  if (piece.kind === 'root') {
    return (
      <View style={styles.root}>
        <Text style={math}>√</Text>
        <View style={[styles.rootBody, { borderTopColor: color }]}>
          <MathRuns style={textStyle} baseSize={size} forceMath>
            {piece.text}
          </MathRuns>
        </View>
      </View>
    );
  }

  // Shrinkable, so a single long run wraps inside itself rather than running
  // off the edge — a flex item does not shrink by default.
  return (
    <MathRuns style={[textStyle, styles.plain]} baseSize={size} forceMath>
      {piece.text}
    </MathRuns>
  );
}

export function MathFormula({
  children,
  size = 16,
  align = 'center',
  boxed = true,
}: {
  children: string;
  size?: number;
  align?: 'center' | 'left';
  /** A tinted panel behind it, as a textbook sets a displayed formula apart. */
  boxed?: boolean;
}) {
  const t = useBaseTheme();
  // A chain of working is set one step to a line; anything else is one line
  // that wraps if it has to.
  const lines = React.useMemo(() => splitWorkingLines(children ?? ''), [children]);
  const chained = lines.length > 1;

  return (
    <View
      style={[
        styles.block,
        boxed && [styles.boxed, { backgroundColor: withAlpha(t.accent, 0.09) }],
      ]}
    >
      {lines.map((line, li) => (
        <View
          key={li}
          style={[
            styles.wrap,
            // Continuation steps hang under the first, so the relations line
            // up the way they would on paper.
            chained ? styles.left : align === 'center' ? styles.center : styles.left,
            chained && li > 0 && styles.continuation,
          ]}
        >
          {layoutMath(line).map((piece, i) => (
            <MathPieceView key={i} piece={piece} size={size} color={t.text} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginVertical: 10 },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  center: { justifyContent: 'center' },
  left: { justifyContent: 'flex-start' },
  continuation: { paddingLeft: 20 },
  plain: { flexShrink: 1 },
  boxed: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  variable: { fontStyle: 'italic' },
  frac: { alignItems: 'center', marginHorizontal: 4 },
  fracPart: { textAlign: 'center', paddingHorizontal: 4 },
  fracBar: { height: 1.4, alignSelf: 'stretch', marginVertical: 3, minWidth: 16 },
  supfrac: { marginHorizontal: 1 },
  supfracBar: { height: 1, marginVertical: 1, minWidth: 8 },
  // `lim` is an operator name, and print sets a space between it and what it
  // applies to — `lim f(x)`, never `limf(x)`.
  under: { alignItems: 'center', marginLeft: 3, marginRight: 7 },
  root: { flexDirection: 'row', alignItems: 'flex-start' },
  rootBody: { borderTopWidth: 1.2, paddingTop: 2, marginTop: 2, paddingHorizontal: 2 },
});
