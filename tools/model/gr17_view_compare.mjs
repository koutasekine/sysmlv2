// 描画の全数比較(GR17 指示書 3.1 節・4 章の L の (5)、共通の基準「5 つのビューの描画が GR16 の終わりと変わらない」)。
// tools/view/gr15_compare.mjs の --before-src を元にし、前と後の両方を、作業ツリーとは別の場所に置いた src から読み込めるようにした。
//
// 使い方:
//   node tools/model/gr17_view_compare.mjs --before-src <前の src> [--after-src <後の src>] [--views general,…] [--out <JSON>] [--sample <例のファイル>]
//     --after-src を省くと、今の作業ツリーの src。--sample を省くと src/app/sample.sysml
//
// 入力は 309 ファイル(out/files309.txt)・例・記号ごとの最小の入力(tests/view/symbols*/manifest.json)。ビューごと(5 つのビューと
// グリッドビューの表)に、全候補を前と後で描き、候補ごとに SVG の文字列・構造(置く辺の違い param-*・proxy-* は同じ記号とする)・
// 図の質 (a)〜(h)・図の診断を比べる。候補の並びの違い・例外も数える。違いは 1 件ごとに書き出す。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const beforeSrc = arg('--before-src');
if (!beforeSrc) { console.error('--before-src <フォルダ> を指定する'); process.exit(2); }
const afterSrc = arg('--after-src') ?? path.join(ROOT, 'src');
const before = await import(pathToFileURL(path.resolve(beforeSrc, 'view/index.js')).href);
const after = await import(pathToFileURL(path.resolve(afterSrc, 'view/index.js')).href);
const { decodeUtf8 } = await import(pathToFileURL(path.resolve(afterSrc, 'parser/index.js')).href);
process.chdir(ROOT);
const outFile = arg('--out') ?? 'out/GR17/compare/view.json';
const samplePath = arg('--sample') ?? 'src/app/sample.sysml';
const onlyViews = arg('--views')?.split(',') ?? null;
const fxB = { ...before.FIG15 }, fxA = { ...after.FIG15 };

const VIEWS = [
  ['interconnection', 'renderInterconnection', 'candidates', 'tests/view/symbols'],
  ['state', 'renderStateTransition', 'stateCandidates', 'tests/view/symbols-state'],
  ['action', 'renderActionFlow', 'actionCandidates', 'tests/view/symbols-action'],
  ['sequence', 'renderSequence', 'sequenceCandidates', 'tests/view/symbols-sequence'],
  ['general', 'renderGeneral', 'generalCandidates', 'tests/view/symbols-general'],
  ['grid', 'renderTables', 'tableCandidates', null],
].filter(([v]) => !onlyViews || onlyViews.includes(v));
const qv = (q) => (q ? [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)] : []);
const norm = (s) => JSON.stringify(s && s.nodes ? { ...s, nodes: s.nodes.map((n) => ({ ...n, symbol: n.symbol.replace(/^param-[lrtb]$/, 'param').replace(/^proxy-[vh]$/, 'proxy') })) } : s);
const diagText = (r) => JSON.stringify((r.diagnostics ?? []).map((d) => [d.level, d.code, d.message, d.start, d.end]));

const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
const inputs = [...files.map((f) => ({ name: f, text: decodeUtf8(fs.readFileSync(f)), group: 'files' })), { name: `${samplePath}(例)`, text: fs.readFileSync(samplePath, 'utf8'), group: 'sample' }];
const res = { beforeSrc, afterSrc, views: {} };
let diffs = 0;
for (const [view, fn, cands, symDir] of VIEWS) {
  const v = { candidates: 0, same: 0, changed: [], diagChanged: [], listChanged: [], exceptions: [], wallSec: 0 };
  const t0 = performance.now();
  const opts = (fx) => (view === 'grid' ? undefined : { quality: true, keepDiagram: false, fig15: fx });
  const all = [...inputs];
  const addSym = (dir, pick) => { const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8')); for (const c of m.cases) if (pick(c)) all.push({ name: `${dir}/${c.file}`, text: fs.readFileSync(`${dir}/${c.file}`, 'utf8'), group: 'symbols', candidate: c.candidate ?? null }); };
  if (view === 'state') { addSym('tests/view/symbols-state', () => true); addSym('tests/view/symbols-action', (c) => c.view === 'state'); }
  else if (view === 'action') addSym('tests/view/symbols-action', (c) => c.view !== 'state');
  else if (symDir) addSym(symDir, () => true);
  for (const inp of all) {
    let pb, pa;
    try { pb = before.prepareView(inp.text, { fig15: fxB }); pa = after.prepareView(inp.text, { fig15: fxA }); }
    catch (e) { v.exceptions.push({ file: inp.name, error: String(e?.stack ?? e).slice(0, 400) }); continue; }
    if (pa.ok !== pb.ok) { v.exceptions.push({ file: inp.name, error: '受理・拒否が違う' }); continue; }
    if (!pa.ok) continue;
    const idsB = (pb[cands] ?? []).map((c) => c.id), idsA = (pa[cands] ?? []).map((c) => c.id);
    if (idsA.join('\n') !== idsB.join('\n')) v.listChanged.push({ file: inp.name, before: idsB, after: idsA });
    const pick = inp.candidate ? [inp.candidate] : idsA;
    for (const id of pick) {
      if (!idsB.includes(id)) continue;
      let rb, ra;
      try { rb = before[fn](pb, id, opts(fxB)); ra = after[fn](pa, id, opts(fxA)); }
      catch (e) { v.exceptions.push({ file: inp.name, candidate: id, error: String(e?.stack ?? e).slice(0, 600) }); continue; }
      v.candidates++;
      const sameSvg = rb.svg === ra.svg, sameSt = norm(rb.structure) === norm(ra.structure), sameQ = qv(rb.quality).join() === qv(ra.quality).join();
      const sameTables = view !== 'grid' || JSON.stringify(rb.tables) === JSON.stringify(ra.tables);
      if (diagText(rb) !== diagText(ra)) v.diagChanged.push({ file: inp.name, candidate: id, before: rb.diagnostics, after: ra.diagnostics });
      if (sameSvg && sameSt && sameQ && sameTables) { v.same++; continue; }
      v.changed.push({ file: inp.name, candidate: id, sameSvg, sameStructure: sameSt, sameQuality: sameQ, sameTables });
    }
  }
  v.wallSec = +((performance.now() - t0) / 1000).toFixed(1);
  res.views[view] = v;
  diffs += v.changed.length + v.listChanged.length + v.exceptions.length;
  console.log(`${view}: 候補 ${v.candidates}、同じ ${v.same}、変わった ${v.changed.length}、候補の並びが変わった ${v.listChanged.length}、例外 ${v.exceptions.length}、図の診断が変わった ${v.diagChanged.length}、${v.wallSec} 秒`);
}
res.differences = diffs;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
console.log(`違い(図・表・候補の並び・例外) ${diffs} 件 → ${outFile}`);
