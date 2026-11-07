// 名前解決の検査(GR3 指示書 8 章)。Node.js で実行する。
//
// 使い方:
//   node tests/model/run.mjs [--skip-pilot]
//
//   1. 内蔵する表の検査(tools/model/check_builtin.mjs)
//   2. 小さな例による名前解決の検査(P1 の規則と、裁定 D1〜D9・A〜E・P4 の裁定ごと)
//   3. 309 ファイルの名前解決(tools/model/resolve_files.mjs): 例外 0、解き直しの収束、参照の範囲、循環
//   4. 解く順序の検査(tools/model/order_check.mjs): 5 通りの順序で status と解決先が一致
//   5. パイロット実装との照合: PilotResolve を実行し(--skip-pilot なら out/pilot/resolve の既存の結果を使う)、
//      tools/model/compare_resolve.mjs の分類が、裁定で認められた分類だけであること(説明できない差 0)
//   6. D3 の印(GR15 v15.2 の指示書 3.3 節・4 章の D2、v15.3 の 3.1 節の D3):
//      D1 ASCII の検査(tools/model/library_members.mjs の asciiCheck): 標準ライブラリの型(Quantities and Units のものを除く)ごとに、
//         メンバーの名前と短い名前(上位の型から受け継ぐものを含む)がすべて空白を含まず ASCII の文字だけからなる(設計書 6.2 節の D3 の印の行)
//      D2 309 ファイルと例で、D3 の印の判定を GR14 の終わりのもの(src/model/resolve.js の D3_ASCII_NAMES を切ったもの)と今で比べ、
//         参照の状態と解決先が 1 件も変わらず、印の増えた参照が 0 件(減った件数を書く)
//      D3-1〜3 最小の入力: 空白を含む名前は印なし、明示の上位の型が未検査の名前空間を通り越すと印あり、ASCII だけの名前は印あり
//   7. GR18 の M1〜M8(GR18 指示書 2.1 節): 指摘ごとの最小の入力
//   8. 深い入れ子と長い式(GR18 の B1): tools/model/gr18_deep.mjs --check all を、浅い呼び出しの深さで流す
//   9. 複数のファイル(GR20 の M): ファイルの並びの入口(1 ファイル)と 1 つのテキストの入口の結果が同じ、最小の入力(tests/model/folders)の
//      期待、例題のフォルダと最小の入力で読み込む順を 5 通りに変えた結果の一致、パイロット実装(フォルダのファイルをまとめて読み込ませた
//      もの。--skip-pilot なら out/GR20/pilot の既存の結果)との照合
// 全体の時間は記録するだけで、合否に使わない(GR20 の Z1。GR19 までは 15 分を超えたら失敗としていた)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveText, resolveNames } from '../../src/model/index.js';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { asciiCheck } from '../../tools/model/library_members.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const skipPilot = process.argv.includes('--skip-pilot');
const t0 = performance.now();
let passes = 0, failures = 0;
const check = (ok, what) => { if (ok) passes++; else { failures++; console.log(`  失敗: ${what}`); } };
const section = (s) => console.log(`\n== ${s}`);
const run = (cmd, args, opts = {}) => {
  try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts }) }; }
  catch (e) { return { ok: false, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
};

// ---- 1. 内蔵する表
section('1. 内蔵する表の検査');
{
  const r = run('node', ['tools/model/check_builtin.mjs']);
  check(r.ok, 'tools/model/check_builtin.mjs が終了コード 0');
  console.log(r.out.split('\n').filter(l => /^==|合格|不合格|食い違い/.test(l)).map(l => '  ' + l.trim()).join('\n'));
}

// ---- 2. 小さな例
section('2. 小さな例による名前解決');
{
  // 参照の字句と位置の順(同じ字句が何度も出るときは n 番目)で参照を選び、解決先を「種類:名前」や「B:修飾名」で比べる
  const desc = (m, t) => !t ? null : t.builtin ? `B:${t.qname}` : t.virtual ? `~${m.namesOf(t.of).name}` : `${t.kind}:${m.namesOf(t).name}`;
  const cases = [
    { name: '所有と外側(KerML 8.2.3.5.4)', text: 'package P { part def A; part a : A; }', ref: ['A', 0], want: 'resolved', target: 'PartDefinition:A' },
    { name: '継承(KerML 8.3.3.1.10)', text: 'part def A { part x; } part def B :> A { part y :> x; }', ref: ['x', 0], want: 'resolved', target: 'PartUsage:x' },
    { name: 'import と可視性(KerML 8.3.2.4.6)', text: 'package Q { public part def X; private part def Y; } package P { private import Q::*; part a : X; part b : Y; }', ref: ['Y', 0], want: 'unchecked' },
    { name: 'import の public の要素', text: 'package Q { public part def X; private part def Y; } package P { private import Q::*; part a : X; }', ref: ['X', 0], want: 'resolved', target: 'PartDefinition:X' },
    { name: '短い名前(KerML 8.2.3.5.3)', text: 'package P { part def <S> Long; part a : S; }', ref: ['S', 0], want: 'resolved', target: 'PartDefinition:Long' },
    { name: '別名(KerML 8.2.3.4.1)', text: 'package P { part def Long; alias Al for Long; part b : Al; }', ref: ['Al', 0], want: 'resolved', target: 'PartDefinition:Long' },
    { name: '引用符付きの名前(KerML 8.2.2.3)', text: "package P { part def 'A B'; part a : P::'A B'; }", ref: ["P :: 'A B'", 0], want: 'resolved', target: 'PartDefinition:A B' },
    { name: '共役ポート(裁定 D7)', text: 'port def F; part p { port q : ~F; }', ref: ['F', 0], want: 'resolved', target: '~F' },
    { name: '特徴の連鎖(裁定 D4)', text: 'part def E { port p; } part def V { part e : E; } part v : V; part w { connect v.e.p to v.e.p; }', ref: ['p', 0], want: 'resolved', target: 'PortUsage:p' },
    { name: '再定義(裁定 D5)', text: 'part def A { attribute m; } part def B :> A { attribute :>> m; }', ref: ['m', 0], want: 'resolved', target: 'AttributeUsage:m' },
    { name: '再定義で上位の型が暗黙だけ(裁定 D5)', text: 'part def B { attribute :>> m; }', ref: ['m', 0], want: 'unchecked' },
    { name: 'start・done(GR3 P2 の表)', text: 'action def A { first start; then action s; then done; }', ref: ['start', 0], want: 'resolved', target: 'B:Actions::Action::start' },
    { name: '標準ビュー(GR3 P2 の表)', text: 'view v : StandardViewDefinitions::GeneralView;', ref: ['StandardViewDefinitions :: GeneralView', 0], want: 'resolved', target: 'B:StandardViewDefinitions::GeneralView' },
    // GR17 P8: 標準ライブラリの索引(src/model/resolve.js の LIBRARY_INDEX)を既定に入れたので、期待値を置き換えた(予定の red の 1)。
    // 前は want: 'unchecked'(ライブラリの名前は未検査)と、shadow: true(D3 の印)
    { name: 'ライブラリの名前(設計書 6 章。GR17 P8 から索引の要素に解決)', text: 'attribute x : ScalarValues::Real;', ref: ['ScalarValues :: Real', 0], want: 'resolved', target: 'B:ScalarValues::Real' },
    { name: 'D3 の印(GR17 P8 から、暗黙の特殊化の相手が索引でわかるので印なし)', text: 'part def E; part def V { part e : E; }', ref: ['E', 0], want: 'resolved', target: 'PartDefinition:E', shadow: false },
    { name: '曖昧(裁定 D2)', text: 'part def A { part x; } part def B { part x; } part def C :> A, B { part y :> x; }', ref: ['x', 0], want: 'ambiguous' },
    { name: '暗黙の再定義(引数。判断 C)', text: 'calc def F { in attribute a; } calc f : F { in attribute a; attribute q = a; }', ref: ['a', 0], want: 'resolved', target: 'AttributeUsage:a' },
    { name: '暗黙の再定義を上位の型に(P4 の裁定 2、U2)', text: 'part def I { attribute ok; } action def F { out item image : I; } action f : F { out item image; attribute z = image.ok; }', ref: ['ok', 0], want: 'resolved', target: 'AttributeUsage:ok' },
    { name: '呼び出しの型(P4 の裁定 2)', text: 'attribute def S { attribute samples; } attribute v = new S(samples = 1);', ref: ['samples', 0], want: 'resolved', target: 'AttributeUsage:samples' },
    { name: 'assign の対象の連鎖(P4 の裁定 1、U1)', text: 'part def C { attribute count; } action a { part counter : C; assign counter.count := 0; }', ref: ['count', 0], want: 'resolved', target: 'AttributeUsage:count' },
    { name: '遷移の受け取りの引数の名前と型(P4 の裁定)', text: 'attribute def Sig { attribute x; } state def S { state A; accept s : Sig do action { attribute y = s.x; } then A; }', ref: ['x', 0], want: 'resolved', target: 'AttributeUsage:x' },
    { name: '根の名前空間の import(裁定 D1)', text: 'package Q { part def X; } private import Q::*; part a : X;', ref: ['X', 0], want: 'resolved', target: 'PartDefinition:X' },
    { name: '$ の修飾(判断 E)', text: 'package P { part def A; } part b : $::P::A;', ref: ['$ :: P :: A', 0], want: 'resolved', target: 'PartDefinition:A' },
  ];
  for (const c of cases) {
    const r = resolveText(c.text);
    if (!r.ok) { check(false, `${c.name}: 構文エラー`); continue; }
    const recs = r.model.refs.filter(x => x.text === c.ref[0]);
    const rec = recs[c.ref[1]];
    if (!rec) { check(false, `${c.name}: 参照「${c.ref[0]}」がない`); continue; }
    const got = desc(r.model, rec.target);
    let ok = rec.status === c.want && (c.target === undefined || got === c.target) && (c.shadow === undefined || !!rec.shadow === c.shadow);
    // 範囲は原文の字句と一致する
    if (rec.start !== null) ok = ok && c.text.slice(rec.start, rec.end).replace(/\s+/g, '') === c.ref[0].replace(/\s+/g, '');
    check(ok, `${c.name}: ${rec.status} ${got}${rec.shadow ? '(印付き)' : ''}(期待 ${c.want} ${c.target ?? ''})`);
  }
  // 逆引き(指示書 6 章)
  {
    const text = "package P { part def 'Engine A' { port p; } part e : P::'Engine A'; part f : 'Engine A' { :>> p; } connect e.p to f.p; }";
    const { tree, model } = resolveText(text);
    const eng = tree.owned[0].related[0].owned[0].related[0];
    const p = eng.owned[0].related[0];
    check(model.referencesTo(eng).length === 2, `逆引き: 'Engine A' を指す区切りが 2(実際 ${model.referencesTo(eng).length})`);
    check(model.referencesTo(p).length === 2, `逆引き: p を指す区切りが 2(実際 ${model.referencesTo(p).length})`);
  }
  console.log(`  ${cases.length + 2} 件の例: ${failures === 0 ? '合格' : '失敗あり'}`);
}

// ---- 3. 309 ファイル
section('3. 309 ファイルの名前解決');
{
  const r = run('node', ['tools/model/resolve_files.mjs', '--out', 'out/model/resolve']);
  console.log('  ' + r.out.split('\n')[0]);
  const s = JSON.parse(fs.readFileSync('out/model/resolve/summary.json', 'utf8'));
  check(r.ok, 'resolve_files.mjs が終了コード 0');
  check(s.exceptions.length === 0, `例外 0(実際 ${s.exceptions.length})`);
  check(s.notConverged.length === 0, `解き直しが上限に達したファイル 0(実際 ${s.notConverged.length})`);
  check(s.rangeMissing === 0, `範囲が見つからない参照 0(実際 ${s.rangeMissing})`);
  check(s.cycle === 0, `循環で解けない参照 0(実際 ${s.cycle})`);
  check(s.kindMismatch === 0, `種類の不適合 0(実際 ${s.kindMismatch})`);
}

// ---- 4. 解く順序
section('4. 解く順序の検査(5 通り)');
{
  const r = run('node', ['tools/model/order_check.mjs', '--seeds', '1,2,3']);
  console.log('  ' + r.out.split('\n')[0]);
  check(r.ok && /mismatch=0 /.test(r.out), 'status と解決先が 5 通りの順序で一致');
}

// ---- 5. パイロット実装との照合
section('5. パイロット実装との照合');
{
  const JAR = 'vendor/pilot/org.omg.sysml.interactive/target/org.omg.sysml.interactive-0.58.0-SNAPSHOT-all.jar';
  if (!skipPilot) {
    const c = run('javac', ['-encoding', 'UTF-8', '-cp', JAR, '-d', 'out/pilot-runner/classes', 'tools/pilot-runner/src/PilotResolve.java']);
    check(c.ok, 'PilotResolve.java をコンパイルできる');
    fs.rmSync('out/pilot/resolve', { recursive: true, force: true });
    const p = run('java', ['-cp', `${JAR}:out/pilot-runner/classes`, 'PilotResolve', '--out', 'out/pilot/resolve', '--library', 'vendor/release-2026-03/sysml.library', '--base', 'vendor/release-2026-03', '@out/files309.txt']);
    const line = p.out.split('\n').find(l => l.startsWith('files=')) ?? '';
    console.log('  パイロット実装: ' + line);
    check(p.ok && /exceptions=0/.test(line), 'パイロット実装の実行で例外 0');
  } else console.log('  パイロット実装は実行せず、out/pilot/resolve の既存の結果を使う');
  const r = run('node', ['tools/model/compare_resolve.mjs']);
  check(r.ok, 'compare_resolve.mjs が終了コード 0');
  const s = JSON.parse(fs.readFileSync('out/compare/resolve/summary.json', 'utf8'));
  // 裁定で認められた分類(GR3 P4 の報告 3 回分と、その裁定)
  // GR17 P8: 索引を既定に入れたので、索引で増え、実測に出た分類 library-inherited・library-shadowed(このアプリは未検査。確かめられない
  // 当たり。reports/GR17/P2_L_*.md の 3.4 節。chain: 付きを含む)を加えた(予定の red の 1。前の期待値で流したログは out/GR17/logs/P8/before/model.log)
  const ACCEPTED = new Set(['match', 'expected', 'both-unresolved', 'library-name', 'library-specialized', 'builtin-in-library', 'library-implicit-local',
    'x-implicit-name', 'D2', 'D2-cascade', 'D3', 'D5', 'D5-name', 'D5-cascade', 'D9', 'U5-value-expr', 'pilot-unresolved', 'pilot-duplicate', 'x-pilot-missing',
    'library-inherited', 'library-shadowed']);
  const bad = Object.entries(s.classes).filter(([k]) => !ACCEPTED.has(k.replace(/^chain:/, '')));
  console.log('  分類: ' + JSON.stringify(s.classes));
  check(bad.length === 0, `説明できない差 0(認められていない分類: ${JSON.stringify(bad)})`);
}

// ---- 6. D3 の印(GR15 の D)
section('6. D3 の印(GR15 の D2)');
{
  const ac = asciiCheck();
  console.log(`  D1: 標準ライブラリの型 ${ac.types}(Quantities and Units の型 ${ac.excluded} を除く)、空白か ASCII 以外の文字を含む名前を持つ型 ${ac.bad.length}、求まらない上位の型を持つ型 ${ac.unresolved}(参考: Quantities and Units の型で空白か ASCII 以外の名前を持つもの ${ac.qu.length})`);
  check(ac.bad.length === 0, 'D1. 標準ライブラリの型(Quantities and Units を除く)のメンバーの名前が、すべて空白を含まず ASCII の文字だけからなる', JSON.stringify(ac.bad.slice(0, 5)));
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  files.push('src/app/sample.sysml');
  let refs = 0, changed = 0, added = 0, removed = 0, before = 0, after = 0;
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    const p = parse(text);
    if (!p.ok) continue;
    const m0 = resolveNames(p.tree, text, { d3Ascii: false }), m1 = resolveNames(p.tree, text, { d3Ascii: true });
    const key = (r) => `${r.node.start}|${r.node.end}|${r.prop}|${r.index}|${r.start}`;
    const B = new Map(m0.refs.map(r => [key(r), r]));
    const id = (t) => !t ? null : t.builtin ? `B:${t.qname}` : t.virtual ? `V:${t.of.start}` : `${t.kind}@${t.start}-${t.end}`;
    for (const r of m1.refs) {
      const q = B.get(key(r));
      refs++;
      if (!q || q.status !== r.status || id(q.target) !== id(r.target)) { changed++; continue; }
      if (q.shadow) before++;
      if (r.shadow) after++;
      if (!q.shadow && r.shadow) added++;
      if (q.shadow && !r.shadow) removed++;
    }
  }
  console.log(`  D2: 参照 ${refs} 件、状態か解決先の変わった参照 ${changed}、D3 の印 ${before} → ${after}(増えた ${added}、減った ${removed})`);
  check(changed === 0, 'D2. 参照の状態と解決先が 1 件も変わらない');
  check(added === 0, 'D2. D3 の印の増えた参照が 0 件');
  // D3 の最小の入力(GR15 v15.3 の指示書 3.1 節)。shadow は印の有無、why は印の理由。D3 を入れた判定(d3Scope: true)で確かめる
  // (D3_SCOPE の既定によらない)
  // GR17 P8: 索引を既定に入れたので、期待値を置き換えた(予定の red の 1。前の期待値で流したログは out/GR17/logs/P8/before/model.log)。
  // 前は、D3-1 は印なし・D3-2 は印付き(general)・D3-3 は印付き(inherit)で、どれも resolved、GR14 の終わりの判定(old)で印付き。
  // 索引ありでは、暗黙の特殊化の相手が索引でわかるので印が付かない。D3-2 は、ISQ::CylindricalPosition3dVector が索引の要素に解決し、
  // その型が短い名前 'ρ' の特徴(radialDistance)を持つので、利用者の名前空間から索引の型の特徴に当たった確かめられない当たりとして
  // 未検査(library-inherited)になる。status は状態、oldShadow は GR14 の終わりの判定の印の有無
  const d3Cases = [
    { name: 'D3-1 空白を含む名前', text: "part def 'Arduino Uno'; part def Board { part u : 'Arduino Uno'; }", ref: ["'Arduino Uno'", 0], shadow: false, status: 'resolved', oldShadow: false },
    { name: 'D3-2 明示の上位の型が未検査', text: "part def 'ρ'; part def Q { attribute v : ISQ::CylindricalPosition3dVector { attribute r : 'ρ'; } }", ref: ["'ρ'", 0], shadow: false, status: 'unchecked', oldShadow: false },
    { name: 'D3-3 ASCII だけで空白のない名前', text: 'part def Uno; part def Board { part u : Uno; }', ref: ['Uno', 0], shadow: false, status: 'resolved', oldShadow: false },
  ];
  for (const c of d3Cases) {
    const tree = parse(c.text).tree;
    if (!tree) { check(false, `${c.name}: 構文エラー`); continue; }
    const rec = resolveNames(tree, c.text, { d3Ascii: true, d3Scope: true }).refs.filter(x => x.text === c.ref[0])[c.ref[1]];
    if (!rec) { check(false, `${c.name}: 参照「${c.ref[0]}」がない`); continue; }
    const whys = rec.shadow ? [...new Set(rec.shadow.map(x => x.why))].sort() : [];
    const old = resolveNames(tree, c.text, { d3Ascii: false }).refs.filter(x => x.text === c.ref[0])[c.ref[1]];
    const ok = rec.status === (c.status ?? 'resolved') && !!rec.shadow === c.shadow && (c.why === undefined || whys.includes(c.why)) && !!old?.shadow === (c.oldShadow ?? true);
    check(ok, `${c.name}: ${rec.status}${rec.shadow ? `(印付き ${whys.join('+')})` : '(印なし)'}、GR14 の終わりの判定で${old?.shadow ? '印付き' : '印なし'}(期待 ${c.shadow ? '印付き' : '印なし'})`);
  }
}

