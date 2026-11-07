// 解く順序に名前解決の結果が左右されないことの検査(GR3 P3 の判断 D の条件。オーナーの裁定 2026-10-22)。
//
// 使い方:
//   node tools/model/order_check.mjs [--list out/files309.txt] [--seeds 1,2,3] [--out out/model/order_check.json]
//   node tools/model/order_check.mjs --folders out/GR20/folders.json [--seeds 1,2,3] [--out out/GR20/order_folders.json]
//   --folders は、フォルダ(ファイルの並び)ごとに、ファイルを読み込む順を「相対パスの順」「逆順」「種を固定した乱順」(種ごとに 1 通り)に
//   変えて 1 つのモデルとして解析し(src/model/files.js の analyzeFiles)、すべての参照の状態と解決先、曖昧の候補、D3 の印、意味エラー、
//   警告が、相対パスの順の結果と一致するかを比べる(GR20 指示書 3.2 節)。要素は「ファイルの相対パス#木の中の位置」で指す
//
// ファイルごとに、参照を「文書の順」「文書の逆順」「種を固定した乱順」(種ごとに 1 通り)で解き、
// すべての参照の status と解決先が、文書の順の結果と一致するかを比べる。
// あわせて、曖昧の候補と D3 の印(shadow)の一致も数える(参考)。一致しない参照が 1 件でもあれば終了コード 1。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames, analyzeFiles } from '../../src/model/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const foldersPath = opt('--folders', null);
const files = foldersPath ? [] : fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
const seeds = opt('--seeds', '1,2,3').split(',').map(Number);
const outPath = opt('--out', 'out/model/order_check.json');

