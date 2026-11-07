// 図からの編集の本体(GR15 指示書 3.3 節・3.4 節。設計書 8 章・5 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
// Node.js の検査(tests/edit/run.mjs)からも、画面(src/app/worker.js)からも呼ぶ。
//
// analyze(text, opts) → { ok, errors, tree, model, semantic }
//   解析・名前解決・意味エラーの検査をまとめて行う。opts.d3Ascii・opts.d3Scope は名前解決に渡す(src/model/resolve.js の D3_ASCII_NAMES・D3_SCOPE)
// modelDump(a) → { elements: [{ pos, kind, owner, name, shortName }], refs: [{ key, status, target }] }
//   モデルの差分の書き出し(設計書 10 章の「図からの編集」)。要素は構文木の中の位置(owned・related の添字の並び)で指し、
//   参照は持ち主の要素の位置・属性名・添字で指す。解決先は利用者のモデルの要素の位置か、内蔵する表の修飾名
// diffDumps(before, after) → { elements: [{ pos, field, before, after }], added, removed, refs: [{ key, before, after }] }
// writtenName(name) → テキストに書く形(設計書 8 章の引用符の規則)
// renameElement({ text, analysis, element, which, newName }, opts) → { ok: true, text, edits } | { ok: false, reverted, code, reason, details }
//   名前の変更(設計書 8 章の段階 1)。which は 'name' か 'shortName'。analysis は analyze(text) の結果。
//   reverted が true のものは、書き換えた後の確かめで書き換える前に戻したもの(検査では不合格)。false は実行前に拒否したもの。
//   code は拒否の理由の分類。8 章の条件に当たるもの: syntax(構文エラーがある間)、not-user(内蔵する表の項目・暗黙の要素)、
//   undeclared(名前を宣言していない要素)、empty(空の名前)、unchecked-refs(参照しうる箇所に未検査・曖昧・D3 の印の参照)、
//   S2(区別できなくなる)。それ以外: same(名前が変わらない)、unwritable(書けない制御文字)、no-token(宣言の字句が見つからない)、
//   戻したもの: revert
// 書き足すコマンド(appendView)は src/edit/view.js、追加(段階 2)は src/edit/add.js、削除(段階 3)は src/edit/remove.js
//
// GR20 の F(設計書 8 章・9.4 節の段階 A): フォルダを開いているときは、analysis を src/model/files.js の analyzeFiles の結果とし、
// text をそのつないだテキスト、opts.folder を folderOf(analysis) にして呼ぶ。書き換える箇所(テキストの範囲)がすべて 1 つのファイルの
// 中にある操作だけを行い、ほかのファイルも書き換える操作は実行しない(folderScope。code 'other-file')。書き換えた後の確かめの解析
// (analyze)は、書き換えたファイルを差し替えた全ファイルの並びで行う。拒否の理由の箇所は「相対パス 行 列」で書く。opts.folder が
// なければ(1 つのテキスト)今のまま

import { parse } from '../parser/index.js';
import { makeLexer, unquote } from '../parser/lexer.js';
import grammar from '../parser/grammar_table.js';
import { resolveNames } from '../model/index.js';
import { analyzeFiles } from '../model/files.js';
import { checkSemantics, s2PairsOf } from '../model/semantic.js';

