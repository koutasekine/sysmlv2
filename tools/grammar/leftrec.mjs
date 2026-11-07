// 合成した文法の左再帰の閉路を求める(GR1 指示書 4.4 節)。
//
// 使い方:
//   node tools/grammar/leftrec.mjs grammar/sysml20_patched.ebnf   # 結果を JSON で標準出力に書く
//
// 規則の本体を構文木にし、(1) 空の列を受理しうる規則(nullable)を不動点で求め、
// (2) 規則 A の左端(それより前の要素がすべて空になりうる位置)に現れる規則 B について辺 A→B を張り、
// (3) 強連結成分(大きさ 2 以上、または自己辺)を左再帰の閉路として返す。
// 字句の規則(大文字の名前)は終端記号として扱い、本体は読まない。
// { ... } の非解析の代入は空、[QualifiedName] と ~[QualifiedName] は QualifiedName の参照として扱う。

import { parseGrammarFile, tokenize, isLexicalName } from './ebnf.mjs';

// ---- 本体の構文解析 ----
// 節: {t:'alt', xs} {t:'seq', xs} {t:'rep', min, max, x} {t:'ref', name} {t:'term', text} {t:'empty'}
export function parseBody(body, ruleName) {
  const toks = tokenize(body).filter(t => t.kind !== 'other' || t.text.trim());
  let i = 0;
  const peek = () => toks[i];
  const isOp = (t, s) => t && t.kind === 'op' && t.text === s;
  const fail = (msg) => { throw new Error(`${ruleName}: ${msg}(${i + 1} 番目の字句「${toks[i]?.text ?? '終わり'}」)`); };

  function alt() {
    const xs = [seq()];
    while (isOp(peek(), '|')) { i++; xs.push(seq()); }
    return xs.length === 1 ? xs[0] : { t: 'alt', xs };
  }
  function seq() {
    const xs = [];
    while (peek() && !isOp(peek(), '|') && !isOp(peek(), ')')) xs.push(item());
    return xs.length === 1 ? xs[0] : { t: 'seq', xs };
  }
  function item() {
    let x = prim();
    for (;;) {
      const t = peek();
      if (isOp(t, '*')) { i++; x = { t: 'rep', min: 0, max: Infinity, x }; }
      else if (isOp(t, '+')) { i++; x = { t: 'rep', min: 1, max: Infinity, x }; }
      else if (isOp(t, '?')) { i++; x = { t: 'rep', min: 0, max: 1, x }; }
      else return x;
    }
  }
  function prim() {
    const t = peek();
    if (!t) fail('要素がない');
    if (isOp(t, '(')) {
      i++;
      const x = peek() && isOp(peek(), ')') ? { t: 'empty' } : alt();
      if (!isOp(peek(), ')')) fail('閉じ括弧がない');
      i++;
      return x;
    }
    if (isOp(t, '{')) {
      // 非解析の代入。対応する } まで読み飛ばす。
      let depth = 0;
      do {
        if (isOp(peek(), '{')) depth++;
        if (isOp(peek(), '}')) depth--;
        i++;
      } while (depth > 0 && i < toks.length);
      if (depth) fail('閉じ波括弧がない');
      return { t: 'empty' };
    }
    // ~[QualifiedName] は SysML 8.2.2.12 節の注 2 の記法(名前の解決の仕方だけが違う)。[QualifiedName] と同じに読む。
    if (t.kind === 'other' && t.text === '~' && isOp(toks[i + 1], '[')) i++;
    if (isOp(peek(), '[')) {
      i++;
      const n = peek();
      if (!n || n.kind !== 'id') fail('[ の後に名前がない');
      i++;
      if (!isOp(peek(), ']')) fail('閉じ角括弧がない');
      i++;
      return { t: 'ref', name: n.text };
    }
    if (t.kind === 'term') { i++; return { t: 'term', text: t.text }; }
    if (t.kind === 'id') {
      i++;
      const nx = peek();
      if (nx && nx.kind === 'op' && ['=', '+=', '?='].includes(nx.text)) { i++; return prim(); }
      return { t: 'ref', name: t.text };
    }
    fail('予定外の字句');
  }
  const x = toks.length ? alt() : { t: 'empty' };
  if (i < toks.length) fail('余分な字句');
  return x;
}

// ---- 解析 ----
export function analyze(rules) {
  const syn = new Map();
  const errors = [];
  for (const r of rules) {
    if (isLexicalName(r.name)) continue;
    try { syn.set(r.name, parseBody(r.body, r.name)); }
    catch (e) { errors.push(e.message); }
  }
  const isTerminalRef = (n) => isLexicalName(n) || !syn.has(n);

  // nullable の不動点
  const nullableRule = new Map([...syn.keys()].map(n => [n, false]));
  const nullable = (x) => {
    switch (x.t) {
      case 'empty': return true;
      case 'term': return false;
      case 'ref': return isTerminalRef(x.name) ? false : nullableRule.get(x.name);
      case 'rep': return x.min === 0 || nullable(x.x);
      case 'seq': return x.xs.every(nullable);
      case 'alt': return x.xs.some(nullable);
    }
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const [n, x] of syn) if (!nullableRule.get(n) && nullable(x)) { nullableRule.set(n, true); changed = true; }
  }

  // 左端の参照
  const leftRefs = (x, out) => {
    switch (x.t) {
      case 'ref': if (!isTerminalRef(x.name)) out.add(x.name); break;
      case 'rep': leftRefs(x.x, out); break;
      case 'alt': for (const y of x.xs) leftRefs(y, out); break;
      case 'seq': for (const y of x.xs) { leftRefs(y, out); if (!nullable(y)) break; } break;
    }
    return out;
  };
  const edges = new Map([...syn].map(([n, x]) => [n, [...leftRefs(x, new Set())]]));

  // 強連結成分(Tarjan、再帰を使わない)
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], sccs = [];
  for (const start of edges.keys()) {
    if (idx.has(start)) continue;
    const work = [[start, 0]];
    idx.set(start, index); low.set(start, index); index++; stack.push(start); onStack.add(start);
    while (work.length) {
      const top = work.at(-1);
      const [v, k] = top;
      const ns = edges.get(v);
      if (k < ns.length) {
        top[1]++;
        const w = ns[k];
        if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w); work.push([w, 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      } else {
        work.pop();
        if (work.length) { const u = work.at(-1)[0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === idx.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          if (comp.length > 1 || edges.get(v).includes(v)) sccs.push(comp.sort());
        }
      }
    }
  }
  // 閉路ごとに、成分の中の左端の辺を示す
  const cycles = sccs.map(comp => ({
    rules: comp,
    edges: comp.flatMap(a => edges.get(a).filter(b => comp.includes(b)).map(b => `${a} → ${b}`)),
  }));
  return { errors, nullable: [...nullableRule].filter(([, v]) => v).map(([n]) => n).sort(), cycles };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('使い方: node tools/grammar/leftrec.mjs <文法.ebnf>'); process.exit(2); }
  const res = analyze(parseGrammarFile(file));
  console.log(JSON.stringify({ file, parseErrors: res.errors, nullableCount: res.nullable.length, nullable: res.nullable,
    cycleCount: res.cycles.length, cycles: res.cycles }, null, 1));
}
