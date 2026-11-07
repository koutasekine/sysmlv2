// GR15 の R(行為者に着く線を棒人間の図形に着ける)の確認用の画像(GR15 指示書 5 章)。R を切ったもの(前)と入れたもの(後)を
// 左右に並べた画像を作る(左が前、右が後)。tools/view/gr14_images.mjs と同じ作り。
//
// 使い方:
//   node tools/view/gr15_images.mjs [--out out/view/check-gr15]
//   入力: 例の「要求の図」(一般ビュー)、tests/view/symbols-general/gr12-use-case.sysml(一般ビュー)、記号ごとの入力の
//   tests/view/symbols/requirement.sysml(相互接続ビュー。R で線の端が変わる)、309 ファイルの一般ビューの候補のうち、行為者に
//   着く線を持つもの(記述の順に最初の 2 つ)
// 出力: <フォルダ>/<名前>.{before,after}.{svg,png}、<名前>.compare.png、values.json(前と後の (a)〜(h)・行為者の線の端・大きさ)、index.md
//
//   node tools/view/gr15_images.mjs --r2 [--out out/view/check-gr15/r2]
//   R2(左右から来る線を手の先に。GR15 v15.2 の指示書 5 章)の前(R だけ)と後(R と R2)。入力は tests/view/symbols/requirement.sysml
//   (左から行為者に着く線)と、例の「要求の図」(上から着く線が変わらないこと)。端の欄に、左右から着く端と手の先から離れた端の数も書く

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as V from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';
import { gr15Counts } from './edge_quality.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const R2 = process.argv.includes('--r2');
const OUT = arg('--out') ?? (R2 ? 'out/view/check-gr15/r2' : 'out/view/check-gr15');
const RENDER = { interconnection: ['renderInterconnection', 'candidates'], general: ['renderGeneral', 'generalCandidates'] };

// 309 ファイルの一般ビューの候補のうち、行為者に着く線を持つものを記述の順に 2 つ
const withActors = [];
if (!R2) for (const f of fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean)) {
  if (withActors.length >= 2) break;
  const p = V.prepareView(decodeUtf8(fs.readFileSync(f)));
  if (!p.ok) continue;
  for (const c of p.generalCandidates) {
    const r = V.renderGeneral(p, c.id, { quality: true, keepDiagram: true });
    if (gr15Counts(r.diagram).actorEnds) { withActors.push([`files-${withActors.length + 1}`, f, 'general', c.id]); break; }
  }
}
const inputs = R2 ? [
  ['symbols-requirement', 'tests/view/symbols/requirement.sysml', 'interconnection', 'part:P'],
  ['sample-youkyuu', 'src/app/sample.sysml', 'general', 'view:見守りシステムの例::要求の図'],
] : [
  ['sample-youkyuu', 'src/app/sample.sysml', 'general', 'view:見守りシステムの例::要求の図'],
  ['gr12-use-case', 'tests/view/symbols-general/gr12-use-case.sysml', 'general', null],
  ['symbols-requirement', 'tests/view/symbols/requirement.sysml', 'interconnection', 'part:P'],
  ...withActors,
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const values = {};
const index = R2 ? ['# GR15 の確認用の画像(R2)', '', '左が前(R だけ)、右が後(R と R2。既定)。「端」は行為者に着く線の端の数・図形の外の数・左右から着く数・手の先から 2 px より離れた数。', '',
  '| 名前 | ファイル | ビュー | 候補 | 前 (a)〜(h)・端 | 後 (a)〜(h)・端 | 大きさ 前 → 後 |', '|---|---|---|---|---|---|---|']
  : ['# GR15 の確認用の画像(R)', '', '左が前(R を切ったもの)、右が後(R を入れたもの。既定)。「端」は行為者に着く線の端の数と、そのうち棒人間の図形(2 px 広げたもの)の外にある数。', '',
  '| 名前 | ファイル | ビュー | 候補 | 前 (a)〜(h)・端 | 後 (a)〜(h)・端 | 大きさ 前 → 後 |', '|---|---|---|---|---|---|---|'];
fs.mkdirSync(OUT, { recursive: true });
for (const [name, file, view, cid] of inputs) {
  const text = decodeUtf8(fs.readFileSync(file));
  const [fn, cands] = RENDER[view];
  const out = {};
  for (const [side, R] of [['before', false], ['after', true]]) {
    const p = V.prepareView(text);
    const id = cid ?? p[cands][0]?.id;
    const r = V[fn](p, id, { quality: true, keepDiagram: true, fig15: R2 ? { R: true, R2: R } : { R } });
    const q = r.quality;
    const g = gr15Counts(r.diagram);
    out[side] = { q: [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)], ends: R2 ? [g.actorEnds, g.actorOutside, g.actorSide, g.actorOffHand] : [g.actorEnds, g.actorOutside], w: r.diagram.width, h: r.diagram.height, candidate: r.candidate.id };
    fs.writeFileSync(path.join(OUT, `${name}.${side}.svg`), r.svg);
    out[side].z = Math.min(1, 16000 / Math.max(r.diagram.width, r.diagram.height));
    execFileSync('rsvg-convert', ['-z', String(out[side].z), '-b', 'white', '-o', path.join(OUT, `${name}.${side}.png`), path.join(OUT, `${name}.${side}.svg`)]);
  }
  values[name] = { file, view, ...out };
  const sides = ['before', 'after'];
  const W = sides.map((s) => Math.ceil(out[s].w * out[s].z)), H = sides.map((s) => Math.ceil(out[s].h * out[s].z));
  const fmt = (x) => `(a)〜(h) ${x.q.join('・')} 端 ${x.ends[0]}・外 ${x.ends[1]}${R2 ? `・左右 ${x.ends[2]}・手の先から離れた ${x.ends[3]}` : ''}`;
  let x = 0, body = '';
  sides.forEach((s, k) => { body += `<text x="${x}" y="24" font-family="sans-serif" font-size="16">${esc(`${s === 'before' ? '前' : '後'} ${fmt(out[s])}`)}</text><image x="${x}" y="36" width="${W[k]}" height="${H[k]}" xlink:href="${name}.${s}.png"/>`; x += W[k] + 30; });
  fs.writeFileSync(path.join(OUT, `${name}.compose.svg`), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.max(x - 30, 600)}" height="${Math.max(...H) + 40}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`);
  const zc = Math.min(1, 30000 / Math.max(x - 30, Math.max(...H) + 40));
  execFileSync('rsvg-convert', ['-z', String(zc), '-o', `${name}.compare.png`, `${name}.compose.svg`], { cwd: OUT });
  index.push(`| ${name} | \`${file}\` | ${view} | \`${out.after.candidate}\` | ${fmt(out.before)} | ${fmt(out.after)} | ${out.before.w}×${out.before.h} → ${out.after.w}×${out.after.h} |`);
  console.log(name, fmt(out.before), '→', fmt(out.after));
}
fs.writeFileSync(path.join(OUT, 'values.json'), JSON.stringify(values, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'index.md'), index.join('\n') + '\n');
console.log(`→ ${OUT}`);
