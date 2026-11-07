// 画面で選んでいる範囲を view としてテキストに書き足すコマンドの本体(GR15 指示書 3.4 節、設計書 5 章)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。Node.js の検査(tests/edit/run.mjs)からも、画面(src/app/worker.js)からも呼ぶ。
//
// appendCheck({ analysis, scope, view }) → null(押せる)か { code, reason }(押せない理由)。書き足す前の拒否の判定だけを行う
//   (テキストを解析し直さないので軽い)。画面の「view を書き足す」のボタンを押せるかに使う。名前が解決しないことは、押した後に分かる
// appendView({ text, analysis, scope, view }, opts) → { ok: true, text, edits, viewName, viewQname } | { ok: false, reverted, code, reason, details }
//   scope は範囲の要素(構文木の要素。根の名前空間は tree そのもの)、view は画面のビューの値(VIEW_DEFS のキー)。analysis は
//   src/edit/index.js の analyze(text) の結果。
//   code: syntax(構文エラーがある間)、scope-is-view(範囲が view)、unnamed(名前で指せない範囲。根の名前空間・名前のない要素や、
//   途中に名前のない名前空間があるもの、書いた名前が範囲の要素に解決しないもの)、no-view(ビューの値が違う)、戻したもの: revert
//
// 書き足す形: view 名前 : StandardViewDefinitions::ビューの定義 { expose 範囲::**; }。すべてのビューで同じ形(GR15 の V3。設計書 5 章 v15.3。
//   P10 の V2 では一般ビューだけ expose 範囲::*; にしていた)
// 書き足す場所: 範囲の要素の持ち主のパッケージ(範囲がパッケージなら、その持ち主のパッケージ)の、最後のメンバーの後ろ。最後の
//   メンバーと同じ行の後ろが空白と注(//)だけなら、その行の末尾。持ち主のパッケージがなく根の名前空間なら、ファイルの末尾。
//   字下げは、最後のメンバーの行の字下げに合わせる。
// 名前: 範囲の名前 +「の」+ ビューの日本語名。書き足す場所の名前空間に同じ名前(所有するメンバーと見えるメンバーの名前・短い名前)が
//   あれば、末尾に 2、3、… を付ける。引用符は名前の変更と同じ規則(src/edit/index.js の writtenName)。
// 範囲の名前: 書き足す場所の名前空間から範囲の要素までの名前(宣言した名前、短い名前、実効の名前の順)を :: でつないだもの。それが範囲の要素に解決しなければ、根の名前空間
//   からの修飾名を試す。どちらも解決しなければ名前で指せない範囲とする。
// 確かめ: 書き足した後のテキストを解析し直し、構文エラーがなく、書き足した view の expose の範囲の名前が範囲の要素に解決し、
//   モデルの差分(src/edit/index.js の modelDump・diffDumps)が足した view とその中身だけであること。満たさなければ書き足す前に戻す。

import { EDIT18, analyze, writtenName, declaredWriting, modelDump, diffDumps, positionsOf, folderScope, fileOfRange } from './index.js';
import { restIsNote } from './add.js';

// 画面のビューの値 → [標準のビューの定義(SysML 2.0 9.2.20.2 節), 「ビュー」の選択欄の表示名]
export const VIEW_DEFS = {
  general: ['GeneralView', '一般ビュー'],
  interconnection: ['InterconnectionView', '相互接続ビュー'],
  'action-flow': ['ActionFlowView', 'アクションフロービュー'],
  'state-transition': ['StateTransitionView', '状態遷移ビュー'],
  sequence: ['SequenceView', 'シーケンスビュー'],
  grid: ['GridView', 'グリッドビュー'],
};

export function appendCheck({ analysis, scope, view }) {
  const r = appendView({ text: '', analysis, scope, view }, { checkOnly: true });
  return r ? { code: r.code, reason: r.reason } : null;
}

