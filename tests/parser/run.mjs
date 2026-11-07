// パーサーの検査(GR2 指示書 8 章)。
//
// 使い方:
//   node tests/parser/run.mjs
//
// 前提(先に作っておくもの。作り方は reports/GR2/P3_mutation_*.md):
//   out/files309.txt                309 ファイルの一覧(GR1)
//   out/pilot/files309/             パイロット実装の 309 ファイルの結果(GR1 P4)
//   out/mutation/                   変異ファイル 30,900 件(tools/compare/mutate.mjs、種 20261022)
//   out/pilot/mutation/             パイロット実装の変異ファイルの結果
//
// 検査:
//   1. 字句(設計書 2.4 節の各項目)
//   2. 309 ファイルの受理・拒否と構文木(tools/compare/compare.mjs --classify)。受理・拒否の食い違いがすべて既知の差
//      (tools/compare/variants.mjs)で説明でき、構文木の食い違いがすべて分類でき(classify.mjs)、曖昧さが 0 件であること
//   3. 変異ファイル: 種から作り直して同じ変異になること、受理・拒否の食い違いがすべて既知の差で説明でき、曖昧さが 0 件であること
//   4. src/ が Node.js 固有の機能を使っていないこと
//   5. 深い入れ子と長い式(GR18 の B1): tools/model/gr18_deep.mjs --check parse を、浅い呼び出しの深さで流す
//   全体の時間は記録するだけで、合否に使わない(GR20 の Z1。GR19 までは全体が 15 分以内に終わることを合否にしていた)
// 失敗が 1 つでもあれば終了コード 1 で終わる。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { makeVariants, classifyAccept } from '../../tools/compare/variants.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const t0 = performance.now();
let failures = 0, passes = 0;
const check = (cond, what, detail = '') => {
  if (cond) passes++;
  else { failures++; console.log(`  失敗: ${what}${detail ? ` — ${detail}` : ''}`); }
};
const section = (name) => console.log(`\n== ${name}`);
const node = (...args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });

// ---- 1. 字句 ----
section('1. 字句(設計書 2.4 節)');
const ok = (src) => parse(src).ok;
const lexErr = (src) => { const r = parse(src); return !r.ok && r.errors[0].kind === 'lexical'; };
const nameOf = (src) => parse(src).tree?.owned[0]?.related[0]?.name;
const hex = (k) => 'U+' + k.toString(16).toUpperCase().padStart(4, '0');

