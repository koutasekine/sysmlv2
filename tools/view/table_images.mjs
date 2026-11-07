// 表と保存する図・表の確認用の画像(GR13 指示書 7 章)。
//
// 使い方:
//   node tools/view/table_images.mjs [--out out/view/check-table]
//
// 作るもの(rsvg-convert で SVG を PNG にする):
//   sample_grid.png                        例の view '部品と要求の表' の画面の表(4 つの表と題)
//   sample_grid_<表の題>.png               例の表を 1 つずつ保存したもの(src/view/pieces.js の pieceSvg。題を入れない)
//   sample_<ビュー>_<範囲の名前>.png       例の 5 つのビューの図を保存したもの(左上の名前のタブを含む。ビューごとに、型がそのビューの view)
//   most_rows.png                          309 ファイルの表のうち、行の最も多い表を保存したもの
//   index.json                             作った画像の一覧と、行の最も多い表の出どころ
// ボタンを置いた画面の画像は、ヘッドレスのブラウザがこの環境にないので作らない(報告に書く)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareView, renderInterconnection, renderGeneral, renderStateTransition, renderActionFlow, renderSequence } from '../../src/view/index.js';
import { renderTables } from '../../src/view/table.js';
import { pieceSvg, pieceBase, tableBase } from '../../src/view/pieces.js';
import { standardViewOf } from '../../src/view/scope.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'out/view/check-table';
fs.mkdirSync(OUT, { recursive: true });
const list = [];
const png = (name, svg, z = 1.5) => {
  const f = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(f, svg);
  execFileSync('rsvg-convert', ['-z', String(z), '-b', 'white', '-o', f.replace(/\.svg$/, '.png'), f]);
  list.push(f.replace(/\.svg$/, '.png'));
};

// 例
const p = prepareView(fs.readFileSync('src/app/sample.sysml', 'utf8'));
const r = renderTables(p);
png('sample_grid', r.svg);
for (const t of r.tables) if (!t.empty) png(tableBase({ file: 'sample', title: t.name }), pieceSvg(t.svg));
for (const [view, render, cands] of [['interconnection', renderInterconnection, p.candidates], ['general', renderGeneral, p.generalCandidates], ['state-transition', renderStateTransition, p.stateCandidates], ['action-flow', renderActionFlow, p.actionCandidates], ['sequence', renderSequence, p.sequenceCandidates]]) {
  const c = cands.find((x) => x.kind === 'view' && standardViewOf(p.ctx, x.el) === view) ?? cands[0];
  const x = render(p, c.id);
  png(pieceBase({ file: 'sample', view, scope: p.ctx.nameOf(c.el) ?? c.label }), pieceSvg(x.svg), 1);
}

// 309 ファイルで行の最も多い表
let most = null;
for (const f of fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean)) {
  const q = prepareView(decodeUtf8(fs.readFileSync(f)));
  if (!q.ok) continue;
  for (const c of q.tableCandidates) {
    const x = renderTables(q, c.id);
    for (const t of x.tables) if (!t.empty && (!most || t.rows.length > most.rows)) most = { file: f, candidate: c.id, table: t.name, rows: t.rows.length, svg: t.svg };
  }
}
if (most) png('most_rows', pieceSvg(most.svg), 1);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ images: list, mostRows: most && { file: most.file, candidate: most.candidate, table: most.table, rows: most.rows } }, null, 1) + '\n');
console.log(`${list.length} 枚 → ${OUT}`);
if (most) console.log(`行の最も多い表: ${most.rows} 行(${most.file} ${most.candidate} の「${most.table}」)`);
