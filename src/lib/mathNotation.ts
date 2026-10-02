/**
 * Parsing for on-paper maths notation.
 *
 * Lesson content is stored as plain text, so an index arrives as `x^2`, a
 * fraction as `(a+b)/(c-d)` and a root as `sqrt(x)`. This turns that into a
 * list of nodes a renderer can lay out as real superscripts, subscripts,
 * stacked fractions and mathematical symbols — so it applies to everything
 * already generated as well as anything written later.
 *
 * Kept free of any UI imports so the behaviour can be tested on its own. It is
 * deliberately not a full LaTeX engine: it covers the notation school maths
 * actually uses, and anything it doesn't recognise falls through as ordinary
 * text rather than breaking the page.
 */

/** Word and ASCII forms that have a proper printed symbol. */
const SYMBOLS: [RegExp, string][] = [
  [/\\?\balpha\b/g, 'α'],
  [/\\?\bbeta\b/g, 'β'],
  [/\\?\btheta\b/g, 'θ'],
  [/\\?\blambda\b/g, 'λ'],
  [/\\?\bmu\b/g, 'μ'],
  [/\\?\bsigma\b/g, 'σ'],
  [/\\?\bDelta\b/g, 'Δ'],
  [/\\?\bpi\b/g, 'π'],
  [/\\?\binfinity\b|\\?\binf\b/g, '∞'],
  [/\bin R\b/g, '∈ ℝ'],
  [/\bin Z\b/g, '∈ ℤ'],
  [/\bin N\b/g, '∈ ℕ'],
  [/<=>/g, '⇔'],
  [/<=/g, '≤'],
  [/>=/g, '≥'],
  [/!=/g, '≠'],
  [/->/g, '→'],
  [/\+-|\+\/-/g, '±'],
  [/\bintegral\b|\bint\b(?!\w)/g, '∫'],
  [/\bsum\b(?=\s|$)/g, 'Σ'],
  [/\bdelta\b/g, 'δ'],
  // Emphasis first: *near* is a marked-up word, not a multiplication. Only a
  // star sitting between two operands is a times sign.
  [/\*([^*\n]{1,60})\*/g, '$1'],
  [/(?<=[0-9A-Za-z)\]])\s*\*\s*(?=[0-9A-Za-z(\[])/g, ' × '],
  [/\*/g, ''],
];

function applySymbols(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);
  return out;
}

/** A run of text, or a piece of maths that needs its own layout. */
export type MathNode =
  | { kind: 'text'; text: string }
  | { kind: 'sup'; text: string }
  | { kind: 'sub'; text: string }
  | { kind: 'frac'; top: string; bottom: string }
  | { kind: 'root'; body: string };

/**
 * Pull the argument that an operator applies to.
 *
 * Handles `x^2`, `x^{n+1}`, `x^(n+1)` and `e^-x` — an unbraced argument runs
 * until the character that can't be part of it.
 */
function readArgument(src: string, from: number): { value: string; next: number } {
  if (src[from] === '{' || src[from] === '(') {
    const close = src[from] === '{' ? '}' : ')';
    let depth = 0;
    for (let i = from; i < src.length; i += 1) {
      if (src[i] === src[from]) depth += 1;
      else if (src[i] === close) {
        depth -= 1;
        if (depth === 0) return { value: src.slice(from + 1, i), next: i + 1 };
      }
    }
    return { value: src.slice(from + 1), next: src.length };
  }
  // Bare argument: an optional sign, then letters/digits/dots.
  const match = /^[-+]?[A-Za-z0-9.]+/.exec(src.slice(from));
  if (!match) return { value: '', next: from };
  return { value: match[0], next: from + match[0].length };
}

/**
 * One side of a fraction written without brackets.
 *
 * A dot is only allowed between digits, so "v^2." keeps its full stop as the
 * end of the sentence instead of dragging it under the fraction bar. Greek
 * letters are included because symbol substitution has already run.
 */
const OPERAND = '[A-Za-zα-ωΑ-Ω0-9^_{}]+(?:\\.[A-Za-z0-9^_{}]+)*';

/** Differentials read as fractions even though they are two plain letters. */
const DIFFERENTIALS = /^d[a-z]$/;

