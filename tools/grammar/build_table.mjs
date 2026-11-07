// 合成した文法から、パーサーが読む文法の表 src/parser/grammar_table.js を生成する(GR2 指示書 5.2 節)。
//
// 使い方:
//   node tools/grammar/build_table.mjs   # → src/parser/grammar_table.js
//
// 入力:
//   grammar/sysml20_patched.ebnf   合成した文法(GR1。手当ては grammar/errata.json)
//   grammar/metaclasses.json       抽象構文のメタクラスと一般化(tools/grammar/metaclasses.mjs で本文から生成)
//
// 表の中身:
//   start      始点の規則名(RootNamespace)
//   keywords   予約語(RESERVED_KEYWORD。SysML 2.0 の 8.2.2.1.2 節)
//   symbols    記号(SYMBOL。KerML 1.0 の 8.2.2.7 節)と、文法に引用符で書かれた記号の和
//   rules      { 規則名: [型, 本体] }。始点から到達する構文の規則だけ。
//              型は規則の「: 型」(省略時は規則名。Table 29)。
//   metaclasses { メタクラス名: [一般化の名前...] }。規則の型から一般化をたどって届くものだけ。列挙型は含めない。
//
// 本体の形(入れ子の配列):
//   ['a', x...]          選択(|)
//   ['s', x...]          並び
//   ['*', x] ['+', x] ['?', x]   繰り返しと省略
//   ['t', 'xxx']         終端記号 'xxx'
//   ['r', 'Name']        規則の参照(代入なし)。字句の規則(NAME など)もこの形
//   ['q', 'Name']        名前の参照 [Name](~[Name] も同じ)。書かれた名前のまま持つ
//   ['=', 属性, 演算子, x]   代入(演算子は '='、'+='、'?=')
//   ['n', 属性, 演算子, 値]  解析しない代入 { 属性 = 値 }。属性は a.b.c の経路のこともある。値は ['t', 'xxx']・['b', true]・['p', 属性名か this]
//   ['e']                空
// 字句の規則のうち NAME・DECIMAL_VALUE・EXPONENTIAL_VALUE・STRING_VALUE・REGULAR_COMMENT は字句解析器が作る字句で、
// 表では ['r', 'NAME'] などの形で現れる。DEFINED_BY などの特殊な終端記号は構文の規則として表に入れる。

import fs from 'node:fs';
import path from 'node:path';
import { parseGrammarFile, tokenize } from './ebnf.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const GRAMMAR = 'grammar/sysml20_patched.ebnf';
const META = 'grammar/metaclasses.json';
const OUT = 'src/parser/grammar_table.js';
const START = 'RootNamespace';
const TOKEN_CLASSES = new Set(['NAME', 'DECIMAL_VALUE', 'EXPONENTIAL_VALUE', 'STRING_VALUE', 'REGULAR_COMMENT']);

// ---- 本体の構文解析(代入を残す) ----
function parseBody(body, ruleName) {
  const toks = tokenize(body).filter(t => t.kind !== 'other' || t.text.trim());
  let i = 0;
  const peek = (k = 0) => toks[i + k];
  const isOp = (t, s) => t && t.kind === 'op' && t.text === s;
  const fail = (msg) => { throw new Error(`${ruleName}: ${msg}(${i + 1} 番目の字句「${toks[i]?.text ?? '終わり'}」)`); };
  const unq = (t) => t.text.slice(1, -1);

  function alt() {
    const xs = [seq()];
    while (isOp(peek(), '|')) { i++; xs.push(seq()); }
    return xs.length === 1 ? xs[0] : ['a', ...xs];
  }
  function seq() {
    const xs = [];
    while (peek() && !isOp(peek(), '|') && !isOp(peek(), ')')) xs.push(item());
    return xs.length === 0 ? ['e'] : xs.length === 1 ? xs[0] : ['s', ...xs];
  }
  function item() {
    let x = prim();
    for (;;) {
      const t = peek();
      if (isOp(t, '*') || isOp(t, '+') || isOp(t, '?')) { i++; x = [t.text, x]; }
      else return x;
    }
  }
  function nonParsing() {
    // { 属性 = 値 } / { 属性 += 値 } / { }
    i++;
    if (isOp(peek(), '}')) { i++; return ['e']; }
    // 属性は「a.b.c」のような経路でもよい(PortDefinition の { conjugatedPortDefinition.ownedPortConjugator.originalPortDefinition = this })
    const p = peek();
    if (!p || p.kind !== 'id') fail('{ の後に属性名がない');
    let prop = p.text;
    i++;
    while (isOp(peek(), '.') && peek(1)?.kind === 'id') { prop += '.' + peek(1).text; i += 2; }
    const op = peek();
    if (!op || op.kind !== 'op' || !['=', '+='].includes(op.text)) fail('{ 属性 の後に = か += がない');
    i++;
    const v = peek();
    let value;
    if (v?.kind === 'term') value = ['t', unq(v)];
    else if (v?.kind === 'id' && (v.text === 'true' || v.text === 'false')) value = ['b', v.text === 'true'];
    else if (v?.kind === 'id') value = ['p', v.text];
    else fail('{ } の値を読めない');
    i++;
    if (!isOp(peek(), '}')) fail('閉じ波括弧がない');
    i++;
    return ['n', prop, op.text, value];
  }
  function prim() {
    const t = peek();
    if (!t) fail('要素がない');
    if (isOp(t, '(')) {
      i++;
      const x = isOp(peek(), ')') ? ['e'] : alt();
      if (!isOp(peek(), ')')) fail('閉じ括弧がない');
      i++;
      return x;
    }
    if (isOp(t, '{')) return nonParsing();
    // ~[QualifiedName] は SysML 8.2.2.12 節の注 2 の記法(名前の解決の仕方だけが違う)。[QualifiedName] と同じに読む。
    if (t.kind === 'other' && t.text === '~' && isOp(peek(1), '[')) i++;
    if (isOp(peek(), '[')) {
      i++;
      const n = peek();
      if (!n || n.kind !== 'id') fail('[ の後に名前がない');
      i++;
      if (!isOp(peek(), ']')) fail('閉じ角括弧がない');
      i++;
      return ['q', n.text];
    }
    if (t.kind === 'term') { i++; return ['t', unq(t)]; }
    if (t.kind === 'id') {
      i++;
      const nx = peek();
      if (nx && nx.kind === 'op' && ['=', '+=', '?='].includes(nx.text)) {
        i++;
        return ['=', t.text, nx.text, prim()];
      }
      return ['r', t.text];
    }
    fail('予定外の字句');
  }
  const x = toks.length ? alt() : ['e'];
  if (i < toks.length) fail('余分な字句');
  return x;
}

