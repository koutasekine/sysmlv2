// 図からの編集の段階 2(追加)の本体(GR16 指示書 3.1 節、設計書 8 章の「段階 2(追加)の規則」)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。Node.js の検査(tests/edit/run.mjs)からも、画面(src/app/worker.js)からも呼ぶ。
//
// addTargets(analysis, element) → { part, port }
//   その要素に足せるもの。part は部品の定義・使用とパッケージ(パッケージに足すのは一般ビューだけ。画面が決める)、port は部品の定義・使用
// typeCandidates({ analysis, owner, kind }) → [{ element, written, qname, usable, code, reason }]
//   型の候補(kind は 'PartDefinition'・'PortDefinition'・'InterfaceDefinition')。利用者のモデルのその種類の要素のうち、書き足す場所
//   (owner の本体)から名前で指せるもの。written は書き足す場所から解決する最も短い書き方(単純な名前か修飾名)。書き方が解決しても、
//   未検査・曖昧・D3 の印になるもの(設計書 8 章の上の規則)は usable が false で、code・reason にその理由を持つ。記述の順に並べる
// addPart({ text, analysis, owner, name, type }, opts)                              part 名前 : 型;
// addPort({ text, analysis, owner, name, type, conjugated, direction }, opts)       向き port 名前 : ~型;
// addConnection({ text, analysis, ends, form, name, type }, opts)                   connect 端1 to 端2; か interface 名前 : 型 connect 端1 to 端2;
// connectionOwner(analysis, ends) → 接続を書き足す場所(下の規則)か null。画面がインターフェースの定義の候補を選ぶのに使う
//   ends は 2 つの端の、図の箱の入れ子をたどった要素の並び(描く範囲の外側の箱から、選んだポートか部品まで)。
//   書き足す場所は、2 つの端をともに入れ子に持つ最も内側の部品の定義・使用。ただし、型から受け継いで描いた箱(持ち主の要素が、図で
//   その外側の箱の要素でないもの)とその中の箱には書かない(書くと型の定義を書き換えるため)。端はその場所からの特徴の連鎖で書く
// どれも → { ok: true, text, edits, added: { start, end, kind } } | { ok: false, reverted, code, reason, details }
//   added は書き足した要素の、書き足した後のテキストでの原文の範囲と種類(画面が描き直した図でその要素を選ぶのに使う)。
//   reverted が true のものは、書き足した後の確かめで書き足す前に戻したもの(検査では不合格)。false は実行前に拒否したもの。
//   code: 設計書 8 章の条件に当たるもの: syntax(構文エラーがある間)、not-user(内蔵する表の項目・暗黙の要素)、not-owner(足せる種類の
//   要素でない)、empty(空の名前)、unchecked-refs(書き足す参照に未検査・曖昧・D3 の印のもの)、S2(区別できない名前)、unnamed-end
//   (名前で指せない端)、unnamed-type(名前で指せない型)。それ以外: unwritable(書けない制御文字)、no-owner(端をともに持つ部品が
//   ない)、same-end(2 つの端が同じ)、no-body(本体の字句が見つからない)、no-form(形が違う)、戻したもの: revert
//
// 書き足す場所と字下げ(設計書 8 章):
//   本体の最後のメンバー(import を含む)の後ろ。最後のメンバーと同じ行の後ろが空白と注(//)だけなら、その行の末尾。字下げは最後の
//   メンバーの行に合わせる。本体が 1 行(最後のメンバーが本体の { と } と同じ行)なら、改行せずに同じ行の最後のメンバーの後ろに空白 1 つで足す。
//   メンバーのない本体 { } は、持ち主の行の字下げに 4 つの空白を足した字下げで、{ と } の間に足す({ と } が同じ行なら、} を持ち主の
//   字下げの行に移す)。本体のない宣言は、; を「 {」・改行・足すもの・改行・持ち主の字下げの } に書き換える(; の前が空白でなければ
//   { の前に空白を 1 つ置く)。改行はテキストの最初の改行と同じもの(なければ LF)
// 確かめ(設計書 8 章): 書き足した後のテキストを解析し直し、構文エラーがない、意味エラーと未検査の件数が増えない、書き足す前の参照の
//   状態と解決先が変わらない、モデルの差分(src/edit/index.js の modelDump・diffDumps)が足した要素とその中身だけ、型と接続の端が
//   選んだ要素に解決する。満たさなければ書き足す前に戻す。意味エラーのうち S2 が増えたときは、区別できない名前として拒否する

