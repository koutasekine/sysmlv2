// 削除(GR16 の X)の、拒否する条件の読み方(src/edit/remove.js の X_IMPLICIT の T・R・P)ごとの件数を数える(GR16 P2)。
//
// 使い方:
//   node tools/edit/gr16_delete_variants.mjs [--interval 10] [--out out/GR16/logs/x_variants.json]
//
// 309 ファイル(out/files309.txt)と「例を読み込む」の例の、宣言した要素(src/edit/remove.js の declaredElements)を記述の順に並べ、
// --interval 個ごとに選んだ要素(例はすべて)で、本文どおりの読み(T・R・P をどれも切ったもの。P2b からは既定でない)で削除を行い(消した後の確かめまで)、結果を
// 消した・拒否・戻したに分ける。続けて、T・R・P を 1 つずつと全部を入れた読みで、消す前の確認の一覧(deletePlan)だけを作り、
// 拒否に変わるものを数える(拒否は確かめより前に決まるので、拒否に変わらないものの結果は既定の読みと同じ)。
// 戻したものは、理由と、どの読みで拒否に変わるかを一覧にする。

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import { analyze } from '../../src/edit/index.js';
import { deleteElement, deletePlan, declaredElements } from '../../src/edit/remove.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const INTERVAL = Number(arg('--interval', 10));
const OUT = arg('--out', 'out/GR16/logs/x_variants.json');
// GR16 P2b: X_IMPLICIT の既定がどれも入れたものになったので、比べの元(本文どおりの読み)と各読みを、3 つとも明示して渡す
const OFF = { T: false, R: false, P: false };
const VARIANTS = { T: { ...OFF, T: true }, R: { ...OFF, R: true }, P: { ...OFF, P: true }, TRP: { T: true, R: true, P: true } };
const t0 = performance.now();
const files = ['src/app/sample.sysml', ...fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean)];
const sum = {};
const fresh = () => ({ ops: 0, ok: 0, rejected: 0, reverted: 0, byCode: {}, variants: Object.fromEntries(Object.keys(VARIANTS).map(k => [k, { okToReject: 0, revertToReject: 0 }])), revertedRows: [], okToRejectRows: { T: [], R: [], P: [] } });
let k = 0;
for (const f of files) {
  const group = f === 'src/app/sample.sysml' ? 'sample' : 'files309';
  const s = (sum[group] ??= fresh());
  const text = decodeUtf8(fs.readFileSync(f));
  const analysis = analyze(text);
  if (!analysis.ok) continue;
  const lineOf = (at) => text.slice(0, at).split(/\r\n|\r|\n/).length;
  for (const el of declaredElements({ analysis, text })) {
    if (group === 'files309' && k++ % INTERVAL !== 0) continue;
    s.ops++;
    const r = deleteElement({ text, analysis, element: el }, { implicit: OFF });
    const state = r.ok ? 'ok' : r.reverted ? 'reverted' : 'rejected';
    if (r.ok) s.ok++; else if (r.reverted) s.reverted++; else { s.rejected++; s.byCode[r.code] = (s.byCode[r.code] ?? 0) + 1; }
    if (state === 'rejected') continue;
    const turned = [];
    for (const [v, implicit] of Object.entries(VARIANTS)) {
      const p = deletePlan({ analysis, element: el, text }, { implicit });
      if (p.ok) continue;
      s.variants[v][state === 'ok' ? 'okToReject' : 'revertToReject']++;
      turned.push(v);
      if (state === 'ok' && v.length === 1 && s.okToRejectRows[v].length < 20) s.okToRejectRows[v].push({ file: f, line: lineOf(el.start), kind: el.kind, name: el.name ?? null, details: p.details.slice(0, 3) });
    }
    if (state === 'reverted') s.revertedRows.push({ file: f, line: lineOf(el.start), kind: el.kind, name: el.name ?? null, reason: r.reason, details: r.details.slice(0, 3), rejectedBy: turned });
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ interval: INTERVAL, sum }, null, 1) + '\n');
for (const [g, s] of Object.entries(sum)) {
  console.log(`${g}: 操作 ${s.ops}、消した ${s.ok}、拒否 ${s.rejected} ${JSON.stringify(s.byCode)}、戻した ${s.reverted}`);
  for (const [v, x] of Object.entries(s.variants)) console.log(`  ${v} を入れると: 消した → 拒否 ${x.okToReject}、戻した → 拒否 ${x.revertToReject}`);
  for (const x of s.revertedRows) console.log(`  戻した: ${x.file} ${x.line} 行 ${x.kind} ${x.name}: ${x.reason} ${JSON.stringify(x.details)} 拒否に変わる読み ${JSON.stringify(x.rejectedBy)}`);
}
console.log(`${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
