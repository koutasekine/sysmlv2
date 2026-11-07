// 解析と描画を行う Web Worker(GR4 指示書 6.2 節、設計書 2.6 節)。DOM を使わない。
//
// 画面(src/app/main.js)との受け渡し:
//   画面 → Worker  { type: 'init' }
//   Worker → 画面  { type: 'init', keywords, symbols }            テキスト欄の色付けに使う予約語と記号
//   画面 → Worker  { type: 'run', id, text, candidateId, view, opening, enabled }
//                  view は選んでいるビュー('interconnection'・'general'・'state-transition'・'action-flow'・'sequence')、enabled はこの HTML で選べるビュー。
//                  opening が true(開く・例・新規・起動のとき)なら、テキストの最初の view の型でビューを決める(GR6 指示書 6 章)
//   Worker → 画面  { type: 'progress', id, stage, done, total }    stage: lex・parse・derive・tree・resolve・candidates・render
//   Worker → 画面  { type: 'result', id, ok, view, candidates, candidate, svg, structure, diagnostics, title, scopeName }
//                  title は図の題(左上の名前のタブの文字)の位置(src/view/pieces.js の figureTitle)、scopeName は範囲の要素の名前
//                  (図・表を 1 つずつ保存するボタンの置き場所とファイル名に使う。GR13 指示書 5 章)
//                  グリッドビュー('grid')では、tables([{ name, header, rows, empty, svg, tsv }])と anchors(表の題の位置)も返す
//   画面 → Worker  { type: 'renameInfo', id, text, src, kind }   図で選んだ要素(原文の範囲 src と種類)の名前と短い名前(GR15 の E)
//   Worker → 画面  { type: 'renameInfo', id, ok, name, shortName, reason }
//   画面 → Worker  { type: 'rename', id, text, src, kind, which, newName }   名前の変更(設計書 8 章の段階 1)
//   Worker → 画面  { type: 'rename', id, ok, edit, reason, details }   edit は書き換えた箇所をすべて含む 1 か所の置き換え { start, end, text }
//                  select は名前を変えた要素の、書き換えた後の { start, end, kind }(画面が選んだままにする。GR18 の W2)
//   GR16 の A・X(設計書 8 章の段階 2・3)。図の要素は原文の範囲と種類 { src, kind } で、接続の端は図の箱の入れ子をたどった並びで渡す。
//   型は、editInfo・connectInfo が返す候補の一覧の番号 typeIndex で渡す(同じテキストなら同じ一覧になる。なしは null)
//   画面 → Worker  { type: 'editInfo', id, text, src, kind, view }   選んだ要素に出す操作
//   Worker → 画面  { type: 'editInfo', id, part, port, connect, del, partTypes, portTypes, reason }   part などは出すかどうか、
//                  partTypes・portTypes は型の候補 [{ written, qname, usable, reason }]
//   画面 → Worker  { type: 'add', id, text, src, kind, op: 'part'|'port', name, typeIndex, conjugated, direction }
//   画面 → Worker  { type: 'connectInfo', id, text, ends }   → { type: 'connectInfo', id, ok, ifaceTypes, reason }
//   画面 → Worker  { type: 'connect', id, text, ends, form, name, typeIndex }
//   Worker → 画面  { type: 'add', id, ok, edit, select, reason, details }   select は書き足した要素の、書き足した後の { start, end, kind }
//   画面 → Worker  { type: 'deletePlan', id, text, src, kind }   → { type: 'deletePlan', id, ok, items, reason, details }
//   画面 → Worker  { type: 'delete', id, text, src, kind }   → { type: 'delete', id, ok, edit, select, reason, details }(select は持ち主)
// 同じテキストで範囲だけを変えたときは、解析と名前解決と意味エラーの検査をやり直さない(前の結果を使う)。
// 意味エラーの検査(src/model/semantic.js、GR5)は名前解決の後に行い、結果を diagnostics.semantic に入れる。意味エラーがあっても図は描く。
// 警告の検査(src/model/warn.js、GR19)も同じく行い、diagnostics.warning に入れる。
// 解析中にテキストが変わったときは、画面がこの Worker を止めて(terminate)、新しい Worker で解析し直す。
// GR20 の F(設計書 9.4 節の段階 A): フォルダを開いているときは、run に files([{ path, text }]。相対パスの符号位置の順)を足し、text には
// 画面が src/app/runner.js の folderKey(files) で作った文字列を入れる(同じファイルの並びかどうかを見るのに使う)。すべてのファイルを
// 1 つのモデルとして解析し(src/model/files.js の analyzeFiles、src/app/prepare.js の prepareFromAnalysis)、結果に folder
// ({ files: [{ path, base, end, ok }] }。base・end はファイルをつないだテキストの中の範囲)と blocked(どれかのファイルに構文エラーが
// あるか)を足す。図の原文の範囲(data-start など)と、図からの編集の select はつないだテキストの中の範囲。診断は、ファイルの相対パスと
// そのファイルの中の行・列を持つ(src/app/diag.js)。図からの編集の要求の text にも同じ文字列を入れる。編集の応答の edit(と appendView の
// edits)には、書き換えるファイルの番号 file と相対パス path を足し、start・end をそのファイルの中の位置にする。ほかのファイルも
// 書き換える操作は、理由を返して行わない(src/edit の folderScope)。どれかのファイルに構文エラーがある間は、図から編集しない
// GR21 の X(設計書 9.4 節の段階 B): 名前の変更と削除は、複数のファイルにまたがっても行う。フォルダのときの rename・delete の応答には、
// edits(書き換えるファイルごとの 1 か所の置き換え [{ file, path, start, end, text }]。start・end はそのファイルの中の位置)と home
// (操作の主なファイル: 名前を変える要素・消す要素のファイルの番号)を足す。edit は home のファイルの置き換え(1 つのファイルなら今のまま)

