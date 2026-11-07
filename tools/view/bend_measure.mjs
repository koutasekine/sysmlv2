// GR11(P1 の試しで作り、P2 の全数比較に使う): 図の質 (a)〜(h) と、あわせて数えるもの(Σk・まっすぐの線・4 回以上曲がる線・線の長さの比)を、
// 5 つのビューの 309 ファイルの全候補・例の候補・記号ごとの最小の入力・生徒の規模の入力で数える。
//
// 使い方:
//   node tools/view/bend_measure.mjs --out <フォルダ> [--bend A,C,Dx=2400,R] [--views general,interconnection,...] [--robust] [--time]
//     --bend    一般ビューの案(src/view/index.js の BEND の項目)を 1 回の描画だけ入れる。書かない項目は切る(既定の BEND によらない)。
//               --bend off ならすべて切る。--bend を書かなければ、既定の BEND で描く
//     --robust  書き足しへの強さ(一般ビュー。末尾に 1 行・先頭に 1 行・先頭に 50 行)も数える
//     --time    品質を数えない描画の時間も、候補ごとに測る(単独のプロセスで流すこと)
// 出力: <フォルダ>/measure.json(候補ごとの値)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prepareView, renderInterconnection, renderStateTransition, renderActionFlow, renderSequence, renderGeneral } from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out');
if (!OUT) { console.error('--out を指定する'); process.exit(2); }
const OFF = { A: false, C: false, Dx: 0, R: false };
const bend = arg('--bend') ? { ...OFF, ...Object.fromEntries(arg('--bend').split(',').filter((k) => k && k !== 'off').map((k) => { const [a, v] = k.split('='); return [a, v === undefined ? true : isNaN(+v) ? v : +v]; })) } : null;
const VIEWS = (arg('--views') ?? 'general,interconnection,state,action,sequence').split(',');
const ROBUST = process.argv.includes('--robust'), TIME = process.argv.includes('--time');

const R = {
  interconnection: [renderInterconnection, (p) => p.candidates, 'tests/view/symbols'],
  state: [renderStateTransition, (p) => p.stateCandidates, 'tests/view/symbols-state'],
  action: [renderActionFlow, (p) => p.actionCandidates, 'tests/view/symbols-action'],
  sequence: [renderSequence, (p) => p.sequenceCandidates, 'tests/view/symbols-sequence'],
  general: [renderGeneral, (p) => p.generalCandidates, 'tests/view/symbols-general'],
};
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const sideFree = (s) => s.replace(/"proxy-[vh]"/g, '"proxy"').replace(/"param-[lrtb]"/g, '"param"');

function snap(view, render, p, cid, opts = {}) {
  const o = { quality: true, keepDiagram: true, ...(view === 'general' && bend ? { bend } : {}), ...opts };
  const r = render(p, cid, o);
  const q = r.quality, d = r.diagram;
  const bs = q.bends;
  const orth = bs.filter((b) => b.orth);
  const ratios = bs.filter((b) => b.man > 0).map((b) => b.len / b.man);
  const s = r.structure;
  const sorted = [...s.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    r, d,
    q: [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, orth.reduce((a, b) => a + b.h, 0)],
    sumK: orth.reduce((a, b) => a + b.k, 0), edges: bs.length, nonOrth: bs.length - orth.length, straight: orth.filter((b) => b.k === 0).length, k4: orth.filter((b) => b.k >= 4).length,
    ratioSum: ratios.reduce((a, b) => a + b, 0), ratioN: ratios.length, ratioMax: ratios.length ? Math.max(...ratios) : 0,
    w: d.width, h: d.height, svg: hash(r.svg), structure: hash(sideFree(JSON.stringify({ ...s, edges: sorted }))), diag: hash(JSON.stringify(r.diagnostics)),
    perEdge: bs.filter((b) => b.h > 0).map((b) => ({ id: b.id, k: b.k, m: b.m })),
  };
}

// 書き足しへの強さ: 線の順番(ab_compare.mjs の sameRelativeOrder と同じ)と、同じ段の並び(段と、段の中の左から右の順)
const edgeKey = (e, shift) => `${e.symbol}|${e.src ? `${e.src[0] + shift},${e.src[1] + shift}` : '-'}|${e.id.replace(/^e\d+/, '')}`;
function sameRelativeOrder(orig, added, shift) {
  const ko = orig.map((e) => edgeKey(e, shift)), ka = added.map((e) => edgeKey(e, 0));
  const so = new Set(ko), sa = new Set(ka);
  const a1 = ko.filter((k) => sa.has(k)), a2 = ka.filter((k) => so.has(k));
  return a1.join('\n') === a2.join('\n') && a1.length === ko.length;
}
function rowsOf(d, shift) {
  // 段の要素(flowItemPos)を、原文の位置で引けるようにする。段 → 左から右の原文の位置の並び
  const rows = new Map();
  for (const [id, k] of d.flowItemPos ?? []) {
    const o = d.objects.get(id);
    if (!o?.src) continue;
    const key = `${k.region.owner?.src?.[0] ?? 'top'}|${o.src[0] + shift}`;
    rows.set(key, { r: k.r, c: k.c[1], region: k.region.owner?.src?.[0] ?? 'top' });
  }
  return rows;
}
function sameRows(a, b) {
  // a・b: key → { r, c, region }。両方にある要素について、段が同じで、段の中の順が同じか
  const common = [...a.keys()].filter((k) => b.has(k));
  for (const k of common) if (a.get(k).r !== b.get(k).r) return false;
  const seq = (m) => { const g = new Map(); for (const k of common) { const v = m.get(k); const gk = `${v.region}|${v.r}`; if (!g.has(gk)) g.set(gk, []); g.get(gk).push([v.c, k]); } for (const l of g.values()) l.sort((x, y) => x[0] - y[0]); return [...g.entries()].map(([gk, l]) => `${gk}:${l.map((x) => x[1]).join(',')}`).sort().join('\n'); };
  return seq(a) === seq(b);
}