// 引用符なしの名前は ASCII の英字・数字・_ だけ
check(ok('part abc_1;'), '引用符なしの ASCII の名前を受理する');
check(lexErr('part 温度;'), '引用符なしの ASCII でない名前は字句のエラー');
check(nameOf("part '温度センサ';") === '温度センサ', '単一引用符で囲む日本語の名前を読み、引用符を外す');
// Cc(65 文字)は引用符の中で使えない
const cc = [];
for (let k = 0; k <= 0x1f; k++) cc.push(k);
for (let k = 0x7f; k <= 0x9f; k++) cc.push(k);
check(cc.length === 65, 'Cc は 65 文字');
for (const k of cc) {
  const c = String.fromCharCode(k);
  check(lexErr(`part 'a${c}b';`), `名前の中の ${hex(k)} は字句のエラー`);
  check(lexErr(`attribute x = "a${c}b";`), `文字列の中の ${hex(k)} は字句のエラー`);
}
for (const c of [' ', ' ', '﻿', '\u{1f600}', '­']) {
  check(ok(`part 'a${c}b';`), `名前の中の Cc でない文字 ${hex(c.codePointAt(0))} を受理する`);
}
// エスケープ列は表 4 の 7 種だけ
const ESC = { "\\'": "'", '\\"': '"', '\\b': '\b', '\\f': '\f', '\\t': '\t', '\\n': '\n', '\\\\': '\\' };
for (const [e, v] of Object.entries(ESC)) check(nameOf(`part 'a${e}b';`) === `a${v}b`, `エスケープ列 ${e} を読む`);
for (const e of ['\\r', '\\a', '\\0', '\\u', '\\v', '\\x']) check(lexErr(`part 'a${e}b';`), `エスケープ列 ${e} は字句のエラー`);
// 空の名前
check(ok("part '';") && nameOf("part '';") === '', "空の名前 '' を受理する");
// 行末: LF・CR LF・CR、混在
for (const [nl, label] of [['\n', 'LF'], ['\r\n', 'CR LF'], ['\r', 'CR']]) {
  check(ok(`package P {${nl}part a;${nl}part b;${nl}}`), `行末 ${label} を受理する`);
  const r = parse(`package P {${nl}part a;${nl}part b${nl}}`);
  check(!r.ok && r.errors[0].line === 4, `行末 ${label} で行番号を数える`, JSON.stringify(r.errors[0]));
}
check(ok('package P {\npart a;\r\npart b;\rpart c;\n}'), '行末の混在を受理する');
// 1 行の注はどの行末でも終わる
for (const [nl, label] of [['\n', 'LF'], ['\r\n', 'CR LF'], ['\r', 'CR']]) {
  const r = parse(`// 注${nl}part p;`);
  check(r.ok && r.tree.owned.length === 1, `1 行の注は ${label} で終わる`);
}
// 空白: スペース・タブ・フォームフィード・行末だけ
check(ok('part\tp\f;'), 'タブとフォームフィードは空白');
for (const c of [' ', '\u000b', '　', ' ', '\u0085']) check(lexErr(`part${c}p;`), `${hex(c.charCodeAt(0))} は字句のエラー`);
// UTF-8 と BOM
let threw = false;
try { decodeUtf8(new Uint8Array([0x70, 0x61, 0xff, 0x72])); } catch { threw = true; }
check(threw, 'UTF-8 として正しくないバイト列は読み込みのエラー');
check(decodeUtf8(new TextEncoder().encode('part p;')) === 'part p;', 'UTF-8 を読む');
check(ok(decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('part p;')]))), '先頭の BOM を取り除いて読む');
check(lexErr('part p;﻿part q;'), '先頭以外の字句の間の U+FEFF は字句のエラー');
// 予約語(SysML 2.0 の 8.2.2.1.2 節。new は含めない)
check(ok('part new;'), 'new は予約語でない');
check(!ok('part part;'), '予約語 part は名前に使えない');
// 構文のエラーには行・列と期待されていた字句
{
  const r = parse('package P {\n  part p\n}');
  const e = r.errors[0];
  check(!r.ok && e.kind === 'syntax' && e.line === 3 && e.col === 1 && e.expected.includes("';'"), '構文のエラーに行・列・期待されていた字句を付ける', JSON.stringify(e));
}
// 字句のエラーにも行・列
{
  const r = parse('part a;\npart  b;');
  check(!r.ok && r.errors[0].line === 2 && r.errors[0].col === 6, '字句のエラーに行・列を付ける', JSON.stringify(r.errors[0]));
}
console.log(`  ${passes} 件合格、${failures} 件失敗`);

// ---- 2. 309 ファイル ----
section('2. 309 ファイルの受理・拒否と構文木');
const variants = makeVariants();
{
  const f0 = failures;
  console.log('  ' + node('tools/compare/compare.mjs', '--classify', '--pilot', 'out/pilot/files309', '--base', 'vendor/release-2026-03',
    '--out', 'out/compare/files309', '@out/files309.txt').trim());
  const s = JSON.parse(fs.readFileSync('out/compare/files309/summary.json', 'utf8'));
  check(s.files === 309, '309 ファイルを解析した', String(s.files));
  check(s.withAmbiguities === 0, '曖昧さが残らない', String(s.withAmbiguities));
  const counts = {};
  for (const r of s.results) {
    if (r.acceptMatch) continue;
    const text = decodeUtf8(fs.readFileSync(path.join('vendor/release-2026-03', r.file)));
    const c = classifyAccept(variants, text, r.pilot);
    counts[c] = (counts[c] ?? 0) + 1;
    check(c !== 'unclassified', `受理・拒否の食い違いを既知の差で説明できる: ${r.file}`);
  }
  console.log(`  受理・拒否の食い違い: ${JSON.stringify(counts)}`);
  check(s.unclassified === 0, '構文木の食い違いをすべて分類できる', String(s.unclassified));
  console.log(`  構文木: 一致 ${s.treeMatch} / ${s.bothAccepted}、分類 ${s.classified} 件 ${JSON.stringify(s.diffClasses)}`);
  console.log(`  ${failures === f0 ? '合格' : '失敗あり'}`);
}