/**
 * Unit symbols. `m/s` is a rate written with a slash, not a fraction to stack,
 * and both sides have to be units before a slash is read that way — `m/n` is
 * still one variable over another.
 */
const UNITS = /^(?:m|s|h|g|N|J|W|K|A|V|L|C|Hz|kg|km|cm|mm|ms|mL|min)$/;

/** The name a bracket group can be applied to: `f`, `g'`, `h_1`. */
const IDENTIFIER = "[A-Za-zα-ωΑ-Ω0-9^_'′]+";

/**
 * Read the bracket group that ends `text`, back to its matching opener.
 *
 * Only the outermost pair of that kind is counted, so `[f(a+h) − f(a)]` comes
 * back whole rather than stopping at the inner `f(a)`. When the group is
 * applied to a name — `f(x)` — the name and its brackets are kept together,
 * because `f(x)/g(x)` is f-of-x over g-of-x, not x over x.
 */
function readGroupBack(text: string): { value: string; startsAt: number; bare: boolean } | null {
  const close = text[text.length - 1];
  const open = close === ')' ? '(' : close === ']' ? '[' : null;
  if (!open) return null;

  let depth = 0;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (text[i] === close) depth += 1;
    else if (text[i] === open) {
      depth -= 1;
      if (depth > 0) continue;
      if (text.length - i > 64) return null;
      const name = new RegExp(`${IDENTIFIER}$`).exec(text.slice(0, i));
      if (name) {
        return { value: name[0] + text.slice(i), startsAt: i - name[0].length, bare: false };
      }
      return { value: text.slice(i + 1, text.length - 1), startsAt: i, bare: true };
    }
  }
  return null;
}

/** The same, reading forwards from the start of `text`. */
function readGroupForward(text: string, from: number): { length: number } | null {
  const open = text[from];
  const close = open === '(' ? ')' : open === '[' ? ']' : null;
  if (!close) return null;

  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i + 1 - from > 64 ? null : { length: i + 1 - from };
    }
  }
  return null;
}

/** One denominator: a name, a bracket group, or a name applied to one. */
function readOperandForward(text: string): { value: string; length: number; bare: boolean } | null {
  const name = new RegExp(`^${OPERAND}`).exec(text);
  let length = name ? name[0].length : 0;
  const group = readGroupForward(text, length);
  if (group) length += group.length;
  if (!length) return null;
  // A group on its own is a grouping bracket, so its contents are the operand;
  // a group after a name is function application and the brackets stay.
  if (!name && group) return { value: text.slice(1, length - 1), length, bare: true };
  return { value: text.slice(0, length), length, bare: false };
}

/**
 * Decide whether a `/` is a fraction worth stacking.
 *
 * Only when both sides are compact — `(a+b)/(c+d)` or `3/4` is a fraction;
 * "kg/m" or a date is not, and stacking those would look wrong.
 */
function readFraction(
  src: string,
  slashAt: number,
  before: string
): { top: string; bottom: string; startsAt: number; next: number } | null {
  const trimmedLeft = before.replace(/\s+$/, '');
  const droppedLeft = before.length - trimmedLeft.length;
  if (!trimmedLeft) return null;

  let top = '';
  let startsAt = 0;
  let topBracketed = false;
  const grouped = readGroupBack(trimmedLeft);
  const plain = new RegExp(`(${OPERAND})$`).exec(trimmedLeft);
  if (grouped) {
    top = grouped.value;
    startsAt = grouped.startsAt;
    topBracketed = true;
  } else if (plain) {
    top = plain[1];
    startsAt = trimmedLeft.length - plain[1].length;
  } else {
    return null;
  }

  // Whitespace either side of the slash is normal in prose maths.
  const afterRaw = src.slice(slashAt + 1);
  const leadingSpace = /^\s*/.exec(afterRaw)![0].length;
  const after = afterRaw.slice(leadingSpace);

  const denominator = readOperandForward(after);
  if (!denominator) return null;
  const bottom = denominator.value;
  const consumed = denominator.length;
  const bottomIsBracketed = denominator.bare;

  // "and/or", "km/h" and "either/or" are not fractions. A side only counts as
  // maths if it was bracketed, has a digit or index in it, or is a short
  // symbol — otherwise this is an ordinary slash and belongs as plain text.
  const looksMathematical = (part: string, wasBracketed: boolean) => {
    // Brackets only appear in maths here: "km/h" and "and/or" have none.
    if (wasBracketed || /[0-9^_()[\]]/.test(part)) return true;
    const letters = part.replace(/[^A-Za-z]/g, '');
    // A single symbol (u/v) or a differential (dy/dx) is maths; a word like
    // "km", "and" or "or" is not, however short it looks.
    return letters.length <= 1 || DIFFERENTIALS.test(letters.toLowerCase());
  };
  if (!looksMathematical(top, topBracketed) || !looksMathematical(bottom, bottomIsBracketed)) {
    return null;
  }
  if (UNITS.test(top) && UNITS.test(bottom)) return null;

  // `startsAt` indexes the untrimmed buffer too: only trailing space was cut,
  // which sits after the numerator.
  void droppedLeft;
  return { top, bottom, startsAt, next: slashAt + 1 + leadingSpace + consumed };
}

