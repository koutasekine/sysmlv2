// 候補 A の試作: 合成した文法(grammar/sysml20_patched.ebnf)を表として持ち、Earley 法で解釈する(GR1 指示書 6.1 節)。
//
// 使い方:
//   node tools/recon/earley.mjs [--grammar <文法.ebnf>] [--out <結果.json>] <.sysml ファイル または @一覧>...
//   --grammar を省くと grammar/sysml20_patched.ebnf を使う。
//
// 受理・拒否だけを判定する(構文木は作らない)。
//   - 文法の EBNF を BNF に展開する。繰り返しは左再帰の補助規則にする(R → ε | R x)。
//   - 予測のときに先読みの字句で生成規則を絞る(FIRST 集合)。空になりうる規則は Aycock-Horspool の方法で扱う。
//   - 左再帰と曖昧さは Earley 法がそのまま扱う。演算子の優先順位は判定に関係しない(受理・拒否だけを見るため)。
//   - 予約語は SysML の RESERVED_KEYWORD。文法に引用符で書かれた語のうち予約語でないもの(KerML の 'typed' など)は、
//     同じ綴りの名前の字句にも一致させる(文脈によるキーワード)。
//   - 字句の規則のうち NAME・DECIMAL_VALUE・EXPONENTIAL_VALUE・STRING_VALUE・REGULAR_COMMENT は字句解析器が作る字句、
//     DEFINED_BY などの特殊な終端記号は構文の規則として展開する。

import fs from 'node:fs';
import path from 'node:path';
import { parseGrammarFile, tokenize } from '../grammar/ebnf.mjs';
import { parseBody } from '../grammar/leftrec.mjs';
import { makeLexer, LexError } from './lexer.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TOKEN_CLASSES = new Set(['NAME', 'DECIMAL_VALUE', 'EXPONENTIAL_VALUE', 'STRING_VALUE', 'REGULAR_COMMENT']);
const NOT_SYNTAX = new Set(['RESERVED_KEYWORD', 'SYMBOL', 'WHITE_SPACE', 'SINGLE_LINE_NOTE', 'MULTILINE_NOTE']);

