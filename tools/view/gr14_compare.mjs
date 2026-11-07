// 図の見た目と中身の直し(GR14)の全数比較(GR14 指示書 4 章、起動プロンプトの P1)。
//
// 使い方:
//   node tools/view/gr14_compare.mjs --fix N [--base F,C] [--views general,action] [--out <JSON>] [--robust]
//     直しの切り替え(src/view/index.js の FIG14)を、前は base の直しだけ入れたもの、後は base に fix を足したもので描き比べる。
//     base を省くと、ほかの直しはすべて切ったまま。fix に all と書くと、後は 5 つの直しをすべて入れたもの
//   node tools/view/gr14_compare.mjs --set F,C,A,P [--base …] [--out <JSON>]
//     後を、書いた直しの組(ほかは切ったもの)にする(全部を入れた後の確認。前は base、省くとすべて切ったもの)
//   node tools/view/gr14_compare.mjs --before-src <前の src のフォルダ> [--out <JSON>]
//     前は、作業ツリーとは別の場所に展開した GR13 の終わりの src(view/index.js を持つもの)、後は今の src で直しをすべて切ったもの。
//     違いは 1 件もあってはならない(起動プロンプトの STOP 条件)
//   出力を省くと out/GR14/compare/<fix>.json(--before-src なら out/GR14/compare/off_vs_gr13.json)
//
// 入力は 309 ファイル(out/files309.txt)・「例を読み込む」の例・記号ごとの最小の入力(tests/view/symbols*/manifest.json)。
// ビューごとに、全候補を前と後で描き、候補ごとに次を比べる。
//   - SVG の文字列、構造(置く辺の違い param-*・proxy-* は同じ記号とする)、図の質 (a)〜(h)(tools/view/gr13_compare.mjs と同じ数え方)
//   - (i) 注釈の線(annotation-link)の長さの合計と、200 px を超える本数(GR14 指示書 3.1 節)
//   - 主体・行為者・利害関係者の線(distinguished-parameter-link・concern-stakeholder-link)の長さの合計(3.2 節)
//   - 外側の箱の面積の合計(アクションフロービューの最上位の箱と、状態遷移ビューの本体の図の箱。3.4 節)
//   - 後の描画を、解析からやり直してもう一度描き、SVG と構造が一致するか(決定性)。後の 1 候補の時間の最大
//   - 候補の一覧の違い(C で増えた候補は added に書く)
// 構造の違いは、節点の持ち主(parent)と、持ち主になった箱の記号だけの違い(P の入れ子)と、それ以外に分けて数える。
// 例と記号ごとの最小の入力は、後の図の質 (a)〜(e) が 0 件かを数える(0 件でないものを nonzeroSmall に書く)。
// 合計(図の質・(i)・線の長さ・面積)は 309 ファイルの候補だけで数える(候補の数・同じ・変わったは例を含む)。
// --robust なら、後の切り替えで、書き足しへの強さ(tools/view/ab_compare.mjs の appendRobustness)を、比べたビューごとに数える。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import * as cur from '../../src/view/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const KEYS = ['N', 'A', 'P', 'F', 'C'];
const flags = (list) => Object.fromEntries(KEYS.map((k) => [k, list.includes(k)]));
const beforeSrc = arg('--before-src');
const set = arg('--set')?.split(',').filter(Boolean) ?? null;
const fix = arg('--fix') ?? (set ? set.join('') : null);
if (!beforeSrc && !fix) { console.error('--fix <N|A|P|F|C|all> か --set <直しの組> か --before-src <フォルダ> を指定する'); process.exit(2); }
const base = (arg('--base') ?? '').split(',').filter(Boolean);
const fxBefore = flags(beforeSrc ? [] : base);
const fxAfter = flags(beforeSrc ? [] : set ?? (fix === 'all' ? KEYS : [...base, fix]));
const before = beforeSrc ? await import(pathToFileURL(path.resolve(beforeSrc, 'view/index.js')).href) : cur;
const after = cur;
process.chdir(ROOT);
const outFile = arg('--out') ?? `out/GR14/compare/${beforeSrc ? 'off_vs_gr13' : (base.length ? base.join('') + '+' : '') + fix}.json`;
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

