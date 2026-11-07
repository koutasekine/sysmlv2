// 参照箇所(GR26 の R。設計書 9.5 節)と、名前の変更で書き換える参照(設計書 8 章の段階 1。src/edit/index.js の renameElement)の照合
// (GR26 指示書 3.3 節)。モデルツリー(src/app/outline.js の buildOutline)の項目のうち、名前を宣言した要素ごとに、
//   参照箇所: その要素に解決している参照の区切り(model.referencesTo。解決済みのものだけ)
//   書き換える参照: renameElement が書き換える区切り(その要素と、実効の名前を受け継ぐ要素に解決した参照の区切りのうち、前の名前で
//                   書かれたもの。renameElement と同じ求め方で求め、--rename なら renameElement を実際に呼んで、書き換えの数と同じことも確かめる)
// を比べ、違いを理由ごとに数える。説明できる理由は次の 3 つ:
//   alias      参照箇所にあり書き換えない: 書いた名前が前の名前と違う(別名 alias A for X の A で書いた参照、短い名前で書いた参照)
//   inherit    書き換えるが参照箇所にない: 実効の名前を受け継ぐ別の要素(名前を書かない再定義 :>> x など)に解決した参照(その要素の参照箇所に出る)
//   unresolved 書き換える区切りの参照が未検査・曖昧(参照箇所に入れない。名前の変更はこの参照があると拒否する)
// それ以外の違いは「説明できない」として数え、1 件でもあれば終了コード 1。
//
// 使い方:
//   node tools/model/gr26_refs_check.mjs <フォルダ> [--rename] [--out <JSON>]   フォルダの .sysml をまとめて 1 つのモデルとして照合する
//   node tools/model/gr26_refs_check.mjs --examples [--out <JSON>]               公式の例題(vendor の 309 ファイル)を 1 ファイルずつ照合する
// どちらも、役割ごとの参照の数と「その他の参照」の数も出す。
// checkFiles(files, { rename }) → 照合の結果(検査 tests/view/app_main.mjs の --gr26r が直接呼ぶ)。files は [{ path, text }](相対パスの符号位置の順)

import fs from 'node:fs';
import path from 'node:path';
import { analyzeFiles, sortPaths } from '../../src/model/files.js';
import { prepareFromAnalysis } from '../../src/app/prepare.js';
import { buildOutline } from '../../src/app/outline.js';
import { renameElement, folderOf } from '../../src/edit/index.js';
import { unquote } from '../../src/parser/lexer.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function listSysml(dir) {
  const out = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      if (n.startsWith('.')) continue;
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.sysml')) out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  })(dir);
  return sortPaths(out);
}

// 名前の変更で書き換える区切り(src/edit/index.js の renameElement と同じ求め方: sameNamed と、前の名前で書かれた区切り)
function renameSegments(a, element, which = 'name') {
  const model = a.model;
  const from = new Map();
  (function walk(e) {
    const nf = model.namingFeatureOf(e);
    if (nf) { if (!from.has(nf)) from.set(nf, []); from.get(nf).push(e); }
    e.owned.forEach(walk); e.related.forEach(walk);
  })(a.tree);
  const same = [element];
  for (let i = 0; i < same.length; i++) for (const f of from.get(same[i]) ?? []) if (!same.includes(f)) same.push(f);
  const old = element[which];
  const segs = [];
  for (const t of same) for (const x of model.referencesTo(t)) if (unquote(a.text.slice(x.start, x.end)) === old) segs.push({ ...x, owner: t });
  return segs;
}