// GR15 の項目の切り替え(GR15 指示書 4 章)。ここ 1 か所で切り替える。画面(src/app)は、入れた項目の操作だけを出す。
//   E  名前の変更(3.3 節)。P3 では指示書 4 章の基準のうち「書き換え後の確かめで戻した操作 0 件」を満たさず入れなかった
//      (reports/GR15/P3_E_*.md)。P9 で、名前を書かない再定義の特徴を名前で指す参照を書き換える箇所に足し(E2。sameNamed)、基準を
//      満たしたので入れた(reports/GR15/P9_E2_*.md)
//   V  範囲を view として書き足すコマンド(3.4 節。src/edit/view.js)。基準を満たしたので入れた(reports/GR15/P4_V_*.md)
export const EDIT15 = { E: true, V: true };
// GR16 の項目の切り替え(GR16 指示書 3.1 節・4 章)。ここ 1 か所で切り替える。画面(src/app)は、入れた項目の操作だけを出す。
//   A  部品・ポートの追加と、相互接続ビューでの接続の追加(設計書 8 章の段階 2。src/edit/add.js)。P1 で指示書 4 章の基準を満たし
//      (reports/GR16/P1_A_*.md)、P3 で画面と一緒に入れた
//   X  削除(設計書 8 章の段階 3。src/edit/remove.js)。P2 では基準を満たさず(reports/GR16/P2_X_*.md)、P2b で暗黙のつながり
//      T・R・P を既定で入れて満たした(reports/GR16/P2b_X_*.md)。P3 で画面と一緒に入れた
export const EDIT16 = { A: true, X: true };
// GR17 の項目の切り替え(GR17 指示書 3.2 節・3.3 節)。ここ 1 か所で切り替える。
//   Q  すでにある要素を指す名前を書き足すとき(追加の型・接続の端、view の範囲)は、その要素の宣言の書き方(引用符の有無)に合わせる
//      (設計書 8 章 v17.1。declaredWriting)
//   M  S2 で拒否したときの説明で、同じ文は 1 回だけ出す(名前の変更と追加。s2Details)
//   E3 名前の変更で一緒に名前が変わる要素を、名前を書かない再定義だけから、実効の名前(KerML 1.0 の effectiveName)を受け継ぐ要素
//      全般(variant・perform・要求の制約・遷移の受け取りの引数を含む)に広げる(設計書 8 章 v17.2、GR17 指示書 v17.2 の 3.1 節。
//      sameNamed。src/model/resolve.js の namingFeatureOf)
export const EDIT17 = { Q: true, M: true, E3: true };
// GR18 の項目の切り替え(GR18 指示書 2.2 節)。
//   E1 名前の変更と追加の S2 を、意味エラーの件数の増減でなく、名前を変える(足す)要素と同じ名前空間のほかのメンバーの組ごとに
//      判定する(設計書 8 章 v18.0。s2Clash)
//   E2 削除の後に選ぶ持ち主を、消した後の木で、原文の範囲から求める(src/edit/remove.js)
//   E3 view を書き足す場所で、閉じていない //* の注の中に書き足さない(src/edit/view.js。add.js の restIsNote と同じ判定)
//   E7 削除を拒否する理由の一覧で、expose の参照を「expose」と出す(src/edit/remove.js)
export const EDIT18 = { E1: true, E2: true, E3: true, E7: true };
// GR21 の項目の切り替え(GR21 指示書 3.5 節。設計書 8 章・9.4 節の段階 B)。
//   X  フォルダを開いているとき、名前の変更と削除を、複数のファイルにまたがっても行う(folderScope の multi)。8 章の前の検査と
//      後の確かめは全ファイルで行い、満たさなければすべてのファイルを書き換え前に戻す(analyzeFolderText が書き換えたすべてのファイルを
//      差し替えて解析する)。切れば GR20 の段階 A(ほかのファイルも書き換える操作は理由を出して行わない)に戻る。追加と view の書き足しは、
//      もともと 1 つのファイルに収まるので変えない
export const EDIT21 = { X: true };
// 書き換えた後の解析 after で、要素の並び els(after の木の要素)のどれかが、同じ名前空間のほかのメンバーと区別できない組
// (GR18 の E1)。→ [文](なければ空)
export function s2Clash(after, text, els) {
  const pairs = s2PairsOf(after.tree, after.model, text, new Set(els));
  const nm = (e) => { const n = after.model.namesOf(e); return n?.name ?? n?.shortName ?? '(名前なし)'; };
  // フォルダのときは、ファイルごとの根の名前空間も「根の名前空間」とする(GR20 の F)
  const isRoot = (ns) => ns === after.tree || !!after.tree.forestRoots?.includes(ns);
  return [...new Set(pairs.map(p => `「${nm(p.element)}」と「${nm(p.other)}」(${isRoot(p.ns) ? '根の名前空間' : `「${nm(p.ns)}」`}の中)`))];
}
export const KEYWORDS = new Set(grammar.keywords);
let lexer = null;
export const tokensOf = (text) => { lexer ??= makeLexer({ keywords: grammar.keywords, symbols: grammar.symbols }); const r = lexer(text); return r.ok ? r.tokens : null; };