const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
const inputs = [...files.map((f) => ({ name: f, text: decodeUtf8(fs.readFileSync(f)), group: 'files' })), { name: 'src/app/sample.sysml(例)', text: sample, group: 'sample' }];

const res = { before: fxBefore, after: fxAfter, beforeSrc: beforeSrc ?? null, views: {} };
let diffs = 0;
for (const [view, fn, cands, symDir] of VIEWS) {
  const v = { candidates: 0, files: 0, same: 0, changed: [], structureChanged: 0, nestingOnly: 0, listChanged: [], added: [], removed: [], exceptions: [], mismatches: [],
    before: Array(8).fill(0), after: Array(8).fill(0), addedQ: Array(8).fill(0), x: { before: { iLen: 0, iLong: 0, iN: 0, dpLen: 0, area: 0 }, after: { iLen: 0, iLong: 0, iN: 0, dpLen: 0, area: 0 } },
    maxMs: { ms: 0, file: null, candidate: null }, nonzeroSmall: [], wallSec: 0 };
  const t0 = performance.now();
  const one = (lib, p, id, fx) => lib[fn](p, id, { quality: true, keepDiagram: true, fig14: fx });
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
    try { pb = before.prepareView(inp.text, { fig14: fxBefore }); pa = after.prepareView(inp.text, { fig14: fxAfter }); }
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
        ra2 = one(after, after.prepareView(inp.text, { fig14: fxAfter }), id, fxAfter);
      } catch (e) { v.exceptions.push({ file: inp.name, candidate: id, error: String(e?.stack ?? e).slice(0, 600) }); continue; }
      if (ra.svg !== ra2.svg || JSON.stringify(ra.structure) !== JSON.stringify(ra2.structure)) v.mismatches.push({ file: inp.name, candidate: id });
      const qa = qv(ra.quality);
      if (inp.group !== 'files' && qa.slice(0, 5).some((x) => x)) v.nonzeroSmall.push({ file: inp.name, candidate: id, q: qa.slice(0, 5) });
      if (inp.group === 'symbols') continue;
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
    const keep = { ...cur.FIG14 };
    Object.assign(cur.FIG14, fxAfter);
    const r = appendRobustness({ view });
    Object.assign(cur.FIG14, keep);
    v.robust = { candidates: r.candidates, changedEnd: r.changedEnd, changedStart: r.changedStart, changedStart50: r.changedStart50, list: r.list.slice(0, 20) };
  }
  res.views[view] = v;
  diffs += v.changed.length + v.listChanged.length + v.exceptions.length + v.mismatches.length + v.added.length + v.removed.length;
  const q = (a) => a.map((x, i) => `${QN[i]} ${x}`).join('・');
  console.log(`${view}: 候補 ${v.candidates}、同じ ${v.same}、変わった ${v.changed.length}(構造 ${v.structureChanged}、うち入れ子だけ ${v.nestingOnly})、候補の並びが変わった ${v.listChanged.length}、増えた候補 ${v.added.length}、減った候補 ${v.removed.length}、例外 ${v.exceptions.length}、2 回の描画の不一致 ${v.mismatches.length}`);
  console.log(`  309 ファイルの候補 ${v.files} の図の質 前 [${q(v.before)}] 後 [${q(v.after)}]${v.added.length ? `、増えた候補 [${q(v.addedQ)}]` : ''}`);
  console.log(`  (i) 長さ ${v.x.before.iLen} → ${v.x.after.iLen}、200 px 超 ${v.x.before.iLong} → ${v.x.after.iLong}(本数 ${v.x.before.iN} → ${v.x.after.iN})、主体などの線 ${v.x.before.dpLen} → ${v.x.after.dpLen}、外側の箱の面積 ${v.x.before.area} → ${v.x.after.area}`);
  console.log(`  例と記号の入力で (a)〜(e) が 0 でない ${v.nonzeroSmall.length} 件、1 候補の最大 ${v.maxMs.ms} ms(${v.maxMs.file} ${v.maxMs.candidate})、${v.wallSec} 秒`);
  if (v.robust) console.log(`  書き足しへの強さ(候補 ${v.robust.candidates}): 末尾 1 行 ${v.robust.changedEnd}、先頭 1 行 ${v.robust.changedStart}、先頭 50 行 ${v.robust.changedStart50}`);
}
res.differences = diffs;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
console.log(`違い ${diffs} 件 → ${outFile}`);
