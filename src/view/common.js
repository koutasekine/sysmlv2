// 描画の共通の処理: 構文木と名前解決の結果を引く関数、宣言の文字の組み立て、XML のエスケープ。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。

import grammar from '../parser/grammar_table.js';
import { makeLexer, unquote } from '../parser/lexer.js';
import { walkTree } from '../parser/tree.js';

let lexer = null;

// XML 1.0 で使えない文字(U+0000〜U+0008、U+000B、U+000C、U+000E〜U+001F、U+FFFE、U+FFFF、対になっていないサロゲート)は U+FFFD に
// 置き換える(設計書 10 章 v18.0 の安全性。GR18 の S1。保存する SVG がいつも XML として読めるように)
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export function escapeXml(s) {
  return String(s).replace(NOT_XML, '\uFFFD').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 入れ子の深さに比例して呼び出しを深くしないための回し方(GR27 の R。設計書 2.6 節)。再帰の関数をジェネレーターにし、子の呼び出しを
// `yield 子のジェネレーター` と書く(子の戻り値は yield の値で受け取る)。runNested は、それを 1 つのループと配列のスタックで回す。
// 子を呼ぶ順・戻り値・副作用の順は、ふつうの再帰と同じ
export function runNested(g0) {
  const st = [g0];
  let v;
  while (st.length) {
    const r = st[st.length - 1].next(v);
    if (r.done) { st.pop(); v = r.value; } else { st.push(r.value); v = undefined; }
  }
  return v;
}

// 構文木(tree)・名前解決の結果(model)・原文(text)を引く道具をまとめる
export function makeContext(tree, model, text) {
  const parent = new Map();
  const order = new Map();
  let n = 0;
  walkTree(tree, (e, p) => {
    parent.set(e, p);
    order.set(e, n++);
  }); // 明示のスタックでたどる(GR18 の B1)

  const recs = new Map();
  for (const r of model.refs) {
    if (!recs.has(r.node)) recs.set(r.node, {});
    const m = recs.get(r.node);
    (m[r.prop] ??= []).push(r);
  }
  const ref = (node, prop, index = 0) => recs.get(node)?.[prop]?.[index] ?? null;
  const refsOf = (node, prop) => recs.get(node)?.[prop] ?? [];
  const user = (e) => !!e && !e.builtin && !e.virtual;
  const target = (node, prop, index = 0) => { const r = ref(node, prop, index); return r && r.status === 'resolved' ? r.target : null; };
  const is = (e, k) => user(e) && model.conforms(e.kind, k);
  const isAny = (e, ks) => ks.some((k) => is(e, k));

  // 名前空間が所有するメンバー(Membership の関係と、その要素)。import は含めない
  const members = (ns) => {
    const out = [];
    if (!user(ns)) return out;
    for (const rel of ns.owned) {
      if (!model.conforms(rel.kind, 'Membership')) continue;
      const el = rel.related[0];
      if (el) out.push({ rel, el });
    }
    return out;
  };
  // 要素を所有する関係と、その関係を所有する名前空間
  const owningRel = (e) => parent.get(e) ?? null;
  const ownerOf = (e) => { const r = parent.get(e); return r ? parent.get(r) ?? null : null; };

  const names = (e) => {
    if (!e) return { name: null, shortName: null };
    if (e.builtin) return { name: e.name ?? null, shortName: e.shortName ?? null };
    return model.namesOf(e);
  };
  const nameOf = (e) => names(e).name ?? names(e).shortName ?? null;

  // 参照の表示(修飾名の各区切りの単一引用符を外す)
  const refText = (r) => {
    if (!r) return '';
    if (r.segments?.length) return (r.global ? '$::' : '') + r.segments.map((s) => s.name).join('::');
    return r.text;
  };

  // 特徴の型の表示(FeatureTyping・ConjugatedPortTyping。最初の 1 つ)
  const typeText = (e) => {
    for (const c of e.owned) {
      if (model.conforms(c.kind, 'ConjugatedPortTyping')) return '~' + refText(ref(c, 'originalPortDefinition'));
      if (model.conforms(c.kind, 'FeatureTyping')) return refText(ref(c, 'type'));
    }
    return null;
  };
  const typesOf = (e) => {
    const out = [];
    for (const c of e.owned) {
      if (model.conforms(c.kind, 'ConjugatedPortTyping')) { const t = target(c, 'originalPortDefinition'); if (t) out.push(t); }
      else if (model.conforms(c.kind, 'FeatureTyping')) { const t = target(c, 'type'); if (t) out.push(t); }
    }
    return out;
  };

  // 特徴の連鎖・参照の区切り: [{ el, name }]。el は解決した要素(解決できなければ null)
  const chainOf = (rel, prop) => {
    if (rel.refs[prop] !== undefined) {
      const r = ref(rel, prop);
      const nm = r?.segments?.length ? r.segments[r.segments.length - 1].name : (r?.text ?? '');
      return [{ el: r && r.status === 'resolved' ? r.target : null, name: nm, status: r?.status ?? null }];
    }
    const f = rel.related.find((x) => model.conforms(x.kind, 'Feature'));
    if (!f) return [];
    const out = [];
    for (const c of f.owned) {
      if (!model.conforms(c.kind, 'FeatureChaining')) continue;
      const r = ref(c, 'chainingFeature');
      const nm = r?.segments?.length ? r.segments[r.segments.length - 1].name : (r?.text ?? '');
      out.push({ el: r && r.status === 'resolved' ? r.target : null, name: nm, status: r?.status ?? null });
    }
    return out;
  };

  // ---- 宣言の字句
  lexer ??= makeLexer({ keywords: grammar.keywords, symbols: grammar.symbols });
  const lx = lexer(text);
  const toks = lx.ok ? lx.tokens.filter((t) => t.kind !== 'REGULAR_COMMENT' && t.kind !== 'SINGLE_LINE_NOTE' && t.kind !== 'MULTI_LINE_NOTE') : [];
  const firstTokAt = (pos) => { let lo = 0, hi = toks.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[m].start < pos) lo = m + 1; else hi = m; } return lo; };
  // 要素の宣言の字句(本体 { … } と終わりの ; を除く)
  const declTokens = (e) => {
    const out = [];
    let depth = 0;
    for (let i = firstTokAt(e.start); i < toks.length && toks[i].start < e.end; i++) {
      const t = toks[i];
      if (t.kind === 'SYMBOL') {
        if (t.text === '(' || t.text === '[') depth++;
        else if (t.text === ')' || t.text === ']') depth--;
        else if (depth === 0 && (t.text === '{' || t.text === ';')) break;
      }
      out.push(t);
    }
    return out;
  };

  // 要素の字句のすべて(本体 { … } を含み、終わりの ; を除く。状態遷移ビューの entry・do・exit の文字に使う)
  const elemTokens = (e) => {
    const out = [];
    for (let i = firstTokAt(e.start); i < toks.length && toks[i].start < e.end; i++) out.push(toks[i]);
    if (out.length && out[out.length - 1].kind === 'SYMBOL' && out[out.length - 1].text === ';') out.pop();
    return out;
  };

  return { tree, model, text, parent, order, ref, refsOf, target, user, is, isAny, members, owningRel, ownerOf, names, nameOf, refText, typeText, typesOf, chainOf, declTokens, elemTokens, joinTokens };
}

