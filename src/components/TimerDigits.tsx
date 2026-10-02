import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

/**
 * A countdown read-out drawn as stroked glyphs rather than set in a font: thin,
 * rounded, wide-apart digits in the style of a hardware timer display. Drawing
 * them keeps the look identical on every device instead of depending on which
 * numeric faces happen to be installed.
 */

// Every glyph is designed in this box and scaled to the requested height.
const D_W = 60;
const D_H = 100;
const GAP = 12;
const COLON_W = 24;

const DIGITS: Record<string, string> = {
  '0': 'M 30 6 C 43 6 53 25 53 50 C 53 75 43 94 30 94 C 17 94 7 75 7 50 C 7 25 17 6 30 6 Z',
  '1': 'M 14 24 L 31 6 L 31 94',
  '2': 'M 9 25 C 9 13 18 6 30 6 C 43 6 52 15 52 28 C 52 45 30 58 9 94 L 53 94',
  '3': 'M 10 17 C 15 10 22 6 31 6 C 43 6 51 14 51 25 C 51 37 43 45 30 45 C 44 45 53 54 53 68 C 53 83 42 94 29 94 C 18 94 11 89 7 81',
  '4': 'M 41 94 L 41 6 L 8 67 L 54 67',
  '5': 'M 49 6 L 17 6 L 12 43 C 19 38 25 36 31 36 C 44 36 53 47 53 64 C 53 82 42 94 29 94 C 19 94 11 90 7 82',
  '6': 'M 47 12 C 42 8 36 6 31 6 C 17 6 8 23 8 52 C 8 78 17 94 30 94 C 43 94 52 83 52 69 C 52 55 43 45 31 45 C 19 45 9 54 8 65',
  '7': 'M 8 6 L 53 6 L 27 94',
  '8': 'M 30 45 C 18 45 10 37 10 27 C 10 15 19 6 30 6 C 41 6 50 15 50 27 C 50 37 42 45 30 45 C 44 45 54 55 54 69 C 54 83 43 94 30 94 C 17 94 6 83 6 69 C 6 55 16 45 30 45 Z',
  '9': 'M 13 88 C 18 92 24 94 29 94 C 43 94 52 77 52 48 C 52 22 43 6 30 6 C 17 6 8 17 8 31 C 8 45 17 55 29 55 C 41 55 51 46 52 35',
};

function glyphWidth(ch: string): number {
  return ch === ':' ? COLON_W : D_W;
}

export function TimerDigits({
  /** Characters to draw — digits and colons only. */
  text,
  /** Cap height of the digits in points. */
  height = 46,
  color,
}: {
  text: string;
  height?: number;
  color: string;
}) {
  const chars = text.split('');
  const boxWidth = chars.reduce((w, c, i) => w + glyphWidth(c) + (i ? GAP : 0), 0);
  const scale = height / D_H;
  const stroke = 6.5;

  let x = 0;
  const glyphs = chars.map((ch, i) => {
    const at = x;
    x += glyphWidth(ch) + GAP;
    if (ch === ':') {
      return (
        <G key={i} x={at}>
          <Circle cx={COLON_W / 2} cy={36} r={5} fill={color} />
          <Circle cx={COLON_W / 2} cy={68} r={5} fill={color} />
        </G>
      );
    }
    const d = DIGITS[ch];
    if (!d) return null;
    return (
      <G key={i} x={at}>
        <Path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    );
  });

  return (
    <Svg width={boxWidth * scale} height={height} viewBox={`0 0 ${boxWidth} ${D_H}`}>
      {glyphs}
    </Svg>
  );
}