// 種を固定した擬似乱数(mulberry32)と Fisher–Yates
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const shuffle = (seed) => (a) => { const r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const orders = [['document', null], ['reverse', (a) => a.reverse()], ...seeds.map(s => [`random(seed=${s})`, shuffle(s)])];

const id = (e) => !e ? null : e.builtin ? `B:${e.qname}` : e.virtual ? `V:${e.virtual}:${e.of.start}:${e.of.kind}` : `${e.kind}@${e.start}-${e.end}`;
const keyOf = (r) => `${r.node.kind}@${r.node.start}-${r.node.end}.${r.prop}#${r.index ?? 0}`;
const sum = { files: 0, orders: orders.map(o => o[0]), refs: 0, mismatch: 0, examples: [], info: { candidatesMismatch: 0, shadowMismatch: 0 } };
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  sum.files++;
  const results = orders.map(([, ord]) => {
    const m = resolveNames(p.tree, text, ord ? { order: ord } : {});
    return new Map(m.refs.map(r => [keyOf(r), { status: r.status, target: id(r.target), cand: (r.candidates ?? []).map(id).sort().join('|'), shadow: (r.shadow ?? []).map(s => `${id(s.ns)}:${s.why}`).join('|'), text: r.text, start: r.start }]));
  });
  const base = results[0];
  sum.refs += base.size;
  for (const [k, b] of base) {
    let bad = false;
    for (let i = 1; i < results.length; i++) {
      const x = results[i].get(k);
      if (!x || x.status !== b.status || x.target !== b.target) {
        bad = true;
        if (sum.examples.length < 20) sum.examples.push({ file: f, ref: k, text: b.text, start: b.start, order: orders[i][0], document: { status: b.status, target: b.target }, other: x ? { status: x.status, target: x.target } : null });
      } else {
        if (x.cand !== b.cand) sum.info.candidatesMismatch++;
        if (x.shadow !== b.shadow) sum.info.shadowMismatch++;
      }
    }
    if (bad) sum.mismatch++;
  }
}
if (foldersPath) {
  // ファイルの並びの順(相対パスの順・逆順・乱順)
  const fsum = { folders: 0, files: 0, orders: orders.map(o => o[0]), refs: 0, mismatch: 0, semanticMismatch: 0, warningMismatch: 0, info: { candidatesMismatch: 0, shadowMismatch: 0 }, examples: [] };
  for (const g of JSON.parse(fs.readFileSync(foldersPath, 'utf8'))) {
    const list = g.files.map((f) => ({ path: f.slice(g.dir.length + 1), text: decodeUtf8(fs.readFileSync(f)) }));
    fsum.folders++; fsum.files += list.length;
    const results = orders.map(([, ord]) => {
      const a = analyzeFiles(ord ? ord(list.slice()) : list);
      // 要素の位置: ファイルの相対パス#木の中の位置(根は /)
      const pos = new Map();
      for (const f of a.files) if (f.root) (function walk(e, s) { pos.set(e, `${f.path}#${s}`); e.owned.forEach((c, i) => walk(c, `${s}o${i}`)); e.related.forEach((c, i) => walk(c, `${s}r${i}`)); })(f.root, '/');
      const pid = (e) => !e ? null : e.builtin ? `B:${e.qname}` : e.virtual ? `V:${e.virtual}:${pos.get(e.of) ?? e.of.qname}` : pos.get(e) ?? '?';
      const refs = new Map((a.model?.refs ?? []).map(r => [`${pos.get(r.node)}.${r.prop}#${r.index ?? 0}`, { status: r.status, target: pid(r.target), cand: (r.candidates ?? []).map(pid).sort().join('|'), shadow: (r.shadow ?? []).map(x => `${pid(x.ns)}:${x.why}`).sort().join('|'), text: r.text }]));
      const diag = (l) => (l ?? []).map(x => `${a.files[x.file]?.path} ${x.line}:${x.col} ${x.item} ${x.message}`).sort().join('\n');
      return { refs, sem: diag(a.semantic), warn: diag(a.warnings) };
    });
    const base = results[0];
    fsum.refs += base.refs.size;
    for (let i = 1; i < results.length; i++) {
      if (results[i].sem !== base.sem) { fsum.semanticMismatch++; if (fsum.examples.length < 20) fsum.examples.push({ folder: g.name, order: orders[i][0], semantic: true }); }
      if (results[i].warn !== base.warn) { fsum.warningMismatch++; if (fsum.examples.length < 20) fsum.examples.push({ folder: g.name, order: orders[i][0], warnings: true }); }
      if (results[i].refs.size !== base.refs.size) { fsum.mismatch++; if (fsum.examples.length < 20) fsum.examples.push({ folder: g.name, order: orders[i][0], refCount: [base.refs.size, results[i].refs.size] }); }
    }
    for (const [k, b] of base.refs) {
      let bad = false;
      for (let i = 1; i < results.length; i++) {
        const x = results[i].refs.get(k);
        if (!x || x.status !== b.status || x.target !== b.target) { bad = true; if (fsum.examples.length < 20) fsum.examples.push({ folder: g.name, ref: k, text: b.text, order: orders[i][0], first: { status: b.status, target: b.target }, other: x ? { status: x.status, target: x.target } : null }); }
        else { if (x.cand !== b.cand) fsum.info.candidatesMismatch++; if (x.shadow !== b.shadow) fsum.info.shadowMismatch++; }
      }
      if (bad) fsum.mismatch++;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fsum, null, 1) + '\n');
  console.log(`folders=${fsum.folders} files=${fsum.files} orders=${fsum.orders.join(',')} refs=${fsum.refs} mismatch=${fsum.mismatch} semanticMismatch=${fsum.semanticMismatch} warningMismatch=${fsum.warningMismatch} (参考: candidates=${fsum.info.candidatesMismatch} shadow=${fsum.info.shadowMismatch})`);
  for (const e of fsum.examples) console.log('  ' + JSON.stringify(e));
  process.exit(fsum.mismatch || fsum.semanticMismatch || fsum.warningMismatch ? 1 : 0);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(sum, null, 1) + '\n');
console.log(`files=${sum.files} orders=${sum.orders.join(',')} refs=${sum.refs} mismatch=${sum.mismatch} (参考: candidates=${sum.info.candidatesMismatch} shadow=${sum.info.shadowMismatch})`);
for (const e of sum.examples) console.log(`  ${e.file} ${e.ref} "${e.text}" @${e.start} ${e.order}: 文書の順 ${JSON.stringify(e.document)} / ${JSON.stringify(e.other)}`);
process.exit(sum.mismatch ? 1 : 0);