const APPEND1 = '\npart def GR7_Appended;\n', PREPEND1 = 'part def GR7_Prepended;\n';
const PREPEND50 = Array.from({ length: 50 }, (_, i) => `part def GR7_P${i};\n`).join('');

const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
const student = fs.readFileSync('tests/view/general/student-scale.sysml', 'utf8');
const items = [];
const t0 = performance.now();
for (const view of VIEWS) {
  const [render, cands, symDir] = R[view];
  const inputs = [];
  const man = JSON.parse(fs.readFileSync(path.join(symDir, 'manifest.json'), 'utf8'));
  for (const c of man.cases) inputs.push({ group: 'symbols', file: `${symDir}/${c.file}`, text: fs.readFileSync(path.join(symDir, c.file), 'utf8'), only: c.candidate ?? null, alt: view === 'action' && c.view === 'state' });
  inputs.push({ group: 'sample', file: 'src/app/sample.sysml', text: sample });
  inputs.push({ group: 'student', file: 'tests/view/general/student-scale.sysml', text: student });
  for (const f of files) inputs.push({ group: 'files', file: f, text: decodeUtf8(fs.readFileSync(f)) });
  for (const inp of inputs) {
    const p = prepareView(inp.text);
    if (!p.ok) continue;
    const rr = inp.alt ? renderStateTransition : render;
    let cs = (inp.alt ? p.stateCandidates : cands(p));
    if (inp.group === 'symbols') cs = inp.only ? cs.filter((c) => c.id === inp.only) : cs.slice(0, 1);
    // 例のパッケージそのもの(一般ビュー。候補の一覧を差し替えて描く。GR10 P2 と同じ)
    if (view === 'general' && inp.group === 'sample') {
      const pk = p.ctx.members(p.ctx.tree).map((x) => x.el).find((e) => p.ctx.is(e, 'Package'));
      if (pk) { p.generalCandidates = [...p.generalCandidates, { id: 'package:sample', kind: 'package', label: 'package (例)', el: pk }]; cs = p.generalCandidates; }
    }
    let variants = null;
    if (ROBUST && view === 'general' && inp.group !== 'symbols') variants = [['end', inp.text + APPEND1, 0], ['start', PREPEND1 + inp.text, PREPEND1.length], ['start50', PREPEND50 + inp.text, PREPEND50.length]].map(([k, t, sh]) => [k, prepareView(t), sh]);
    for (const c of cs) {
      let ms = null;
      if (TIME) { const a = performance.now(); rr(p, c.id, view === 'general' && bend ? { bend } : {}); ms = performance.now() - a; }
      const S = snap(view, rr, p, c.id);
      const it = { view, group: inp.group, file: inp.file, candidate: c.id, ms, ...S, r: undefined, d: undefined };
      if (variants) {
        it.robust = {};
        const base = S.r.structure.edges, rows0 = rowsOf(S.d, 0);
        for (const [k, q, sh] of variants) {
          let pc = q.ok ? q.generalCandidates.find((x) => x.id === c.id) : null;
          if (!pc && c.id === 'package:sample' && q.ok) { const pk = q.ctx.members(q.ctx.tree).map((x) => x.el).find((e) => q.ctx.is(e, 'Package')); if (pk) { q.generalCandidates = [...q.generalCandidates.filter((x) => x.id !== 'package:sample'), { id: 'package:sample', kind: 'package', label: 'package (例)', el: pk }]; pc = true; } }
          if (!pc) { it.robust[k] = { order: false, rows: false, missing: true }; continue; }
          const T = render(q, c.id, { quality: true, keepDiagram: true, ...(bend ? { bend } : {}) });
          it.robust[k] = { order: sameRelativeOrder(base, T.structure.edges, sh), rows: sameRows(rows0, remap(rowsOf(T.diagram, 0), rows0, sh)) };
        }
      }
      items.push(it);
    }
  }
  console.error(`${view} 終わり ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
}
// 書き足したテキストの段の要素の鍵を、元のテキストの原文の位置に戻す(先頭に足した分を引く)
function remap(rows, rows0, sh) {
  const out = new Map();
  for (const [k, v] of rows) { const [reg, s] = k.split('|'); const r2 = reg === 'top' ? 'top' : String(+reg - sh); out.set(`${r2}|${+s - sh}`, { ...v, region: r2 === 'top' ? 'top' : +r2 }); }
  return out;
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify({ bend, views: VIEWS, wallMs: Math.round(performance.now() - t0), items }) + '\n');
console.error(`書いた: ${path.join(OUT, 'measure.json')}(${items.length} 件、${((performance.now() - t0) / 1000).toFixed(1)} 秒)`);
