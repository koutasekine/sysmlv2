// KerML と SysML の文法を、設計書 2.3 節の規則(同名の規則は SysML 側を採る)で合わせ、
// 始点の規則から到達しない規則を数える(GR1 指示書 4.3 節の洗い出しの補助、4.4 節の検査)。
//
// 使い方:
//   node tools/grammar/reach.mjs <KerML.ebnf> <SysML.ebnf> [始点の規則名(既定 RootNamespace)]
//   node tools/grammar/reach.mjs <合成した.ebnf> [始点]       # 1 つにまとめた文法のとき
// 結果は JSON で標準出力に書く。字句の規則(大文字の名前)は、参照があれば到達とみなす。

import { parseGrammarFile, tokenize } from './ebnf.mjs';

const args = process.argv.slice(2);
const files = args.filter(a => a.endsWith('.ebnf') || a.endsWith('.kebnf'));
const start = args.find(a => !files.includes(a)) ?? 'RootNamespace';

const rules = new Map();   // 名前 → { rule, from }
for (const f of files) for (const r of parseGrammarFile(f)) rules.set(r.name, { rule: r, from: f });

// 参照される規則名(属性名と { } の中を除く)
export function refsOf(body) {
  const toks = tokenize(body);
  const out = new Set();
  let brace = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], nx = toks[i + 1];
    if (t.kind === 'op' && t.text === '{') brace++;
    if (t.kind === 'op' && t.text === '}') brace = Math.max(0, brace - 1);
    if (t.kind !== 'id' || brace) continue;
    if (nx?.kind === 'op' && ['=', '+=', '?=', '.'].includes(nx.text)) continue;
    if (toks[i - 1]?.kind === 'op' && toks[i - 1].text === '.') continue;
    out.add(t.text);
  }
  return out;
}

const seen = new Set();
const stack = [start];
while (stack.length) {
  const n = stack.pop();
  if (seen.has(n) || !rules.has(n)) continue;
  seen.add(n);
  for (const m of refsOf(rules.get(n).rule.body)) if (!seen.has(m)) stack.push(m);
}
const unreachable = [...rules.entries()]
  .filter(([n]) => !seen.has(n))
  .map(([n, v]) => ({ name: n, file: v.from, section: v.rule.section, src: v.rule.srcLines }));
console.log(JSON.stringify({ files, start, rules: rules.size, reachable: seen.size,
  unreachableCount: unreachable.length, unreachable }, null, 1));
