// GR15 の R(行為者に着く線を棒人間の図形に着ける)の全数比較(GR15 指示書 4 章、起動プロンプトの P1)。
// tools/view/gr14_compare.mjs を元にし、切り替えを src/view/index.js の FIG15 にした。
//
// 使い方:
//   node tools/view/gr15_compare.mjs --set R [--views general,…] [--out <JSON>] [--robust]
//     前は FIG15 の項目をすべて切ったもの、後は書いた項目だけを入れたもの(ほかの切り替え FIG14・BEND は既定のまま)
//   node tools/view/gr15_compare.mjs --before-src <前の src のフォルダ> [--out <JSON>]
//     前は、作業ツリーとは別の場所に展開した GR14 の終わりの src、後は今の src で FIG15 をすべて切ったもの。
//     違いは 1 件もあってはならない(起動プロンプトの STOP 条件)
//   --before-src に --base R を足すと、前と後の両方で R だけを入れる(P5 の終わりの src と、今の src で R2 を切ったものの比べ。GR15 P7)
//   --base R --set R,R2 なら、前は R だけ、後は R と R2(GR15 P7)
//   出力を省くと out/GR15/compare/<組>.json(--before-src なら out/GR15/compare/off_vs_gr14.json)
//
// 入力は 309 ファイル(out/files309.txt)・「例を読み込む」の例・記号ごとの最小の入力(tests/view/symbols*/manifest.json)。
// ビューごとに、全候補を前と後で描き、候補ごとに SVG の文字列・構造(置く辺の違い param-*・proxy-* は同じ記号とする)・
// 図の質 (a)〜(h)・(i) を比べる(gr14_compare.mjs と同じ)。後の描画を解析からやり直してもう一度描き、一致するか(決定性)、
// 1 候補の時間の最大も数える。
// 加えて、行為者(棒人間)に着く線の端の数・図形の外の端の数(tools/view/edge_quality.mjs の gr15Counts)と、下の辺に着く端の数
// (gr14Counts の actorBottom)を、309 ファイル・例・記号ごとの入力のそれぞれで、前と後について数える。
// 記号ごとの入力は、候補ごとの SVG・構造・図の質 (a)〜(h) の違いを別に数える(違いの合計の「違い」には入れない)。
// --robust なら、後の切り替えで、書き足しへの強さ(tools/view/ab_compare.mjs の appendRobustness)を数える。
//
// 1 候補の時間(GR15 v15.3 の指示書 3.3 節、設計書 7.7 節): プロセスの最初の描画(準備の時間を含む)を除いて測り、最初の描画の値も書く。
// 比べの前に、最初のビューの最初の候補を後の切り替えで 1 回描き(解析・prepareView から描き終えるまでを測る)、その値を「最初の描画」
// とする。候補ごとの時間(1 候補の最大)は、後の描画(描く関数だけ)の時間で、この最初の描画を含まない。
//   node tools/view/gr15_compare.mjs --time <ビュー> <ファイル> <候補> [--repeat 5] [--set R,R2]
//     この候補だけを、単独のプロセスで --repeat 回描く(切り替えは --set の項目を入れ、省くと既定のまま)。各回の前に prepareView を
//     やり直し(全数比較と同じく、描く関数には新しい準備の結果を渡す)、2 回目以降は描く関数の時間だけを測る。最初の描画
//     (prepareView を含む)と、2 回目以降の各回・最大を書く。全数比較の最大の候補を、ほかの重い処理と重ねずに測るのに使う

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import * as cur from '../../src/view/index.js';
import { gr14Counts, gr15Counts } from './edge_quality.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const KEYS = ['R', 'R2'];
const flags = (list) => Object.fromEntries(KEYS.map((k) => [k, list.includes(k)]));
const beforeSrc = arg('--before-src');
const set = arg('--set')?.split(',').filter(Boolean) ?? null;
const fix = arg('--fix') ?? (set ? set.join('') : null);
const timeOnly = process.argv.includes('--time');
if (!beforeSrc && !set && !timeOnly) { console.error('--set <項目の組> か --before-src <フォルダ> か --time を指定する'); process.exit(2); }
const base = (arg('--base') ?? '').split(',').filter(Boolean);
const fxBefore = flags(base);
const fxAfter = timeOnly && !set ? { ...cur.FIG15 } : flags(beforeSrc ? base : set);
const before = beforeSrc ? await import(pathToFileURL(path.resolve(beforeSrc, 'view/index.js')).href) : cur;
const after = cur;
process.chdir(ROOT);
const outFile = arg('--out') ?? `out/GR15/compare/${beforeSrc ? 'off_vs_gr14' : (base.length ? base.join('') + '+' : '') + fix}.json`;
const onlyViews = arg('--views')?.split(',') ?? null;