import { EDIT18, s2Clash, analyze, writtenName, declaredWriting, s2Details, modelDump, diffDumps, positionsOf, tokensOf, folderScope } from './index.js';
import { walkTree } from '../parser/tree.js';

const DIRECTIONS = new Set(['', 'in', 'out', 'inout']);
const reject = (code, reason, details = []) => ({ ok: false, reverted: false, code, reason, details });
const revert = (reason, details = []) => ({ ok: false, reverted: true, code: 'revert', reason: `書き足した後の確かめで戻した: ${reason}`, details });
const user = (e) => !!e && !e.builtin && !e.virtual && e.end > e.start;
// 部品の定義・使用。接続・インターフェース・割り当て・フローなど線で描く部品の下位の種類と、view・rendering(抽象構文では部品の
// 下位の種類だが、部品として描かない)を除く
const NOT_PART = ['ConnectionDefinition', 'Connector', 'ViewDefinition', 'ViewUsage', 'RenderingDefinition', 'RenderingUsage'];
export const isPartOwner = (model, e) => user(e) && (model.conforms(e.kind, 'PartDefinition') || model.conforms(e.kind, 'PartUsage'))
  && !NOT_PART.some(k => model.conforms(e.kind, k));
const isPackage = (model, e) => user(e) && model.conforms(e.kind, 'Package');
// 制御文字(Cc)のうち、表 4 のエスケープ列で書けないもの(src/edit/index.js の unwritable と同じ判定)
const unwritable = (name) => [...name].some(c => { const k = c.codePointAt(0); return (k < 0x20 || (k >= 0x7f && k <= 0x9f)) && !'\b\f\t\n'.includes(c); });

export function addTargets(analysis, element) {
  if (!analysis?.ok || !user(element)) return { part: false, port: false };
  const m = analysis.model;
  const p = isPartOwner(m, element);
  return { part: p || isPackage(m, element), port: p };
}

// 要素の名前(宣言した名前、なければ短い名前、なければ実効の名前)
const nameOf = (model, e) => e.name ?? e.shortName ?? model.namesOf(e).name ?? model.namesOf(e).shortName ?? undefined;
const D3 = (r) => r.status === 'ambiguous' ? '曖昧' : r.status === 'unchecked' ? '未検査' : 'D3 の印(ライブラリの名前に遮られているかもしれない)';

// 型の書き方: 書き足す場所 ns から element に解決する最も短い書き方(単純な名前、持ち主の名前::名前、…)。区切りは、その要素の宣言の
// 書き方に合わせる(GR17 の Q。text がないときは writtenName)
function typeWriting(model, tree, ns, element, text = null) {
  const segs = [], els = [];
  for (let e = element; e && e !== tree; e = model.parentNamespaceOf(e)) {
    const n = nameOf(model, e);
    if (n === undefined || n === null) break;
    segs.unshift(n); els.unshift(e);
  }
  if (!segs.length || segs[segs.length - 1] !== nameOf(model, element)) return null;
  let flagged = null;
  for (let k = 1; k <= segs.length; k++) {
    const names = segs.slice(segs.length - k);
    const r = model.resolveFrom(ns, names);
    const written = names.map((n, i) => declaredWriting(text, model, els[els.length - names.length + i], n)).join('::');
    if (r.status === 'resolved' && r.target === element && !r.shadow) return { written, usable: true };
    if (!flagged && (r.status === 'ambiguous' || (r.status === 'resolved' && r.target === element && r.shadow))) flagged = { written, usable: false, code: 'unchecked-refs', reason: `型の名前「${written}」が${D3(r)}` };
  }
  return flagged;
}

export function typeCandidates({ analysis, owner, kind, text = null }) {
  if (!analysis?.ok || !user(owner)) return [];
  const { tree, model } = analysis;
  const out = [];
  walkTree(tree, (e) => {
    if (user(e) && model.conforms(e.kind, kind) && (kind !== 'PartDefinition' || !NOT_PART.some(k => model.conforms(e.kind, k)))) {
      const w = typeWriting(model, tree, owner, e, text);
      if (w) out.push({ element: e, qname: qnameOf(model, tree, e), ...w });
    }
  }); // 前順の明示のスタック(GR27 の E。設計書 2.6 節)
  return out;
}
const qnameOf = (model, tree, e) => { const s = []; for (let x = e; x && x !== tree; x = model.parentNamespaceOf(x)) s.unshift(nameOf(model, x) ?? ''); return s.join('::'); };

