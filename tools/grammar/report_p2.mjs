// P2 の検証と報告(GR1 指示書 4.2 節・4.3 節)。
//
// 使い方(先に extract.mjs の 4 つと issues.mjs を実行しておく):
//   node tools/grammar/report_p2.mjs
//
// 行うこと:
//   1. 本文の文法と .kebnf の差(compare.mjs)に分類を当て、(c) と未分類の件数を数える。
//   2. 誤りの一覧 grammar/errata.json を、次と突き合わせて漏れを検査する。
//      - 機械的な検査(check.mjs)の結果、SysML 側の到達しない規則(reach.mjs)
//      - 1.0 と 2.1 Beta 2 の文法の差(compare.mjs)
//      - 2.1 Beta 2 の文法の節にある課題番号の注記(issues_21b2.json)
//      - 設計書 2.2 節の 17 行
//      - 各件の行番号と、手当て(patch)が当てられること
//   3. reports/GR1/P2_extract_diff_<hostname>.md と P2_errata_<hostname>.md を書く。
// 検査に 1 つでも通らなければ、報告にそう書き、終了コード 1 で終わる。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseGrammarFile } from './ebnf.mjs';
import { applyPatch } from './patch.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const HOST = os.hostname();
const run = (script, args) => JSON.parse(execFileSync('node', [path.join('tools/grammar', script), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }));

const G = {
  KerML: 'grammar/kerml10_body.ebnf', SysML: 'grammar/sysml20_body.ebnf',
  KerML21: 'out/grammar/kerml11b2_body.ebnf', SysML21: 'out/grammar/sysml21b2_body.ebnf',
};
const KEBNF = { KerML: 'vendor/release-2026-03/bnf/KerML-textual-bnf.kebnf', SysML: 'vendor/release-2026-03/bnf/SysML-textual-bnf.kebnf' };
const DICT = ['out/text/kerml10.txt', 'out/text/sysml20.txt'];

const problems = [];   // 検査に通らなかったこと
const md = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ---- 1. .kebnf との差 ----
const cmpKeb = {
  KerML: run('compare.mjs', [G.KerML, KEBNF.KerML, 'grammar/extract_diff_classes.json', 'kerml']),
  SysML: run('compare.mjs', [G.SysML, KEBNF.SysML, 'grammar/extract_diff_classes.json', 'sysml']),
};
for (const [lang, c] of Object.entries(cmpKeb)) {
  if (c.count.c) problems.push(`${lang}: 抜き出しの誤り (c) が ${c.count.c} 件`);
  if (c.count.unclassified) problems.push(`${lang}: 分類のない差が ${c.count.unclassified} 件`);
  if (c.unusedClassKeys.length) problems.push(`${lang}: 差に当たらない分類 ${c.unusedClassKeys.join(', ')}`);
}

// ---- 2. 誤りの一覧の検証 ----
const errata = JSON.parse(fs.readFileSync('grammar/errata.json', 'utf8'));
const E = errata.entries;
const check = run('check.mjs', [G.KerML, G.SysML, '--dict', ...DICT]);
const reach = run('reach.mjs', [G.KerML, G.SysML]);
const cmp21 = {
  KerML: run('compare.mjs', [G.KerML, G.KerML21]),
  SysML: run('compare.mjs', [G.SysML, G.SysML21]),
};
const issues = JSON.parse(fs.readFileSync('grammar/issues_21b2.json', 'utf8'));
const grammarNotes = issues.notes.filter(n =>
  (n.doc.startsWith('KerML') && /^8\.2(\.|$)/.test(n.section)) || (n.doc.startsWith('SysML') && /^8\.2\.2(\.|$)/.test(n.section)));

const covered = (key, field) => E.some(e => (e[field] ?? []).includes(key));
const fp = new Set(errata.falsePositives.map(f => f.finding));
const unused21 = errata.unused21;

// 2a. 機械的な検査と到達しない規則
const findingKeys = [
  ...check.findings.map(f => ({ key: `${f.kind}:${f.rule}`, f })),
  ...reach.unreachable.filter(u => u.file === G.SysML).map(u => ({ key: `unreachable:${u.name}`, f: { kind: 'unreachable', rule: u.name, section: u.section, src: u.src, detail: '始点 RootNamespace から到達しない(SysML 側の規則)' } })),
];
const uncoveredFindings = findingKeys.filter(({ key }) => !covered(key, 'findings') && !fp.has(key));
for (const u of uncoveredFindings) problems.push(`誤りの一覧にない検査結果: ${u.key}(${u.f.detail})`);
for (const e of E) for (const k of e.findings ?? []) {
  if (!findingKeys.some(x => x.key === k)) problems.push(`${e.id}: 検査結果にない findings ${k}`);
}

