// 警告(W1・W2)の件数を、309 ファイルと「例を読み込む」の 2 つの例で数える(GR19 指示書 4 章)。
//
// 使い方:
//   node tools/model/gr19_warn_counts.mjs [--list out/files309.txt] [--base vendor/release-2026-03] [--out out/GR19/warn]
//
// 書き出すもの:
//   <out>/summary.json  ファイル数、例外、項目ごとの件数、W1 の使用の種類ごとの件数と例(各種類から最大 5 件)、W2 の例(最大 10 件)、
//                       2 つの例(src/app/sample.sysml・src/app/sample_intro.sysml)の件数と、意味エラー・未検査の件数。
//                       判定した数は、309 ファイルの分を judged に、2 つの例の分を例ごとに samples.<例>.judged に書く(GR20 の Z2。
//                       GR19 までは、judged を 2 つの例を数えた後に写していたので、2 つの例の分が混ざっていた)
//   <out>/all.json      すべての警告(ファイル・行・列・項目・文・原文)
// 例は記述の順(ファイルの一覧の順、ファイルの中は位置の順)の先頭から採る。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';
import { checkWarnings } from '../../src/model/warn.js';
import { walkTree } from '../../src/parser/tree.js';
import w1Table from '../../src/model/w1_table.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
const base = path.resolve(opt('--base', 'vendor/release-2026-03'));
const outDir = opt('--out', 'out/GR19/warn');
fs.mkdirSync(outDir, { recursive: true });

// 使用の種類 → 通常の行(actor・stakeholder の行でないもの)の節
const ROW_SECTION = new Map(w1Table.entries.filter((e) => !e.memberships).map((e) => [e.usage, e.section]));
const all = [];
const stats = {}; // 判定した型付け(W1 は使用の種類ごと)と、判定した使用(W2)の数
const count = { W1: 0, W2: 0 };
const w1ByKind = {};
const w2Examples = [];
let parsed = 0, exceptions = 0;
const exceptionFiles = [];
const t0 = performance.now();
const one = (abs, st = stats) => {
  const text = decodeUtf8(fs.readFileSync(abs));
  const p = parse(text);
  if (!p.ok) return null;
  const model = resolveNames(p.tree, text);
  return { text, tree: p.tree, model, warnings: checkWarnings(p.tree, model, text, { stats: st }) };
};
for (const f of files) {
  const abs = path.resolve(f);
  const rel = abs.startsWith(base + path.sep) ? path.relative(base, abs) : path.basename(abs);
  try {
    const r = one(abs);
    if (!r) continue;
    parsed++;
    // 使用の種類(W1 の例の分け方)は、警告の範囲(型の参照)を持つ型付けの持ち主
    const parentOf = new Map();
    walkTree(r.tree, (e, p) => parentOf.set(e, p));
    const ownerKind = new Map();
    for (const ref of r.model.refs) if (ref.start != null) ownerKind.set(`${ref.start}:${ref.end}`, parentOf.get(ref.node)?.kind ?? '?');
    for (const w of r.warnings) {
      const rec = { file: rel, line: w.line, col: w.col, item: w.item, message: w.message, text: r.text.slice(w.start, w.end).replace(/\s+/g, ' ').slice(0, 120) };
      all.push(rec);
      count[w.item]++;
      if (w.item === 'W1') {
        // 型付けの持ち主の種類は、メッセージの頭の使用の日本語名から取らず、構文木から取る
        // actor・stakeholder の行(GR19 の P5)で出たものは、使用の種類に行の節を付けて分ける(例: PartUsage@7.21.2)
        const k0 = ownerKind.get(`${w.start}:${w.end}`) ?? '?';
        const kind = ROW_SECTION.get(k0) && `SysML 2.0 ${ROW_SECTION.get(k0)}` !== w.section ? `${k0}@${w.section.replace(/^SysML 2\.0 /, '')}` : k0;
        const k = (w1ByKind[kind] ??= { count: 0, examples: [] });
        k.count++;
        if (k.examples.length < 5) k.examples.push(rec);
      } else if (w2Examples.length < 10) w2Examples.push(rec);
    }
  } catch (e) {
    exceptions++;
    exceptionFiles.push(`${rel}: ${e?.message ?? e}`);
  }
}
const statsFiles = JSON.parse(JSON.stringify(stats)); // 309 ファイルの分(例を数える前に写す。GR20 の Z2)
const samples = {};
for (const s of ['src/app/sample.sysml', 'src/app/sample_intro.sysml']) {
  if (!fs.existsSync(s)) { samples[s] = null; continue; }
  const judged = {}; // この例の分の判定した数(GR20 の Z2)
  const r = one(path.resolve(s), judged);
  if (!r) { samples[s] = { parsed: false }; continue; }
  const sem = checkSemantics(r.tree, r.model, r.text);
  samples[s] = {
    parsed: true, W1: r.warnings.filter((w) => w.item === 'W1').length, W2: r.warnings.filter((w) => w.item === 'W2').length,
    semantic: sem.length, unchecked: r.model.refs.filter((x) => x.status === 'unchecked').length, ambiguous: r.model.refs.filter((x) => x.status === 'ambiguous').length,
    warnings: r.warnings.map((w) => `${w.item} ${w.line}:${w.col} ${w.message}`), judged,
  };
}
const summary = { files: files.length, parsed, exceptions, exceptionFiles, count, judged: statsFiles, w1ByKind, w2Examples, samples, sec: Math.round((performance.now() - t0) / 100) / 10 };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
fs.writeFileSync(path.join(outDir, 'all.json'), JSON.stringify(all, null, 1) + '\n');
console.log(`判定した数(309 ファイル): ${JSON.stringify(statsFiles)}`);
console.log(`files=${files.length} parsed=${parsed} exceptions=${exceptions} W1=${count.W1} W2=${count.W2} sec=${summary.sec}`);
for (const [k, v] of Object.entries(w1ByKind).sort((a, b) => b[1].count - a[1].count)) console.log(`  W1 ${k}: ${v.count}`);
for (const [s, v] of Object.entries(samples)) console.log(`  ${s}: ${v ? JSON.stringify({ ...v, warnings: undefined }) : 'なし'}`);
