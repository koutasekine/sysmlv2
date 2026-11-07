// GR21 の X(GR21 指示書 4 章、設計書 10 章の「フォルダ」): 複数のファイルにまたがる図からの編集の確かめ。例題のフォルダ(GR20 の
// tools/model/gr20_folders.mjs list が書く一覧の examples)ごとに、フォルダのファイルをまとめて解析し(src/model/files.js の analyzeFiles)、
// ほかのファイルから参照される要素(解決済みの参照の区切りの解決先が、参照と別のファイルにある利用者のモデルの要素)を、ファイルの並びの順・
// ファイルの中は記述の順に並べ、interval 個ごとに選ぶ。選んだ要素ごとに、名前の変更(引用符の要らない名前 Gr21Name と、要る名前
// '改名 の名前' の 2 通り)と削除を、src/edit(renameElement・deleteElement。opts.folder)で行う。
// 行った操作は、書き換えた後のつないだテキストをファイルに分け、src/edit を通さずに analyzeFiles で解析し直して、全ファイルのモデルの差分
// (src/edit/index.js の modelDump・diffDumps)が意図した変更だけであることを、道具の側でも確かめる:
//   名前の変更: 差分が、その要素の名前(1 件)だけ。要素の増減と参照の状態・解決先の変化がない
//   削除: 消えた要素が、消した文(一緒に消したものを含む)とその中身だけで、残った要素の数・参照の数が合い、意味エラーが増えない
// 8 章の条件で実行前に拒否した操作は、件数と理由(code)を数える。書き換え後の確かめで戻した操作(reverted)は 0 件であること。
//
// 使い方:
//   node tools/model/gr21_cross_edit.mjs [--folders out/GR20/folders.json] [--interval 5] [--out out/GR21/cross_edit]
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import { analyzeFiles } from '../../src/model/files.js';
import { renameElement, folderOf, modelDump, diffDumps, positionsOf } from '../../src/edit/index.js';
import { deleteElement, deletePlan } from '../../src/edit/remove.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const interval = Number(opt('--interval', 5));
const outDir = opt('--out', 'out/GR21/cross_edit');
const NAMES = ['Gr21Name', '改名 の名前'];
const RULE8 = new Set(['syntax', 'not-user', 'undeclared', 'empty', 'unchecked-refs', 'S2', 'remaining-refs']);

const sum = { interval, folders: 0, skippedFolders: [], files: 0, candidates: 0, selected: 0, ops: 0, done: 0, multiFile: 0, rejected: {}, rejectedRule8: 0, rejectedOther: 0, reverted: 0, toolMismatch: 0, exceptions: 0, byKind: {}, time: 0 };
const records = [];
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const t0 = performance.now();
const all = JSON.parse(fs.readFileSync(opt('--folders', 'out/GR20/folders.json'), 'utf8')).filter((g) => g.group === 'examples');

