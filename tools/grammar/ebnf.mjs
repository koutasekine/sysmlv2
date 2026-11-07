// 文法ファイル(本文から抜き出した .ebnf と、公式の .kebnf)を読む共通部品。
// 外部パッケージを使わない。
//
// 規則の形:
//   { name, type, hasEq, body, header, section, srcLines, fileLine }
//   name    規則名
//   type    「: 型」の型名(なければ null)
//   hasEq   見出しに '=' があるか(本文の誤りで欠けることがある)
//   body    規則の本体(改行を含む原文)
//   section 節番号(例 "8.2.3.1")
//   srcLines 抜き出し元テキストの行番号 [開始, 終了](.ebnf の注記から。なければ null)
//   fileLine 読んだファイルでの見出しの行番号

import fs from 'node:fs';

// 規則の見出し: 「名前 =」「名前 : 型 =」。本文の誤りで '=' が欠けた「名前 : 型」と、
// '=' の代わりに ':' を書いた「名前 : 型 :」「名前 :」も見出しとみなす。
//   sep は '=' か ':' か null('=' が欠けた形)。
export const HEADER_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*([A-Za-z_][A-Za-z0-9_]*)\s*)?(=|:)?\s*(.*)$/;

export function matchHeader(line) {
  const m = HEADER_RE.exec(line);
  if (!m) return null;
  const [, name, type, sep, rest] = m;
  if (sep === '=') return { name, type: type ?? null, sep, hasEq: true, rest };
  if (rest !== '') return null;
  if (type) return { name, type, sep: sep ?? null, hasEq: false, rest };
  // 「名前 :」は、':' の前に空白があるときだけ(英文の「Note:」などを除く)。
  if (sep === ':' && /\s:\s*$/.test(line)) return { name, type: null, sep, hasEq: false, rest };
  return null;
}

// .ebnf / .kebnf を読む。'//' で始まる行は注記として扱う。
//   "// 8.2.3.1 題名" または "// Clause 8.2.3.1 題名" で節を更新する。
//   "// @src L開始-L終了" で次の規則の抜き出し元の行番号を与える。
export function parseGrammarFile(path) {
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  const rules = [];
  let section = null;
  let src = null;
  let cur = null;
  const flush = () => {
    if (!cur) return;
    while (cur.bodyLines.length && cur.bodyLines.at(-1).trim() === '') cur.bodyLines.pop();
    cur.body = cur.bodyLines.join('\n');
    delete cur.bodyLines;
    rules.push(cur);
    cur = null;
  };
  lines.forEach((line, i) => {
    const sec = /^\/\/\s*(?:Clause\s+)?(\d+(?:\.\d+)+)\s/.exec(line);
    if (sec) { flush(); section = sec[1]; return; }
    const s = /^\/\/\s*@src\s+L(\d+)-L(\d+)/.exec(line);
    if (s) { flush(); src = [Number(s[1]), Number(s[2])]; return; }
    if (line.startsWith('//')) { flush(); return; }
    if (line.trim() === '') { if (cur) cur.bodyLines.push(''); return; }
    if (!/^\s/.test(line)) {
      const h = matchHeader(line);
      if (h) {
        flush();
        cur = { name: h.name, type: h.type, sep: h.sep, hasEq: h.hasEq, header: line, section,
                srcLines: src, fileLine: i + 1, bodyLines: h.rest ? [h.rest] : [] };
        src = null;
        return;
      }
    }
    if (cur) cur.bodyLines.push(line);
  });
  flush();
  return rules;
}

// 本体を字句に分ける。引用符の対応が取れていない終端記号は {kind:'badquote'} として返す。
export function tokenize(body) {
  const toks = [];
  let i = 0;
  const s = body;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      // 閉じ引用符は同じ行の中で探す。'\'' のようなエスケープは本文にないので扱わない。
      let j = i + 1;
      while (j < s.length && s[j] !== "'" && s[j] !== '\n') j++;
      if (s[j] === "'") { toks.push({ kind: 'term', text: s.slice(i, j + 1) }); i = j + 1; }
      else { toks.push({ kind: 'badquote', text: s.slice(i, j) }); i = j; }
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      toks.push({ kind: 'id', text: s.slice(i, j) });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '+=' || two === '?=') { toks.push({ kind: 'op', text: two }); i += 2; continue; }
    if ('()[]{}|*+?=:.,;-<>/'.includes(c)) { toks.push({ kind: 'op', text: c }); i++; continue; }
    toks.push({ kind: 'other', text: c });
    i++;
  }
  return toks;
}

// 規則の本体が字句の規則の説明文(英文)かどうか。字句の規則名(大文字)で、
// 引用符も演算子もほとんどない文になっているものを説明文とみなす。
export function isLexicalName(name) {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

// 比較用に本体を正規化する(空白の差をなくす)。
export function normalizeBody(body) {
  return tokenize(body).map(t => t.text).join(' ');
}
