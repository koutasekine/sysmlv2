// テキスト欄の色付け(GR4 指示書 6.1 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// makeHighlighter({ keywords, symbols }) → highlight(text) → HTML の文字列(<span class="kw"> など)
//   字句は src/parser/lexer.js で分ける(予約語と記号の一覧は、Worker が文法の表から渡す)。
//   字句の間の文字(空白と 1 行・複数行の注 //…)は、空白でない文字があれば注(cm)として色を付ける。
//   字句の誤りがあれば、その位置より前だけを色付けし、後ろはそのまま書く。
// 種類: kw 予約語、st 文字列、nu 数、cm 注(/* */ と //)、qn 単一引用符で囲む名前
//
// makeWindowHighlighter({ keywords, symbols }) → render(text, view) → HTML の文字列
//   テキスト欄に見えている行(と前後 MARGIN 行)だけを色付けする(大きなテキストで画面を止めないため。
//   GR4 の完了報告の確認の後の指示 1、設計書 2.6 節)。view = { scrollTop, height, lineHeight, padding }。
//   見えない行の分は、上下に同じ高さの空きを入れる。横に長い行のために、最も長い行の幅の空きも入れる。
//   複数行にまたがる字句は /* … */ と //* … */ の注だけ(名前と文字列は改行を含めない。設計書 2.4 節)なので、
//   範囲の先頭が注の途中なら、その注の始まりまで範囲を広げてから色付けする。
//   行の始まりの位置と最も長い行の幅は、テキストが変わったときだけ数え直す。

import { makeLexer } from '../parser/lexer.js';

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function makeHighlighter({ keywords, symbols }) {
  const lex = makeLexer({ keywords, symbols });
  const span = (cls, s) => (cls ? `<span class="${cls}">${esc(s)}</span>` : esc(s));
  return function highlight(text) {
    let r = lex(text);
    let tail = '';
    if (!r.ok) {
      const at = r.error?.offset ?? 0;
      tail = text.slice(at);
      r = lex(text.slice(0, at));
      if (!r.ok) return esc(text);
    }
    let out = '';
    let pos = 0;
    const flushGap = (end) => {
      const s = text.slice(pos, end);
      // 字句の間の文字は空白と注(//… と //* … */)だけ
      out += /\S/.test(s) ? s.split(/(\s+)/).map((p) => (/\S/.test(p) ? span('cm', p) : esc(p))).join('') : esc(s);
    };
    for (const t of r.tokens) {
      flushGap(t.start);
      const cls = t.kind === 'KEYWORD' ? 'kw' : t.kind === 'STRING_VALUE' ? 'st' : t.kind === 'DECIMAL_VALUE' || t.kind === 'EXPONENTIAL_VALUE' ? 'nu'
        : t.kind === 'REGULAR_COMMENT' ? 'cm' : t.kind === 'NAME' && t.text.startsWith("'") ? 'qn' : null;
      out += span(cls, text.slice(t.start, t.end));
      pos = t.end;
    }
    const end = text.length - tail.length;
    flushGap(end);
    out += esc(tail);
    // 末尾が改行のとき、pre の高さがテキスト欄とそろうよう空白を足す
    return out + (/\r?\n$|\r$/.test(text) ? ' ' : '');
  };
}

export const MARGIN = 40; // 見えている行の前後に色付けする行の数

// テキストの行の始まりの位置(LF で分ける。テキスト欄の値は LF にそろっている)と、最も長い行の幅(文字の数。
// タブは 4、全角の文字は 2 と数える)
export function lineIndex(text) {
  const starts = [0];
  let maxCols = 0, cols = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) { starts.push(i + 1); if (cols > maxCols) maxCols = cols; cols = 0; }
    else if (c === 9) cols += 4 - (cols % 4);
    else cols += c >= 0x1100 && !(c >= 0xff61 && c <= 0xff9f) ? 2 : 1;
  }
  if (cols > maxCols) maxCols = cols;
  return { starts, maxCols };
}

export function makeWindowHighlighter(opts) {
  const highlight = makeHighlighter(opts);
  let cacheText = null, cacheIdx = null;
  return function render(text, view) {
    if (text !== cacheText) { cacheText = text; cacheIdx = lineIndex(text); }
    const { starts, maxCols } = cacheIdx;
    const nLines = starts.length;
    const lh = view.lineHeight, pad = view.padding ?? 0;
    const first = Math.max(0, Math.floor((view.scrollTop - pad) / lh) - MARGIN);
    const last = Math.min(nLines - 1, Math.ceil((view.scrollTop - pad + view.height) / lh) + MARGIN);
    // 範囲の先頭が /* … */ の注の途中なら、注の始まりの行まで広げる
    let from = first;
    const s0 = starts[first];
    const open = text.lastIndexOf('/*', s0 - 1);
    if (open >= 0 && text.lastIndexOf('*/', s0 - 1) < open) {
      let lo = 0, hi = first;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= open) lo = mid; else hi = mid - 1; }
      from = lo;
    }
    const startPos = starts[from];
    const endPos = last + 1 < nLines ? starts[last + 1] : text.length;
    const body = highlight(text.slice(startPos, endPos).replace(/\n$/, ''));
    const above = from * lh, below = Math.max(0, (nLines - 1 - last) * lh);
    // 上の空き、色付けした行、最も長い行の幅の空き(横のスクロールをテキスト欄とそろえる)、下の空き(改行 1 行分 + 残り)
    return `<span style="display:block;height:${above}px"></span>${body}<span style="display:inline-block;width:${maxCols}ch"></span>`
      + (below > 0 ? `\n<span style="display:block;height:${Math.max(0, below - lh)}px"></span>` : '');
  };
}
