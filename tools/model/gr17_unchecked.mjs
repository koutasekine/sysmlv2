// 309 ファイルと例の参照を、状態ごとに数える(GR17 起動プロンプトの P0、指示書 4 章の L の (2)・(6))。
//
// 使い方:
//   node tools/model/gr17_unchecked.mjs [--list out/files309.txt] [--json 出力.json] [--library on|off]
//   --library は、標準ライブラリの索引(src/model/resolve.js の LIBRARY_INDEX)をこの実行だけ変える(省くと既定のまま)
//
// 数えるもの(309 ファイルと例を分けて書く):
//   refs          参照の数
//   unchecked     未検査の参照の数
//   uncheckedLib  未検査の参照のうち、最初の区切りの名前(書かれた名前。$:: の後ろを含む)が、標準ライブラリのパッケージの名前
//                 (照合用の標準ライブラリのファイルの最上位のパッケージの名前。この道具の中だけで読み、どこにも書き出さない)のもの
//   ambiguous     曖昧な参照の数
//   shadow        D3 の印の付いた参照の数
//   toLibrary     索引の要素に解決した参照の数(内蔵する表の項目は数えない)
//   toBuiltin     内蔵する表の項目に解決した参照の数

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { libraryFiles } from './library_members.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
const libOpt = opt('--library', null);
const ropts = libOpt === null ? {} : { libraryIndex: libOpt === 'on' };

// 標準ライブラリの最上位のパッケージの名前(「standard library package X」「library package X」「package X」の、ファイルの最上位のもの)
const libPackages = new Set();
for (const f of libraryFiles()) {
  const t = fs.readFileSync(f, 'utf8');
  const m = /^\s*(?:standard\s+)?(?:library\s+)?package\s+('(?:[^'\\]|\\.)*'|[A-Za-z_][A-Za-z0-9_]*)/m.exec(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
  if (m) libPackages.add(m[1].startsWith("'") ? m[1].slice(1, -1) : m[1]);
}

const count = (list) => {
  const s = { files: 0, refs: 0, unchecked: 0, uncheckedLib: 0, ambiguous: 0, shadow: 0, toLibrary: 0, toBuiltin: 0 };
  for (const f of list) {
    const text = decodeUtf8(fs.readFileSync(f));
    const p = parse(text);
    if (!p.ok) continue;
    s.files++;
    const m = resolveNames(p.tree, text, ropts);
    for (const r of m.refs) {
      s.refs++;
      if (r.status === 'unchecked') { s.unchecked++; if (libPackages.has(r.segments[0]?.name)) s.uncheckedLib++; }
      else if (r.status === 'ambiguous') s.ambiguous++;
      else {
        if (r.shadow) s.shadow++;
        if (r.target?.builtin) { if (r.target.lib) s.toLibrary++; else s.toBuiltin++; }
      }
    }
  }
  return s;
};
const out = { libraryPackages: libPackages.size, files309: count(files), sample: count(['src/app/sample.sysml']) };
const j = opt('--json', null);
if (j) { fs.mkdirSync(path.dirname(j), { recursive: true }); fs.writeFileSync(j, JSON.stringify(out, null, 1) + '\n'); }
for (const k of ['files309', 'sample']) {
  const s = out[k];
  console.log(`${k}: ファイル ${s.files}、参照 ${s.refs}、未検査 ${s.unchecked}(うち標準ライブラリのパッケージ名で始まるもの ${s.uncheckedLib})、曖昧 ${s.ambiguous}、D3 の印 ${s.shadow}、索引の要素に解決 ${s.toLibrary}、内蔵する表の項目に解決 ${s.toBuiltin}`);
}
console.log(`標準ライブラリの最上位のパッケージ ${out.libraryPackages}`);
