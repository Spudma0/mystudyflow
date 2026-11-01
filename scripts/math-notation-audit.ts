/**
 * Puts ten thousand pieces of mathematical notation through the typesetter and
 * reports where what came out is not what was meant.
 *
 * Two kinds of check, because neither is enough alone.
 *
 * Expectations are exact: a case states the string it should produce, and the
 * generator builds thousands of them by substituting operands into patterns
 * whose correct output is mechanical. This catches a wrong answer.
 *
 * Invariants hold for every case whether or not its exact output is known —
 * nothing silently dropped, no markup left behind, brackets still balanced,
 * algebra not mistaken for chemistry. This catches damage in the cases no one
 * thought to write an expectation for, which is where the bugs have actually
 * been.
 *
 *   npx tsx scripts/math-notation-audit.ts            # summary
 *   npx tsx scripts/math-notation-audit.ts --verbose  # every failure
 */
import { typesetMath } from '../src/lib/mathNotation';
import { looksLikeChemistry } from '../src/lib/chemNotation';

interface Case {
  category: string;
  source: string;
  /** The exact output wanted, where it can be stated. */
  expect?: string;
  /** Algebra that must never be routed through the chemistry typesetter. */
  notChemistry?: boolean;
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ',
  k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ',
  v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', '/': '⁄',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ',
  p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

/** Map an index to its raised or lowered form, or null if it cannot be. */
function lift(text: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of text) {
    const m = table[ch] ?? table[ch.toLowerCase()];
    if (!m) return null;
    out += m;
  }
  return out;
}

const VARS = ['x', 'y', 'a', 'b', 'n', 'm', 't', 'k', 'p', 'v'];
const DIGITS = ['0', '1', '2', '3', '4', '5', '7', '9', '10', '12', '23'];
const INDICES = ['2', '3', 'n', 'n+1', '2n', '10', 'i', 'k-1', '1/2', '-1'];

