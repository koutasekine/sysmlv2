// 標準ライブラリの名前の索引 grammar/library_index.json を、照合用の標準ライブラリのファイルから作る(GR17 指示書 3.1 節、
// 設計書 6.1 節・11 章)。手で書き写さない。
//
// 使い方:
//   node tools/model/extract_library.mjs [--out grammar/library_index.json]
//
// 入力: vendor/release-2026-03/sysml.library の .sysml(58)と .kerml(36)。tools/fetch.sh でタグ 2026-03 から取得したもの。
//   .sysml は今のパーサー(src/parser)で解析し、構文木から抜き出す。今のパーサーが拒否するファイル(設計書 2.5 節の既知の差。
//     TradeStudies.sysml)は索引に入れない(その中の名前への参照は、索引を入れる前と同じく未検査のまま)。
//   .kerml は今のパーサー(SysML の文法)で読めないので、字句(src/parser/lexer.js。予約語は文法の表の予約語に KerML 1.0 の
//     8.2.2.6 節の予約語を足したもの)に分け、宣言の並びを読む(tools/model/library_members.mjs の読み方を元にした)。
//
// 索引に入れるもの(設計書 6.1 節の項目だけ):
//   q  修飾名(名前のない要素は null)        n  名前              s  短い名前
//   k  種類(メタクラス)                      o  持ち主(elements の番号。最上位のパッケージは null)
//   v  可視性(public は省く)
//   g  上位の型 [[関係の種類, 参照]]。関係の種類は Subclassification・Specialization・Subsetting・Redefinition・
//      ReferenceSubsetting・CrossSubsetting・FeatureTyping・Conjugation。参照は「A::B」の修飾名か、「a.b」の特徴の連鎖
//   a  別名の相手(alias X for Y の Y)
//   i  import [[種類(NamespaceImport・MembershipImport), 参照, 再帰なら 1, 可視性]]
// 入れないもの: doc と注の本文、式・値(= の後ろ)・本体の式、メタデータの注釈、名前を持たない要素(名前を再定義から受け継ぐ特徴を除く)。
// 書き出した後に、出力の検査(下の checkIndex)で、上の項目のほかに何も入っていないことを確かめる。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { makeLexer } from '../../src/parser/lexer.js';
import grammar from '../../src/parser/grammar_table.js';
import builtinTable from '../../src/model/builtin_table.js';
import { libraryFiles } from './library_members.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'grammar/library_index.json');
const LIB = path.join(ROOT, 'vendor/release-2026-03/sysml.library') + path.sep;

const META = builtinTable.metaclasses;
const anc = new Map();
const conforms = (k, m) => {
  if (!anc.has(k)) { const s = new Set([k]); const w = (x) => { for (const g of META[x]?.general ?? []) if (!s.has(g)) { s.add(g); w(g); } }; w(k); anc.set(k, s); }
  return anc.get(k).has(m);
};