// ---- 書き足す場所
const lineStart = (text, at) => { let i = at; while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--; return i; };
const lineEnd = (text, at) => { let i = at; while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++; return i; };
const indentAt = (text, at) => /^[ \t]*/.exec(text.slice(lineStart(text, at)))[0];
const noNewline = (s) => !/[\r\n]/.test(s);
// 行の残りが空白と 1 行の注だけか(//* で始まり同じ行で閉じない注は、次の行に続くので含めない)
export const restIsNote = (rest) => /^[ \t]*(\/\/.*)?$/.test(rest) && !(/^[ \t]*\/\/\*/.test(rest) && !rest.includes('*/'));

// 持ち主 owner の本体に decl を足す編集。→ { edits: [{ start, end, text }], declAt(書き足した後のテキストでの decl の始まり) } | reject
export function memberInsertion(text, owner, decl) {
  const tokens = tokensOf(text);
  if (!tokens) return reject('no-body', '字句に分けられない');
  const inside = tokens.filter(t => t.start >= owner.start && t.end <= owner.end);
  const lastTok = inside[inside.length - 1];
  const nl = /\r\n|\r|\n/.exec(text)?.[0] ?? '\n';
  const ownerIndent = indentAt(text, owner.start);
  if (lastTok?.kind === 'SYMBOL' && lastTok.text === ';' && lastTok.end === owner.end) {
    const sp = /[ \t\r\n]/.test(text[lastTok.start - 1] ?? ' ') ? '' : ' ';
    const head = `${sp}{${nl}${ownerIndent}    `;
    return { edits: [{ start: lastTok.start, end: lastTok.end, text: `${head}${decl}${nl}${ownerIndent}}` }], declAt: lastTok.start + head.length };
  }
  if (!(lastTok?.kind === 'SYMBOL' && lastTok.text === '}' && lastTok.end === owner.end)) return reject('no-body', '持ち主の本体({ … } か ;)が見つからない');
  // 本体の { を、閉じ括弧から数えて探す
  let depth = 0, open = null;
  for (let i = inside.length - 1; i >= 0; i--) {
    const t = inside[i];
    if (t.kind !== 'SYMBOL') continue;
    if (t.text === '}') depth++;
    else if (t.text === '{' && --depth === 0) { open = t; break; }
  }
  if (!open) return reject('no-body', '持ち主の本体の { が見つからない');
  const close = lastTok;
  const members = owner.owned.filter(c => c.end > c.start && c.start >= open.end);
  if (!members.length) {
    const between = text.slice(open.end, close.start);
    const indent = `${ownerIndent}    `;
    if (noNewline(between)) {
      const t = `${nl}${indent}${decl}${nl}${ownerIndent}`;
      return { edits: [{ start: open.end, end: close.start, text: t }], declAt: open.end + nl.length + indent.length };
    }
    const eol = lineEnd(text, open.end);
    const at = restIsNote(text.slice(open.end, eol)) ? eol : open.end;
    return { edits: [{ start: at, end: at, text: `${nl}${indent}${decl}` }], declAt: at + nl.length + indent.length };
  }
  const last = members.reduce((a, b) => (b.end > a.end ? b : a));
  if (noNewline(text.slice(open.start, last.start)) && noNewline(text.slice(last.end, close.start))) {
    return { edits: [{ start: last.end, end: last.end, text: ` ${decl}` }], declAt: last.end + 1 };
  }
  const indent = indentAt(text, last.start);
  const eol = lineEnd(text, last.end);
  const at = restIsNote(text.slice(last.end, eol)) ? eol : last.end;
  return { edits: [{ start: at, end: at, text: `${nl}${indent}${decl}` }], declAt: at + nl.length + indent.length };
}