export function appendView({ text, analysis, scope, view }, opts = {}) {
  // 要素の名前: 宣言した名前、なければ短い名前、なければ実効の名前(名前を書かない再定義 :>> x の x など。KerML 1.0 8.3.3.3.4 の
  // effectiveName。src/model の namesOf)。どれもなければ名前で指せない
  const nameOf = (e) => e.name ?? e.shortName ?? (e === analysis?.tree ? undefined : analysis?.model.namesOf(e).name ?? undefined);
  const reject = (code, reason, details = []) => ({ ok: false, reverted: false, code, reason, details });
  if (!analysis?.ok) return reject('syntax', 'テキストに構文エラーがある間は、view を書き足せない');
  const def = VIEW_DEFS[view];
  if (!def) return reject('no-view', `ビュー「${view}」の view の定義がない`);
  const { tree, model } = analysis;
  if (!scope) return reject('unnamed', '範囲がない');
  if (model.conforms(scope.kind, 'ViewUsage')) return reject('scope-is-view', '範囲が view なので、書き足さない');
  if (scope === tree) return reject('unnamed', '根の名前空間は名前で指せないので、view を書き足せない');
  if (nameOf(scope) === undefined) return reject('unnamed', '名前のない要素は名前で指せないので、view を書き足せない');
  // 書き足す場所の名前空間(持ち主のパッケージか根の名前空間)
  const isPkg = (e) => e === tree || model.conforms(e.kind, 'Package');
  let ns = model.parentNamespaceOf(scope);
  while (ns && !isPkg(ns)) ns = model.parentNamespaceOf(ns);
  ns ??= tree;
  // 範囲の名前(書き足す場所から)と、根の名前空間からの修飾名
  const pathFrom = (top) => {
    const segs = [];
    for (let e = scope; e && e !== top; e = model.parentNamespaceOf(e)) { if (e === tree) return null; const n = nameOf(e); if (n === undefined) return null; segs.unshift(declaredWriting(text, model, e, n)); }
    return segs.join('::');
  };
  const paths = [...new Set([pathFrom(ns), ns === tree ? null : pathFrom(tree)].filter(Boolean))];
  if (!paths.length) return reject('unnamed', '範囲までの途中に名前のない名前空間があり、名前で指せないので、view を書き足せない');
  if (opts.checkOnly) return null;
  // フォルダのとき(GR20 の F。設計書 9.4 節)、根の名前空間に書き足すなら、範囲の要素のファイルの根の名前空間(そのファイルの末尾)に書き足す
  const F = opts.folder ?? null;
  const fk = F ? fileOfRange(F, scope.start, scope.end) : -1;
  const fileRoot = F && ns === tree && fk >= 0 ? tree.forestFiles?.[fk]?.root ?? null : null;
  if (F && ns === tree && !fileRoot) return reject('unnamed', '範囲の要素のファイルが見つからない');
  const nsOwned = fileRoot ? fileRoot.owned : ns.owned;
  // view の名前
  const taken = new Set();
  const members = nsOwned.filter(c => c.end > c.start);
  const add = (e) => { if (!e) return; if (e.name !== undefined) taken.add(e.name); if (e.shortName !== undefined) taken.add(e.shortName); };
  for (const m of members) for (const e of [m, ...m.related]) add(e);
  if (ns !== tree) for (const m of model.visibleMembershipsOf(ns, { includeAll: true }).members) add(m.element);
  const base = `${nameOf(scope)}の${def[1]}`;
  let vname = base;
  for (let k = 2; taken.has(vname); k++) vname = `${base}${k}`;
  // 書き足す場所と字下げ
  const last = members[members.length - 1];
  const lineStart = (at) => { let i = at; while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--; return i; };
  let at, indent, lead, tail;
  if (ns === tree) {
    // フォルダのときは、範囲の要素のファイルの末尾と、そのファイルのテキストで改行の形を決める
    const ftext = fileRoot ? F.files[fk].text : text;
    at = fileRoot ? F.files[fk].end : text.length;
    indent = last ? /^[ \t]*/.exec(text.slice(lineStart(last.start)))[0] : '';
    const nl = /\r\n|\r|\n/.exec(ftext)?.[0] ?? '\n';
    const endsNl = /(\r\n|\r|\n)$/.test(ftext);
    lead = endsNl ? '' : nl; tail = endsNl ? nl : '';
  } else {
    if (!last) return reject('unnamed', '書き足す場所のパッケージにメンバーがない');
    indent = /^[ \t]*/.exec(text.slice(lineStart(last.start)))[0];
    const eol = (() => { let i = last.end; while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++; return i; })();
    const rest = text.slice(last.end, eol);
    // 行の残りが空白と 1 行の注だけのときだけ、行の終わりに書き足す。閉じていない //* の注は次の行に続くので含めない(GR18 の E3。
    // src/edit/add.js の restIsNote と同じ判定)
    at = (EDIT18.E3 ? restIsNote(rest) : /^\s*(\/\/.*)?$/.test(rest)) ? eol : last.end;
    lead = /\r\n|\r|\n/.exec(text)?.[0] ?? '\n'; tail = '';
  }
  const before = modelDump(analysis);
  const pos0 = positionsOf(tree);
  const nsPos = pos0.get(fileRoot ?? ns), scopePos = pos0.get(scope);
  const newPrefix = `${nsPos}o${nsOwned.length}`;
  const scopeOpts = folderScope(opts, [{ start: at, end: at }], scope.start);
  if (scopeOpts.reject) return scopeOpts.reject;
  let lastFail = null;
  for (const p of paths) {
    const decl = `view ${writtenName(vname)} : StandardViewDefinitions::${def[0]} { expose ${p}::**; }`;
    const ins = `${lead}${indent}${decl}${tail}`;
    const out = text.slice(0, at) + ins + text.slice(at);
    const after = analyze(out, scopeOpts.opts);
    if (!after.ok) { lastFail = { reverted: true, reason: '構文エラーになる', details: after.errors.map(e => `${e.line} 行 ${e.col} 列 ${e.message}`) }; continue; }
    const now = modelDump(after);
    const exp = now.refs.filter(r => r.key.startsWith(newPrefix) && /\|importedNamespace\||\|importedMembership\|/.test(r.key));
    if (!exp.length || exp.some(r => r.status !== 'resolved' || r.target !== scopePos)) { lastFail = { reverted: false, code: 'unnamed', reason: `書いた範囲の名前「${p}」が範囲の要素に解決しない` }; continue; }
    const d = diffDumps(before, now);
    const outside = (k) => !k.startsWith(newPrefix);
    const bad = [...d.elements.map(x => `${x.pos} ${x.field}`), ...d.removed.map(x => `${x} がなくなる`), ...d.added.filter(outside).map(x => `${x} が増える`),
      ...d.refs.filter(x => outside(x.key)).map(x => `${x.key}: ${x.before?.status} ${x.before?.target} → ${x.after?.status} ${x.after?.target}`)];
    if (bad.length) return { ok: false, reverted: true, code: 'revert', reason: '書き足した後の確かめで戻した: モデルの差分が、足した view とその中身だけでない', details: bad.slice(0, 5) };
    const qn = (e) => { const s = []; for (let x = e; x && x !== tree; x = model.parentNamespaceOf(x)) s.unshift(nameOf(x) ?? ''); return s.join('::'); };
    return { ok: true, text: out, edits: [{ start: at, end: at, text: ins }], viewName: vname, viewQname: ns === tree ? vname : `${qn(ns)}::${vname}` };
  }
  if (lastFail?.reverted) return { ok: false, reverted: true, code: 'revert', reason: `書き足した後の確かめで戻した: ${lastFail.reason}`, details: lastFail.details ?? [] };
  return reject('unnamed', `${lastFail?.reason ?? '範囲の名前が解決しない'}ので、名前で指せない範囲として書き足さない`);
}
