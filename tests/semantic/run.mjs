// 意味エラーの検査(GR5 指示書 8 章)。Node.js で実行する。
//
// 使い方:
//   node tests/semantic/run.mjs [--skip-pilot]
//
//   1. 最小の入力(tests/semantic/cases/)が、manifest.json の期待どおりの結果になる(項目と、範囲の始まりの行・列)
//   2. 309 ファイル(out/files309.txt)で、検査が例外なく終わる(tools/semantic/run_files.mjs)
//   3. パイロット実装との照合(tools/semantic/compare.mjs): 309 ファイルと最小の入力で、誤検出 0、説明できない 0。
//      パイロット実装の検証(PilotValidate)を 309 ファイルと最小の入力について、解決先(PilotResolve)を最小の入力について
//      実行する。--skip-pilot なら out/pilot/validate・validate_cases・resolve_cases の既存の結果を使う。
//      309 ファイルの解決先は、名前解決の検査(tests/model/run.mjs)が作る out/pilot/resolve を使う
//   4. 「例を読み込む」の例(src/app/sample.sysml)の意味エラーが 0 件
//   5. 警告(GR19 の W1・W2。src/model/warn.js): 最小の入力(tests/semantic/warn/)が manifest.json の期待どおり(期待に message が
//      あれば文も。GR19 の P5)、W1 の表が
//      本文から抜き出し直したものと同じ(tools/model/extract_w1.mjs --check)、項目をすべて切ると警告 0、2 つの例
//      (sample.sysml・sample_intro.sysml)の警告が 0 件、入門用の例の意味エラー・未検査・曖昧が 0 件
//   6. 複数のファイル(GR20 の M): フォルダごとのパイロット実装の検証の結果(tests/model/run.mjs の 9 が作る out/GR20/pilot)との照合
//      (tools/model/gr20_folder_semantic.mjs)。最小の入力は誤検出 0・説明できない 0。例題のフォルダは件数を書き、報告で調べる
// 全体の時間は記録するだけで、合否に使わない(GR20 の Z1。GR19 までは 15 分を超えたら失敗としていた)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';
import { checkWarnings } from '../../src/model/warn.js';

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
const CASES = 'tests/semantic/cases/';
const check1 = (text) => { const p = parse(text); if (!p.ok) return null; return checkSemantics(p.tree, resolveNames(p.tree, text), text); };

// ---- 1. 最小の入力
section('1. 最小の入力(manifest.json の期待)');
{
  const m = JSON.parse(fs.readFileSync(CASES + 'manifest.json', 'utf8'));
  const files = fs.readdirSync(CASES).filter(f => f.endsWith('.sysml')).sort();
  check(files.length === m.cases.length && files.every(f => m.cases.some(c => c.file === f)), `入力と manifest.json の一覧が一致(入力 ${files.length}、manifest ${m.cases.length})`);
  let ok = 0;
  for (const c of m.cases) {
    const text = fs.readFileSync(CASES + c.file, 'utf8');
    const got = check1(text);
    if (!got) { check(false, `${c.file} が構文上正しい`); continue; }
    const key = (x) => `${x.item}@${x.line}:${x.col}`;
    const g = got.map(key).sort().join(','), e = c.expect.map(key).sort().join(',');
    const textOk = c.expect.every(x => got.some(y => key(y) === key(x) && text.slice(y.start, y.end) === x.text));
    if (g === e && textOk) ok++;
    check(g === e && textOk, `${c.file}: 期待 [${e}]、結果 [${g}]`);
  }
  console.log(`  ${m.cases.length} 件の入力: ${ok} 件が期待どおり`);
}

// ---- 2. 309 ファイル
section('2. 309 ファイルの検査');
{
  const r = run('node', ['tools/semantic/run_files.mjs']);
  console.log('  ' + (r.out.split('\n').find(l => l.startsWith('files=')) ?? r.out.slice(0, 500)));
  check(r.ok, 'tools/semantic/run_files.mjs が終了コード 0');
  const s = JSON.parse(fs.readFileSync('out/semantic/summary.json', 'utf8'));
  check(s.files === 309, `309 ファイルを調べた(${s.files})`);
  check(s.exceptions === 0, `例外 0(${s.exceptions}: ${JSON.stringify(s.exceptionFiles)})`);
}