// ---- 書き足して確かめる
// refs: 書き足す参照の、書いた形と選んだ要素 [{ what, text, names(区切りの名前), path(区切りごとの要素), target(参照の解決先。省けば path の最後) }]。
// 書き足した宣言の中の参照と、原文の順に組にする
function insertAndCheck({ text, analysis, owner, decl, name, refs: written }, opts) {
  const ins = memberInsertion(text, owner, decl);
  if (!ins.edits) return ins;
  // フォルダのときは、書き足す箇所が持ち主のファイルの中にあるときだけ行う(GR20 の F)
  const scope = folderScope(opts, ins.edits, owner.start);
  if (scope.reject) return scope.reject;
  let out = text;
  for (const e of ins.edits.slice().sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const after = analyze(out, scope.opts);
  if (!after.ok) return revert('構文エラーになる', after.errors.map(e => `${e.line} 行 ${e.col} 列 ${e.message}`));
  // 足した要素: 持ち主(位置は変わらない)の所有するもののうち、書き足した宣言の始まりから始まるもの
  const pos0 = positionsOf(analysis.tree), posA = positionsOf(after.tree);
  const ownerPos = pos0.get(owner);
  let ownerA = null;
  for (const [e, p] of posA) if (p === ownerPos) { ownerA = e; break; }
  const memA = ownerA?.owned.find(c => c.start === ins.declAt);
  const elA = memA?.related[0];
  if (EDIT18.E1) {
    // 足した要素と、同じ名前空間のほかのメンバーの組ごとに判定する(GR18 の E1。設計書 8 章)
    const clash = elA ? s2Clash(after, out, [elA]) : [];
    if (clash.length) return reject('S2', `名前「${name}」が、同じ名前空間のほかのメンバーと区別できない(S2)`, clash);
  } else {
    const s2 = (a) => a.semantic.filter(x => x.item === 'S2').length;
    if (s2(after) > s2(analysis)) return reject('S2', `名前「${name}」が、同じ名前空間のほかのメンバーと区別できない(S2)`, s2Details(after.semantic));
  }
  if (after.semantic.length > analysis.semantic.length) return revert('意味エラーが増える', after.semantic.map(x => `${x.item} ${x.message}`));
  const unchecked = (a) => a.model.refs.filter(r => r.status === 'unchecked').length;
  if (unchecked(after) > unchecked(analysis)) return revert('未検査の参照が増える');
  if (!memA || !elA) return revert('書き足した宣言が、持ち主のメンバーとして読めない');
  const prefix = posA.get(memA);
  const d = diffDumps(modelDump(analysis), modelDump(after));
  const outside = (k) => !k.startsWith(prefix);
  const bad = [...d.elements.map(x => `${x.pos} ${x.field}: ${x.before} → ${x.after}`), ...d.removed.map(x => `${x} がなくなる`), ...d.added.filter(outside).map(x => `${x} が増える`),
    ...d.refs.filter(x => outside(x.key)).map(x => `${x.key}: ${x.before?.status} ${x.before?.target} → ${x.after?.status} ${x.after?.target}`)];
  if (bad.length) return revert('モデルの差分が、足した要素とその中身だけでない', bad.slice(0, 5));
  // 書き足した参照が、選んだ要素に解決する(区切りごと)
  const id = (t) => !t ? null : t.builtin ? `builtin:${t.qname}` : t.virtual ? `virtual:${posA.get(t.of)}` : posA.get(t);
  const want = (e) => !e ? null : e.virtual ? `virtual:${pos0.get(e.of)}` : pos0.get(e);
  const newRefs = after.model.refs.filter(r => posA.get(r.node)?.startsWith(prefix)).sort((a, b) => a.start - b.start);
  const used = new Set();
  let from = -1;
  for (const w of written) {
    const r = newRefs.find(h => !used.has(h) && h.start > from && h.segments.length === w.names.length && h.segments.every((s, i) => s.name === w.names[i]));
    if (!r) return revert(`書き足した${w.what}「${w.text}」の参照が見つからない`);
    used.add(r); from = r.start;
    const goal = w.target ?? w.path[w.path.length - 1];
    if (r.status !== 'resolved' || id(r.target) !== want(goal)) return revert(`書き足した${w.what}「${w.text}」が選んだ要素に解決しない`, [`${r.status} ${id(r.target)}`]);
    for (let i = 0; i < w.path.length; i++) if (id(r.segments[i].target) !== want(w.path[i])) return revert(`書き足した${w.what}「${w.text}」の ${i + 1} 番目の区切りが選んだ要素に解決しない`);
  }
  return { ok: true, text: out, edits: ins.edits, added: { start: elA.start, end: elA.end, kind: elA.kind } };
}

// 名前と持ち主の共通の確かめ
function precheck({ analysis, owner, name }, need) {
  if (!analysis?.ok) return reject('syntax', 'テキストに構文エラーがある間は、足せない');
  if (!owner || owner.builtin || owner.virtual || owner.end <= owner.start) return reject('not-user', '内蔵する表の項目や暗黙の要素には足せない');
  if (!need(owner)) return reject('not-owner', 'この種類の要素には足せない');
  if (name !== undefined) {
    if (typeof name !== 'string' || name === '') return reject('empty', '名前が空');
    if (unwritable(name)) return reject('unwritable', '名前に、テキストに書けない制御文字が含まれる');
  }
  return null;
}
// 型の書き方(なければ null)と、確かめる参照
function typeRef(analysis, ns, type, kind, what, text = null) {
  if (!type) return { written: null, refs: [] };
  const { model, tree } = analysis;
  if (!user(type) || !model.conforms(type.kind, kind)) return reject('unnamed-type', `${what}の型が、利用者のモデルの${kind === 'PortDefinition' ? 'ポート' : kind === 'InterfaceDefinition' ? 'インターフェース' : '部品'}の定義でない`);
  const w = typeWriting(model, tree, ns, type, text);
  if (!w) return reject('unnamed-type', `${what}の型「${nameOf(model, type) ?? '(名前なし)'}」は、書き足す場所から名前で指せない`);
  if (!w.usable) return reject(w.code, `書き足す参照に、未検査・曖昧・D3 の印のものがある: ${w.reason}`);
  const names = w.written.split('::').length;
  const segs = [];
  for (let e = type, k = 0; k < names; k++, e = model.parentNamespaceOf(e)) segs.unshift(e);
  return { written: w.written, refs: [{ what: '型', text: w.written, names: segs.map(e => nameOf(model, e)), path: segs }] };
}

export function addPart({ text, analysis, owner, name, type = null }, opts = {}) {
  const pre = precheck({ analysis, owner, name }, (o) => isPartOwner(analysis.model, o) || isPackage(analysis.model, o));
  if (pre) return pre;
  const t = typeRef(analysis, owner, type, 'PartDefinition', '部品', text);
  if (!t.refs) return t;
  const decl = `part ${writtenName(name)}${t.written ? ` : ${t.written}` : ''};`;
  return insertAndCheck({ text, analysis, owner, decl, name, refs: t.refs }, opts);
}

export function addPort({ text, analysis, owner, name, type = null, conjugated = false, direction = '' }, opts = {}) {
  const pre = precheck({ analysis, owner, name }, (o) => isPartOwner(analysis.model, o));
  if (pre) return pre;
  if (!DIRECTIONS.has(direction ?? '')) return reject('no-form', `向き「${direction}」は書けない(なし・in・out・inout)`);
  const t = typeRef(analysis, owner, type, 'PortDefinition', 'ポート', text);
  if (!t.refs) return t;
  if (conjugated && !t.written) return reject('no-form', '型のないポートは共役にできない');
  // 共役ポートの型の参照は、共役ポート定義(暗黙の要素)に解決する(区切りはポートの定義に解決する。設計書 6.2 節)
  if (conjugated) t.refs[0].target = { virtual: true, of: type };
  const decl = `${direction ? `${direction} ` : ''}port ${writtenName(name)}${t.written ? ` : ${conjugated ? '~' : ''}${t.written}` : ''};`;
  return insertAndCheck({ text, analysis, owner, decl, name, refs: t.refs }, opts);
}

// 接続を書き足す場所の、端の並びの中の位置(なければ -1): 図で外側からたどった箱のうち、2 つの端に共通で、持ち主が図で外側の箱の
// 要素であるもの(受け継いで描いた箱でないもの)の、最も内側の部品の定義・使用
function ownerIndex(model, ends) {
  let k = -1;
  for (let i = 0; i < Math.min(ends[0].length, ends[1].length) - 1; i++) { // 端そのものは書き足す場所にしない
    if (ends[0][i] !== ends[1][i]) break;
    if (i > 0 && model.parentNamespaceOf(ends[0][i]) !== ends[0][i - 1]) break; // 受け継いで描いた箱とその中
    if (isPartOwner(model, ends[0][i])) k = i;
  }
  return k;
}
// 接続を書き足す場所(画面が、インターフェースの定義の候補を typeCandidates で選ぶのに使う)。なければ null
export function connectionOwner(analysis, ends) {
  if (!analysis?.ok || !Array.isArray(ends) || ends.length !== 2 || ends.some(p => !Array.isArray(p) || !p.length)) return null;
  const k = ownerIndex(analysis.model, ends);
  return k < 0 ? null : ends[0][k];
}

export function addConnection({ text, analysis, ends, form = 'connect', name = null, type = null }, opts = {}) {
  if (!analysis?.ok) return reject('syntax', 'テキストに構文エラーがある間は、足せない');
  const { model } = analysis;
  if (form !== 'connect' && form !== 'interface') return reject('no-form', `形「${form}」は書けない(connect か interface)`);
  if (!Array.isArray(ends) || ends.length !== 2 || ends.some(p => !Array.isArray(p) || !p.length)) return reject('no-form', '端は 2 つ選ぶ');
  const tip = ends.map(p => p[p.length - 1]);
  if (tip.some(e => !user(e) || !(model.conforms(e.kind, 'PortUsage') || model.conforms(e.kind, 'PartUsage')))) return reject('not-owner', '端はポートか部品にする');
  if (ends[0].length === ends[1].length && ends[0].every((e, i) => e === ends[1][i])) return reject('same-end', '2 つの端が同じ');
  const k = ownerIndex(model, ends);
  if (k < 0) return reject('no-owner', '2 つの端をともに入れ子に持つ部品の定義・使用が図にない');
  const owner = ends[0][k];
  if (name !== null && name !== undefined && name !== '') {
    if (form !== 'interface') return reject('no-form', 'connect の形には名前を付けない(名前を付けるのは interface の形)');
    if (unwritable(name)) return reject('unwritable', '名前に、テキストに書けない制御文字が含まれる');
  } else name = null;
  // 端: 書き足す場所からの特徴の連鎖。区切りの名前は要素の名前(実効の名前を含む)
  const refs = [];
  const chains = [];
  for (const p of ends) {
    const segs = p.slice(k + 1);
    const names = segs.map(e => nameOf(model, e));
    if (names.some(n => n === undefined || n === null || n === '')) return reject('unnamed-end', '端の連鎖に名前のない要素があり、名前で指せない');
    const r = model.resolveFrom(owner, names);
    const chainText = names.map((n, i) => declaredWriting(text, model, segs[i], n)).join('.');
    if (r.status !== 'resolved' || r.shadow) {
      if (r.status === 'unchecked' && !r.segTargets.some(Boolean)) return reject('unnamed-end', `端「${chainText}」は、書き足す場所から名前で指せない`);
      if (r.status === 'resolved' || r.status === 'ambiguous') return reject('unchecked-refs', `書き足す参照に、未検査・曖昧・D3 の印のものがある: 端「${chainText}」が${D3(r)}`);
    }
    if (r.status !== 'resolved' || r.segTargets.length !== segs.length || r.segTargets.some((t, i) => t !== segs[i])) return reject('unnamed-end', `端「${chainText}」は、書き足す場所から選んだ要素を名前で指せない`);
    chains.push(chainText);
    // 特徴の連鎖は区切りごとに 1 つの参照(FeatureChaining)、区切りが 1 つなら ReferenceSubsetting の参照
    if (names.length === 1) refs.push({ what: '端', text: chainText, names, path: segs });
    else names.forEach((n, i) => refs.push({ what: '端の区切り', text: chainText, names: [n], path: [segs[i]] }));
  }
  let decl;
  if (form === 'connect') decl = `connect ${chains[0]} to ${chains[1]};`;
  else {
    if (!type) return reject('no-form', 'interface の形には、インターフェースの定義を選ぶ');
    const t = typeRef(analysis, owner, type, 'InterfaceDefinition', 'インターフェース', text);
    if (!t.refs) return t;
    refs.unshift(...t.refs);
    decl = `interface ${name !== null ? `${writtenName(name)} ` : ''}: ${t.written} connect ${chains[0]} to ${chains[1]};`;
  }
  return insertAndCheck({ text, analysis, owner, decl, name: name ?? '', refs }, opts);
}