export function analyze(text, opts = {}) {
  if (opts.folder) return analyzeFolderText(text, opts);
  const p = parse(text);
  if (!p.ok) return { ok: false, errors: p.errors, tree: null, model: null, semantic: null };
  const model = resolveNames(p.tree, text, { ...(opts.d3Ascii === undefined ? {} : { d3Ascii: opts.d3Ascii }), ...(opts.d3Scope === undefined ? {} : { d3Scope: opts.d3Scope }) });
  return { ok: true, errors: [], tree: p.tree, model, semantic: checkSemantics(p.tree, model, text) };
}

// ---- フォルダ(GR20 の F)
// フォルダの解析(analyzeFiles の結果)から、図からの編集に渡す opts.folder を作る
export const folderOf = (a) => (a && !a.single ? { files: a.files.map(f => ({ path: f.path, text: f.text, base: f.base, end: f.end })), text: a.text } : null);
// つないだテキストの範囲 [start, end] を含むファイルの番号(なければ -1)
export function fileOfRange(folder, start, end = start) {
  for (let k = 0; k < folder.files.length; k++) { const f = folder.files[k]; if (f.base <= start && end <= f.end) return k; }
  return -1;
}
// 書き換え edits([{ start, end }])が 1 つのファイルに収まるか。収まれば { opts }(確かめの解析のために、書き換えるファイルの番号を
// opts.folder.editFile に入れたもの)、収まらなければ { reject }(ほかのファイルの相対パスを理由に書く)。main は操作の主なファイルを
// 決める位置(名前を変える要素の宣言など)。opts.folder がなければ { opts } をそのまま返す。
// multi が真(GR21 の X。名前の変更と削除)なら、書き換えがどれもファイルの境目をまたがない限り、複数のファイルにまたがってもよい。
// そのときは opts.folder.editFiles(書き換えるファイルの番号の並び)と editDeltas(ファイルごとの長さの差。edits の text で求める)を入れる
export function folderScope(opts, edits, main, multi = false) {
  if (!opts?.folder) return { opts };
  const F = opts.folder;
  const home = fileOfRange(F, main ?? edits[0]?.start ?? 0);
  const touched = new Set(edits.map(e => fileOfRange(F, e.start, e.end)));
  if (touched.size === 1 && touched.has(home) && home >= 0) return { opts: { ...opts, folder: { ...F, editFile: home } } };
  if (multi && EDIT21.X && home >= 0 && !touched.has(-1)) {
    const editDeltas = {};
    for (const e of edits) { const k = fileOfRange(F, e.start, e.end); editDeltas[k] = (editDeltas[k] ?? 0) + (e.text ?? '').length - (e.end - e.start); }
    return { opts: { ...opts, folder: { ...F, editFile: home, editFiles: [...touched].sort((a, b) => a - b), editDeltas } } };
  }
  const others = [...touched].filter(k => k !== home).map(k => (k < 0 ? '(ファイルの境目をまたぐ範囲)' : F.files[k].path));
  const details = edits.filter(e => fileOfRange(F, e.start, e.end) !== home).slice(0, 20).map(e => where(F.text, e, F));
  return { reject: { ok: false, reverted: false, code: 'other-file', reason: `この操作は、ほかのファイル(${others.join('、')})も書き換えるので、今はできません`, details } };
}
// 書き換えた後のつないだテキスト text を、書き換えたファイル(opts.folder.editFile)だけを差し替えた全ファイルの並びとして解析する。
// 結果は analyze と同じ形に、フォルダの解析(folder)を足したもの
function analyzeFolderText(text, opts) {
  const F = opts.folder;
  const k = F.editFile ?? -1;
  const delta = text.length - F.text.length;
  let files, ok;
  if (F.editFiles) {
    // 複数のファイルにまたがる書き換え(GR21 の X): ファイルごとの長さの差で、書き換えた後のつないだテキストをファイルに分ける。
    // 書き換えないファイルとファイルの間の改行が、書き換える前と同じであることを確かめる
    let shift = 0;
    ok = F.editFiles.length > 0;
    files = F.files.map((f, i) => {
      const d = F.editDeltas[i] ?? 0, s = f.base + shift, e = f.end + shift + d;
      shift += d;
      const t = text.slice(s, e);
      if (!F.editFiles.includes(i) && t !== f.text) ok = false;
      if (i + 1 < F.files.length && text.slice(e, e + 1) !== F.text.slice(f.end, f.end + 1)) ok = false;
      return { path: f.path, text: t };
    });
    if (shift !== delta) ok = false;
  } else {
    files = F.files.map((f, i) => ({ path: f.path, text: i === k ? text.slice(f.base, f.end + delta) : f.text }));
    ok = k >= 0 && text.slice(0, F.files[k].base) === F.text.slice(0, F.files[k].base) && text.slice(F.files[k].end + delta) === F.text.slice(F.files[k].end);
  }
  if (!ok) return { ok: false, errors: [{ line: 1, col: 1, message: '書き換えた箇所が 1 つのファイルに収まらない' }], tree: null, model: null, semantic: null };
  const a = analyzeFiles(files, { resolve: { ...(opts.d3Ascii === undefined ? {} : { d3Ascii: opts.d3Ascii }), ...(opts.d3Scope === undefined ? {} : { d3Scope: opts.d3Scope }) } });
  if (!a.ok) return { ok: false, errors: a.files.flatMap(f => f.errors.map(e => ({ ...e, message: `${f.path}: ${e.message}` }))), tree: null, model: null, semantic: null };
  return { ok: true, errors: [], tree: a.tree, model: a.model, semantic: a.semantic, folderAnalysis: a };
}

