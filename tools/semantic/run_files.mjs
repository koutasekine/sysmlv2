// ファイルの一覧について、解析・名前解決・意味エラーの検査(src/model/semantic.js)を行い、結果を書き出す(GR5 指示書 6 章)。
//
// 使い方:
//   node tools/semantic/run_files.mjs [--list out/files309.txt] [--base vendor/release-2026-03] [--out out/semantic]
//
// ファイルごとに <out>/files/<基準からの相対パス>.json を書く: { file, parsed, errors: [...], exception, checkMs }
// 全体の要約を <out>/summary.json に書く: ファイル数、構文エラーで検査しなかったファイル、例外、項目ごとの件数、
// 検査の時間の合計と最も遅いファイル。時間は checkSemantics だけを測る(解析と名前解決は含めない)。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
const base = path.resolve(opt('--base', 'vendor/release-2026-03'));
const outDir = opt('--out', 'out/semantic');

fs.rmSync(path.join(outDir, 'files'), { recursive: true, force: true });
const count = {};
let parsed = 0, exceptions = 0, totalMs = 0, slowest = null;
const rejected = [], exceptionFiles = [];
for (const f of files) {
  const abs = path.resolve(f);
  const rel = abs.startsWith(base + path.sep) ? path.relative(base, abs) : path.basename(abs);
  const rec = { file: rel, parsed: false, errors: null, exception: null, checkMs: null };
  try {
    const text = decodeUtf8(fs.readFileSync(abs));
    const p = parse(text);
    if (p.ok) {
      rec.parsed = true;
      parsed++;
      const model = resolveNames(p.tree, text);
      const t0 = performance.now();
      const errs = checkSemantics(p.tree, model, text);
      const ms = performance.now() - t0;
      rec.checkMs = Math.round(ms * 10) / 10;
      totalMs += ms;
      if (!slowest || ms > slowest.ms) slowest = { file: rel, ms: Math.round(ms * 10) / 10 };
      rec.errors = errs.map(e => ({ ...e, text: text.slice(e.start, e.end) }));
      for (const e of errs) count[e.item] = (count[e.item] ?? 0) + 1;
    } else rejected.push(rel);
  } catch (e) {
    rec.exception = String(e?.stack ?? e);
    exceptions++;
    exceptionFiles.push(rel);
  }
  const dest = path.join(outDir, 'files', rel + '.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(rec, null, 1) + '\n');
}
const summary = { files: files.length, parsed, rejected, exceptions, exceptionFiles, count, checkMsTotal: Math.round(totalMs), slowest };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
console.log(`files=${files.length} parsed=${parsed} rejected=${rejected.length} exceptions=${exceptions} count=${JSON.stringify(count)} checkMsTotal=${summary.checkMsTotal} slowest=${slowest?.file}(${slowest?.ms} ms)`);