export function parseMath(source: string): MathNode[] {
  const src = applySymbols(source);
  const nodes: MathNode[] = [];
  // Where each node started in `src`, so a numerator can be taken back out of
  // nodes already emitted: `x^5/5` reaches the slash having already turned
  // `x` and `^5` into nodes, and the fraction needs all of it.
  const starts: number[] = [];
  let buffer = '';
  let bufferStart = 0;

  const flush = () => {
    if (buffer) {
      nodes.push({ kind: 'text', text: buffer });
      starts.push(bufferStart);
    }
    buffer = '';
  };

  /** Give back everything from `at` onwards, ready to be re-read. */
  const rewindTo = (at: number) => {
    while (starts.length && starts[starts.length - 1] >= at) {
      starts.pop();
      nodes.pop();
    }
    if (bufferStart >= at) buffer = '';
    else buffer = buffer.slice(0, at - bufferStart);
  };

  for (let i = 0; i < src.length; ) {
    const ch = src[i];

    if (ch === '^') {
      const { value, next } = readArgument(src, i + 1);
      if (value) {
        flush();
        starts.push(i);
        nodes.push({ kind: 'sup', text: value });
        i = next;
        continue;
      }
    }

    if (ch === '_') {
      const { value, next } = readArgument(src, i + 1);
      if (value) {
        flush();
        starts.push(i);
        nodes.push({ kind: 'sub', text: value });
        i = next;
        continue;
      }
    }

    if (src.startsWith('sqrt', i)) {
      const { value, next } = readArgument(src, i + 4);
      if (value) {
        flush();
        starts.push(i);
        nodes.push({ kind: 'root', body: value });
        i = next;
        continue;
      }
    }

    if (ch === '/') {
      // Everything before the slash is a candidate numerator, not just the
      // loose text: `x^5` is already two nodes by the time the slash arrives.
      const fraction = readFraction(src, i, src.slice(0, i));
      if (fraction) {
        rewindTo(fraction.startsAt);
        flush();
        starts.push(fraction.startsAt);
        nodes.push({ kind: 'frac', top: fraction.top, bottom: fraction.bottom });
        i = fraction.next;
        continue;
      }
    }

    if (!buffer) bufferStart = i;
    buffer += ch;
    i += 1;
  }

  flush();
  return nodes;
}


/** Superscript forms. Covers every digit, sign and letter school maths uses. */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
  '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ',
  k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ',
  v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', '.': '·', ' ': ' ', ',': ',',
  // A fractional index is common enough — x^(1/3) — to be worth the fraction
  // slash rather than falling back to printing the caret.
  '/': '⁄',
};

/** Subscript forms. */
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇',
  '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ',
  p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', ' ': ' ', ',': ',',
};