// 構文木の要素の位置(根は '/'、子は owned の i 番目 'o<i>'・related の i 番目 'r<i>' をつなげたもの)。
// フォルダの仮の根(src/model/files.js。forestRoots を持つ)なら、i 番目のファイルの根の名前空間を '/f<i>' とし、その中を同じ形で続ける
// (ファイルの最上位の要素を足したり消したりしても、ほかのファイルの要素の位置が変わらないように。GR20 の F)
export function positionsOf(tree) {
  const pos = new Map();
  if (tree.forestRoots) {
    pos.set(tree, '/');
    tree.forestRoots.forEach((root, i) => (function walk(e, s) {
      pos.set(e, s);
      e.owned.forEach((c, j) => walk(c, `${s}o${j}`));
      e.related.forEach((c, j) => walk(c, `${s}r${j}`));
    })(root, `/f${tree.forestFiles.indexOf(tree.forestFiles.find(f => f.root === root))}`));
    return pos;
  }
  (function walk(e, s) {
    pos.set(e, s);
    e.owned.forEach((c, i) => walk(c, `${s}o${i}`));
    e.related.forEach((c, i) => walk(c, `${s}r${i}`));
  })(tree, '/');
  return pos;
}

export function modelDump(a) {
  const pos = positionsOf(a.tree);
  const id = (t) => !t ? null : t.builtin ? `builtin:${t.qname}` : t.virtual ? `virtual:${pos.get(t.of)}` : pos.get(t) ?? '?';
  const elements = [];
  (function walk(e, owner) {
    elements.push({ pos: pos.get(e), kind: e.kind, owner: owner ? pos.get(owner) : null, name: e.name ?? null, shortName: e.shortName ?? null });
    for (const c of e.owned) walk(c, e);
    for (const c of e.related) walk(c, e);
  })(a.tree, null);
  const refs = a.model.refs.map(r => ({ key: `${pos.get(r.node)}|${r.prop}|${r.index ?? ''}`, status: r.status, target: id(r.target) }));
  return { elements, refs };
}

export function diffDumps(b, a) {
  const out = { elements: [], added: [], removed: [], refs: [] };
  const eb = new Map(b.elements.map(x => [x.pos, x])), ea = new Map(a.elements.map(x => [x.pos, x]));
  for (const [p, x] of eb) {
    const y = ea.get(p);
    if (!y) { out.removed.push(p); continue; }
    for (const f of ['kind', 'owner', 'name', 'shortName']) if (x[f] !== y[f]) out.elements.push({ pos: p, field: f, before: x[f], after: y[f] });
  }
  for (const p of ea.keys()) if (!eb.has(p)) out.added.push(p);
  const rb = new Map(b.refs.map(x => [x.key, x])), ra = new Map(a.refs.map(x => [x.key, x]));
  for (const [k, x] of rb) {
    const y = ra.get(k);
    if (!y || x.status !== y.status || x.target !== y.target) out.refs.push({ key: k, before: x, after: y ?? null });
  }
  for (const [k, y] of ra) if (!rb.has(k)) out.refs.push({ key: k, before: null, after: y });
  return out;
}

