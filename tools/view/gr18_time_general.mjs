// GR18 P6: 一般ビューの 309 ファイルと例の全候補を 1 つずつ描き、1 候補の時間の最大を求める道具(設計書 7.7 節。プロセスの最初の
// 描画を除く。最初の描画の値も書く)。検査一式には入れない。
// 使い方: node tools/view/gr18_time_general.mjs
import fs from 'node:fs';
import { decodeUtf8 } from '../../src/parser/index.js';
import { prepareView, renderGeneral } from '../../src/view/index.js';
const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean).concat(['src/app/sample.sysml']);
let first = null, max = { ms: 0 }, n = 0;
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const t0 = performance.now();
  const p = prepareView(text);
  if (!p.ok) continue;
  for (const c of p.generalCandidates) {
    const t = performance.now();
    renderGeneral(p, c.id);
    const ms = performance.now() - t;
    if (first === null) { first = { file: f, candidate: c.id, ms: Math.round(performance.now() - t0) }; continue; }
    n++;
    if (ms > max.ms) max = { file: f, candidate: c.id, ms };
  }
}
console.log(JSON.stringify({ candidates: n + 1, first, max: { ...max, ms: Math.round(max.ms) } }));
