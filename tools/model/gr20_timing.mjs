// GR20: フォルダの全ファイルの解析の時間を測る(GR20 指示書 4 章の「時間」。合否に使わない)。
//
// 使い方:
//   node tools/model/gr20_timing.mjs <フォルダ>... [--repeat 3]
// フォルダごとに、中の .sysml(下のフォルダを含む。名前が . で始まるフォルダの中は読まない)を相対パスの符号位置の順に並べ、
// 解析(src/model/files.js の analyzeFiles: 構文解析・名前解決・意味エラー・警告)と、描く範囲の候補の準備(src/app/prepare.js の
// prepareFromAnalysis)の時間を、同じプロセスで --repeat 回測る(1 回目はプロセスの最初の解析で、索引の準備を含む)。始めの負荷平均も書く
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import { analyzeFiles, sortPaths } from '../../src/model/files.js';
import { prepareFromAnalysis } from '../../src/app/prepare.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const repeat = +opt('--repeat', 3);
const dirs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--repeat');
console.log(`始めの負荷平均 ${fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ')}`);
for (const dir of dirs) {
  const rels = [];
  (function walk(sub) { for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) { if (e.name.startsWith('.') && e.isDirectory()) continue; const r = sub ? `${sub}/${e.name}` : e.name; if (e.isDirectory()) walk(r); else if (r.endsWith('.sysml')) rels.push(r); } })('');
  const files = sortPaths(rels).map((r) => ({ path: r, text: decodeUtf8(fs.readFileSync(path.join(dir, r))) }));
  const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.text), 0);
  const rows = [];
  for (let k = 0; k < repeat; k++) {
    const t0 = performance.now();
    const a = analyzeFiles(files);
    const t1 = performance.now();
    const p = prepareFromAnalysis(a);
    const t2 = performance.now();
    rows.push({ analyze: Math.round(t1 - t0), prepare: Math.round(t2 - t1), refs: a.model?.refs.length ?? 0, ok: a.ok, candidates: (p.generalCandidates ?? []).length });
  }
  console.log(`${dir}: ${files.length} ファイル、${bytes.toLocaleString('en-US')} バイト、参照 ${rows[0].refs}、構文エラーなし ${rows[0].ok}、解析 ${rows.map((r) => r.analyze).join(' / ')} ms、候補の準備 ${rows.map((r) => r.prepare).join(' / ')} ms`);
}