for (const g of all) {
  const list = g.files.map((f) => ({ path: f.slice(g.dir.length + 1), text: decodeUtf8(fs.readFileSync(f)) }));
  const a = analyzeFiles(list);
  if (!a.ok) { sum.skippedFolders.push({ folder: g.name, why: '構文エラーのファイルがある(図からの編集は止まる)' }); continue; }
  sum.folders++; sum.files += list.length;
  const F = folderOf(a);
  const fileOfAt = (at) => a.fileAt(at);
  // ほかのファイルから参照される要素(記述の順)
  const set = new Set();
  for (const r of a.model.refs) {
    if (r.start == null) continue;
    const rf = fileOfAt(r.start);
    for (const s of r.segments ?? []) {
      const t = s.target;
      if (!t || t.lib || t.builtin || t.virtual || t.end <= t.start) continue;
      if (fileOfAt(t.start) !== rf) set.add(t);
    }
  }
  const cands = [...set].sort((x, y) => x.start - y.start);
  sum.candidates += cands.length;
  const pos = positionsOf(a.tree);
  const before = modelDump(a);
  const analysis = { ok: true, tree: a.tree, model: a.model, semantic: a.semantic };
  const opts = { folder: F };
  // 書き換えた後のつないだテキストを、ファイルごとのテキストに分ける
  const split = (out, edits) => {
    let shift = 0;
    return F.files.map((f) => {
      const d = edits.filter((e) => e.start >= f.base && e.end <= f.end).reduce((x, e) => x + (e.text ?? '').length - (e.end - e.start), 0);
      const t = out.slice(f.base + shift, f.end + shift + d);
      shift += d;
      return { path: f.path, text: t };
    });
  };
  const touched = (edits) => [...new Set(edits.map((e) => F.files.findIndex((f) => f.base <= e.start && e.end <= f.end)))];
  for (let i = 0; i < cands.length; i += interval) {
    const el = cands[i];
    sum.selected++;
    const at = `${g.name}/${F.files[fileOfAt(el.start)].path}#${pos.get(el)}`;
    const ops = [];
    if (el.name !== undefined) for (const nn of NAMES) ops.push(['rename', nn]);
    ops.push(['delete', null]);
    for (const [kind, nn] of ops) {
      sum.ops++;
      const key = kind === 'rename' ? `rename:${/^[A-Za-z]/.test(nn) ? 'plain' : 'quoted'}` : 'delete';
      sum.byKind[key] ??= { ops: 0, done: 0, rejected: 0, reverted: 0, multiFile: 0 };
      const bk = sum.byKind[key];
      bk.ops++;
      const rec = { at, kind: el.kind, name: el.name ?? null, op: kind, newName: nn };
      try {
        const r = kind === 'rename' ? renameElement({ text: a.text, analysis, element: el, which: 'name', newName: nn }, opts) : deleteElement({ text: a.text, analysis, element: el }, opts);
        if (!r.ok) {
          if (r.reverted) { sum.reverted++; bk.reverted++; rec.result = 'reverted'; rec.reason = r.reason; rec.details = r.details?.slice(0, 5); }
          else {
            bump(sum.rejected, r.code); bk.rejected++;
            if (RULE8.has(r.code)) sum.rejectedRule8++; else sum.rejectedOther++;
            rec.result = 'rejected'; rec.code = r.code; rec.reason = r.reason; rec.details = r.details?.slice(0, 3);
          }
          records.push(rec);
          continue;
        }
        sum.done++; bk.done++;
        const tf = touched(r.edits);
        rec.result = 'done'; rec.files = tf.map((k) => F.files[k].path);
        if (tf.length > 1) { sum.multiFile++; bk.multiFile++; }
        // 道具の側の確かめ: ファイルに分けて解析し直す
        const files2 = split(r.text, r.edits);
        const a2 = analyzeFiles(files2);
        let bad = null;
        if (!a2.ok) bad = '解析し直すと構文エラー';
        else if (kind === 'rename') {
          const d = diffDumps(before, modelDump(a2));
          if (d.added.length || d.removed.length || d.refs.length || d.elements.length !== 1 || d.elements[0].pos !== pos.get(el) || d.elements[0].field !== 'name' || d.elements[0].after !== nn) bad = `モデルの差分: ${JSON.stringify({ e: d.elements.slice(0, 3), a: d.added.length, r: d.removed.length, refs: d.refs.slice(0, 3) })}`;
          else if (a2.semantic.length > a.semantic.length) bad = '意味エラーが増える';
        } else {
          const plan = deletePlan({ analysis, element: el, text: a.text }, opts);
          const unitPos = plan.units.map((u) => pos.get(u));
          const gone = (p) => unitPos.some((u) => p === u || p.startsWith(`${u}o`) || p.startsWith(`${u}r`));
          const keptEl = before.elements.filter((x) => !gone(x.pos)).length;
          const keptRefs = before.refs.filter((x) => !gone(x.key.split('|')[0])).length;
          const now = modelDump(a2);
          if (now.elements.length !== keptEl) bad = `要素の数 ${now.elements.length}(残るはず ${keptEl})`;
          else if (now.refs.length !== keptRefs) bad = `参照の数 ${now.refs.length}(残るはず ${keptRefs})`;
          else if (a2.semantic.length > a.semantic.length) bad = '意味エラーが増える';
          rec.units = plan.units.length;
        }
        if (bad) { sum.toolMismatch++; rec.toolMismatch = bad; }
        records.push(rec);
      } catch (e) {
        sum.exceptions++; rec.result = 'exception'; rec.reason = e?.stack ?? String(e); records.push(rec);
      }
    }
  }
}
sum.time = +((performance.now() - t0) / 1000).toFixed(1);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(sum, null, 1) + '\n');
fs.writeFileSync(path.join(outDir, 'records.json'), JSON.stringify(records, null, 1) + '\n');
console.log(`folders=${sum.folders} files=${sum.files} candidates=${sum.candidates} interval=${interval} selected=${sum.selected} ops=${sum.ops} done=${sum.done} multiFile=${sum.multiFile} rejected=${JSON.stringify(sum.rejected)} rule8=${sum.rejectedRule8} other=${sum.rejectedOther} reverted=${sum.reverted} toolMismatch=${sum.toolMismatch} exceptions=${sum.exceptions} time=${sum.time}s`);
for (const [k, v] of Object.entries(sum.byKind)) console.log(`  ${k}: ${JSON.stringify(v)}`);
if (sum.skippedFolders.length) console.log(`  飛ばしたフォルダ: ${JSON.stringify(sum.skippedFolders)}`);
process.exit(sum.reverted || sum.toolMismatch || sum.exceptions ? 1 : 0);
