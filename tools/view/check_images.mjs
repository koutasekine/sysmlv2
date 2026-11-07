// 記号ごとの確認用の画像を作る(GR4 指示書 5.4 節)。
//
// 使い方:
//   node tools/view/check_images.mjs          # → out/view/check/<入力の名前>.png と index.md
//   node tools/view/check_images.mjs --state  # 状態遷移ビュー(GR6): tests/view/symbols-state/ → out/view/check-state/
//     記号の一覧は tools/view/symbols.json の stateTransition.symbols、区分は「GR6 で描く」。GR4 の一覧にある記号は、
//     GR4 の入力(tests/view/symbols/manifest.json)の covers・unused にあってもよい
//   node tools/view/check_images.mjs --action # アクションフロービュー(GR7): tests/view/symbols-action/ → out/view/check-action/
//     記号の一覧は actionFlow.symbols、区分は「GR7 で描く」。GR4・GR6 の一覧にある記号は、GR4・GR6 の入力の covers・unused に
//     あってもよい。項目の view が 'state' のものは状態遷移ビューで描く(状態遷移ビューの本体を図にする形)
//   node tools/view/check_images.mjs --sequence # シーケンスビュー(GR9): tests/view/symbols-sequence/ → out/view/check-sequence/
//     記号の一覧は sequence.symbols、区分は「GR9 で描く」。GR4・GR6・GR7 の一覧にある記号は、GR4・GR6・GR7 の入力の covers・unused に
//     あってもよい
//   node tools/view/check_images.mjs --general  # 一般ビュー(GR10): tests/view/symbols-general/ → out/view/check-general/
//     記号の一覧は general.symbols、区分は「GR10 で描く」と「GR10 では汎用の箱で描き、GR11 で専用の記号にする」。前の一覧にある記号
//     (prior があるもの)は、GR4・GR6・GR7・GR9 の入力の covers・unused にあってもよい。gr12 が true の項目は使わない
//   node tools/view/check_images.mjs --general12  # 一般ビューの分野ごとの専用の記号(GR12): tests/view/symbols-general/ の gr12 が true の
//     項目 → out/view/check-symbols12/。記号の一覧は general12.symbols、区分は「GR12 で描く」。check のページも general12 から求める
//
// tests/view/symbols/manifest.json の各項目について:
//   1. 入力を描き(src/view)、期待する記号・文字・診断が現れることを確かめる
//   2. 図の SVG を rsvg-convert で PNG にする
//   3. check に書いた生成規則の図のページ(tools/view/symbols.json の figurePage)を pdftoppm で PNG にする
//   4. 2 つを左右に並べた画像(左が仕様書、右が描いた図)を作る(並べるのも rsvg-convert で行う)
// あわせて、記号の一覧の「GR4 で描く」の生成規則が、manifest の covers か unused のどちらかにあることを確かめる
// (種類 endset と、文字の生成規則のうち箱や線の一部として確かめるものは、covers に書いたものだけを数える)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderText, renderStateText, renderActionText, renderSequenceText, renderGeneralText } from '../../src/view/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const PDF = 'vendor/release-2026-03/doc/2a-OMG_Systems_Modeling_Language.pdf';
const STATE = process.argv.includes('--state');
const ACTION = process.argv.includes('--action');
const SEQUENCE = process.argv.includes('--sequence');
const GENERAL12 = process.argv.includes('--general12');
const GENERAL = process.argv.includes('--general') || GENERAL12;
const OUT = STATE ? 'out/view/check-state' : ACTION ? 'out/view/check-action' : SEQUENCE ? 'out/view/check-sequence' : GENERAL12 ? 'out/view/check-symbols12' : GENERAL ? 'out/view/check-general' : 'out/view/check';
const DIR = STATE ? 'tests/view/symbols-state' : ACTION ? 'tests/view/symbols-action' : SEQUENCE ? 'tests/view/symbols-sequence' : GENERAL ? 'tests/view/symbols-general' : 'tests/view/symbols';