export function checkFiles(files, opts = {}) {
  const a = analyzeFiles(files);
  const res = { files: files.length, ok: a.ok, elements: 0, refs: 0, renamed: 0, same: 0, alias: 0, inherit: 0, unresolved: 0, unexplained: 0, unexplainedList: [], roles: {}, other: 0, renameRun: 0, renameOk: 0, renameRejected: [], renameMismatch: [] };
  if (!a.anyOk) return res;
  const prepared = prepareFromAnalysis(a);
  const o = buildOutline(prepared, a.single ? null : a, { elements: true });
  const base = (f) => (a.single || f == null ? 0 : a.files[f].base);
  res.other = o.other;
  for (const it of o.items) for (const r of o.refs[it.id] ?? []) res.roles[r.role] = (res.roles[r.role] ?? 0) + 1;
  for (const it of o.items) {
    if (!it.named) continue;
    const el = it.element;
    if (!el || el.name === undefined) continue; // 名前を宣言した要素だけ(名前を受け継ぐだけの要素は、名前の変更を受け付けない)
    res.elements++;
    const panel = (o.refs[it.id] ?? []).map((r) => `${base(r.at.f) + r.at.start}:${base(r.at.f) + r.at.end}`);
    const segs = renameSegments(a, el);
    const rename = segs.map((x) => `${x.start}:${x.end}`);
    res.refs += panel.length; res.renamed += rename.length;
    const P = new Set(panel), R = new Set(rename);
    for (const k of P) {
      if (R.has(k)) { res.same++; continue; }
      const [s, e] = k.split(':').map(Number);
      if (unquote(a.text.slice(s, e)) !== el.name) res.alias++;
      else { res.unexplained++; res.unexplainedList.push(`${it.q}: 参照箇所にあり書き換えない ${a.text.slice(s, e)} @${s}`); }
    }
    for (const x of segs) {
      const k = `${x.start}:${x.end}`;
      if (P.has(k)) continue;
      if (x.ref.status !== 'resolved') res.unresolved++;
      else if (x.owner !== el) res.inherit++;
      else { res.unexplained++; res.unexplainedList.push(`${it.q}: 書き換えるが参照箇所にない ${a.text.slice(x.start, x.end)} @${x.start}`); }
    }
    // 名前の変更を実際に行い、書き換える区切りの数(宣言の名前を除く)が同じことを確かめる
    if (opts.rename) {
      res.renameRun++;
      const r = renameElement({ text: a.text, analysis: { ok: true, tree: a.tree, model: a.model, semantic: a.semantic ?? [] }, element: el, which: 'name', newName: `${el.name}_gr26` }, a.single ? {} : { folder: folderOf(a) });
      if (!r.ok) res.renameRejected.push(`${it.q}: ${r.code} ${r.reason}`);
      else { res.renameOk++; if (r.edits.length - 1 !== new Set(rename).size) res.renameMismatch.push(`${it.q}: 書き換え ${r.edits.length - 1}、求めた数 ${new Set(rename).size}`); }
    }
  }
  return res;
}

const sum = (rs) => {
  const t = { inputs: rs.length, elements: 0, refs: 0, renamed: 0, same: 0, alias: 0, inherit: 0, unresolved: 0, unexplained: 0, other: 0, roles: {}, renameRun: 0, renameOk: 0, renameRejected: 0, renameMismatch: 0 };
  for (const r of rs) {
    for (const k of ['elements', 'refs', 'renamed', 'same', 'alias', 'inherit', 'unresolved', 'unexplained', 'other', 'renameRun', 'renameOk']) t[k] += r[k];
    t.renameRejected += r.renameRejected.length; t.renameMismatch += r.renameMismatch.length;
    for (const [k, v] of Object.entries(r.roles)) t.roles[k] = (t.roles[k] ?? 0) + v;
  }
  return t;
};

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (MAIN) {
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const OUT = outAt >= 0 ? args[outAt + 1] : null;
const RENAME = args.includes('--rename');
let results = [];
if (args.includes('--examples')) {
  const dirs = ['vendor/release-2026-03/sysml/src', 'vendor/release-2026-03/sysml.library'].map((d) => path.join(ROOT, d));
  for (const d of dirs) {
    if (!fs.existsSync(d)) { console.error(`${d} がない(tools/fetch.sh で取得する)`); process.exit(2); }
    for (const p of listSysml(d)) {
      const r = checkFiles([{ path: p, text: fs.readFileSync(path.join(d, p), 'utf8') }]);
      results.push({ input: path.relative(ROOT, path.join(d, p)), ...r });
    }
  }
} else {
  const dir = args.find((x, i) => !x.startsWith('--') && args[i - 1] !== '--out');
  if (!dir) { console.error('使い方: node tools/model/gr26_refs_check.mjs <フォルダ> [--rename] [--out <JSON>] | --examples'); process.exit(2); }
  const ps = listSysml(dir);
  const r = checkFiles(ps.map((p) => ({ path: p, text: fs.readFileSync(path.join(dir, p), 'utf8') })), { rename: RENAME });
  results.push({ input: dir, ...r });
}
const total = sum(results);
console.log(JSON.stringify({ total, ...(results.length === 1 ? { detail: results[0] } : {}) }, null, 1));
for (const r of results) for (const u of r.unexplainedList) console.log(`説明できない違い: ${r.input}: ${u}`);
for (const r of results) for (const u of r.renameMismatch) console.log(`名前の変更の書き換えの数が違う: ${r.input}: ${u}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ total, results }, null, 1));
process.exit(total.unexplained || total.renameMismatch ? 1 : 0);
}