function raise(text: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of text) {
    const mapped = table[ch] ?? table[ch.toLowerCase()];
    // One unmappable character and the whole index is better left as written
    // than shown half-raised.
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/**
 * Set a string of maths for display in ordinary flowing text.
 *
 * Indices become real raised and lowered characters and fractions take the
 * fraction slash, so `2^x` reads as 2ˣ and `5/3` as 5⁄3 — the way they appear
 * on paper. Crucially the result is still one plain string, so a paragraph
 * wraps and justifies normally; laying maths out as separate boxes inside
 * prose breaks the line flow and leaves fragments stranded on their own lines.
 */
export function typesetMath(source: string): string {
  return parseMath(source)
    .map((node) => {
      switch (node.kind) {
        case 'sup':
          return raise(node.text, SUPERSCRIPT) ?? `^(${node.text})`;
        case 'sub':
          // Where a character has no lowered form — "lim_(x->a)" — brackets
          // read better than leaving a bare underscore in the sentence.
          return raise(node.text, SUBSCRIPT) ?? `(${node.text})`;
        case 'root':
          // The overline is what closes a root; without it, brackets do.
          return `√(${typesetMath(node.body)})`;
        case 'frac': {
          const top = typesetMath(node.top);
          const bottom = typesetMath(node.bottom);
          const needsBrackets = (p: string) => /[+\-−×÷ ]/.test(p);
          return `${needsBrackets(top) ? `(${top})` : top}⁄${
            needsBrackets(bottom) ? `(${bottom})` : bottom
          }`;
        }
        default:
          return node.text;
      }
    })
    .join('');
}

/**
 * A piece of maths that needs its own two-dimensional layout, or a run of
 * text that doesn't.
 *
 * Everything a renderer can't express as a single string ends up here: a
 * stacked fraction, an operator carrying its condition underneath, a root
 * under its bar. `plain` text is already typeset and flows normally.
 */
export type MathPiece =
  | { kind: 'plain'; text: string }
  | { kind: 'frac'; top: string; bottom: string }
  /** A fractional index, stacked and raised: the ½ in x^(1/2). */
  | { kind: 'supfrac'; top: string; bottom: string }
  | { kind: 'root'; text: string }
  | { kind: 'under'; operator: string; condition: string };

/** An index that is itself a fraction — `1/2`, `-3/4` — or null. */
function fractionalIndex(text: string): { top: string; bottom: string } | null {
  const nodes = parseMath(text);
  // A sign belongs to the numerator: x^(-1/2) is x to the minus a half.
  let sign = '';
  let rest = nodes;
  if (nodes.length === 2 && nodes[0].kind === 'text' && /^\s*[-−+]\s*$/.test(nodes[0].text)) {
    sign = nodes[0].text.trim();
    rest = nodes.slice(1);
  }
  if (rest.length !== 1 || rest[0].kind !== 'frac') return null;
  return { top: sign + rest[0].top, bottom: rest[0].bottom };
}

/** Operators that carry their condition beneath them rather than beside. */
// No closing `\b`: an underscore is a word character, so `lim_(x->a)` has no
// boundary after the operator and would never match.
const UNDER_OPERATORS = /(?:\b(lim|sum|max|min)|(Σ|∫))\s*[_(]/;

/** Read what an under-operator applies to, bracketed or not. */
function readCondition(text: string): { condition: string; consumed: number } {
  // `lim_(x->a)` and `lim(x->a)` both arrive here; the underscore is notation,
  // not part of the condition, and neither are the brackets around it.
  const body = text[0] === '_' ? text.slice(1) : text;
  const skipped = text.length - body.length;
  const open = body[0];
  const close = open === '(' ? ')' : open === '{' ? '}' : null;
  if (close) {
    const end = body.indexOf(close);
    const stop = end === -1 ? body.length : end;
    return { condition: body.slice(1, stop), consumed: skipped + stop + 1 };
  }
  const bare = /^\S+/.exec(body)?.[0] ?? '';
  return { condition: bare, consumed: skipped + bare.length };
}

/**
 * Break maths into the pieces that need their own vertical layout.
 *
 * Used for display formulas and for maths sitting inside a sentence, so
 * `lim_(h->0) [f(a+h) - f(a)]/h` is set the same way wherever it appears
 * rather than degrading to brackets and a slash when it is inline.
 */
export function layoutMath(source: string): MathPiece[] {
  const pieces: MathPiece[] = [];
  const push = (piece: MathPiece) => {
    const last = pieces[pieces.length - 1];
    // Consecutive text runs together so it stays one wrappable string.
    if (piece.kind === 'plain' && last?.kind === 'plain') last.text += piece.text;
    else pieces.push(piece);
  };

  const pushParsed = (chunk: string) => {
    if (!chunk) return;
    for (const node of parseMath(chunk)) {
      if (node.kind === 'frac') {
        push({ kind: 'frac', top: typesetMath(node.top), bottom: typesetMath(node.bottom) });
      } else if (node.kind === 'root') {
        push({ kind: 'root', text: typesetMath(node.body) });
      } else if (node.kind === 'sup' && fractionalIndex(node.text)) {
        // A fractional index set on one line is ambiguous: x¹⁄² could as
        // easily be read as x¹ over 2. Stacked and raised, it can't be.
        const index = fractionalIndex(node.text)!;
        push({ kind: 'supfrac', top: typesetMath(index.top), bottom: typesetMath(index.bottom) });
      } else {
        const raw =
          node.kind === 'sup' ? `^(${node.text})` : node.kind === 'sub' ? `_(${node.text})` : node.text;
        push({ kind: 'plain', text: typesetMath(raw) });
      }
    }
  };

  let rest = applySymbols(source);
  for (let guard = 0; guard < 12; guard += 1) {
    const match = UNDER_OPERATORS.exec(rest);
    if (!match) break;
    pushParsed(rest.slice(0, match.index));
    // Step back onto the `_` or `(` the operator was matched by.
    const after = rest.slice(match.index + match[0].length - 1);
    const { condition, consumed } = readCondition(after);
    push({
      kind: 'under',
      operator: match[1] === 'sum' ? 'Σ' : (match[1] ?? match[2]),
      condition: typesetMath(condition),
    });
    rest = after.slice(consumed);
  }
  pushParsed(rest);

  return pieces.filter((piece) => piece.kind !== 'plain' || piece.text.trim() !== '');
}

/**
 * Break a chain of working into the lines a textbook would set it on.
 *
 * `d(2+h) = 2(2+h)^2 + 3(2+h) = 2(4+4h+h^2) + 6 + 3h = 14 + 11h + 2h^2` is
 * four steps of one calculation, and printed it runs down the page with each
 * `=` under the last, not off the right-hand edge. Splitting only at top-level
 * relations keeps `(a = b)` inside a bracket intact.
 */
export function splitWorkingLines(formula: string): string[] {
  const text = formula.trim();
  const lines: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (depth === 0 && /[=≈≡]/.test(ch) && i > start) {
      lines.push(text.slice(start, i).trim());
      start = i;
    }
  }
  lines.push(text.slice(start).trim());

  const kept = lines.filter(Boolean);
  // One relation is an ordinary formula and belongs on a single line; it is a
  // chain of them that needs breaking up.
  return kept.length >= 3 ? kept : [text];
}

/** A run of text, and how it should be set. */
export interface StyledRun {
  text: string;
  /** A variable, so it leans. */
  italic: boolean;
  /** Maths rather than prose, so it takes the mathematical face. */
  math: boolean;
}

/** Operator names, set upright in print — `sin x`, not *sin* times *x*. */
const FUNCTION_NAMES =
  /^(?:sin|cos|tan|cosec|csc|sec|cot|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln|lg|exp|lim|max|min|det|mod|gcd|lcm|sup|inf)$/;

/** Characters that are only ever mathematical. */
// ¹ ² ³ sit apart from the rest of the superscripts in Unicode (they are
// Latin-1, not U+2070..), so a range alone silently leaves out the three
// indices school maths uses most.
const MATH_SYMBOL =
  /^[=<>≤≥≠→←⇔∈∉⊆⊂∪∩∅±×÷∞∫Σ∏√⁄∂∇≈≡∴°−·¹²³⁰-⁹⁺⁻⁼⁽⁾ⁱⁿᵃ-ᶻ₀-₉₊₋₌₍₎ₐ-ₜα-ωΑ-Ω]$/;

/** Characters that are mathematical only in mathematical company. */
const NEUTRAL_SYMBOL = /^[()[\]{}|^_+\-*/'′]$/;

type Atom = { text: string; math: 'yes' | 'no' | 'maybe'; italic: boolean; space: boolean };

/**
 * Split text into upright and italic runs, and mark which of them are maths.
 *
 * Print sets variables in italic and everything else upright, which is what
 * makes `f(x)` read as a function of x rather than three letters: names of
 * operators (`lim`, `sin`, `log`) stay upright, single letters lean. The maths
 * itself is set in a different face from the prose around it, so this also
 * says where the maths in a sentence starts and stops.
 */
export function styleMathRuns(text: string, forceMath = false): StyledRun[] {
  const atoms = classify(text);
  if (!forceMath) resolveNeutrals(atoms);

  const runs: StyledRun[] = [];
  for (const atom of atoms) {
    const math = forceMath || atom.math === 'yes';
    const last = runs[runs.length - 1];
    if (last && last.italic === atom.italic && last.math === math) last.text += atom.text;
    else runs.push({ text: atom.text, italic: atom.italic, math });
  }
  return runs;
}

/** First pass: what each atom is on its own, before looking at its neighbours. */
function classify(text: string): Atom[] {
  const atoms: Atom[] = [];
  const pattern = /([A-Za-z]+)|(\d+(?:\.\d+)?)|(\s+)|([\s\S])/g;

  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    const [whole, word, number, space] = m;
    if (space) {
      atoms.push({ text: whole, math: 'maybe', italic: false, space: true });
    } else if (number) {
      atoms.push({ text: whole, math: 'yes', italic: false, space: false });
    } else if (word) {
      // A lone letter is a variable; a name is a name. Anything else is prose.
      // The letter after an apostrophe is the tail of a contraction — "isn't",
      // "there's" — not a variable, however lonely it looks.
      const contraction = /[A-Za-z][’']$/.test(text.slice(Math.max(0, m.index - 2), m.index));
      const variable = word.length === 1 && !contraction && isVariable(word, text, m.index);
      const named = FUNCTION_NAMES.test(word);
      atoms.push({
        text: whole,
        math: variable || named ? 'yes' : 'no',
        italic: variable,
        space: false,
      });
    } else {
      const math = MATH_SYMBOL.test(whole) ? 'yes' : NEUTRAL_SYMBOL.test(whole) ? 'maybe' : 'no';
      atoms.push({ text: whole, math, italic: false, space: false });
    }
  }
  return atoms;
}

/**
 * Second pass: decide the characters that could go either way.
 *
 * A bracket is maths in `f(x)` and prose in "(from either side)", and the only
 * thing that tells them apart is what sits next to it. Brackets touch what
 * they belong to, so one maths neighbour with no space between is enough;
 * a loose `+` or `-` needs maths on both sides. Several rounds, because a
 * bracket resolved in one round is what decides the operator beside it.
 */
function resolveNeutrals(atoms: Atom[]): void {
  const nearest = (from: number, step: number): Atom | undefined => {
    for (let i = from + step; i >= 0 && i < atoms.length; i += step) {
      if (!atoms[i].space) return atoms[i];
    }
    return undefined;
  };

  for (let round = 0; round < 3; round += 1) {
    atoms.forEach((atom, i) => {
      if (atom.space || atom.math !== 'maybe') return;
      const before = atoms[i - 1];
      const after = atoms[i + 1];
      if (before && !before.space && before.math === 'yes') atom.math = 'yes';
      else if (after && !after.space && after.math === 'yes') atom.math = 'yes';
      else if (nearest(i, -1)?.math === 'yes' && nearest(i, 1)?.math === 'yes') atom.math = 'yes';
    });
  }

  // A space belongs to the maths only when it is surrounded by it.
  atoms.forEach((atom, i) => {
    if (!atom.space) return;
    atom.math = nearest(i, -1)?.math === 'yes' && nearest(i, 1)?.math === 'yes' ? 'yes' : 'no';
  });

  for (const atom of atoms) if (atom.math === 'maybe') atom.math = 'no';
}

/**
 * The same, split into words.
 *
 * Laying maths out inline means giving each word its own box so the paragraph
 * still wraps, but the styling has to be decided on the whole sentence first:
 * a lone "a" looks like a variable until you can see the word after it.
 */
export function styleMathWords(text: string): StyledRun[][] {
  const words: StyledRun[][] = [];
  let word: StyledRun[] = [];
  const close = () => {
    if (word.length) words.push(word);
    word = [];
  };

  for (const run of styleMathRuns(text)) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        close();
        continue;
      }
      const last = word[word.length - 1];
      if (last && last.italic === run.italic && last.math === run.math) last.text += part;
      else word.push({ text: part, italic: run.italic, math: run.math });
    }
  }
  close();
  return words;
}

