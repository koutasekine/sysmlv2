// GR22: フォルダの描く範囲の候補の全数比較(GR22 指示書 4 章。B1 で「範囲」の欄の表示を変えたので、候補の並びと id が変わらないことを確かめる)。
// 例題のフォルダと最小の入力(tools/model/gr20_folders.mjs list が書く一覧)について、フォルダのファイルをまとめて解析し
// (src/app/prepare.js の prepareFiles)、6 つのビューの候補の並び(id と種類)を書き出し、2 つの書き出しを比べる。
// 表示(label)は比べない(B1 で変わる)。あわせて、--src の src に src/app/prepare.js の folderLabels があれば、それを当てた後も
// 並び・id・種類が変わらないことを確かめ、表示を付けた候補の数と例を書き出す。
//
// 使い方:
//   node tools/model/gr22_folder_candidates.mjs dump <出力のファイル> [--folders out/GR20/folders.json] [--src <src のフォルダ>]
//   node tools/model/gr22_folder_candidates.mjs diff <前のファイル> <後のファイル>
//   --src   読み込む src(既定は作業ツリーの src)。前の版の src を作業ツリーの外に置いて使える
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const KINDS = ['candidates', 'generalCandidates', 'stateCandidates', 'actionCandidates', 'sequenceCandidates', 'tableCandidates'];

async function dump(outFile) {
  const srcDir = path.resolve(opt('--src', 'src'));
  const imp = (p) => import(pathToFileURL(path.resolve(srcDir, p)).href);
  const P = await imp('parser/index.js');
  const A = await imp('app/prepare.js');
  const all = JSON.parse(fs.readFileSync(opt('--folders', 'out/GR20/folders.json'), 'utf8'));
  const out = { folders: {}, summary: { folders: 0, candidates: 0, labeled: 0, labelCheck: A.folderLabels ? 'あり' : 'なし', labelOrderDiffs: 0, examples: [] } };
  for (const g of all) {
    const list = g.files.map((f) => ({ path: f.slice(g.dir.length + 1), text: P.decodeUtf8(fs.readFileSync(f)) }));
    const { analysis, prepared } = A.prepareFiles(list);
    const rec = {};
    for (const k of KINDS) {
      const cs = prepared.ok ? prepared[k] ?? [] : [];
      rec[k] = cs.map((c) => `${c.id}|${c.kind}`);
      out.summary.candidates += cs.length;
      if (A.folderLabels) {
        const ls = A.folderLabels(cs, analysis.files);
        if (JSON.stringify(ls.map((c) => `${c.id}|${c.kind}`)) !== JSON.stringify(rec[k])) out.summary.labelOrderDiffs++;
        ls.forEach((c, i) => { if (c.label !== cs[i].label) { out.summary.labeled++; if (out.summary.examples.length < 12) out.summary.examples.push(`${g.dir} ${k}: ${cs[i].label} → ${c.label}`); } });
      }
    }
    out.folders[g.dir] = rec;
    out.summary.folders++;
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.summary));
}

function diff(a, b) {
  const x = JSON.parse(fs.readFileSync(a, 'utf8')), y = JSON.parse(fs.readFileSync(b, 'utf8'));
  let lists = 0, diffs = 0;
  const ex = [];
  for (const [dir, rec] of Object.entries(x.folders)) {
    for (const k of KINDS) {
      lists++;
      if (JSON.stringify(rec[k]) !== JSON.stringify(y.folders[dir]?.[k])) { diffs++; if (ex.length < 10) ex.push(`${dir} ${k}`); }
    }
  }
  const extra = Object.keys(y.folders).filter((d) => !(d in x.folders)).length;
  console.log(JSON.stringify({ folders: Object.keys(x.folders).length, lists, differences: diffs + extra, examples: ex }));
  process.exit(diffs + extra ? 1 : 0);
}

if (args[0] === 'dump') await dump(args[1]);
else if (args[0] === 'diff') diff(args[1], args[2]);
else { console.error('使い方: dump <出力のファイル> [--src …] | diff <前> <後>'); process.exit(2); }
