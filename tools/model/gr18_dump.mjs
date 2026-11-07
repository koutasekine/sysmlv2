// GR18: 309 ファイルと「例を読み込む」の例について、参照ごとの状態・解決先・D3 の印・範囲・区切りの解決先と、意味エラーを書き出し、
// 2 つの書き出しを比べる道具(指示書 3 章の「参照の状態・解決先・意味エラーが変わらない」の確かめ)。
// 使い方:
//   node tools/model/gr18_dump.mjs dump <出力のフォルダ> [--list out/files309.txt] [--no-semantic]
//   node tools/model/gr18_dump.mjs diff <前のフォルダ> <後のフォルダ> [--examples 30]
// 解決先は、利用者のモデルの要素は「種類@原文の位置」、索引の要素は「L:修飾名」、内蔵する表は「B:修飾名」、共役ポートは「~…」。
import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const id = (t) => !t ? '' : t.virtual ? `~${id(t.of)}` : t.lib ? `L:${t.qname ?? t.libId}` : t.builtin ? `B:${t.qname}` : `${t.kind}@${t.start}-${t.end}`;
const key = (r) => `${r.node.kind}@${r.node.start}-${r.node.end}.${r.prop}#${r.index ?? 0}`;
export function dumpText(text, semantic = true) {
  const p = parse(text);
  if (!p.ok) return { ok: false };
  const m = resolveNames(p.tree, text);
  const refs = m.refs.map(r => ({ k: key(r), t: r.text, s: r.status, to: id(r.target), sh: r.shadow ? [...new Set(r.shadow.map(x => x.why))].sort().join(',') : '', at: `${r.start}-${r.end}`, seg: r.segments.map(s => `${s.start}-${s.end}:${id(s.target)}`).join(' ') }));
  const sem = semantic ? checkSemantics(p.tree, m, text).map(x => `${x.item}@${x.start}-${x.end} ${x.message}`) : [];
  return { ok: true, refs, sem };
}
if (args[0] === 'dump') {
  const out = args[1];
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
  files.push('src/app/sample.sysml');
  const t0 = performance.now();
  const all = {};
  for (const f of files) {
    const text = f.endsWith('sample.sysml') ? fs.readFileSync(f, 'utf8') : decodeUtf8(fs.readFileSync(f));
    all[f] = dumpText(text, !args.includes('--no-semantic'));
  }
  fs.writeFileSync(path.join(out, 'dump.json'), JSON.stringify(all));
  console.log(`${files.length} ファイル、${((performance.now() - t0) / 1000).toFixed(1)} 秒 → ${out}/dump.json`);
} else if (args[0] === 'diff') {
  const A = JSON.parse(fs.readFileSync(path.join(args[1], 'dump.json'))), B = JSON.parse(fs.readFileSync(path.join(args[2], 'dump.json')));
  const nEx = +opt('--examples', 30);
  const res = { files: 0, refs: 0, changed: 0, byKind: {}, semChanged: 0, examples: [], semExamples: [] };
  for (const f of Object.keys(A)) {
    res.files++;
    const a = A[f], b = B[f];
    if (!b || a.ok !== b.ok) { res.examples.push({ f, ok: [a.ok, b?.ok] }); continue; }
    if (!a.ok) continue;
    const bm = new Map(b.refs.map(r => [r.k, r]));
    const seen = new Set();
    for (const r of a.refs) {
      res.refs++;
      const s = bm.get(r.k); seen.add(r.k);
      const kinds = [];
      if (!s) kinds.push('なくなった');
      else {
        if (r.s !== s.s) kinds.push(`状態 ${r.s}→${s.s}`);
        else if (r.to !== s.to) kinds.push('解決先');
        if (r.sh !== s.sh) kinds.push(`印 ${r.sh || 'なし'}→${s.sh || 'なし'}`);
        if (r.at !== s.at) kinds.push('範囲');
        if (r.seg !== s.seg) kinds.push('区切り');
      }
      if (!kinds.length) continue;
      res.changed++;
      for (const k of kinds) res.byKind[k] = (res.byKind[k] ?? 0) + 1;
      if (res.examples.length < nEx) res.examples.push({ f: f.replace(/.*\/src\//, ''), text: r.t, at: r.at, kinds, before: `${r.s} ${r.to} ${r.sh}`, after: s ? `${s.s} ${s.to} ${s.sh}` : null });
    }
    for (const r of b.refs) if (!seen.has(r.k)) { res.changed++; res.byKind['増えた'] = (res.byKind['増えた'] ?? 0) + 1; }
    const sa = a.sem.join('\n'), sb = b.sem.join('\n');
    if (sa !== sb) { res.semChanged++; if (res.semExamples.length < 10) res.semExamples.push({ f, before: a.sem.filter(x => !b.sem.includes(x)), after: b.sem.filter(x => !a.sem.includes(x)) }); }
  }
  console.log(JSON.stringify(res, null, 1));
}