// view が 'state' なら状態遷移ビューで描く(入力は tests/view/symbols-state/)。'action' ならアクションフロービューで描く
// (入力は tests/view/symbols-action/。項目の view が 'state' なら、その項目は状態遷移ビューで描く)。'sequence' ならシーケンスビューで描く
// (入力は tests/view/symbols-sequence/)。'general' なら一般ビューで描く(入力は tests/view/symbols-general/。GR10)
export function checkCase(c, view = 'interconnection') {
  const st = view === 'state', ac = view === 'action', sq = view === 'sequence', ge = view === 'general';
  const dir = st ? 'tests/view/symbols-state' : ac ? 'tests/view/symbols-action' : sq ? 'tests/view/symbols-sequence' : ge ? 'tests/view/symbols-general' : 'tests/view/symbols';
  const text = fs.readFileSync(path.join(dir, c.file), 'utf8');
  const render = st || (ac && c.view === 'state') ? renderStateText : ac ? renderActionText : sq ? renderSequenceText : ge ? renderGeneralText : renderText;
  const r = render(text, c.candidate ?? null);
  const problems = [];
  if (!r.ok) return { r, problems: [`解析のエラー: ${r.errors[0]?.message}`] };
  if (c.candidate && r.candidate?.id !== c.candidate) problems.push(`候補 ${c.candidate} がない(${r.candidates.map((x) => x.id).join(', ')})`);
  const syms = new Set();
  for (const n of r.structure?.nodes ?? []) { syms.add(n.symbol); for (const k of n.compartments ?? []) syms.add(k.symbol); }
  for (const e of r.structure?.edges ?? []) { syms.add(e.symbol); for (const m of e.markers) syms.add(m); }
  for (const m of (r.svg ?? '').matchAll(/data-sym="([^"]+)"/g)) syms.add(m[1]);
  for (const s of c.expect ?? []) if (!syms.has(s)) problems.push(`記号 ${s} が現れない`);
  for (const t of c.texts ?? []) if (!(r.svg ?? '').includes(t)) problems.push(`文字 ${t} が SVG にない`);
  for (const d of c.diagnostics ?? []) if (!r.diagnostics.some((x) => x.code === d)) problems.push(`診断 ${d} がない`);
  return { r, problems, syms };
}

