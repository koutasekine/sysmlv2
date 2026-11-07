// 線を引く順番と線の端の仕上げの切り替え(src/view/index.js の UNIFIED_EDGES)の、切り替え前と後の全数比較(GR7 指示書 5.1 節)。
//
// 使い方:
//   node tools/view/ab_compare.mjs            # → out/view/ab_compare.json と、標準出力のまとめ
//
// 相互接続ビューと状態遷移ビューについて、309 ファイルの全候補・記号ごとの入力・例(全候補)を、
// 描く関数の opts.unified を false(切り替え前)と true(切り替え後)にして描き、候補ごとに次を比べる。
//   - 図の質 (a)〜(e) の件数(tests/view/run.mjs と同じ数え方)
//   - 線の経路(SVG の <g data-id> の中の polyline の点)。線の順番(構造の edges の並び)
//   - 構造(箱・ポート・区画・接続・文字)。線の並びの違いを除くため、edges を id で並べ直してから比べる
//   - 診断
//   - 線の端の仕上げで引き直した線と、図の質が増えたので取り消した線(切り替え後)
// 書き足しへの強さ: 例と 309 ファイル(受理した 305 件すべて)について、ファイルの末尾と先頭に 1 行
// (末尾は改行と 'part def GR7_Appended;'、先頭は 'part def GR7_Prepended;' と改行)を足したテキストを描き、
// 両方のテキストにある線どうしの順番が、元のテキストと同じかを数える(切り替え前と後の両方)。
// 参考として、先頭に 50 行('part def GR7_P0;'〜'part def GR7_P49;')を足したものも数える。1 行では線の番号の桁が
// ほとんど変わらないので、番号の桁が変わる場合の違い(文字列の順と数の順の違い)を見るため。
// 線の対応は、記号・原文の範囲(先頭に足したときは足した長さだけずらす)・線の id の番号より後ろの部分で取る。
//
// appendRobustness({ view }) は、書き足しへの強さだけを、今の動き(UNIFIED_EDGES)で数える(tests/view/run.mjs の
// 検査が使う。GR7 指示書 8 章の 6)。view は 'interconnection'・'state'・'action'・'sequence'(GR9 指示書 8 章の 6)・'general'(GR10 指示書 7 章の 6)
//
// GR8: アクションフローの図の配置の切り替え(src/view/index.js の FLOW_LAYERS)の全数比較(GR8 指示書 5 章)。
//   node tools/view/ab_compare.mjs --flow     # → out/view/ab_flow.json と、標準出力のまとめ
// アクションフロービューの全候補と、状態遷移ビューの全候補(本体の図を持つものと持たないものを分けて数える)を、
// 309 ファイル・記号ごとの入力(tests/view/symbols-action/ と tests/view/symbols-state/)・例について、描く関数の
// opts.flowLayers を false(切り替え前)と true(切り替え後)にして描き、候補ごとに (a)〜(f) の件数、SVG、構造を比べる。
// 構造は、置く辺の違い(proxy-v・proxy-h、param-l・-r・-t・-b)を同じ記号として比べる(GR8 P1 の裁定 Q2・Q6)。
// 書き足しへの強さ(切り替え後): 例と 309 ファイルの末尾に 1 行・先頭に 50 行を足し、すでにある線どうしの順番が
// 変わらないこと、末尾に 1 行足したときに、すでにある要素の段(flowRows)が変わらないことを数える。
// flowRowStability({ view }) は、末尾に 1 行足したときの段の変化だけを、今の動き(FLOW_LAYERS)で数える(tests/view/run.mjs が使う)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prepareView, renderInterconnection, renderStateTransition, renderActionFlow, renderSequence, renderGeneral } from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const VIEWS = {
  interconnection: { render: renderInterconnection, cands: (p) => p.candidates, symDir: 'tests/view/symbols' },
  state: { render: renderStateTransition, cands: (p) => p.stateCandidates, symDir: 'tests/view/symbols-state' },
};
const LABELS = ['a', 'b', 'c', 'd', 'e'];
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function snapshot(render, p, cid, unified) {
  const r = render(p, cid, { quality: true, unified });
  const q = r.quality;
  const s = r.structure;
  const routes = {};
  for (const e of s.edges) {
    const m = r.svg.match(new RegExp(`<g data-id="${reEsc(e.id)}"[^>]*><polyline points="([^"]*)"`));
    routes[e.id] = m ? m[1] : null;
  }
  const sorted = [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    q: [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length],
    svg: hash(r.svg), structure: hash(JSON.stringify({ ...s, edges: sorted })), diag: hash(JSON.stringify(r.diagnostics)),
    order: s.edges.map((e) => e.id), edges: s.edges, routes, endFix: r.endFix ?? null,
  };
}

