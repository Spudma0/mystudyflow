/**
 * Chemical formulas and equations.
 *
 * The maths typesetter gets these wrong in ways that matter: it leaves the 3
 * in CH3 full size, italicises element symbols as though they were algebraic
 * variables, mangles the reversible arrow, and — worst — swallows the H in
 * C_nH_(2n+1) into a subscript run, silently changing the formula. Chemistry
 * is set by its own rules here, and anything that is not confidently chemistry
 * is left to the maths path untouched.
 */

/** Every element symbol, so "Co" is cobalt but "CO" is carbon monoxide. */
const ELEMENTS = new Set(
  (
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce ' +
    'Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn ' +
    'Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl ' +
    'Mc Lv Ts Og'
  ).split(' ')
);

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

/** For explicit `_` subscripts, which general formulas rely on. */
const SUBSCRIPT_CHARS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '(': '₍', ')': '₎', '=': '₌',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ',
  n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

/** Lowers what it can; anything with no lowered form is left alone. */
function toSubscript(text: string): string {
  return text.replace(/[^]/g, (c) => SUBSCRIPT_CHARS[c] ?? c);
}

const SUPERSCRIPT_CHARGE: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻',
};

/** Reversible first: `->` would otherwise match inside `<->` and leave a stray `<`. */
const ARROWS: [RegExp, string][] = [
  [/<-->|<->|<=>/g, ' ⇌ '],
  [/-->|->/g, ' → '],
  [/<--|<-/g, ' ← '],
];

/** State symbols stay upright and unspaced: (aq), (s), (l), (g). */
const STATE = /^\((aq|s|l|g)\)/i;

/**
 * Does this read as chemistry rather than algebra?
 *
 * Deliberately strict. A string only qualifies on positive evidence — an
 * element symbol followed by a count, a reaction arrow, a state symbol — and
 * is rejected outright on anything that belongs to the maths path. Getting
 * this wrong in the permissive direction would break algebra, which is the
 * far more common case.
 */
export function looksLikeChemistry(source: string): boolean {
  const s = source.trim();
  if (!s) return false;

  // Maths notation that chemistry never uses. `=` is allowed because it
  // appears in structural shorthand (R2C=O), but an equals sign surrounded by
  // spaces is an equation, not a double bond.
  if (/[∫Σ√]|\bd\/d|\blim\b|\bsin\b|\bcos\b|\btan\b|\blog\b|\bsqrt\b/.test(s)) return false;
  if (/\s=\s/.test(s)) return false;
  // Combinations and permutations — 7C2, 45C6, 6P2 — are a count of carbon or
  // phosphorus on every test that follows, and they turn up constantly in the
  // probability topics. The shape is unmistakable and belongs to maths.
  // The lookahead keeps a real coefficient safe: the 5C2 of 5C2H6 is followed
  // by more formula, where 5C2 standing alone is a count of combinations.
  if (/(?:^|[^A-Za-z0-9])\d+[CP]\d+(?![A-Za-z0-9])/.test(s)) return false;
  // `^(` is maths grouping. `_(` is not: a general formula is written
  // C_nH_(2n+1)OH, and that is the exact string the maths parser corrupts.
  if (/\^\(/.test(s)) return false;

  const hasArrow = /<-->|<->|<=>|-->|->|<--|<-/.test(s);
  const hasStateSymbol = /\((aq|s|l|g)\)/i.test(s);
  // An element symbol carrying a count: the 2 in H2O, the 4 in SO4. Not
  // anchored to a word boundary — the counted symbol is usually in the middle
  // of the formula, as the 3 and the 2 are in CH3CH2COOH.
  const hasCountedElement = /[A-Z][a-z]?\d/.test(s);
  // A charge: Na+, SO4^2-, Cl-
  const hasCharge = /[A-Za-z0-9)]\^?\d*[+-](?:\s|$|\))/.test(s);
  // A general formula: an element symbol carrying an explicit subscript, as in
  // C_nH_(2n+1). Algebra written this way is caught by the maths guards above.
  const hasGeneralFormula = /[A-Z][a-z]?_/.test(s);

  if (!(hasArrow || hasStateSymbol || hasCountedElement || hasCharge || hasGeneralFormula)) {
    return false;
  }

  // Every alphabetic run must be an element symbol, a group placeholder (R,
  // R', X, Ar, Me, Et, Ph), or a state symbol. One unrecognised word and this
  // is prose or algebra, not a formula.
  const GROUPS = new Set(['R', 'X', 'Y', 'Ar', 'Me', 'Et', 'Pr', 'Bu', 'Ph', 'Ac', 'aq', 's', 'l', 'g', 'n']);
  // Subscripts come out before the words are checked. In C_nH_(2n+1) the n of
  // the subscript runs straight into the H after it, and splitting on
  // punctuation alone would leave the nonsense word "nH".
  const words =
    (stripSubscripts(s).replace(/[()[\]^]/g, ' ').match(/[A-Za-z]+/g) ?? []);
  for (const word of words) {
    if (GROUPS.has(word)) continue;
    if (splitElements(word)) continue;
    return false;
  }
  return true;
}