function buildCases(): Case[] {
  const out: Case[] = [];

  // --- powers, where the expected output is mechanical --------------------
  for (const v of VARS) {
    for (const i of INDICES) {
      const raised = lift(i, SUP);
      out.push({
        category: 'power',
        source: `${v}^${i.length > 1 ? `(${i})` : i}`,
        expect: raised ? `${v}${raised}` : undefined,
        notChemistry: true,
      });
    }
  }

  // --- subscripts ----------------------------------------------------------
  for (const v of VARS) {
    for (const i of ['0', '1', '2', 'i', 'n', 'n+1', 'max', 'k']) {
      const low = lift(i, SUB);
      out.push({
        category: 'subscript',
        source: `${v}_${i.length > 1 ? `(${i})` : i}`,
        expect: low ? `${v}${low}` : undefined,
        notChemistry: true,
      });
    }
  }

  // --- the symbol table, which is a direct substitution --------------------
  const SYMBOL_CASES: [string, string][] = [
    ['alpha', 'α'], ['beta', 'β'], ['theta', 'θ'], ['lambda', 'λ'],
    ['mu', 'μ'], ['sigma', 'σ'], ['Delta', 'Δ'], ['pi', 'π'],
    ['infinity', '∞'], ['delta', 'δ'],
  ];
  for (const [word, glyph] of SYMBOL_CASES) {
    out.push({ category: 'symbol', source: word, expect: glyph });
    out.push({ category: 'symbol', source: `2${word}`, expect: `2${glyph}` });
    out.push({ category: 'symbol', source: `${word} = 0`, expect: `${glyph} = 0` });
  }
  const RELATIONS: [string, string][] = [
    ['<=', '≤'], ['>=', '≥'], ['!=', '≠'], ['->', '→'], ['<=>', '⇔'], ['+-', '±'],
  ];
  for (const [rel, glyph] of RELATIONS) {
    for (const l of VARS) {
      for (const r of DIGITS.slice(0, 6)) {
        out.push({ category: 'relation', source: `${l} ${rel} ${r}`, expect: `${l} ${glyph} ${r}` });
      }
    }
  }

  // --- combinatorics: the shape that was once read as a chemical formula ---
  for (const n of ['5', '6', '7', '8', '9', '10', '12', '20']) {
    for (const r of ['0', '1', '2', '3', '4']) {
      out.push({ category: 'nCr', source: `${n}C${r}`, expect: `${n}C${r}`, notChemistry: true });
      out.push({ category: 'nPr', source: `${n}P${r}`, expect: `${n}P${r}`, notChemistry: true });
    }
  }

  // --- fractions, roots, calculus, functions ------------------------------
  for (const v of VARS) {
    out.push({ category: 'root', source: `sqrt(${v})`, notChemistry: true });
    out.push({ category: 'root', source: `sqrt(${v}^2 + 1)`, notChemistry: true });
    out.push({ category: 'frac', source: `1/${v}`, notChemistry: true });
    out.push({ category: 'frac', source: `(${v}+1)/(${v}-1)`, notChemistry: true });
    out.push({ category: 'calculus', source: `d${v}/dt`, notChemistry: true });
    out.push({ category: 'calculus', source: `lim_(${v}->0) ${v}^2`, notChemistry: true });
    out.push({ category: 'calculus', source: `int ${v}^2 d${v}`, notChemistry: true });
    for (const f of ['sin', 'cos', 'tan', 'log', 'ln', 'f', 'g']) {
      out.push({ category: 'function', source: `${f}(${v})`, notChemistry: true });
      out.push({ category: 'function', source: `${f}(2${v} + 1)`, notChemistry: true });
    }
  }

  // --- sets, units, prose --------------------------------------------------
  for (const v of VARS) {
    out.push({ category: 'set', source: `${v} in R`, expect: `${v} ∈ ℝ` });
    out.push({ category: 'set', source: `${v} in Z`, expect: `${v} ∈ ℤ` });
  }
  for (const u of ['m/s', 'm/s^2', 'kg', 'N', 'J', 'cm^3']) {
    for (const d of DIGITS) {
      out.push({ category: 'unit', source: `${d} ${u}`, notChemistry: true });
    }
  }
  const PROSE = [
    'The derivative of x^2 is 2x.',
    'Solve x^2 - 4x + 3 = 0 for x.',
    'If f(x) = 3x^2 then f\'(x) = 6x.',
    'The area is pi r^2 and the circumference is 2 pi r.',
    'A = P(1 + r)^n gives the balance after n years.',
    'Note that a_1 = 3 and a_(n+1) = a_n + 2.',
    'Since x >= 0 and x <= 10, x is in [0, 10].',
    'As n -> infinity the sequence converges.',
    'The gradient is dy/dx = 2x + 1.',
    'Use the quadratic formula x = (-b +- sqrt(b^2 - 4ac))/(2a).',
  ];
  for (const p of PROSE) out.push({ category: 'prose', source: p, notChemistry: true });

  // --- chemistry, which must still go the other way ------------------------
  for (const f of ['H2O', 'CO2', 'CH4', 'NaCl', 'H2SO4', 'CH3COOH', 'C6H12O6']) {
    out.push({ category: 'chemistry', source: f });
  }

  // The places the first run of this audit found broken, kept so they cannot
  // come back: an index with no raised or lowered glyph, and an uppercase one
  // that must not be quietly folded to lowercase.
  for (const v of VARS) {
    for (const i of ['b', 'c', 'd', 'f', 'g', 'w', 'y', 'z']) {
      out.push({ category: 'sub-no-glyph', source: `${v}_${i}`, expect: `${v}_${i}`, notChemistry: true });
    }
    for (const i of ['N', 'A', 'Q', 'T']) {
      out.push({ category: 'sup-uppercase', source: `${v}^${i}`, expect: `${v}^(${i})`, notChemistry: true });
    }
    out.push({ category: 'sup-no-glyph', source: `${v}^q`, expect: `${v}^(q)`, notChemistry: true });
  }
  // A condition under an operator keeps its brackets; a bare index does not.
  out.push({ category: 'under-op', source: 'lim_(x->0) x^2', expect: 'lim(x→0) x²', notChemistry: true });

  // The fraction whose numerator needs parsing in its own right — the shape
  // that printed the numerator twice.
  for (const v of VARS) {
    out.push({ category: 'frac-parsed-top', source: `x = (${v}^2)/(2a)`, notChemistry: true });
    out.push({ category: 'frac-parsed-top', source: `y = (-${v} + sqrt(d))/(2a)`, notChemistry: true });
  }
  out.push({
    category: 'quadratic',
    source: 'x = (-b +- sqrt(b^2 - 4ac))/(2a)',
    expect: 'x = (-b ± √(b² - 4ac))⁄2a',
    notChemistry: true,
  });

  // A coefficient written against a Greek name, which needs no space.
  for (const [word, glyph] of SYMBOL_CASES) {
    out.push({ category: 'symbol-coefficient', source: `2${word}`, expect: `2${glyph}` });
    out.push({ category: 'symbol-coefficient', source: `3${word} + 1`, expect: `3${glyph} + 1` });
  }
  for (const w of ['alphabet', 'define', 'emu', 'infinite', 'sinfinity', 'deltoid']) {
    out.push({ category: 'symbol-word', source: w, expect: w });
  }

  // Algebra that an element symbol makes look chemical.
  for (const v of ['n', 'p', 's', 'c', 'b']) {
    out.push({ category: 'iff', source: `${v} <=> 0`, expect: `${v} ⇔ 0`, notChemistry: true });
  }

  // Grow to ten thousand by walking the patterns over more operands, which is
  // where a parser that is nearly right tends to come apart.
  const EXTRA = ['θ', 'λ', 'r', 's', 'u', 'w', 'c', 'd', 'e', 'f', 'g', 'h', 'q', 'z'];
  let i = 0;
  while (out.length < 10000) {
    const v = EXTRA[i % EXTRA.length];
    const idx = INDICES[i % INDICES.length];
    const d = DIGITS[i % DIGITS.length];
    const raised = lift(idx, SUP);
    out.push({
      category: 'power-wide',
      source: `${v}^${idx.length > 1 ? `(${idx})` : idx}`,
      expect: raised ? `${v}${raised}` : undefined,
      notChemistry: true,
    });
    out.push({ category: 'mixed', source: `${d}${v} + ${d} = ${v}`, notChemistry: true });
    out.push({ category: 'mixed', source: `(${v} + ${d})(${v} - ${d})`, notChemistry: true });
    i += 1;
  }
  return out.slice(0, 10000);
}

