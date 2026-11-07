// P3 の検査と報告(GR1 指示書 4.4 節)。
//
// 使い方(先に compose.mjs を実行しておく):
//   node tools/grammar/report_p3.mjs   # → reports/GR1/P3_compose_<hostname>.md
//
// 検査: 合成した文法の未定義の参照が 0 件か(受け入れ基準)。
// 一覧: SysML 側に上書きされて使われない KerML 側の手当て、始点 RootNamespace から到達しない規則、
//       左再帰の閉路、誤りの一覧の各行の合成後の状態。
// 未定義の参照が 1 件でもあれば、報告にそう書き、終了コード 1 で終わる。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseGrammarFile, isLexicalName } from './ebnf.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const HOST = os.hostname();
const PATCHED = 'grammar/sysml20_patched.ebnf';
const DICT = ['out/text/kerml10.txt', 'out/text/sysml20.txt'];
const run = (script, args) => JSON.parse(execFileSync('node', [path.join('tools/grammar', script), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const md = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const errata = JSON.parse(fs.readFileSync('grammar/errata.json', 'utf8'));
const log = JSON.parse(fs.readFileSync('out/grammar/compose_log.json', 'utf8'));
const check = run('check.mjs', [PATCHED, '--dict', ...DICT]);
const reach = run('reach.mjs', [PATCHED]);
const left = run('leftrec.mjs', [PATCHED]);
const rules = parseGrammarFile(PATCHED);

// 合成した文法の規則の出典(@src の注記の出典名)
const lines = fs.readFileSync(PATCHED, 'utf8').split('\n');
const origin = new Map();
for (const r of rules) {
  const m = /@src L\d+-L\d+ (\S+)/.exec(lines[r.fileLine - 2] ?? '');
  origin.set(r.name, m ? m[1].replace(/(.*?)(\(.*)?$/, '$1') : '?');
}
const fromOf = n => origin.get(n)?.startsWith('kerml') ? 'KerML' : 'SysML';
const unreachable = new Set(reach.unreachable.map(u => u.name));
const fpSpelling = new Set(errata.falsePositives.map(f => f.finding));

const undefinedCount = check.count.undefined ?? 0;
const otherKinds = Object.entries(check.count).filter(([k]) => k !== 'undefined');
const unexplained = check.findings.filter(f => f.kind !== 'undefined' && !fpSpelling.has(`${f.kind}:${f.rule}`));

// 誤りの一覧の各行の合成後の状態
const entryState = errata.entries.map(e => {
  const name = log.applied.find(a => a.id === e.id)?.newName ?? e.rule;
  const added = log.added.filter(a => a.id === e.id).map(a => a.rule);
  let state;
  if (e.lang === 'KerML' && log.overriddenNames.includes(name)) state = 'SysML 側の同名の規則に上書きされ、使われない';
  else if (unreachable.has(name)) state = '合成した文法に入るが、始点から到達しない';
  else state = '合成した文法で使われる(始点から到達する)';
  return { e, name, added, state };
});

const L = [];
L.push('# GR1 P3 合成と検査', '',
  `- 機体: ${HOST}`,
  '- 生成: `node tools/grammar/report_p3.mjs`(この報告は道具が書き出したもの)',
  `- 合成した文法: \`${PATCHED}\`(誤りの一覧 grammar/errata.json「${errata.status}」の ${errata.entries.length} 件を当てたもの)`, '');
L.push('## 実行したコマンド', '', '```',
  'node tools/grammar/compose.mjs',
  'node tools/grammar/report_p3.mjs   # 下の 3 つを内部で実行する',
  `#   node tools/grammar/check.mjs ${PATCHED} --dict ${DICT.join(' ')}`,
  `#   node tools/grammar/reach.mjs ${PATCHED}`,
  `#   node tools/grammar/leftrec.mjs ${PATCHED}`,
  '```', '');
L.push('## 要約', '',
  `- 規則: ${log.counts.total} 件(SysML 側 ${log.counts.sysml} 件。うち 2.1 Beta 2 から追加 ${log.added.length} 件。KerML 側 ${log.counts.kermlKept} 件。SysML に上書きされた KerML の規則 ${log.counts.kermlOverridden} 件)。`,
  `- 当てた手当て: ${log.applied.length} 件(誤りの一覧の全件)。`,
  `- **未定義の参照: ${undefinedCount} 件**(受け入れ基準は 0 件)。参照の総数 ${check.stats[0].refs}。`,
  `- そのほかの検査(check.mjs): ${otherKinds.length ? otherKinds.map(([k, v]) => `${k} ${v}`).join('、') : 'なし'}。${otherKinds.length ? (unexplained.length ? `うち P2 の誤検出にない指摘 ${unexplained.length} 件(下の表)。` : 'すべて P2 で誤検出と判定した綴りの指摘(errata.json の falsePositives)。') : ''}`,
  `- SysML 側に上書きされて使われない KerML 側の手当て: ${log.overriddenKerMLPatches.length} 件(${log.overriddenKerMLPatches.map(o => `${o.patches.join(',')} ${o.rule}`).join('、')})。`,
  `- 始点 RootNamespace から到達しない規則: ${reach.unreachableCount} 件(字句の規則 ${reach.unreachable.filter(u => isLexicalName(u.name)).length} 件、KerML 側の規則 ${reach.unreachable.filter(u => !isLexicalName(u.name) && fromOf(u.name) === 'KerML').length} 件、SysML 側の規則 ${reach.unreachable.filter(u => !isLexicalName(u.name) && fromOf(u.name) === 'SysML').length} 件)。`,
  `- 左再帰の閉路(強連結成分): ${left.cycleCount} 個。本体を構文木にできなかった規則: ${left.parseErrors.length} 件。空の列を受理しうる規則: ${left.nullableCount} 件。`,
  `- 結果: ${undefinedCount === 0 ? '**合格**(未定義の参照 0 件)' : '**不合格**'}。`, '');

if (unexplained.length) {
  L.push('## P2 の誤検出にない検査の指摘', '', '| 種類 | 規則 | 内容 |', '|---|---|---|');
  for (const f of unexplained) L.push(`| ${f.kind} | ${f.rule} | ${md(f.detail)} |`);
  L.push('');
}

L.push('## 誤りの一覧の各行の合成後の状態(設計書 12 章の残作業 2 の確認)', '',
  '| ID | 言語 | 規則 | 合成後の状態 |', '|---|---|---|---|');
for (const s of entryState) {
  const nm = s.name !== s.e.rule ? `${s.e.rule} → ${s.name}` : s.e.rule;
  const add = s.added.length ? `。追加した ${s.added.join(', ')} は${s.added.every(a => !unreachable.has(a)) ? '始点から到達する' : '始点から到達しない'}` : '';
  L.push(`| ${s.e.id} | ${s.e.lang} | ${nm} | ${s.state}${add} |`);
}
L.push('');
L.push('KerML 側の手当てで使われないもの:', '');
for (const s of entryState.filter(x => x.e.lang === 'KerML' && !x.state.startsWith('合成した文法で使われる'))) {
  L.push(`- ${s.e.id} ${s.name}: ${s.state}。`);
}
L.push('');

L.push('## 始点から到達しない規則', '', '| 規則 | 出典 | 節 | 字句の規則 |', '|---|---|---|---|');
for (const u of reach.unreachable) L.push(`| ${u.name} | ${origin.get(u.name)} | ${u.section ?? ''} | ${isLexicalName(u.name) ? 'はい' : ''} |`);
L.push('', '字句の規則は、構文の規則から参照されなくても字句の解析で使う(空白・注・予約語・記号)。TYPED_BY は KerML の特殊な終端記号で、SysML は DEFINED_BY を使う。', '');

L.push('## 左再帰の閉路', '',
  '求め方: 規則の本体を構文木にし、空の列を受理しうる規則を不動点で求めたうえで、規則 A の左端(前の要素がすべて空になりうる位置)に規則 B が現れるとき辺 A → B を張り、強連結成分を求めた。字句の規則は終端記号として扱った。`~[QualifiedName]`(SysML 8.2.2.12 節の注 2 の記法)は `[QualifiedName]` と同じに読んだ。', '');
left.cycles.forEach((c, k) => {
  L.push(`### 閉路 ${k + 1}(${c.rules.length} 規則)`, '', `規則: ${c.rules.join('、')}`, '', '左端の辺:', '');
  for (const e of c.edges) L.push(`- ${e}`);
  L.push('');
});
L.push('閉路の性質(規則を読んで確かめたこと):', '',
  '- 演算子の式(OwnedExpression → BinaryOperatorExpression などの閉路): 二項演算子の左の被演算子が式そのものになっている。KerML 1.0 の 8.2.5.8.1 節の注 2(kerml10 L6366-L6373)は「生成規則では直接表していないが、入れ子の演算子式は表 6 の優先順位に従って暗黙にまとめる。累乗以外の二項演算子は左結合、^ と ** は右結合」としている。つまり文法そのものは優先順位について曖昧で、優先順位と結合性は表 6 と注 2 で決まる。',
  '- 後置の式(PrimaryExpression → NonFeatureChainPrimaryExpression → IndexExpression などの閉路): 添字・select・collect・`->`・`.` による連鎖の左側が PrimaryExpression そのものになっている。',
  '- FilterPackage の閉路: FilterPackage → FilterPackageImport → ImportDeclaration → NamespaceImport → FilterPackage。絞り込みを重ねた `import A::*[@X][@Y];` は、1 つの FilterPackage に 2 つの条件を持つ形とも、FilterPackage を入れ子にした形とも読める。本文の KerML の FilterPackage(ImportDeclaration を直接参照)でも同じ閉路になる。手当て E01 で加えたものではない。',
  '', '解析の方式(残作業 3)では、この 3 つの閉路の扱いを決める必要がある(P5 で偵察する)。', '');

fs.writeFileSync(`reports/GR1/P3_compose_${HOST}.md`, L.join('\n'));
console.log(`未定義の参照 ${undefinedCount} 件、到達しない規則 ${reach.unreachableCount} 件、左再帰の閉路 ${left.cycleCount} 個、構文木にできない規則 ${left.parseErrors.length} 件`);
process.exit(undefinedCount === 0 && left.parseErrors.length === 0 ? 0 : 1);