// ---- 3. パイロット実装との照合
section('3. パイロット実装との照合');
{
  const JAR = 'vendor/pilot/org.omg.sysml.interactive/target/org.omg.sysml.interactive-0.58.0-SNAPSHOT-all.jar';
  const LIB = 'vendor/release-2026-03/sysml.library';
  fs.writeFileSync('out/semantic_cases_list.txt', fs.readdirSync(CASES).filter(f => f.endsWith('.sysml')).sort().map(f => CASES + f).join('\n') + '\n');
  if (!skipPilot) {
    const c = run('javac', ['-encoding', 'UTF-8', '-cp', JAR, '-d', 'out/pilot-runner/classes', 'tools/pilot-runner/src/PilotValidate.java', 'tools/pilot-runner/src/PilotResolve.java']);
    check(c.ok, 'PilotValidate.java・PilotResolve.java をコンパイルできる');
    const jobs = [
      ['PilotValidate', 'out/pilot/validate', 'vendor/release-2026-03', '@out/files309.txt'],
      ['PilotValidate', 'out/pilot/validate_cases', 'tests/semantic/cases', '@out/semantic_cases_list.txt'],
      ['PilotResolve', 'out/pilot/resolve_cases', 'tests/semantic/cases', '@out/semantic_cases_list.txt'],
    ];
    for (const [cls, out, base, list] of jobs) {
      fs.rmSync(out, { recursive: true, force: true });
      const p = run('java', ['-cp', `${JAR}:out/pilot-runner/classes`, cls, '--out', out, '--library', LIB, '--base', base, list]);
      const line = p.out.split('\n').find(l => l.startsWith('files=')) ?? '';
      console.log(`  ${cls} → ${out}: ${line}`);
      check(p.ok && /exceptions=0/.test(line), `${cls}(${out})の実行で例外 0`);
    }
  } else console.log('  パイロット実装は実行せず、out/pilot/validate・validate_cases・resolve_cases の既存の結果を使う');
  for (const set of ['files309', 'cases']) {
    const r = run('node', ['tools/semantic/compare.mjs', '--set', set]);
    console.log(r.out.split('\n').filter(Boolean).map(l => '  ' + l).join('\n'));
    check(r.ok, `compare.mjs --set ${set} が終了コード 0`);
    const s = JSON.parse(fs.readFileSync(`out/compare/semantic/${set}/summary.json`, 'utf8'));
    check(s.exceptions === 0, `${set}: 照合で例外 0`);
    check(s.falsePositive === 0, `${set}: 誤検出 0(${s.falsePositive}: ${JSON.stringify(s.examples.falsePositive.slice(0, 3))})`);
    check(s.unexplained === 0, `${set}: 説明できない 0(${s.unexplained}: ${JSON.stringify(s.examples.unexplained.slice(0, 3))})`);
  }
}

// ---- 4. 例
section('4. 「例を読み込む」の例');
{
  const r = check1(fs.readFileSync('src/app/sample.sysml', 'utf8'));
  check(r !== null, '例が構文上正しい');
  check(r && r.length === 0, `例の意味エラーが 0 件(${r ? r.map(e => `${e.item} ${e.line}:${e.col}`).join(', ') : '—'})`);
}