import { prepareView, renderInterconnection, renderGeneral, renderStateTransition, renderActionFlow, renderSequence, renderTables, tsv } from '../view/index.js';
import { standardViewOf } from '../view/scope.js';
import { figureTitle } from '../view/pieces.js';
import grammar from '../parser/grammar_table.js';
import { checkSemantics } from '../model/semantic.js';
import { checkWarnings } from '../model/warn.js';
import { EDIT15, EDIT16, renameElement } from '../edit/index.js';
import { addTargets, typeCandidates, addPart, addPort, addConnection, connectionOwner } from '../edit/add.js';
import { isDeclared, deletePlan, deleteElement } from '../edit/remove.js';
import { appendView, appendCheck } from '../edit/view.js';
import { buildDiagnostics } from './diag.js';
import { analyzeFiles } from '../model/files.js';
import { prepareFromAnalysis, folderLabels } from './prepare.js';
import { folderOf } from '../edit/index.js';
import { buildOutline } from './outline.js';

// folder はフォルダのときの解析(analyzeFiles の結果)。1 つのテキストのときは null。outline はモデルツリーと参照箇所(GR26。同じテキストなら作り直さない)
let last = { text: null, prepared: null, semantic: null, warnings: null, folder: null, outline: undefined };

// ビューごとの描く関数と候補(GR7 でアクションフロービュー、GR9 でシーケンスビュー、GR10 で一般ビューを足した)
const VIEWS = {
  interconnection: { name: '相互接続', render: renderInterconnection, cands: (p) => p.candidates },
  general: { name: '一般', render: renderGeneral, cands: (p) => p.generalCandidates },
  'state-transition': { name: '状態遷移', render: renderStateTransition, cands: (p) => p.stateCandidates },
  'action-flow': { name: 'アクションフロー', render: renderActionFlow, cands: (p) => p.actionCandidates },
  sequence: { name: 'シーケンス', render: renderSequence, cands: (p) => p.sequenceCandidates },
  grid: { name: 'グリッド', render: renderTables, cands: (p) => p.tableCandidates }, // GR13: グリッドビュー(4 つの表。設計書 3.2 節)
};