// 設計書 8 章の引用符: 英字か _ で始まり英数字と _ だけからなり、キーワードでない名前は引用符なし。それ以外は '…' で囲み、
// KerML 1.0 の表 4 のエスケープ列で ' と \ をエスケープする(\b・\f・\t・\n で書ける制御文字も同じ)
const ESC = { "'": "\\'", '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\t': '\\t', '\n': '\\n' };
export function writtenName(name) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !KEYWORDS.has(name)) return name;
  return `'${[...name].map(c => ESC[c] ?? c).join('')}'`;
}
// 要素 element を指す名前 name を書き足すときの書き方(GR17 の Q。設計書 8 章 v17.1): その要素の宣言の書き方(引用符の有無)に合わせる。
// 名前を宣言した要素なら、その宣言の字句(text の中の名前の字句)をそのまま使う。名前を書かない再定義で名前を受け継ぐ特徴は、名前を
// 宣言した元の要素の宣言の字句を使う。宣言の字句が見つからない名前(宣言のない名前)は、writtenName(段階 1 の引用符の規則)
let tokCache = { text: null, tokens: null };
export function declaredWriting(text, model, element, name) {
  if (!EDIT17.Q || text == null || !element || !model) return writtenName(name);
  if (tokCache.text !== text) tokCache = { text, tokens: tokensOf(text) };
  const tokens = tokCache.tokens;
  let e = element;
  for (let k = 0; e && tokens && k < 50; k++) {
    if (e.builtin || e.virtual) break;
    for (const which of ['name', 'shortName']) {
      if (e[which] !== name) continue;
      const r = declarationRange(text, tokens, e, which, model);
      if (r) return text.slice(r.start, r.end);
    }
    if (e.name !== undefined || e.shortName !== undefined) break;
    e = model.redefinitionNamingOf(e);
  }
  return writtenName(name);
}
// S2 で拒否したときの説明(GR17 の M): 意味エラー S2 は、区別できないメンバーのそれぞれに同じ文を出すので、同じ文は 1 回だけにする
export const s2Details = (semantic) => {
  const msgs = semantic.filter(x => x.item === 'S2').map(x => x.message);
  return EDIT17.M ? [...new Set(msgs)] : msgs;
};
// 表 4 のエスケープ列で書けない制御文字(Unicode の Cc。設計書 2.4 節で '…' の中に書けない)を含むか
const unwritable = (name) => [...name].some(c => { const k = c.codePointAt(0); return (k < 0x20 || (k >= 0x7f && k <= 0x9f)) && !ESC[c]; });

// 要素の宣言の名前(which が 'shortName' なら短い名前)の字句の範囲。要素の範囲の字句のうち、子の要素と参照の範囲の外にある、
// 名前が同じ字句(短い名前は < と > の間のもの)の最初のもの
export function declarationRange(text, tokens, element, which, model) {
  const want = element[which];
  if (want === undefined) return null;
  const skip = [...element.owned, ...element.related].filter(c => c.end > c.start).map(c => [c.start, c.end]);
  for (const r of model.refs) if (r.node === element && r.start != null) skip.push([r.start, r.end]);
  const inside = (t) => skip.some(([s, e]) => t.start >= s && t.end <= e);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.start < element.start) continue;
    if (t.start >= element.end) break;
    if (t.kind !== 'NAME' || inside(t) || unquote(t.text) !== want) continue;
    const short = tokens[i - 1]?.text === '<' && tokens[i + 1]?.text === '>';
    if (short === (which === 'shortName')) return { start: t.start, end: t.end };
  }
  return null;
}

