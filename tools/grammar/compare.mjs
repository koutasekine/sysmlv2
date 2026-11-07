// 本文から抜き出した文法と、公式リポジトリの .kebnf を規則名ごとに突き合わせる(GR1 指示書 4.2 節)。
//
// 使い方:
//   node tools/grammar/compare.mjs <本文の.ebnf> <.kebnf> [分類ファイル.json [分類ファイルの中の組の名前]] > 差の一覧(JSON)
//
// 差の種類:
//   only-body   本文にだけある規則
//   only-kebnf  .kebnf にだけある規則
//   header      見出し(型・'=' の有無)が違う
//   body        本体の字句の並びが違う(空白の差は無視する)
// 分類ファイル(手で書く)を与えると、各差に分類 a/b/c と説明を付け、分類のない差を数える。
// 分類ファイルの形: { "<種類>:<規則名>": { "class": "a"|"b"|"c", "note": "..." }, ... }
// (組の名前を与えたときは、その名前の下にこの形の表がある)

import fs from 'node:fs';
import { parseGrammarFile, tokenize } from './ebnf.mjs';

const [bodyPath, kebnfPath, classPath, classKey] = process.argv.slice(2);
if (!bodyPath || !kebnfPath) {
  console.error('使い方: node tools/grammar/compare.mjs <本文の.ebnf> <.kebnf> [分類.json]');
  process.exit(2);
}

const body = parseGrammarFile(bodyPath);
const keb = parseGrammarFile(kebnfPath);
const byName = rules => {
  const m = new Map();
  for (const r of rules) { if (!m.has(r.name)) m.set(r.name, []); m.get(r.name).push(r); }
  return m;
};
const B = byName(body);
const K = byName(keb);

// 字句の列の最小の差(共通部分列による)を、削除 '-' と追加 '+' の塊で返す。
function tokenDiff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  const push = (op, t) => {
    const last = out.at(-1);
    if (last && last.op === op) last.toks.push(t); else out.push({ op, toks: [t] });
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { push('=', a[i]); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { push('+', b[j]); j++; }
    else { push('-', a[i]); i++; }
  }
  // 前後の文脈を 3 字句だけ残す
  return out.map((c, k) => {
    if (c.op !== '=') return `${c.op}[${c.toks.join(' ')}]`;
    if (k === 0) return '… ' + c.toks.slice(-3).join(' ');
    if (k === out.length - 1) return c.toks.slice(0, 3).join(' ') + ' …';
    return c.toks.length > 6 ? `${c.toks.slice(0, 3).join(' ')} … ${c.toks.slice(-3).join(' ')}` : c.toks.join(' ');
  }).join(' ');
}

const diffs = [];
const names = new Set([...B.keys(), ...K.keys()]);
for (const name of [...names].sort()) {
  const bs = B.get(name), ks = K.get(name);
  if (bs && bs.length > 1) diffs.push({ kind: 'dup-body', name, lines: bs.map(r => r.srcLines) });
  if (ks && ks.length > 1) diffs.push({ kind: 'dup-kebnf', name, lines: ks.map(r => r.fileLine) });
  if (!ks) { diffs.push({ kind: 'only-body', name, section: bs[0].section, src: bs[0].srcLines }); continue; }
  if (!bs) { diffs.push({ kind: 'only-kebnf', name, section: ks[0].section, kebnfLine: ks[0].fileLine }); continue; }
  const b = bs[0], k = ks[0];
  if (b.type !== k.type || b.sep !== k.sep) {
    diffs.push({ kind: 'header', name, section: b.section, src: b.srcLines, kebnfLine: k.fileLine,
                 body: b.header.trim(), kebnf: k.header.trim() });
  }
  const bt = tokenize(b.body).map(t => t.text);
  const kt = tokenize(k.body).map(t => t.text);
  if (bt.join(' ') !== kt.join(' ')) {
    diffs.push({ kind: 'body', name, section: b.section, src: b.srcLines, kebnfLine: k.fileLine,
                 diff: tokenDiff(bt, kt) });
  }
}

let classes = {};
if (classPath) {
  const j = JSON.parse(fs.readFileSync(classPath, 'utf8'));
  classes = classKey ? j[classKey] : j;
}
for (const d of diffs) {
  const c = classes[`${d.kind}:${d.name}`];
  if (c) { d.class = c.class; d.note = c.note; }
}
const count = { total: diffs.length, a: 0, b: 0, c: 0, unclassified: 0 };
for (const d of diffs) count[d.class ?? 'unclassified']++;
const unused = Object.keys(classes).filter(k => !diffs.some(d => `${d.kind}:${d.name}` === k));
console.log(JSON.stringify({ body: bodyPath, kebnf: kebnfPath, rulesBody: body.length, rulesKebnf: keb.length,
  count, unusedClassKeys: unused, diffs }, null, 1));
