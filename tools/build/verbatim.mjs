// 公開する前の検査 2(設計書 11 章の「公開の形」、GR23 指示書 3.1 節・3.3 節)。外部のパッケージを使わない。
//
// 文字のファイルの各行のうち、前後の空白と注記の記号を除いて 30 字以上のものが、
// 公式の例題・標準ライブラリ・パイロット実装のソース・仕様書のテキストに、そのまま現れるかを調べる。
//
// 使い方:
//   node tools/build/verbatim.mjs [--root 調べる木の根] [--json 出力.json] [ファイル…]
//     --root を与えないときは、作業ツリーの git ls-files の全ファイル(と未追跡の docs/ のファイル)を調べる。
//     --root を与えたときは、その木の中の全ファイルを調べる(dist/ の検査に使う)。
//     公式のファイルは、作業ツリー(このスクリプトのある木)の vendor/ と out/text/ から読む(--corpus で根を変えられる)。
//
// 比べ方:
//   - 行は、前後の空白を除き、行頭の注記の記号(//・/*・*・#・<!--・-- など)と行末の */・--> を除き、空白の並びを 1 つの空白にしたもの。
//   - 公式のファイルの文は、空白の並び(改行・改ページを含む)を 1 つの空白にしたもの。行は、その中の部分の文字列として現れれば「当たる」とする。
//   - 30 字は、符号位置の数で数える。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const MIN_CHARS = 30;
const KEY = 30; // 索引に使う先頭の UTF-16 の長さ(30 字以上の行は、少なくとも 30 の UTF-16 の長さを持つ)

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

export function normLine(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 4; k++) {
    const before = t;
    t = t.replace(/^(?:\/\/+|\/\*+|\*+\/|\*+|#+|<!--|-->|--+|;+)\s*/, '').replace(/\s*(?:\*+\/|-->)$/, '').trim();
    if (t === before) break;
  }
  return t;
}
export const normCorpus = (s) => s.replace(/\s+/g, ' ');
export const charLen = (s) => [...s].length;

// 文字のファイルか(NUL を含まず、UTF-8 として正しい)
export function readText(file) {
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

// 公式のファイルの集まり。種類ごとに [ファイルの相対パス…]
export function corpusFiles(base = ROOT) {
  const list = (dir, exts) => {
    const out = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === '.git') continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && (!exts || exts.some((x) => e.name.endsWith(x)))) out.push(p);
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out.sort();
  };
  const R = path.join(base, 'vendor/release-2026-03');
  // パイロット実装のソースは、その git が追跡するファイル(ビルドで足した target/・node_modules/ などの第三者のファイルを除く)
  const P = path.join(base, 'vendor/pilot');
  const pilot = fs.existsSync(path.join(P, '.git'))
    ? execFileSync('git', ['-C', P, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean).map((f) => path.join(P, f)).filter((f) => fs.existsSync(f) && fs.statSync(f).isFile()).sort()
    : [];
  return {
    '公式の例題': list(path.join(R, 'sysml/src')),
    '標準ライブラリ': list(path.join(R, 'sysml.library')),
    '公式の文法(bnf)': list(path.join(R, 'bnf')),
    'パイロット実装': pilot,
    '仕様書のテキスト': list(path.join(base, 'out/text'), ['.txt']),
  };
}

// candidates: [{ file, lines: [{ n, raw }] }] → 各ファイルの当たり
export function scan(candidates, corpus, { log = () => {} } = {}) {
  const byKey = new Map(); // 先頭 KEY → [{ norm, refs: [[ci, li]] , hit: null }]
  const uniq = new Map(); // norm → entry
  candidates.forEach((c, ci) => {
    c.checked = 0;
    c.lines.forEach((l, li) => {
      const norm = normLine(l.raw);
      l.norm = norm;
      if (charLen(norm) < MIN_CHARS) return;
      c.checked++;
      let e = uniq.get(norm);
      if (!e) {
        e = { norm, refs: [], hit: null };
        uniq.set(norm, e);
        const k = norm.slice(0, KEY);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(e);
      }
      e.refs.push([ci, li]);
    });
  });
  log(`  調べる行(重複を除く): ${uniq.size}`);
  const sizes = {};
  for (const [kind, files] of Object.entries(corpus)) {
    let bytes = 0;
    for (const f of files) {
      const raw = readText(f);
      if (raw === null) continue;
      bytes += raw.length;
      const C = normCorpus(raw);
      for (let i = 0; i + KEY <= C.length; i++) {
        const list = byKey.get(C.slice(i, i + KEY));
        if (!list) continue;
        for (const e of list) if (!e.hit && C.startsWith(e.norm, i)) e.hit = { kind, file: f };
      }
    }
    sizes[kind] = { files: files.length, chars: bytes };
    log(`  ${kind}: ${files.length} ファイル、${bytes} 字`);
  }
  const result = candidates.map((c) => {
    const hits = [];
    c.lines.forEach((l) => {
      const e = l.norm && uniq.get(l.norm);
      if (e && e.hit && charLen(l.norm) >= MIN_CHARS) hits.push({ line: l.n, text: l.norm, kind: e.hit.kind, in: e.hit.file });
    });
    return { file: c.file, checked: c.checked, hits };
  });
  return { result, sizes };
}

export function candidateOf(file, abs) {
  const text = readText(abs);
  if (text === null) return { file, binary: true, lines: [] };
  return { file, lines: text.split(/\r\n|\r|\n/).map((raw, i) => ({ n: i + 1, raw })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const root = opt('--root', null);
  const corpusBase = path.resolve(opt('--corpus', ROOT));
  const jsonOut = opt('--json', null);
  const named = argv.filter((a, i) => !a.startsWith('--') && !['--root', '--json', '--corpus'].includes(argv[i - 1]));
  let files;
  let base;
  if (named.length) {
    base = process.cwd();
    files = named;
  } else if (root) {
    base = path.resolve(root);
    files = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(path.relative(base, p));
      }
    };
    walk(base);
    files.sort();
  } else {
    base = ROOT;
    files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  }
  const t0 = Date.now();
  const cands = files.map((f) => candidateOf(f, path.join(base, f)));
  const corpus = corpusFiles(corpusBase);
  const { result, sizes } = scan(cands.filter((c) => !c.binary), corpus, { log: (s) => console.log(s) });
  const hitFiles = result.filter((r) => r.hits.length);
  console.log(`ファイル ${files.length}(文字 ${result.length}、文字でないもの ${cands.filter((c) => c.binary).length})、当たった行のあるファイル ${hitFiles.length}、当たった行 ${hitFiles.reduce((a, r) => a + r.hits.length, 0)}`);
  for (const r of hitFiles) console.log(`  ${r.file}: ${r.hits.length}/${r.checked}`);
  console.log(`時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ sizes, binary: cands.filter((c) => c.binary).map((c) => c.file), result }, null, 1) + '\n');
}