// ---- 7. GR18 の名前解決と索引の直し(GR18 指示書 2.1 節の M1〜M8)
section('7. GR18 の名前解決と索引の直し(M1〜M8)');
{
  const pick = (text, f, opts) => { const tree = parse(text).tree; const m = resolveNames(tree, text, opts); return { m, rec: m.refs.find(f) }; };
  const at = (text, s) => text.indexOf(s);
  // M1: 所有する Membership と区別できない取り込みは、見える解決と import で取り込む列挙から除く
  {
    const t1 = 'package A { public import B::*; part def X; } package B { part def X; } part z : A::X;';
    const { rec } = pick(t1, x => x.text.replace(/\s/g, '') === 'A::X');
    check(rec?.status === 'resolved' && rec.target.start === at(t1, 'part def X'), `M1: A::X が A::X に解決する(${rec?.status} ${rec?.target?.start})`);
    const t2 = 'package A { public import B::*; part def X; } package B { part def X; } package C { private import A::*; part z : X; }';
    const r2 = pick(t2, x => x.text === 'X' && x.node.kind === 'FeatureTyping').rec;
    check(r2?.status === 'resolved' && r2.target.start === at(t2, 'part def X'), `M1: C から指す X が A::X に解決する(${r2?.status} ${r2?.target?.start})`);
  }
  // M2: 索引の修飾名の重複が 0 件。2 つの名前が曖昧でなく解決する
  {
    const idx = JSON.parse(fs.readFileSync('grammar/library_index.json', 'utf8')).elements;
    const cnt = new Map();
    for (const e of idx) if (e.q) cnt.set(e.q, (cnt.get(e.q) ?? 0) + 1);
    const dup = [...cnt].filter(([, v]) => v > 1);
    check(dup.length === 0, `M2: 索引の修飾名の重複が 0 件(実際 ${dup.length}: ${dup.slice(0, 3).map(x => x[0]).join(', ')})`);
    for (const q of ['Actions::AcceptAction::payload', 'Performances::trueEvaluations::result']) {
      const r = pick(`part p : ${q};`, () => true).rec;
      check(r?.status === 'resolved', `M2: ${q} が曖昧でなく解決する(${r?.status})`);
    }
  }
  // M4: as・istype・@ の型の被演算子と、filter の @M に、演算子を理由にした D3 の印(general)が付かない
  for (const [label, text, name] of [
    ['as', 'package P { part def T; part x; attribute a = x as T; }', 'T'],
    ['istype', 'package P { part def T; part x; attribute a = x istype T; }', 'T'],
    ['@', 'package P { part def T; part x; attribute a = x @ T; }', 'T'],
    ['Q::*[@M]', 'package P { metadata def M; package Q { part y; } package R { private import Q::*[@M]; } }', 'M'],
  ]) {
    const r = pick(text, x => x.text === name).rec;
    const whys = r?.shadow ? [...new Set(r.shadow.map(x => x.why))] : [];
    const full = label !== 'Q::*[@M]';
    check(r?.status === 'resolved' && !whys.includes('general') && (!full || !r.shadow), `M4: ${label} の ${name} が解決し、演算子を理由にした印がない(${r?.status} 印 ${whys.join('+') || 'なし'})`);
  }
  // M5: $:: で、根の名前空間の曖昧を大域の検索で上書きしない
  {
    const r = pick('package P; package P; part x : $::P;', x => x.text.includes('$')).rec;
    check(r?.status === 'ambiguous', `M5: $::P が曖昧(${r?.status})`);
  }
  // M6: 別名の短い名前が参照と同じ字句のとき、for の参照の範囲が for の後ろの字句
  {
    const t = 'package P { part def B; package S { alias <B> C for B; } }';
    const r = pick(t, x => x.text === 'B').rec;
    check(r?.start === 52 && r?.end === 53 && r.status === 'resolved', `M6: for B の範囲が [52,53](実際 [${r?.start},${r?.end}])`);
  }
  // M7: 大域で 2 つ以上の根の名前空間に当たる名前は曖昧(今の索引では起きないので、検査用の口 opts.testGlobal で足す)
  {
    const fake = (n) => ({ elem: { kind: 'Package', name: 'Zed', qname: 'Zed', builtin: true, lib: true, owned: [], related: [], refs: {}, attrs: {}, start: 0, end: 0, libId: -n }, names: ['Zed', null], vis: 'public' });
    const two = pick('part x : Zed;', x => x.text === 'Zed', { testGlobal: [fake(1), fake(2)] }).rec;
    const one = pick('part x : Zed;', x => x.text === 'Zed', { testGlobal: [fake(1)] }).rec;
    check(two?.status === 'ambiguous' && one?.status === 'resolved', `M7: 大域で 2 つに当たると曖昧、1 つなら解決(${two?.status}・${one?.status})`);
  }
  // M8: import の符号の再帰の印(*)と protected(r)を分けて読む
  {
    const { decodeLibrary } = await import('../../src/model/library.js');
    const { conforms } = await import('../../src/model/resolve.js');
    const read = (code) => decodeLibrary({ names: 'A;B', kinds: 'Package', elements: `0,,0;0,,1,,,,,${code}`, implicit: [] }, conforms).roots[1].owned[0];
    const a = read('nr0'), b = read('n*r0'), c = read('n*u0');
    check(a.attrs.visibility === 'protected' && !a.attrs.isRecursive && a.refs.importedNamespace?.[0] === 'A', `M8: 'nr0' は protected で再帰でない import(${JSON.stringify(a.attrs)})`);
    check(b.attrs.visibility === 'protected' && b.attrs.isRecursive === true && c.attrs.visibility === 'public' && c.attrs.isRecursive === true, 'M8: 再帰の印 * を読む');
  }
}