// 字句を、図に書く文字に組み立てる(名前の単一引用符を外す。空白は 1 つにつめる)
const NO_SPACE_BEFORE = new Set([',', ')', ']', '.', '::', ';', '.?']);
const NO_SPACE_AFTER = new Set(['(', '[', '.', '::', '~', '#', '@', '^', '$', '.?']);
export function joinTokens(toks) {
  let s = '';
  let prev = null;
  for (const t of toks) {
    const txt = t.kind === 'NAME' ? unquote(t.text) : t.text;
    if (prev !== null && !NO_SPACE_BEFORE.has(t.text) && !NO_SPACE_AFTER.has(prev)) s += ' ';
    s += txt.replace(/\s+/g, ' ');
    prev = t.text;
  }
  return s;
}

// 注釈の本文(/* … */ の中身)を行に分ける(KerML 8.2.2.2 の注の本文の読み方に沿い、行頭の * を除く)
export function commentLines(body) {
  if (body == null) return [];
  let s = String(body);
  if (s.startsWith('/*')) s = s.slice(2);
  if (s.endsWith('*/')) s = s.slice(0, -2);
  const lines = s.split(/\r\n|\r|\n/).map((l) => l.replace(/^\s*\*\s?/, '').replace(/\s+$/, ''));
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.map((l) => l.replace(/^\s+/, ''));
}

// 線の id を、線の要素の記述の順(数の順)で比べる(GR7 指示書 5 章。設計書 7.3 節)。
// 線の id は 'e' + 記述の順の番号に、'.0'・'.c0'・'.a0'・'.l' などが付いたもの。数の部分は数として比べるので、
// 'e9' < 'e10'、'e12.2' < 'e12.10' になる。文字列の順と違い、行を書き足して番号の桁が変わっても、すでにある線どうしの順番は変わらない
export function compareEdgeIds(a, b) {
  const ta = a.match(/\d+|\D+/g) ?? [], tb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    const x = ta[i], y = tb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) { if (+x !== +y) return +x - +y; continue; }
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