// testInternal は検査用の口(GR18 の B2): 解析と名前解決で例外が起きたことにする
function run({ id, text, files = null, candidateId, view = 'interconnection', opening = false, enabled = ['interconnection'], testInternal = false }) {
  const progress = (p) => postMessage({ type: 'progress', id, ...p });
  const internal = [];
  let prepared = null, semantic = null, warnings = null, folder = null;
  if (last.text === text && last.prepared) ({ prepared, semantic, warnings, folder } = last);
  else if (files) {
    // フォルダ(GR20 の F): すべてのファイルを 1 つのモデルとして解析する
    try {
      if (testInternal) throw new Error('検査用の内部エラー');
      folder = analyzeFiles(files, { onProgress: progress });
      prepared = prepareFromAnalysis(folder, progress);
      semantic = folder.semantic; warnings = folder.warnings;
    } catch (e) { internal.push(`解析と名前解決で例外: ${e?.message ?? e}`); folder = null; prepared = null; }
    last = { text, prepared, semantic, warnings, folder, outline: undefined };
  } else {
    try { if (testInternal) throw new Error('検査用の内部エラー'); prepared = prepareView(text, { onProgress: progress }); }
    catch (e) { internal.push(`解析と名前解決で例外: ${e?.message ?? e}`); }
    if (prepared?.ok) {
      try { semantic = checkSemantics(prepared.ctx.tree, prepared.ctx.model, text); }
      catch (e) { internal.push(`意味エラーの検査で例外: ${e?.message ?? e}`); }
      // 警告(GR19 の W1・W2。設計書 9.2 節)。図を止めない
      try { warnings = checkWarnings(prepared.ctx.tree, prepared.ctx.model, text); }
      catch (e) { internal.push(`警告の検査で例外: ${e?.message ?? e}`); }
    }
    last = { text, prepared, semantic, warnings, folder: null, outline: undefined };
  }
  // モデルツリーと参照箇所(GR26 の T・R。設計書 9.5 節)。解析の結果から作る(結果は変えない)。構文エラーで解析できなかったときは、
  // 項目のない木に、構文エラーのあるファイル(1 つのテキストなら '')を付ける
  if (last.outline === undefined) {
    try {
      last.outline = prepared?.ok ? buildOutline(prepared, folder)
        : prepared ? { items: [], roots: [], refs: {}, errorFiles: folder ? folder.files.filter((f) => !f.ok).map((f) => f.path) : [''], other: 0 } : null;
    } catch (e) { internal.push(`モデルツリーの準備で例外: ${e?.message ?? e}`); last.outline = null; }
  }
  const outline = last.outline;
  // フォルダのときの、結果に足すもの(GR20 の F)
  const fx = folder ? { folder: { files: folder.files.map((f) => ({ path: f.path, base: f.base, end: f.end, ok: f.ok })) }, blocked: !folder.ok } : {};
  const dtext = folder ? folder.text : text;
  const dfiles = folder ? folder.files : null;
  if (!prepared) return { id, ok: false, outline, candidates: [], candidate: null, svg: null, structure: null, diagnostics: buildDiagnostics({ text: dtext, files: dfiles, internal }) };
  if (!prepared.ok) return { id, ok: false, ...fx, outline, candidates: [], candidate: null, svg: null, structure: null, diagnostics: buildDiagnostics({ text: dtext, files: dfiles, errors: folder ? [] : prepared.errors }) };
  // 開いたときは、テキストの最初の view の型(StateTransitionView・InterconnectionView・ActionFlowView・SequenceView・GeneralView・GridView)でビューを決める。
  // その view を描く範囲にする。
  // 最初の view の型で決まらないとき(view がない・型が標準のビューでない、「新規」)は、一般ビューにする(仕様書の表 34(SysML 2.0 の
  // 9.2.20.1 節)で、一般ビューがパッケージの既定の区画であるため。GR13 の追加の直し その 3)。この HTML で一般ビューを選べなければ、今のビューのまま。
  // 最初の view の型のビューをこの HTML で選べないときも同じで、その旨を図の診断に出す
  const notices = [];
  if (!enabled.includes(view)) view = enabled[0];
  if (opening) {
    const firstView = prepared.candidates.find((c) => c.kind === 'view');
    const k = firstView ? standardViewOf(prepared.ctx, firstView.el) : null;
    if (VIEWS[k] && enabled.includes(k)) { view = k; candidateId = firstView.id; }
    else {
      if (enabled.includes('general')) view = 'general';
      if (VIEWS[k]) notices.push({ level: 'info', code: 'view-not-enabled', message: `view ${firstView.label.replace(/^view /, '')} の型は${VIEWS[k].name}ビューだが、この HTML ではそのビューを選べないので、${VIEWS[view].name}ビューで表示する`, start: firstView.el.start, end: firstView.el.end });
    }
  }
  const V = VIEWS[view];
  // 範囲を選んでいないとき(ビューを切り替えたときなど)は、型がそのビューの view を先に選ぶ
  if (!candidateId) {
    const m = V.cands(prepared).find((c) => c.kind === 'view' && standardViewOf(prepared.ctx, c.el) === view);
    if (m) candidateId = m.id;
  }
  progress({ stage: 'render', done: 0, total: null });
  let r = { candidate: null, svg: null, structure: null, diagnostics: [] };
  try { r = V.render(prepared, candidateId); }
  catch (e) { internal.push(`描画で例外: ${e?.message ?? e}`); }
  // フォルダのときは、表示が同じになる候補に相対パス(同じなら行も)を付ける(GR22 の B1。src/app/prepare.js の folderLabels)
  const candidates = (folder ? folderLabels(V.cands(prepared), folder.files) : V.cands(prepared)).map((c) => ({ id: c.id, kind: c.kind, label: c.label }));
  // 範囲の要素の名前(ファイル名「元の名前_ビュー_範囲の名前」に使う)。名前のない要素は候補の表示名、根の名前空間は「根の名前空間」
  const cel = r.candidate ? V.cands(prepared).find((c) => c.id === r.candidate.id) : null;
  const scopeName = cel ? (cel.kind === 'root' ? '根の名前空間' : prepared.ctx.nameOf(cel.el) ?? cel.label) : null;
  // 「view を書き足す」のボタンを押せるか(GR15 の V。設計書 5 章・9.1 節)。範囲が view のとき、名前で指せない範囲のときは押せない
  // フォルダで、どれかのファイルに構文エラーがある間は押せない(GR20 の F。設計書 9.4 節)
  const append = !EDIT15.V ? null : !cel ? { enabled: false, reason: '描く範囲がない' }
    : folder && !folder.ok ? { enabled: false, reason: 'どれかのファイルに構文エラーがある' }
    : (() => { const x = appendCheck({ analysis: { ok: true, tree: prepared.ctx.tree, model: prepared.ctx.model }, scope: cel.el, view }); return x ? { enabled: false, reason: x.reason } : { enabled: true, reason: null }; })();
  return { id, ok: true, ...fx, outline, view, candidates, candidate: r.candidate, svg: r.svg, structure: r.structure,
    title: r.svg && view !== 'grid' ? figureTitle(r.svg) : null, scopeName, append, rename: EDIT15.E, edit16: { ...EDIT16 },
    // 表: 保存する表(題を入れない SVG)とタブ区切りの文字、題の位置(GR13 指示書 5 章・6 章)
    ...(view === 'grid' ? { tables: (r.tables ?? []).map((t) => ({ ...t, tsv: t.empty ? '' : tsv(t) })), anchors: r.anchors ?? [] } : {}),
    diagnostics: buildDiagnostics({ text: dtext, files: dfiles, refs: prepared.ctx.model.refs, semantic, warnings, view: [...notices, ...r.diagnostics], internal }) };
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { postMessage({ type: 'init', keywords: grammar.keywords, symbols: grammar.symbols }); return; }
  if (m.type === 'run') postMessage({ type: 'result', ...run(m) });
  if (m.type === 'appendView') postMessage({ type: 'appendView', ...appendViewMsg(m) });
  if (m.type === 'renameInfo') postMessage({ type: 'renameInfo', ...renameInfoMsg(m) });
  if (m.type === 'rename') postMessage({ type: 'rename', ...renameMsg(m) });
  if (m.type === 'editInfo') postMessage({ type: 'editInfo', ...guard(m, editInfoMsg) });
  if (m.type === 'add') postMessage({ type: 'add', ...guard(m, addMsg) });
  if (m.type === 'connectInfo') postMessage({ type: 'connectInfo', ...guard(m, connectInfoMsg) });
  if (m.type === 'connect') postMessage({ type: 'add', ...guard(m, connectMsg) });
  if (m.type === 'deletePlan') postMessage({ type: 'deletePlan', ...guard(m, deletePlanMsg) });
  if (m.type === 'delete') postMessage({ type: 'delete', ...guard(m, deleteMsg) });
};

