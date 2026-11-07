// 名前解決の入り口(GR3 指示書 6 章)。外部パッケージと Node.js 固有の機能を使わない。
//
// resolveNames(tree, text) は src/model/resolve.js を見よ。
// resolveText(text) は、解析(src/parser)と名前解決をまとめて行う。構文上正しくなければ { ok: false, errors } を返す。

import { parse } from '../parser/index.js';
import { resolveNames, conforms } from './resolve.js';
import builtinTable from './builtin_table.js';

export { resolveNames, conforms, builtinTable };

export function resolveText(text) {
  const r = parse(text);
  if (!r.ok) return { ok: false, errors: r.errors, model: null };
  return { ok: true, errors: [], tree: r.tree, model: resolveNames(r.tree, text) };
}

// GR20 の M: ファイルの並び [{ path, text }] を 1 つのモデルとして解析する入口(src/model/files.js)。上の 2 つの入口は変えない
export { analyzeFiles, sortPaths, comparePaths } from './files.js';
export { resolveForest } from './resolve.js';
