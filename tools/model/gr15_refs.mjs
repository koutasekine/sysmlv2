// 参照の状態・解決先と D3 の印を書き出して数える(GR15 P0・P2)。
//
// 使い方:
//   node tools/model/gr15_refs.mjs [--list out/files309.txt] [--out out/GR15/refs.json] [--d3-ascii on|off] [--d3-scope on|off]
//   node tools/model/gr15_refs.mjs --diff 前.json 後.json
//
// 309 ファイル(--list)と「例を読み込む」の例(src/app/sample.sysml)を解析し、名前解決の結果を書き出す。
// 参照は原文の範囲と属性で、解決先は構文木の中の位置(owned・related の添字の並び)か内蔵する表の修飾名で指す。
// --d3-ascii・--d3-scope は、D3 の印の判定(src/model/resolve.js の D3_ASCII_NAMES・D3_SCOPE)をこの実行だけ変える(省くと既定のまま)。
// --diff は 2 つの書き出しを比べ、状態か解決先の変わった参照、D3 の印の増えた参照・減った参照を数える。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

if (args.includes('--diff')) {
  const i = args.indexOf('--diff');
  const A = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
  const B = JSON.parse(fs.readFileSync(args[i + 2], 'utf8'));
  const sum = { files: 0, refs: 0, changed: 0, d3Before: 0, d3After: 0, d3Added: 0, d3Removed: 0, d3WhyChanged: 0, missing: 0, removedByWhy: {}, removedNames: {}, examples: { changed: [], added: [] } };
  for (const [f, a] of Object.entries(A.files)) {
    const b = B.files[f];
    if (!b || a.refs.length !== b.refs.length) { sum.missing++; continue; }
    sum.files++;
    a.refs.forEach((ra, k) => {
      const rb = b.refs[k];
      sum.refs++;
      if (ra.at !== rb.at || ra.status !== rb.status || ra.target !== rb.target) { sum.changed++; if (sum.examples.changed.length < 20) sum.examples.changed.push({ f, ra, rb }); }
      if (ra.d3) sum.d3Before++;
      if (rb.d3) sum.d3After++;
      if (!ra.d3 && rb.d3) { sum.d3Added++; if (sum.examples.added.length < 20) sum.examples.added.push({ f, ra, rb }); }
      if (ra.d3 && !rb.d3) { sum.d3Removed++; sum.removedByWhy[ra.d3] = (sum.removedByWhy[ra.d3] ?? 0) + 1; sum.removedNames[ra.name] = (sum.removedNames[ra.name] ?? 0) + 1; }
      if (ra.d3 && rb.d3 && ra.d3 !== rb.d3) sum.d3WhyChanged++;
    });
  }
  sum.removedNames = Object.fromEntries(Object.entries(sum.removedNames).sort((x, y) => y[1] - x[1]).slice(0, 30));
  console.log(JSON.stringify(sum, null, 1));
  process.exit(sum.changed || sum.d3Added || sum.missing ? 1 : 0);
}

const files = fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
files.push('src/app/sample.sysml');
const outPath = opt('--out', 'out/GR15/refs.json');
const d3lib = opt('--d3-ascii', null);
const d3scope = opt('--d3-scope', null);
const ropts = { ...(d3lib === null ? {} : { d3Ascii: d3lib === 'on' }), ...(d3scope === null ? {} : { d3Scope: d3scope === 'on' }) };

const out = { files: {} };
const total = { files: 0, refs: 0, resolved: 0, unchecked: 0, ambiguous: 0, d3: 0, d3ByWhy: {} };
const sample = { refs: 0, d3: 0, named: 0, nameOnly: 0, shortOnly: 0, both: 0, d3ByWhy: {} };
let maxMs = 0, maxFile = null;
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  const t0 = performance.now();
  const model = resolveNames(p.tree, text, ropts);
  const ms = performance.now() - t0;
  if (ms > maxMs) { maxMs = ms; maxFile = f; }
  const pos = new Map();
  (function walk(e, s) {
    pos.set(e, s);
    e.owned.forEach((c, i) => walk(c, `${s}o${i}`));
    e.related.forEach((c, i) => walk(c, `${s}r${i}`));
  })(p.tree, '/');
  const idOf = (t) => !t ? null : t.builtin ? `builtin:${t.qname}` : t.virtual ? `virtual:${pos.get(t.of)}` : pos.get(t) ?? '?';
  const refs = model.refs.map(r => {
    const why = r.shadow ? [...new Set(r.shadow.map(s => s.why))].sort().join('+') : null;
    return { at: `${pos.get(r.node)}|${r.prop}|${r.index ?? ''}|${r.start}`, name: r.segments[0]?.name ?? '', status: r.status, target: idOf(r.target), d3: why };
  });
  out.files[f] = { refs };
  total.files++;
  for (const r of refs) {
    total.refs++; total[r.status]++;
    if (r.d3) { total.d3++; total.d3ByWhy[r.d3] = (total.d3ByWhy[r.d3] ?? 0) + 1; }
  }
  if (f === 'src/app/sample.sysml') {
    sample.refs = refs.length;
    for (const r of refs) if (r.d3) { sample.d3++; sample.d3ByWhy[r.d3] = (sample.d3ByWhy[r.d3] ?? 0) + 1; }
    (function walk(e) {
      const n = e.name !== undefined, s = e.shortName !== undefined;
      if (n || s) { sample.named++; if (n && s) sample.both++; else if (n) sample.nameOnly++; else sample.shortOnly++; }
      e.owned.forEach(walk); e.related.forEach(walk);
    })(p.tree);
  }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out) + '\n');
const s309 = { ...total };
console.log(JSON.stringify({ all: s309, sample, maxResolveMs: Math.round(maxMs), maxFile }, null, 1));