// ---- 8. 深い入れ子と長い式(GR18 指示書 2.5 節の B1) ----
section('8. 深い入れ子と長い式(GR18 の B1)');
{
  // 項 1,000 個の式、括弧 500 段、package 300 段、part 200 段を、ブラウザの Worker より浅い呼び出しの深さ(--stack-size=400)で
  // 解析・名前解決・意味エラーの検査・6 つのビューの描画を行う。内部エラー(呼び出しの深さの上限)にならない
  let out = '', ok = true;
  try { out = execFileSync(process.execPath, ['--stack-size=400', 'tools/model/gr18_deep.mjs', '--check', 'all'], { encoding: 'utf8', maxBuffer: 1 << 24 }); }
  catch (e) { ok = false; out = (e.stdout ?? '') + (e.stderr ?? ''); }
  console.log(out.trim().split('\n').map((l) => '  ' + l).join('\n'));
  check(ok, 'B1: 深い入れ子と長い式で、内部エラーにならない');
}

// ---- 9. 複数のファイル(GR20 の M。GR20 指示書 3.2 節・4 章、設計書 6.2 節の「複数のファイル」と「$::A」の行)
section('9. 複数のファイル(GR20 の M)');
{
  const { analyzeFiles, sortPaths } = await import('../../src/model/index.js');
  const { checkSemantics } = await import('../../src/model/semantic.js');
  const { checkWarnings } = await import('../../src/model/warn.js');
  // 9-1. ファイルの並びの入口(1 ファイル)が、1 つのテキストの入口と同じ結果(参照・意味エラー・警告)を返す。全数の比べは
  //      tools/model/gr20_single_dump.mjs(報告に書く)
  {
    let same = 0, all = 0;
    for (const f of ['src/app/sample.sysml', 'src/app/sample_intro.sysml', ...fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean).filter((_, i) => i % 40 === 0)]) {
      const text = f.startsWith('src/') ? fs.readFileSync(f, 'utf8') : decodeUtf8(fs.readFileSync(f));
      const p = parse(text);
      if (!p.ok) continue;
      all++;
      const m = resolveNames(p.tree, text);
      const a = analyzeFiles([{ path: 'x.sysml', text }]);
      const d = (refs) => refs.map((r) => `${r.start}-${r.end}|${r.status}|${r.target ? `${r.target.kind}@${r.target.start}-${r.target.end}:${r.target.qname ?? ''}` : ''}|${r.reason ?? ''}`).join('\n');
      const sx = (l) => l.map((x) => `${x.item}@${x.start}-${x.end} ${x.line}:${x.col} ${x.message}`).join('\n');
      if (a.single && a.ok && d(a.model.refs) === d(m.refs) && sx(a.semantic) === sx(checkSemantics(p.tree, m, text)) && sx(a.warnings) === sx(checkWarnings(p.tree, m, text))) same++;
    }
    check(all > 0 && same === all, `9-1. ファイルの並びの入口(1 ファイル)と 1 つのテキストの入口の結果が同じ(${same} / ${all} ファイル)`);
  }
  // 9-2. 最小の入力(tests/model/folders。manifest.json の期待)
  const D = 'tests/model/folders/';
  const man = JSON.parse(fs.readFileSync(D + 'manifest.json', 'utf8'));
  const dirs = fs.readdirSync(D).filter((x) => fs.statSync(D + x).isDirectory()).sort();
  check(dirs.length === man.cases.length && dirs.every((x) => man.cases.some((c) => c.dir === x)), `9-2. 最小の入力のフォルダと manifest.json の一覧が一致(${dirs.length}・${man.cases.length})`);
  let okCases = 0;
  for (const c of man.cases) {
    const rels = [];
    (function walk(sub) { for (const e of fs.readdirSync(D + c.dir + (sub ? '/' + sub : ''), { withFileTypes: true })) { const r = sub ? `${sub}/${e.name}` : e.name; if (e.isDirectory()) walk(r); else if (r.endsWith('.sysml')) rels.push(r); } })('');
    const files = sortPaths(rels).map((r) => ({ path: r, text: fs.readFileSync(`${D}${c.dir}/${r}`, 'utf8') }));
    const a = analyzeFiles(files);
    const q = (e) => { if (!e) return null; if (e.lib) return `L:${e.qname}`; if (e.builtin) return `B:${e.qname}`; const s = []; for (let x = e; x && x !== a.tree; x = a.model.parentNamespaceOf(x)) s.unshift(a.model.namesOf(x).name); return `${files[a.fileAt(e.start)]?.path}#${s.join('::')}`; };
    const got = a.ok ? a.model.refs.map((r) => [files[a.fileAt(r.start)].path, r.text.replace(/\s+/g, ''), r.status, r.status === 'ambiguous' ? r.candidates.map(q).sort() : q(r.target)]) : null;
    const want = c.refs.map(([f, t, st, tg]) => [f, t, st, Array.isArray(tg) ? [...tg].sort() : tg]);
    const diag = (l) => l.map((x) => [files[x.file].path, `${x.line}:${x.col}`, x.item]);
    const ok = !!got && JSON.stringify(got) === JSON.stringify(want) && JSON.stringify(diag(a.semantic)) === JSON.stringify(c.semantic) && JSON.stringify(diag(a.warnings)) === JSON.stringify(c.warnings);
    if (ok) okCases++;
    check(ok, `9-2. ${c.dir}(${c.what}): 期待 ${JSON.stringify({ refs: want, semantic: c.semantic, warnings: c.warnings })}、結果 ${JSON.stringify(got && { refs: got, semantic: diag(a.semantic), warnings: diag(a.warnings) })}`);
  }
  console.log(`  9-2. 最小の入力 ${man.cases.length} 件のうち ${okCases} 件が期待どおり`);
  // 9-3. フォルダの一覧と、読み込む順(相対パスの順・逆順・種を固定した乱順 3 つ)
  {
    const l = run('node', ['tools/model/gr20_folders.mjs', 'list', '--out', 'out/GR20/folders.json']);
    console.log('  ' + l.out.trim());
    check(l.ok, '9-3. フォルダの一覧(tools/model/gr20_folders.mjs list)が終了コード 0');
    const r = run('node', ['tools/model/order_check.mjs', '--folders', 'out/GR20/folders.json', '--seeds', '1,2,3', '--out', 'out/GR20/order_folders.json']);
    console.log('  ' + r.out.split('\n')[0]);
    check(r.ok && /mismatch=0 semanticMismatch=0 warningMismatch=0 /.test(r.out), '9-3. 例題のフォルダと最小の入力で、読み込む順を 5 通りに変えても、参照の状態と解決先・意味エラー・警告が一致');
  }
  // 9-4. パイロット実装との照合(フォルダのファイルをまとめて読み込ませたもの)
  {
    if (!skipPilot) {
      const p = run('node', ['tools/model/gr20_folders.mjs', 'pilot', '--folders', 'out/GR20/folders.json', '--out', 'out/GR20/pilot']);
      console.log('  パイロット実装: ' + p.out.trim().split('\n').at(-1));
      check(p.ok, '9-4. パイロット実装をフォルダごとに動かして、失敗 0');
    } else console.log('  パイロット実装は実行せず、out/GR20/pilot の既存の結果を使う');
    const ACCEPTED = new Set(['match', 'expected', 'both-unresolved', 'library-name', 'library-specialized', 'builtin-in-library', 'library-implicit-local',
      'x-implicit-name', 'D2', 'D2-cascade', 'D3', 'D5', 'D5-name', 'D5-cascade', 'D9', 'U5-value-expr', 'pilot-unresolved', 'pilot-duplicate', 'x-pilot-missing',
      'library-inherited', 'library-shadowed']);
    for (const g of ['cases', 'examples']) {
      const r = run('node', ['tools/model/compare_resolve.mjs', '--folders', 'out/GR20/folders.json', '--group', g, '--pilot', 'out/GR20/pilot/resolve', '--out', `out/GR20/compare/resolve_${g}`]);
      check(r.ok, `9-4. compare_resolve.mjs --folders(${g})が終了コード 0`);
      const s = r.ok ? JSON.parse(fs.readFileSync(`out/GR20/compare/resolve_${g}/summary.json`, 'utf8')) : { classes: {}, folders: 0, crossRefs: 0, crossUnmatched: -1 };
      const bad = Object.entries(s.classes).filter(([k]) => !ACCEPTED.has(k.replace(/^chain:/, '')));
      console.log(`  9-4. ${g}: フォルダ ${s.folders}、ファイル ${s.files}、ファイルをまたいで解決した参照 ${s.crossRefs}、読み替えられないほかのファイルの解決先 ${s.crossUnmatched}、分類 ${JSON.stringify(s.classes)}`);
      // 最小の入力: 認められた分類のほかは、GR20 P2 で調べて記録した 2 件だけ: c07 のほかのファイルの根の private の要素(パイロット実装は
      // 解決する)と、c12 の標準ライブラリと同じ名前のパッケージの修飾名(このアプリは曖昧、パイロット実装は解決なし)。GR20 では裁定を待つ差
      // (unexplained)として数えた。GR21 の K で、設計書 2.5 節の既知の差の分類(K-private-root・K-library-root-name。
      // tools/model/compare_resolve.mjs)にした。期待の件数(2 件)は変えない。例題のフォルダの baseType の 2 件(K-basetype)は、件数を報告に書く
      if (g === 'cases') {
        const un = [];
        for (const f of fs.readdirSync(`out/GR20/compare/resolve_${g}/files`)) for (const x of JSON.parse(fs.readFileSync(`out/GR20/compare/resolve_${g}/files/${f}`, 'utf8'))) if (!ACCEPTED.has(String(x.class).replace(/^chain:/, ''))) un.push(`${f.replace(/\.json$/, '')}|${x.text}|${x.class}`);
        const known = ['cases_c07_private_root_b.sysml|Hidden|K-private-root', 'cases_c12_library_name_b.sysml|Parts :: Wheel|K-library-root-name'];
        check(JSON.stringify(un.sort()) === JSON.stringify(known) && s.crossUnmatched === 0, `9-4. 最小の入力: 認められた分類のほかは、設計書 2.5 節の既知の差として分類した 2 件だけ(${JSON.stringify(un)})`);
      }
      else check(s.folders > 0 && s.crossUnmatched >= 0, `9-4. 例題のフォルダの照合を書き出した(認められていない分類 ${bad.reduce((x, [, v]) => x + v, 0)} 件は報告で調べる。うち設計書 2.5 節の既知の差 ${bad.filter(([k]) => /^K-/.test(k)).reduce((x, [, v]) => x + v, 0)} 件: ${JSON.stringify(bad)})`);
    }
  }
}

// ---- まとめ
const sec = (performance.now() - t0) / 1000;
section('まとめ');
// GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「15 分以内に終わる」を合否にしていた
check(true, `全体の時間の記録(合否に使わない): ${sec.toFixed(1)} 秒`);
console.log(`  合格 ${passes} 件、失敗 ${failures} 件、所要 ${sec.toFixed(1)} 秒`);
process.exit(failures ? 1 : 0);
