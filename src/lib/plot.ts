/**
 * Turning "y = x^2 - 4x + 3" into something that can be drawn.
 *
 * Lesson content is plain text, so a function arrives written the way a
 * student writes it: implied multiplication, `^` for powers, `sin x` without
 * brackets. This compiles that into a plain JavaScript function.
 *
 * It is a real parser rather than `eval` or `new Function`. Lesson text comes
 * back from a model and is cached on disk, so it is not something to hand to
 * the JavaScript engine; and a parser can simply refuse what it doesn't
 * understand, which is what lets the app decide whether a graph is worth
 * showing at all.
 *
 * Kept free of UI imports so it can be tested on its own.
 */

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'open' }
  | { kind: 'close' };

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, π: Math.PI };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

function tokenize(source: string): Token[] | null {
  const text = source
    .replace(/−/g, '-')
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === ' ') {
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      const match = /^\d+(?:\.\d+)?/.exec(text.slice(i))!;
      tokens.push({ kind: 'number', value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-zπ]/.test(ch)) {
      const match = /^[A-Za-zπ]+/.exec(text.slice(i))!;
      tokens.push({ kind: 'name', value: match[0] });
      i += match[0].length;
      continue;
    }
    if (ch === '(' || ch === '[') {
      tokens.push({ kind: 'open' });
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']') {
      tokens.push({ kind: 'close' });
      i += 1;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    // Anything else — a comma, a relation, a stray word — means this isn't a
    // plottable expression, and guessing would draw the wrong curve.
    return null;
  }

  return tokens;
}

/**
 * Make the multiplication a student leaves out explicit.
 *
 * `2x`, `x(x+1)`, `3sin x` and `(x+1)(x-1)` all mean a product, and none of
 * them writes one down.
 */
function insertImplicitProducts(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const previous = out[out.length - 1];
    const endsValue =
      previous &&
      (previous.kind === 'number' ||
        previous.kind === 'close' ||
        (previous.kind === 'name' && !FUNCTIONS[previous.value]));
    const startsValue =
      token.kind === 'number' || token.kind === 'open' || token.kind === 'name';
    if (endsValue && startsValue) out.push({ kind: 'op', value: '*' });
    out.push(token);
  }
  return out;
}

/** Shunting-yard: infix tokens to a reverse-Polish queue. */
function toPostfix(tokens: Token[]): Token[] | null {
  const output: Token[] = [];
  const stack: Token[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.kind === 'number') {
      output.push(token);
    } else if (token.kind === 'name') {
      if (FUNCTIONS[token.value]) stack.push(token);
      else output.push(token);
    } else if (token.kind === 'op') {
      // A minus with nothing to its left is a sign, not a subtraction.
      const previous = tokens[i - 1];
      const unary =
        token.value === '-' &&
        (!previous || previous.kind === 'op' || previous.kind === 'open');
      if (unary) {
        output.push({ kind: 'number', value: 0 });
        stack.push(token);
        continue;
      }
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.kind === 'name') {
          output.push(stack.pop()!);
          continue;
        }
        if (top.kind !== 'op') break;
        // `^` binds right to left, so x^2^3 is x^(2^3).
        const higher =
          PRECEDENCE[top.value] > PRECEDENCE[token.value] ||
          (PRECEDENCE[top.value] === PRECEDENCE[token.value] && token.value !== '^');
        if (!higher) break;
        output.push(stack.pop()!);
      }
      stack.push(token);
    } else if (token.kind === 'open') {
      stack.push(token);
    } else {
      let matched = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.kind === 'open') {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) return null;
      const top = stack[stack.length - 1];
      if (top?.kind === 'name') output.push(stack.pop()!);
    }
  }

  while (stack.length) {
    const top = stack.pop()!;
    if (top.kind === 'open') return null;
    output.push(top);
  }
  return output;
}

export interface PlottableFunction {
  /** What to label the curve, e.g. "y = x² − 4x + 3". */
  label: string;
  /** The value at x, or NaN where the function is undefined. */
  at: (x: number) => number;
  /** What the horizontal axis is: usually x, but t for anything over time. */
  variable: string;
}

/**
 * Compile `y = f(x)` — or a bare `f(x)` — into something drawable.
 *
 * Returns null whenever the text isn't a single-variable function of x, which
 * is most of what appears in a lesson: `A = A_0 b^(kt)` has three unknowns and
 * nothing to plot against, and an equation with no `x` is a fact, not a curve.
 */