// 2b. 1.0 と 2.1 の差
const diff21Keys = [];
for (const [lang, c] of Object.entries(cmp21)) for (const d of c.diffs) diff21Keys.push({ lang, key: `${d.kind}:${d.name}`, d });
for (const { lang, key } of diff21Keys) {
  if (!covered(key, 'diff21') && !unused21.some(u => u.diff21.includes(key))) problems.push(`誤りの一覧にない 1.0 と 2.1 の差: ${lang} ${key}`);
}

// 2c. 2.1 の注記
const noteKey = n => `${n.issue}@${n.section}`;
for (const n of grammarNotes) {
  if (!covered(noteKey(n), 'notes21') && !unused21.some(u => u.notes21.includes(noteKey(n)))) {
    // 同じ課題番号を別の節の件が持っていれば、その件の根拠になっている
    if (!E.some(e => e.basis.issue === n.issue && e.notes21.some(k => k.startsWith(n.issue + '@')))) problems.push(`誤りの一覧にない 2.1 の注記: ${noteKey(n)} ${n.title}`);
  }
}

// 2d. 設計書 2.2 節の 17 行
const DESIGN_ROWS = 17;
const missingRows = [];
for (let r = 1; r <= DESIGN_ROWS; r++) if (!E.some(e => e.designRow === r)) missingRows.push(r);
for (const r of missingRows) problems.push(`設計書 2.2 節の ${r} 行目が誤りの一覧にない`);

// 2e. 行番号と手当て
const rules = { KerML: parseGrammarFile(G.KerML), SysML: parseGrammarFile(G.SysML) };
const rules21 = { KerML: parseGrammarFile(G.KerML21), SysML: parseGrammarFile(G.SysML21) };
for (const e of E) {
  const r = rules[e.lang].find(x => x.name === e.rule);
  if (!r) { problems.push(`${e.id}: 規則 ${e.rule} が ${G[e.lang]} にない`); continue; }
  if (JSON.stringify(r.srcLines) !== JSON.stringify(e.src)) problems.push(`${e.id}: 行番号 ${JSON.stringify(e.src)} が抜き出しの ${JSON.stringify(r.srcLines)} と違う`);
  try { applyPatch(r, e.patch, rules21[e.lang]); }
  catch (err) { problems.push(`${e.id}: 手当てを当てられない(${err.message})`); }
}

// ---- 3. 報告 ----
const sum = c => `${c.total} 件(a ${c.a}、b ${c.b}、c ${c.c}、未分類 ${c.unclassified})`;
const loc = (lang, src) => src ? `${lang === 'KerML' ? 'kerml10' : 'sysml20'} L${src[0]}-L${src[1]}` : '';
const header = (title) => [
  `# ${title}`, '',
  `- 機体: ${HOST}`,
  `- 生成: \`node tools/grammar/report_p2.mjs\`(この報告は道具が書き出したもの)`,
  `- 抜き出し元のテキスト: \`out/text/kerml10.txt\`(KerML 1.0 PDF)、\`out/text/sysml20.txt\`(SysML 2.0 PDF)。\`pdftotext -layout\`(24.02.0)で作成。行番号はこのテキストの行番号`,
  '',
];

