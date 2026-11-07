// 一般ビューの分野ごとの専用の記号(GR12)の、入れる前と後の全数比較(GR12 指示書 5 章)。
//
// 使い方:
//   node tools/view/gr12_compare.mjs --before <前の src のフォルダ> [--out <出力の JSON>]
//     前の src は、作業ツリーとは別の場所に git archive などで展開した、入れる前の src/(view/index.js を持つもの)
//     出力を省くと out/GR12/p2/gr12_compare.json
//
// 309 ファイル(out/files309.txt)の、5 つのビューの全候補を、前と後のコードで描き、候補ごとに次を比べる。
//   - SVG の文字列と構造(同じか)
//   - 図の質 (a)〜(h)(tests/view/run.mjs・tools/view/edge_quality.mjs と同じ数え方。(h) は bends の h の和)
// 一般ビューの、描画が変わった候補では、描く要素の集合を原文の範囲で照らし合わせ、違いが GR12 P1 の裁定どおりのもの
// (区画の行が引数・節点・線に移った、箱が線に移ってその箱の合成の線・型の関係の線・区画の行がなくなった、view の箱の expose が
// import の線から expose の線に変わった)だけかを確かめる。裁定どおりと説明できない違いは unexplained に書く。
// ほかの 4 つのビューは、SVG・構造・図の質が前と同じであることを確かめる。

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
process.chdir(ROOT);
const outFile = arg('--out') ?? 'out/GR12/p2/gr12_compare.json';

const VIEWS = [
  ['interconnection', 'renderInterconnection', 'candidates'],
  ['state', 'renderStateTransition', 'stateCandidates'],
  ['action', 'renderActionFlow', 'actionCandidates'],
  ['sequence', 'renderSequence', 'sequenceCandidates'],
  ['general', 'renderGeneral', 'generalCandidates'],
];
const GR12_EDGES = new Set(['allocate-relationship', 'assume-edge', 'assert-edge', 'frame-relationship', 'satisfy-edge', 'require-edge', 'verify-relationship',
  'include-use-case-relationship', 'expose-r', 'toplevel-expose-r', 'recursive-expose-r']);
const DPARAMS = new Set(['subject', 'actor', 'stakeholder']);
const QN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const qv = (q) => [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)];
const key = (s) => (s ? `${s[0]}-${s[1]}` : 'null');

// 構造の要素: 節点(区画の行を含む)と線を、原文の範囲で引けるようにする
function items(st) {
  const nodes = [], lines = [], edges = [];
  for (const n of st.nodes) {
    if (n.symbol === 'element-inside-textual-compartment') continue; // 線の端の行(区画の行と同じもの)
    nodes.push(n);
    for (const c of n.compartments ?? []) for (const l of c.lines) lines.push({ box: n.id, comp: c.symbol, text: l });
  }
  for (const e of st.edges) edges.push(e);
  return { nodes, lines, edges };
}
const within = (s, r) => s && r && s[0] >= r[0] && s[1] <= r[1];