/**
 * Sets the formulas standing inside a sentence, and leaves the sentence alone.
 *
 * A lesson says "oxidised further to CH3CH2COOH, propanoic acid" far more often
 * than it gives a formula a line of its own, and as prose the whole string is
 * plainly not chemistry — so the formula inside it used to reach the algebra
 * parser, which left the counts full size and swallowed the H of C_nH_(2n+1)
 * into a subscript. Each run of formula characters is judged on its own here,
 * by the same strict test; anything that isn't confidently chemistry is handed
 * on untouched.
 */
export function typesetChemistryFragments(source: string): string {
  // A fragment is a run with no spaces in it: a reaction written with spaces
  // around its arrow is chemistry as a whole and is caught before this.
  return source.replace(/[A-Za-z0-9_^()+\-']+/g, (fragment) =>
    looksLikeChemistry(fragment) ? typesetChemistry(fragment) : fragment
  );
}

/** Removes `_x` and `_(...)` so what is left is just symbols and groups. */
function stripSubscripts(source: string): string {
  return source.replace(/_\([^)]*\)/g, ' ').replace(/_[a-z0-9]+/g, ' ');
}

/** Placeholders organic chemistry writes in place of a real group. */
const GROUP_TOKENS = ['Ar', 'Me', 'Et', 'Ph', 'Bu', 'R', 'X', 'Y', 'Z'];

/**
 * Splits a run of letters into element symbols and group placeholders, longest
 * match first so "Cl" beats "C" + "l". Returns null if any part is neither —
 * which is how prose and algebra get rejected.
 */
function splitElements(word: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < word.length) {
    const two = word.slice(i, i + 2);
    if (two.length === 2 && (ELEMENTS.has(two) || GROUP_TOKENS.includes(two))) {
      out.push(two);
      i += 2;
      continue;
    }
    const one = word[i];
    if (ELEMENTS.has(one) || GROUP_TOKENS.includes(one)) {
      out.push(one);
      i += 1;
      continue;
    }
    return null;
  }
  return out.length ? out : null;
}

/**
 * Sets a chemical formula: counts lowered, charges raised, arrows drawn, and
 * every symbol left upright.
 *
 * Returns a plain string, so it drops straight into the existing renderers
 * without a new piece kind.
 */
export function typesetChemistry(source: string): string {
  let s = source;
  for (const [pattern, replacement] of ARROWS) s = s.replace(pattern, replacement);

  let out = '';
  let i = 0;

  while (i < s.length) {
    const rest = s.slice(i);

    // (aq) and friends stay as written rather than becoming a count.
    const state = rest.match(STATE);
    if (state) {
      out += state[0];
      i += state[0].length;
      continue;
    }

    const ch = s[i];

    // An explicit subscript: the n in C_n, the (2n+1) in H_(2n+1). Only the
    // contents are lowered — the element symbol before it stays full size,
    // which is what the maths parser got wrong.
    if (ch === '_') {
      const grouped = rest.match(/^_\(([^)]*)\)/);
      if (grouped) {
        out += toSubscript(grouped[1]);
        i += grouped[0].length;
        continue;
      }
      const single = rest.match(/^_([a-z0-9]+)/);
      if (single) {
        out += toSubscript(single[1]);
        i += single[0].length;
        continue;
      }
    }

    // A charge written with a caret: SO4^2- or Ca^2+.
    if (ch === '^') {
      const charge = rest.match(/^\^(\d*)([+-])/);
      if (charge) {
        out += (charge[1] ?? '').replace(/\d/g, (d) => SUPERSCRIPT_CHARGE[d]) + SUPERSCRIPT_CHARGE[charge[2]];
        i += charge[0].length;
        continue;
      }
    }

    // A digit directly after a symbol, a closing bracket or another digit is
    // a count. A digit anywhere else — a coefficient like the 2 in "2H2O" —
    // stays full size, which is exactly how it is written.
    if (/\d/.test(ch)) {
      const previous = out[out.length - 1] ?? '';
      const isCount = /[A-Za-z)\]₀-₉]/.test(previous);
      if (isCount) {
        out += SUBSCRIPT_DIGITS[ch];
        i += 1;
        continue;
      }
    }

    // A trailing +/- straight after a symbol is a charge, not an operation —
    // unless the formula opened with a bond dash, as the ester linkage -COO-
    // does, in which case the dash closing it is the other half of that bond.
    const bondNotation = source.startsWith('-') && ch === '-';
    if (!bondNotation && (ch === '+' || ch === '-') && /[A-Za-z)₀-₉]/.test(out[out.length - 1] ?? '')) {
      const next = s[i + 1] ?? '';
      if (next === '' || /[\s,);]/.test(next)) {
        out += SUPERSCRIPT_CHARGE[ch];
        i += 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  // Tidy the spacing the arrow replacements introduced.
  return out.replace(/\s{2,}/g, ' ').trim();
}
