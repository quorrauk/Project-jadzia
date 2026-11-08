// Generated questions: the same template gives different numbers every play, with ranges that depend on level.
// No eval(): a tiny expression parser handles the maths in content files.
//
// Template (inside a question):
//   "gen": {
//     "vars": { "V": { "pick": [3, 6, 9] }, "I": { "min": 1, "max": 5 } },   // may have level variants: {"1": {...}, "3": {...}}
//     "derived": { "R": "V / I" },                                           // computed after the picks
//     "where": ["R <= 100"],                                                 // redraw until all true
//     "answer": "V / R",
//     "dp": 3                                                                // decimal places for the answer
//   }
//   and {V}, {R}, {answer} in prompt / explain / hints / wrong[].why are filled in.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of any mix of numbers and strings. */
export function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- expressions

function tokenize(src) {
  const out = [];
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|[A-Za-z_]\w*|<=|>=|==|!=|[-+*/^()<>,])/gy;
  let m;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error(`Cannot read expression: ${src}`);
    }
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}

const FUNCS = { sqrt: Math.sqrt, min: Math.min, max: Math.max, abs: Math.abs, round: Math.round };

export function evalExpr(src, vars = {}) {
  const t = tokenize(String(src));
  let i = 0;
  const peek = () => t[i];
  const take = () => t[i++];
  const expect = (x) => {
    if (take() !== x) throw new Error(`Expected ${x} in: ${src}`);
  };

  function compare() {
    let l = sum();
    while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) {
      const op = take();
      const r = sum();
      l = { '<': l < r, '>': l > r, '<=': l <= r, '>=': l >= r, '==': l === r, '!=': l !== r }[op] ? 1 : 0;
    }
    return l;
  }
  function sum() {
    let l = prod();
    while (peek() === '+' || peek() === '-') l = take() === '+' ? l + prod() : l - prod();
    return l;
  }
  function prod() {
    let l = unary();
    while (peek() === '*' || peek() === '/') l = take() === '*' ? l * unary() : l / unary();
    return l;
  }
  function unary() {
    if (peek() === '-') {
      take();
      return -unary();
    }
    return power();
  }
  function power() {
    const base = atom();
    if (peek() === '^') {
      take();
      return base ** unary();
    }
    return base;
  }
  function atom() {
    const tok = take();
    if (tok === undefined) throw new Error(`Unexpected end of: ${src}`);
    if (tok === '(') {
      const v = compare();
      expect(')');
      return v;
    }
    if (/^\d/.test(tok)) return Number(tok);
    if (FUNCS[tok]) {
      expect('(');
      const args = [compare()];
      while (peek() === ',') {
        take();
        args.push(compare());
      }
      expect(')');
      return FUNCS[tok](...args);
    }
    if (tok in vars) return vars[tok];
    throw new Error(`Unknown name "${tok}" in: ${src}`);
  }

  const v = compare();
  if (i < t.length) throw new Error(`Unexpected "${t[i]}" in: ${src}`);
  return v;
}

// ---------------------------------------------------------------- generation

const round = (n, dp) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Show a number without float junk: 0.225, 24, 1200, 0.000047. */
export function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) return n.toExponential(3).replace(/\.?0+e/, 'e');
  return String(Number(n.toPrecision(8)));
}

function draw(spec, rand) {
  if (Array.isArray(spec.pick)) return spec.pick[Math.floor(rand() * spec.pick.length)];
  const step = spec.step ?? 1;
  const n = Math.floor((spec.max - spec.min) / step + 1e-9) + 1;
  return round(spec.min + step * Math.floor(rand() * n), spec.dp ?? 6);
}

/**
 * Turn a question (with or without a `gen` block) into a concrete one for this seed.
 * Level variants must already be resolved (resolveStage does that).
 */
export function instantiate(q, seed) {
  if (!q.gen) return { ...q };
  const g = q.gen;
  const rand = rng(seed);
  let vars;
  for (let attempt = 0; attempt < 200; attempt++) {
    vars = {};
    for (const [name, spec] of Object.entries(g.vars ?? {})) vars[name] = draw(spec, rand);
    for (const [name, expr] of Object.entries(g.derived ?? {})) vars[name] = round(evalExpr(expr, vars), 6);
    if ((g.where ?? []).every((w) => evalExpr(w, vars))) break;
    if (attempt === 199) throw new Error(`Question constraints never satisfied: ${(g.where ?? []).join(', ')}`);
  }
  const answer = round(evalExpr(g.answer, vars), g.dp ?? 6);
  const scope = { ...vars, answer };
  const fill = (s) => String(s).replace(/\{([A-Za-z_]\w*)\}/g, (m, k) => (k in scope ? fmt(scope[k]) : m));
  const wrong = (q.wrong ?? [])
    .map((w) => ({ value: w.expr ? round(evalExpr(w.expr, vars), 6) : w.value, why: fill(w.why) }))
    .filter((w) => w.value !== answer);
  const { gen, ...rest } = q;
  return {
    ...rest,
    prompt: fill(q.prompt),
    explain: fill(q.explain),
    hints: (q.hints ?? []).map(fill),
    answer,
    wrong,
    values: scope,
  };
}
