// 標準ライブラリのファイル(.sysml・.kerml)から、型ごとのメンバーの名前と上位の型を読み出す(GR15 P2 で漏れの検査に作り、
// GR15 v15.2 の指示書 3.3 節の ASCII の検査に直した)。検査(tests/model/run.mjs の 6 章 D1)でだけ使う。読み出したものはアプリに
// 写さない(設計書 6.2 節・11 章)。
//
// 使い方(検査から):
//   import { scanLibrary, libraryClosure, asciiCheck } from '../../tools/model/library_members.mjs';
//   const lib = scanLibrary(files);            // Map 修飾名 → { names: Set(public・protected のメンバーの名前と短い名前), generals, file, line, isPackage }
//   libraryClosure(lib, 'Parts::Part')         // → { names: Set(上位の型から受け継ぐものを含む), unresolved: [求まらない上位の型] }
//   asciiCheck()                               // → 型(パッケージを除く名前空間)ごとの、ASCII 以外の文字を含むメンバーの名前
// 直接実行すると、ASCII の検査の結果を書く:
//   node tools/model/library_members.mjs [--json out/GR15/library_ascii.json]
//
// .kerml は SysML の文法で解析できないので、字句(src/parser/lexer.js。予約語は文法の表の予約語に KerML 1.0 の 8.2.2.6 節の
// 予約語を足したもの)に分け、宣言の並びを簡単に読む。宣言は「;」か本体の「{ … }」で終わり、doc・comment は注釈で終わる。
// 宣言の名前は、先頭の予約語(可視性・修飾子・宣言の種類)と接頭辞のメタデータ(#X)の後の、短い名前(<x>)と名前。名前がなく
// :>>・redefines で始まるものは、再定義する特徴の名前を実効の名前とする。上位の型は、:>・specializes・subclassifier・subtype・
// :・typed by・defined by・subsets・:>>・redefines・references・::>・conjugates・~ の後ろの修飾名。private の宣言は
// 受け継がれないので、名前に入れない。import・alias の対象・doc・comment・注釈・filter は名前に入れない(alias の名前は入れる)。
// 別名 alias X for Y は、Y を上位の型とする X の項目にする。

import fs from 'node:fs';
import path from 'node:path';
import { makeLexer } from '../../src/parser/lexer.js';
import grammar from '../../src/parser/grammar_table.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// KerML 1.0 の 8.2.2.6 節の予約語を本文から読む(kerml10 L5146〜)
function kermlKeywords() {
  const L = fs.readFileSync(path.join(ROOT, 'out/text/kerml10.txt'), 'utf8').replace(/\f/g, '').split('\n');
  const i = L.findIndex(t => t === '8.2.2.6 Reserved Words');
  if (i < 0) throw new Error('kerml10 に 8.2.2.6 Reserved Words がない');
  const out = [];
  for (let k = i + 1; k < L.length; k++) {
    const t = L[k].trim();
    if (/^Tooling for the KerML/.test(t)) break;
    if (!/^[a-z]+( [a-z]+)+$/.test(t)) continue;
    out.push(...t.split(' '));
  }
  return out;
}

const GEN_KW = new Set(['specializes', 'subclassifier', 'subtype', 'subsets', 'redefines', 'references', 'conjugates']);
const GEN_SYM = new Set([':>', ':', ':>>', '::>', '~']);
const SKIP_FIRST = new Set(['import', 'doc', 'comment', 'filter', 'language', 'rep', 'locale', 'dependency', 'metadata']);

