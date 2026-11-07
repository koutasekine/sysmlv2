// 複数のファイルを 1 つのモデルとして解析する入口(GR20 の M。設計書 6.2 節の「複数のファイル」「$::A」の行、9.4 節)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// analyzeFiles(files, opts?) → analysis
//   files  ファイルの並び [{ path, text }](path はフォルダからの相対パス。区切りは /)。並びの順を、描く範囲の候補などの記述の順にする
//   opts.onProgress  解析の進み具合(src/parser の parse の onProgress)。{ file, files } を足して知らせる
//   opts.resolve     名前解決に渡す追加の引数(order など。検査の道具が使う)
// analysis = {
//   ok        すべてのファイルが構文上正しいか
//   anyOk     構文上正しいファイルが 1 つでもあるか(なければ model などは null)
//   single    ファイルが 1 つか。1 つなら、tree・text・model・semantic・warnings は、1 つのテキストの入口(src/model/index.js の
//             resolveText と src/model/semantic.js の checkSemantics、src/model/warn.js の checkWarnings)と同じもの
//   files     [{ path, text, base, end, ok, errors, root }]  base・end はつないだテキストの中の範囲(end は含む。base + text.length)。
//             errors は構文エラー(行・列・offset はそのファイルの中のもの)。root はそのファイルの根の名前空間(構文エラーなら null)
//   text      ファイルをつないだテキスト(ファイルの間に改行 1 つ。構文エラーのファイルは同じ長さの空白)。要素・参照・診断の
//             start・end は、このテキストの中の範囲
//   tree      2 つ以上のファイルなら、すべてのファイルの最上位の関係を並べた仮の根(forestRoots にファイルごとの根の名前空間、
//             forestFiles に files を持つ)。図(src/view)と図からの編集(src/edit)は、これを 1 つの根の名前空間として扱う。
//             名前解決・意味エラー・警告は、ファイルごとの根の名前空間を別の名前空間として扱う
//   model     名前解決の結果(src/model/resolve.js の resolveForest)
//   semantic・warnings  意味エラーと警告。それぞれに file(ファイルの番号)と、そのファイルの中の line・col を付ける
//   fileAt(offset)  つないだテキストの位置の、ファイルの番号(なければ -1)
// }
// sortPaths(paths) は相対パスを符号位置の順に並べる(設計書 9.4 節)。

import { parse } from '../parser/index.js';
import { resolveNames, resolveForest } from './resolve.js';
import { checkSemantics, lineColOf } from './semantic.js';
import { checkWarnings } from './warn.js';

export const SEPARATOR = '\n';

// 符号位置の順(UTF-16 の符号単位の順ではない)
export function comparePaths(a, b) {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
export const sortPaths = (paths) => [...paths].sort(comparePaths);

const shift = (root, base) => {
  if (!base) return;
  const stack = [root];
  while (stack.length) {
    const e = stack.pop();
    e.start += base; e.end += base;
    for (const c of e.owned) stack.push(c);
    for (const c of e.related) stack.push(c);
  }
};

export function analyzeFiles(files, opts = {}) {
  const onProgress = opts.onProgress;
  const ropts = opts.resolve ?? {};
  const infos = [];
  let base = 0;
  for (let i = 0; i < files.length; i++) {
    const { path, text } = files[i];
    const p = parse(text, onProgress ? { onProgress: (x) => onProgress({ ...x, file: i, files: files.length }) } : undefined);
    if (p.ok) shift(p.tree, base);
    infos.push({ path, text, base, end: base + text.length, ok: p.ok, errors: p.ok ? [] : p.errors, root: p.ok ? p.tree : null });
    base += text.length + SEPARATOR.length;
  }
  const fileAt = (offset) => {
    if (offset == null) return -1;
    let lo = 0, hi = infos.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (infos[m].base <= offset) { k = m; lo = m + 1; } else hi = m - 1; }
    return k >= 0 && offset <= infos[k].end ? k : -1;
  };
  const ok = infos.every((f) => f.ok);
  const roots = infos.filter((f) => f.ok).map((f) => f.root);
  const res = { ok, anyOk: roots.length > 0, single: files.length === 1, files: infos, text: null, tree: null, roots, model: null, semantic: null, warnings: null, fileAt };
  if (files.length === 1) {
    // 1 つのテキストの入口と同じ(位置もずらさない)
    const f = infos[0];
    res.text = f.text;
    if (!f.ok) return res;
    if (onProgress) onProgress({ stage: 'resolve', done: 0, total: null });
    res.tree = f.root;
    res.model = resolveNames(f.root, f.text, ropts);
    res.semantic = checkSemantics(f.root, res.model, f.text).map((x) => ({ ...x, file: 0 }));
    res.warnings = checkWarnings(f.root, res.model, f.text).map((x) => ({ ...x, file: 0 }));
    return res;
  }
  // つないだテキスト。構文エラーのファイルは同じ長さの空白にする(字句の分割が止まらないように)。先頭の BOM は空白にする
  res.text = infos.map((f) => (f.ok ? (f.text.charCodeAt(0) === 0xfeff ? ' ' + f.text.slice(1) : f.text) : ' '.repeat(f.text.length))).join(SEPARATOR);
  if (!roots.length) return res;
  const top = { kind: 'Namespace', owned: roots.flatMap((r) => r.owned), related: [], refs: {}, attrs: {}, start: 0, end: res.text.length, forestRoots: roots, forestFiles: infos };
  res.tree = top;
  if (onProgress) onProgress({ stage: 'resolve', done: 0, total: null });
  res.model = resolveForest(roots, res.text, { ...ropts, forestTop: top });
  const local = (x) => {
    const k = fileAt(x.start);
    if (k < 0) return { ...x, file: -1 };
    const f = infos[k];
    return { ...x, file: k, ...lineColOf(f.text, x.start - f.base) };
  };
  res.semantic = checkSemantics(top, res.model, res.text).map(local);
  res.warnings = checkWarnings(top, res.model, res.text).map(local);
  return res;
}