const VIEWS = [
  ['interconnection', 'renderInterconnection', 'candidates', 'tests/view/symbols'],
  ['state', 'renderStateTransition', 'stateCandidates', 'tests/view/symbols-state'],
  ['action', 'renderActionFlow', 'actionCandidates', 'tests/view/symbols-action'],
  ['sequence', 'renderSequence', 'sequenceCandidates', 'tests/view/symbols-sequence'],
  ['general', 'renderGeneral', 'generalCandidates', 'tests/view/symbols-general'],
].filter(([v]) => !onlyViews || onlyViews.includes(v));
const QN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const qv = (q) => [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)];
const len = (pts) => (pts ?? []).reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
// (i) と、主体・行為者・利害関係者の線の長さと、外側の箱の面積
function extra(d, view) {
  let iLen = 0, iLong = 0, iN = 0, dpLen = 0, area = 0;
  for (const e of d.edges) {
    const l = len(e.points);
    if (e.symbol === 'annotation-link') { iLen += l; iN++; if (l > 200) iLong++; }
    if (e.symbol === 'distinguished-parameter-link' || e.symbol === 'concern-stakeholder-link') dpLen += l;
  }
  if (view === 'action') for (const id of d.top) { const o = d.objects.get(id); if (o.type === 'box' && !o.plain) area += o.w * o.h; }
  if (view === 'state') for (const o of d.objects.values()) if (o.type === 'box' && o.symbol === 'action-flow-view' && o.bodyOf) area += o.w * o.h;
  return { iLen, iLong, iN, dpLen, area };
}
const norm = (s) => JSON.stringify({ ...s, nodes: s.nodes.map((n) => ({ ...n, symbol: n.symbol.replace(/^param-[lrtb]$/, 'param').replace(/^proxy-[vh]$/, 'proxy') })) });
// 構造の違いが、節点の持ち主と、持ち主になった箱の記号(package-with-name-inside → package-with-name-in-tab)だけか
function nestingOnly(sb, sa) {
  if (JSON.stringify(sb.edges) !== JSON.stringify(sa.edges) || JSON.stringify(sb.frame) !== JSON.stringify(sa.frame)) return false;
  const key = (n) => n.id;
  const mb = new Map(sb.nodes.map((n) => [key(n), n])), ma = new Map(sa.nodes.map((n) => [key(n), n]));
  if (mb.size !== ma.size) return false;
  const parents = new Set(sa.nodes.map((n) => n.parent).filter(Boolean));
  for (const [id, a] of ma) {
    const b = mb.get(id);
    if (!b) return false;
    const strip = (n) => JSON.stringify({ ...n, parent: null, symbol: parents.has(n.id) && n.symbol === 'package-with-name-in-tab' ? 'package-with-name-inside' : n.symbol });
    if (strip(a) !== strip(b)) return false;
  }
  return true;
}

if (timeOnly) {
  const i = process.argv.indexOf('--time');
  const [tv, tf, tc] = process.argv.slice(i + 1, i + 4);
  const row = VIEWS.find(([v]) => v === tv);
  if (!row || !tf || !tc) { console.error('--time <ビュー> <ファイル> <候補>'); process.exit(2); }
  const repeat = +(arg('--repeat') ?? 5);
  const text = decodeUtf8(fs.readFileSync(tf));
  const runs = [];
  let prepMs = 0;
  for (let k = 0; k < repeat; k++) {
    const s0 = performance.now();
    const p = cur.prepareView(text, { fig15: fxAfter });
    if (k === 0) prepMs = performance.now() - s0;
    if (!p.ok || !p[row[2]].some((c) => c.id === tc)) { console.error(`候補 ${tc} がない`); process.exit(2); }
    const s = performance.now();
    cur[row[1]](p, tc, { quality: true, keepDiagram: true, fig15: fxAfter });
    runs.push(performance.now() - s);
  }
  const rest = runs.slice(1);
  const out = { view: tv, file: tf, candidate: tc, fig15: fxAfter, prepareMs: Math.round(prepMs), firstMs: Math.round(prepMs + runs[0]), firstRenderMs: Math.round(runs[0]), restMs: rest.map(Math.round), maxRestMs: rest.length ? Math.round(Math.max(...rest)) : null };
  console.log(JSON.stringify(out));
  process.exit(0);
}