// ---- 3. 変異ファイル ----
section('3. 変異ファイル');
{
  const f0 = failures;
  const m = JSON.parse(fs.readFileSync('out/mutation/manifest.json', 'utf8'));
  check(m.count === 30900 && m.seed === 20261022, '変異ファイルは 30,900 件、種 20261022', `${m.count} ${m.seed}`);
  // 種から作り直して同じになるか(作業用のフォルダに作る)
  node('tools/compare/mutate.mjs', '--out', 'out/mutation_check', '--count', String(m.count), '--seed', String(m.seed),
    '--base', 'vendor/release-2026-03', '@out/files309.txt');
  const again = JSON.parse(fs.readFileSync('out/mutation_check/manifest.json', 'utf8'));
  check(JSON.stringify(again.mutations) === JSON.stringify(m.mutations), '種から作り直すと同じ変異になる');
  fs.rmSync('out/mutation_check', { recursive: true, force: true });
  console.log('  ' + node('tools/compare/compare.mjs', '--pilot', 'out/pilot/mutation', '--base', 'out/mutation/files',
    '--out', 'out/compare/mutation', '@out/mutation/list.txt').trim().slice(0, 200));
  console.log('  ' + node('tools/compare/classify_mutation.mjs', '--mutation', 'out/mutation', '--compare', 'out/compare/mutation').trim());
  const s = JSON.parse(fs.readFileSync('out/compare/mutation/summary.json', 'utf8'));
  const mm = JSON.parse(fs.readFileSync('out/compare/mutation/mismatch.json', 'utf8'));
  check(s.files === m.count, '変異ファイルをすべて解析した', String(s.files));
  check(s.withAmbiguities === 0, '曖昧さが残らない', String(s.withAmbiguities));
  check(!mm.counts.unclassified, '受理・拒否の食い違いをすべて既知の差で説明できる', JSON.stringify(mm.counts));
  console.log(`  ${failures === f0 ? '合格' : '失敗あり'}`);
}

// ---- 4. src/ が Node.js 固有の機能を使っていないこと ----
section('4. src/ の Node.js 固有の機能');
{
  const f0 = failures;
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) files.push(p); } };
  walk('src');
  const BAD = [
    [/\bfrom\s+['"](?!\.\.?\/)/, '相対パスでない import'],
    [/\bimport\s*\(\s*['"](?!\.\.?\/)/, '相対パスでない動的 import'],
    [/\brequire\s*\(/, 'require'],
    [/\bprocess\s*\./, 'process'],
    [/\bBuffer\b/, 'Buffer'],
    [/\b__dirname\b|\b__filename\b/, '__dirname・__filename'],
    [/['"]node:/, 'node: の読み込み'],
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [re, what] of BAD) check(!re.test(text), `${f} に ${what} がない`);
  }
  console.log(`  ${files.length} ファイルを検査: ${failures === f0 ? '合格' : '失敗あり'}`);
}

// ---- 5. 深い入れ子と長い式(GR18 指示書 2.5 節の B1) ----
section('5. 深い入れ子と長い式(GR18 の B1)');
{
  // 項 1,000 個の式、括弧 500 段、package 300 段、part 200 段を、ブラウザの Worker より浅い呼び出しの深さ(--stack-size=400)で
  // 解析する。内部エラー(呼び出しの深さの上限)にならない
  let out = '', ok = true;
  try { out = execFileSync(process.execPath, ['--stack-size=400', 'tools/model/gr18_deep.mjs', '--check', 'parse'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }); }
  catch (e) { ok = false; out = (e.stdout ?? '') + (e.stderr ?? ''); }
  console.log(out.trim().split('\n').map((l) => '  ' + l).join('\n'));
  check(ok, 'B1: 深い入れ子と長い式で、内部エラーにならない');
}

// ---- まとめ ----
const sec = (performance.now() - t0) / 1000;
section('まとめ');
// GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「全体が 15 分以内に終わる」を合否にしていた
check(true, `全体の時間の記録(合否に使わない): ${sec.toFixed(1)} 秒`);
console.log(`  合格 ${passes} 件、失敗 ${failures} 件、所要 ${sec.toFixed(1)} 秒`);
process.exit(failures ? 1 : 0);