function compareCandidate(a, b) {
  const routeChanged = Object.keys(a.routes).filter((id) => a.routes[id] !== b.routes[id]);
  return {
    svg: a.svg !== b.svg, structure: a.structure !== b.structure, diag: a.diag !== b.diag,
    order: a.order.join() !== b.order.join(), routeChanged,
  };
}

// 書き足しへの強さ: 元のテキストと書き足したテキストの、両方にある線どうしの順番が同じか
const edgeKey = (e, shift) => `${e.symbol}|${e.src ? `${e.src[0] + shift},${e.src[1] + shift}` : '-'}|${e.id.replace(/^e\d+/, '')}`;
function sameRelativeOrder(orig, added, shift) {
  const ko = orig.map((e) => edgeKey(e, shift));
  const ka = added.map((e) => edgeKey(e, 0));
  const so = new Set(ko), sa = new Set(ka);
  const a1 = ko.filter((k) => sa.has(k)), a2 = ka.filter((k) => so.has(k));
  return { same: a1.join('\n') === a2.join('\n'), common: a1.length, origEdges: ko.length };
}

const APPEND1 = '\npart def GR7_Appended;\n', PREPEND1 = 'part def GR7_Prepended;\n';
const PREPEND50_ = Array.from({ length: 50 }, (_, i) => `part def GR7_P${i};\n`).join('');
export function appendRobustness({ view = 'interconnection' } = {}) {
  const R = { interconnection: [renderInterconnection, (p) => p.candidates], state: [renderStateTransition, (p) => p.stateCandidates], action: [renderActionFlow, (p) => p.actionCandidates], sequence: [renderSequence, (p) => p.sequenceCandidates], general: [renderGeneral, (p) => p.generalCandidates] }[view];
  const [render, cands] = R;
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const texts = [['src/app/sample.sysml', fs.readFileSync('src/app/sample.sysml', 'utf8')], ...files.map((f) => [f, decodeUtf8(fs.readFileSync(f))])];
  const res = { candidates: 0, edges: 0, changedEnd: 0, changedStart: 0, changedStart50: 0, list: [] };
  for (const [file, text] of texts) {
    const p = prepareView(text);
    if (!p.ok || !cands(p).length) continue;
    const variants = [['changedEnd', text + APPEND1, 0], ['changedStart', PREPEND1 + text, PREPEND1.length], ['changedStart50', PREPEND50_ + text, PREPEND50_.length]].map(([k, t, shift]) => [k, prepareView(t), shift]);
    for (const c of cands(p)) {
      const base = render(p, c.id).structure.edges;
      res.candidates++;
      res.edges += base.length;
      for (const [k, q, shift] of variants) {
        const ok = q.ok && cands(q).some((x) => x.id === c.id);
        const r = ok ? sameRelativeOrder(base, render(q, c.id).structure.edges, shift) : null;
        if (!r || !r.same || r.common !== base.length) { res[k]++; res.list.push({ file, candidate: c.id, where: k }); }
      }
    }
  }
  return res;
}

