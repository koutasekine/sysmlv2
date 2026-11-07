// パーサーの入り口(GR2 指示書 5.4 節)。外部パッケージと Node.js 固有の機能を使わない。
//
// parse(text, opts?) → { ok, tree, errors, ambiguities, resolutions, droppedElements }
//   opts.onProgress は任意。進み具合を知らせる(下の parse の説明。GR4 P3 の裁定 Q25)
//   ok        構文上正しければ true(字句と構文のエラーがない)
//   tree      構文木(src/parser/tree.js の要素)。ok が false なら null
//   errors    [{ kind: 'lexical' | 'syntax', line, col, offset, message, expected? }]
//             expected は構文のエラーの位置で期待されていた字句(終端記号の名前)の一覧
//   ambiguities     本文に定めのない曖昧さ(演算子の優先順位で解消できなかったもの)。
//                   解消の規則(earley.js の RESOLUTION_RULES)でも解消できなかったもの。
//                   [{ rule, line, col, offset, text, alternatives }]。最初の選択肢を仮に使っている
//   resolutions     解消の規則を当てた回数 { 規則: 回数 }
//   droppedElements 子にならない属性に入った要素(tree.js)。名前の参照を表す memberElement などで、構文木には入れない
// decodeUtf8(bytes) は、ファイルを UTF-8 として読む(正しくないバイト列は例外)。

import defaultTable from './grammar_table.js';
import { makeLexer } from './lexer.js';
import { compileGrammar, makeRecognizer, makeDeriver, expectedAt } from './earley.js';
import { makeTreeBuilder } from './tree.js';

let parser = null;

// opts.table を与えると、同梱の文法の表の代わりにそれを使う(照合の道具が、既知の差を確かめるために使う)
export function createParser(opts = {}) {
  const table = opts.table ?? defaultTable;
  const g = compileGrammar(table);
  const lex = makeLexer({ keywords: table.keywords, symbols: table.symbols });
  const recognize = makeRecognizer(g);
  const tb = makeTreeBuilder(g, table);
  const derive = makeDeriver(g, { signatureOf: tb.signature });

  const lineColOf = (text, offset) => {
    let line = 1, col = 1;
    for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < offset; i++) {
      const c = text.charCodeAt(i);
      if (c === 0x0d) { if (text.charCodeAt(i + 1) === 0x0a) i++; line++; col = 1; }
      else if (c === 0x0a) { line++; col = 1; }
      else col++;
    }
    return { line, col };
  };

  // opts.onProgress({ stage, done, total }) は任意(GR4 P3 の裁定 Q25)。渡さなければ、動きと結果は渡さないときと同じ。
  //   stage 'lex'       字句の分割が終わった。total は字句の数
  //   stage 'parse'     構文解析の途中。done は処理した字句の数、total は全体の字句の数(字句 256 個ごと)
  //   stage 'derive'    構文解析が終わり、導出を始める
  //   stage 'tree'      木を作る途中。done は作った要素の数(500 個ごと。作り終えたときにも 1 回、total に総数を入れて知らせる)
  function parse(text, opts) {
    const onProgress = opts?.onProgress;
    const lx = lex(text);
    if (!lx.ok) return { ok: false, tree: null, errors: [{ kind: 'lexical', ...lx.error }], ambiguities: [], resolutions: {}, droppedElements: [] };
    const toks = lx.tokens;
    if (onProgress) onProgress({ stage: 'lex', done: toks.length, total: toks.length });
    const rec = onProgress ? recognize(toks, (i, n) => onProgress({ stage: 'parse', done: i, total: n })) : recognize(toks);
    if (!rec.accepted) {
      const i = rec.failAt;
      const expected = expectedAt(g, rec.sets, i);
      let at;
      if (i < toks.length) at = { line: toks[i].line, col: toks[i].col, offset: toks[i].start, message: `字句「${toks[i].text}」を読めない` };
      else { const off = text.length; at = { ...lineColOf(text, off), offset: off, message: '入力が途中で終わっている' }; }
      return { ok: false, tree: null, errors: [{ kind: 'syntax', ...at, expected }], ambiguities: [], resolutions: {}, droppedElements: [] };
    }
    if (onProgress) onProgress({ stage: 'derive', done: toks.length, total: toks.length });
    const { root, ambiguities, resolutions } = derive(rec, toks);
    if (!root) {
      // 認識できたのに、優先順位に合う導出がない
      return { ok: false, tree: null, errors: [{ kind: 'syntax', line: 1, col: 1, offset: 0, message: '演算子の優先順位に合う解析がない' }], ambiguities: [], resolutions: {}, droppedElements: [] };
    }
    let made = 0;
    const { tree, droppedElements } = onProgress ? tb.build(root, toks, () => { if (++made % 500 === 0) onProgress({ stage: 'tree', done: made, total: null }); }) : tb.build(root, toks);
    if (onProgress) onProgress({ stage: 'tree', done: made, total: made });
    const amb = ambiguities.map(a => {
      const t = toks[a.i] ?? toks[toks.length - 1];
      return {
        rule: a.sym, line: t?.line ?? 1, col: t?.col ?? 1, offset: t?.start ?? 0,
        text: toks.slice(a.i, a.j).map(x => x.text).join(' '),
        alternatives: a.alts.map(x => x.prod ? describe(x) : 'rep'),
        signatures: a.sigs,
      };
    });
    const res = {};
    for (const [k, v] of Object.entries(resolutions)) res[k] = v.length;
    return { ok: true, tree, errors: [], ambiguities: amb, resolutions: res, droppedElements };
  }
  const describe = (d) => `${g.symName[d.prod.lhs]} → ${d.prod.rhs.map(s => g.symName[s]).join(' ') || 'ε'}`;

  return { parse, grammar: g };
}

export function parse(text, opts) {
  parser ??= createParser();
  return parser.parse(text, opts);
}

export function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