export function compileFunction(source: string): PlottableFunction | null {
  const raw = (source ?? '').trim();
  if (!raw || raw.length > 120) return null;

  // Take the right-hand side of `y = ...`, `f(x) = ...` or `h(t) = ...`;
  // anything with more than one relation is a statement about a function, not
  // a function. The bracket names the variable, so a height over time plots
  // against t without being mistaken for a curve in x.
  const sides = raw.split('=');
  let body = raw;
  let variable = 'x';
  if (sides.length === 2) {
    const left = sides[0].trim();
    const applied = /^([A-Za-z])\s*\(\s*([A-Za-z])\s*\)$/.exec(left);
    if (applied) variable = applied[2].toLowerCase();
    else if (!/^y$/i.test(left)) return null;
    body = sides[1];
  } else if (sides.length > 2) {
    return null;
  }

  // Indices arrive typeset as well as written: x² and x^2 are the same curve.
  body = body
    .replace(/⁰/g, '^0')
    .replace(/¹/g, '^1')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6')
    .replace(/⁷/g, '^7')
    .replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9')
    .replace(/⁻/g, '^-');

  const tokens = tokenize(body);
  if (!tokens?.length) return null;

  // Every name has to be the variable, a constant or a function; an unknown
  // letter means a second unknown, and a curve can't be drawn through that.
  let usesVariable = false;
  for (const token of tokens) {
    if (token.kind !== 'name') continue;
    if (token.value.toLowerCase() === variable) {
      usesVariable = true;
      continue;
    }
    if (FUNCTIONS[token.value] || CONSTANTS[token.value] !== undefined) continue;
    return null;
  }
  if (!usesVariable) return null;

  const postfix = toPostfix(insertImplicitProducts(tokens));
  if (!postfix) return null;

  const at = (x: number): number => {
    const stack: number[] = [];
    for (const token of postfix) {
      if (token.kind === 'number') {
        stack.push(token.value);
      } else if (token.kind === 'name') {
        const fn = FUNCTIONS[token.value];
        if (fn) {
          const argument = stack.pop();
          if (argument === undefined) return NaN;
          stack.push(fn(argument));
        } else if (token.value.toLowerCase() === variable) {
          stack.push(x);
        } else {
          stack.push(CONSTANTS[token.value] ?? NaN);
        }
      } else if (token.kind === 'op') {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) return NaN;
        switch (token.value) {
          case '+':
            stack.push(a + b);
            break;
          case '-':
            stack.push(a - b);
            break;
          case '*':
            stack.push(a * b);
            break;
          case '/':
            stack.push(a / b);
            break;
          default:
            stack.push(a ** b);
        }
      }
    }
    return stack.length === 1 ? stack[0] : NaN;
  };

  // Compiling is not enough: it has to actually produce numbers somewhere in
  // view, or the graph is an empty pair of axes.
  let finite = 0;
  for (let x = -10; x <= 10; x += 0.5) if (Number.isFinite(at(x))) finite += 1;
  if (finite < 8) return null;

  return { label: raw, at, variable };
}

/**
 * Questions where a graph would be beside the point.
 *
 * "Differentiate x^5" is an exercise in applying a rule, and drawing x^5 shows
 * nothing about how to do it. An application question — a stone falling, a
 * profit curve — is the opposite: the shape is the thing being asked about.
 */
const MECHANICAL = /^\s*(?:differentiate|integrate|antidifferentiate|find (?:the )?(?:derivative|antiderivative|integral)|evaluate (?:the )?integral|simplify|expand|factorise|factor)\b/i;

export function wantsGraph(prompt: string): boolean {
  return !MECHANICAL.test(prompt ?? '');
}

/**
 * Pick the functions worth plotting out of a lesson's formulas.
 *
 * Most formulas aren't curves, so this quietly drops what it can't draw rather
 * than asking the model to mark them up — which means it works on the lessons
 * already written as well as on new ones.
 */
export function plottableFrom(sources: (string | null | undefined)[]): PlottableFunction[] {
  const found: PlottableFunction[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const fn = compileFunction(source ?? '');
    if (!fn) continue;
    const key = fn.label.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(fn);
  }
  return found;
}
