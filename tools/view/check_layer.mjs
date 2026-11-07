// アクションフローの図の配置の切り替え(src/view/index.js の FLOW_LAYERS)の、切り替え前と後を左右に並べた確認用の画像(GR8)。
//
// 使い方:
//   node tools/view/check_layer.mjs     # → out/view/check-layer/<名前>.png と index.json
//
// 例の手順の図、アクションフロービューの記号ごとの入力(tests/view/symbols-action/。view が 'state' の項目は状態遷移ビュー)、
// 309 ファイルのうち配置の変化を見るための 6 候補を、描く関数の opts.flowLayers を false(左、切り替え前)と
// true(右、切り替え後)にして描き、見出しに (a)〜(f) の件数を書いて並べる(並べるのは rsvg-convert)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareView, renderActionFlow, renderStateTransition } from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const OUT = 'out/view/check-layer';
const SRC = 'vendor/release-2026-03/sysml/src';

const jobs = [{ name: 'sample_procedure', text: fs.readFileSync('src/app/sample.sysml', 'utf8'), cand: 'view:見守りシステムの例::手順の図' }];
const man = JSON.parse(fs.readFileSync('tests/view/symbols-action/manifest.json', 'utf8'));
for (const c of man.cases) jobs.push({ name: `sym_${c.file.replace('.sysml', '')}`, text: fs.readFileSync(path.join('tests/view/symbols-action', c.file), 'utf8'), cand: c.candidate ?? null, state: c.view === 'state' });
for (const [name, file, cand] of [
  ['f_TakePicture_Succession1', `${SRC}/training/14. Action Definitions/Action Succession Example-1.sysml`, 'action:Action Succession Example-1::TakePicture'],
  ['f_MergeExample', `${SRC}/training/17. Control/Merge Example.sysml`, 'action:Merge Example::takePicture'],
  ['f_ControlNodeTest', `${SRC}/examples/Simple Tests/ControlNodeTest.sysml`, 'action:ControlNodeTest'],
  ['f_3a-1_providePower', `${SRC}/validation/03-Function-based Behavior/3a-Function-based Behavior-1.sysml`, 'action:3a-Function-based Behavior-1::Usages::provide power'],
  ['f_ActionTest_a2', `${SRC}/examples/Simple Tests/ActionTest.sysml`, 'action:ActionTest::a2'],
  ['f_Actions_Action', 'vendor/release-2026-03/sysml.library/Systems Library/Actions.sysml', 'action:Actions::Action'],
]) jobs.push({ name, text: decodeUtf8(fs.readFileSync(file)), cand });

const dims = (svg) => { const m = /<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg); return [+m[1], +m[2]]; };
const body = (svg) => svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
fs.mkdirSync(OUT, { recursive: true });
const list = [];
for (const j of jobs) {
  const p = prepareView(j.text);
  const r = {};
  for (const [k, flowLayers] of [['before', false], ['after', true]]) {
    const res = (j.state ? renderStateTransition : renderActionFlow)(p, j.cand, { quality: true, flowLayers });
    const q = res.quality;
    r[k] = { svg: res.svg, q: [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length], edges: res.structure.edges.length, cand: res.candidate.id };
  }
  const [w1, h1] = dims(r.before.svg), [w2, h2] = dims(r.after.svg);
  const W = w1 + w2 + 60, H = Math.max(h1, h2) + 40;
  const head = (x, t) => `<text x="${x}" y="20" font-family="sans-serif" font-size="14" font-weight="bold">${t}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${head(10, `切り替え前 (a)〜(f) ${r.before.q.join('・')}`)}${head(w1 + 50, `切り替え後 (a)〜(f) ${r.after.q.join('・')}`)}<line x1="${w1 + 30}" y1="0" x2="${w1 + 30}" y2="${H}" stroke="#c00" stroke-width="2"/><svg x="10" y="30" width="${w1}" height="${h1}">${body(r.before.svg)}</svg><svg x="${w1 + 50}" y="30" width="${w2}" height="${h2}">${body(r.after.svg)}</svg></svg>`;
  const f = path.join(OUT, `${j.name}.svg`);
  fs.writeFileSync(f, svg);
  execFileSync('rsvg-convert', ['-z', '1.2', f, '-o', f.replace(/\.svg$/, '.png')]);
  fs.unlinkSync(f);
  list.push({ png: f.replace(/\.svg$/, '.png'), view: j.state ? 'state' : 'action', candidate: r.after.cand, edges: r.after.edges, before: r.before.q.join('・'), after: r.after.q.join('・'), changed: r.before.svg !== r.after.svg });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(list, null, 1) + '\n');
for (const x of list) console.log(`${x.png}\t${x.view}\t${x.candidate}\t線 ${x.edges}\t${x.before} → ${x.after}\t${x.changed ? '変わった' : '同じ'}`);
