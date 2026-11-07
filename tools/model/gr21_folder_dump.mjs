// GR21: フォルダの全数比較(GR21 指示書 4 章)。例題のフォルダと最小の入力(tools/model/gr20_folders.mjs list が書く一覧)について、
// フォルダのファイルをまとめて 1 つのモデルとして解析し(src/model/files.js の analyzeFiles)、名前解決(参照の状態・解決先・曖昧の候補・
// D3 の印・理由・区切りの解決先・種類の不適合)、意味エラー、警告を書き出し、2 つの書き出しを比べる。
// 要素は「ファイルの相対パス#木の中の位置」(根は /、子は o<i>・r<i>)で指す(tools/model/order_check.mjs の --folders と同じ指し方)。
//
// 使い方:
//   node tools/model/gr21_folder_dump.mjs dump <出力のフォルダ> [--folders out/GR20/folders.json] [--src <src のフォルダ>]
//   node tools/model/gr21_folder_dump.mjs diff <前のフォルダ> <後のフォルダ>
//   --src   読み込む src(既定は作業ツリーの src)。前の版の src を作業ツリーの外に置いて使える
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

async function dump(outDir) {
  const srcDir = path.resolve(opt('--src', 'src'));
  const imp = (p) => import(pathToFileURL(path.resolve(srcDir, p)).href);
  const P = await imp('parser/index.js');
  const M = await imp('model/index.js');
  const all = JSON.parse(fs.readFileSync(opt('--folders', 'out/GR20/folders.json'), 'utf8'));
  const out = {};
  const sum = { folders: 0, files: 0, refs: 0, semantic: 0, warnings: 0, crossRefs: 0, time: 0 };
  const t0 = performance.now();
  for (const g of all) {
    const list = g.files.map((f) => ({ path: f.slice(g.dir.length + 1), text: P.decodeUtf8(fs.readFileSync(f)) }));
    const a = M.analyzeFiles(list);
    const pos = new Map();
    for (const f of a.files) if (f.root) (function walk(e, s) { pos.set(e, `${f.path}#${s}`); e.owned.forEach((c, i) => walk(c, `${s}o${i}`)); e.related.forEach((c, i) => walk(c, `${s}r${i}`)); })(f.root, '/');
    const id = (e) => !e ? null : e.lib ? `L:${e.qname ?? e.libId}` : e.builtin ? `B:${e.qname}` : e.virtual ? `V:${e.virtual}:${pos.get(e.of) ?? (e.of?.lib ? 'L:' + (e.of.qname ?? e.of.libId) : e.of?.qname ?? '?')}` : pos.get(e) ?? '?';
    const fileOf = (x) => a.files[x.file]?.path ?? '?';
    const rec = {
      ok: a.ok, anyOk: a.anyOk,
      files: a.files.map((f) => `${f.path} ok=${f.ok} errors=${(f.errors ?? []).length}`),
      refs: (a.model?.refs ?? []).map((r) => `${pos.get(r.node)}|${r.prop}|${r.index ?? ''}|${r.status}|${id(r.target)}|${(r.candidates ?? []).map(id).sort().join(',')}|${r.shadow ? [...new Set(r.shadow.map((x) => x.why))].sort().join(',') : ''}|${r.text}|${(r.segments ?? []).map((s) => id(s.target)).join(' ')}|${r.reason ?? ''}|${r.kindMismatch ?? ''}`),
      sem: (a.semantic ?? []).map((x) => `${fileOf(x)} ${x.line}:${x.col} ${x.item} ${x.message}`),
      warn: (a.warnings ?? []).map((x) => `${fileOf(x)} ${x.line}:${x.col} ${x.item} ${x.message}`),
    };
    const fileOfEl = (e) => (e && !e.lib && !e.builtin && !e.virtual) ? (pos.get(e) ?? '').split('#')[0] : null;
    rec.cross = (a.model?.refs ?? []).filter((r) => r.status === 'resolved' && fileOfEl(r.target) && fileOfEl(r.target) !== (pos.get(r.node) ?? '').split('#')[0]).length;
    out[g.name] = rec;
    sum.folders++; sum.files += list.length; sum.refs += rec.refs.length; sum.semantic += rec.sem.length; sum.warnings += rec.warn.length; sum.crossRefs += rec.cross;
  }
  sum.time = +((performance.now() - t0) / 1000).toFixed(1);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'dump.json'), JSON.stringify(out) + '\n');
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ src: srcDir, ...sum }, null, 1) + '\n');
  console.log(`folders=${sum.folders} files=${sum.files} refs=${sum.refs} semantic=${sum.semantic} warnings=${sum.warnings} crossRefs=${sum.crossRefs} time=${sum.time}s`);
}

function diff(a, b) {
  const A = JSON.parse(fs.readFileSync(path.join(a, 'dump.json'), 'utf8'));
  const B = JSON.parse(fs.readFileSync(path.join(b, 'dump.json'), 'utf8'));
  const res = { folders: 0, differ: 0, items: { refs: 0, sem: 0, warn: 0, files: 0, ok: 0, missing: 0 }, examples: [] };
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    res.folders++;
    const x = A[k], y = B[k];
    if (!x || !y) { res.differ++; res.items.missing++; res.examples.push({ folder: k, missing: !x ? 'before' : 'after' }); continue; }
    let bad = false;
    if (x.ok !== y.ok || x.anyOk !== y.anyOk) { bad = true; res.items.ok++; }
    for (const f of ['files', 'refs', 'sem', 'warn']) {
      const n = Math.max(x[f].length, y[f].length);
      for (let i = 0; i < n; i++) if (x[f][i] !== y[f][i]) { bad = true; res.items[f]++; if (res.examples.length < 20) res.examples.push({ folder: k, field: f, i, before: x[f][i], after: y[f][i] }); }
    }
    if (bad) res.differ++;
  }
  console.log(`folders=${res.folders} differ=${res.differ} items=${JSON.stringify(res.items)}`);
  for (const e of res.examples) console.log('  ' + JSON.stringify(e));
  fs.writeFileSync(path.join(b, 'diff.json'), JSON.stringify(res, null, 1) + '\n');
  process.exit(res.differ ? 1 : 0);
}

const cmd = args[0];
if (cmd === 'dump') await dump(args[1]);
else if (cmd === 'diff') diff(args[1], args[2]);
else { console.error('使い方: dump <出力> | diff <前> <後>'); process.exit(2); }
