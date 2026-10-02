import { Platform, TextStyle } from 'react-native';

/**
 * The face maths is set in.
 *
 * Printed maths — LaTeX, and Word's equation editor after it — is a serif:
 * Computer Modern and Cambria Math are both old-style romans, with upright
 * digits and operators and a sloped italic for variables. Setting maths in the
 * app's interface sans makes an expression look like a line of UI text, which
 * is exactly what the two are meant not to be confused for.
 *
 * These are faces every platform already has, so no font file has to ship with
 * the app: Times New Roman is on iOS and Windows, and Android's `serif` is
 * Noto Serif. All three are close enough to the printed page that an
 * expression reads as maths at a glance.
 */
export const MATH_FONT = Platform.select({
  ios: 'Times New Roman',
  android: 'serif',
  default: '"Times New Roman", "Cambria Math", serif',
});

/**
 * A serif runs smaller than a sans at the same nominal size, because its
 * x-height is lower. A touch more size puts the maths back on an even footing
 * with the words around it.
 */
export const MATH_SCALE = 1.06;

/** The style a run of maths takes, given the size of the text around it. */
export function mathTextStyle(baseSize?: number): TextStyle {
  return {
    fontFamily: MATH_FONT,
    ...(typeof baseSize === 'number' ? { fontSize: baseSize * MATH_SCALE } : null),
  };
}