const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
const inputs = [...files.map((f) => ({ name: f, text: decodeUtf8(fs.readFileSync(f)), group: 'files' })), { name: 'src/app/sample.sysml(例)', text: sample, group: 'sample' }];

const res = { before: fxBefore, after: fxAfter, beforeSrc: beforeSrc ?? null, first: null, views: {} };
let diffs = 0;
// プロセスの最初の描画(上の「1 候補の時間」)。最初のビューの、最初に候補を持つ入力の最初の候補
{
  const [view, fn, cands] = VIEWS[0];
  for (const inp of inputs) {
    const s = performance.now();
    const p = after.prepareView(inp.text, { fig15: fxAfter });
    if (!p.ok || !p[cands].length) continue;
    const id = p[cands][0].id;
    after[fn](p, id, { quality: true, keepDiagram: true, fig15: fxAfter });
    res.first = { ms: Math.round(performance.now() - s), view, file: inp.name, candidate: id };
    break;
  }
  console.log(`プロセスの最初の描画(準備を含む。1 候補の最大に含めない): ${res.first ? `${res.first.ms} ms(${res.first.view} ${res.first.file} ${res.first.candidate})` : 'なし'}`);
}
for (const [view, fn, cands, symDir] of VIEWS) {
  const v = { candidates: 0, files: 0, same: 0, changed: [], structureChanged: 0, nestingOnly: 0, listChanged: [], added: [], removed: [], exceptions: [], mismatches: [],
    before: Array(8).fill(0), after: Array(8).fill(0), addedQ: Array(8).fill(0), x: { before: { iLen: 0, iLong: 0, iN: 0, dpLen: 0, area: 0 }, after: { iLen: 0, iLong: 0, iN: 0, dpLen: 0, area: 0 } },
    maxMs: { ms: 0, file: null, candidate: null }, nonzeroSmall: [], wallSec: 0, symSame: 0, symChanged: [],
    actor: Object.fromEntries(['files', 'sample', 'symbols'].map((g) => [g, { before: { actorEnds: 0, actorOutside: 0, actorBottom: 0, actorSide: 0, actorOffHand: 0 }, after: { actorEnds: 0, actorOutside: 0, actorBottom: 0, actorSide: 0, actorOffHand: 0 }, items: [] }])) };
  const actorAdd = (acc, d) => { const a = gr15Counts(d), b = gr14Counts(d).actorBottom; for (const k of ['actorEnds', 'actorOutside', 'actorSide', 'actorOffHand']) acc[k] += a[k]; acc.actorBottom += b; return { ...a, actorBottom: b }; };
  const t0 = performance.now();
  const one = (lib, p, id, fx) => lib[fn](p, id, { quality: true, keepDiagram: true, fig15: fx });
  const all = [...inputs];
  // 記号ごとの最小の入力(このビューで描く項目。アクションフロービューの入力のうち view が 'state' のものは状態遷移ビューで描く)
  const smallCases = [];
  const addSym = (dir, pick) => { const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8')); for (const c of m.cases) if (pick(c)) smallCases.push({ name: `${dir}/${c.file}`, text: fs.readFileSync(`${dir}/${c.file}`, 'utf8'), group: 'symbols', candidate: c.candidate ?? null }); };
  if (view === 'state') { addSym('tests/view/symbols-state', () => true); addSym('tests/view/symbols-action', (c) => c.view === 'state'); }
  else if (view === 'action') addSym('tests/view/symbols-action', (c) => c.view !== 'state');
  else addSym(symDir, () => true);
  all.push(...smallCases);
  for (const inp of all) {
    let pb, pa;
    try { pb = before.prepareView(inp.text, { fig15: fxBefore }); pa = after.prepareView(inp.text, { fig15: fxAfter }); }
    catch (e) { v.exceptions.push({ file: inp.name, error: String(e?.stack ?? e).slice(0, 400) }); continue; }
    if (pa.ok !== pb.ok) { v.exceptions.push({ file: inp.name, error: '受理・拒否が違う' }); continue; }
    if (!pa.ok) continue;
    const idsB = pb[cands].map((c) => c.id), idsA = pa[cands].map((c) => c.id);
    if (idsA.join('\n') !== idsB.join('\n')) {
      const extraIds = idsA.filter((id) => !idsB.includes(id)), lost = idsB.filter((id) => !idsA.includes(id));
      if (!lost.length && idsA.filter((id) => idsB.includes(id)).join('\n') === idsB.join('\n')) v.added.push(...extraIds.map((id) => ({ file: inp.name, candidate: id })));
      else v.listChanged.push({ file: inp.name, before: idsB, after: idsA });
      v.removed.push(...lost.map((id) => ({ file: inp.name, candidate: id })));
    }
    const pick = inp.candidate ? [inp.candidate] : idsA;
    for (const id of pick) {
      const inB = idsB.includes(id);
      let rb = null, ra, ra2;
      try {
        if (inB) rb = one(before, pb, id, fxBefore);
        const s = performance.now();
        ra = one(after, pa, id, fxAfter);
        const ms = performance.now() - s;
        if (ms > v.maxMs.ms) v.maxMs = { ms: Math.round(ms), file: inp.name, candidate: id };
        ra2 = one(after, after.prepareView(inp.text, { fig15: fxAfter }), id, fxAfter);
      } catch (e) { v.exceptions.push({ file: inp.name, candidate: id, error: String(e?.stack ?? e).slice(0, 600) }); continue; }
      if (ra.svg !== ra2.svg || JSON.stringify(ra.structure) !== JSON.stringify(ra2.structure)) v.mismatches.push({ file: inp.name, candidate: id });
      const qa = qv(ra.quality);
      { const A = v.actor[inp.group]; const ca = actorAdd(A.after, ra.diagram); if (rb) actorAdd(A.before, rb.diagram); if (ca.actorOutside || ca.actorBottom || (fxAfter.R2 && ca.actorOffHand)) A.items.push({ file: inp.name, candidate: id, ...ca }); }
      if (inp.group !== 'files' && qa.slice(0, 5).some((x) => x)) v.nonzeroSmall.push({ file: inp.name, candidate: id, q: qa.slice(0, 5) });
      if (inp.group === 'symbols') {
        // 記号ごとの入力も、候補ごとに SVG・構造・図の質 (a)〜(h) を比べる(GR15 指示書 3.1 節。合計と (i) には入れない)
        if (!rb) continue;
        const qb = qv(rb.quality);
        if (rb.svg === ra.svg && norm(rb.structure) === norm(ra.structure) && qb.join() === qa.join()) v.symSame++;
        else v.symChanged.push({ file: inp.name, candidate: id, sameSvg: rb.svg === ra.svg, sameStructure: norm(rb.structure) === norm(ra.structure), q: qb.join() === qa.join() ? null : { before: qb, after: qa } });
        continue;
      }
      const xa = extra(ra.diagram, view);
      if (!inB) { if (inp.group === 'files') qa.forEach((x, i) => { v.addedQ[i] += x; }); continue; }
      v.candidates++;
      const qb = qv(rb.quality), xb = extra(rb.diagram, view);
      // 合計(図の質・(i)・線の長さ・面積)は 309 ファイルの候補だけで数える(例は nonzeroSmall で (a)〜(e) を見る)
      if (inp.group === 'files') {
        v.files++;
        qb.forEach((x, i) => { v.before[i] += x; v.after[i] += qa[i]; });
        for (const k of Object.keys(xb)) { v.x.before[k] += xb[k]; v.x.after[k] += xa[k]; }
      }
      const sameSvg = rb.svg === ra.svg;
      const sameSt = norm(rb.structure) === norm(ra.structure);
      const sameQ = qb.join() === qa.join();
      if (sameSvg && sameSt && sameQ) { v.same++; continue; }
      const nest = !sameSt && nestingOnly(rb.structure, ra.structure);
      if (!sameSt) { v.structureChanged++; if (nest) v.nestingOnly++; }
      v.changed.push({ file: inp.name, candidate: id, sameSvg, sameStructure: sameSt, nestingOnly: nest, q: sameQ ? null : { before: qb, after: qa }, i: [Math.round(xb.iLen), Math.round(xa.iLen)], dp: [Math.round(xb.dpLen), Math.round(xa.dpLen)], area: [xb.area, xa.area] });
    }
  }
  for (const k of Object.keys(v.x.before)) { v.x.before[k] = Math.round(v.x.before[k]); v.x.after[k] = Math.round(v.x.after[k]); }
  v.wallSec = +((performance.now() - t0) / 1000).toFixed(1);
  if (process.argv.includes('--robust')) {
    const { appendRobustness } = await import('./ab_compare.mjs');
    const keep = { ...cur.FIG15 };
    Object.assign(cur.FIG15, fxAfter);
    const r = appendRobustness({ view });
    Object.assign(cur.FIG15, keep);
    v.robust = { candidates: r.candidates, changedEnd: r.changedEnd, changedStart: r.changedStart, changedStart50: r.changedStart50, list: r.list.slice(0, 20) };
  }
  res.views[view] = v;
  diffs += v.changed.length + v.listChanged.length + v.exceptions.length + v.mismatches.length + v.added.length + v.removed.length;
  const q = (a) => a.map((x, i) => `${QN[i]} ${x}`).join('・');
  console.log(`${view}: 候補 ${v.candidates}、同じ ${v.same}、変わった ${v.changed.length}(構造 ${v.structureChanged}、うち入れ子だけ ${v.nestingOnly})、候補の並びが変わった ${v.listChanged.length}、増えた候補 ${v.added.length}、減った候補 ${v.removed.length}、例外 ${v.exceptions.length}、2 回の描画の不一致 ${v.mismatches.length}`);
  console.log(`  309 ファイルの候補 ${v.files} の図の質 前 [${q(v.before)}] 後 [${q(v.after)}]${v.added.length ? `、増えた候補 [${q(v.addedQ)}]` : ''}`);
  console.log(`  (i) 長さ ${v.x.before.iLen} → ${v.x.after.iLen}、200 px 超 ${v.x.before.iLong} → ${v.x.after.iLong}(本数 ${v.x.before.iN} → ${v.x.after.iN})、主体などの線 ${v.x.before.dpLen} → ${v.x.after.dpLen}、外側の箱の面積 ${v.x.before.area} → ${v.x.after.area}`);
  console.log(`  記号ごとの入力の候補: 同じ ${v.symSame}、変わった ${v.symChanged.length}(図の質の違い ${v.symChanged.filter((c) => c.q).length}、構造の違い ${v.symChanged.filter((c) => !c.sameStructure).length})`);
  console.log(`  例と記号の入力で (a)〜(e) が 0 でない ${v.nonzeroSmall.length} 件、1 候補の最大(最初の描画を除く) ${v.maxMs.ms} ms(${v.maxMs.file} ${v.maxMs.candidate})、${v.wallSec} 秒`);
  for (const g of ['files', 'sample', 'symbols']) { const A = v.actor[g]; if (A.before.actorEnds || A.after.actorEnds) console.log(`  行為者に着く線の端 ${g}: 端 ${A.before.actorEnds} → ${A.after.actorEnds}、図形の外 ${A.before.actorOutside} → ${A.after.actorOutside}、下の辺 ${A.before.actorBottom} → ${A.after.actorBottom}、左右から着く端 ${A.before.actorSide} → ${A.after.actorSide}、手の先から 2 px より離れた端 ${A.before.actorOffHand} → ${A.after.actorOffHand}`); }
  if (v.robust) console.log(`  書き足しへの強さ(候補 ${v.robust.candidates}): 末尾 1 行 ${v.robust.changedEnd}、先頭 1 行 ${v.robust.changedStart}、先頭 50 行 ${v.robust.changedStart50}`);
}
res.differences = diffs;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
console.log(`違い ${diffs} 件 → ${outFile}`);