// 名前を修飾名の中で書く形(KerML 1.0 の 8.2.2.3 節。基本の名前でなければ単一引用符で囲む)
const BASIC = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const quoteName = (n) => (BASIC.test(n) && !RESERVED().has(n) ? n : `'${n.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
const unq = (t) => (t.startsWith("'") ? t.slice(1, -1).replace(/\\(.)/g, (m, c) => ({ b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', "'": "'", '\\': '\\' }[c] ?? c)) : t);

const elements = [];
const add = (e) => { elements.push(e); return elements.length - 1; };
const qOf = (owner, name) => (name == null ? null : owner == null ? quoteName(name) : elements[owner].q == null ? null : `${elements[owner].q}::${quoteName(name)}`);
const skipped = { files: [] };

// ---------------- .sysml: 構文木から
const GENERAL_PROP = {
  FeatureTyping: 'type', Subclassification: 'superclassifier', Subsetting: 'subsettedFeature', Redefinition: 'redefinedFeature',
  ReferenceSubsetting: 'referencedFeature', CrossSubsetting: 'crossedFeature', Specialization: 'general',
  ConjugatedPortTyping: 'originalPortDefinition', Conjugation: 'originalType',
};
// 構文木の参照の文字(字句を空白でつないだもの)を、「A::B」の形にする
const lexS = makeLexer({ keywords: grammar.keywords, symbols: grammar.symbols });
const normRef = (text) => {
  const r = lexS(text);
  if (!r.ok) throw new Error(`参照「${text}」を字句に分けられない`);
  return r.tokens.filter(t => t.text !== '::').map(t => quoteName(unq(t.text))).join('::');
};
function relKindOf(kind) {
  let best = null, d = Infinity;
  for (const k of Object.keys(GENERAL_PROP)) {
    if (!conforms(kind, k)) continue;
    let dd = 0; for (let x = kind; x !== k; dd++) x = (META[x].general.find(g => conforms(g, k)));
    if (dd < d) { d = dd; best = k; }
  }
  return best;
}
function generalsFromTree(e) {
  const g = [];
  for (const r of e.owned) {
    if (!(conforms(r.kind, 'Specialization') || conforms(r.kind, 'Conjugation'))) continue;
    const rk = relKindOf(r.kind);
    const prop = GENERAL_PROP[rk];
    const kind = rk === 'ConjugatedPortTyping' ? 'FeatureTyping' : rk;
    if (r.refs[prop] !== undefined) { g.push([kind, normRef(r.refs[prop])]); continue; }
    const chain = r.related.find(x => conforms(x.kind, 'Feature'));
    const links = chain ? chain.owned.filter(c => c.kind === 'FeatureChaining').map(c => normRef(c.refs.chainingFeature)) : [];
    if (links.length) g.push([kind, links.join('.')]);
  }
  return g;
}
const isAnnotation = (k) => conforms(k, 'AnnotatingElement') || conforms(k, 'MetadataUsage');
function walkTree(ns, owner) {
  for (const c of ns.owned) {
    if (conforms(c.kind, 'Import')) {
      if (owner == null) continue;
      const prop = conforms(c.kind, 'MembershipImport') ? 'importedMembership' : 'importedNamespace';
      if (c.refs[prop] === undefined) continue; // フィルター付きの import(ライブラリにはない)
      (elements[owner].i ??= []).push([c.kind, normRef(c.refs[prop]), c.attrs.isRecursive === true ? 1 : 0, c.attrs.visibility ?? 'private']);
      continue;
    }
    if (!conforms(c.kind, 'Membership')) continue;
    if (!conforms(c.kind, 'OwningMembership')) {
      if (c.attrs.memberName === undefined && c.attrs.memberShortName === undefined) continue;
      const e = { q: qOf(owner, c.attrs.memberName ?? null), n: c.attrs.memberName ?? null, s: c.attrs.memberShortName ?? null, k: c.kind, o: owner, v: c.attrs.visibility ?? 'public', a: normRef(c.refs.memberElement) };
      add(e);
      continue;
    }
    // 値・式の本体・メタデータの注釈・doc と注は入れない
    if (conforms(c.kind, 'FeatureValue') || conforms(c.kind, 'ResultExpressionMembership')) continue;
    const el = c.related[0];
    if (!el || isAnnotation(el.kind)) continue;
    if (conforms(el.kind, 'Expression') && !conforms(el.kind, 'Usage')) continue;
    const g = generalsFromTree(el);
    const named = el.name !== undefined || el.shortName !== undefined;
    if (!named && !(conforms(el.kind, 'Feature') && g.some(x => x[0] === 'Redefinition'))) continue;
    const id = add({ q: qOf(owner, el.name ?? null), n: el.name ?? null, s: el.shortName ?? null, k: el.kind, o: owner, v: c.attrs.visibility ?? 'public', g });
    walkTree(el, id);
  }
}

// ---------------- .kerml: 字句で
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
// 修飾名の中で引用符を付ける予約語は、SysML と KerML の予約語の両方(索引の参照を、どちらの字句の規則で読んでも同じ名前になる)
const KW_ALL = [...new Set([...grammar.keywords, ...kermlKeywords()])];
let reservedSet = null;
function RESERVED() { return (reservedSet ??= new Set(KW_ALL)); }
const lexK = makeLexer({ keywords: KW_ALL, symbols: grammar.symbols });
// 宣言の種類の予約語(KerML 1.0 の 8.2 節の文法)→ メタクラス
const KIND_KW = {
  namespace: 'Namespace', package: 'Package', type: 'Type', classifier: 'Classifier', datatype: 'DataType', class: 'Class',
  struct: 'Structure', assoc: 'Association', behavior: 'Behavior', function: 'Function', predicate: 'Predicate', interaction: 'Interaction',
  metaclass: 'Metaclass', feature: 'Feature', step: 'Step', expr: 'Expression', bool: 'BooleanExpression', inv: 'Invariant',
  connector: 'Connector', binding: 'BindingConnector', succession: 'Succession', flow: 'Flow', multiplicity: 'Multiplicity',
};
const MODIFIERS = new Set(['public', 'private', 'protected', 'abstract', 'var', 'const', 'derived', 'end', 'composite', 'portion', 'readonly',
  'in', 'out', 'inout', 'ordered', 'nonunique', 'standard', 'library', 'all', 'member', 'return', 'variation']);
const SKIP_KW = new Set(['doc', 'comment', 'metadata', 'filter', 'dependency', 'rep', 'language', 'locale', 'specialization', 'subclassifier',
  'subtype', 'subset', 'redefinition', 'conjugation', 'conjugate', 'disjoining', 'disjoint', 'featuring', 'inverse', 'typing', 'about']);
function walkKerml(file, rootOwner) {
  const r = lexK(fs.readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(`${file}: 字句のエラー ${r.error?.message}`);
  const T = r.tokens;
  let i = 0;
  const isSym = (t, s) => t && t.kind === 'SYMBOL' && t.text === s;
  const qnameIn = (A, j) => {
    const parts = [];
    while (A[j] && A[j].kind === 'NAME') { parts.push(quoteName(unq(A[j].text))); if (isSym(A[j + 1], '::') && A[j + 2]?.kind === 'NAME') j += 2; else { j++; break; } }
    return { text: parts.join('::'), next: j };
  };
  // 修飾名か、「.」でつないだ特徴の連鎖
  const refIn = (A, j) => {
    const links = [];
    let q = qnameIn(A, j);
    while (q.text) { links.push(q.text); j = q.next; if (isSym(A[j], '.') && A[j + 1]?.kind === 'NAME') q = qnameIn(A, j + 1); else break; }
    return { text: links.join('.'), next: j };
  };
  const body = (owner) => {
    while (i < T.length && !isSym(T[i], '}')) {
      const st = i;
      const first = T[i];
      if (first.kind === 'REGULAR_COMMENT') { i++; continue; }
      if (isSym(first, ';')) { i++; continue; }
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
            // 値の式の中の本体の式({ … })は、= ・ := ・ default の直後か、「-> 名前」の後ろのものだけ。値の式の後ろのほかの { は、
            // 宣言の本体(feature redefines x default y { … } など)
            const p1 = T[j - 1], p2 = T[j - 2];
            const exprBody = valued && ((p1 && (isSym(p1, '=') || isSym(p1, ':=') || (p1.kind === 'KEYWORD' && p1.text === 'default'))) || (p2 && isSym(p2, '->')));
            if (exprBody || isNote) { let d = 0; for (; j < T.length; j++) { if (isSym(T[j], '{')) d++; else if (isSym(T[j], '}') && --d === 0) break; } continue; }
            end = j; open = true; break;
          } else if (depth === 0 && t.text === '}') { end = j - 1; break; }
        } else if (depth === 0 && t.kind === 'KEYWORD' && t.text === 'default') valued = true;
      }
      if (end < 0) { i = T.length; break; }
      const H = T.slice(st, open ? end : end + 1).filter(t => t.kind !== 'REGULAR_COMMENT');
      i = end + 1;
      const skipBody = () => { let d = 1; for (; i < T.length; i++) { if (isSym(T[i], '{')) d++; else if (isSym(T[i], '}') && --d === 0) { i++; break; } } };
      // 可視性
      let k = 0, vis = null;
      if (H[0]?.kind === 'KEYWORD' && /^(public|private|protected)$/.test(H[0].text)) { vis = H[0].text; k = 1; }
      const h = H[k];
      // import
      if (h?.kind === 'KEYWORD' && h.text === 'import') {
        let j = k + 1;
        if (H[j]?.text === 'all') j++;
        const q = qnameIn(H, j); j = q.next;
        let kind = 'MembershipImport', rec = 0;
        if (isSym(H[j], '::') && (isSym(H[j + 1], '*') || isSym(H[j + 1], '**'))) {
          if (isSym(H[j + 1], '**')) rec = 1;
          else { kind = 'NamespaceImport'; if (isSym(H[j + 2], '::') && isSym(H[j + 3], '**')) rec = 1; }
        }
        if (owner != null && q.text) (elements[owner].i ??= []).push([kind, q.text, rec, vis ?? 'private']);
        if (open) skipBody();
        continue;
      }
      // alias
      if (h?.kind === 'KEYWORD' && h.text === 'alias') {
        let j = k + 1, s = null, n = null;
        if (isSym(H[j], '<') && H[j + 1]?.kind === 'NAME' && isSym(H[j + 2], '>')) { s = unq(H[j + 1].text); j += 3; }
        if (H[j]?.kind === 'NAME') { n = unq(H[j].text); j++; }
        const f = H.findIndex(t => t.kind === 'KEYWORD' && t.text === 'for');
        const q = f > 0 ? qnameIn(H, f + 1).text : '';
        if (owner != null && q && (n != null || s != null)) add({ q: qOf(owner, n), n, s, k: 'Membership', o: owner, v: vis ?? 'public', a: q });
        if (open) skipBody();
        continue;
      }
      // 宣言でないもの(式・注釈・単独の関係など)は読み飛ばす
      const declStart = h && ((h.kind === 'KEYWORD' && (MODIFIERS.has(h.text) || KIND_KW[h.text])) || isSym(h, ':>>'));
      if (!declStart || (h.kind === 'KEYWORD' && SKIP_KW.has(h.text)) || isSym(H[0], '@') || isSym(H[0], '#')) { if (open) skipBody(); continue; }
      let kind = null, sawLibPkg = false;
      while (k < H.length && H[k].kind === 'KEYWORD' && (MODIFIERS.has(H[k].text) || KIND_KW[H[k].text])) {
        const w = H[k].text;
        if (KIND_KW[w]) {
          if (w === 'package' && sawLibPkg) kind = 'LibraryPackage';
          else if (w === 'struct' && kind === 'Association') kind = 'AssociationStructure';
          else if (w === 'flow' && kind === 'Succession') kind = 'SuccessionFlow';
          else kind = KIND_KW[w];
        }
        if (w === 'library') sawLibPkg = true;
        k++;
      }
      kind ??= 'Feature';
      let name = null, shortName = null;
      if (isSym(H[k], '<') && H[k + 1]?.kind === 'NAME' && isSym(H[k + 2], '>')) { shortName = unq(H[k + 1].text); k += 3; }
      // KerML の省略形の継承 succession X then Y(first なし)と結合 binding X = Y(of なし)の X は、要素の名前でなく端の参照
      // (KerML 1.0 の 8.2 節の SuccessionDeclaration・BindingConnectorDeclaration の 2 つ目の選択肢。GR18 の M2)
      const kwAt = (w) => H.some((t, j) => j >= k && t.kind === 'KEYWORD' && t.text === w);
      const endForm = (kind === 'Succession' && !kwAt('first') && kwAt('then'))
        || (kind === 'BindingConnector' && !kwAt('of') && H.some((t, j) => j >= k && isSym(t, '=')));
      if (H[k]?.kind === 'NAME' && !endForm) { name = unq(H[k].text); k++; }
      // 上位の型
      const isFeat = conforms(kind, 'Feature'), isCls = conforms(kind, 'Classifier');
      const g = [];
      for (let j = k; j < H.length; j++) {
        const t = H[j];
        if ((t.kind === 'SYMBOL' && (t.text === '=' || t.text === ':=')) || (t.kind === 'KEYWORD' && t.text === 'default')) break;
        let rel = null, from = -1;
        const w = t.text;
        if (t.kind === 'KEYWORD') {
          if (w === 'specializes') rel = isFeat ? 'Subsetting' : isCls ? 'Subclassification' : 'Specialization';
          else if (w === 'subsets') rel = 'Subsetting';
          else if (w === 'redefines') rel = 'Redefinition';
          else if (w === 'references') rel = 'ReferenceSubsetting';
          else if (w === 'crosses') rel = 'CrossSubsetting';
          else if (w === 'conjugates') rel = 'Conjugation';
          else if (w === 'typed' && H[j + 1]?.text === 'by') { rel = 'FeatureTyping'; from = j + 2; }
          // 宣言の後ろの、上位の型でない関係(disjoint from・unions・featured by・inverse of・chains など)の名前は読まない
          else if (['disjoint', 'unions', 'intersects', 'differences', 'featured', 'inverse', 'chains', 'of', 'from', 'to', 'first', 'then'].includes(w)) { rel = 'skip'; }
        } else if (t.kind === 'SYMBOL') {
          if (w === ':>') rel = isFeat ? 'Subsetting' : isCls ? 'Subclassification' : 'Specialization';
          else if (w === ':') rel = 'FeatureTyping';
          else if (w === ':>>') rel = 'Redefinition';
          else if (w === '::>') rel = 'ReferenceSubsetting';
          else if (w === '=>') rel = 'CrossSubsetting';
          else if (w === '~') rel = 'Conjugation';
        }
        if (!rel) continue;
        if (from < 0) from = j + 1;
        for (let m = from; m < H.length;) {
          if (isSym(H[m], '~')) { m++; continue; }
          const q = refIn(H, m);
          if (!q.text) break;
          if (rel !== 'skip') g.push([rel, q.text]);
          m = q.next;
          if (isSym(H[m], ',')) m++; else break;
        }
      }
      // 名前のない宣言は、名前を再定義から受け継ぐ特徴だけを入れる
      if (name == null && shortName == null && !(isFeat && g.some(x => x[0] === 'Redefinition'))) { if (open) skipBody(); continue; }
      if (owner == null && rootOwner === undefined && !conforms(kind, 'Package')) { if (open) skipBody(); continue; }
      const id = add({ q: qOf(owner, name), n: name, s: shortName, k: kind, o: owner, v: vis ?? 'public', g });
      if (open) { body(id); if (isSym(T[i], '}')) i++; }
    }
  };
  body(null);
}

// ---------------- 作る
for (const f of libraryFiles()) {
  const rel = f.slice(LIB.length);
  if (f.endsWith('.sysml')) {
    const p = parse(decodeUtf8(fs.readFileSync(f)));
    if (!p.ok) { skipped.files.push({ file: rel, why: `構文エラー ${p.errors[0].line} 行 ${p.errors[0].col} 列(設計書 2.5 節の既知の差)` }); continue; }
    walkTree(p.tree, null);
  } else walkKerml(f);
}
// 空の g・i、public の v、null の s は省く
const out = elements.map(e => {
  const o = { q: e.q, n: e.n, k: e.k, o: e.o };
  if (e.s != null) o.s = e.s;
  if (e.v && e.v !== 'public') o.v = e.v;
  if (e.g?.length) o.g = e.g;
  if (e.a) o.a = e.a;
  if (e.i?.length) o.i = e.i;
  return o;
});

// ---------------- 出力の検査(指示書 3.1 節: doc・注の本文・式・値・本体を入れない)
export function checkIndex(list) {
  const bad = [];
  const KEYS = new Set(['q', 'n', 's', 'k', 'o', 'v', 'g', 'a', 'i']);
  const REL = new Set(['Subclassification', 'Specialization', 'Subsetting', 'Redefinition', 'ReferenceSubsetting', 'CrossSubsetting', 'FeatureTyping', 'Conjugation']);
  const IMP = new Set(['NamespaceImport', 'MembershipImport']);
  const VIS = new Set(['public', 'private', 'protected']);
  // 参照は、名前の字句・「::」・「.」だけからなる
  const isRef = (s) => { const r = lexK(s); return r.ok && r.tokens.length > 0 && r.tokens.every((t, j) => (j % 2 === 0 ? t.kind === 'NAME' : t.text === '::' || t.text === '.')) && r.tokens.length % 2 === 1; };
  // 名前は、1 つの名前の字句として書ける文字列(改行を含まない)
  const isName = (s) => s === null || (typeof s === 'string' && !/[\n\r]/.test(s) && s.length <= 200);
  list.forEach((e, idx) => {
    for (const key of Object.keys(e)) if (!KEYS.has(key)) bad.push(`${idx}: 項目にない鍵 ${key}`);
    if (!isName(e.n) || (e.s !== undefined && !isName(e.s))) bad.push(`${idx}: 名前でない文字列`);
    if (!META[e.k] && e.k !== 'Membership') bad.push(`${idx}: 種類 ${e.k} がメタクラスでない`);
    if (e.o !== null && !(Number.isInteger(e.o) && e.o >= 0 && e.o < idx)) bad.push(`${idx}: 持ち主 ${e.o}`);
    if (e.v !== undefined && !VIS.has(e.v)) bad.push(`${idx}: 可視性 ${e.v}`);
    for (const [r, ref] of e.g ?? []) { if (!REL.has(r)) bad.push(`${idx}: 関係 ${r}`); if (!isRef(ref)) bad.push(`${idx}: 参照でない文字列 ${ref}`); }
    if (e.a !== undefined && !isRef(e.a)) bad.push(`${idx}: 別名の相手が参照でない ${e.a}`);
    for (const [kind, ref, rec, vis] of e.i ?? []) { if (!IMP.has(kind) || !isRef(ref) || (rec !== 0 && rec !== 1) || !VIS.has(vis)) bad.push(`${idx}: import ${kind} ${ref}`); }
    const expectQ = e.n == null ? null : e.o == null ? quoteName(e.n) : list[e.o].q == null ? null : `${list[e.o].q}::${quoteName(e.n)}`;
    if (e.q !== expectQ) bad.push(`${idx}: 修飾名 ${e.q} が名前と持ち主から求めたもの ${expectQ} と違う`);
  });
  return bad;
}
const bad = checkIndex(out);
if (bad.length) { console.error(`出力の検査で ${bad.length} 件の不合格:\n` + bad.slice(0, 20).join('\n')); process.exit(1); }

const doc = {
  _説明: [
    '標準ライブラリの名前の索引(GR17 指示書 3.1 節、設計書 6.1 節)。node tools/model/extract_library.mjs で、SysML-v2-Release タグ 2026-03 の sysml.library から作った。手で編集しない。',
    '.sysml は今のパーサーで解析した構文木から、.kerml は字句で読んで抜き出した。今のパーサーが拒否する .sysml(設計書 2.5 節の既知の差)は入れていない。',
    '要素ごとに、修飾名 q・名前 n・短い名前 s・種類 k・持ち主 o(elements の番号)・可視性 v(public は省く)・上位の型 g([関係の種類, 参照])・別名の相手 a・import i([種類, 参照, 再帰, 可視性])だけを持つ。doc と注の本文、式・値・本体は入れていない。',
  ],
  source: 'SysML-v2-Release 2026-03 sysml.library',
  skipped: skipped.files,
  elements: out,
};
fs.writeFileSync(OUT, JSON.stringify(doc).replace(/\{"q"/g, '\n{"q"') + '\n');
const byExt = (ext) => libraryFiles().filter(f => f.endsWith(ext)).length;
console.log(`要素 ${out.length}(名前のある要素 ${out.filter(e => e.n != null || e.s != null).length}、別名 ${out.filter(e => e.a).length}、import を持つ要素 ${out.filter(e => e.i).length})。ファイル .sysml ${byExt('.sysml')}(入れなかったもの ${skipped.files.length})・.kerml ${byExt('.kerml')}。出力の検査 合格。→ ${OUT}(${fs.statSync(OUT).size} バイト)`);
for (const s of skipped.files) console.log(`  入れなかったファイル: ${s.file}: ${s.why}`);
