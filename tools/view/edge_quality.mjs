// 線の質の件数を数える(GR4 P2 の 2 回目の裁定 2)。
//
// 使い方:
//   node tools/view/edge_quality.mjs [名前]    # → out/view/edge_quality_<名前>.json(名前を省くと latest)
//   node tools/view/edge_quality.mjs --state [名前]   # 状態遷移ビュー(GR6)→ out/view/edge_quality_state_<名前>.json
//     記号ごとの入力は tests/view/symbols-state/manifest.json、例は src/app/sample.sysml の状態遷移ビューの最初の候補
//   node tools/view/edge_quality.mjs --action [名前]  # アクションフロービュー(GR7)→ out/view/edge_quality_action_<名前>.json
//     記号ごとの入力は tests/view/symbols-action/manifest.json
//   node tools/view/edge_quality.mjs --sequence [名前] # シーケンスビュー(GR9)→ out/view/edge_quality_sequence_<名前>.json
//     記号ごとの入力は tests/view/symbols-sequence/manifest.json
//   node tools/view/edge_quality.mjs --general [名前]  # 一般ビュー(GR10)→ out/view/edge_quality_general_<名前>.json
//   (g) 線どうしの交差(edgeCrossings。GR10 P2)も、5 つのビューで数える
//     記号ごとの入力は tests/view/symbols-general/manifest.json
//
// 記号ごとの入力(tests/view/symbols/manifest.json の cases)と、309 ファイルの全候補を描き、
// 線が箱・注の記号を横切る件数(crossings)と、2 本の線が同じ区間で重なる件数(overlaps)を数える。
// 数え方は src/view/quality.js の edgeQuality(線を引く処理と同じ「通ってよい箱」の判定を使う)。
// (f) 広い間隔で長く並ぶ線(parallels。GR8)も数える。
// (h) 線の余分な曲がり(bends の h の和。GR11 指示書 4 章)と、あわせて数えるもの(曲がりの合計 Σk、まっすぐの線、4 回以上曲がる線、
// 線の長さと始点・終点の縦横の距離の比の平均と最大)も、5 つのビューで数える(bendTotals)。

import fs from 'node:fs';
import path from 'node:path';
import { prepareView, renderInterconnection as renderInterconnectionView, renderStateTransition, renderActionFlow, renderSequence, renderGeneral } from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';
import { outerBlanks } from '../../src/view/layout.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

// GR14 で足した数え方(GR14 指示書 3 章・6 章)。描いた図(keepDiagram)から数える
//   iLen・iLong  (i) 注釈の線(annotation-link)の長さの合計と、200 px を超える本数
//   actorBottom  行為者(棒人間)の下の辺に端が着く線の数(A)
//   blankOver    外側の箱(アクションフロービューの最上位の箱と、状態遷移ビューの本体の図の箱)のうち、右の空白が左の余白を、
//                下の空白が上の余白(と ... ・印のラベルの分)を 1 px より多く超えるもの(F。領域によらない最小の大きさの箱は除く)
const segLen = (pts) => (pts ?? []).reduce((a, p, k) => (k ? a + Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) : 0), 0);
export function gr14Counts(d) {
  let iLen = 0, iLong = 0, actorBottom = 0, blankOver = 0;
  for (const e of d.edges) {
    if (e.symbol === 'annotation-link') { const l = segLen(e.points); iLen += l; if (l > 200) iLong++; }
    for (const [id, pt] of [[e.from, e.points?.[0]], [e.to, e.points?.[e.points.length - 1]]]) {
      const o = d.objects.get(id);
      if (o?.type === 'dparam' && o.symbol === 'actor' && pt && pt.y >= o.y + o.h - 1 && pt.x >= o.x - 1 && pt.x <= o.x + o.w + 1) actorBottom++;
    }
  }
  for (const b of outerBlanks(d)) {
    const overR = !b.plain && b.right > b.padL + 1 && !(b.minW != null && b.w <= b.minW + 1);
    const overB = b.bottom > b.padT + b.extraB + 1 && !(b.minH != null && b.h <= b.minH + 1);
    if (overR || overB) blankOver++;
  }
  return { iLen, iLong, actorBottom, blankOver };
}
// GR15 の R の検査(GR15 指示書 4 章): 行為者(棒人間)に着く線の端のうち、棒人間の図形(頭と体の外接矩形。src/view/layout.js の
// stickOf と同じ値)を 2 px 広げたものの外にあるものの数(actorOutside)と、行為者に着く線の端の数(actorEnds)。
// R2 の検査(GR15 v15.2 の指示書 3.2 節): 左右から着く線の端(最後の区間が横向きのもの)の数(actorSide)と、そのうち腕の線の端
// (手の先。中心から左右 11、y + 21。src/view/svg.js の dparamSvg)から 2 px より離れたものの数(actorOffHand)
export function gr15Counts(d) {
  let actorEnds = 0, actorOutside = 0, actorSide = 0, actorOffHand = 0;
  for (const e of d.edges) {
    const P = e.points ?? [];
    for (const [id, pt, q] of [[e.from, P[0], P[1]], [e.to, P[P.length - 1], P[P.length - 2]]]) {
      const o = d.objects.get(id);
      if (!(o?.type === 'dparam' && o.symbol === 'actor') || !pt) continue;
      actorEnds++;
      const cx = o.x + o.w / 2;
      if (pt.x < cx - 11 - 2 || pt.x > cx + 11 + 2 || pt.y < o.y + 1 - 2 || pt.y > o.y + 48 + 2) actorOutside++;
      if (q && q.y === pt.y && q.x !== pt.x) {
        actorSide++;
        if (Math.min(Math.hypot(pt.x - (cx - 11), pt.y - (o.y + 21)), Math.hypot(pt.x - (cx + 11), pt.y - (o.y + 21))) > 2) actorOffHand++;
      }
    }
  }
  return { actorEnds, actorOutside, actorSide, actorOffHand };
}
const addG14 = (acc, d) => { const g = gr14Counts(d); for (const k of Object.keys(g)) acc[k] = (acc[k] ?? 0) + g[k]; return g; };
// gr15Counts を acc.g15 に足し込み、図形の外の端がある候補を acc.g15.items に入れる
const addG15 = (acc, d, file, candidate) => { const g = gr15Counts(d); acc.g15 ??= { actorEnds: 0, actorOutside: 0, actorSide: 0, actorOffHand: 0, items: [] }; for (const k of ['actorEnds', 'actorOutside', 'actorSide', 'actorOffHand']) acc.g15[k] += g[k]; if (g.actorOutside || g.actorOffHand) acc.g15.items.push({ file, candidate, ...g }); };

