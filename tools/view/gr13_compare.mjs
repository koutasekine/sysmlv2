// 表と保存のボタン(GR13)の、前と後の 5 つのビューの図の全数比較(GR13 指示書 7 章の 7、起動プロンプトの P1)。
//
// 使い方:
//   node tools/view/gr13_compare.mjs --before <前の src のフォルダ> [--out <出力の JSON>]
//     前の src は、作業ツリーとは別の場所に git archive などで展開した、GR12 の終わり(cf5a893)の src/(view/index.js を持つもの)
//     出力を省くと out/GR13/gr13_compare.json
//
// 309 ファイル(out/files309.txt)と「例を読み込む」の例の、5 つのビューの全候補を、前と後のコードで描き、候補ごとに
// SVG の文字列・構造・図の質 (a)〜(h)(tools/view/gr12_compare.mjs と同じ数え方)が同じかを比べる。GR13 では図の描画を変えないので、
// 違いは 1 件もあってはならない。
// 例は、前の例(前の src の app/sample.sysml)の候補ごとに、後の例(今の src/app/sample.sysml)の同じ id の候補と比べる。
// 後の例にだけある候補(GR13 で足した view '部品と要求の表')は added に書く(起動プロンプトの予定の red の 4)。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import * as after from '../../src/view/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const beforeDir = arg('--before');
if (!beforeDir) { console.error('--before <前の src のフォルダ> を指定する'); process.exit(2); }
const before = await import(pathToFileURL(path.resolve(beforeDir, 'view/index.js')).href);
const beforeSample = fs.readFileSync(path.resolve(beforeDir, 'app/sample.sysml'), 'utf8');
process.chdir(ROOT);
const outFile = arg('--out') ?? 'out/GR13/gr13_compare.json';

const VIEWS = [
  ['interconnection', 'renderInterconnection', 'candidates'],
  ['state', 'renderStateTransition', 'stateCandidates'],
  ['action', 'renderActionFlow', 'actionCandidates'],
  ['sequence', 'renderSequence', 'sequenceCandidates'],
  ['general', 'renderGeneral', 'generalCandidates'],
];
const QN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const qv = (q) => [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)];

const inputs = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean).map((f) => ({ name: f, textB: decodeUtf8(fs.readFileSync(f)), textA: null }));
inputs.push({ name: 'src/app/sample.sysml(例)', textB: beforeSample, textA: fs.readFileSync('src/app/sample.sysml', 'utf8'), sample: true });

const res = { views: {} };
let total = 0;
for (const [view, fn, cands] of VIEWS) {
  const v = { candidates: 0, same: 0, changed: [], listChanged: [], added: [], exceptions: [], before: Array(8).fill(0), after: Array(8).fill(0), ms: { before: 0, after: 0 } };
  const t0 = performance.now();
  for (const inp of inputs) {
    const pb = before.prepareView(inp.textB), pa = after.prepareView(inp.textA ?? inp.textB);
    if (pa.ok !== pb.ok) { v.exceptions.push({ file: inp.name, error: '受理・拒否が違う' }); continue; }
    if (!pa.ok) continue;
    const ca = pa[cands], cb = pb[cands];
    const idsB = cb.map((c) => c.id), idsA = ca.map((c) => c.id);
    if (idsA.join('\n') !== idsB.join('\n')) {
      const extra = idsA.filter((id) => !idsB.includes(id));
      const lost = idsB.filter((id) => !idsA.includes(id));
      // 例に足した view だけが増えたのなら added、それ以外の違いは listChanged
      if (inp.sample && !lost.length && idsA.filter((id) => idsB.includes(id)).join('\n') === idsB.join('\n')) v.added.push(...extra.map((id) => ({ file: inp.name, candidate: id })));
      else v.listChanged.push({ file: inp.name, before: idsB, after: idsA });
    }
    for (const c of cb) {
      if (!idsA.includes(c.id)) continue;
      v.candidates++;
      let rb, ra;
      try {
        let s = performance.now(); rb = before[fn](pb, c.id, { quality: true }); v.ms.before += performance.now() - s;
        s = performance.now(); ra = after[fn](pa, c.id, { quality: true }); v.ms.after += performance.now() - s;
      } catch (e) { v.exceptions.push({ file: inp.name, candidate: c.id, error: String(e?.stack ?? e).slice(0, 400) }); continue; }
      const qb = qv(rb.quality), qa = qv(ra.quality);
      qb.forEach((x, i) => { v.before[i] += x; v.after[i] += qa[i]; });
      const sameSvg = rb.svg === ra.svg;
      const sameSt = JSON.stringify(rb.structure) === JSON.stringify(ra.structure);
      const sameQ = qb.join() === qa.join();
      if (sameSvg && sameSt && sameQ) v.same++;
      else v.changed.push({ file: inp.name, candidate: c.id, sameSvg, sameStructure: sameSt, quality: sameQ ? null : { before: qb, after: qa } });
    }
  }
  v.ms.before = Math.round(v.ms.before); v.ms.after = Math.round(v.ms.after);
  v.wallSec = +((performance.now() - t0) / 1000).toFixed(1);
  res.views[view] = v;
  total += v.changed.length + v.listChanged.length + v.exceptions.length;
  const q = (a) => a.map((x, i) => `${QN[i]} ${x}`).join('・');
  console.log(`${view}: 候補 ${v.candidates}、同じ ${v.same}、変わった ${v.changed.length}、候補の並びが変わった ${v.listChanged.length}、例に足した候補 ${v.added.length}、例外 ${v.exceptions.length}、図の質 前 [${q(v.before)}] 後 [${q(v.after)}](${v.wallSec} 秒)`);
}
res.differences = total;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
console.log(`違い ${total} 件 → ${outFile}`);
process.exit(total ? 1 : 0);
