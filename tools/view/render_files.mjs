// 309 ファイル(受理した 305 件)の、描く範囲の候補をすべて描く(GR4 指示書 5 章・8 章の 1・2)。
//
// 使い方:
//   node tools/view/render_files.mjs                 # → out/view/render309.json
//   node tools/view/render_files.mjs --svg out/view/svg309   # 各候補の SVG も書き出す
//   node tools/view/render_files.mjs --state         # 状態遷移ビュー(GR6)の候補 → out/view/render309_state.json
//   node tools/view/render_files.mjs --state --svg out/view/svg309_state
//   node tools/view/render_files.mjs --action        # アクションフロービュー(GR7)の候補 → out/view/render309_action.json
//   node tools/view/render_files.mjs --sequence      # シーケンスビュー(GR9)の候補 → out/view/render309_sequence.json
//   node tools/view/render_files.mjs --general       # 一般ビュー(GR10)の候補 → out/view/render309_general.json
//
// 各ファイルを解析と名前解決し(src/view の prepareView)、候補ごとに 2 回描いて、SVG の文字列と構造が一致するかを比べる
// (2 回目は prepareView からやり直す)。例外は件数と内容を記録する。

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { prepareView, renderInterconnection, renderStateTransition, renderActionFlow, renderSequence, renderGeneral } from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const svgDir = process.argv.includes('--svg') ? process.argv[process.argv.indexOf('--svg') + 1] : null;
const stateView = process.argv.includes('--state');
const actionView = process.argv.includes('--action');
const sequenceView = process.argv.includes('--sequence');
const generalView = process.argv.includes('--general');

// view が 'state' なら状態遷移ビューの候補(prepareView の stateCandidates)、'action' ならアクションフロービューの候補
// (actionCandidates。GR7)を描く。'sequence' ならシーケンスビューの候補(sequenceCandidates。GR9)、'general' なら一般ビューの候補
// (generalCandidates。GR10)
export function renderAll({ svgDir = null, log = () => {}, view = 'interconnection' } = {}) {
  const st = view === 'state', ac = view === 'action', sq = view === 'sequence', ge = view === 'general';
  const render = st ? renderStateTransition : ac ? renderActionFlow : sq ? renderSequence : ge ? renderGeneral : renderInterconnection;
  const candsOf = (p) => (st ? p.stateCandidates : ac ? p.actionCandidates : sq ? p.sequenceCandidates : ge ? p.generalCandidates : p.candidates);
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const res = { files: files.length, parsed: 0, rejected: 0, candidates: 0, viewCandidates: 0, rendered: 0, empty: 0, exceptions: [], mismatches: [], symbols: {}, diagnostics: {}, msTotal: 0, slowest: null };
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    let p1, p2;
    try { p1 = prepareView(text); } catch (e) { res.exceptions.push({ file: f, where: 'prepare', message: String(e?.stack ?? e).slice(0, 600) }); continue; }
    if (!p1.ok) { res.rejected++; continue; }
    res.parsed++;
    res.candidates += candsOf(p1).length;
    res.viewCandidates += candsOf(p1).filter((c) => c.kind === 'view').length;
    try { p2 = prepareView(text); } catch (e) { res.exceptions.push({ file: f, where: 'prepare2', message: String(e?.stack ?? e).slice(0, 600) }); continue; }
    for (const c of candsOf(p1)) {
      let r1, r2;
      const t0 = performance.now();
      try { r1 = render(p1, c.id); } catch (e) { res.exceptions.push({ file: f, candidate: c.id, where: 'render', message: String(e?.stack ?? e).slice(0, 600) }); continue; }
      const ms = performance.now() - t0;
      res.msTotal += ms;
      if (!res.slowest || ms > res.slowest.ms) res.slowest = { file: f, candidate: c.id, ms: Math.round(ms * 10) / 10 };
      try { r2 = render(p2, c.id); } catch (e) { res.exceptions.push({ file: f, candidate: c.id, where: 'render2', message: String(e?.stack ?? e).slice(0, 600) }); continue; }
      res.rendered++;
      const s1 = JSON.stringify(r1.structure), s2 = JSON.stringify(r2.structure);
      if (r1.svg !== r2.svg || s1 !== s2) res.mismatches.push({ file: f, candidate: c.id, svg: r1.svg !== r2.svg, structure: s1 !== s2 });
      if (!r1.structure.nodes.length) res.empty++;
      for (const n of r1.structure.nodes) res.symbols[n.symbol] = (res.symbols[n.symbol] ?? 0) + 1;
      for (const e of r1.structure.edges) { res.symbols[e.symbol] = (res.symbols[e.symbol] ?? 0) + 1; for (const m of e.markers) res.symbols[m] = (res.symbols[m] ?? 0) + 1; }
      for (const n of r1.structure.nodes) for (const c2 of n.compartments ?? []) res.symbols[c2.symbol] = (res.symbols[c2.symbol] ?? 0) + 1;
      for (const dg of r1.diagnostics) res.diagnostics[dg.code] = (res.diagnostics[dg.code] ?? 0) + 1;
      if (svgDir) {
        const name = `${f.replace(/^vendor\/release-2026-03\/sysml\//, '').replace(/[\/ ]/g, '_')}__${c.id.replace(/[^\w.-]+/g, '_').slice(0, 80)}.svg`;
        fs.mkdirSync(svgDir, { recursive: true });
        fs.writeFileSync(path.join(svgDir, name), r1.svg);
      }
    }
    log(f);
  }
  res.msTotal = Math.round(res.msTotal);
  res.symbols = Object.fromEntries(Object.entries(res.symbols).sort());
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const t0 = performance.now();
  const r = renderAll({ svgDir, view: stateView ? 'state' : actionView ? 'action' : sequenceView ? 'sequence' : generalView ? 'general' : 'interconnection' });
  r.wallMs = Math.round(performance.now() - t0);
  fs.mkdirSync('out/view', { recursive: true });
  fs.writeFileSync(stateView ? 'out/view/render309_state.json' : actionView ? 'out/view/render309_action.json' : sequenceView ? 'out/view/render309_sequence.json' : generalView ? 'out/view/render309_general.json' : 'out/view/render309.json', JSON.stringify(r, null, 1) + '\n');
  console.log(`files=${r.files} parsed=${r.parsed} rejected=${r.rejected} candidates=${r.candidates}(view ${r.viewCandidates}) rendered=${r.rendered} empty=${r.empty} exceptions=${r.exceptions.length} mismatches=${r.mismatches.length} renderMs=${r.msTotal} wallMs=${r.wallMs} slowest=${JSON.stringify(r.slowest)}`);
  for (const e of r.exceptions.slice(0, 5)) console.log(`  例外: ${e.file} ${e.candidate ?? ''} ${e.where}\n    ${e.message.split('\n').slice(0, 3).join('\n    ')}`);
  console.log(`diagnostics=${JSON.stringify(r.diagnostics)}`);
  if (r.exceptions.length || r.mismatches.length) process.exitCode = 1;
}
