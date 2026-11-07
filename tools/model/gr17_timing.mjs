// 標準ライブラリの索引を入れる前と後の、名前解決の時間と索引を読み込む時間を測る(GR17 指示書 4 章の L の (1))。
//
// 使い方:
//   node tools/model/gr17_timing.mjs [--repeat 5] [--json 出力.json]
//
// 1. 索引を読み込む時間: 新しいプロセスの中で、索引を使う最初の名前解決(空のテキスト)の時間から、索引を使わない最初の名前解決の時間を
//    引いたもの(src/model/library.js の makeLibrary と、内蔵する表との結びつけ)。--repeat 回、別のプロセスで測る
// 2. 解析の時間: 例(src/app/sample.sysml)、生徒の規模の入力(下の STUDENT)、309 ファイルについて、構文解析と名前解決の時間を、
//    索引なしとありで測る(同じプロセスで、索引の読み込みと 1 回目を除いた --repeat 回の中央値)。309 ファイルは 1 回ずつの合計と最大
// どれも Node.js での値(ブラウザの開くまでの時間は、ブラウザでの確認表の手順で測る)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const repeat = +opt('--repeat', 5);

if (args[0] === '--load-once') {
  const { parse } = await import('../../src/parser/index.js');
  const { resolveNames } = await import('../../src/model/resolve.js');
  const tree = parse('').tree;
  const t0 = performance.now(); resolveNames(tree, '', { libraryIndex: false }); const off = performance.now() - t0;
  const t1 = performance.now(); resolveNames(tree, '', { libraryIndex: true }); const on = performance.now() - t1;
  console.log(JSON.stringify({ off, on }));
  process.exit(0);
}

const { parse, decodeUtf8 } = await import('../../src/parser/index.js');
const { resolveNames } = await import('../../src/model/resolve.js');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = { repeat, load: [], inputs: {}, files309: {} };
for (let k = 0; k < repeat; k++) out.load.push(JSON.parse(execFileSync('node', [new URL(import.meta.url).pathname, '--load-once'], { encoding: 'utf8' })));
const loadMs = out.load.map(x => x.on - Math.min(x.off, x.on));
console.log(`索引を読み込む時間(索引を使う最初の名前解決 − 使わない最初の名前解決): 中央値 ${med(loadMs).toFixed(1)} ms(${loadMs.map(x => x.toFixed(1)).join('・')})`);

// 生徒の規模の入力: 部品の定義と使用が約 30 個、標準ライブラリの型と単位を使う
const STUDENT = ['package Student {', '  private import ScalarValues::*;', '  private import SI::*;', '  private import ISQ::*;',
  ...Array.from({ length: 15 }, (_, i) => `  part def 'ボード${i}' { attribute '温度${i}' : ThermodynamicTemperatureValue; attribute '時間${i}' : Real; port 'ピン${i}' : 'ピン型'; }`),
  "  port def 'ピン型' { in attribute '値' : Real; }",
  "  part 'システム' {", ...Array.from({ length: 15 }, (_, i) => `    part 'ボード${i}使用' : 'ボード${i}';`), '  }', '}'].join('\n');
const inputs = { sample: fs.readFileSync('src/app/sample.sysml', 'utf8'), student: STUDENT };
// 読み込みを済ませる
resolveNames(parse('').tree, '', { libraryIndex: true });
for (const [name, text] of Object.entries(inputs)) {
  const r = {};
  for (const lib of [false, true]) {
    const ps = [], rs = [];
    for (let k = 0; k <= repeat; k++) {
      const t0 = performance.now(); const p = parse(text); const t1 = performance.now();
      if (!p.ok) throw new Error(`${name}: 構文エラー`);
      const m = resolveNames(p.tree, text, { libraryIndex: lib }); const t2 = performance.now();
      if (k) { ps.push(t1 - t0); rs.push(t2 - t1); }
      if (k === repeat) r[lib ? 'on' : 'off'] = { parseMs: +med(ps).toFixed(1), resolveMs: +med(rs).toFixed(1), unchecked: m.refs.filter(x => x.status === 'unchecked').length, refs: m.refs.length };
    }
  }
  out.inputs[name] = r;
  console.log(`${name}: 構文解析 ${r.off.parseMs} ms、名前解決 索引なし ${r.off.resolveMs} ms・あり ${r.on.resolveMs} ms(参照 ${r.on.refs}、未検査 ${r.off.unchecked} → ${r.on.unchecked})`);
}
const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
for (const lib of [false, true]) {
  let total = 0, max = { ms: 0, file: null };
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    const p = parse(text);
    if (!p.ok) continue;
    const t0 = performance.now(); resolveNames(p.tree, text, { libraryIndex: lib }); const ms = performance.now() - t0;
    total += ms;
    if (ms > max.ms) max = { ms, file: f };
  }
  out.files309[lib ? 'on' : 'off'] = { totalMs: Math.round(total), maxMs: Math.round(max.ms), maxFile: max.file };
  console.log(`309 ファイルの名前解決 索引${lib ? 'あり' : 'なし'}: 合計 ${(total / 1000).toFixed(1)} 秒、最大 ${Math.round(max.ms)} ms(${max.file})`);
}
const j = opt('--json', null);
if (j) { fs.mkdirSync(path.dirname(j), { recursive: true }); fs.writeFileSync(j, JSON.stringify(out, null, 1) + '\n'); }