const lineCol = (text, at) => { let line = 1, col = 1; for (let i = 0; i < at; i++) { const c = text.charCodeAt(i); if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) { line++; col = 1; } else if (c !== 13) col++; } return { line, col }; };
// 箇所の書き方。フォルダのとき(folder を渡したとき)は「相対パス 行 列」(GR20 の F)
export const where = (text, r, folder = null) => {
  const k = folder ? fileOfRange(folder, r.start, r.end) : -1;
  if (k >= 0) { const f = folder.files[k]; const { line, col } = lineCol(f.text, r.start - f.base); return `${f.path} ${line} 行 ${col} 列「${text.slice(r.start, r.end)}」`; }
  const { line, col } = lineCol(text, r.start);
  return `${line} 行 ${col} 列「${text.slice(r.start, r.end)}」`;
};

export function renameElement({ text, analysis, element, which = 'name', newName }, opts = {}) {
  const reject = (code, reason, details = []) => ({ ok: false, reverted: false, code, reason, details });
  const kindName = which === 'shortName' ? '短い名前' : '名前';
  if (!analysis?.ok) return reject('syntax', 'テキストに構文エラーがある間は、名前を変えられない');
  if (!element || element.builtin || element.virtual) return reject('not-user', '内蔵する表の項目や暗黙の要素の名前は変えられない');
  if (element.end <= element.start) return reject('not-user', '原文に書かれていない暗黙の要素の名前は変えられない');
  const old = element[which];
  if (old === undefined) return reject('undeclared', `${kindName}を宣言していない要素(名前を受け継ぐだけの再定義など)の${kindName}は変えられない`);
  if (typeof newName !== 'string' || newName === '') return reject('empty', `空の${kindName}にはできない`);
  if (newName === old) return reject('same', `${kindName}が変わらない`);
  if (unwritable(newName)) return reject('unwritable', `${kindName}に、テキストに書けない制御文字が含まれる`);
  const tokens = tokensOf(text);
  const decl = tokens && declarationRange(text, tokens, element, which, analysis.model);
  if (!decl) return reject('no-token', `宣言の${kindName}の字句が見つからない`);
  const model = analysis.model;
  const nameOfSeg = (s) => unquote(text.slice(s.start, s.end));
  // 書き換える区切り: その要素に解決した参照の区切り(修飾名・特徴の連鎖の途中を含む)のうち、変えた方の名前で書かれたもの。
  // 名前を宣言せず実効の名前を受け継ぐ要素(名前を書かない再定義 port :>> x { … }、variant、perform など)を何段たどっても元が
  // その要素である特徴は、その要素と一緒に名前が変わるので、その特徴に解決した参照の区切りのうち同じ名前で書かれたものも書き換える
  // (設計書 8 章、GR15 の E2。GR17 の E3 で、名前を書かない再定義だけから実効の名前を受け継ぐ要素全般に広げた)
  const same = sameNamed(analysis.tree, model, element);
  const segs = same.flatMap(t => model.referencesTo(t)).filter(x => nameOfSeg(x) === old);
  // 拒否する条件(設計書 8 章): 書き換える参照と、書き換える名前を参照しうる箇所(書かれた区切りの名前が前の名前か新しい名前と
  // 同じ参照)に、未検査・曖昧・D3 の印の付いた参照があれば実行しない
  const bad = [];
  const isBad = (r) => r.status !== 'resolved' || !!r.shadow;
  const why = (r) => r.status === 'unchecked' ? '未検査' : r.status === 'ambiguous' ? '曖昧' : 'D3 の印(ライブラリの名前に遮られているかもしれない)';
  const F = opts.folder ?? null;
  for (const x of segs) if (isBad(x.ref)) bad.push(`${where(text, x.ref, F)}(書き換える参照が${why(x.ref)})`);
  for (const r of model.refs) {
    if (!isBad(r) || segs.some(x => x.ref === r)) continue;
    const s = r.segments.find(s => s.start != null && (nameOfSeg(s) === old || nameOfSeg(s) === newName));
    if (s) bad.push(`${where(text, r, F)}(${q(nameOfSeg(s))}を参照しうる参照が${why(r)})`);
  }
  if (bad.length) return reject('unchecked-refs', `${kindName}を参照しうる箇所に、未検査・曖昧・D3 の印の付いた参照がある`, bad);
  // 書き換え(後ろから)
  const w = writtenName(newName);
  const edits = [{ start: decl.start, end: decl.end, text: w }, ...segs.map(x => ({ start: x.start, end: x.end, text: w }))]
    .sort((a, b) => b.start - a.start).filter((e, i, A) => i === 0 || A[i - 1].start !== e.start);
  // フォルダのときは、書き換える箇所がすべて名前を変える要素のファイルの中にあるときだけ行う(GR20 の F。設計書 8 章)。GR21 の X では、
  // 複数のファイルにまたがっても行い、確かめは全ファイルで行う(設計書 9.4 節の段階 B)
  const scope = folderScope(opts, edits, decl.start, true);
  if (scope.reject) return scope.reject;
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // 確かめ(設計書 8 章)
  const after = analyze(out, scope.opts);
  const revert = (reason, details = []) => ({ ok: false, reverted: true, code: 'revert', reason: `書き換えた後の確かめで戻した: ${reason}`, details });
  if (!after.ok) return revert('構文エラーになる', after.errors.map(e => `${e.line} 行 ${e.col} 列 ${e.message}`));
  if (EDIT18.E1) {
    // 名前を変える要素と、一緒に名前が変わる要素(位置は書き換えで変わらない)の、書き換えた後の木の要素
    const p0 = positionsOf(analysis.tree), byPos = new Map([...positionsOf(after.tree)].map(([e, p]) => [p, e]));
    const clash = s2Clash(after, out, same.map(e => byPos.get(p0.get(e))).filter(Boolean));
    if (clash.length) return reject('S2', `新しい${kindName}が、同じ名前空間のほかのメンバーと区別できなくなる(S2)`, clash);
  } else {
    const s2 = (a) => a.semantic.filter(x => x.item === 'S2').length;
    if (s2(after) > s2(analysis)) return reject('S2', `新しい${kindName}が、同じ名前空間のほかのメンバーと区別できなくなる(S2)`, s2Details(after.semantic));
  }
  if (after.semantic.length > analysis.semantic.length) return revert('意味エラーが増える', after.semantic.map(x => `${x.item} ${x.message}`));
  const unchecked = (a) => a.model.refs.filter(r => r.status === 'unchecked').length;
  if (unchecked(after) > unchecked(analysis)) return revert('未検査の参照が増える');
  const before = modelDump(analysis), now = modelDump(after);
  const d = diffDumps(before, now);
  const epos = positionsOf(analysis.tree).get(element);
  const okElem = d.elements.length === 1 && d.elements[0].pos === epos && d.elements[0].field === which && d.elements[0].after === newName;
  if (d.added.length || d.removed.length || !okElem) return revert('モデルの差分が、その要素の名前だけでない', d.elements.slice(0, 5).map(x => `${x.pos} ${x.field}: ${x.before} → ${x.after}`));
  if (d.refs.length) return revert('参照の状態か解決先が変わる', d.refs.slice(0, 5).map(x => `${x.key}: ${x.before?.status} ${x.before?.target} → ${x.after?.status} ${x.after?.target}`));
  return { ok: true, text: out, edits: edits.slice().reverse() };
}
const q = (s) => `「${s}」`;
// 要素と、(何段たどっても)その要素から名前を受け継ぐ特徴。EDIT17.E3 なら実効の名前を受け継ぐもの全般(src/model/resolve.js の
// namingFeatureOf。namesOf と同じ求め方)、切れば名前を書かない再定義で受け継ぐものだけ(redefinitionNamingOf。GR15 の E2)
function sameNamed(tree, model, element) {
  const from = new Map();
  (function walk(e) {
    const nf = EDIT17.E3 ? model.namingFeatureOf(e) : model.redefinitionNamingOf(e);
    if (nf) { if (!from.has(nf)) from.set(nf, []); from.get(nf).push(e); }
    e.owned.forEach(walk); e.related.forEach(walk);
  })(tree);
  const out = [element];
  for (let i = 0; i < out.length; i++) for (const f of from.get(out[i]) ?? []) if (!out.includes(f)) out.push(f);
  return out;
}