export function runAb({ log = () => {} } = {}) {
  const t0 = performance.now();
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const inputs = [{ group: 'sample', file: 'src/app/sample.sysml', text: sample }];
  for (const f of files) inputs.push({ group: 'files', file: f, text: decodeUtf8(fs.readFileSync(f)) });
  const APPEND = '\npart def GR7_Appended;\n', PREPEND = 'part def GR7_Prepended;\n';
  const PREPEND50 = Array.from({ length: 50 }, (_, i) => `part def GR7_P${i};\n`).join('');
  const res = {};
  for (const [view, V] of Object.entries(VIEWS)) {
    const items = [];
    const robust = { before: { candidates: 0, changedEnd: 0, changedStart: 0, changedStart50: 0, edges: 0, list: [] }, after: { candidates: 0, changedEnd: 0, changedStart: 0, changedStart50: 0, edges: 0, list: [] } };
    const manifest = JSON.parse(fs.readFileSync(path.join(V.symDir, 'manifest.json'), 'utf8'));
    const all = [
      ...manifest.cases.map((c) => ({ group: 'symbols', file: `${V.symDir}/${c.file}`, text: fs.readFileSync(path.join(V.symDir, c.file), 'utf8'), only: c.candidate ?? null })),
      ...inputs,
    ];
    for (const inp of all) {
      const p = prepareView(inp.text);
      if (!p.ok) continue;
      let cands = V.cands(p);
      if (inp.group === 'symbols') cands = inp.only ? cands.filter((c) => c.id === inp.only) : cands.slice(0, 1);
      // 書き足したテキスト(例と 309 ファイルだけ)
      let pEnd = null, pStart = null, pStart50 = null;
      if (inp.group !== 'symbols') {
        pEnd = prepareView(inp.text + APPEND);
        pStart = prepareView(PREPEND + inp.text);
        pStart50 = prepareView(PREPEND50 + inp.text);
      }
      for (const c of cands) {
        const A = snapshot(V.render, p, c.id, false), B = snapshot(V.render, p, c.id, true);
        const cmp = compareCandidate(A, B);
        items.push({ group: inp.group, file: inp.file, candidate: c.id, before: A.q, after: B.q, edges: A.order.length, ...cmp, endFix: B.endFix });
        if (pEnd) {
          for (const [mode, unified, base] of [['before', false, A], ['after', true, B]]) {
            const R = robust[mode];
            R.candidates++;
            R.edges += base.edges.length;
            const cEnd = V.cands(pEnd.ok ? pEnd : { candidates: [], stateCandidates: [] }).some((x) => x.id === c.id) ? snapshot(V.render, pEnd, c.id, unified) : null;
            const cStart = V.cands(pStart.ok ? pStart : { candidates: [], stateCandidates: [] }).some((x) => x.id === c.id) ? snapshot(V.render, pStart, c.id, unified) : null;
            const e1 = cEnd ? sameRelativeOrder(base.edges, cEnd.edges, 0) : null;
            const e2 = cStart ? sameRelativeOrder(base.edges, cStart.edges, PREPEND.length) : null;
            if (!e1 || !e1.same || e1.common !== base.edges.length) { R.changedEnd++; R.list.push({ file: inp.file, candidate: c.id, where: 'end', missing: !e1, common: e1?.common, edges: base.edges.length }); }
            if (!e2 || !e2.same || e2.common !== base.edges.length) { R.changedStart++; R.list.push({ file: inp.file, candidate: c.id, where: 'start', missing: !e2, common: e2?.common, edges: base.edges.length }); }
            const c50 = V.cands(pStart50.ok ? pStart50 : { candidates: [], stateCandidates: [] }).some((x) => x.id === c.id) ? snapshot(V.render, pStart50, c.id, unified) : null;
            const e3 = c50 ? sameRelativeOrder(base.edges, c50.edges, PREPEND50.length) : null;
            if (!e3 || !e3.same || e3.common !== base.edges.length) { R.changedStart50++; R.list.push({ file: inp.file, candidate: c.id, where: 'start50', missing: !e3, common: e3?.common, edges: base.edges.length }); }
          }
        }
      }
      log(`${view} ${inp.file}`);
    }
    const summary = {};
    for (const g of ['symbols', 'sample', 'files']) {
      const xs = items.filter((x) => x.group === g);
      const sum = (k) => xs.reduce((a, x) => a.map((v, i) => v + x[k][i]), [0, 0, 0, 0, 0]);
      const tot = (x) => x.reduce((s, v) => s + v, 0);
      summary[g] = {
        candidates: xs.length, sumBefore: sum('before'), sumAfter: sum('after'),
        less: xs.filter((x) => tot(x.after) < tot(x.before)).length, same: xs.filter((x) => tot(x.after) === tot(x.before)).length, more: xs.filter((x) => tot(x.after) > tot(x.before)).length,
        perLabel: Object.fromEntries(LABELS.map((l, i) => [l, { less: xs.filter((x) => x.after[i] < x.before[i]).length, more: xs.filter((x) => x.after[i] > x.before[i]).length }])),
        svgChanged: xs.filter((x) => x.svg).length, orderChanged: xs.filter((x) => x.order).length,
        routeChanged: xs.filter((x) => x.routeChanged.length).length, routeEdgesChanged: xs.reduce((s, x) => s + x.routeChanged.length, 0), edges: xs.reduce((s, x) => s + x.edges, 0),
        structureChanged: xs.filter((x) => x.structure).length, diagChanged: xs.filter((x) => x.diag).length,
        fixMoved: xs.filter((x) => x.endFix?.moved.length).length, fixMovedEdges: xs.reduce((s, x) => s + (x.endFix?.moved.length ?? 0), 0),
        fixUndone: xs.filter((x) => x.endFix?.undone.length).length, fixUndoneEdges: xs.reduce((s, x) => s + (x.endFix?.undone.length ?? 0), 0),
      };
    }
    res[view] = { summary, robust, items };
  }
  res.wallMs = Math.round(performance.now() - t0);
  return res;
}