// 名前の変更(GR15 の E。設計書 8 章の段階 1)。図で選んだ要素は、原文の範囲と種類で構文木の要素に戻す
function preparedFor(text) { return last.text === text && last.prepared ? { prepared: last.prepared, semantic: last.semantic, folder: last.folder } : null; }
// フォルダのとき(GR20 の F): 図からの編集に渡すテキスト(つないだテキスト)と opts、構文エラーで止める理由、書き換えをファイルの中の位置にする関数
const SYNTAX_IN_FOLDER = 'どれかのファイルに構文エラーがある間は、図から編集できない';
function folderEdit(x) {
  const F = x.folder;
  if (!F) return { text: null, opts: {}, blocked: false, local: (e) => e, perFile: null, fileOf: null };
  const local = (e) => {
    const k = F.files.findIndex((f) => f.base <= e.start && e.end <= f.end);
    return k < 0 ? e : { ...e, file: k, path: F.files[k].path, start: e.start - F.files[k].base, end: e.end - F.files[k].base };
  };
  // 書き換え r.edits(つないだテキストの中の位置。r.text は書き換えた後のつないだテキスト)を、ファイルごとの 1 か所の置き換えにする(GR21 の X)
  const perFile = (r, text) => {
    const by = new Map();
    for (const e of r.edits) { const k = F.files.findIndex((f) => f.base <= e.start && e.end <= f.end); if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
    const out = [];
    for (const [k, es] of [...by].sort((a, b) => a[0] - b[0])) {
      const s = Math.min(...es.map((e) => e.start)), t = Math.max(...es.map((e) => e.end));
      let piece = text.slice(s, t);
      for (const e of es.slice().sort((a, b) => b.start - a.start)) piece = piece.slice(0, e.start - s) + (e.text ?? '') + piece.slice(e.end - s);
      out.push(local({ start: s, end: t, text: piece }));
    }
    return out;
  };
  return { text: F.text, opts: { folder: folderOf(F) }, blocked: !F.ok, local, perFile, fileOf: (at) => F.files.findIndex((f) => f.base <= at && at <= f.end) };
}
function elementAt(prepared, src, kind) {
  if (!src) return null;
  let hit = null;
  (function walk(e) {
    if (hit) return;
    if (e.start === src[0] && e.end === src[1] && e.kind === kind) { hit = e; return; }
    e.owned.forEach(walk); e.related.forEach(walk);
  })(prepared.ctx.tree);
  return hit;
}
function renameInfoMsg({ id, text, src, kind }) {
  if (!EDIT15.E) return { id, ok: false, reason: 'このコマンドは入っていない' };
  const x = preparedFor(text);
  if (!x) return { id, ok: false, reason: '描き直しの途中なので、図が描き終わってから選び直してください' };
  if (!x.prepared.ok) return { id, ok: false, reason: 'テキストに構文エラーがある間は、名前を変えられない' };
  if (x.folder && !x.folder.ok) return { id, ok: false, reason: 'どれかのファイルに構文エラーがある間は、名前を変えられない' };
  const el = elementAt(x.prepared, src, kind);
  if (!el) return { id, ok: false, reason: 'この図の要素は、原文に名前を書いた要素ではないので、名前を変えられない' };
  if (el.name === undefined && el.shortName === undefined) return { id, ok: false, reason: '名前を宣言していない要素(名前を受け継ぐだけの再定義など)の名前は変えられない' };
  return { id, ok: true, name: el.name ?? null, shortName: el.shortName ?? null };
}
function renameMsg({ id, text, src, kind, which, newName }) {
  if (!EDIT15.E) return { id, ok: false, reason: 'このコマンドは入っていない' };
  try {
    const x = preparedFor(text);
    if (!x) return { id, ok: false, reason: '描き直しの途中です。図が描き終わってから、もう一度押してください' };
    if (!x.prepared.ok) return { id, ok: false, reason: 'テキストに構文エラーがある間は、名前を変えられない' };
    const fe = folderEdit(x);
    if (fe.blocked) return { id, ok: false, reason: 'どれかのファイルに構文エラーがある間は、名前を変えられない' };
    if (fe.text !== null) text = fe.text;
    const el = elementAt(x.prepared, src, kind);
    if (!el) return { id, ok: false, reason: 'この図の要素は、原文に名前を書いた要素ではないので、名前を変えられない' };
    const r = renameElement({ text, analysis: { ok: true, tree: x.prepared.ctx.tree, model: x.prepared.ctx.model, semantic: x.semantic ?? [] }, element: el, which, newName }, fe.opts);
    if (!r.ok) return { id, ok: false, reason: r.reason, details: r.details ?? [] };
    // 書き換えた箇所をすべて含む 1 か所の置き換えにする(画面がテキスト欄に 1 回で入れ、取り消しの 1 回で戻せるように)
    const s = Math.min(...r.edits.map((e) => e.start)), t = Math.max(...r.edits.map((e) => e.end));
    // 名前を変えた要素の、書き換えた後の原文の範囲(画面が選んだままにするため。GR18 の W2)。要素の始まりより前で終わる書き換えの
    // 長さの差だけ始まりを、終わりまでに終わる書き換え(要素の中の宣言の名前を含む)の長さの差だけ終わりをずらす
    const shift = (p) => r.edits.filter((e) => e.end <= p).reduce((d, e) => d + e.text.length - (e.end - e.start), 0);
    const select = { start: el.start + shift(el.start), end: el.end + shift(el.end), kind };
    // フォルダのとき(GR21 の X): ファイルごとの置き換えと、名前を変える要素のファイル
    if (fe.perFile) { const edits = fe.perFile(r, text), home = fe.fileOf(el.start); return { id, ok: true, edit: edits.find((e) => e.file === home) ?? edits[0], edits, home, select }; }
    return { id, ok: true, edit: fe.local({ start: s, end: t, text: r.text.slice(s, r.text.length - (text.length - t)) }), select };
  } catch (e) { return { id, ok: false, reason: `内部エラー: ${e?.message ?? e}` }; }
}

// 範囲を view として書き足す(GR15 の V)。テキストと範囲とビューを受け取り、書き足す編集(1 か所の挿入)を返す。テキストは画面が
// 書き換える(テキスト欄の取り消しで戻せるように)。→ { id, ok, edits, viewCandidate, reason }
function appendViewMsg({ id, text, candidateId, view }) {
  if (!EDIT15.V) return { id, ok: false, reason: 'このコマンドは入っていない' };
  try {
    // フォルダのときは、前の解析の結果がなければ受け付けない(GR20 の F)
    const x = preparedFor(text);
    if (!x && last.folder) return { id, ok: false, reason: '描き直しの途中です。図が描き終わってから、もう一度押してください' };
    const prepared = x ? x.prepared : prepareView(text);
    if (!prepared?.ok) return { id, ok: false, reason: 'テキストに構文エラーがある間は、view を書き足せない' };
    const fe = folderEdit(x ?? {});
    if (fe.blocked) return { id, ok: false, reason: 'どれかのファイルに構文エラーがある間は、view を書き足せない' };
    if (fe.text !== null) text = fe.text;
    const V = VIEWS[view];
    const c = V && V.cands(prepared).find((y) => y.id === candidateId);
    if (!c) return { id, ok: false, reason: '描く範囲が見つからない(描き直しの途中かもしれない)' };
    const r = appendView({ text, analysis: { ok: true, tree: prepared.ctx.tree, model: prepared.ctx.model }, scope: c.el, view }, fe.opts);
    if (!r.ok) return { id, ok: false, reason: r.reason, details: r.details ?? [] };
    return { id, ok: true, edits: r.edits.map(fe.local), viewCandidate: `view:${r.viewQname}`, viewName: r.viewName };
  } catch (e) { return { id, ok: false, reason: `内部エラー: ${e?.message ?? e}` }; }
}

// ---- 図からの編集の段階 2・3(GR16 の A・X。設計書 8 章・9.1 節)。テキストは画面が書き換える(Ctrl+Z の 1 回で戻せるように)
// 描き直しの途中(最後に解析したテキストと違う)・構文エラーの間は受け付けない。例外は内部エラーとして理由に出す
function guard(m, f) {
  try {
    const x = preparedFor(m.text);
    if (!x) return { id: m.id, ok: false, reason: '描き直しの途中です。図が描き終わってから、もう一度押してください' };
    if (!x.prepared.ok) return { id: m.id, ok: false, reason: 'テキストに構文エラーがある間は、図から編集できない' };
    const fe = folderEdit(x);
    if (fe.blocked) return { id: m.id, ok: false, reason: SYNTAX_IN_FOLDER };
    const analysis = { ok: true, tree: x.prepared.ctx.tree, model: x.prepared.ctx.model, semantic: x.semantic ?? [] };
    const r = f(fe.text !== null ? { ...m, text: fe.text } : m, analysis, x.prepared, fe.opts);
    // フォルダの削除(GR21 の X): ファイルごとの置き換え edits と、消す要素のファイル home
    if (r.ok && r.raw && fe.perFile) { const { raw, home, ...rest } = r; const edits = fe.perFile(raw, fe.text); return { id: m.id, ...rest, edit: edits.find((e) => e.file === fe.fileOf(home)) ?? edits[0], edits, home: fe.fileOf(home) }; }
    const { raw, home, ...rest } = r;
    return { id: m.id, ...rest, ...(r.edit ? { edit: fe.local(r.edit) } : {}) };
  } catch (e) { return { id: m.id, ok: false, reason: `内部エラー: ${e?.message ?? e}` }; }
}
const typeList = (cs) => cs.map((c) => ({ written: c.written, qname: c.qname, usable: c.usable, reason: c.reason ?? null }));
// 書き換えた箇所をすべて含む 1 か所の置き換え(名前の変更と同じ)
function oneEdit(text, r) {
  const s = Math.min(...r.edits.map((e) => e.start)), t = Math.max(...r.edits.map((e) => e.end));
  return { start: s, end: t, text: r.text.slice(s, r.text.length - (text.length - t)) };
}
const pathOf = (prepared, ends) => ends.map((p) => p.map((x) => elementAt(prepared, x.src, x.kind)));
function editInfoMsg({ text, src, kind, view }, analysis, prepared) {
  const el = elementAt(prepared, src, kind);
  if (!el) return { ok: false, part: false, port: false, connect: false, del: false, reason: 'この図の要素は、原文に宣言した要素ではない' };
  const t = EDIT16.A ? addTargets(analysis, el) : { part: false, port: false };
  const model = analysis.model;
  // 部品を足すのは部品の定義・使用(パッケージは一般ビューだけ)。接続を足すのは相互接続ビューで、ポートか部品の使用を選んだとき
  const part = t.part && (t.port || view === 'general');
  const connect = EDIT16.A && view === 'interconnection' && (model.conforms(el.kind, 'PortUsage') || t.port);
  const del = EDIT16.X && isDeclared({ analysis, element: el, text });
  return { ok: true, part, port: t.port, connect, del,
    partTypes: part ? typeList(typeCandidates({ analysis, owner: el, kind: 'PartDefinition', text })) : [],
    portTypes: t.port ? typeList(typeCandidates({ analysis, owner: el, kind: 'PortDefinition', text })) : [] };
}
function addMsg({ text, src, kind, op, name, typeIndex: type, conjugated, direction }, analysis, prepared, opts = {}) {
  if (!EDIT16.A) return { ok: false, reason: 'このコマンドは入っていない' };
  const owner = elementAt(prepared, src, kind);
  if (!owner) return { ok: false, reason: '選んだ要素が見つからない(描き直しの途中かもしれない)' };
  const kindOf = op === 'port' ? 'PortDefinition' : 'PartDefinition';
  const t = type === null || type === undefined ? null : typeCandidates({ analysis, owner, kind: kindOf, text })[type]?.element ?? null;
  if (type !== null && type !== undefined && !t) return { ok: false, reason: '型の候補が見つからない(描き直しの途中かもしれない)' };
  const r = op === 'port' ? addPort({ text, analysis, owner, name, type: t, conjugated: !!conjugated, direction: direction ?? '' }, opts)
    : addPart({ text, analysis, owner, name, type: t }, opts);
  if (!r.ok) return { ok: false, reason: r.reason, details: r.details ?? [] };
  return { ok: true, edit: oneEdit(text, r), select: r.added };
}
function connectInfoMsg({ ends, text }, analysis, prepared) {
  const p = pathOf(prepared, ends);
  if (p.some((x) => x.some((e) => !e))) return { ok: false, reason: '選んだ端が見つからない(描き直しの途中かもしれない)' };
  const owner = connectionOwner(analysis, p);
  // 型の候補の書き方は、宣言の書き方(原文)に合わせる(GR18 の E6。connectMsg と同じく text を渡す)
  return { ok: true, ifaceTypes: owner ? typeList(typeCandidates({ analysis, owner, kind: 'InterfaceDefinition', text })) : [] };
}
function connectMsg({ text, ends, form, name, typeIndex: type }, analysis, prepared, opts = {}) {
  if (!EDIT16.A) return { ok: false, reason: 'このコマンドは入っていない' };
  const p = pathOf(prepared, ends);
  if (p.some((x) => x.some((e) => !e))) return { ok: false, reason: '選んだ端が見つからない(描き直しの途中かもしれない)' };
  let t = null;
  if (form === 'interface') {
    const owner = connectionOwner(analysis, p);
    t = owner ? typeCandidates({ analysis, owner, kind: 'InterfaceDefinition', text })[type]?.element ?? null : null;
  }
  const r = addConnection({ text, analysis, ends: p, form, name: name || null, type: t }, opts);
  if (!r.ok) return { ok: false, reason: r.reason, details: r.details ?? [] };
  return { ok: true, edit: oneEdit(text, r), select: r.added };
}
function deletePlanMsg({ text, src, kind }, analysis, prepared, opts = {}) {
  if (!EDIT16.X) return { ok: false, reason: 'このコマンドは入っていない' };
  const el = elementAt(prepared, src, kind);
  if (!el) return { ok: false, reason: '選んだ要素が見つからない(描き直しの途中かもしれない)' };
  const r = deletePlan({ analysis, element: el, text }, opts);
  if (!r.ok) return { ok: false, reason: r.reason, details: r.details ?? [] };
  return { ok: true, items: r.items };
}
function deleteMsg({ text, src, kind }, analysis, prepared, opts = {}) {
  if (!EDIT16.X) return { ok: false, reason: 'このコマンドは入っていない' };
  const el = elementAt(prepared, src, kind);
  if (!el) return { ok: false, reason: '選んだ要素が見つからない(描き直しの途中かもしれない)' };
  const r = deleteElement({ text, analysis, element: el }, opts);
  if (!r.ok) return { ok: false, reason: r.reason, details: r.details ?? [] };
  // フォルダのときは、guard がファイルごとの置き換えにする(raw。GR21 の X)。home は消す要素の位置
  if (opts.folder) return { ok: true, raw: r, home: el.start, select: r.owner };
  return { ok: true, edit: oneEdit(text, r), select: r.owner };
}