// 記号の一覧の「描く」が、入力の covers か unused にあるか(状態遷移ビューでは、GR4 の一覧にある記号は GR4 の入力でもよい。
// アクションフロービュー(state が 'action')では、GR4・GR6 の一覧にある記号は GR4・GR6 の入力でもよい。
// シーケンスビュー(state が 'sequence')では、GR4・GR6・GR7 の一覧にある記号は GR4・GR6・GR7 の入力でもよい。
// 一般ビュー(state が 'general'。GR10)では、「GR10 で描く」と「汎用の箱で描く」の両方を数え、前の一覧にある記号は GR4・GR6・GR7・GR9 の入力でもよい)
export const GENERAL_DRAW = ['GR10 で描く', 'GR10 では汎用の箱で描き、GR11 で専用の記号にする'];
// 一般ビューの分野ごとの専用の記号(state が 'general12'。GR12)では、gr12 の項目の covers と unused で「GR12 で描く」を数える
export function coverage(symbols, manifest, state) {
  if (state === 'general12') {
    const covered = new Set(manifest.cases.filter((c) => c.gr12).flatMap((c) => c.covers));
    const unused = new Set(Object.keys(manifest.unused));
    const draw = symbols.filter((s) => s.class === 'GR12 で描く');
    return { draw, missing: draw.filter((s) => !covered.has(s.name) && !unused.has(s.name)).map((s) => s.name), viaGr4: [] };
  }
  const ge = state === 'general';
  const sq = state === 'sequence' || ge;
  const ac = state === 'action' || sq;
  const covered = new Set(manifest.cases.flatMap((c) => c.covers));
  const unused = new Set(Object.keys(manifest.unused));
  const draw = ge ? symbols.filter((s) => GENERAL_DRAW.includes(s.class)) : symbols.filter((s) => s.class === (sq ? 'GR9 で描く' : ac ? 'GR7 で描く' : state ? 'GR6 で描く' : 'GR4 で描く'));
  let gr4 = new Set();
  if (state) {
    const ms = ['tests/view/symbols/manifest.json', ...(ac ? ['tests/view/symbols-state/manifest.json'] : []), ...(sq ? ['tests/view/symbols-action/manifest.json'] : []), ...(ge ? ['tests/view/symbols-sequence/manifest.json'] : [])].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    gr4 = new Set(ms.flatMap((m) => [...m.cases.flatMap((c) => c.covers), ...Object.keys(m.unused)]));
  }
  const viaGr4 = draw.filter((s) => !covered.has(s.name) && !unused.has(s.name) && (ac ? s.prior : s.gr4) && gr4.has(s.name)).map((s) => s.name);
  const missing = draw.filter((s) => !covered.has(s.name) && !unused.has(s.name) && !viaGr4.includes(s.name)).map((s) => s.name);
  return { draw, missing, viaGr4 };
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  if (GENERAL) manifest.cases = manifest.cases.filter((c) => !!c.gr12 === GENERAL12);
  const sj = JSON.parse(fs.readFileSync('tools/view/symbols.json', 'utf8'));
  const symbols = STATE ? sj.stateTransition.symbols : ACTION ? sj.actionFlow.symbols : SEQUENCE ? sj.sequence.symbols : GENERAL12 ? sj.general12.symbols : GENERAL ? sj.general.symbols : sj.symbols;
  const byName = new Map(symbols.map((s) => [s.name, s]));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = ['# 記号ごとの確認用の画像', '', '左が仕様書の該当ページ、右が描いた図。node tools/view/check_images.mjs で作った。', '', '| 画像 | 入力 | 仕様書の生成規則(PDF のページ) | 確かめる記号 | 問題 |', '|---|---|---|---|---|'];
  let bad = 0;
  for (const c of manifest.cases) {
    const base = c.file.replace(/\.sysml$/, '');
    const { r, problems } = checkCase(c, STATE ? 'state' : ACTION ? 'action' : SEQUENCE ? 'sequence' : GENERAL ? 'general' : 'interconnection');
    if (problems.length) bad++;
    const sym = byName.get(c.check);
    if (!sym) problems.push(`check の生成規則 ${c.check} が記号の一覧にない`);
    if (r.svg) {
      fs.writeFileSync(path.join(OUT, `${base}.svg`), r.svg);
      execFileSync('rsvg-convert', ['-z', '1.5', '-o', path.join(OUT, `${base}.diagram.png`), path.join(OUT, `${base}.svg`)]);
    }
    if (sym) {
      const pre = path.join(OUT, `${base}.spec`);
      const page = sym.figurePage;
      execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-r', '80', '-png', '-singlefile', PDF, pre]);
      const sp = pngSize(`${pre}.png`);
      const dp = r.svg ? pngSize(path.join(OUT, `${base}.diagram.png`)) : { w: 0, h: 0 };
      const W = sp.w + dp.w + 30, H = Math.max(sp.h, dp.h) + 40;
      const comp = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">`
        + `<rect width="${W}" height="${H}" fill="#ffffff"/>`
        + `<text x="10" y="22" font-size="16" font-family="sans-serif">${c.file} / 仕様書 ${c.check}(PDF ${page} ページ、${sym.section} 節)</text>`
        + `<image x="0" y="36" width="${sp.w}" height="${sp.h}" xlink:href="${base}.spec.png"/>`
        + (r.svg ? `<image x="${sp.w + 20}" y="36" width="${dp.w}" height="${dp.h}" xlink:href="${base}.diagram.png"/>` : '')
        + `<line x1="${sp.w + 10}" y1="36" x2="${sp.w + 10}" y2="${H}" stroke="#888"/></svg>`;
      fs.writeFileSync(path.join(OUT, `${base}.compose.svg`), comp);
      execFileSync('rsvg-convert', ['-o', path.join(OUT, `${base}.png`), path.join(OUT, `${base}.compose.svg`)], { cwd: ROOT });
    }
    index.push(`| ${OUT}/${base}.png | ${DIR}/${c.file}${c.candidate ? `(${c.candidate})` : ''} | ${c.check}(${sym?.figurePage ?? '?'}) | ${c.covers.join('・') || '—'} | ${problems.join('; ') || 'なし'} |`);
    console.log(`${problems.length ? '不合格' : '合格'} ${c.file}${problems.length ? ': ' + problems.join('; ') : ''}`);
  }
  // 記号の一覧との照らし合わせ
  const covered = new Set(manifest.cases.flatMap((c) => c.covers));
  const unused = new Set(Object.keys(manifest.unused));
  const r = coverage(symbols, manifest, GENERAL12 ? 'general12' : GENERAL ? 'general' : SEQUENCE ? 'sequence' : ACTION ? 'action' : STATE);
  const draw = r.draw, missing = r.missing;
  const both = [...covered].filter((n) => unused.has(n));
  const unknown = [...covered, ...unused].filter((n) => !byName.has(n));
  index.push('', `「${GENERAL12 ? 'GR12 で描く' : GENERAL ? 'GR10 で描く」と「汎用の箱で描く' : STATE ? 'GR6 で描く' : ACTION ? 'GR7 で描く' : SEQUENCE ? 'GR9 で描く' : 'GR4 で描く'}」${draw.length} 件: 入力で確かめる ${draw.filter((s) => covered.has(s.name)).length} 件、裁定などにより使わない ${draw.filter((s) => unused.has(s.name)).length} 件、${STATE || ACTION || SEQUENCE || (GENERAL && !GENERAL12) ? `${GENERAL ? 'GR4・GR6・GR7・GR9' : SEQUENCE ? 'GR4・GR6・GR7' : ACTION ? 'GR4・GR6' : 'GR4'} の入力で確かめた(前の一覧にある記号) ${r.viaGr4.length} 件、` : ''}どちらにもない ${missing.length} 件${missing.length ? `(${missing.join('、')})` : ''}`);
  fs.writeFileSync(path.join(OUT, 'index.md'), index.join('\n') + '\n');
  console.log(`入力 ${manifest.cases.length} 件(不合格 ${bad})、描く記号 ${draw.length} 件: covers ${draw.filter((s) => covered.has(s.name)).length}、unused ${draw.filter((s) => unused.has(s.name)).length}${STATE || ACTION || SEQUENCE || (GENERAL && !GENERAL12) ? `、前の入力 ${r.viaGr4.length}` : ''}、どちらにもない ${missing.length}${missing.length ? ' ' + missing.join(' ') : ''}`);
  if (both.length) console.log(`covers と unused の両方にある: ${both.join(' ')}`);
  if (unknown.length) console.log(`記号の一覧にない名前: ${unknown.join(' ')}`);
  if (bad || missing.length || both.length || unknown.length) process.exitCode = 1;
}
