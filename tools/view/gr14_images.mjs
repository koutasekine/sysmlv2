// 図の見た目と中身の直し(GR14)の確認用の画像(GR14 指示書 5 章)。直しごとに、前(直しをすべて切ったもの)と後(その直しだけを
// 入れたもの)を左右に並べた画像を作る(左が前、右が後)。C は新しい候補なので、後だけを描く。
//
// 使い方:
//   node tools/view/gr14_images.mjs [--out out/view/check-gr14] [--fix N,A,P,F,C]
//     309 ファイルの候補の選び方は、全数比較の結果(tools/view/gr14_compare.mjs の out/GR14/compare/<直し>.json)による。
//     N は (i) が最も減った 2 つ(注を持つ候補)、P は P で変わった候補のうち最初の 2 つ(記述の順。例の部品と要求の表も描く)、
//     F は箱の面積が最も減った 2 つ、
//     C は新しい候補のうち最初の 3 つ
// 出力: <フォルダ>/<直し>/<名前>.{before,after}.{svg,png}、<名前>.compare.png、values.json(前と後の (a)〜(h)・(i)・大きさ)、index.md

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as V from '../../src/view/index.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg('--out') ?? 'out/view/check-gr14';
const FIXES = (arg('--fix') ?? 'N,A,P,F,C').split(',');
const OFF = { N: false, A: false, P: false, F: false, C: false };
const RENDER = { interconnection: ['renderInterconnection', 'candidates'], state: ['renderStateTransition', 'stateCandidates'], action: ['renderActionFlow', 'actionCandidates'], sequence: ['renderSequence', 'sequenceCandidates'], general: ['renderGeneral', 'generalCandidates'] };
const SAMPLE = 'src/app/sample.sysml';
// N は GR14 P3 で直した後の全数比較(N_p3.json)があれば、それを使う
const cmp = (fix) => { const f = [`out/GR14/compare/${fix}_p3.json`, `out/GR14/compare/${fix}.json`].find((x) => fs.existsSync(x)); return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const changedOf = (fix, view) => (cmp(fix)?.views[view]?.changed ?? []).filter((c) => !c.file.endsWith('(例)'));
const viewsOf = (fix) => Object.keys(cmp(fix)?.views ?? {});

// 直しごとの入力: [名前, ファイル, ビュー, 候補の id]
function inputsOf(fix) {
  const req = ['sample-youkyuu', SAMPLE, 'general', 'view:見守りシステムの例::要求の図'];
  if (fix === 'N') {
    const all = viewsOf('N').flatMap((v) => changedOf('N', v).map((c) => ({ ...c, view: v }))).filter((c) => c.i[1] < c.i[0]).sort((a, b) => (b.i[0] - b.i[1]) - (a.i[0] - a.i[1]));
    return [req, ['sample-yaritori', SAMPLE, 'sequence', 'view:見守りシステムの例::やりとりの図'], ['seq-note', 'tests/view/notes/sequence-note.sysml', 'sequence', null],
      ...all.slice(0, 2).map((c, i) => [`files-${i + 1}`, c.file, c.view, c.candidate])];
  }
  if (fix === 'A') return [req, ['student', 'tests/view/general/student-scale.sysml', 'general', 'package:RobotVacuum'], ['gr12-use-case', 'tests/view/symbols-general/gr12-use-case.sysml', 'general', null], ['gr12-requirement', 'tests/view/symbols-general/gr12-requirement.sysml', 'general', null]];
  // P で変わる 309 ファイルの候補がなければ(GR14 の全数比較では 0 件)、P で変わった例のもう 1 つの候補(部品と要求の表)を描く
  if (fix === 'P') return [req, ['sample-hyou', SAMPLE, 'general', 'view:見守りシステムの例::部品と要求の表'], ...changedOf('P', 'general').slice(0, 2).map((c, i) => [`files-${i + 1}`, c.file, 'general', c.candidate])];
  if (fix === 'F') {
    const all = changedOf('F', 'action').filter((c) => c.area[1] < c.area[0]).sort((a, b) => (b.area[0] - b.area[1]) - (a.area[0] - a.area[1]));
    return [['sample-tejun', SAMPLE, 'action', 'view:見守りシステムの例::手順の図'], ['state-bodies', 'tests/view/symbols-action/state-bodies.sysml', 'state', null], ...all.slice(0, 2).map((c, i) => [`files-${i + 1}`, c.file, 'action', c.candidate])];
  }
  if (fix === 'C') return (cmp('C')?.views.action?.added ?? []).slice(0, 3).map((c, i) => [`new-${i + 1}`, c.file, 'action', c.candidate]);
  return [];
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const values = {};
const index = ['# GR14 の確認用の画像', '', '左が前(直しをすべて切ったもの)、右が後(その直しだけを入れたもの)。C は後だけ。N は、前が既定に入れた F・C・A・P を入れたもの、後がそれに N を足したもの。', ''];
for (const fix of FIXES) {
  const dir = path.join(OUT, fix);
  fs.mkdirSync(dir, { recursive: true });
  values[fix] = {};
  index.push(`## ${fix}`, '', '| 名前 | ファイル | ビュー | 候補 | 前 (a)〜(h)・(i) | 後 (a)〜(h)・(i) | 大きさ 前 → 後 |', '|---|---|---|---|---|---|---|');
  for (const [name, file, view, cid] of inputsOf(fix)) {
    const text = decodeUtf8(fs.readFileSync(file));
    const [fn, cands] = RENDER[view];
    const out = {};
    // N は、既定に入れた直し(F・C・A・P)の上に足すので、前を既定(N を切ったもの)、後を既定に N を足したものにする(GR14 P3)
    const base = fix === 'N' ? { ...OFF, F: true, C: true, A: true, P: true } : OFF;
    for (const [side, fx] of fix === 'C' ? [['after', { ...OFF, C: true }]] : [['before', base], ['after', { ...base, [fix]: true }]]) {
      const p = V.prepareView(text, { fig14: fx });
      const id = cid ?? p[cands][0]?.id;
      const r = V[fn](p, id, { quality: true, keepDiagram: true, fig14: fx });
      const q = r.quality;
      const iLen = r.diagram.edges.filter((e) => e.symbol === 'annotation-link').reduce((s, e) => s + e.points.reduce((a, pt, k) => (k ? a + Math.hypot(pt.x - e.points[k - 1].x, pt.y - e.points[k - 1].y) : 0), 0), 0);
      out[side] = { q: [q.crossings.length, q.overlaps.length, q.textOverlaps.length, q.uturns.length, q.arrowheads.length, q.parallels.length, q.edgeCrossings.length, q.bends.reduce((a, b) => a + b.h, 0)], i: Math.round(iLen), w: r.diagram.width, h: r.diagram.height, candidate: r.candidate.id };
      fs.writeFileSync(path.join(dir, `${name}.${side}.svg`), r.svg);
      // PNG の大きさの上限(rsvg-convert の 32,767 px)を超える図は、長い辺が 16,000 px になるよう縮める
      out[side].z = Math.min(1, 16000 / Math.max(r.diagram.width, r.diagram.height));
      execFileSync('rsvg-convert', ['-z', String(out[side].z), '-b', 'white', '-o', path.join(dir, `${name}.${side}.png`), path.join(dir, `${name}.${side}.svg`)]);
    }
    values[fix][name] = { file, view, ...out };
    const sides = Object.keys(out);
    const W = sides.map((s) => Math.ceil(out[s].w * out[s].z)), H = sides.map((s) => Math.ceil(out[s].h * out[s].z));
    const lab = (t, x) => `<text x="${x}" y="24" font-family="sans-serif" font-size="16">${esc(t)}</text>`;
    const fmt = (x) => `(a)〜(h) ${x.q.join('・')} (i) ${x.i}`;
    let x = 0, body = '';
    sides.forEach((s, k) => { body += lab(`${s === 'before' ? '前' : '後'} ${fmt(out[s])}`, x) + `<image x="${x}" y="36" width="${W[k]}" height="${H[k]}" xlink:href="${name}.${s}.png"/>`; x += W[k] + 30; });
    const comp = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.max(x - 30, 600)}" height="${Math.max(...H) + 40}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`;
    fs.writeFileSync(path.join(dir, `${name}.compose.svg`), comp);
    // 並べた画像も上限を超えないよう縮める
    const zc = Math.min(1, 30000 / Math.max(x - 30, Math.max(...H) + 40));
    execFileSync('rsvg-convert', ['-z', String(zc), '-o', `${name}.compare.png`, `${name}.compose.svg`], { cwd: dir });
    const b = out.before, a = out.after;
    index.push(`| ${name} | \`${file}\` | ${view} | \`${a.candidate}\` | ${b ? fmt(b) : '-'} | ${fmt(a)} | ${b ? `${b.w}×${b.h}` : '-'} → ${a.w}×${a.h}${a.z < 1 ? `(画像は ${a.z.toFixed(2)} 倍)` : ''} |`);
    console.log(fix, name, b ? fmt(b) : '-', '→', fmt(a));
  }
  index.push('');
}
fs.writeFileSync(path.join(OUT, 'values.json'), JSON.stringify(values, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'index.md'), index.join('\n') + '\n');
console.log(`→ ${OUT}`);