/**
 * A lone letter is a variable — unless it is the English article.
 *
 * "a function" must stay upright; "near a," and "f(a+h)" are the variable a.
 * An article is always followed by the word it introduces, which is what
 * separates the two.
 */
function isVariable(letter: string, text: string, index: number): boolean {
  // `d` is the differential operator — the d in d/dx and in an integral's dx —
  // and an operator is set upright, like sin or lim. It is almost never a
  // variable in school maths, where distance is s or x.
  if (letter === 'd') return false;
  if (letter !== 'a' && letter !== 'A' && letter !== 'I') return true;
  return !/^\s+[A-Za-z]/.test(text.slice(index + 1));
}

/**
 * Is this fragment a formula rather than a sentence?
 *
 * Used to decide what gets lifted out of a paragraph and set on its own line.
 * A formula is short, carries a relation or an operator, and isn't mostly
 * words — "A = A_0 b^(kt)" qualifies, "the limit is about behaviour" does not.
 */
/** Lead-ins that introduce a formula without being part of it. */
const LEAD_IN =
  /^(?:such as|for example|e\.?g\.?|i\.?e\.?|like|write|writing|solve|solving|set|setting|gives?|giving|say|says|saying|gets?|gives us|gradient|gradients|gradients are|if|so|that|is|gives|we get|gives you|note that|gives that|then|when|gives:|in|at|let|letting|written|reads|namely|defined as|defined by|equals|becomes|suppose|consider|assume)\b[:\s]*/i;

