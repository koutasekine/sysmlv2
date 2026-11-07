// 解析方式の偵察用の字句解析器(GR1 指示書 6.1 節。候補 A・B で共用)。
//
// 字句の規則は KerML 1.0 の 8.2.2 節、予約語と特殊な終端記号は SysML 2.0 の 8.2.2.1.2 節による(設計書 2.4 節)。
// 偵察用の試作であり、字句の細部(設計書 12 章の残作業 8)は次のように仮に決めている:
//   - 空白: スペース・タブ・フォームフィード・CR・LF(本文の WHITE_SPACE)
//   - 行末: CR LF・LF・CR のどれも 1 つの行末とみなす
//   - 引用符で囲む名前・文字列の中: 制御文字(U+0000〜U+001F、U+007F)・\・引用符以外は使える。
//     エスケープ列は本文の表 4 の 7 種(\' \" \b \f \t \n \\)だけ
//   - 先頭の BOM(U+FEFF)は読み飛ばす
// 字句: { kind, text, offset, line, col }
//   kind は 'NAME'(予約語でない英字の語と引用符で囲む名前)、'KEYWORD'(予約語)、'SYMBOL'、
//   'DECIMAL_VALUE'、'EXPONENTIAL_VALUE'、'STRING_VALUE'、'REGULAR_COMMENT'。
//   注(// と //* */)は読み飛ばす。
// 字句の誤りは LexError を投げる。

export class LexError extends Error {
  constructor(msg, line, col) { super(`${line}:${col}: ${msg}`); this.line = line; this.col = col; }
}

export function makeLexer({ keywords, symbols }) {
  const kw = new Set(keywords);
  const syms = [...new Set(symbols)].sort((a, b) => b.length - a.length);   // 最長一致
  const ESC = new Set(["'", '"', 'b', 'f', 't', 'n', '\\']);
  const isCtrl = (c) => { const k = c.codePointAt(0); return k < 0x20 || k === 0x7f; };

  return function lex(src) {
    const toks = [];
    let i = 0, line = 1, lineStart = 0;
    if (src.charCodeAt(0) === 0xfeff) i = 1;
    const newline = (at) => { line++; lineStart = at; };
    const err = (msg, at = i) => { throw new LexError(msg, line, at - lineStart + 1); };
    while (i < src.length) {
      const c = src[i];
      // 空白
      if (c === ' ' || c === '\t' || c === '\f') { i++; continue; }
      if (c === '\r') { i++; if (src[i] === '\n') i++; newline(i); continue; }
      if (c === '\n') { i++; newline(i); continue; }
      const start = i, sl = line, sc = i - lineStart + 1;
      const push = (kind) => toks.push({ kind, text: src.slice(start, i), offset: start, line: sl, col: sc });
      // 注と注釈
      if (src.startsWith('//*', i) || src.startsWith('/*', i)) {
        const note = src.startsWith('//*', i);
        const end = src.indexOf('*/', i + (note ? 3 : 2));
        if (end < 0) err('注釈が閉じていない');
        for (let k = i; k < end; k++) {
          if (src[k] === '\r') { if (src[k + 1] === '\n') k++; newline(k + 1); }
          else if (src[k] === '\n') newline(k + 1);
        }
        i = end + 2;
        if (!note) push('REGULAR_COMMENT');
        continue;
      }
      if (src.startsWith('//', i)) {
        while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
        continue;
      }
      // 名前と予約語
      if (/[A-Za-z_]/.test(c)) {
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
        push(kw.has(src.slice(start, i)) ? 'KEYWORD' : 'NAME');
        continue;
      }
      // 引用符で囲む名前と文字列
      if (c === "'" || c === '"') {
        i++;
        while (i < src.length && src[i] !== c) {
          if (src[i] === '\\') {
            if (!ESC.has(src[i + 1])) err(`使えないエスケープ列 \\${src[i + 1] ?? ''}`);
            i += 2;
          } else if (isCtrl(src[i])) err(`引用符の中に制御文字 U+${src.codePointAt(i).toString(16).padStart(4, '0')}`);
          else i++;
        }
        if (i >= src.length) err('引用符が閉じていない', start);
        i++;
        push(c === "'" ? 'NAME' : 'STRING_VALUE');
        continue;
      }
      // 数値
      if (/[0-9]/.test(c)) {
        while (i < src.length && /[0-9]/.test(src[i])) i++;
        const m = /^[eE][+-]?[0-9]+/.exec(src.slice(i, i + 64));
        if (m) { i += m[0].length; push('EXPONENTIAL_VALUE'); }
        else push('DECIMAL_VALUE');
        continue;
      }
      // 記号
      const s = syms.find(x => src.startsWith(x, i));
      if (s) { i += s.length; push('SYMBOL'); continue; }
      err(`使えない文字 U+${src.codePointAt(i).toString(16).padStart(4, '0')}`);
    }
    return toks;
  };
}