// P2_extract_diff
{
  const L = header('GR1 P2 抜き出しの検証(本文の文法と .kebnf の突き合わせ)');
  L.push('## 実行したコマンド', '', '```',
    'node tools/grammar/extract.mjs kerml10',
    'node tools/grammar/extract.mjs sysml20',
    `node tools/grammar/compare.mjs ${G.KerML} ${KEBNF.KerML} grammar/extract_diff_classes.json kerml`,
    `node tools/grammar/compare.mjs ${G.SysML} ${KEBNF.SysML} grammar/extract_diff_classes.json sysml`,
    '```', '');
  L.push('## 要約', '', '| 文法 | 本文から抜き出した規則 | .kebnf の規則 | 差 |', '|---|---|---|---|');
  for (const lang of ['KerML', 'SysML']) L.push(`| ${lang} | ${cmpKeb[lang].rulesBody} | ${cmpKeb[lang].rulesKebnf} | ${sum(cmpKeb[lang].count)} |`);
  L.push('', '分類: (a) 本文の誤りで、.kebnf が直している / (b) .kebnf が本文と違う手修正をしている / (c) 抜き出しの誤り。',
    '比較は規則名ごとに、本体を字句に分けて空白の差を無視して行った。見出しの差(型名、`=` の有無)も数えた。', '');
  L.push(`**(c) 抜き出しの誤り: ${cmpKeb.KerML.count.c + cmpKeb.SysML.count.c} 件。**`, '');
  L.push('抜き出しの規則: ページの見出し(ページ番号と文書名の行)、改ページの空行、注(Notes)、規則の後ろの「(See Note N)」、説明文と表を取り除いた。規則の中身は直していない。予約語と記号の列挙は、本文の語の並びのまま引用符で囲み `|` でつないで RESERVED_KEYWORD・SYMBOL とした。',
    '見出しの判定では、本文の誤りの形(`名前 : 型 :`、`名前 :`、`=` のない `名前 : 型`)も規則の始まりとみなした(最初はこれを見落として 10 規則が抜けたため、判定を直した)。', '');
  for (const lang of ['KerML', 'SysML']) {
    L.push(`## ${lang} の差の一覧`, '', '| 種類 | 規則 | 節 | 本文の行 | .kebnf の行 | 分類 | 差(- 本文 / + .kebnf) | 説明 |', '|---|---|---|---|---|---|---|---|');
    for (const d of cmpKeb[lang].diffs) {
      const diff = d.diff ?? (d.kind === 'header' ? `本文「${d.body}」/ .kebnf「${d.kebnf}」` : '');
      L.push(`| ${d.kind} | ${d.name} | ${d.section ?? ''} | ${loc(lang, d.src)} | ${d.kebnfLine ?? ''} | ${d.class ?? '未分類'} | ${md(diff)} | ${md(d.note ?? '')} |`);
    }
    L.push('');
  }
  fs.writeFileSync(`reports/GR1/P2_extract_diff_${HOST}.md`, L.join('\n'));
}

