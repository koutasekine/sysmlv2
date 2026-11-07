// GR11(P1 の試しで作り、P2 でも使う): 5 つの入力を、今と案ごとに描き、左右に並べた画像(左が今、右が案)を作る(指示書 5.4 節・6 章)。
//   node tools/view/bend_images.mjs --out <フォルダ> --variants 'A=A;C=C;ACDx=A,C,Dx=2400' [--set p3]
//   --set p3 なら、入力を、例の 5 つの view の候補と生徒の規模の入力にする(指示書 8 章)
// 出力: <フォルダ>/<入力>.<案>.{svg,png}、<入力>.<案>.compare.png、values.json((a)〜(h)・Σk・大きさ)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareView, renderGeneral } from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out');
const parse = (spec) => (spec ? Object.fromEntries(spec.split(',').filter(Boolean).map((k) => { const [a, ...v] = k.split('='); return [a, v.length ? +v.join('=') : true]; })) : {});
// 案の切り替えは、既定(src/view/index.js の BEND)によらず、すべての項目を書いて渡す
const OFF = { A: false, C: false, Dx: 0, R: false };
const variants = [['now', OFF], ...(arg('--variants') ?? '').split(';').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), { ...OFF, ...parse(x.slice(i + 1)) }]; })];
const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
const pkgCand = (p) => { const pk = p.ctx.members(p.ctx.tree).map((x) => x.el).find((e) => p.ctx.is(e, 'Package')); p.generalCandidates = [...p.generalCandidates, { id: 'package:sample', kind: 'package', label: 'package (例)', el: pk }]; return p; };
const P3 = process.argv.includes('--set') && arg('--set') === 'p3';
const views = [['zentai', '全体図'], ['dousa', '動作の図'], ['tejun', '手順の図'], ['yaritori', 'やりとりの図'], ['kousei', '構成の図']];
const inputs = P3 ? [
  ...views.map(([n, v]) => [n, () => prepareView(sample), `view:見守りシステムの例::${v}`, 1]),
  ['student', () => prepareView(fs.readFileSync('tests/view/general/student-scale.sysml', 'utf8')), 'package:RobotVacuum', 1],
] : [
  ['kousei', () => prepareView(sample), 'view:見守りシステムの例::構成の図', 1],
  ['zentai', () => prepareView(sample), 'view:見守りシステムの例::全体図', 1],
  ['student', () => prepareView(fs.readFileSync('tests/view/general/student-scale.sysml', 'utf8')), 'package:RobotVacuum', 1],
  ['sample-package', () => pkgCand(prepareView(sample)), 'package:sample', 0.5],
  ['MeasurementReferences', () => prepareView(decodeUtf8(fs.readFileSync('vendor/release-2026-03/sysml.library/Domain Libraries/Quantities and Units/MeasurementReferences.sysml'))), 'package:MeasurementReferences', 0.4],
];
fs.mkdirSync(OUT, { recursive: true });
const values = {};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const [name, prep, cid, z] of inputs) {
  const p = prep();
  values[name] = {};
  for (const [vn, bend] of variants) {
    const r = renderGeneral(p, cid, { quality: true, keepDiagram: true, bend });
    const q = r.quality;
    const v = [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)];
    values[name][vn] = { q: v, sumK: q.bends.reduce((a, b) => a + b.k, 0), k4: q.bends.filter((b) => b.k >= 4).length, edges: q.bends.length, w: r.diagram.width, h: r.diagram.height, candidate: r.candidate.id };
    fs.writeFileSync(path.join(OUT, `${name}.${vn}.svg`), r.svg);
    execFileSync('rsvg-convert', ['-z', String(z), '-b', 'white', '-o', path.join(OUT, `${name}.${vn}.png`), path.join(OUT, `${name}.${vn}.svg`)]);
  }
  const now = values[name].now;
  for (const [vn] of variants.slice(1)) {
    const a = values[name].now, b = values[name][vn];
    const W1 = Math.ceil(a.w * z), H1 = Math.ceil(a.h * z), W2 = Math.ceil(b.w * z), H2 = Math.ceil(b.h * z);
    const lab = (t, x) => `<text x="${x}" y="24" font-family="sans-serif" font-size="16">${esc(t)}</text>`;
    const fmtv = (x) => `(a)〜(h) ${x.q.join('・')} Σk ${x.sumK} 4 回以上 ${x.k4}/${x.edges}`;
    const comp = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W1 + W2 + 30}" height="${Math.max(H1, H2) + 40}"><rect width="100%" height="100%" fill="white"/>`
      + lab(`今 ${fmtv(a)}`, 0) + lab(`案 ${vn} ${fmtv(b)}`, W1 + 30)
      + `<image x="0" y="36" width="${W1}" height="${H1}" xlink:href="${name}.now.png"/><image x="${W1 + 30}" y="36" width="${W2}" height="${H2}" xlink:href="${name}.${vn}.png"/>`
      + `<line x1="${W1 + 15}" y1="0" x2="${W1 + 15}" y2="${Math.max(H1, H2) + 40}" stroke="#999"/></svg>`;
    fs.writeFileSync(path.join(OUT, `${name}.${vn}.compose.svg`), comp);
    execFileSync('rsvg-convert', ['-o', `${name}.${vn}.compare.png`, `${name}.${vn}.compose.svg`], { cwd: OUT });
  }
  console.log(name, JSON.stringify(Object.fromEntries(Object.entries(values[name]).map(([k, x]) => [k, `${x.q.join(',')} Σk${x.sumK} ${x.w}x${x.h}`]))));
}
fs.writeFileSync(path.join(OUT, 'values.json'), JSON.stringify(values, null, 1) + '\n');