export function buildParser(grammarPath = path.join(ROOT, 'grammar/sysml20_patched.ebnf'), start = 'RootNamespace') {
  const rules = parseGrammarFile(grammarPath);
  const byName = new Map(rules.map(r => [r.name, r]));
  const keywords = tokenize(byName.get('RESERVED_KEYWORD').body).filter(t => t.kind === 'term').map(t => t.text.slice(1, -1));
  const symbolList = tokenize(byName.get('SYMBOL').body).filter(t => t.kind === 'term').map(t => t.text.slice(1, -1));

  // ---- 記号の番号 ----
  const symId = new Map(); const symName = []; const isTerm = [];
  const sym = (key, term) => { if (!symId.has(key)) { symId.set(key, symName.length); symName.push(key); isTerm.push(term); } return symId.get(key); };
  const prods = [];        // { lhs, rhs: number[] }
  let aux = 0;
  const syntaxRule = (n) => byName.has(n) && !TOKEN_CLASSES.has(n) && !NOT_SYNTAX.has(n);
  const grammarWords = new Set(), grammarSymbols = new Set();

  const toSym = (x) => {
    switch (x.t) {
      case 'term': {
        const s = x.text.slice(1, -1);
        if (/^[A-Za-z_]\w*$/.test(s)) grammarWords.add(s); else grammarSymbols.add(s);
        return sym(`'${s}'`, true);
      }
      case 'ref':
        if (TOKEN_CLASSES.has(x.name)) return sym(x.name, true);
        if (!syntaxRule(x.name)) throw new Error(`文法にない規則 ${x.name}`);
        return sym(x.name, false);
      default: {
        const n = sym(`#${aux++}`, false);
        addProds(n, x);
        return n;
      }
    }
  };
  // x を lhs の生成規則にする
  const seqOf = (x) => x.t === 'seq' ? x.xs : x.t === 'empty' ? [] : [x];
  function addProds(lhs, x) {
    if (x.t === 'alt') { for (const y of x.xs) addProds(lhs, y); return; }
    if (x.t === 'rep') {
      const item = toSym(x.x);
      if (x.max === 1) { prods.push({ lhs, rhs: [] }); prods.push({ lhs, rhs: [item] }); }
      else if (x.min === 0) { prods.push({ lhs, rhs: [] }); prods.push({ lhs, rhs: [lhs, item] }); }
      else { prods.push({ lhs, rhs: [item] }); prods.push({ lhs, rhs: [lhs, item] }); }
      return;
    }
    prods.push({ lhs, rhs: seqOf(x).map(toSym) });
  }
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const n = queue.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    const lhs = sym(n, false);
    addProds(lhs, parseBody(byName.get(n).body, n));
    for (let k = 0; k < symName.length; k++) if (!isTerm[k] && !symName[k].startsWith('#') && !seen.has(symName[k])) queue.push(symName[k]);
  }
  const S = sym(start, false);

  // ---- nullable と FIRST ----
  const N = symName.length;
  const nullable = new Uint8Array(N);
  for (let ch = true; ch;) {
    ch = false;
    for (const p of prods) if (!nullable[p.lhs] && p.rhs.every(s => !isTerm[s] && nullable[s])) { nullable[p.lhs] = 1; ch = true; }
  }
  const first = Array.from({ length: N }, (_, s) => isTerm[s] ? new Set([s]) : new Set());
  for (let ch = true; ch;) {
    ch = false;
    for (const p of prods) {
      const f = first[p.lhs];
      for (const s of p.rhs) {
        for (const t of first[s]) if (!f.has(t)) { f.add(t); ch = true; }
        if (isTerm[s] || !nullable[s]) break;
      }
    }
  }
  const prodsOf = Array.from({ length: N }, () => []);
  prods.forEach((p, k) => {
    const f = new Set(); let nul = true;
    for (const s of p.rhs) { for (const t of first[s]) f.add(t); if (isTerm[s] || !nullable[s]) { nul = false; break; } }
    p.first = f; p.nullable = nul; p.id = k;
    prodsOf[p.lhs].push(p);
  });

  const lex = makeLexer({ keywords, symbols: [...symbolList, ...grammarSymbols] });
  const kwSet = new Set(keywords);

  // 字句が一致する終端記号の番号
  const termsOf = (tok) => {
    const out = [];
    if (tok.kind === 'NAME') {
      out.push(symId.get('NAME'));
      if (!tok.text.startsWith("'") && symId.has(`'${tok.text}'`)) out.push(symId.get(`'${tok.text}'`));
    } else if (tok.kind === 'KEYWORD' || tok.kind === 'SYMBOL') {
      if (symId.has(`'${tok.text}'`)) out.push(symId.get(`'${tok.text}'`));
    } else if (symId.has(tok.kind)) out.push(symId.get(tok.kind));
    return out.filter(x => x !== undefined);
  };

  // ---- 認識 ----
  function recognize(src) {
    let toks;
    try { toks = lex(src); }
    catch (e) { if (e instanceof LexError) return { accept: false, error: { line: e.line, col: e.col, message: `字句: ${e.message}` }, tokens: null }; throw e; }
    const n = toks.length;
    const tokTerms = toks.map(t => new Set(termsOf(t)));
    // 集合 i の項目: [prod, dot, origin]。重複は文字列のキーで除く。
    const sets = [];
    const add = (i, p, dot, origin) => {
      const set = sets[i];
      const key = (p.id * 64 + dot) * 1048576 + origin;
      if (set.keys.has(key)) return;
      set.keys.add(key);
      set.items.push([p, dot, origin]);
    };
    const newSet = () => ({ items: [], keys: new Set(), waiting: new Map() });
    const okFirst = (p, i) => p.nullable || (i < n && [...tokTerms[i]].some(t => p.first.has(t)));
    sets.push(newSet());
    for (const p of prodsOf[S]) if (okFirst(p, 0)) add(0, p, 0, 0);
    for (let i = 0; i <= n; i++) {
      const set = sets[i];
      if (i < n) sets.push(newSet());
      if (!set.items.length) {
        const t = toks[i - 1] ?? toks[0];
        return { accept: false, error: { line: t?.line ?? 1, col: t?.col ?? 1, message: `構文: 「${t?.text ?? ''}」で続けられない` }, tokens: n };
      }
      const predicted = new Set();
      for (let k = 0; k < set.items.length; k++) {
        const [p, dot, origin] = set.items[k];
        if (dot < p.rhs.length) {
          const s = p.rhs[dot];
          if (isTerm[s]) {
            if (i < n && tokTerms[i].has(s)) add(i + 1, p, dot + 1, origin);
          } else {
            // 待っている項目を記録(完了のときに進める)
            if (!set.waiting.has(s)) set.waiting.set(s, []);
            set.waiting.get(s).push([p, dot, origin]);
            if (!predicted.has(s)) {
              predicted.add(s);
              for (const q of prodsOf[s]) if (okFirst(q, i)) add(i, q, 0, i);
            }
            if (nullable[s]) add(i, p, dot + 1, origin);
            // すでに i で完了している s があれば進める(空の規則の完了が先に来た場合)
            if (set.completed?.has(s)) add(i, p, dot + 1, origin);
          }
        } else {
          // 完了
          const lhs = p.lhs;
          if (origin === i) { (set.completed ??= new Set()).add(lhs); }
          const w = sets[origin].waiting.get(lhs);
          if (w) for (let m = 0; m < w.length; m++) { const [q, d, o] = w[m]; add(i, q, d + 1, o); }
        }
      }
      if (i < n && sets[i + 1].items.length === 0) {
        const t = toks[i];
        return { accept: false, error: { line: t.line, col: t.col, message: `構文: 字句「${t.text}」を読めない` }, tokens: n };
      }
    }
    const last = sets[n];
    const ok = last.items.some(([p, dot, origin]) => p.lhs === S && dot === p.rhs.length && origin === 0);
    if (!ok) { const t = toks[n - 1]; return { accept: false, error: { line: t?.line ?? 1, col: t?.col ?? 1, message: '構文: 入力が途中で終わっている' }, tokens: n }; }
    return { accept: true, error: null, tokens: n };
  }

  return { recognize, stats: { symbols: N, productions: prods.length, rules: seen.size, keywords: kwSet.size,
    contextualWords: [...grammarWords].filter(w => !kwSet.has(w)).sort() } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let out = null, grammar; const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--grammar') grammar = args[++i];
    else if (args[i].startsWith('@')) files.push(...fs.readFileSync(args[i].slice(1), 'utf8').split('\n').filter(Boolean));
    else files.push(args[i]);
  }
  const t0 = performance.now();
  const parser = buildParser(grammar);
  const buildMs = performance.now() - t0;
  const results = [];
  let parseMs = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const s = performance.now();
    const r = parser.recognize(src);
    const ms = performance.now() - s;
    parseMs += ms;
    results.push({ file: f, accept: r.accept, error: r.error, tokens: r.tokens, ms: Math.round(ms * 10) / 10 });
  }
  const summary = { files: files.length, accepted: results.filter(r => r.accept).length, rejected: results.filter(r => !r.accept).length,
    buildMs: Math.round(buildMs), parseMsTotal: Math.round(parseMs), stats: parser.stats, results };
  if (out) fs.writeFileSync(out, JSON.stringify(summary, null, 1));
  console.log(`files=${summary.files} accepted=${summary.accepted} rejected=${summary.rejected} buildMs=${summary.buildMs} parseMsTotal=${summary.parseMsTotal}`);
}
