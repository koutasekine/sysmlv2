// 字句解析(設計書 2.4 節、GR2 指示書 5.1 節)。
//
// 字句構造は KerML 1.0 の 8.2.2 節、予約語は SysML 2.0 の 8.2.2.1.2 節(文法の表の keywords)による。
//   - 空白: スペース・タブ・フォームフィード・行末。行末は LF・CR LF・CR のどれも 1 つの行末とし、混在してもよい
//   - 1 行の注(//)はどの行末でも終わる。//* … */ は複数行の注、/* … */ は字句 REGULAR_COMMENT
//   - 引用符なしの名前は ASCII の英字・数字・_ だけ
//   - 引用符で囲む名前と文字列: Unicode の Cc(65 文字)・\・引用符以外のすべての文字。エスケープ列は表 4 の 7 種
//   - 空の名前 '' は受理する
//   - 先頭の BOM 1 文字は取り除く(位置は BOM を取り除く前の文字列の位置で数える)
// 字句: { kind, text, start, end, line, col }
//   kind は NAME(引用符なしの名前と引用符で囲む名前)・KEYWORD(予約語)・SYMBOL・DECIMAL_VALUE・
//   EXPONENTIAL_VALUE・STRING_VALUE・REGULAR_COMMENT。start と end は文字列の位置(UTF-16 の単位)、
//   line と col は 1 始まり(col は UTF-16 の単位で数える)。
// 字句の誤りは { ok: false, error: { line, col, offset, message } } を返す。

const ESCAPES = { "'": "'", '"': '"', b: '\b', f: '\f', t: '\t', n: '\n', '\\': '\\' };
const isCc = (k) => k <= 0x1f || (k >= 0x7f && k <= 0x9f);
const isAlpha = (k) => (k >= 0x41 && k <= 0x5a) || (k >= 0x61 && k <= 0x7a) || k === 0x5f;
const isDigit = (k) => k >= 0x30 && k <= 0x39;

export function makeLexer({ keywords, symbols }) {
  const kw = new Set(keywords);
  // 最長一致のため、長い記号から試す
  const syms = [...new Set(symbols)].sort((a, b) => b.length - a.length);
  const symFirst = new Map();
  for (const s of syms) {
    if (!symFirst.has(s[0])) symFirst.set(s[0], []);
    symFirst.get(s[0]).push(s);
  }

  return function lex(src) {
    const toks = [];
    let i = 0, line = 1, lineStart = 0;
    if (src.charCodeAt(0) === 0xfeff) { i = 1; lineStart = 1; }
    const n = src.length;
    const newline = (at) => { line++; lineStart = at; };
    const fail = (message, at) => ({ ok: false, tokens: toks, error: { line, col: at - lineStart + 1, offset: at, message } });

    while (i < n) {
      const k = src.charCodeAt(i);
      // 空白と行末
      if (k === 0x20 || k === 0x09 || k === 0x0c) { i++; continue; }
      if (k === 0x0d) { i++; if (src.charCodeAt(i) === 0x0a) i++; newline(i); continue; }
      if (k === 0x0a) { i++; newline(i); continue; }
      const start = i, sl = line, sc = i - lineStart + 1;
      const push = (kind) => toks.push({ kind, text: src.slice(start, i), start, end: i, line: sl, col: sc });
      // 注と注釈
      if (k === 0x2f && src.charCodeAt(i + 1) === 0x2a || k === 0x2f && src.startsWith('//*', i)) {
        const note = src.charCodeAt(i + 1) === 0x2f;
        const end = src.indexOf('*/', i + (note ? 3 : 2));
        if (end < 0) return fail(note ? '複数行の注が閉じていない' : '注釈が閉じていない', start);
        for (let p = i; p < end; p++) {
          const c = src.charCodeAt(p);
          if (c === 0x0d) { if (src.charCodeAt(p + 1) === 0x0a) p++; newline(p + 1); }
          else if (c === 0x0a) newline(p + 1);
        }
        i = end + 2;
        if (!note) push('REGULAR_COMMENT');
        continue;
      }
      if (k === 0x2f && src.charCodeAt(i + 1) === 0x2f) {
        i += 2;
        while (i < n) { const c = src.charCodeAt(i); if (c === 0x0a || c === 0x0d) break; i++; }
        continue;
      }
      // 名前と予約語
      if (isAlpha(k)) {
        i++;
        while (i < n) { const c = src.charCodeAt(i); if (!isAlpha(c) && !isDigit(c)) break; i++; }
        push(kw.has(src.slice(start, i)) ? 'KEYWORD' : 'NAME');
        continue;
      }
      // 引用符で囲む名前と文字列
      if (k === 0x27 || k === 0x22) {
        i++;
        for (;;) {
          if (i >= n) return fail(k === 0x27 ? '引用符で囲む名前が閉じていない' : '文字列が閉じていない', start);
          const c = src.charCodeAt(i);
          if (c === k) break;
          if (c === 0x5c) {
            const e = src[i + 1];
            if (e === undefined || !(e in ESCAPES)) return fail(`使えないエスケープ列 \\${e ?? ''}`, i);
            i += 2;
            continue;
          }
          if (isCc(c)) return fail(`引用符の中に使えない制御文字 U+${c.toString(16).toUpperCase().padStart(4, '0')}`, i);
          i++;
        }
        i++;
        push(k === 0x27 ? 'NAME' : 'STRING_VALUE');
        continue;
      }
      // 数値
      if (isDigit(k)) {
        i++;
        while (i < n && isDigit(src.charCodeAt(i))) i++;
        const e = src.charCodeAt(i);
        if (e === 0x65 || e === 0x45) {
          let p = i + 1;
          const s = src.charCodeAt(p);
          if (s === 0x2b || s === 0x2d) p++;
          if (isDigit(src.charCodeAt(p))) {
            i = p + 1;
            while (i < n && isDigit(src.charCodeAt(i))) i++;
            push('EXPONENTIAL_VALUE');
            continue;
          }
        }
        push('DECIMAL_VALUE');
        continue;
      }
      // 記号
      const cands = symFirst.get(src[i]);
      const s = cands && cands.find(x => src.startsWith(x, i));
      if (s) { i += s.length; push('SYMBOL'); continue; }
      const cp = src.codePointAt(i);
      return fail(`使えない文字 U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, i);
    }
    return { ok: true, tokens: toks, error: null };
  };
}

// 引用符で囲む名前・文字列の字句から、表している文字列を取り出す(KerML 1.0 の 8.2.2.3 節の注 1・注 2)。
// \n は LF とする。引用符なしの名前はそのまま返す。
export function unquote(text) {
  const q = text[0];
  if (q !== "'" && q !== '"') return text;
  let out = '';
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c === '\\') { out += ESCAPES[text[i + 1]]; i++; }
    else out += c;
  }
  return out;
}
