// 始点を省いた遷移の始点を、名前解決の側(src/model/ends.js の makeImplicitSources)と描画の側(src/view/ends.js の transitionEnds)で
// 求め、一致するかを確かめる(GR17 指示書 3.4 節・4 章の U)。
//
// 使い方:
//   node tools/model/gr17_ends_compare.mjs [--list out/files309.txt] [--json 出力.json]
//
// 309 ファイルと例の、すべての遷移(TransitionUsage)について、始点を省いたもの(描画の側の implicit が true)の始点が同じ要素か、
// 始点を書いたものは名前解決の側が undefined を返すかを数える。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/resolve.js';
import { makeImplicitSources } from '../../src/model/ends.js';
import { makeContext } from '../../src/view/common.js';
import { transitionEnds } from '../../src/view/ends.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = [...fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean), 'src/app/sample.sysml'];
const sum = { files: 0, transitions: 0, implicit: 0, sameImplicit: 0, implicitNull: 0, explicit: 0, sameExplicit: 0, mismatches: [] };
const id = (t) => !t ? null : t.builtin ? `B:${t.qname}` : `${t.kind}@${t.start}-${t.end}`;
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  sum.files++;
  const model = resolveNames(p.tree, text);
  const ctx = makeContext(p.tree, model, text);
  const implicitSource = makeImplicitSources(p.tree, model);
  (function walk(e) {
    if (model.conforms(e.kind, 'TransitionUsage')) {
      sum.transitions++;
      const v = transitionEnds(ctx, e);
      const m = implicitSource(e);
      if (v.implicit) {
        sum.implicit++;
        if (m !== undefined && id(m) === id(v.source)) { sum.sameImplicit++; if (!m) sum.implicitNull++; }
        else sum.mismatches.push({ file: f, start: e.start, view: id(v.source), model: m === undefined ? 'undefined' : id(m) });
      } else {
        sum.explicit++;
        if (m === undefined) sum.sameExplicit++;
        else sum.mismatches.push({ file: f, start: e.start, view: 'explicit', model: id(m) });
      }
    }
    for (const c of e.owned) walk(c);
    for (const c of e.related) walk(c);
  })(p.tree);
}
const j = opt('--json', null);
if (j) { fs.mkdirSync(path.dirname(j), { recursive: true }); fs.writeFileSync(j, JSON.stringify(sum, null, 1) + '\n'); }
console.log(`ファイル ${sum.files}、遷移 ${sum.transitions}: 始点を省いたもの ${sum.implicit}(一致 ${sum.sameImplicit}、うち両方とも求まらない ${sum.implicitNull})、始点を書いたもの ${sum.explicit}(一致 ${sum.sameExplicit})、食い違い ${sum.mismatches.length}`);
for (const x of sum.mismatches.slice(0, 20)) console.log(`  ${x.file} ${x.start}: 描画 ${x.view}、名前解決 ${x.model}`);