// 線ごとの bends(src/view/quality.js の bendStats)を、(h) とあわせて数えるものに足し込む
export function bendTotals(acc, bends) {
  acc ??= { h: 0, sumK: 0, edges: 0, straight: 0, k4: 0, ratioSum: 0, ratioN: 0, ratioMax: 0 };
  for (const b of bends ?? []) {
    acc.h += b.h; acc.sumK += b.k; acc.edges++;
    if (b.k === 0) acc.straight++;
    if (b.k >= 4) acc.k4++;
    if (b.man > 0) { const r = b.len / b.man; acc.ratioSum += r; acc.ratioN++; if (r > acc.ratioMax) acc.ratioMax = r; }
  }
  return acc;
}
export const bendText = (t) => (t ? `(h) ${t.h}、Σk ${t.sumK}、まっすぐ ${t.straight}、4 回以上 ${t.k4}(線 ${t.edges})、長さの比 平均 ${(t.ratioN ? t.ratioSum / t.ratioN : 0).toFixed(3)}・最大 ${t.ratioMax.toFixed(2)}` : '(h) 0');

export function measure({ view = 'interconnection' } = {}) {
  const st = view === 'state', ac = view === 'action', sq = view === 'sequence', ge = view === 'general';
  const renderInterconnection = st ? renderStateTransition : ac ? renderActionFlow : sq ? renderSequence : ge ? renderGeneral : renderInterconnectionView;
  const symDir = st ? 'tests/view/symbols-state' : ac ? 'tests/view/symbols-action' : sq ? 'tests/view/symbols-sequence' : ge ? 'tests/view/symbols-general' : 'tests/view/symbols';
  const res = { symbols: { cases: 0, crossings: 0, overlaps: 0, sharedEnds: 0, texts: 0, uturns: 0, items: [] }, files: { candidates: 0, crossings: 0, overlaps: 0, sharedEnds: 0, texts: 0, uturns: 0, withProblems: 0, items: [] } };
  const manifest = fs.existsSync(path.join(symDir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(symDir, 'manifest.json'), 'utf8')) : { cases: [] };
  // 「例を読み込む」の例も数える
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  { const p = prepareView(sample); const r = renderInterconnection(p, null, { quality: true, keepDiagram: true }); const q = r.quality ?? { crossings: [], overlaps: [], sharedEnds: [], textOverlaps: [], uturns: [], arrowheads: [], edgeCrossings: [] };
    if (r.diagram) res.sampleG14 = gr14Counts(r.diagram);
    res.sample = { arrows: (q.arrowheads ?? []).length, parallels: (q.parallels ?? []).length, edgeCrossings: (q.edgeCrossings ?? []).length, crossings: q.crossings.length, overlaps: q.overlaps.length, sharedEnds: q.sharedEnds.length, texts: q.textOverlaps.length, uturns: q.uturns.length, detail: q, candidate: r.candidate?.id ?? null, bends: bendTotals(null, q.bends) }; }
  for (const c of manifest.cases) {
    const p = prepareView(fs.readFileSync(path.join(symDir, c.file), 'utf8'));
    // アクションフロービューの入力のうち view が 'state' のもの(状態遷移ビューの本体を図にする形)は、状態遷移ビューで描く
    const r = (ac && c.view === 'state' ? renderStateTransition : renderInterconnection)(p, c.candidate ?? null, { quality: true, keepDiagram: true });
    res.symbols.cases++;
    addG14(res.symbols, r.diagram);
    addG15(res.symbols, r.diagram, c.file, r.candidate?.id ?? null);
    res.symbols.crossings += r.quality.crossings.length;
    res.symbols.overlaps += r.quality.overlaps.length;
    res.symbols.sharedEnds += r.quality.sharedEnds.length;
    res.symbols.texts += r.quality.textOverlaps.length;
    res.symbols.uturns += r.quality.uturns.length;
    res.symbols.arrows = (res.symbols.arrows ?? 0) + r.quality.arrowheads.length;
    res.symbols.parallels = (res.symbols.parallels ?? 0) + r.quality.parallels.length;
    res.symbols.edgeCrossings = (res.symbols.edgeCrossings ?? 0) + r.quality.edgeCrossings.length;
    res.symbols.bends = bendTotals(res.symbols.bends, r.quality.bends);
    if (r.quality.arrowheads.length) (res.symbols.arrowItems ??= []).push({ file: c.file, arrowheads: r.quality.arrowheads });
    if (r.quality.crossings.length || r.quality.overlaps.length || r.quality.sharedEnds.length || r.quality.textOverlaps.length || r.quality.uturns.length) res.symbols.items.push({ file: c.file, candidate: r.candidate.id, ...r.quality });
  }
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  for (const f of files) {
    const p = prepareView(decodeUtf8(fs.readFileSync(f)));
    if (!p.ok) continue;
    for (const c of (st ? p.stateCandidates : ac ? p.actionCandidates : sq ? p.sequenceCandidates : ge ? p.generalCandidates : p.candidates)) {
      const r = renderInterconnection(p, c.id, { quality: true, keepDiagram: true });
      res.files.candidates++;
      { const g = addG14(res.files, r.diagram); if (g.actorBottom || g.blankOver) (res.files.g14Items ??= []).push({ file: f, candidate: c.id, ...g }); }
      addG15(res.files, r.diagram, f, c.id);
      res.files.crossings += r.quality.crossings.length;
      res.files.overlaps += r.quality.overlaps.length;
      res.files.sharedEnds += r.quality.sharedEnds.length;
      res.files.texts += r.quality.textOverlaps.length;
      res.files.uturns += r.quality.uturns.length;
      res.files.arrows = (res.files.arrows ?? 0) + r.quality.arrowheads.length;
      res.files.parallels = (res.files.parallels ?? 0) + r.quality.parallels.length;
      res.files.edgeCrossings = (res.files.edgeCrossings ?? 0) + r.quality.edgeCrossings.length;
      res.files.bends = bendTotals(res.files.bends, r.quality.bends);
      { const h = r.quality.bends.reduce((a, b) => a + b.h, 0); if (h) (res.files.bendItems ??= []).push({ file: f, candidate: c.id, h }); }
      if (r.quality.edgeCrossings.length) (res.files.edgeCrossingItems ??= []).push({ file: f, candidate: c.id, n: r.quality.edgeCrossings.length });
      if (r.quality.parallels.length) (res.files.parallelItems ??= []).push({ file: f, candidate: c.id, parallels: r.quality.parallels });
      if (r.quality.arrowheads.length) (res.files.arrowItems ??= []).push({ file: f, candidate: c.id, arrowheads: r.quality.arrowheads });
      if (r.quality.crossings.length || r.quality.overlaps.length || r.quality.sharedEnds.length || r.quality.textOverlaps.length || r.quality.uturns.length) {
        res.files.withProblems++;
        res.files.items.push({ file: f, candidate: c.id, crossings: r.quality.crossings.length, overlaps: r.quality.overlaps.length, sharedEnds: r.quality.sharedEnds.length, texts: r.quality.textOverlaps.length, uturns: r.quality.uturns.length, examples: { uturns: r.quality.uturns.slice(0, 3), crossings: r.quality.crossings.slice(0, 3), overlaps: r.quality.overlaps.slice(0, 3), sharedEnds: r.quality.sharedEnds.slice(0, 3), texts: r.quality.textOverlaps.slice(0, 3) } });
      }
    }
  }
  res.files.bendItems?.sort((a, b) => b.h - a.h || (a.file < b.file ? -1 : a.file > b.file ? 1 : a.candidate < b.candidate ? -1 : 1));
  res.files.items.sort((a, b) => (b.crossings + b.overlaps + b.sharedEnds + b.texts + b.uturns) - (a.crossings + a.overlaps + a.sharedEnds + a.texts + a.uturns) || (a.file < b.file ? -1 : 1));
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const st = process.argv.includes('--state'), ac = process.argv.includes('--action'), sq = process.argv.includes('--sequence'), ge = process.argv.includes('--general');
  const name = process.argv.slice(2).filter((a) => a !== '--state' && a !== '--action' && a !== '--sequence' && a !== '--general')[0] ?? 'latest';
  const r = measure({ view: st ? 'state' : ac ? 'action' : sq ? 'sequence' : ge ? 'general' : 'interconnection' });
  fs.mkdirSync('out/view', { recursive: true });
  fs.writeFileSync(`out/view/edge_quality_${st ? 'state_' : ac ? 'action_' : sq ? 'sequence_' : ge ? 'general_' : ''}${name}.json`, JSON.stringify(r, null, 1) + '\n');
  console.log(`例(src/app/sample.sysml): 横切り ${r.sample.crossings}、重なり ${r.sample.overlaps}、文字の重なり ${r.sample.texts}、コの字 ${r.sample.uturns} ${JSON.stringify({ c: r.sample.detail.crossings, u: r.sample.detail.uturns })}`);
  console.log(`記号ごとの入力 ${r.symbols.cases} 件: 横切り ${r.symbols.crossings}、重なり ${r.symbols.overlaps}、同じ点に着く端(参考) ${r.symbols.sharedEnds}、文字の重なり ${r.symbols.texts}、コの字 ${r.symbols.uturns}、矢じりの重なり ${r.symbols.arrows ?? 0}`);
  for (const it of r.symbols.items) console.log(`  ${it.file}: 横切り ${it.crossings.map((x) => `${x.edge}×${x.object}`).join(' ')} 重なり ${it.overlaps.map((x) => `${x.a}=${x.b}`).join(' ')} 同じ点 ${(it.sharedEnds ?? []).map((x) => `${x.a}=${x.b}@${x.object}`).join(' ')} 文字 ${(it.textOverlaps ?? []).map((x) => `[${x.text}]×[${x.with}]`).join(' ')} コの字 ${(it.uturns ?? []).map((x) => x.edge).join(' ')}`);
  console.log(`309 ファイル 候補 ${r.files.candidates} 件: 横切り ${r.files.crossings}、重なり ${r.files.overlaps}、同じ点に着く端(参考) ${r.files.sharedEnds}、文字の重なり ${r.files.texts}、コの字 ${r.files.uturns}、矢じりの重なり ${r.files.arrows ?? 0}、広い間隔で長く並ぶ線 (f) ${r.files.parallels ?? 0}、線どうしの交差 (g) ${r.files.edgeCrossings ?? 0}(問題のある候補 ${r.files.withProblems})`);
  console.log(`(g) 線どうしの交差: 例 ${r.sample.edgeCrossings}、記号ごとの入力 ${r.symbols.edgeCrossings ?? 0}、309 ファイル ${r.files.edgeCrossings ?? 0}`);
  console.log(`(h) 線の余分な曲がり: 例 ${bendText(r.sample.bends)}`);
  console.log(`  記号ごとの入力 ${bendText(r.symbols.bends)}`);
  console.log(`  309 ファイル ${bendText(r.files.bends)}`);
  for (const it of (r.files.bendItems ?? []).slice(0, 10)) console.log(`  (h) ${it.h}: ${it.file} [${it.candidate}]`);
  console.log(`例の矢じりの重なり ${r.sample.arrows}`);
  for (const it of r.files.arrowItems ?? []) console.log(`  矢じり: ${it.file} [${it.candidate}] ${it.arrowheads.map((x) => `${x.a}=${x.b}`).join(' ')}`);
  for (const it of r.symbols.arrowItems ?? []) console.log(`  矢じり(記号の入力): ${it.file} ${it.arrowheads.map((x) => `${x.a}=${x.b}`).join(' ')}`);
  for (const it of r.files.items.slice(0, 8)) console.log(`  ${it.file} [${it.candidate}] 横切り ${it.crossings} 重なり ${it.overlaps} 同じ点 ${it.sharedEnds} 文字 ${it.texts} コの字 ${it.uturns}`);
}