export function scanLibrary(files) {
  const lex = makeLexer({ keywords: [...new Set([...grammar.keywords, ...kermlKeywords()])], symbols: grammar.symbols });
  const lib = new Map();
  for (const file of files) {
    const r = lex(fs.readFileSync(file, 'utf8'));
    if (!r.ok) throw new Error(`${file}: 字句のエラー ${r.error.message}`);
    const T = r.tokens;
    let i = 0;
    const isSym = (t, s) => t && t.kind === 'SYMBOL' && t.text === s;
    const nameText = (t) => (t.text.startsWith("'") ? t.text.slice(1, -1) : t.text);
    // 字句の並び A の j から修飾名を読む。→ { text, next }
    const qnameIn = (A, j) => {
      const parts = [];
      while (A[j] && A[j].kind === 'NAME') { parts.push(nameText(A[j])); if (isSym(A[j + 1], '::') && A[j + 2]?.kind === 'NAME') j += 2; else { j++; break; } }
      return { text: parts.join('::'), next: j };
    };
    const body = (scope) => {
      while (i < T.length && !isSym(T[i], '}')) {
        const st = i;
        // 宣言の終わりを探す(括弧の中と、= の後ろの式の本体 { … } は読み飛ばす)
        const first = T[i];
        if (first.kind === 'REGULAR_COMMENT') { i++; continue; }
        const isNote = first.kind === 'KEYWORD' && (first.text === 'doc' || first.text === 'comment');
        let depth = 0, valued = false, end = -1, open = false;
        for (let j = i; j < T.length; j++) {
          const t = T[j];
          if (isNote && t.kind === 'REGULAR_COMMENT') { end = j; break; }
          if (t.kind === 'SYMBOL') {
            if (t.text === '(' || t.text === '[') depth++;
            else if (t.text === ')' || t.text === ']') depth--;
            else if (depth === 0 && (t.text === '=' || t.text === ':=')) valued = true;
            else if (depth === 0 && t.text === ';') { end = j; break; }
            else if (depth === 0 && t.text === '{') {
              if (valued || isNote) { let d = 0; for (; j < T.length; j++) { if (isSym(T[j], '{')) d++; else if (isSym(T[j], '}') && --d === 0) break; } continue; }
              end = j; open = true; break;
            } else if (depth === 0 && t.text === '}') { end = j - 1; break; }
          } else if (depth === 0 && t.kind === 'KEYWORD' && t.text === 'default') valued = true;
        }
        if (end < 0) { i = T.length; break; }
        const H = T.slice(st, open ? end : end + 1).filter(t => t.kind !== 'REGULAR_COMMENT');
        i = end + 1;
        // 宣言の名前
        let k = 0, priv = false, skip = false, name = null, shortName = null;
        while (k < H.length && (H[k].kind === 'KEYWORD' || isSym(H[k], '#'))) {
          if (H[k].text === 'private') priv = true;
          if (H[k].kind === 'KEYWORD' && SKIP_FIRST.has(H[k].text) && k === (priv || H[0].text === 'public' || H[0].text === 'protected' ? 1 : 0)) skip = true;
          if (isSym(H[k], '#')) { k = qnameIn(H, k + 1).next; continue; }
          k++;
        }
        if (isSym(H[0], '@')) skip = true;
        if (isSym(H[k], '<') && H[k + 1]?.kind === 'NAME' && isSym(H[k + 2], '>')) { shortName = nameText(H[k + 1]); k += 3; }
        if (H[k]?.kind === 'NAME') { name = nameText(H[k]); k++; }
        else if (isSym(H[k], ':>>') || H[k]?.text === 'redefines') { const q = qnameIn(H, k + 1); name = q.text.split('::').pop() || null; }
        // 上位の型
        const generals = [];
        for (let j = k; j < H.length; j++) {
          const t = H[j];
          if ((t.kind === 'SYMBOL' && (t.text === '=' || t.text === ':=')) || (t.kind === 'KEYWORD' && t.text === 'default')) break;
          let from = -1;
          if (t.kind === 'KEYWORD' && GEN_KW.has(t.text)) from = j + 1;
          else if (t.kind === 'KEYWORD' && (t.text === 'typed' || t.text === 'defined') && H[j + 1]?.text === 'by') from = j + 2;
          else if (t.kind === 'SYMBOL' && GEN_SYM.has(t.text)) from = j + 1;
          if (from < 0) continue;
          for (let m = from; m < H.length;) {
            if (isSym(H[m], '~')) { m++; continue; }
            const q = qnameIn(H, m);
            if (!q.text) break;
            generals.push(q.text);
            m = q.next;
            if (isSym(H[m], ',')) m++; else break;
          }
        }
        // 別名(alias X for Y)は、Y を上位の型とする項目にする(別名で指したときのメンバーは Y のメンバー)。本体は doc などだけなので読まない
        const isAlias = H.some(t => t.kind === 'KEYWORD' && t.text === 'alias');
        if (isAlias) { const f = H.findIndex(t => t.kind === 'KEYWORD' && t.text === 'for'); generals.length = 0; if (f > 0) { const q = qnameIn(H, f + 1); if (q.text) generals.push(q.text); } }
        if (!skip && scope && !priv) { if (name) scope.names.add(name); if (shortName) scope.names.add(shortName); }
        if (open) {
          const q = scope && name ? (scope.qname ? `${scope.qname}::${name}` : name) : null;
          const isPackage = H.some(t => t.kind === 'KEYWORD' && t.text === 'package');
          const ent = q ? { qname: q, names: new Set(), generals, file, line: H[0]?.line ?? 0, scope: scope?.qname ?? null, isPackage } : { qname: null, names: new Set(), generals: [] };
          if (q && !lib.has(q)) lib.set(q, ent);
          body(ent.qname && !isAlias ? lib.get(q) : null);
          if (isSym(T[i], '}')) i++;
        } else if (!skip && scope && name) {
          const q = scope.qname ? `${scope.qname}::${name}` : name;
          if (!lib.has(q)) lib.set(q, { qname: q, names: new Set(), generals, file, line: H[0]?.line ?? 0, scope: scope.qname });
        }
      }
    };
    body({ qname: '', names: new Set(), generals: [] });
  }
  return lib;
}