// P2_errata
{
  const L = header(`GR1 P2 本文の文法の誤りの一覧(${errata.status === '確定' ? '確定。2026-10-22 オーナー裁定' : '案。オーナーの裁定前'})`);
  L.push('## 実行したコマンド', '', '```',
    'node tools/grammar/extract.mjs kerml10',
    'node tools/grammar/extract.mjs sysml20',
    'node tools/grammar/extract.mjs kerml11b2   # 2.1 Beta 2(比較用、out/ に書く)',
    'node tools/grammar/extract.mjs sysml21b2',
    'node tools/grammar/issues.mjs',
    'node tools/grammar/report_p2.mjs           # 下の check・reach・compare を内部で実行する',
    `#   node tools/grammar/check.mjs ${G.KerML} ${G.SysML} --dict ${DICT.join(' ')}`,
    `#   node tools/grammar/reach.mjs ${G.KerML} ${G.SysML}`,
    `#   node tools/grammar/compare.mjs ${G.KerML} ${G.KerML21}`,
    `#   node tools/grammar/compare.mjs ${G.SysML} ${G.SysML21}`,
    '```', '');
  L.push('## 照合の結果', '');
  const nDesign = E.filter(e => e.designRow).length, nNew = E.filter(e => !e.designRow).length;
  L.push(`- 誤りの一覧: ${E.length} 件(設計書 2.2 節の行に当たるもの ${nDesign} 件、**2.2 節の 17 行にないもの ${nNew} 件**)。`,
    `- 設計書 2.2 節の 17 行: ${DESIGN_ROWS - missingRows.length} 行が一覧に現れる${missingRows.length ? `(現れない行: ${missingRows.join(', ')})` : '(すべて)'}。`,
    `- 機械的な検査(check.mjs): ${Object.entries(check.count).map(([k, v]) => `${k} ${v}`).join('、')}。誤検出 ${errata.falsePositives.length} 件を除き、すべて一覧のどれかに当たる${uncoveredFindings.length ? `(当たらないもの ${uncoveredFindings.length} 件)` : ''}。`,
    `- 合わせた文法で始点 RootNamespace から到達しない SysML 側の規則(reach.mjs): ${reach.unreachable.filter(u => u.file === G.SysML).map(u => u.name).join('、')}。`,
    `- 1.0 と 2.1 Beta 2 の文法の差: KerML ${cmp21.KerML.diffs.length} 件、SysML ${cmp21.SysML.diffs.length} 件。手当てに使うもの以外は下の「2.1 の変更で手当てに使わないもの」に載せた。`,
    `- 2.1 Beta 2 本文の課題番号付きの注記: 全体で ${issues.count} 件(${new Set(issues.notes.map(n => n.issue)).size} 種、grammar/issues_21b2.json)。うち文法の節(KerML 8.2・SysML 8.2.2)にあるもの ${grammarNotes.length} 件を、すべて一覧または下の表に対応づけた。`,
    `- 検査の結果: ${problems.length ? `**不合格 ${problems.length} 件**` : 'すべて通った'}。`, '');
  if (problems.length) { L.push('### 検査に通らなかったこと', ''); for (const p of problems) L.push(`- ${p}`); L.push(''); }

  L.push('## 誤りの一覧', '',
    '根拠の種類: 課題番号 = 2.1 Beta 2 本文の注記 / パイロット = パイロット実装(タグ 2026-03)の文法 / 未特定 = 2.1 Beta 2 に修正はあるが課題番号を特定できない。',
    '「2.2」の列は設計書 2.2 節の表の行(1 始まり)。**「新」は 2.2 節の 17 行にないもの**。', '',
    '| ID | 2.2 | 言語 | 規則 | 節 | 本文の行 | 本文の問題 | 手当て | 根拠 |', '|---|---|---|---|---|---|---|---|---|');
  for (const e of E) {
    const r = rules[e.lang].find(x => x.name === e.rule);
    const basis = e.basis.kind === 'issue' ? `課題番号 ${e.basis.issue}` : e.basis.kind === 'pilot' ? 'パイロット' : '未特定';
    const row = e.designRow ? String(e.designRow) : `**新**${e.ruling ? `(${e.ruling})` : ''}`;
    L.push(`| ${e.id} | ${row} | ${e.lang} | ${e.rule} | ${r?.section ?? ''} | ${loc(e.lang, e.src)} | ${md(e.problem)} | ${md(e.fix)} | ${basis}。${md(e.basis.detail)} |`);
  }
  L.push('');
  if (errata.rulings) { L.push('## オーナーの裁定', ''); for (const r of errata.rulings) L.push(`- ${r}`); L.push(''); }
  L.push(errata.status === '確定' ? '## 2.2 節の 17 行にないもの' : '## 2.2 節の 17 行にないもの(オーナーの裁定が要る)', '');
  for (const e of E.filter(x => !x.designRow)) L.push(`- **${e.id} ${e.rule}**(${e.lang}): ${e.problem} 手当ての案: ${e.fix}`);
  L.push('');
  L.push('## 設計書の記述との食い違い', '');
  for (const n of errata.designNotes) L.push(`- ${n.designRow ? `2.2 節 ${n.designRow} 行目: ` : ''}${n.note}`);
  L.push('');
  L.push('## 2.1 の変更で手当てに使わないもの', '', '| 2.1 との差 | 注記 | 理由 |', '|---|---|---|');
  for (const u of unused21) L.push(`| ${u.diff21.join(', ')} | ${u.notes21.join(', ')} | ${md(u.reason)} |`);
  L.push('');
  L.push('## 検査の誤検出', '', '| 検査結果 | 理由 |', '|---|---|');
  for (const f of errata.falsePositives) L.push(`| ${f.finding} | ${md(f.reason)} |`);
  L.push('');
  L.push('## 機械的な検査の結果(check.mjs、KerML と SysML を合わせて)', '', '| 種類 | 言語 | 規則 | 節 | 本文の行 | 内容 | 一覧 |', '|---|---|---|---|---|---|---|');
  for (const { key, f } of findingKeys) {
    const lang = (f.file ?? G.SysML) === G.KerML ? 'KerML' : 'SysML';
    const where = E.filter(e => e.findings.includes(key)).map(e => e.id).join(', ') || (fp.has(key) ? '誤検出' : '**なし**');
    L.push(`| ${f.kind} | ${lang} | ${f.rule} | ${f.section ?? ''} | ${loc(lang, f.src)} | ${md(f.detail)} | ${where} |`);
  }
  L.push('');
  L.push('## 2.1 Beta 2 の文法の節にある注記', '', '| 課題番号 | 節 | 2.1 本文の行 | 題 | 一覧 |', '|---|---|---|---|---|');
  for (const n of grammarNotes) {
    const k = noteKey(n);
    const where = E.filter(e => e.notes21.includes(k) || (e.basis.issue === n.issue && e.rule && rules[e.lang].find(x => x.name === e.rule)?.section === n.section)).map(e => e.id);
    const u = unused21.find(x => x.notes21.includes(k));
    L.push(`| ${n.issue} | ${n.section} | ${n.doc.startsWith('KerML') ? 'kerml11b2' : 'sysml21b2'} L${n.line} | ${md(n.title)} | ${where.length ? [...new Set(where)].join(', ') : u ? '手当てに使わない(上の表)' : '**なし**'} |`);
  }
  L.push('');
  fs.writeFileSync(`reports/GR1/P2_errata_${HOST}.md`, L.join('\n'));
}

console.log(`誤りの一覧 ${E.length} 件、検査に通らなかったこと ${problems.length} 件`);
for (const p of problems) console.log('  ' + p);
process.exit(problems.length ? 1 : 0);
