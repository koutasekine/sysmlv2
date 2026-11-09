// フォルダの木の部品(GR24 の T・F・M。設計書 9.4 節の段階 C)。DOM・外部パッケージ・Node.js 固有の機能を使わない
// (画面 src/app/main.js から使い、検査 tests/view からも直接呼ぶ)。
//
// buildTree(filePaths, dirPaths) → 根 { name: '', path: '', dirs: [節], files: [{ name, path }] }
//   フォルダの中のすべてのファイルとフォルダの木。各階層で、フォルダを先に、次にファイルを、名前の符号位置の順に並べる(設計書 9.4 節)。
//   dirPaths は空のフォルダを含むフォルダの相対パス(ファイルの相対パスから分かるフォルダは書かなくてよい)
// nameError(name, siblings) → 名前の規則に反するときの理由(反しなければ null)。siblings は同じフォルダのほかの名前。入力した名前にだけかける
//   (GR25 の C2・C12。読み込んだ名前、名前を変えずに移す・写すときにはかけない)
// copyName(name, taken, isDir) → 貼り付けで同じ名前があるときの名前(拡張子の前に「 のコピー」、さらに重なれば「 のコピー 2」…)
// parentOf(path)・baseOf(path)・joinPath(dir, name)・isSameOrUnder(path, dir)・hiddenDir(path)

import { comparePaths } from './io.js';

export const parentOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
export const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);
export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);
export const isSameOrUnder = (p, dir) => dir === '' || p === dir || p.startsWith(`${dir}/`);
// 相対パスが、名前が . で始まるフォルダの中か(そのフォルダ自身を含む)。木にも出さない
export const hiddenDir = (p, isDir = false) => (isDir ? p.split('/') : p.split('/').slice(0, -1)).some((d) => d.startsWith('.'));

export function buildTree(filePaths, dirPaths = []) {
  const root = { name: '', path: '', dirs: [], files: [] };
  const dirs = new Map([['', root]]);
  // まだない祖先のフォルダを、外側から順に作る(再帰で作るのと同じ順。フォルダの深さに比例して呼び出しを深くしない。GR27 の E)
  const dirOf = (p) => {
    if (dirs.has(p)) return dirs.get(p);
    const chain = [];
    for (let x = p; !dirs.has(x); x = parentOf(x)) chain.push(x);
    for (let i = chain.length - 1; i >= 0; i--) {
      const q = chain[i];
      const d = { name: baseOf(q), path: q, dirs: [], files: [] };
      dirs.get(parentOf(q)).dirs.push(d);
      dirs.set(q, d);
    }
    return dirs.get(p);
  };
  for (const d of dirPaths) dirOf(d);
  for (const f of filePaths) dirOf(parentOf(f)).files.push({ name: baseOf(f), path: f });
  const byName = (a, b) => comparePaths(a.name, b.name);
  for (const d of dirs.values()) { d.dirs.sort(byName); d.files.sort(byName); }
  return root;
}

// 制御文字は Unicode の Cc(U+0000〜U+001F・U+007F〜U+009F)
const BAD = /[/\\:*?"<>|\u0000-\u001f\u007f-\u009f]/;
// Windows の予約名(GR25 の C12)
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export function nameError(name, siblings = []) {
  if (!name) return '名前が空です';
  const bad = BAD.exec(name);
  if (bad) return `名前に「${bad[0].charCodeAt(0) < 0x20 || (bad[0].charCodeAt(0) >= 0x7f && bad[0].charCodeAt(0) <= 0x9f) ? `制御文字 U+${bad[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` : bad[0]}」は使えません(/ \\ : * ? " < > | と制御文字は使えません)`;
  if (name.startsWith('.')) return '名前を . で始めることはできません';
  // GR25 の C12(設計書 9.4 節の段階 C): 末尾が . か空白でないこと、Windows の予約名でないこと。予約名は、最初の . の前の部分(拡張子を
  // 除いた部分。「CON.tar.gz」のように . が 2 つ以上あっても Windows は予約名として扱うので、最初の . で切る)で、大文字・小文字を区別しない
  if (/[. ]$/.test(name)) return `名前の末尾を「${name.endsWith('.') ? '.' : '空白'}」にすることはできません(Windows で使えない名前になるため)`;
  const stem = name.split('.')[0];
  if (RESERVED.test(stem)) return `「${stem}」は Windows の予約名なので、名前(拡張子を除いた部分)に使えません(CON・PRN・AUX・NUL・COM1〜COM9・LPT1〜LPT9)`;
  const same = siblings.find((s) => s.toLowerCase() === name.toLowerCase());
  if (same != null) return `同じフォルダに同じ名前の「${same}」があります(大文字・小文字は区別しません)`;
  return null;
}

export function copyName(name, taken, isDir = false) {
  const has = (n) => taken.some((t) => t.toLowerCase() === n.toLowerCase());
  if (!has(name)) return name;
  const dot = isDir ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    const c = `${stem} のコピー${n === 1 ? '' : ` ${n}`}${ext}`;
    if (!has(c)) return c;
  }
}