// ---- 5. 警告(GR19 の W1・W2)
section('5. 警告(W1・W2)');
{
  const W = 'tests/semantic/warn/';
  const warn1 = (text, opts) => { const p = parse(text); if (!p.ok) return null; const model = resolveNames(p.tree, text); return { w: checkWarnings(p.tree, model, text, opts), sem: checkSemantics(p.tree, model, text), model }; };
  const m = JSON.parse(fs.readFileSync(W + 'manifest.json', 'utf8'));
  const files = fs.readdirSync(W).filter(f => f.endsWith('.sysml')).sort();
  check(files.length === m.cases.length && files.every(f => m.cases.some(c => c.file === f)), `入力と manifest.json の一覧が一致(入力 ${files.length}、manifest ${m.cases.length})`);
  let ok = 0, offAll = 0;
  for (const c of m.cases) {
    const text = fs.readFileSync(W + c.file, 'utf8');
    const r = warn1(text);
    if (!r) { check(false, `${c.file} が構文上正しい`); continue; }
    const key = (x) => `${x.item}@${x.line}:${x.col}`;
    const g = r.w.map(key).sort().join(','), e = c.expect.map(key).sort().join(',');
    // 範囲の原文と、期待に message があれば文も比べる(GR19 の P5。W1・W2 の文)
    const textOk = c.expect.every(x => r.w.some(y => key(y) === key(x) && text.slice(y.start, y.end) === x.text && (x.message == null || y.message === x.message)));
    if (g === e && textOk) ok++;
    check(g === e && textOk, `警告 ${c.file}: 期待 [${e}]、結果 [${g}]${textOk ? '' : `(範囲の原文か文が違う: ${r.w.map(y => `${JSON.stringify(text.slice(y.start, y.end))} ${y.message}`).join(' / ')})`}`);
    offAll += warn1(text, { items: { W1: false, W2: false } }).w.length;
  }
  console.log(`  ${m.cases.length} 件の入力: ${ok} 件が期待どおり`);
  check(offAll === 0, `項目をすべて切ると、最小の入力の警告が 0 件(${offAll})`);
  const x = run('node', ['tools/model/extract_w1.mjs', '--check']);
  console.log('  ' + x.out.trim());
  check(x.ok, 'W1 の表(grammar/w1_usage_typing.json・src/model/w1_table.js)が本文から抜き出し直したものと同じ');
  for (const f of ['src/app/sample.sysml', 'src/app/sample_intro.sysml']) {
    const r = warn1(fs.readFileSync(f, 'utf8'));
    check(r && r.w.length === 0, `${f} の警告が 0 件(${r ? r.w.map(e => `${e.item} ${e.line}:${e.col}`).join(', ') : '—'})`);
    if (f.endsWith('intro.sysml')) {
      const un = r ? r.model.refs.filter(x => x.status !== 'resolved').length : -1;
      check(r && r.sem.length === 0 && un === 0, `${f} の意味エラー・未検査・曖昧が 0 件(意味エラー ${r?.sem.length}、未検査・曖昧 ${un})`);
    }
  }
}

// ---- 6. 複数のファイル(GR20 の M。GR20 指示書 4 章の M(例題)・M(最小の入力))
section('6. 複数のファイル(GR20 の M)');
{
  // フォルダの一覧とパイロット実装の結果は、名前解決の検査(tests/model/run.mjs の 9)が作る out/GR20/folders.json・out/GR20/pilot を使う
  if (!fs.existsSync('out/GR20/folders.json')) run('node', ['tools/model/gr20_folders.mjs', 'list', '--out', 'out/GR20/folders.json']);
  for (const g of ['cases', 'examples']) {
    const r = run('node', ['tools/model/gr20_folder_semantic.mjs', '--folders', 'out/GR20/folders.json', '--group', g, '--pilot', 'out/GR20/pilot', '--out', `out/GR20/compare/semantic_${g}`]);
    console.log(r.out.split('\n').filter(Boolean).map((l) => '  ' + l).join('\n'));
    check(r.ok, `gr20_folder_semantic.mjs --group ${g} が終了コード 0`);
    const s = r.ok ? JSON.parse(fs.readFileSync(`out/GR20/compare/semantic_${g}/summary.json`, 'utf8')) : { falsePositive: -1, unexplained: -1, folders: 0 };
    // 最小の入力は、誤検出 0・説明できない 0。例題のフォルダの差は、件数と原因を報告に書く(GR20 起動プロンプトの STOP 条件の注)
    if (g === 'cases') check(s.falsePositive === 0 && s.unexplained === 0, `${g}: 誤検出 0・説明できない 0(${s.falsePositive}・${s.unexplained}: ${JSON.stringify([...(s.examples?.falsePositive ?? []), ...(s.examples?.unexplained ?? [])].slice(0, 3))})`);
    else check(s.folders > 0, `${g}: 照合を書き出した(誤検出 ${s.falsePositive}・説明できない ${s.unexplained} は報告で調べる)`);
  }
}

// ---- まとめ
const sec = (performance.now() - t0) / 1000;
section('まとめ');
// GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「15 分以内に終わる」を合否にしていた
check(true, `全体の時間の記録(合否に使わない): ${sec.toFixed(1)} 秒`);
console.log(`  合格 ${passes} 件、失敗 ${failures} 件、所要 ${sec.toFixed(1)} 秒`);
process.exit(failures ? 1 : 0);