// ---- 読み込みと到達する規則 ----
const rules = parseGrammarFile(GRAMMAR);
const byName = new Map(rules.map(r => [r.name, r]));
const termsOf = (name) => tokenize(byName.get(name).body).filter(t => t.kind === 'term').map(t => t.text.slice(1, -1));
const keywords = termsOf('RESERVED_KEYWORD');
const symbolList = termsOf('SYMBOL');

const bodies = new Map();
const queue = [START];
const refsOf = (x, out) => {
  if (x[0] === 'r' || x[0] === 'q') out.push(x[1]);
  else if (x[0] === '=') refsOf(x[3], out);
  else if (x[0] === 'a' || x[0] === 's') x.slice(1).forEach(y => refsOf(y, out));
  else if (x[0] === '*' || x[0] === '+' || x[0] === '?') refsOf(x[1], out);
  return out;
};
while (queue.length) {
  const n = queue.pop();
  if (bodies.has(n) || TOKEN_CLASSES.has(n)) continue;
  const r = byName.get(n);
  if (!r) throw new Error(`規則 ${n} が文法にない`);
  const b = parseBody(r.body, n);
  bodies.set(n, b);
  for (const m of refsOf(b, [])) if (!bodies.has(m) && !TOKEN_CLASSES.has(m)) queue.push(m);
}

// 文法に引用符で書かれた記号(予約語の形でないもの)
const grammarSymbols = new Set();
const termsIn = (x) => {
  if (x[0] === 't') { if (!/^[A-Za-z_]\w*$/.test(x[1])) grammarSymbols.add(x[1]); }
  else if (x[0] === '=') termsIn(x[3]);
  else if (x[0] === 'a' || x[0] === 's') x.slice(1).forEach(termsIn);
  else if (x[0] === '*' || x[0] === '+' || x[0] === '?') termsIn(x[1]);
};
bodies.forEach(termsIn);
const symbols = [...new Set([...symbolList, ...grammarSymbols])];

// ---- メタクラス ----
const meta = new Map(JSON.parse(fs.readFileSync(META, 'utf8')).metaclasses.map(m => [m.name, m]));
const typeOf = (n) => byName.get(n).type ?? n;
const usedMeta = new Set();
const addMeta = (n) => {
  const m = meta.get(n);
  if (!m || m.enum || usedMeta.has(n)) return;
  usedMeta.add(n);
  m.general.forEach(addMeta);
};
for (const n of bodies.keys()) addMeta(typeOf(n));

// ---- 書き出し ----
const tableRules = {};
for (const n of [...bodies.keys()].sort()) tableRules[n] = [typeOf(n), bodies.get(n)];
const metaclasses = {};
for (const n of [...usedMeta].sort()) metaclasses[n] = meta.get(n).general;
const unknownTypes = [...new Set([...bodies.keys()].map(typeOf))].filter(t => !meta.has(t)).sort();

const table = { start: START, keywords, symbols, rules: tableRules, metaclasses };
const text = [
  '// 文法の表(手で編集しない)。',
  '// 生成: node tools/grammar/build_table.mjs',
  '// 元: grammar/sysml20_patched.ebnf(SysML 2.0 と KerML 1.0 の本文の文法に grammar/errata.json の手当てを当てて合成したもの)、',
  '//     grammar/metaclasses.json(抽象構文のメタクラスと一般化)。形は tools/grammar/build_table.mjs の注記を参照。',
  `export default ${JSON.stringify(table)};`,
  '',
].join('\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`${OUT}: ${text.length} バイト、規則 ${bodies.size} 件、予約語 ${keywords.length} 語、記号 ${symbols.length} 個、メタクラス ${usedMeta.size} 件`);
console.log(`規則の型のうちメタクラスにないもの ${unknownTypes.length} 件: ${unknownTypes.join(' ')}`);