/** Trailing prose that ran on after the formula ended. */
const TRAIL_OFF =
  /\s+(?:at the origin|for all|for any|for every|in general|etc\.?|gives?\b|it is\b|means\b|when\b|where\b|with\b|then\b|both\b|for\s+[a-z]$)\b.*$/i;

/**
 * Strip the words around a formula so only the formula is left.
 *
 * Extraction from prose picks up the odd "such as" or "at the origin"; this
 * pares those off and drops anything left unbalanced.
 */
export function cleanFormula(fragment: string): string {
  let text = fragment.trim().replace(/[.,;:]+$/, '');
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(LEAD_IN, '').replace(TRAIL_OFF, '').trim();
  }
  // A dangling bracket means a clause was cut mid-expression.
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (opens !== closes) {
    if (closes > opens && text.endsWith(')')) text = text.slice(0, -1).trim();
    else return '';
  }
  return text;
}

export function looksLikeFormula(fragment: string): boolean {
  const text = fragment.trim().replace(/[.,;:]$/, '');
  if (!text || text.length > 90) return false;
  // A formula states a relation. An expression alone — "e^x and ln(x)" — is a
  // mention, not something worth setting out under "Key formulas".
  if (!/[=<>≤≥≠→∈⇔]/.test(text)) return false;

  // Count the words that are plain prose. A word only counts if it is purely
  // alphabetic — "f(x)g(x)" and "h'(x)" carry brackets and primes, so they are
  // maths however many letters they contain. Too much real prose and this is a
  // sentence that merely mentions maths, not a formula.
  const FUNCTIONS =
    /^(sin|cos|tan|log|ln|lim|exp|sec|cosec|cot|det|max|min|and|or|for|all|if|then|is|of|the)$/i;
  const prose = text
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:]$/, ''))
    .filter((w) => /^[A-Za-z]{3,}$/.test(w) && !FUNCTIONS.test(w));
  return prose.length <= 1;
}