// ---- GR8: 流れの段の配置の全数比較
const sideFree = (s) => s.replace(/"proxy-[vh]"/g, '"proxy"').replace(/"param-[lrtb]"/g, '"param"');
function flowSnap(render, p, cid, flowLayers) {
  const r = render(p, cid, { quality: true, flowLayers });
  const q = r.quality, s = r.structure;
  const sorted = [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const st = JSON.stringify({ ...s, edges: sorted });
  return {
    q: [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length],
    svg: hash(r.svg), structure: hash(st), structureSideFree: hash(sideFree(st)),
    body: s.nodes.some((n) => n.symbol === 'action-flow-view'), edges: s.edges, rows: r.flowRows ?? {},
  };
}
const APPEND_F = '\npart def GR8_Appended;\n';
const PREPEND50_F = Array.from({ length: 50 }, (_, i) => `part def GR8_P${i};\n`).join('');
// 末尾に 1 行足したときに、すでにある要素の段が変わった候補
function rowsChanged(a, b) { return Object.keys(a).filter((id) => id in b && a[id] !== b[id]); }
export function flowRowStability({ view = 'action' } = {}) {
  const [render, cands] = view === 'state' ? [renderStateTransition, (p) => p.stateCandidates] : [renderActionFlow, (p) => p.actionCandidates];
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const texts = [['src/app/sample.sysml', fs.readFileSync('src/app/sample.sysml', 'utf8')], ...files.map((f) => [f, decodeUtf8(fs.readFileSync(f))])];
  const res = { candidates: 0, withRows: 0, changed: 0, list: [] };
  for (const [file, text] of texts) {
    const p = prepareView(text);
    if (!p.ok || !cands(p).length) continue;
    const q = prepareView(text + APPEND_F);
    for (const c of cands(p)) {
      const a = render(p, c.id, { quality: true }).flowRows ?? {};
      res.candidates++;
      if (!Object.keys(a).length) continue;
      res.withRows++;
      const b = q.ok && cands(q).some((x) => x.id === c.id) ? render(q, c.id, { quality: true }).flowRows ?? {} : null;
      const ch = b ? rowsChanged(a, b) : ['(候補がない)'];
      if (ch.length || Object.keys(a).some((id) => !(id in b))) { res.changed++; res.list.push({ file, candidate: c.id, ids: ch.slice(0, 5) }); }
    }
  }
  return res;
}
export function runFlowAb({ log = () => {} } = {}) {
  const t0 = performance.now();
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const inputs = [];
  for (const [dir, defView] of [['tests/view/symbols-action', 'action'], ['tests/view/symbols-state', 'state']]) {
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const c of man.cases) inputs.push({ group: 'symbols', file: `${dir}/${c.file}`, text: fs.readFileSync(path.join(dir, c.file), 'utf8'), only: c.candidate ?? null, view: c.view ?? defView });
  }
  for (const view of ['action', 'state']) {
    inputs.push({ group: 'sample', file: 'src/app/sample.sysml', text: sample, view });
    for (const f of files) inputs.push({ group: 'files', file: f, text: decodeUtf8(fs.readFileSync(f)), view });
  }
  const items = [];
  const robust = { candidates: 0, edges: 0, changedEnd: 0, changedStart50: 0, rowsCandidates: 0, rowsChanged: 0, list: [] };
  for (const inp of inputs) {
    const [render, cands] = inp.view === 'state' ? [renderStateTransition, (p) => p.stateCandidates] : [renderActionFlow, (p) => p.actionCandidates];
    const p = prepareView(inp.text);
    if (!p.ok) continue;
    let cs = cands(p);
    if (inp.group === 'symbols') cs = inp.only ? cs.filter((c) => c.id === inp.only) : cs.slice(0, 1);
    let pEnd = null, pStart = null;
    if (inp.group !== 'symbols') { pEnd = prepareView(inp.text + APPEND_F); pStart = prepareView(PREPEND50_F + inp.text); }
    for (const c of cs) {
      const A = flowSnap(render, p, c.id, false), B = flowSnap(render, p, c.id, true);
      items.push({ group: inp.group, view: inp.view, file: inp.file, candidate: c.id, body: A.body, before: A.q, after: B.q, edges: A.edges.length,
        svg: A.svg !== B.svg, structure: A.structure !== B.structure, structureSideFree: A.structureSideFree !== B.structureSideFree });
      // 書き足しへの強さ(切り替え後)。アクションフロービューと、本体の図を持つ状態遷移ビューの候補
      if (pEnd && (inp.view === 'action' || B.body)) {
        robust.candidates++;
        robust.edges += B.edges.length;
        const has = (q) => q.ok && cands(q).some((x) => x.id === c.id);
        const E = has(pEnd) ? flowSnap(render, pEnd, c.id, true) : null;
        const S = has(pStart) ? flowSnap(render, pStart, c.id, true) : null;
        const e1 = E ? sameRelativeOrder(B.edges, E.edges, 0) : null;
        const e2 = S ? sameRelativeOrder(B.edges, S.edges, PREPEND50_F.length) : null;
        if (!e1 || !e1.same || e1.common !== B.edges.length) { robust.changedEnd++; robust.list.push({ file: inp.file, candidate: c.id, where: 'end' }); }
        if (!e2 || !e2.same || e2.common !== B.edges.length) { robust.changedStart50++; robust.list.push({ file: inp.file, candidate: c.id, where: 'start50' }); }
        if (Object.keys(B.rows).length) {
          robust.rowsCandidates++;
          const ch = E ? rowsChanged(B.rows, E.rows) : ['(候補がない)'];
          if (ch.length || (E && Object.keys(B.rows).some((id) => !(id in E.rows)))) { robust.rowsChanged++; robust.list.push({ file: inp.file, candidate: c.id, where: 'rows', ids: ch.slice(0, 5) }); }
        }
      }
    }
    log(`${inp.view} ${inp.file}`);
  }
  const tot = (x) => x.slice(0, 5).reduce((s, v) => s + v, 0);
  const summary = {};
  for (const view of ['action', 'state']) for (const g of ['symbols', 'sample', 'files']) for (const body of [true, false]) {
    const xs = items.filter((x) => x.view === view && x.group === g && (view === 'action' || x.body === body));
    if (view === 'action' && !body) continue;
    const key = view === 'action' ? `action ${g}` : `state ${g} ${body ? '本体の図あり' : '本体の図なし'}`;
    const sum = (k) => xs.reduce((a, x) => a.map((v, i) => v + x[k][i]), [0, 0, 0, 0, 0, 0]);
    summary[key] = {
      candidates: xs.length, withBody: xs.filter((x) => x.body).length, sumBefore: sum('before'), sumAfter: sum('after'),
      less: xs.filter((x) => tot(x.after) < tot(x.before)).length, same: xs.filter((x) => tot(x.after) === tot(x.before)).length, more: xs.filter((x) => tot(x.after) > tot(x.before)).length,
      perLabel: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((l, i) => [l, { less: xs.filter((x) => x.after[i] < x.before[i]).length, more: xs.filter((x) => x.after[i] > x.before[i]).length }])),
      svgChanged: xs.filter((x) => x.svg).length, structureChanged: xs.filter((x) => x.structure).length, structureChangedSideFree: xs.filter((x) => x.structureSideFree).length,
    };
  }
  return { summary, robust, items, wallMs: Math.round(performance.now() - t0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) && process.argv.includes('--flow')) {
  const r = runFlowAb();
  fs.mkdirSync('out/view', { recursive: true });
  fs.writeFileSync('out/view/ab_flow.json', JSON.stringify(r, null, 1) + '\n');
  for (const [k, s] of Object.entries(r.summary)) console.log(`${k}: ${JSON.stringify(s)}`);
  const R = r.robust;
  console.log(`書き足し(切り替え後): 候補 ${R.candidates}、線 ${R.edges}、末尾に 1 行で線の順番が変わった候補 ${R.changedEnd}、先頭に 50 行で変わった候補 ${R.changedStart50}、段のある候補 ${R.rowsCandidates}、末尾に 1 行で段が変わった候補 ${R.rowsChanged}`);
  for (const it of r.items.filter((x) => x.before.join() !== x.after.join())) console.log(`  ${it.view} ${it.group} ${it.file} [${it.candidate}] ${it.before.join('・')} → ${it.after.join('・')}`);
  console.log(`所要 ${(r.wallMs / 1000).toFixed(1)} 秒`);
} else if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = runAb();
  fs.mkdirSync('out/view', { recursive: true });
  fs.writeFileSync('out/view/ab_compare.json', JSON.stringify(r, null, 1) + '\n');
  for (const view of Object.keys(VIEWS)) {
    for (const [g, s] of Object.entries(r[view].summary)) console.log(`${view} ${g}: ${JSON.stringify(s)}`);
    const R = r[view].robust;
    for (const m of ['before', 'after']) console.log(`${view} 書き足し(${m === 'before' ? '切り替え前' : '切り替え後'}): 候補 ${R[m].candidates}、線 ${R[m].edges}、末尾で順番が変わった候補 ${R[m].changedEnd}、先頭で順番が変わった候補 ${R[m].changedStart}、(参考)先頭に 50 行で順番が変わった候補 ${R[m].changedStart50}`);
    for (const it of r[view].items.filter((x) => x.before.join() !== x.after.join())) console.log(`  ${it.group} ${it.file} [${it.candidate}] ${it.before.join('・')} → ${it.after.join('・')}`);
  }
  console.log(`所要 ${(r.wallMs / 1000).toFixed(1)} 秒`);
}