// --- invariants -------------------------------------------------------------

const SUP_BACK = new Map(Object.entries(SUP).map(([k, v]) => [v, k]));
const SUB_BACK = new Map(Object.entries(SUB).map(([k, v]) => [v, k]));

/** Undo the raising, so output can be compared with input character by character. */
function flatten(text: string): string {
  let out = '';
  for (const ch of text) out += SUP_BACK.get(ch) ?? SUB_BACK.get(ch) ?? ch;
  return out;
}

const GREEK_WORDS = /alpha|beta|theta|lambda|mu|sigma|Delta|pi|infinity|inf|delta|sqrt|int|integral|sum|in R|in Z|in N/g;

interface Failure {
  category: string;
  source: string;
  got: string;
  rule: string;
  want?: string;
}

function check(c: Case): Failure[] {
  const fails: Failure[] = [];
  let got: string;
  try {
    got = typesetMath(c.source);
  } catch (err) {
    return [{ category: c.category, source: c.source, got: `threw: ${err}`, rule: 'throws' }];
  }

  if (c.expect !== undefined && got !== c.expect) {
    fails.push({ category: c.category, source: c.source, got, want: c.expect, rule: 'wrong output' });
  }

  // Nothing of substance may vanish. Compared after undoing the raising, and
  // with the words the symbol table deliberately consumes removed first.
  const asciiIn = c.source.replace(GREEK_WORDS, '').replace(/[^A-Za-z0-9]/g, '');
  const asciiOut = flatten(got).replace(/[^A-Za-z0-9]/g, '');
  for (const ch of new Set(asciiIn)) {
    const inCount = asciiIn.split(ch).length - 1;
    const outCount = asciiOut.split(ch).length - 1;
    if (outCount < inCount) {
      fails.push({
        category: c.category, source: c.source, got,
        rule: `dropped "${ch}" (${inCount} in, ${outCount} out)`,
      });
      break;
    }
  }

  // Markup must not survive into the reader's sentence. `^(` and `_x` are the
  // two deliberate fallbacks for an index with no raised or lowered glyph, so
  // they are output rather than leftovers.
  if (/\^(?!\()/.test(got)) {
    fails.push({ category: c.category, source: c.source, got, rule: 'markup left in output' });
  }

  // Brackets must balance if they balanced going in.
  const bal = (s: string) => {
    let n = 0;
    for (const ch of s) {
      if (ch === '(') n += 1;
      if (ch === ')') n -= 1;
      if (n < 0) return false;
    }
    return n === 0;
  };
  if (bal(c.source) && !bal(got)) {
    fails.push({ category: c.category, source: c.source, got, rule: 'brackets unbalanced' });
  }

  if (c.notChemistry && looksLikeChemistry(c.source)) {
    fails.push({ category: c.category, source: c.source, got, rule: 'algebra read as chemistry' });
  }

  if (/undefined|NaN|\[object/.test(got)) {
    fails.push({ category: c.category, source: c.source, got, rule: 'placeholder in output' });
  }

  // Setting already-set maths must not change it again.
  let again: string;
  try {
    again = typesetMath(got);
  } catch {
    again = '<threw>';
  }
  if (again !== got) {
    fails.push({ category: c.category, source: c.source, got, want: again, rule: 'not idempotent' });
  }

  return fails;
}

function main(): void {
  const verbose = process.argv.includes('--verbose');
  const cases = buildCases();
  const failures: Failure[] = [];
  for (const c of cases) failures.push(...check(c));

  const byRule = new Map<string, Failure[]>();
  for (const f of failures) {
    const rule = f.rule.replace(/"[^"]*" \(\d+ in, \d+ out\)/, '<char>');
    const list = byRule.get(rule) ?? [];
    list.push(f);
    byRule.set(rule, list);
  }

  console.log(`${cases.length} cases, ${failures.length} failures\n`);
  const sorted = [...byRule.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [rule, list] of sorted) {
    console.log(`${String(list.length).padStart(5)}  ${rule}`);
    const show = verbose ? list : list.slice(0, 4);
    const seen = new Set<string>();
    for (const f of show) {
      const sig = `${f.source}→${f.got}`;
      if (!verbose && seen.has(sig)) continue;
      seen.add(sig);
      console.log(
        `         ${JSON.stringify(f.source)}  ->  ${JSON.stringify(f.got)}` +
          (f.want !== undefined ? `   want ${JSON.stringify(f.want)}` : '')
      );
    }
    console.log();
  }
}

main();