/**
 * Clauses within a sentence that are themselves formulas.
 *
 * Existing lessons write maths inside sentences — "if h(x) = f(x)g(x), then
 * h'(x) = f'(x)g(x) + f(x)g'(x)" — so pulling formulas out for display means
 * looking inside the sentence, not only at lines of their own.
 */
function formulaClauses(sentence: string): string[] {
  return sentence
    .split(/[,;]|then|which|where|so|and|or/i)
    .map((clause) => cleanFormula(clause))
    .filter((clause) => looksLikeFormula(clause));
}

/**
 * Split a paragraph into the prose and the formulas inside it.
 *
 * Formulas written on their own line come out as blocks; a formula sitting at
 * the end of a sentence after a colon is lifted out too, because that is how
 * it would be printed. Anything else stays in the prose where it belongs.
 */
/**
 * Pull a formula off the end of a sentence, if there is one worth displaying.
 *
 * Walks back from the end taking one word at a time for as long as what's
 * taken still reads as a formula, so "This is written lim_(x->a) f(x) = L"
 * yields the prose and the formula separately. Returns nothing unless both
 * halves are substantial — lifting two characters out of a sentence would
 * chop it up for no gain.
 */
function liftTrailingFormula(sentence: string): { prose: string; formula: string } | null {
  const text = sentence.trim().replace(/[.!?]+$/, '');

  // The formula has to follow a phrase that introduces one. Taking the longest
  // trailing run that merely parses as maths pulls words out of the sentence
  // and leaves it ungrammatical — "The product rule" stranded without "says".
  const cue =
    /\b(?:written|write|given by|defined as|defined by|is|are|becomes|gives|equals|reads|namely|formula)\b\s*:?\s*|:\s*/gi;

  let best: { prose: string; formula: string } | null = null;
  for (let match = cue.exec(text); match; match = cue.exec(text)) {
    const after = text.slice(match.index + match[0].length);
    const candidate = cleanFormula(after);
    if (!candidate || candidate.length < 6 || !looksLikeFormula(candidate)) continue;
    const prose = text.slice(0, match.index + match[0].length).trim();
    if (prose.length < 12) continue;
    // The last cue wins, so the formula is whatever finishes the sentence.
    best = { prose, formula: candidate };
  }

  return best;
}

