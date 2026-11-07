// ファイルの一覧について、解析と名前解決を行い、参照の解決の結果を集計する(GR3 指示書 6 章・8 章)。
//
// 使い方:
//   node tools/model/resolve_files.mjs [--list out/files309.txt] [--out out/model/resolve] [--dump]
//
// --list  解析するファイルの一覧(1 行に 1 つ、リポジトリからの相対パス)。既定は out/files309.txt
// --out   結果を書くフォルダ。summary.json(集計)と、--dump のときファイルごとの参照の一覧 files/*.json
// 例外が起きたファイルか、解き直しが上限に達したファイルがあれば終了コード 1。
// 時間は解析(parse)と名前解決(resolveNames)を分けて測る。メモリは process.memoryUsage().rss の最大値。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const listPath = opt('--list', 'out/files309.txt');
const outDir = opt('--out', 'out/model/resolve');
const dump = args.includes('--dump');

const files = fs.readFileSync(listPath, 'utf8').split('\n').filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
if (dump) fs.mkdirSync(path.join(outDir, 'files'), { recursive: true });

const sum = { files: files.length, parsed: 0, rejected: 0, exceptions: [], refs: 0, status: {}, shadow: 0, shadowWhy: {}, reasons: {}, kindMismatch: 0, rangeMissing: 0, cycle: 0, maxIterations: 0, maxIterationsFile: null, notConverged: [], resolveMsTotal: 0, slowest: null, maxRssMB: 0 };
const describe = (e, model) => !e ? null : e.builtin ? { builtin: e.qname } : e.virtual ? { virtual: e.virtual, of: describe(e.of, model) } : { kind: e.kind, name: model.namesOf(e).name, start: e.start };

for (const f of files) {
  let text;
  try { text = decodeUtf8(fs.readFileSync(f)); } catch (e) { sum.exceptions.push({ file: f, phase: 'read', message: String(e) }); continue; }
  const p = parse(text);
  if (!p.ok) { sum.rejected++; continue; }
  sum.parsed++;
  let model;
  const t0 = performance.now();
  try { model = resolveNames(p.tree, text); }
  catch (e) { sum.exceptions.push({ file: f, phase: 'resolve', message: String(e), stack: e.stack?.split('\n').slice(0, 6).join('\n') }); continue; }
  const ms = performance.now() - t0;
  sum.resolveMsTotal += ms;
  if (!sum.slowest || ms > sum.slowest.ms) sum.slowest = { file: f, ms: Math.round(ms * 10) / 10 };
  if (model.iterations > sum.maxIterations) { sum.maxIterations = model.iterations; sum.maxIterationsFile = f; }
  if (!model.converged) sum.notConverged.push(f);
  const rss = process.memoryUsage().rss / 1048576;
  if (rss > sum.maxRssMB) sum.maxRssMB = Math.round(rss);
  for (const r of model.refs) {
    sum.refs++;
    sum.status[r.status] = (sum.status[r.status] ?? 0) + 1;
    if (r.reason) sum.reasons[`${r.status}:${r.reason}`] = (sum.reasons[`${r.status}:${r.reason}`] ?? 0) + 1;
    if (r.shadow) { sum.shadow++; for (const w of new Set(r.shadow.map(s => s.why))) sum.shadowWhy[w] = (sum.shadowWhy[w] ?? 0) + 1; }
    if (r.kindMismatch) sum.kindMismatch++;
    if (r.rangeMissing) sum.rangeMissing++;
    if (r.cycle) sum.cycle++;
    if (r.provisional) sum.provisional = (sum.provisional ?? 0) + 1;
  }
  if (dump) {
    const out = model.refs.map(r => ({
      kind: r.node.kind, prop: r.prop, index: r.index, text: r.text, start: r.start, end: r.end, status: r.status,
      target: describe(r.target, model), candidates: r.candidates?.map(c => describe(c, model)) ?? null,
      shadow: r.shadow?.map(s => s.why) ?? null, reason: r.reason, kindMismatch: r.kindMismatch,
    }));
    fs.writeFileSync(path.join(outDir, 'files', f.replace(/[\/ ]/g, '_') + '.json'), JSON.stringify(out) + '\n');
  }
}
sum.resolveMsTotal = Math.round(sum.resolveMsTotal);
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(sum, null, 1) + '\n');
console.log(`files=${sum.files} parsed=${sum.parsed} rejected=${sum.rejected} exceptions=${sum.exceptions.length} refs=${sum.refs} status=${JSON.stringify(sum.status)} shadow=${sum.shadow} ${JSON.stringify(sum.shadowWhy)} kindMismatch=${sum.kindMismatch} rangeMissing=${sum.rangeMissing} cycle=${sum.cycle} provisional=${sum.provisional ?? 0} maxIterations=${sum.maxIterations}(${sum.maxIterationsFile}) notConverged=${sum.notConverged.length} resolveMsTotal=${sum.resolveMsTotal} slowest=${sum.slowest?.file}(${sum.slowest?.ms}ms) maxRssMB=${sum.maxRssMB}`);
for (const e of sum.exceptions) console.log(`  例外: ${e.file}(${e.phase}): ${e.message}`);
for (const f of sum.notConverged) console.log(`  解き直しが上限に達した: ${f}`);
process.exit(sum.exceptions.length || sum.notConverged.length ? 1 : 0);
