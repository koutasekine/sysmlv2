// パーサーの実測(GR2 指示書 7 章)。Node.js で測る。
//
// 使い方:
//   node tools/compare/measure.mjs --runs <回数> --out <結果.json> <ファイル または @一覧>...
//   例: /usr/bin/time -v node tools/compare/measure.mjs --runs 3 --out out/gr2/P4_measure.json @out/files309.txt
//
// 測るもの:
//   - src/parser/ の各ファイルの大きさ(バイト)と、gzip(最高圧縮)にしたときの大きさ
//   - パーサーの準備(文法の表の展開)の時間
//   - ファイルごとの解析(字句・認識・導出・構文木の作成。parse(text) 全体)の時間。ファイルは先にすべて読み込んでおき、
//     読み込みの時間は含めない。--runs 回くり返し、1 回目と、各回の合計の中央値を書く
//   - 解析のあいだの、ヒープの使用量(heapUsed)と常駐メモリ(rss)の最大値(ファイルごとの解析の直後に測った値)
// プロセス全体の最大常駐メモリは、/usr/bin/time -v で別に測る。

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createParser, decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
let runs = 3, out = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runs') runs = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i].startsWith('@')) files.push(...fs.readFileSync(args[i].slice(1), 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
  else files.push(args[i]);
}

// 大きさ
const srcDir = path.join(ROOT, 'src/parser');
const sizes = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort().map(f => {
  const b = fs.readFileSync(path.join(srcDir, f));
  return { file: `src/parser/${f}`, bytes: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length };
});
const total = { bytes: sizes.reduce((a, s) => a + s.bytes, 0), gzip: zlib.gzipSync(Buffer.concat(sizes.map(s => fs.readFileSync(path.join(ROOT, s.file)))), { level: 9 }).length };

// 時間とメモリ
const texts = files.map(f => ({ file: f, text: decodeUtf8(fs.readFileSync(f)) }));
const t0 = performance.now();
const parser = createParser();
const setupMs = performance.now() - t0;
let heapMax = 0, rssMax = 0;
const runTotals = [];
let first = null;
for (let k = 0; k < runs; k++) {
  const per = [];
  let sum = 0;
  for (const { file, text } of texts) {
    const s = performance.now();
    const r = parser.parse(text);
    const ms = performance.now() - s;
    sum += ms;
    per.push({ file, ms, ok: r.ok });
    const m = process.memoryUsage();
    if (m.heapUsed > heapMax) heapMax = m.heapUsed;
    if (m.rss > rssMax) rssMax = m.rss;
  }
  runTotals.push(sum);
  if (k === 0) first = per;
}
const sorted = [...runTotals].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const slowest = first.reduce((a, b) => (b.ms > a.ms ? b : a));
const result = {
  files: texts.length, runs, setupMs, sizes, total,
  parseMsTotalFirst: runTotals[0], parseMsTotalRuns: runTotals, parseMsTotalMedian: median,
  slowestFirst: slowest, heapUsedMaxBytes: heapMax, rssMaxBytes: rssMax,
  accepted: first.filter(x => x.ok).length,
};
if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 1)); }
const r1 = (x) => Math.round(x * 10) / 10;
console.log(`src/parser: ${total.bytes} バイト(gzip ${total.gzip})`);
for (const s of sizes) console.log(`  ${s.file}: ${s.bytes}(gzip ${s.gzip})`);
console.log(`準備 ${r1(setupMs)} ms、解析の合計 1 回目 ${r1(runTotals[0])} ms、各回 ${runTotals.map(r1).join(' / ')} ms(中央値 ${r1(median)})`);
console.log(`最も遅いファイル(1 回目): ${slowest.file} ${r1(slowest.ms)} ms`);
console.log(`ヒープ使用量の最大 ${Math.round(heapMax / 1024)} KB、常駐メモリの最大 ${Math.round(rssMax / 1024)} KB、受理 ${result.accepted} / ${texts.length}`);