export function splitFormulas(paragraph: string): { kind: 'text' | 'formula'; value: string }[] {
  const out: { kind: 'text' | 'formula'; value: string }[] = [];

  for (const rawLine of paragraph.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (looksLikeFormula(line)) {
      out.push({ kind: 'formula', value: line });
      continue;
    }

    // "...is given by: A = A_0 b^(kt)" — the part after the colon stands alone.
    const colon = line.lastIndexOf(':');
    if (colon > 0 && colon < line.length - 1) {
      const tail = line.slice(colon + 1).trim();
      if (looksLikeFormula(tail)) {
        out.push({ kind: 'text', value: line.slice(0, colon + 1).trim() });
        out.push({ kind: 'formula', value: tail });
        continue;
      }
    }

    // A sentence that ends on a formula — "This is written lim_(x->a) f(x) = L"
    // — reads far better with the formula set out beneath it, which is how a
    // textbook prints it. Anything shorter stays in the sentence.
    let buffered = '';
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const lifted = liftTrailingFormula(sentence);
      if (!lifted) {
        buffered = buffered ? `${buffered} ${sentence}` : sentence;
        continue;
      }
      const prose = buffered ? `${buffered} ${lifted.prose}` : lifted.prose;
      if (prose.trim()) out.push({ kind: 'text', value: prose.trim() });
      out.push({ kind: 'formula', value: lifted.formula });
      buffered = '';
    }
    if (buffered.trim()) out.push({ kind: 'text', value: buffered.trim() });
  }

  return out;
}

/** Every formula mentioned anywhere in a block of text, in order, deduplicated. */
export function collectFormulas(fragments: string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const remember = (value: string) => {
    const key = value.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(value);
  };

  for (const fragment of fragments) {
    for (const part of splitFormulas(fragment ?? '')) {
      if (part.kind === 'formula') remember(cleanFormula(part.value) || part.value);
      // Sentences can still carry a formula worth lifting out.
      else for (const clause of formulaClauses(part.value)) remember(clause);
    }
  }
  return found;
}