// 修飾名 q の型が受け継ぐものを含むメンバーの名前。上位の型の名前は、宣言のある名前空間から外側へ「名前空間::名前」を探し、
// なければライブラリ全体で最後の区切りが同じものが 1 つだけならそれとする(import で見える名前を簡単に求める)
export function libraryClosure(lib, q) {
  const byLast = new Map();
  for (const k of lib.keys()) { const l = k.split('::').pop(); if (!byLast.has(l)) byLast.set(l, []); byLast.get(l).push(k); }
  const find = (text, scope) => {
    for (let s = scope; s; s = s.includes('::') ? s.slice(0, s.lastIndexOf('::')) : '') { const c = `${s}::${text}`; if (lib.has(c)) return c; }
    if (lib.has(text)) return text;
    const l = byLast.get(text.split('::').pop()) ?? [];
    return l.length === 1 ? l[0] : null;
  };
  const names = new Set(), unresolved = [], seen = new Set();
  const walk = (x) => {
    if (seen.has(x)) return;
    seen.add(x);
    const e = lib.get(x);
    for (const n of e.names) names.add(n);
    for (const g of e.generals) { const r = find(g, e.scope ?? x); if (r) walk(r); else unresolved.push(`${x} の ${g}`); }
  };
  if (!lib.has(q)) return null;
  walk(q);
  return { names, unresolved };
}

export function libraryFiles() {
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(sysml|kerml)$/.test(f.name)) out.push(p); } };
  walk(path.join(ROOT, 'vendor/release-2026-03/sysml.library'));
  return out.sort();
}

// ASCII の検査(GR15 v15.3 の指示書 3.1 節、設計書 6.2 節の D3 の印の行): 標準ライブラリの型(パッケージを除く名前空間。
// Domain Libraries/Quantities and Units のファイルのものを除く)ごとに、メンバーの名前と短い名前(上位の型から受け継ぐものを含む)が
// すべて空白(U+0020)を含まず ASCII の文字だけからなるかを調べる。→ { types, packages, excluded, bad: [{ qname, file, names }], unresolved, qu: [...] }
// unresolved は求まらない上位の型を持つ型の数(その型の受け継ぐ名前は、求まったものだけを見ている)。qu は除いた Quantities and Units
// の型のうち空白か ASCII 以外の文字を含む名前を持つもの(参考)
const QU = /[\\/]Domain Libraries[\\/]Quantities and Units[\\/]/;
const NON_ASCII = /[ \u0080-\uffff]/;
export function asciiCheck() {
  const lib = scanLibrary(libraryFiles());
  const out = { types: 0, packages: 0, excluded: 0, bad: [], unresolved: 0, unresolvedList: [], qu: [] };
  for (const [q, e] of lib) {
    if (e.isPackage) { out.packages++; continue; }
    const c = libraryClosure(lib, q);
    const names = [...c.names].filter(n => NON_ASCII.test(n)).sort();
    if (QU.test(e.file)) { out.excluded++; if (names.length) out.qu.push({ qname: q, file: path.relative(ROOT, e.file), names }); continue; }
    out.types++;
    if (c.unresolved.length) { out.unresolved++; out.unresolvedList.push(...c.unresolved); }
    if (names.length) out.bad.push({ qname: q, file: path.relative(ROOT, e.file), names });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = asciiCheck();
  console.log(`標準ライブラリの型 ${r.types}(Quantities and Units の型 ${r.excluded} を除く。パッケージ ${r.packages} は数えない)、空白か ASCII 以外の文字を含む名前を持つ型 ${r.bad.length}、求まらない上位の型を持つ型 ${r.unresolved}`);
  for (const x of r.bad) console.log(`  ${x.qname}(${x.file}): ${x.names.join(', ')}`);
  console.log(`参考: Quantities and Units の型で空白か ASCII 以外の文字を含む名前を持つもの ${r.qu.length}`);
  for (const x of r.qu) console.log(`  ${x.qname}: ${x.names.join(', ')}`);
  const j = process.argv.indexOf('--json');
  if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(r, null, 1) + '\n');
}
