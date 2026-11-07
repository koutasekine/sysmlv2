// 2 つの名前解決の結果(tools/model/resolve_files.mjs --dump の files/)を比べ、status か解決先が変わった参照を数える。
//
// 使い方:
//   node tools/model/diff_dumps.mjs <前のフォルダ> <後のフォルダ> [--out 結果.json]

import fs from 'node:fs';
import path from 'node:path';

const [a, b] = process.argv.slice(2);
const outI = process.argv.indexOf('--out');
const id = (t) => !t ? '' : t.builtin ? `B:${t.builtin}` : t.virtual ? `V:${t.of?.start}` : `${t.kind}@${t.start}`;
const key = (r) => `${r.kind}.${r.prop}#${r.index ?? 0}@${r.start}`;
const res = { files: 0, refs: 0, changed: 0, byChange: {}, examples: [] };
for (const f of fs.readdirSync(path.join(a, 'files'))) {
  const A = JSON.parse(fs.readFileSync(path.join(a, 'files', f)));
  const pb = path.join(b, 'files', f);
  if (!fs.existsSync(pb)) { res.examples.push({ file: f, missing: true }); continue; }
  const B = new Map(JSON.parse(fs.readFileSync(pb)).map(r => [key(r), r]));
  res.files++;
  for (const r of A) {
    res.refs++;
    const s = B.get(key(r));
    const before = `${r.status}|${id(r.target)}`, after = s ? `${s.status}|${id(s.target)}` : 'なし';
    if (before === after) continue;
    res.changed++;
    const k = `${r.status} → ${s?.status ?? 'なし'}`;
    res.byChange[k] = (res.byChange[k] ?? 0) + 1;
    if (res.examples.length < 20) res.examples.push({ file: f, ref: key(r), text: r.text, before: { status: r.status, target: r.target }, after: s ? { status: s.status, target: s.target } : null });
  }
}
if (outI > 0) fs.writeFileSync(process.argv[outI + 1], JSON.stringify(res, null, 1) + '\n');
console.log(`files=${res.files} refs=${res.refs} changed=${res.changed} ${JSON.stringify(res.byChange)}`);
for (const e of res.examples) console.log(`  ${e.file} ${e.ref} "${e.text}": ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`);