// 一般ビューの前と後の構造の違いを、裁定どおりのものと説明できないものに分ける
function explain(stB, stA) {
  const B = items(stB), A = items(stA);
  const out = { lineToParam: 0, lineToDparam: 0, lineToEdge: 0, boxToEdge: 0, droppedEdges: 0, droppedLines: 0, exposeFromImport: 0, newLinks: 0, newClines: 0, unexplained: [] };
  const aNodeBySrc = new Map(A.nodes.map((n) => [key(n.src), n]));
  const aEdgeBySrc = new Map();
  for (const e of A.edges) { const k = key(e.src); if (!aEdgeBySrc.has(k)) aEdgeBySrc.set(k, []); aEdgeBySrc.get(k).push(e); }
  const gr12Edges = A.edges.filter((e) => GR12_EDGES.has(e.symbol));
  // 線にした使用の原文の範囲(この中の要素の箱・行・線は、なくなってよい)
  const converted = gr12Edges.map((e) => e.src);
  const bNodeById = new Map(B.nodes.map((n) => [n.id, n]));
  // 節点: 前にあって後にないもの
  for (const n of B.nodes) {
    const a = aNodeBySrc.get(key(n.src));
    if (a && a.symbol === n.symbol && a.label === n.label) continue;
    if (a) { out.unexplained.push({ what: 'node-changed', id: n.id, before: [n.symbol, n.label], after: [a.symbol, a.label] }); continue; }
    if (gr12Edges.some((e) => key(e.src) === key(n.src))) { out.boxToEdge++; continue; }
    out.unexplained.push({ what: 'node-missing', id: n.id, symbol: n.symbol, label: n.label });
  }
  // 区画の行: 前にあって後にないもの(同じ箱・同じ区画・同じ文字の行の数で比べる)
  const count = (ls) => { const m = new Map(); for (const l of ls) { const k = `${l.box}|${l.comp}|${l.text}`; m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const cA = count(A.lines);
  const bLines = count(B.lines);
  for (const [k, nb] of bLines) {
    const na = cA.get(k) ?? 0;
    for (let i = na; i < nb; i++) {
      const [box, comp, text] = k.split('|');
      const bn = bNodeById.get(box);
      // 行の要素を、後の引数・節点・線の文字と原文の範囲で探す(行の原文の範囲は構造にないので、持ち主の範囲の中の、
      // 文字が合う引数・節点・線で探す)
      const inBox = (x) => within(x.src, bn?.src);
      const p = A.nodes.find((x) => /^param-[lrtb]$/.test(x.symbol) && x.parent === box && text.includes(x.label.split(' : ')[0]));
      if (p) { out.lineToParam++; continue; }
      const d = A.nodes.find((x) => DPARAMS.has(x.symbol) && inBox(x) && text.replace(/^(subject|actor|stakeholder)\s*/, '') === x.label);
      if (d) { out.lineToDparam++; continue; }
      const e = gr12Edges.find((x) => inBox(x));
      if (e && ['satisfy-requirements-compartment', 'assert-constraints-compartment', 'include-use-cases-compartment', 'allocations-compartment', 'verifies-compartment', 'exposes-compartment'].includes(comp)) { out.lineToEdge++; continue; }
      if (!aNodeBySrc.has(key(bn?.src)) && converted.some((r) => key(r) === key(bn?.src))) { out.droppedLines++; continue; } // 線にした箱の区画の行
      out.unexplained.push({ what: 'line-missing', box, comp, text });
    }
  }
  // 線: 前にあって後にないもの
  for (const e of B.edges) {
    const as = aEdgeBySrc.get(key(e.src)) ?? [];
    if (as.some((a) => a.symbol === e.symbol && a.from === e.from && a.to === e.to && a.label === e.label)) continue;
    // view の箱の expose を import の線で描いていたもの(裁定 Q5 の (b))
    if (/import$/.test(e.symbol) && as.some((a) => /expose-r$/.test(a.symbol))) { out.exposeFromImport++; continue; }
    // 線にした箱の、持ち主への合成の線と、その箱からの型の関係の線
    const fromGone = !A.nodes.some((n) => n.id === e.from) || !A.nodes.some((n) => n.id === e.to);
    if (fromGone) {
      const gone = [e.from, e.to].map((id) => bNodeById.get(id)).filter((n) => n && !A.nodes.some((x) => x.id === n.id));
      if (gone.length && gone.every((n) => gr12Edges.some((g) => key(g.src) === key(n.src)))) { out.droppedEdges++; continue; }
    }
    out.unexplained.push({ what: 'edge-missing', id: e.id, symbol: e.symbol, from: e.from, to: e.to, label: e.label });
  }
  // 後にだけあるもの
  const bNodeSrc = new Set(B.nodes.map((n) => key(n.src)));
  for (const n of A.nodes) {
    if (bNodeSrc.has(key(n.src))) continue;
    if (/^param-[lrtb]$/.test(n.symbol) || DPARAMS.has(n.symbol)) continue; // 区画の行から移ったもの(上で数えた)
    out.unexplained.push({ what: 'node-new', id: n.id, symbol: n.symbol, label: n.label });
  }
  const bEdgeKeys = new Set(B.edges.map((e) => `${e.symbol}|${e.from}|${e.to}|${e.label}|${key(e.src)}`));
  for (const e of A.edges) {
    if (bEdgeKeys.has(`${e.symbol}|${e.from}|${e.to}|${e.label}|${key(e.src)}`)) continue;
    if (GR12_EDGES.has(e.symbol)) continue;
    if (e.symbol === 'distinguished-parameter-link' || e.symbol === 'concern-stakeholder-link') { out.newLinks++; continue; }
    // 端が区画の行だったものが、引数・節点に移ったことで、端の id が変わった線
    const bs = B.edges.filter((x) => x.symbol === e.symbol && key(x.src) === key(e.src) && x.label === e.label);
    if (bs.length && bs.every((x) => /#/.test(x.from + x.to))) { out.newClines++; continue; }
    out.unexplained.push({ what: 'edge-new', id: e.id, symbol: e.symbol, from: e.from, to: e.to, label: e.label });
  }
  return out;
}

const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
const res = { views: {} };
for (const [view, fn, cands] of VIEWS) {
  const v = { candidates: 0, sameSvg: 0, sameStructure: 0, changed: 0, before: Array(8).fill(0), after: Array(8).fill(0), increased: [], decreased: [], changedList: [], exceptions: [], ms: { before: 0, after: 0 }, explain: null };
  if (view === 'general') v.explain = { lineToParam: 0, lineToDparam: 0, lineToEdge: 0, boxToEdge: 0, droppedEdges: 0, droppedLines: 0, exposeFromImport: 0, newLinks: 0, newClines: 0, unexplained: [] };
  const t0 = performance.now();
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    const pb = before.prepareView(text), pa = after.prepareView(text);
    if (!pa.ok || !pb.ok) continue;
    const ca = pa[cands], cb = pb[cands];
    if (ca.map((c) => c.id).join('\n') !== cb.map((c) => c.id).join('\n')) v.exceptions.push({ file: f, error: '候補の並びが違う' });
    for (const c of ca) {
      v.candidates++;
      let rb, ra;
      try {
        let s = performance.now(); rb = before[fn](pb, c.id, { quality: true }); v.ms.before += performance.now() - s;
        s = performance.now(); ra = after[fn](pa, c.id, { quality: true }); v.ms.after += performance.now() - s;
      } catch (e) { v.exceptions.push({ file: f, candidate: c.id, error: String(e?.stack ?? e).slice(0, 400) }); continue; }
      const sameSvg = rb.svg === ra.svg;
      const sameSt = JSON.stringify(rb.structure) === JSON.stringify(ra.structure);
      if (sameSvg) v.sameSvg++;
      if (sameSt) v.sameStructure++;
      const qb = qv(rb.quality), qa = qv(ra.quality);
      qb.forEach((x, i) => { v.before[i] += x; v.after[i] += qa[i]; });
      const inc = QN.filter((_, i) => qa[i] > qb[i]).map((n) => `${n} ${qb[QN.indexOf(n)]}→${qa[QN.indexOf(n)]}`);
      const dec = QN.filter((_, i) => qa[i] < qb[i]).map((n) => `${n} ${qb[QN.indexOf(n)]}→${qa[QN.indexOf(n)]}`);
      if (inc.length) v.increased.push({ file: f, candidate: c.id, items: inc });
      if (dec.length) v.decreased.push({ file: f, candidate: c.id, items: dec });
      if (!sameSvg || !sameSt) {
        v.changed++;
        const item = { file: f, candidate: c.id, sameStructure: sameSt };
        if (view === 'general') {
          const x = explain(rb.structure, ra.structure);
          for (const k of Object.keys(v.explain)) if (k !== 'unexplained') v.explain[k] += x[k];
          if (x.unexplained.length) { item.unexplained = x.unexplained; v.explain.unexplained.push({ file: f, candidate: c.id, items: x.unexplained }); }
          item.counts = Object.fromEntries(Object.entries(x).filter(([k, n]) => k !== 'unexplained' && n));
        }
        v.changedList.push(item);
      }
    }
  }
  v.ms.before = Math.round(v.ms.before); v.ms.after = Math.round(v.ms.after);
  v.wallSec = +((performance.now() - t0) / 1000).toFixed(1);
  res.views[view] = v;
  const q = (a) => a.map((x, i) => `${QN[i]} ${x}`).join('・');
  console.log(`${view}: 候補 ${v.candidates}、SVG が同じ ${v.sameSvg}、構造が同じ ${v.sameStructure}、変わった ${v.changed}、例外 ${v.exceptions.length}、図の質 前 [${q(v.before)}] 後 [${q(v.after)}]、増えた候補 ${v.increased.length}・減った候補 ${v.decreased.length}、描画 前 ${v.ms.before} ms・後 ${v.ms.after} ms(${v.wallSec} 秒)`);
  if (v.explain) console.log(`  違いの内訳: ${Object.entries(v.explain).map(([k, n]) => `${k} ${Array.isArray(n) ? n.length : n}`).join('、')}`);
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
console.log(`→ ${outFile}`);
