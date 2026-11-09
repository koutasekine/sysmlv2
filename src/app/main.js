// 画面の処理(GR4 指示書 6 章、設計書 9.1 節)。DOM を使うのはこのファイルだけ。外部パッケージ・Node.js 固有の機能を使わない。
//
// 解析と描画は Web Worker(src/app/worker.js)で行う。Worker のコードは、ビルド(tools/build/build.mjs)が
// 文字列 WORKER_SOURCE としてこのスクリプトの前に入れる。Blob URL から作るので file:// でも動く(指示書 7 章)。
// 画面の構成と見た目はフローチャート(flow.sapp.jp)と同じ。フローチャートの構文処理のコードは参考にしていない。

// 「例を読み込む」の例(機能紹介用の src/app/sample.sysml と、入門用の src/app/sample_intro.sysml(GR19 の U3)。自作で、公式の例題は
// 写していない。設計書 11 章)と、「書き方」のダイアログの中身(src/app/help.html)も、ビルドが文字列 SAMPLE_TEXT・SAMPLE_INTRO_TEXT・
// HELP_HTML としてこのスクリプトの前に入れる。

// ENABLED_VIEWS は、ビルドの設定(tools/build/config.json の views)で、この HTML で選べるビューの一覧。

/* global WORKER_SOURCE, SAMPLE_TEXT, SAMPLE_INTRO_TEXT, HELP_HTML, ENABLED_VIEWS */
import { makeWindowHighlighter } from './highlight.js';
import { readSysml, fileKind, OPEN_ONLY_SYSML, printIds, comparePaths, isFolderSysml } from './io.js';
import { toPrompt, buildDiagnostics, WARNING_TITLE, tokenRange, noDiagnostics } from './diag.js';
import { makeRunner, scopePlaceholder, mapRange, findBySource, eolOf, withEol, folderKey, BIG_TEXT, utf8Bytes, bigTextNote } from './runner.js';
import { pieceSvg, pieceBase, tableBase } from '../view/pieces.js';
import { makeFolderHistory } from './history.js';
import { makeZip, overwriteFolder } from './save.js';
import { buildTree, nameError, copyName, parentOf, baseOf, joinPath, isSameOrUnder, hiddenDir } from './tree.js';
import { widths, dragTree, dragMiddle, TREE_INIT } from './layout.js';
import { visibleRows, ROLE_ORDER, SEC_SPLIT, sectionSizes, textX, unpackOutline, unpackCandidates, unpackStructure, candidateTexts } from './modeltree.js';
import { askWrite, listDisk, readAt, writeNew, makeDir, removeAt, moveFile, copyDir, listIn, moveDir, errText } from './fsops.js';

const $ = (s) => document.querySelector(s);
// テキスト欄。フォルダを開いているときは、表示しているファイルのテキスト欄(GR20 の F)。1 つのテキストのときは #src
let srcEl = $('#src');
const singleEl = srcEl;
const hlEl = $('#hl'), msgEl = $('#msg'), viewEl = $('#view'), canvasEl = $('#canvas'), editEl = $('#edit'), scopeEl = $('#scope');
let scopeCands = []; // 範囲の欄に並べた候補(GR27 P5 の S。syncScopeTitle が使う)
let modelWinReady = false; // モデルツリーの行を並べる部品(GR27 P5 の M)の準備ができたか(applySections は、その前にも呼ばれる)
const progEl = $('#progress'), progText = $('#progressText'), progFill = $('#progressFill');
const viewKindEl = $('#viewKind');

// テキスト欄の色付け。見えている範囲だけを色付けする(大きなテキストで画面を止めないため。設計書 2.6 節)。
// Worker から予約語の一覧を受け取るまでは、予約語なしで文字だけを出す
let renderHl = makeWindowHighlighter({ keywords: [], symbols: [] });
let runner = null;
let runId = 0;
const running = () => runner?.running ?? null; // 実行中の解析の要求 { id, text, view, candidateId, … }(なければ null)
let progressTimer = null;
let last = null;                   // 最後の解析の結果
let shown = null;                  // 最後に正しく描けた図 { svg, structure }
let selectedId = null;
let selectedSrc = null; // 選んだ要素の原文の範囲と種類 { src, kind, text }(GR18 の E5。テキストを書き換えた後の選び直しに使う)
let fileBase = 'sysmlv2';
let original = { text: '', edited: true, eol: '\n' }; // 開いたファイルの原文と改行の形。編集していなければ、そのまま保存する
// 開いた・保存した・「新規」・「例を読み込む」(と起動)の後に、テキストを書き換えたか(GR19 の U1。設計書 9.1 節)。
// 書き換えていれば、「開く」「フォルダを開く」「新規」「例を読み込む」とドロップで置き換えの確認を出す。書き換えていなければ出さない
// (GR22 の D1。前は「新規」「例を読み込む」だけ、テキストが空でなければ書き換えていなくても出していた)
let dirty = false;
let debounce = null;
let opening = true; // 次の解析が、開いたとき(開く・例・新規・起動)のものか。最初の view の型でビューを決める(GR6 指示書 6 章)
let resultText = null;  // 最後に結果を受け取った解析のテキスト(GR15 の V。描き直しの途中かを調べる)
let wantScope = null;   // 次の解析で選ぶ範囲(書き足した view。GR15 の V)
let appendSeq = 0;
let wantSelect = null;  // 追加・削除の後に選ぶ要素 { text(書き換えた後のテキスト), select: { start, end, kind } }(GR16 の A・X)
let connecting = null;  // 接続を足す途中 { text, ends: [{ id, path }], seq }(GR16 の A)
const LINE_PX = 19.5; // テキスト欄の 1 行の高さ(13px × 1.5。style.css の textarea#src・#hl の font)

// ---- フォルダ(GR20 の F。設計書 9.4 節の段階 A)。ファイルごとにテキスト欄を持ち、表示するのは 1 つ(テキスト欄ごとに取り消しの履歴を
// 保つので、ファイルを切り替えても、ほかのファイルの取り消しの履歴を失わない)。解析は、どのファイルを書き換えても全ファイルで行う
// (書き換えの後の待ち時間の仕組みは 1 つのテキストと同じ)。folder が null なら 1 つのテキストの扱い(今のまま)
// GR24 の T・F・M(設計書 9.4 節の段階 C): フォルダの中のすべてのファイル(items)とフォルダ(dirs)を持ち、フォルダの木に出す。
// files は、モデルに入る .sysml のファイル(テキストを持つもの)を相対パスの符号位置の順に並べたもの(解析の並び。items から作る)。
// ファイルは通し番号 id で指す(取り消しの履歴の鍵。名前の変更・移動で相対パスが変わっても、書き換えと取り消しの履歴を引き継ぐ)
// item = { id, path, sysml(名前が .sysml で終わる), el(テキストを持つときのテキスト欄), original: { text, edited, eol }, dirty, saved, shadow,
//          composing, stamp, read(テキストを持たないファイルの中身を読む関数), missing(再読み込みで、ほかで消えていた), bad(.sysml にしたが
//          読めなかった理由) }
let folder = null;       // { name, handle, items, dirs: Set, files, cur, history, open: Set(開いたフォルダ), sel(木で選んだ相対パス), clip, editing, busy, drag }
let resultFolder = null; // 最後に結果を受け取った解析の folder({ files: [{ path, base, end, ok }] })。図・診断の位置をファイルに戻すのに使う
let resultItems = null;  // その解析のファイルの並び(folder.files の写し)。結果のファイルの番号を、ファイルに戻すのに使う(GR24。並びが変わっても取り違えない)
let lastRunItems = null;
let resultCombined = null; // 最後に結果を受け取った解析の、ファイルをつないだテキスト(1 つのテキストならそのテキスト)
let lastRunCombined = null;
const fileBarEl = $('#fileBar'), filePathEl = $('#filePath');
const folderFiles = () => folder.files.map((f) => ({ path: f.path, text: f.el.value }));
// 今のテキスト(解析の要求と結果の突き合わせに使う文字列。1 つのテキストならそのテキスト)
const curKey = () => (folder ? folderKey(folderFiles()) : srcEl.value);
const curCombined = () => (folder ? folder.files.map((f) => f.el.value).join('\n') : srcEl.value);
// 置き換えの確認が要る状態(設計書 9.1 節・9.4 節の段階 A): 1 つのテキストを書き換えた、フォルダのファイルを書き換えた、または
// ハンドルがないときに保存の zip に入れていない木の操作をした(GR25 の A3。folder.opsDirty)。GR25 の P1 の裁定の問 1: 再読み込みで「ディスクに
// ない」の印を付けたファイル(missing。保存で作り直す)が残っている間も、書き換えの印が取り消しで消えていても、確認を出す
const anyDirty = () => (folder ? folder.items.some((f) => f.dirty || f.missing) || !!folder.opsDirty : dirty);
// 置き換えの確認の文の頭(GR25 の A3。書き換えたファイルがなければ、ディスクにないファイル、木の操作の順に、そう書く)
const unsavedHead = () => (folder.items.some((f) => f.dirty) ? '書き換えたファイルがあります'
  : folder.items.some((f) => f.missing) ? 'ほかで消えていて、保存で作り直すファイル(ディスクにない)があります'
    : '保存していないフォルダの木の操作(作る・名前の変更・削除・移動・コピー)があります');
// GR25 の A4(設計書 9.1 節): 置き換えの確認が要る状態で、ページを閉じる・読み直すときは、ブラウザの確認を出す。それ以外は出さない
window.addEventListener('beforeunload', (e) => {
  if (!anyDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});
// ---- フォルダの取り消しの履歴と書き換えの印(GR21 の H。設計書 9.4 節の「取り消しの履歴」)
// 書き換えの印は、保存したとき(読み込んだとき)のテキスト(f.saved。行末は LF)と同じかどうかで決める
const lf = (t) => t.replace(/\r\n|\r/g, '\n');
function refreshDirty(f) {
  const d = lf(f.el.value) !== f.saved;
  f.original.edited = d;
  if (d !== f.dirty) { f.dirty = d; updateFileLabels(); }
}
// テキスト欄の上の相対パスの右の知らせ(取り消しが止まった理由、保存の結果)
const fileMsgEl = document.createElement('span');
fileMsgEl.className = 'small fmsg';
fileBarEl.append(fileMsgEl);
const fileMsg = (t) => { fileMsgEl.textContent = t ?? ''; };

// ---- Worker(作り直し・打ち切り・エラーのときの扱いは src/app/runner.js。GR18 の E9・B5)
// Worker のエラーのときは、待っている要求に失敗を返し、実行中の解析は内部エラーの結果にして、Worker を作り直す(次の入力で描き直す)
const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
function internalResult(run, message) {
  return { type: 'result', id: run.id, ok: false, internal: true, view: run.view, candidates: [], candidate: null, svg: null, structure: null,
    diagnostics: buildDiagnostics({ text: run.text, internal: [`解析と描画の途中で Worker が止まった(${message})`] }) };
}
function startWorker() {
  runner = makeRunner({ createWorker: () => new Worker(workerUrl), deliver: onWorkerMessage, internalResult });
  runner.start();
}

// runner.js の deliver から、Worker の応答そのもの(と、runner.js が作る失敗の応答)を受け取る。runner.js がすでに MessageEvent の
// data を取り出しているので、ここでは取り出さない(GR18 の W1)
function onWorkerMessage(m) {
  if (m.type === 'init') { renderHl = makeWindowHighlighter({ keywords: m.keywords, symbols: m.symbols }); updateHighlight(); return; }
  if (m.type === 'appendView') { onAppended(m); return; }
  if (m.type === 'renameInfo') { onRenameInfo(m); return; }
  if (m.type === 'rename') { onRenamed(m); return; }
  if (m.type === 'editInfo') { onEditInfo(m); return; }
  if (m.type === 'add' || m.type === 'delete') { onEdited(m); return; }
  if (m.type === 'connectInfo') { onConnectInfo(m); return; }
  if (m.type === 'deletePlan') { onDeletePlan(m); return; }
  if (m.type === 'progress') { if (m.id === runId) updateProgress(m); return; }
  if (m.type === 'result' && m.id === runId) { resultText = lastRunText; resultCombined = lastRunCombined; resultFolder = m.folder ?? null; resultItems = lastRunItems; finishRun(); applyResult(unpackResult(m)); }
}
let lastRunText = null; // 最後に頼んだ解析のテキスト
// Worker の結果の受け渡しの形を、今の形に戻す(GR27 の O・Q。src/app/modeltree.js の unpackOutline・unpackCandidates・unpackStructure)。outline の鍵がない結果は、
// テキストが前の結果と変わっていないので、モデルツリーを送っていない(applyOutline が前のモデルツリーを使う)
function unpackResult(m) {
  const { paths, ...r } = m;
  if (r.outline) r.outline = unpackOutline(r.outline);
  // 範囲の欄の候補の文字(長い修飾名の前を「…::」で省いたもの。GR27 P5 の S)は、受け渡しの形から作る(名前の全部を組み立てない)
  if (r.candidates) { r.candidateTexts = candidateTexts(r.candidates, paths ?? null); r.candidates = unpackCandidates(r.candidates, paths ?? null); }
  if (r.structure) r.structure = unpackStructure(r.structure); // 図の構造の修飾名(GR27 の Q)
  return r;
}

// 解析を頼む。解析中にテキスト・ビュー・範囲が変わったら、Worker を止めて新しい Worker で解析し直す(設計書 2.6 節。GR18 の B5)
function analyze() {
  // .sysml のファイルが 1 つもないフォルダ(GR24 の T)は、解析しない。図と診断を空にして、新しいファイルの作り方を案内する
  if (folder && !folder.files.length) { showNoSysml(); return; }
  const text = curKey();
  if (!runner) startWorker();
  if (opening) resetModel(); // 開く・新規・例・フォルダを開くでは、モデルツリーの開閉と選択を始めの状態に戻す(GR26)
  const id = ++runId;
  lastRunText = text;
  lastRunCombined = curCombined();
  lastRunItems = folder ? folder.files.slice() : null;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => { if (running()?.id === id) progEl.classList.add('on'); }, 1000);
  // needOutline: このテキストのモデルツリーを画面が持っていないとき(開く・新規などで忘れたとき、前の結果を受け取らなかったとき)は、
  // テキストが Worker の前の解析と同じでも、結果にモデルツリーを入れてもらう(GR27 の O)
  runner.run({ type: 'run', id, text, ...(folder ? { files: folderFiles() } : {}), candidateId: wantScope ?? (scopeEl.value || null), view: viewKindEl.value, opening, enabled: ENABLED_VIEWS, needOutline: model.text !== text });
  checkBigText(text, opening);
  wantScope = null;
  opening = false;
  // 処理中は、前の結果の「候補がない」などを出さない(GR18 の B6。設計書 2.6 節)。図を描けていない間の表示を消し、進み具合だけを出す
  if (!shown) clearNoResult();
  showBigNote();
}
// 大きいファイルの知らせ(GR27 の L。設計書 5 章)。開いたテキスト(フォルダのときは .sysml の合計。テキスト欄の中のテキスト(行末は LF)を
// UTF-8 で数える)が BIG_TEXT バイトを超えるときに、診断の欄の上に出す(解析は止めない)。開いたとき(開く・ドロップ・フォルダを開く・例・新規)と、
// 書き換え・貼り付けで BIG_TEXT 以下から超えたときに出す(超えたまま書き換え続けても、出し直さない)。出した知らせは、そのテキストの解析の
// 結果を出した後も残し、テキストが変わった後の結果で消す
let bigNote = null, lastBytes = 0;
function checkBigText(text, open) {
  const bytes = folder ? folderFiles().reduce((n, f) => n + utf8Bytes(f.text), 0) : utf8Bytes(srcEl.value);
  if (bytes > BIG_TEXT && (open || lastBytes <= BIG_TEXT)) bigNote = { key: text, text: bigTextNote(bytes, !!folder) };
  else if (bigNote && bigNote.key !== text) bigNote = null;
  lastBytes = bytes;
}
function showBigNote() {
  msgEl.querySelector('.bignote')?.remove();
  if (bigNote && bigNote.key === curKey()) msgEl.prepend(el('div', 'bignote', bigNote.text));
}
function clearNoResult() {
  canvasEl.querySelectorAll('.empty').forEach((x) => x.remove());
  scopeEl.textContent = '';
  scopeEl.append(new Option('(処理中)', ''));
  msgEl.textContent = '';
  scopeCands = []; syncScopeTitle();
}
function finishRun() {
  clearTimeout(progressTimer);
  progEl.classList.remove('on');
  progFill.style.width = '0';
}

// 進み具合: 字句の分割 → 構文解析 → 導出 → 木 → 名前解決 → 描画(GR4 P3 の裁定 Q25)
let tokenTotal = 0;
function updateProgress(p) {
  let f = 0, t = '';
  const num = (x) => x.toLocaleString('ja-JP');
  switch (p.stage) {
    case 'lex': tokenTotal = p.total; f = 0.05; t = `字句の分割: ${num(p.total)} 字句`; break;
    case 'parse': f = 0.05 + 0.6 * (p.total ? p.done / p.total : 0); t = `構文解析: ${num(p.done)} / ${num(p.total)} 字句`; break;
    case 'derive': f = 0.68; t = '構文解析: 導出'; break;
    case 'tree': f = 0.7 + 0.15 * Math.min(1, p.done / Math.max(1, tokenTotal * 0.6)); t = `構文木: ${num(p.done)} 要素`; break;
    case 'resolve': f = 0.87; t = '名前解決'; break;
    case 'candidates': f = 0.94; t = '描く範囲の候補'; break;
    case 'render': f = 0.96; t = '描画'; break;
    default: return;
  }
  progText.textContent = t;
  progFill.style.width = `${Math.round(f * 100)}%`;
}

// ---- 結果
// 範囲の欄にマウスを載せたときの文(GR27 P5 の S): 選んでいる候補の文字の全部(省く前の label)だけを、範囲の欄の title に入れる。候補ごとの
// option には付けない。範囲の欄の中身か選択を替えたら入れ直す
function syncScopeTitle() {
  const v = scopeEl.value;
  const c = v ? scopeCands.find((x) => x.id === v) : null;
  scopeEl.title = c ? c.label : '';
}
function applyResult(r) {
  last = r;
  // 接続を足す途中にテキストが変わったら、選んだ端が古くなるので、途中をやめる(GR16 の A)
  if (connecting && connecting.text !== curKey()) endConnect();
  // ビューの選択欄(開いたときに、最初の view の型で Worker が選んだもの)
  if (r.view && viewKindEl.value !== r.view) viewKindEl.value = r.view;
  // 範囲の選択欄
  const keep = scopeEl.value;
  scopeEl.textContent = '';
  if (!r.candidates.length) scopeEl.append(new Option(scopePlaceholder(r), '')); // 内部エラーと構文エラーを分ける(GR18 の B2)
  // 候補の文字は、修飾名が長いときに前を省いたもの(GR27 P5 の S。設計書 5 章の終わり)。値(value)は今のまま
  const texts = r.candidateTexts ?? r.candidates.map((c) => c.label);
  r.candidates.forEach((c, i) => scopeEl.append(new Option(texts[i], c.id)));
  if (r.candidate) scopeEl.value = r.candidate.id; else if (keep && r.candidates.some((c) => c.id === keep)) scopeEl.value = keep;
  scopeCands = r.candidates;
  syncScopeTitle();
  if (r.ok && r.svg) {
    canvasEl.innerHTML = r.svg; // src/view が作った SVG の文字列(入力の文字はすべてエスケープしてある)
    shown = { svg: r.svg, structure: r.structure };
    if (r.blocked) {
      // フォルダで、どれかのファイルに構文エラーがある間は、ほかのファイルから描いた図を薄く表示し、図からの編集を止める(GR20 の F。
      // 設計書 9.4 節。9.1 節の規則を全ファイルに当てる)。図の保存のボタンも置かない
      viewEl.classList.add('stale');
      removePieceButtons();
    } else {
      viewEl.classList.remove('stale');
      addPieceButtons(r); // 図・表の題の右の保存のボタン(GR13)
    }
    reselect();
  } else if (r.ok) {
    canvasEl.textContent = '';
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = viewKindEl.value === 'state-transition'
      ? '描く範囲の候補がありません。状態・遷移を持つ状態の定義か使用を書くか、view を書いてください(「書き方」を参照)。'
      : viewKindEl.value === 'action-flow'
        ? '描く範囲の候補がありません。行動・継承・フローを持つ行動の定義か使用を書くか、view を書いてください(「書き方」を参照)。'
        : viewKindEl.value === 'sequence'
        ? '描く範囲の候補がありません。メッセージを持つオカレンス・部品の定義か使用を書くか、view を書いてください(「書き方」を参照)。'
        : viewKindEl.value === 'general'
        ? '描く範囲の候補がありません。定義・使用などの要素を書くか、view を書いてください(「書き方」を参照)。'
        : viewKindEl.value === 'grid'
        ? '描く範囲の候補がありません。部品・要求などの要素を書くか、型が GridView の view を書いてください(「書き方」を参照)。'
        : '描く範囲の候補がありません。部品・ポート・接続を持つ部品の定義か使用を書くか、view を書いてください(「書き方」を参照)。';
    canvasEl.append(d);
    viewEl.classList.remove('stale');
    shown = null;
    select(null);
  } else {
    // 構文エラーの間は、最後に正しく描けた図を薄く表示する(設計書 9.1 節)
    if (canvasEl.querySelector('svg')) viewEl.classList.add('stale');
    removePieceButtons(); // 薄く出している図は保存しない(テキストと食い違うため。GR13 指示書 5 章)
    // 選んだ要素の名前の変更の欄も使えなくする(GR15 の E。テキストと図が食い違うため)
    editEl.querySelectorAll('.rename input, .rename button').forEach((x) => { x.disabled = true; x.title = 'テキストに構文エラーがある間は、名前を変えられない'; });
    // 追加・削除の欄も同じ(GR16 の A・X)。接続を足す途中ならやめる
    editEl.querySelectorAll('.ops input, .ops button, .ops select').forEach((x) => { x.disabled = true; x.title = 'テキストに構文エラーがある間は、図から編集できない'; });
    if (connecting) endConnect();
  }
  renderDiagnostics(r.diagnostics, r.ok);
  updateAppendButton(r);
  applyOutline(r); // モデルツリーと参照箇所(GR26)を、この解析の結果で作り直す
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function renderDiagnostics(d, ok) {
  msgEl.textContent = '';
  const bar = el('div', 'bar');
  const sum = el('span');
  const parts = [];
  if (d.syntax.length) parts.push(`構文エラー ${d.syntax.length} 件`);
  if (d.semantic.length) parts.push(`意味エラー ${d.semantic.length} 件`);
  if (d.warning?.length) parts.push(`警告 ${d.warning.length} 件`);
  if (d.internal.length) parts.push(`内部エラー ${d.internal.length} 件`);
  if (d.ambiguous.count) parts.push(`曖昧 ${d.ambiguous.count} 件`);
  parts.push(`未検査 ${d.unchecked.count} 件`);
  const warns = d.view.filter((v) => v.level === 'warn').length;
  if (d.view.length) parts.push(`図の診断 ${d.view.length} 件`);
  sum.textContent = parts.join('、');
  sum.className = d.syntax.length || d.semantic.length || d.internal.length ? 'err' : d.unchecked.count || d.ambiguous.count || warns || d.warning?.length ? 'warn' : 'ok';
  const copy = el('button', null, '修正依頼をコピー');
  copy.title = '診断とテキストを、生成 AI に渡す修正依頼の文としてコピーする';
  // 修正依頼の文に入る診断が 1 件もないときは押せない(GR22 の B3・B3b。設計書 9.2 節。依頼文が、ない段を指さないため)。判定は依頼文の段と
  // 同じ promptSections(diag.js)による(info の図の診断だけのときも押せない)
  if (noDiagnostics(d)) { copy.disabled = true; copy.title = '診断がありません(修正依頼にする診断がないので、コピーできない)'; }
  copy.addEventListener('click', () => copyText(folder ? toPrompt(d, curCombined(), folderFiles()) : toPrompt(d, srcEl.value), copy));
  bar.append(sum, copy);
  msgEl.append(bar);
  const section = (title, cls, items) => {
    if (!items.length) return;
    msgEl.append(el('div', `sec ${cls}`, title));
    const ul = el('ul');
    for (const [text, line, range, file, col] of items) {
      const li = el('li', cls, text);
      if (range) { li.style.cursor = 'pointer'; li.title = `${line} 行の該当箇所を選ぶ`; li.addEventListener('click', () => selectText(range[0], range[1])); }
      // 構文エラーは、行と列の位置の字句を選ぶ(GR22 の B5)
      else if (line && col != null) { li.style.cursor = 'pointer'; li.title = `${line} 行 ${col} 列の字句を選ぶ`; li.addEventListener('click', () => gotoToken(line, col, file)); }
      else if (line) { li.style.cursor = 'pointer'; li.title = `${line} 行へ移る`; li.addEventListener('click', () => gotoLine(line, file)); }
      ul.append(li);
    }
    msgEl.append(ul);
  };
  // フォルダのときは、診断ごとにファイルの相対パスを付ける(GR20 の F。設計書 9.4 節)
  const P = (e) => (folder && e.path ? `${e.path} ` : '');
  section('構文エラー', 'err', d.syntax.map((e) => [`${P(e)}${e.line} 行 ${e.col} 列: ${e.message}${e.expected?.length ? `(ここに書けるもの: ${e.expected.slice(0, 12).join(' ')}${e.expected.length > 12 ? ' …' : ''})` : ''}`, e.line, null, e.file, e.col ?? 1]));
  section(`意味エラー(${d.semantic.length} 件)`, 'err', d.semantic.map((e) => [`${P(e)}${e.line} 行 ${e.col} 列: ${e.message}(${e.item})`, e.line, [e.start, e.end]]));
  // 警告(GR19 の W1・W2。設計書 9.2 節)。意味エラーと混ぜず、件数を別に出す。図は止めない。見出しは、誤りや禁止と断定せず、
  // 意図を確かめるよう促す形(GR19 指示書 v19.1 の 3.4 節。修正依頼のコピーの「## 警告」と同じ見出しに、未検査の段と同じく括弧の頭に件数を付ける)
  section(WARNING_TITLE.replace('(', `(${d.warning?.length ?? 0} 件。`), 'warn', (d.warning ?? []).map((e) => [`${P(e)}${e.line} 行 ${e.col} 列: ${e.message}(${e.item})`, e.line, [e.start, e.end]]));
  section('内部エラー', 'err', d.internal.map((m) => [m, null]));
  section(`曖昧な名前(${d.ambiguous.count} 件)`, 'warn', d.ambiguous.groups.map((g) => [`${g.name}: ${g.count} 件(${g.lines.join('・')} 行)`, g.locs ? g.locs[0]?.line : g.lines[0], null, g.locs?.[0]?.file]));
  section(`未検査の名前(${d.unchecked.count} 件。このアプリが中身を知らない名前で、正しいかどうか確かめていない)`, 'warn', d.unchecked.groups.slice(0, 40).map((g) => [`${g.name}: ${g.count} 件(${g.lines.join('・')} 行)`, g.locs ? g.locs[0]?.line : g.lines[0], null, g.locs?.[0]?.file]).concat(d.unchecked.groups.length > 40 ? [[`ほか ${d.unchecked.groups.length - 40} 種類`, null]] : []));
  section('図の診断', 'warn', d.view.map((v) => [`${P(v)}${v.line ? `${v.line} 行: ` : ''}${v.message}`, v.line, null, v.file]));
  if (ok && !d.syntax.length && !d.semantic.length && !d.warning?.length && !d.internal.length && !d.unchecked.count && !d.ambiguous.count && !d.view.length) msgEl.append(el('div', 'ok', 'エラーと未検査はありません。'));
  showBigNote(); // 大きいファイルの知らせ(GR27 の L)は、そのテキストの結果の間は残す
}
function showInternal(m) { msgEl.prepend(el('div', 'err', m)); }

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const t = btn.textContent; btn.textContent = 'コピーしました'; setTimeout(() => { btn.textContent = t; }, 1500);
}

// ---- 図・表を 1 つずつ保存する・コピーする(GR13 指示書 5 章、設計書 9.1 節・9.3 節)。手本は S Apps のプロジェクト計画
// (reference/plan/ui.js の addPieceButtons・pieceAction・placeBox・withPage・printOne・saveImage・copyText。同じ作者の MIT のコード)。
// 図の上の外側(SVG の外の HTML の行)に「SVG」「PNG」「PDF」、表の題の右に「コピー」「SVG」「PNG」「PDF」を置く。
// ボタンは図の上に重ねる画面の部品で、保存する画像や印刷には出ない。押しても図の上の操作(要素を選ぶ・テキストを選ぶ)は始めない
const PIECE_TIP = {
  copy: (n) => `「${n}」の表をタブ区切りの文字でコピーする(表計算ソフトや Word の表にそのまま貼れる)`,
  svg: (n, t) => (t ? `「${n}」の表を SVG(ベクター形式)で保存する(題は入れない)` : 'この図を SVG(ベクター形式)で保存する'),
  png: (n, t) => (t ? `「${n}」の表を PNG(2 倍の解像度)で保存する(題は入れない)` : 'この図を PNG(2 倍の解像度)で保存する'),
  pdf: (n, t) => `${t ? `「${n}」の表` : 'この図'}だけを、同じ大きさの紙で印刷する(印刷の画面で「PDF に保存」を選ぶと、余白のない PDF になる。Chrome・Edge で使う)`,
};
// 薄く表示している間(構文エラー)は、ボタンを置かない。図のボタンの行は、図の位置が動かないよう、行の場所だけを残して見えなくする
const removePieceButtons = () => {
  canvasEl.querySelectorAll('.tbtns').forEach((x) => x.remove());
  canvasEl.querySelectorAll('.fbtns').forEach((x) => { x.style.visibility = 'hidden'; x.querySelectorAll('button').forEach((b) => { b.disabled = true; }); });
};
function makeButtons(cls, kind, name) {
  const isT = kind === 'table';
  const box = el('div', cls);
  for (const k of isT ? ['copy', 'svg', 'png', 'pdf'] : ['svg', 'png', 'pdf']) {
    const b = el('button', null, k === 'copy' ? 'コピー' : k.toUpperCase());
    b.dataset.piece = `${kind}:${name}|${k}`;
    b.title = PIECE_TIP[k](name, isT);
    b.addEventListener('click', () => pieceAction(kind, name, k, b));
    box.append(b);
  }
  // 下の図に押したことを伝えない(要素を選んだり、選択を外したりしないため)
  for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) box.addEventListener(ev, (e) => e.stopPropagation());
  return box;
}
// 図のボタンは、題の文字の右ではなく、図の上の外側(SVG の外の HTML の行)に、図の左端にそろえて置く(GR13 の追加の直し)。
// 題のタブは文字の幅の表で見積もった幅で描くので、実際の字体が広いと題の文字がタブからはみ出し、題の右に置いたボタンが
// 図(タブの線や右上の expose の区画)に重なるため。表は題で指す(描き直しで表の数が変わっても、押した表を取り違えないため)
const FIG_GAP = 6; // ボタンの行の下端と、図の描いたものの上端の間(px)
function addPieceButtons(r) {
  canvasEl.querySelectorAll('.tbtns,.fbtns').forEach((x) => x.remove());
  const svg = canvasEl.querySelector('svg');
  if (!svg) return;
  if (r.view !== 'grid') {
    const row = makeButtons('fbtns', 'fig', r.scopeName);
    canvasEl.insertBefore(row, svg);
    placeRow(row, svg);
    return;
  }
  for (const a of r.anchors ?? []) {
    const box = makeButtons('tbtns', 'table', a.name);
    canvasEl.append(box);
    placeBox(box, a);
  }
}
// 図の描いたもの(白い下地と defs を除く)の外接矩形の左上。ブラウザの実際の字体で測る
function drawnTopLeft(svg) {
  const W = +svg.getAttribute('width');
  let x = Infinity, y = Infinity;
  for (const c of svg.children) {
    if (c.tagName === 'defs' || (c.tagName === 'rect' && +c.getAttribute('x') === 0 && +c.getAttribute('y') === 0 && +c.getAttribute('width') === W)) continue;
    let b;
    try { b = c.getBBox(); } catch { continue; }
    if (!b.width && !b.height) continue;
    x = Math.min(x, b.x); y = Math.min(y, b.y);
  }
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}
// ボタンの行を図の上に置く。行の下端から FIG_GAP の下に図の描いたものの上端が来るよう、図を引き上げる(図の上の余白の分だけ)。
// 行が重なるのは、図の上の余白(白い下地だけの帯)だけになる
function placeRow(row, svg) {
  const t = drawnTopLeft(svg);
  row.style.marginLeft = `${Math.max(0, t.x)}px`;
  row.style.marginBottom = `${FIG_GAP - Math.max(0, t.y)}px`;
}
function pieceAction(kind, ref, k, btn) {
  // 解析・描き直しの途中なら、保存する図とテキストが食い違うので行わない
  if (debounce !== null || running()) { alert('描き直しの途中です。図が描き終わってから、もう一度押してください'); return; }
  if (!last?.ok || !last.svg || viewEl.classList.contains('stale')) { alert('保存できる図がありません(構文エラーを直してください)'); return; }
  if (kind === 'table') {
    const t = (last.tables ?? []).find((x) => x.name === ref && !x.empty);
    if (!t) { alert(`「${ref}」の表は、今はありません(描き直したら表がなくなりました)`); return; }
    if (k === 'copy') { copyPiece(t.tsv, btn); return; }
    saveImage(t.svg, tableBase({ file: fileBase, title: t.name }), k);
    return;
  }
  saveImage(last.svg, pieceBase({ file: fileBase, view: viewKindEl.value, scope: last.scopeName ?? '' }), k);
}
// ボタンを題の文字に合わせる。文字の枠の中心はフォントによって上下にずれるので使わず、
// 題とボタンの文字の基準線から見た目の中心を求めて(和文の字面の中心は、基準線から文字の大きさの約 0.38 倍上)、中心どうしをそろえる
const GLYPH_MID = 0.38;
function placeBox(box, a) {
  const svg = canvasEl.querySelector('svg');
  const texts = svg ? [...svg.querySelectorAll('text')].filter((t) => t.textContent === a.label) : [];
  if (!texts.length) { box.remove(); return; }
  const near = texts.reduce((q, t) => (Math.abs(+t.getAttribute('y') - a.y) < Math.abs(+q.getAttribute('y') - a.y) ? t : q));
  const c = canvasEl.getBoundingClientRect(), tr = near.getBoundingClientRect();
  // 題の文字の基準線(SVG の座標 y を画面の座標にする。表の題は translate の中にないので、SVG の左上からの y のまま)
  const sv = svg.getBoundingClientRect();
  const titleMid = sv.top - c.top + +near.getAttribute('y') - GLYPH_MID * +near.getAttribute('font-size');
  // ボタンの文字の基準線: ボタンの中に置いた大きさ 0 の印の下端
  const btn = box.querySelector('button');
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  btn.append(mark);
  const bb = mark.getBoundingClientRect().bottom - box.getBoundingClientRect().top;
  mark.remove();
  box.style.left = `${tr.right - c.left + 6}px`;
  let top = titleMid + GLYPH_MID * parseFloat(getComputedStyle(btn).fontSize) - bb;
  // 表の本体(罫線と文字)と重ならないよう、ボタンの下端を本体の上端より 2 px 上に収める(題の行の中。GR13 の追加の直し)
  if (a.bodyTop != null) top = Math.min(top, sv.top - c.top + a.bodyTop - 2 - box.getBoundingClientRect().height);
  box.style.top = `${top}px`;
}
// 図または表を 1 つだけ、同じ大きさの紙(余白 0)で印刷する(ブラウザの「PDF に保存」で、余白のない PDF になる)。アプリの中で PDF は作らない
// 画面の図と id(矢じりの marker など)が重ならないように、印刷する SVG の id を付け替える
// 付け替えは属性の中だけに当て、文字の内容には当てない(GR18 の S3。src/app/io.js の printIds)
const uniqIds = printIds;
function printOne(svg, base) {
  const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg).map(Number);
  const area = $('#printArea');
  area.textContent = '';
  const pg = el('div', 'page'); pg.style.width = `${w}px`; pg.style.height = `${h}px`; pg.innerHTML = uniqIds(svg.replace(/^<\?xml[^>]*>\n?/, ''), 'p1-'); area.append(pg);
  let st = $('#pageOne');
  if (!st) { st = document.createElement('style'); st.id = 'pageOne'; document.head.append(st); }
  st.textContent = `@media print{@page{size:${w}px ${h}px;margin:0}}`;
  const title = document.title; document.title = base; // 「PDF に保存」のファイル名の候補になる
  try { window.print(); } finally { document.title = title; }
}
// 印刷が終わったら、紙の指定と印刷する図を片づける
window.addEventListener('afterprint', () => { $('#printArea').textContent = ''; const st = $('#pageOne'); if (st) st.textContent = ''; });
function saveImage(svg0, base, kind) {
  const svg = pieceSvg(svg0); // data-*・当たり判定の層を除き、紙の大きさの指定を入れたもの(原文は入れない)
  if (kind === 'pdf') { printOne(svg, base); return; }
  if (kind === 'svg') { download(`${base}.svg`, new Blob([svg], { type: 'image/svg+xml' })); return; }
  const scale = 2;
  const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg).map(Number);
  const big = () => alert('画像が大きすぎて PNG にできませんでした。SVG で保存してください');
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    URL.revokeObjectURL(url);
    try {
      const c = document.createElement('canvas'); c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
      const g = c.getContext('2d');
      if (!g) { big(); return; }
      g.scale(scale, scale); g.drawImage(img, 0, 0);
      c.toBlob((b) => { if (b) download(`${base}.png`, b); else big(); }, 'image/png');
    } catch { big(); }
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG の作成に失敗しました'); };
  img.src = url;
}
// 表をタブ区切りの文字でクリップボードに写す。写したら「コピーしました」を 2 秒出して元の文に戻す(続けて押したときも元の文に戻す)
const copyTimers = new WeakMap();
async function copyPiece(text, btn) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
  clearTimeout(copyTimers.get(btn));
  btn.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
  copyTimers.set(btn, setTimeout(() => { btn.textContent = btn.dataset.label; }, 2000));
}

// ---- 段階 0: 図の要素をクリックすると、その要素を選び、テキストの該当範囲を選択して見えるところまで送る(設計書 8 章)
canvasEl.addEventListener('click', (e) => {
  if (connecting) { pickEnd(e); return; } // 接続を足す途中は、図のクリックで端を選ぶ(GR16 の A)
  const g = e.target.closest('[data-id]');
  if (!g || !canvasEl.contains(g)) { select(null); return; }
  select(g.getAttribute('data-id'));
  const r = e.target.closest('[data-start]') ?? g;
  const s = +r.getAttribute('data-start'), t = +r.getAttribute('data-end');
  if (Number.isFinite(s) && Number.isFinite(t) && r.hasAttribute('data-start')) selectText(s, t);
});
function select(id) {
  selectedId = id;
  selectedSrc = null;
  canvasEl.querySelectorAll('g.selected').forEach((g) => g.classList.remove('selected'));
  editEl.textContent = '';
  editEl.classList.remove('on');
  if (!id || !shown) return;
  canvasEl.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((g) => g.classList.add('selected'));
  const st = shown.structure;
  const item = id === 'frame' ? st.frame : st.nodes.find((n) => n.id === id) ?? st.edges.find((x) => x.id === id);
  const info = item?.info;
  // 原文の範囲を選び直すときの元のテキスト(フォルダのときは、ファイルをつないだテキスト。GR20 の F)
  if (item?.src) selectedSrc = { src: item.src, kind: info?.kind ?? null, text: folder ? resultCombined : resultText };
  editEl.append(el('span', 'kind', info ? info.kind : (item?.symbol ?? '')));
  editEl.append(el('span', null, info?.name ? `名前: ${info.name}` : '名前なし'));
  if (info?.qname) editEl.append(el('span', 'q', `修飾名: ${info.qname}`));
  if (item?.symbol) editEl.append(el('span', 'small', `記号: ${item.symbol}`));
  editEl.classList.add('on');
  if (last?.rename && info && item?.src) askRenameInfo(id, item);
  if ((last?.edit16?.A || last?.edit16?.X) && info && item?.src) askEditInfo(id, item);
}
function reselect() {
  // 追加・削除の後は、足した要素か消した要素の持ち主を選ぶ(GR16 の A・X。見つからなければ何も選ばない)
  if (wantSelect && wantSelect.text === curKey() && shown) {
    const w = wantSelect;
    wantSelect = null;
    const st = shown.structure;
    const hit = w.select && [...st.nodes, ...st.edges].find((n) => n.src && n.src[0] === w.select.start && n.src[1] === w.select.end && n.info?.kind === w.select.kind);
    select(hit && canvasEl.querySelector(`[data-id="${CSS.escape(hit.id)}"]`) ? hit.id : null);
    return;
  }
  // テキストを書き換えた後は、図の要素の番号でなく、原文の範囲(書き換えた分だけずらしたもの)と種類で選び直す(GR18 の E5)
  if (selectedSrc && shown) {
    const w = selectedSrc;
    const src = w.text != null && resultText != null ? (folder ? mapRange(w.text, resultCombined, w.src) : mapRange(w.text, resultText, w.src)) : w.src;
    const id = src ? findBySource(shown.structure, src, w.kind) : null;
    select(id && canvasEl.querySelector(`[data-id="${CSS.escape(id)}"]`) ? id : null);
    return;
  }
  if (selectedId && shown && canvasEl.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)) select(selectedId); else select(null);
}

// start・end は、ふつうはつないだテキストの中の位置(範囲を持つ診断・図の要素のクリック)。フォルダのときに file(ファイルの番号)を
// 渡すと、start・end をそのファイルの中の位置として読み、そのファイルに切り替える(行だけを持つ診断・構文エラーのクリック。GR22 の A1)
// (GR24: file はファイルそのもの(item)。結果のファイルの番号は resultItems でファイルに戻す。名前の変更などで並びが変わっても取り違えない)
function selectText(start, end, file = null) {
  if (folder && file && folder.files.includes(file)) setCurrentItem(file);
  // フォルダのときは、つないだテキストの位置を、そのファイルの中の位置にして、そのファイルに切り替える(GR20 の F)
  else if (folder && resultFolder) {
    const k = resultFolder.files.findIndex((f) => f.base <= start && start <= f.end);
    const it = k >= 0 ? resultItems?.[k] : null;
    if (it && folder.files.includes(it)) { setCurrentItem(it); const b = resultFolder.files[k].base; start -= b; end -= b; }
  }
  srcEl.focus();
  srcEl.setSelectionRange(start, end);
  const line = srcEl.value.slice(0, start).split('\n').length;
  srcEl.scrollTop = Math.max(0, (line - 4) * LINE_PX);
  scrollToX(srcEl, start, end);
  syncScroll(); // 色付けの層(#hl)も、縦と横を合わせる
}
// 横の送り(GR26 の P5 の S。設計書 9.2 節・9.5 節の「移動」): 選んだ字句がテキスト欄の見える範囲に入るよう、横に送る。すでに見えていれば
// 変えない。見えていなければ、字句の始まりが見える幅の左から 4 分の 1 に来るように送る。字句の位置は、行の始まりから字句の始まりまでの
// 文字の幅を、テキスト欄と同じフォント(getComputedStyle の font)で canvas の measureText で測り、タブは tab-size に合わせて数え、左の余白
// (padding-left)を足して求める(src/app/modeltree.js の textX)。測れないブラウザでは、横の送りは変えない
let measureCtx = null;
function scrollToX(area, start, end) {
  const cs = window.getComputedStyle?.(area);
  if (!cs) return;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext?.('2d') ?? null;
  if (!measureCtx) return;
  measureCtx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
  const measure = (t) => measureCtx.measureText(t).width;
  const ts = String(cs.tabSize ?? '4');
  const tabW = /px$/.test(ts) ? parseFloat(ts) : (parseFloat(ts) || 4) * measure(' ');
  const v = area.value;
  const ls = v.lastIndexOf('\n', start - 1) + 1;
  const pad = parseFloat(cs.paddingLeft) || 0;
  const left = pad + textX(v.slice(ls, start), measure, tabW);
  const right = pad + textX(v.slice(ls, Math.max(start, end)).split('\n')[0], measure, tabW);
  const W = area.clientWidth || 0;
  if (!W) return;
  if (left >= area.scrollLeft && right <= area.scrollLeft + W) return;
  area.scrollLeft = Math.max(0, Math.round(left - W / 4));
}
// 行だけを持つ診断の行き先のファイル(フォルダのとき。ファイルが分からなければ今のファイル)。1 つのテキストなら null。
// file は結果のファイルの番号で、resultItems でファイルに戻す(GR24)
const fileOfDiag = (file) => {
  if (!folder) return null;
  const it = file != null && file >= 0 ? resultItems?.[file] : null;
  return it && folder.files.includes(it) ? it : folder.files[folder.cur] ?? null;
};
function gotoLine(line, file = null) {
  // フォルダのときは、そのファイルに切り替え(GR20 の F)、そのファイルの中の位置として選ぶ(つないだテキストの位置として読み直さない。GR22 の A1)
  const k = fileOfDiag(file);
  if (k != null) setCurrentItem(k);
  const lines = srcEl.value.split('\n');
  let pos = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  selectText(pos, pos + (lines[line - 1]?.length ?? 0), k);
}
// 構文エラーのクリック: 行と列の位置の字句を選ぶ(GR22 の B5。字句の範囲は src/app/diag.js の tokenRange)。フォルダのときは A1 の経路
function gotoToken(line, col, file = null) {
  const k = fileOfDiag(file);
  if (k != null) setCurrentItem(k);
  const [s, e] = tokenRange(srcEl.value, line, col);
  selectText(s, e, k);
}

// ---- 範囲を view として書き足す(GR15 の V。設計書 5 章・9.1 節)。上の帯の「範囲」の選択欄の右のボタン。
// 範囲が view のとき、名前で指せない範囲のとき、構文エラーがある間は押せない。押すと Worker が書き足す編集(1 か所の挿入)を作り、
// 画面がテキスト欄に document.execCommand('insertText') で入れる(テキスト欄の取り消し Ctrl+Z の 1 回で戻せる。入れられないブラウザ
// では setRangeText で入れ、そのときは取り消しで戻せない)。次の解析で、範囲を書き足した view に切り替える
const appendBtn = $('#btnAppendView');
function updateAppendButton(r) {
  appendBtn.hidden = r.ok && r.append === null; // コマンドを入れていないビルド(src/edit/index.js の EDIT15.V)
  const ok = !!(r.ok && r.append?.enabled);
  appendBtn.disabled = !ok;
  appendBtn.title = ok ? '描いている範囲を view として、テキストに書き足す(テキスト欄の Ctrl+Z で戻せる)'
    : `今は押せない: ${r.ok ? r.append?.reason ?? '描く範囲がない' : 'テキストに構文エラーがある'}`;
}
appendBtn.addEventListener('click', () => {
  if (running() || curKey() !== resultText) { alert('描き直しの途中です。図が描き終わってから、もう一度押してください'); return; }
  if (!last?.ok || !last.candidate) return;
  runner.request({ type: 'appendView', id: ++appendSeq, text: curKey(), candidateId: last.candidate.id, view: viewKindEl.value });
});
// ---- 名前の変更(GR15 の E。設計書 8 章の段階 1・9.1 節)。図で選んだ要素の編集欄に、名前と短い名前の入力欄と「変更」のボタンを出す。
// 確定すると Worker が書き換え(書き換えた箇所をすべて含む 1 か所の置き換え)を作り、画面がテキスト欄に execCommand('insertText') で
// 入れる(テキスト欄の Ctrl+Z の 1 回で戻せる。入れられないブラウザでは setRangeText で入れ、そのときは取り消しで戻せない)。
// 図は描き直され、選んだ要素は選んだまま(Worker が返す、書き換えた後の原文の範囲と種類で選び直す。GR18 の W2)。拒否したときは、理由を編集欄に出し、テキストを変えない。
// テキストに構文エラーがある間(図を薄く出している間)は、編集欄を使えない
let renameSeq = 0, renameTarget = null;
function askRenameInfo(id, item) {
  renameTarget = { id, src: item.src, kind: item.info.kind, seq: ++renameSeq };
  runner.request({ type: 'renameInfo', id: renameTarget.seq, text: curKey(), src: item.src, kind: item.info.kind });
}
function onRenameInfo(m) {
  if (!renameTarget || m.id !== renameTarget.seq || selectedId !== renameTarget.id) return;
  const box = el('div', 'rename');
  if (!m.ok) { box.append(el('span', 'small', `名前の変更: ${m.reason}`)); editEl.append(box); return; }
  const stale = viewEl.classList.contains('stale');
  const field = (label, value, which) => {
    const lab = el('label', null, `${label} `);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = value ?? ''; inp.disabled = stale || value == null; inp.dataset.which = which;
    inp.title = value == null ? `${label}を宣言していない要素なので、${label}は変えられない` : `新しい${label}を書いて「変更」を押す(Enter でも変更する)`;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doRename(); } });
    lab.append(inp);
    return lab;
  };
  const btn = el('button', null, '変更');
  btn.disabled = stale;
  btn.title = stale ? 'テキストに構文エラーがある間は、名前を変えられない' : '名前を変え、それを参照している箇所も書き換える(テキスト欄の Ctrl+Z で戻せる)';
  const msg = el('span', 'small rmsg');
  box.append(field('名前', m.name, 'name'), field('短い名前', m.shortName, 'shortName'), btn, msg);
  editEl.append(box);
  const before = { name: m.name, shortName: m.shortName };
  function doRename() {
    if (viewEl.classList.contains('stale')) { msg.textContent = 'テキストに構文エラーがある間は、名前を変えられない'; return; }
    if (running() || curKey() !== resultText) { msg.textContent = '描き直しの途中です。図が描き終わってから、もう一度押してください'; return; }
    const changed = [...box.querySelectorAll('input')].filter((x) => !x.disabled && x.value !== (before[x.dataset.which] ?? ''));
    if (!changed.length) { msg.textContent = '名前が変わっていない'; return; }
    if (changed.length > 1) { msg.textContent = '名前と短い名前は、1 つずつ変えてください'; return; }
    msg.textContent = '';
    const seq = ++renameSeq;
    renameTarget = { ...renameTarget, seq, msg };
    runner.request({ type: 'rename', id: seq, text: curKey(), src: renameTarget.src, kind: renameTarget.kind, which: changed[0].dataset.which, newName: changed[0].value });
  }
  btn.addEventListener('click', doRename);
}
function onRenamed(m) {
  if (!renameTarget || m.id !== renameTarget.seq) return;
  const msg = renameTarget.msg;
  if (!m.ok) { if (msg) msg.textContent = `変えられませんでした: ${m.reason}${m.details?.length ? `(${m.details.slice(0, 3).join('、')}${m.details.length > 3 ? ' …' : ''})` : ''}`; return; }
  if (curKey() !== resultText) { if (msg) msg.textContent = 'テキストが変わったので、名前を変えませんでした。もう一度押してください'; return; }
  // 名前を変えた要素を選んだままにする(GR17 までの動き。GR18 指示書 2.6 節の W2)。書き換えは宣言から最後の参照までの 1 か所の置き換えで、要素の範囲に
  // 重なるので、範囲をずらす選び直し(E5)では見つからない。追加・削除と同じく、Worker が返す書き換えた後の範囲と種類で選ぶ(GR18 の W2)
  const e = m.edit;
  // フォルダのとき(GR21 の X): 書き換えたすべてのファイルに入れ(複数のファイルなら、つながった 1 つの履歴)、名前を変えた要素のファイルを表示する
  if (folder && m.edits) { if (m.select) wantSelect = { text: afterEdits(m.edits), select: m.select }; applyFolderEdits(m.edits, m.home); return; }
  if (m.select) wantSelect = { text: afterEdit(e), select: m.select };
  insertEdit(m.edit);
}
// 書き換え e の後の、今のテキスト(curKey と同じ形)。フォルダのときは、e.file のファイルを書き換えたもの(GR20 の F)
function afterEdit(e) {
  if (!folder || e.file == null) return srcEl.value.slice(0, e.start) + e.text + srcEl.value.slice(e.end);
  return afterEdits([e]);
}
// フォルダのときの、ファイルごとの書き換え edits の後の今のテキスト(GR21 の X)
function afterEdits(edits) {
  return folderKey(folder.files.map((f, i) => { const e = edits.find((x) => x.file === i); return { path: f.path, text: e ? f.el.value.slice(0, e.start) + e.text + f.el.value.slice(e.end) : f.el.value }; }));
}
// テキスト欄の start〜end を text に置き換える(取り消しの 1 回で戻せるように execCommand('insertText') で入れる)。
// フォルダのときは、書き換えるファイル(e.file)に切り替えてから入れる(書き換えた後は、そのファイルを表示する。設計書 8 章)
function insertEdit(e) {
  // フォルダのときは、書き換えるファイル(e.file)のテキストを書き換え、アプリの取り消しの履歴に 1 回の操作として入れる(GR21 の H)。
  // 書き換えた後は、そのファイルを表示する
  // (1 つのテキストの経路の原文の形を変えないよう、波括弧を使わない形にする。GR21 P1 のオーナーの裁定)
  if (folder && e.file != null && e.file >= 0 && e.file < folder.files.length) return applyFolderEdits([e], e.file);
  srcEl.focus();
  srcEl.setSelectionRange(e.start, e.end);
  let done = false;
  try { done = document.execCommand('insertText', false, e.text); } catch { done = false; }
  if (!done) { srcEl.setRangeText(e.text, e.start, e.end, 'end'); srcEl.dispatchEvent(new Event('input')); }
}
function onAppended(m) {
  if (m.id !== appendSeq) return;
  if (!m.ok) { alert(`view を書き足せませんでした: ${m.reason}${m.details?.length ? `\n${m.details.join('\n')}` : ''}`); return; }
  if (curKey() !== resultText) { alert('テキストが変わったので、view を書き足しませんでした。もう一度押してください'); return; }
  wantScope = m.viewCandidate;
  insertEdit(m.edits[0]);
}

// ---- 図からの編集の段階 2・3(GR16 の A・X。設計書 8 章・9.1 節、GR16 指示書 3.3 節)。選んだ要素の編集欄に、その要素が受け付ける
// 操作だけを出す: 「部品を足す」「ポートを足す」(名前・型・向き・共役)、相互接続ビューの「接続を足す」(押した後に図でポートか部品を
// 2 つ選び、形と名前を入れる)、「削除」(消す要素と一緒に消すものの一覧を出し、「消す」で確定)。書き換えは Worker が作り、名前の変更と
// 同じく insertEdit で入れる(テキスト欄の Ctrl+Z の 1 回で戻せる)。図を描き直したら、足した要素か消した要素の持ち主を選ぶ。
// 拒否したときは理由を編集欄に出し、テキストを変えない。テキストに構文エラーがある間は使えない
let editSeq = 0, editTarget = null;
function askEditInfo(id, item) {
  editTarget = { id, src: item.src, kind: item.info.kind, seq: ++editSeq };
  runner.request({ type: 'editInfo', id: editTarget.seq, text: curKey(), src: item.src, kind: item.info.kind, view: viewKindEl.value });
}
const busy = () => running() || curKey() !== resultText;
const BUSY = '描き直しの途中です。図が描き終わってから、もう一度押してください';
const details = (m) => (m.details?.length ? `(${m.details.slice(0, 5).join('、')}${m.details.length > 5 ? ` ほか ${m.details.length - 5} か所` : ''})` : '');
function opsBox() {
  let box = editEl.querySelector('.ops');
  if (!box) { box = el('div', 'ops'); editEl.append(box); }
  return box;
}
function onEditInfo(m) {
  if (!editTarget || m.id !== editTarget.seq || selectedId !== editTarget.id) return;
  if (!m.ok || !(m.part || m.port || m.connect || m.del)) return;
  const target = editTarget;
  const stale = viewEl.classList.contains('stale');
  const box = opsBox();
  box.textContent = '';
  const btns = el('div', 'opbtns');
  const form = el('div', 'opform');
  const msg = el('span', 'small rmsg');
  const button = (label, title, f) => { const b = el('button', null, label); b.title = stale ? 'テキストに構文エラーがある間は、図から編集できない' : title; b.disabled = stale; b.addEventListener('click', f); btns.append(b); return b; };
  const typeSelect = (list) => {
    const sel = document.createElement('select');
    sel.append(new Option('(型なし)', ''));
    list.forEach((t, i) => { const o = new Option(t.written, String(i)); o.disabled = !t.usable; o.title = t.usable ? t.qname : `選べない: ${t.reason}`; sel.append(o); });
    return sel;
  };
  const nameInput = (ph) => { const i = document.createElement('input'); i.type = 'text'; i.placeholder = ph; return i; };
  const labeled = (label, x) => { const l = el('label', null, `${label} `); l.append(x); return l; };
  const send = (msgObj) => {
    if (viewEl.classList.contains('stale')) { msg.textContent = 'テキストに構文エラーがある間は、図から編集できない'; return; }
    if (busy()) { msg.textContent = BUSY; return; }
    msg.textContent = '';
    editPending = { seq: ++editSeq, msg, label: msgObj.type === 'delete' ? '消せませんでした' : '足せませんでした' };
    runner.request({ ...msgObj, id: editPending.seq, text: curKey() });
  };
  const openForm = (fields, okLabel, onOk) => {
    form.textContent = '';
    const ok = el('button', null, okLabel), cancel = el('button', null, 'やめる');
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', () => { form.textContent = ''; msg.textContent = ''; });
    fields.forEach((f) => f.querySelector?.('input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } }));
    form.append(...fields, ok, cancel);
  };
  if (m.part) button('部品を足す', '選んだ要素の本体の最後に part を足す(テキスト欄の Ctrl+Z で戻せる)', () => {
    const name = nameInput('名前(必須)'), type = typeSelect(m.partTypes);
    openForm([labeled('名前', name), labeled('型', type)], '足す', () => {
      if (!name.value) { msg.textContent = '名前を入れてください'; return; }
      send({ type: 'add', op: 'part', src: target.src, kind: target.kind, name: name.value, typeIndex: type.value === '' ? null : Number(type.value) });
    });
    name.focus();
  });
  if (m.port) button('ポートを足す', '選んだ要素の本体の最後に port を足す(テキスト欄の Ctrl+Z で戻せる)', () => {
    const name = nameInput('名前(必須)'), type = typeSelect(m.portTypes);
    const dir = document.createElement('select');
    for (const d of ['', 'in', 'out', 'inout']) dir.append(new Option(d || '(なし)', d));
    const conj = document.createElement('input'); conj.type = 'checkbox'; conj.disabled = true; conj.title = '型を選ぶと、共役(~)にできる';
    type.addEventListener('change', () => { conj.disabled = type.value === ''; if (conj.disabled) conj.checked = false; });
    openForm([labeled('向き', dir), labeled('名前', name), labeled('型', type), labeled('共役 ~', conj)], '足す', () => {
      if (!name.value) { msg.textContent = '名前を入れてください'; return; }
      send({ type: 'add', op: 'port', src: target.src, kind: target.kind, name: name.value, typeIndex: type.value === '' ? null : Number(type.value), conjugated: conj.checked, direction: dir.value });
    });
    name.focus();
  });
  if (m.connect) button('接続を足す', '押した後に、図でポートか部品を 2 つ順に選ぶ(Esc でやめる)', () => startConnect());
  if (m.del) button('削除', '消す要素と一緒に消すものの一覧を出す(「消す」を押すまで消さない)', () => {
    if (busy()) { msg.textContent = BUSY; return; }
    form.textContent = '';
    msg.textContent = '';
    planPending = { seq: ++editSeq, form, msg, target };
    runner.request({ type: 'deletePlan', id: planPending.seq, text: curKey(), src: target.src, kind: target.kind });
  });
  box.append(btns, form, msg);
}
let editPending = null, planPending = null;
function onDeletePlan(m) {
  if (!planPending || m.id !== planPending.seq) return;
  const { form, msg, target } = planPending;
  planPending = null;
  if (!m.ok) { msg.textContent = `消せません: ${m.reason}${details(m)}`; return; }
  form.textContent = '';
  const list = el('ul', 'plan');
  for (const x of m.items) {
    const li = el('li', null, `${x.role === 'target' ? '消す' : '一緒に消す'}: ${x.path ? `${x.path} ` : ''}${x.line} 行 ${x.text}`);
    li.title = x.kind;
    list.append(li);
  }
  const ok = el('button', null, '消す'), cancel = el('button', null, 'やめる');
  ok.addEventListener('click', () => {
    if (viewEl.classList.contains('stale')) { msg.textContent = 'テキストに構文エラーがある間は、図から編集できない'; return; }
    if (busy()) { msg.textContent = BUSY; return; }
    editPending = { seq: ++editSeq, msg, label: '消せませんでした' };
    runner.request({ type: 'delete', id: editPending.seq, text: curKey(), src: target.src, kind: target.kind });
  });
  cancel.addEventListener('click', () => { form.textContent = ''; msg.textContent = ''; });
  form.append(list, ok, cancel);
}
function onEdited(m) {
  if (!editPending || m.id !== editPending.seq) return;
  const { msg, label } = editPending;
  editPending = null;
  if (!m.ok) { if (msg) msg.textContent = `${label}: ${m.reason}${details(m)}`; endConnect(); return; }
  if (curKey() !== resultText) { if (msg) msg.textContent = 'テキストが変わったので、書き換えませんでした。もう一度押してください'; endConnect(); return; }
  endConnect();
  const e = m.edit;
  // フォルダの削除(GR21 の X): 書き換えたすべてのファイルに入れ、消した要素のファイル(持ち主を選ぶ)を表示する
  if (folder && m.edits) { wantSelect = { text: afterEdits(m.edits), select: m.select ?? null }; applyFolderEdits(m.edits, m.home); return; }
  wantSelect = { text: afterEdit(e), select: m.select ?? null };
  insertEdit(e);
}
// 接続を足す途中: 図の上に帯を出し、ポートか部品を 2 つ選ばせる。Esc か「やめる」で抜ける
function startConnect() {
  if (busy()) return;
  endConnect();
  connecting = { text: curKey(), ends: [], seq: 0 };
  viewEl.classList.add('connecting');
  const bar = el('div', 'connectbar');
  bar.id = 'connectBar';
  viewEl.parentNode.insertBefore(bar, viewEl);
  connectBar('接続を足す: 1 つ目の端(ポートか部品)を図で選んでください');
}
function connectBar(text, extra = []) {
  const bar = $('#connectBar');
  if (!bar) return;
  bar.textContent = '';
  const cancel = el('button', null, 'やめる');
  cancel.title = '接続を足すのをやめる(Esc)';
  cancel.addEventListener('click', endConnect);
  bar.append(el('span', null, text), ...extra, cancel);
}
function endConnect() {
  if (!connecting) return;
  connecting = null;
  viewEl.classList.remove('connecting');
  canvasEl.querySelectorAll('g.picked').forEach((g) => g.classList.remove('picked'));
  $('#connectBar')?.remove();
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && connecting) { e.preventDefault(); endConnect(); } });
// 図の箱の入れ子をたどった並び(描く範囲の外側の箱から、選んだ箱まで)
function nodePath(st, node) {
  const byId = new Map(st.nodes.map((n) => [n.id, n]));
  const path = [];
  for (let n = node; n; n = n.parent ? byId.get(n.parent) : null) { if (!n.src || !n.info) return null; path.unshift({ src: n.src, kind: n.info.kind }); }
  return path;
}
function pickEnd(e) {
  if (!shown || connecting.ends.length >= 2) return;
  const g = e.target.closest('[data-id]');
  const id = g && canvasEl.contains(g) ? g.getAttribute('data-id') : null;
  const st = shown.structure;
  const node = id ? st.nodes.find((n) => n.id === id) : null;
  if (!node || !/(PortUsage|PartUsage)$/.test(node.info?.kind ?? '')) { connectBar(`接続を足す: ポートか部品を選んでください(${connecting.ends.length + 1} つ目の端)`); return; }
  const path = nodePath(st, node);
  if (!path) { connectBar('接続を足す: この箱は原文の要素でないので、端にできない'); return; }
  if (connecting.ends.some((x) => x.id === id)) { connectBar('接続を足す: 2 つの端が同じ。別のポートか部品を選んでください'); return; }
  connecting.ends.push({ id, path, label: node.info.name ?? node.label ?? id });
  canvasEl.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((x) => x.classList.add('picked'));
  if (connecting.ends.length === 1) { connectBar(`接続を足す: 1 つ目の端「${connecting.ends[0].label}」。2 つ目の端を図で選んでください`); return; }
  connecting.seq = ++editSeq;
  connectBar('接続を足す: 形を調べています');
  runner.request({ type: 'connectInfo', id: connecting.seq, text: curKey(), ends: connecting.ends.map((x) => x.path) });
}
function onConnectInfo(m) {
  if (!connecting || m.id !== connecting.seq) return;
  if (!m.ok) { connectBar(`接続を足せません: ${m.reason}`); return; }
  const [a, b] = connecting.ends;
  const formSel = document.createElement('select');
  formSel.append(new Option('connect', 'connect'));
  (m.ifaceTypes ?? []).forEach((t, i) => { const o = new Option(`interface : ${t.written}`, String(i)); o.disabled = !t.usable; o.title = t.usable ? t.qname : `選べない: ${t.reason}`; formSel.append(o); });
  const name = document.createElement('input'); name.type = 'text'; name.placeholder = '名前(なしも可)'; name.disabled = true;
  name.title = '名前を付けるのは interface の形だけ';
  formSel.addEventListener('change', () => { name.disabled = formSel.value === 'connect'; if (name.disabled) name.value = ''; });
  const msg = el('span', 'small rmsg');
  const ok = el('button', null, '足す');
  const go = () => {
    if (busy()) { msg.textContent = BUSY; return; }
    const iface = formSel.value !== 'connect';
    editPending = { seq: ++editSeq, msg: null, label: '足せませんでした' };
    editPending.msg = { set textContent(t) { connectFail(t); } };
    runner.request({ type: 'connect', id: editPending.seq, text: curKey(), ends: connecting.ends.map((x) => x.path), form: iface ? 'interface' : 'connect', name: iface ? name.value : null, typeIndex: iface ? Number(formSel.value) : null });
  };
  ok.addEventListener('click', go);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  const lab = (t, x) => { const l = el('label', null, ` ${t} `); l.append(x); return l; };
  connectBar(`接続を足す: 「${a.label}」と「${b.label}」`, [lab('形', formSel), lab('名前', name), ok, msg]);
}
// 接続を足せなかった理由は、途中の帯が消えるので、編集欄に出す
function connectFail(t) { const box = opsBox(); let m = box.querySelector('.rmsg'); if (!m) { m = el('span', 'small rmsg'); box.append(m); } m.textContent = t; }

// ---- テキスト欄
function updateHighlight() {
  hlEl.innerHTML = renderHl(srcEl.value, { scrollTop: srcEl.scrollTop, height: srcEl.clientHeight, lineHeight: LINE_PX, padding: 10 });
  syncScroll();
}
function syncScroll() { hlEl.scrollTop = srcEl.scrollTop; hlEl.scrollLeft = srcEl.scrollLeft; }
// スクロールしたら、すぐに位置を合わせ、色付けする範囲は画面の描き直しの単位で 1 回だけ作り直す
let hlFrame = 0;
const scheduleHighlight = () => { if (!hlFrame) hlFrame = requestAnimationFrame(() => { hlFrame = 0; updateHighlight(); }); };
window.addEventListener('resize', scheduleHighlight);
// テキスト欄の出来事(1 つのテキストの #src と、フォルダのファイルごとのテキスト欄に同じものを付ける。GR20 の F)
function wireArea(area) {
  area.addEventListener('scroll', () => { syncScroll(); scheduleHighlight(); });
  area.addEventListener('input', (e) => {
    const f = folder?.items.find((x) => x.el === area);
    // フォルダのときは、手で打った書き換えをアプリの履歴に入れる(GR21 の H。日本語の変換中は確定するまで入れない)
    if (f) { if (!f.composing) { folder.history.typed(f.id, f.shadow, area.value, area.selectionEnd, e?.inputType ?? null); f.shadow = area.value; fileMsg(''); } refreshDirty(f); }
    else { original.edited = true; dirty = true; }
    modelStale(); // 解析が終わるまで、モデルツリーと参照箇所を古い解析の印で出す(GR26 の N)
    updateHighlight();
    clearTimeout(debounce);
    // 待ちが終わって描き直しを始めるときに印を解く(GR15 の B。解かないと、保存のボタンが「描き直しの途中」のままになる)
    debounce = setTimeout(() => { debounce = null; analyze(); }, 250);
  });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const s = area.selectionStart, t = area.selectionEnd;
      area.setRangeText('    ', s, t, 'end');
      area.dispatchEvent(new Event('input'));
    }
  });
}
wireArea(singleEl);
// フォルダのファイルのテキスト欄だけに付ける、アプリの取り消しの履歴の出来事(GR21 の H。設計書 9.4 節の「取り消しの履歴」)。
// 1 つのテキストの #src には付けない(今のままブラウザの取り消しを使う)。Ctrl+Z を取り消し、Ctrl+Y と Ctrl+Shift+Z をやり直しとし、
// 右クリックの「元に戻す」「やり直し」(beforeinput の historyUndo・historyRedo)も同じ履歴を使う。どれもブラウザの取り消しを止める
// (preventDefault)。日本語の変換中(compositionstart から compositionend まで)は扱わない(右クリックの「元に戻す」も、何もしない。GR22 の A2)
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
function wireHistory(area, f) {
  const k = () => f.id; // 取り消しの履歴の鍵はファイルの通し番号(GR24。名前の変更・移動で引き継ぐ)
  area.addEventListener('keydown', (e) => {
    if (!folder || f.composing || e.isComposing) return;
    const key = (e.key ?? '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'z') { e.preventDefault(); historyStep(k(), e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'y') { e.preventDefault(); historyStep(k(), 'redo'); return; }
    if (NAV_KEYS.has(e.key)) folder.history.cut(k()); // カーソルの移動でまとまりを切る
  });
  area.addEventListener('beforeinput', (e) => {
    if (!folder) return;
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      // 日本語の変換中は、ブラウザの取り消しも、アプリの取り消しも行わない(GR22 の A2。設計書 9.4 節)
      if (f.composing || e.isComposing) return;
      historyStep(k(), e.inputType === 'historyUndo' ? 'undo' : 'redo');
    }
  });
  area.addEventListener('mousedown', () => { if (folder) folder.history.cut(k()); }); // クリックでカーソルを動かす
  area.addEventListener('compositionstart', () => { if (!folder) return; f.composing = true; folder.history.cut(k()); });
  area.addEventListener('compositionend', () => { if (folder) endComposing(f); });
  // テキスト欄からフォーカスが外れたときも、変換中の印を解く(GR22 の A2。印が残って履歴が止まらないようにする)
  area.addEventListener('blur', () => { if (folder && f.composing) endComposing(f); });
}
// 変換中の印を解く(compositionend・テキスト欄の blur・ほかのファイルへの切り替え。GR22 の A2)。変換中の書き換えが履歴にも f.shadow にも
// 入らないまま残らないよう、今のテキスト欄の中身を、確定した文字と同じ扱いで 1 つの履歴にする(テキストが変わっていなければ何もしない)
function endComposing(f) {
  f.composing = false;
  folder.history.composed(f.id, f.shadow, f.el.value, f.el.selectionEnd);
  f.shadow = f.el.value;
  refreshDirty(f);
}
// ファイル f のテキストを text にする(取り消し・やり直し・図からの編集。テキスト欄の input の出来事は起こさない)。書き換えの印を決め直し、
// 待ち時間の後に解析し直す(手で打ったときと同じ)
function setFileText(f, text) {
  f.el.value = text;
  f.shadow = f.el.value;
  refreshDirty(f);
  modelStale(); // GR26 の N(取り消し・やり直し・図からの編集でも、解析が終わるまで古い解析の印)
  if (f.el === srcEl) updateHighlight();
  clearTimeout(debounce);
  debounce = setTimeout(() => { debounce = null; analyze(); }, 250);
}
// 取り消し・やり直し(つながった履歴なら、すべてのファイルで戻す)。止めたときは理由をテキスト欄の上の相対パスの右に出す。
// k はファイルの通し番号(GR24)
function historyStep(k, which) {
  const r = folder.history[which](k, (id) => itemById(id)?.el?.value ?? '');
  if (!r.ok) { if (r.reason) fileMsg(r.reason); return; }
  fileMsg('');
  for (const c of r.changes) setFileText(itemById(c.k), c.text);
  // カーソルを、取り消し・やり直しで書き換えた箇所に置く(表示しているファイル)
  const c = r.changes.find((x) => x.k === folder.files[folder.cur]?.id);
  if (c) { srcEl.focus(); srcEl.setSelectionRange(c.caret, c.caret); }
}
// 図からの編集・view の書き足しの書き換え(ファイルごとの 1 か所の置き換え [{ file, start, end, text }])を、1 回の操作の履歴として入れる
// (2 つ以上のファイルなら、つながった 1 つの履歴)。書き換えた後は、home のファイルを表示する
function applyFolderEdits(edits, home) {
  const changes = edits.map((e) => ({ k: folder.files[e.file].id, f: folder.files[e.file], before: folder.files[e.file].el.value, start: e.start, end: e.end, text: e.text }));
  folder.history.edited(changes);
  for (const c of changes) setFileText(c.f, c.before.slice(0, c.start) + c.text + c.before.slice(c.end));
  const h = home != null && folder.files[home] ? home : edits[0].file;
  setCurrent(h);
  const e = edits.find((x) => x.file === h) ?? edits[0];
  srcEl.focus();
  srcEl.setSelectionRange(e.start + e.text.length, e.start + e.text.length);
}
function setText(text, base = null) {
  closeFolder(); // 「開く」「新規」「例を読み込む」では、フォルダを閉じて 1 つのテキストの扱いに戻る(GR20 の F。設計書 9.4 節)
  srcEl.value = text;
  // 開いたファイルの改行の形を覚える(GR18 の E8。設計書 9.3 節。「新規」と例は LF)
  original = { text, edited: false, eol: eolOf(text) };
  dirty = false;
  if (base) fileBase = base;
  selectedId = null;
  selectedSrc = null;
  scopeEl.value = ''; syncScopeTitle();
  opening = true;
  updateHighlight();
  analyze();
}

// ---- 保存(設計書 9.3 節)。テキストの保存は上の帯の「保存」で .sysml にする。図・表の画像は、題の右のボタンで保存する(GR13)
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
// フォルダのとき(GR21 の O・Z。設計書 9.4 節の段階 B): フォルダのハンドル(選ぶ画面か、ドロップの getAsFileSystemHandle)があれば、
// 書き換えたファイルだけを読み込んだフォルダの同じ相対パスに上書きする。なければ、フォルダのすべての .sysml を相対パスのまま入れた zip を
// フォルダの名前で保存する。改行の形はファイルごとに、読み込んだときの形を保つ(9.3 節)
const fileText = (f) => (f.original.edited ? withEol(f.el.value, f.original.eol) : f.original.text);
// 保存した後の印: 書いた文字を、保存したときのテキスト(印を決める基準)にする
function markSaved(f, written) {
  f.original = { text: written, edited: false, eol: f.original.eol };
  f.saved = lf(written);
  refreshDirty(f);
}
let saving = false;
// 保存の途中(上書き保存・zip の保存とも、保存の処理を始めてから終わるまで)に「保存」を押したときの知らせ(GR22 の A4。設計書 9.4 節の段階 B)
const SAVING_NOW = '保存の途中です。今の保存が終わってから、もう一度押してください';
// GR24 の Z(設計書 9.4 節の段階 B): zip には、フォルダの木のすべてのファイル(.sysml でないものは中身をそのまま)と空のフォルダを、
// 相対パスのまま入れる(. で始まるフォルダは木にないので入れない)。.sysml でないファイルの中身は、このときに読む(読むものがなければ、
// 今までどおり押したその場で zip を作る)
async function saveFolderFile() {
  if (saving) { fileMsg(SAVING_NOW); return; }
  if (folder.busy) { fileMsg(OP_BUSY); return; }
  if (folder.handle) { saveOverwrite(folder); return; }
  const fd = folder;
  saving = true;
  try {
    const enc = new TextEncoder();
    const texts = fd.items.filter((f) => f.el);
    const written = new Map(texts.map((f) => [f, fileText(f)]));
    const plain = fd.items.filter((f) => !f.el);
    const bytes = new Map();
    if (plain.length) { const bs = await Promise.all(plain.map((f) => plainBytes(f))); plain.forEach((f, i) => bytes.set(f, bs[i])); }
    if (folder !== fd) return;
    const entries = fd.items.map((f) => ({ path: f.path, data: f.el ? enc.encode(written.get(f)) : bytes.get(f) }));
    // 空のフォルダ(中にファイルもフォルダもないもの)は、/ で終わる項目にする
    for (const d of fd.dirs) if (!fd.items.some((f) => isSameOrUnder(f.path, d)) && ![...fd.dirs].some((x) => x !== d && isSameOrUnder(x, d))) entries.push({ path: `${d}/`, data: new Uint8Array(0) });
    entries.sort((a, b) => comparePaths(a.path, b.path));
    const zip = makeZip(entries, new Date());
    download(`${fd.name || 'sysmlv2'}.zip`, new Blob([zip], { type: 'application/zip' }));
    texts.forEach((f) => markSaved(f, written.get(f)));
    fd.opsDirty = false; // GR25 の A3: 木の操作も zip に入れた
    fileMsg(`フォルダの ${fd.items.length} ファイルを ${fd.name || 'sysmlv2'}.zip に保存しました`);
  } catch (e) {
    const m = `zip を保存できませんでした(${errText(e)})。印はそのまま残します`;
    fileMsg(m); alert(m);
  } finally { saving = false; }
}
async function saveOverwrite(fd) {
  if (fd.busy) { fileMsg(OP_BUSY); return; }
  // 書き換えたファイル(.sysml でない名前にしたものを含む)と、再読み込みでほかで消えていたファイル(作り直す。GR24 の M)
  const targets = fd.items.filter((f) => f.el && (f.dirty || f.missing));
  if (!targets.length) { fileMsg('書き換えたファイルがないので、何も書きませんでした'); return; }
  saving = true;
  try {
    const items = targets.map((f) => ({ f, path: f.path, text: fileText(f), expect: f.missing ? null : f.stamp, create: f.missing }));
    const r = await overwriteFolder(fd.handle, items, {
      // GR25 の A2: ほかで消えて作り直すファイルの相対パスに、ほかでファイルが作られていたときも、同じく上書きするかを尋ねる
      ask: async (path, why) => confirm(why === 'exists'
        ? `ファイル「${path}」は、ほかで消えた後に、同じ名前のファイルがほかで作られています。上書きしますか?(キャンセルを押すと、このファイルは書きません)`
        : `ファイル「${path}」は、読み込んだ後にほかで変えられています。上書きしますか?(キャンセルを押すと、このファイルは書きません)`),
    });
    if (folder !== fd) return; // 保存の途中でフォルダを閉じた
    if (r.denied) { fileMsg(''); alert(r.reason); return; }
    const done = [], fail = [];
    r.results.forEach((x, i) => {
      const it = items[i];
      if (x.ok) { it.f.stamp = x.stamp; it.f.missing = false; markSaved(it.f, it.text); done.push(it.path); }
      else fail.push(`${it.path}: ${x.reason}`);
    });
    fileMsg(`${done.length} ファイルを上書き保存しました${fail.length ? `(書かなかったファイル ${fail.length})` : ''}`);
    if (fail.length) alert(`書かなかったファイルがあります(印はそのまま残します):\n${fail.join('\n')}`);
  } finally { saving = false; }
}
$('#btnSave').addEventListener('click', () => {
  if (folder) return saveFolderFile();
  // 正本。編集していなければ、開いたときの原文をそのまま保存する(テキスト欄は行末を LF にそろえるため)
  // 編集したら、テキスト欄の文字(行末は LF)を、開いたときの改行の形で書く(GR18 の E8)
  const text = original.edited ? withEol(srcEl.value, original.eol) : original.text;
  download(`${fileBase}.sysml`, new Blob([text], { type: 'text/plain;charset=utf-8' }));
  dirty = false; // 保存した後は、書き換えていない扱い(GR19 の U1)
});

// ---- 開く(「開く」とドラッグ・アンド・ドロップ。.sysml だけ。設計書 9.3 節)
function openFile(file) {
  const kind = fileKind(file.name);
  const base = file.name.replace(/\.[^.]*$/, '') || 'sysmlv2';
  if (!kind) { alert(OPEN_ONLY_SYSML); return; }
  // 書き換えていたら、置き換えの確認を出す。やめたら今のテキストを保つ(GR19 の U1。設計書 9.1 節)
  if (folder) { if (anyDirty() && !confirm(`${unsavedHead()}。フォルダ「${folder.name}」を閉じて、${file.name} で置き換えますか?`)) return; }
  else if (dirty && !confirm(`書いている内容を ${file.name} で置き換えますか?`)) return;
  const r = new FileReader();
  r.onload = () => {
    const x = readSysml(new Uint8Array(r.result));
    if (!x.ok) { alert(`${file.name}: ${x.error}`); return; }
    setText(x.text, base);
  };
  r.onerror = () => alert(`${file.name} を読めませんでした`);
  r.readAsArrayBuffer(file);
}
$('#fileOpen').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
// 画面全体のファイルのドロップの表示(#drop)は、外からファイル・フォルダを持ち込んだとき(dataTransfer.types に Files があるとき)だけ出す。
// 木の中のドラッグ(Files がない)では出さない(GR24 の P5 の D。設計書 9.4 節の段階 C)。落としたときと、ウィンドウの外に出たときに消す
const dragHasFiles = (e) => { try { return Array.from(e.dataTransfer?.types ?? []).includes('Files'); } catch { return false; } };
['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); if (dragHasFiles(e)) $('#drop').classList.add('on'); }));
['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.relatedTarget === null) $('#drop').classList.remove('on'); }));
// 2 つ以上を一度にドロップしたときの理由(GR22 の B2。設計書 9.1 節)
const DROP_ONE = (n) => `一度にドロップできるのは、1 つのファイルか、フォルダ 1 つだけです。${n} 個をドロップしたので、どれも読み込みませんでした(複数のファイルは、フォルダにまとめて「フォルダを開く」かドロップで読み込めます)`;
window.addEventListener('drop', (e) => {
  // 2 つ以上(ファイルとフォルダを合わせて)を一度にドロップしたときは、どれも読み込まずに理由を出す(今のテキストとフォルダは保つ。GR22 の B2)
  const nDrop = Math.max([...(e.dataTransfer.items ?? [])].filter((x) => x.kind === 'file').length, e.dataTransfer.files?.length ?? 0);
  if (nDrop >= 2) { alert(DROP_ONE(nDrop)); return; }
  // フォルダを置いたときは、フォルダとして読み込む(GR20 の F。設計書 9.4 節)。ファイルなら今の「開く」と同じ
  // Chrome・Edge では、ドロップしたフォルダのハンドル(getAsFileSystemHandle)も求める(上書き保存に使う。GR21 の O)。出来事の中で呼ぶ
  const item = e.dataTransfer.items?.[0];
  let hp = null;
  try { hp = item?.getAsFileSystemHandle?.() ?? null; } catch { hp = null; }
  const entry = item?.webkitGetAsEntry?.();
  if (entry?.isDirectory) { openDroppedFolder(entry, hp); return; }
  const f = e.dataTransfer.files[0]; if (f) openFile(f);
});

// ---- フォルダを開く(GR20 の F。設計書 9.4 節の段階 A)。Chrome・Edge(showDirectoryPicker があるブラウザ)ではフォルダを選ぶ画面を使い、
// 選んだフォルダの扱い(ハンドル)をページを開いている間だけ覚える(段階 B の上書き保存に使う)。ほかのブラウザでは webkitdirectory の
// 欄を使う。フォルダのドロップでも読み込む。フォルダの中の .sysml を、下のフォルダも含めて読む(名前が . で始まるフォルダの中は読まない)。
// ファイルは相対パス(区切りは /)の符号位置の順に並べる。
// GR24 の T(設計書 9.4 節の段階 C): .sysml でないファイルも、名前と相対パスを持ち、フォルダの木に出す(中身は、写す・zip に入れるときに
// 読む)。空のフォルダも木に出す。.sysml が 1 つもないフォルダも開く(木から新しいファイルを作れるようにするため)
// list は [{ path, kind: 'file' | 'dir', read: () => Promise<Uint8Array>, lastModified }](path はフォルダからの相対パス)
async function loadFolder(name, list, handle = null) {
  const shown = list.filter((x) => !hiddenDir(x.path, x.kind === 'dir'));
  const picked = shown.filter((x) => x.kind !== 'dir' && isFolderSysml(x.path)).sort((a, b) => comparePaths(a.path, b.path));
  // 書き換えていたら、置き換えの確認を出す。やめたら今のテキストを保つ(設計書 9.4 節。9.1 節と同じ)
  if (anyDirty() && !confirm(folder ? `${unsavedHead()}。フォルダ「${folder.name}」を、フォルダ「${name}」で置き換えますか?` : `書いている内容を、フォルダ「${name}」で置き換えますか?`)) return;
  const files = [], bad = [];
  for (const x of picked) {
    let r;
    try { r = readSysml(await x.read()); } catch { r = { ok: false, error: '読めませんでした' }; }
    if (r.ok) files.push({ path: x.path, text: r.text, lastModified: x.lastModified ?? null }); else bad.push(`${x.path}: ${r.error}`);
  }
  if (bad.length) { alert(`フォルダ「${name}」を読み込めませんでした:\n${bad.join('\n')}`); return; }
  const others = shown.filter((x) => x.kind !== 'dir' && !isFolderSysml(x.path)).map((x) => ({ path: x.path, read: x.read }));
  const dirs = shown.filter((x) => x.kind === 'dir').map((x) => x.path);
  openFolder(name, files, handle, others, dirs);
}
let itemSeq = 0;
const itemById = (id) => folder?.items.find((x) => x.id === id) ?? null;
const itemByPath = (p) => folder?.items.find((x) => x.path === p) ?? null;
// テキストを持つファイル(.sysml)を作る。ファイルごとのテキスト欄と、取り消しの履歴を持つ
function makeTextItem(path, text, lastModified = null, x = {}) {
  const a = document.createElement('textarea');
  a.className = 'fsrc';
  a.spellcheck = false;
  a.value = text;
  a.hidden = true;
  a.dataset.path = path; // そのファイルの相対パス(画面の検査がテキスト欄を見分けるのに使う)
  singleEl.parentNode.appendChild(a);
  wireArea(a);
  // stamp は、フォルダのハンドルから読んだときの最終更新の時刻と中身(上書き保存の前に、ほかで変えられていないかを確かめる。GR21 の O)。
  // x を渡すと、そのファイル(テキストを持たなかったもの)にテキストを持たせる(GR24。名前の変更で .sysml になったとき)
  Object.assign(x, { id: x.id ?? ++itemSeq, path, sysml: fileKind(baseOf(path)) === 'sysml', el: a, original: { text, edited: false, eol: eolOf(text) }, dirty: false, saved: lf(text), shadow: a.value, composing: false, stamp: lastModified != null ? { lastModified, text } : null, read: null, missing: false, bad: null });
  wireHistory(a, x);
  folder.history.add(x.id);
  return x;
}
// テキストを持たないファイル(.sysml でないもの)。read は中身を読む関数
// (read が null なら、フォルダのハンドルの今の相対パスから読む。plainBytes)
const plainBytes = async (it) => (it.read ? it.read() : (await readAt(folder.handle, it.path)).bytes);
const makePlainItem = (path, read) => ({ id: ++itemSeq, path, sysml: fileKind(baseOf(path)) === 'sysml', el: null, original: null, dirty: false, saved: null, shadow: null, composing: false, stamp: null, read, missing: false, bad: null });
function openFolder(name, files, handle, others = [], dirs = []) {
  closeFolder();
  folder = { name, handle, cur: 0, items: [], files: [], dirs: new Set(dirs), open: new Set(), sel: null, clip: null, editing: null, busy: false, drag: null };
  folder.history = makeFolderHistory([], { pathOf: (id) => itemById(id)?.path ?? '?' });
  for (const f of files) folder.items.push(makeTextItem(f.path, f.text, f.lastModified));
  // ハンドルがあるときの .sysml でないファイルの中身は、そのときの相対パスのディスクから読む(名前の変更・移動の後も同じ)
  for (const o of others) folder.items.push(makePlainItem(o.path, handle ? null : o.read));
  syncFiles();
  fileMsg('');
  singleEl.hidden = true;
  fileBarEl.hidden = false;
  // 帯のフォルダの名前は、案内を隠す(showTreeEmpty が区画の高さを付け直す)前に入れる(GR26 の P6 の B。前は付け直した後に入れていたので、
  // 名前の行が空(高さ 0)の帯の高さで付け直し、名前の行の分だけ区画が木の欄の下にはみ出した)
  treeNameEl.textContent = name;
  treeNameEl.title = `フォルダ「${name}」`;
  showTreeEmpty(false);
  dirty = false;
  fileBase = name || 'sysmlv2'; // 図・表の画像のファイル名の「元の名前」はフォルダの名前
  selectedId = null;
  selectedSrc = null;
  scopeEl.value = ''; syncScopeTitle();
  opening = true;
  setCurrent(0);
  updateHighlight();
  analyze();
}
// files(モデルに入る .sysml のファイルの並び)を items から作り直す。今のファイルは同じファイルのまま(並びの番号を合わせる)
function syncFiles() {
  const cur = folder.files[folder.cur] ?? null;
  folder.files = folder.items.filter((x) => x.sysml && x.el).sort((a, b) => comparePaths(a.path, b.path));
  const k = cur ? folder.files.indexOf(cur) : -1;
  folder.cur = k >= 0 ? k : 0;
}
function closeFolder() {
  if (!folder) return;
  for (const f of folder.items) f.el?.remove();
  folder = null;
  fileMsg('');
  resultFolder = null;
  resultItems = null;
  srcEl = singleEl;
  singleEl.hidden = false;
  noSysmlEl.hidden = true;
  fileBarEl.hidden = true;
  treeBodyEl.textContent = '';
  treeNameEl.textContent = '';
  treeNameEl.title = '';
  setTreeMsg('');
  showTreeEmpty(true);
  filePathEl.textContent = '';
}
// 表示するファイルを切り替える(テキスト欄を替えるだけなので、どのファイルの取り消しの履歴も残る)。木の中でもそのファイルを強調し、
// 見えるところまで木を開いて送る(GR24 の T)
function setCurrent(k) {
  if (!folder) return;
  if (!folder.files[k]) {
    if (folder.files.length) return;
    // .sysml のファイルが 1 つもない(GR24 の T): 空のテキスト欄を隠したまま、案内を出す
    for (const f of folder.items) if (f.el) f.el.hidden = true;
    srcEl = blankEl;
    noSysmlEl.hidden = false;
    filePathEl.textContent = '';
    renderTree();
    updateHighlight();
    return;
  }
  hideTypeMenu(); // 型の一覧は、ファイルを切り替えたときに閉じる(GR26 の P5 の M)
  const prev = folder.files[folder.cur];
  if (prev && k !== folder.cur) {
    if (prev.composing) endComposing(prev); // 変換中の印を解く(GR22 の A2)
    folder.history.cut(prev.id); // ほかのファイルへの切り替えで、まとまりを切る(GR21 の H)
  }
  for (const f of folder.items) if (f.el) f.el.hidden = true;
  noSysmlEl.hidden = true;
  folder.cur = k;
  const f = folder.files[k];
  srcEl = f.el;
  srcEl.hidden = false;
  folder.sel = f.path;
  revealPath(f.path);
  renderTree();
  updatePathBar();
  updateHighlight();
}
function setCurrentItem(it) { const k = folder?.files.indexOf(it) ?? -1; if (k >= 0) setCurrent(k); }
// 書き換えの印が変わったときの表示(木と、テキスト欄の上の相対パス)
function updateFileLabels() { if (folder) { renderTree(); updatePathBar(); } }
function updatePathBar() {
  const f = folder?.files[folder.cur];
  filePathEl.textContent = f ? f.path : '';
  filePathEl.title = f ? `表示して書き換えているファイル(フォルダ「${folder.name}」からの相対パス)${f.dirty ? '。書き換えて、まだ保存していない' : ''}` : '';
  fileDirtyEl.textContent = f?.dirty ? '●' : '';
}
// .sysml のファイルが 1 つもないフォルダの表示(GR24 の T)。図と診断を空にする
function showNoSysml() {
  clearTimeout(progressTimer);
  finishRun();
  runId++; // 走っている解析の結果を受け取らない
  last = null; shown = null; resultText = curKey(); resultCombined = ''; resultFolder = { files: [] }; resultItems = [];
  canvasEl.textContent = '';
  canvasEl.append(el('div', 'empty', 'このフォルダには .sysml のファイルがありません。左のフォルダの木の「新しいファイル」で、名前が .sysml で終わるファイルを作ると、ここに図が出ます。'));
  viewEl.classList.remove('stale');
  scopeEl.textContent = '';
  scopeEl.append(new Option('(.sysml のファイルがない)', '')); scopeCands = []; syncScopeTitle();
  msgEl.textContent = '';
  appendBtn.disabled = true;
  appendBtn.title = '今は押せない: .sysml のファイルがない';
  select(null);
  applyOutline({ outline: { items: [], roots: [], refs: {}, errorFiles: [], other: 0 } }); // GR26: モデルツリーも空にする
}

// ---- フォルダの木(GR24 の T。設計書 9.4 節の段階 C。VS Code のエクスプローラーに合わせる)。テキスト欄の左に置き、幅は分割バーで
// 変えられ、畳める。上にフォルダの名前と操作のボタン。木には、フォルダの中のすべてのファイルとフォルダを出す(名前が . で始まるフォルダと
// その中は出さない)。各階層で、フォルダを先に、次にファイルを、名前の符号位置の順に並べる。今のファイルを強調し、書き換えたまま保存して
// いないファイルに印(●)を付け、その印をフォルダにも伝える。.sysml でないファイルは薄く出し、クリックしても開かない
const treeEl = $('#tree'), treeBodyEl = $('#treeBody'), treeNameEl = $('#treeName'), treeSplitEl = $('#treeSplit');
const fileDirtyEl = $('#fileDirty');
const blankEl = document.createElement('textarea'); // .sysml のファイルがないときのテキスト欄(隠したまま)
blankEl.hidden = true; blankEl.readOnly = true;
const noSysmlEl = el('div', 'nosysml', 'このフォルダには .sysml のファイルがありません。フォルダの木の「新しいファイル」で作れます(名前が .sysml で終わるファイルがモデルに入ります)。');
noSysmlEl.hidden = true;
singleEl.parentNode.appendChild(noSysmlEl);
// フォルダを開いていないとき(1 ファイルのとき、ページを開いた直後)の木の欄(GR24 の P5 の P。設計書 9.4 節の段階 C)。「フォルダを開く」の
// ボタンは、上の帯の「フォルダを開く」と同じ動き。フォルダをここに置いたときは、画面全体のドロップと同じ扱い(木はその出来事を止めない)
const treeEmptyEl = el('div', 'tempty');
treeEmptyEl.id = 'treeEmpty';
const btnTreeOpen = el('button', null, 'フォルダを開く');
btnTreeOpen.id = 'btnTreeOpen';
btnTreeOpen.title = $('#btnFolder').title;
btnTreeOpen.addEventListener('click', () => $('#btnFolder').click());
treeEmptyEl.append(el('div', 'tehead', 'フォルダを開いていません'), btnTreeOpen,
  el('p', null, 'フォルダを開くと、ファイルを分けて書けます。ファイルやフォルダを足す・名前を変える・消すこともできます。'),
  el('p', null, 'フォルダをここに置いても開けます。'));
treeEl.insertBefore(treeEmptyEl, treeBodyEl);
// 木の欄はいつも置く。フォルダを開いていないときは、木の代わりに案内を出す
let secReady = false; // 木の欄の区画を作ったか(下の applySections。フォルダを開いた・閉じたときに区画の高さを付け直す。GR26 の P5 の H)
function showTreeEmpty(on) {
  treeEl.hidden = false;
  treeSplitEl.hidden = false;
  treeEl.classList[on ? 'add' : 'remove']('nofolder');
  treeEmptyEl.hidden = !on;
  if (secReady) applySections();
}
showTreeEmpty(!folder);
const INDENT = 12; // 1 階層の字下げ(px)
// 開いているフォルダの中に、書き換えたまま保存していないファイルがあるか
const dirDirty = (dir) => folder.items.some((x) => x.dirty && isSameOrUnder(x.path, dir) && x.path !== dir);
function revealPath(p) { for (let d = parentOf(p); d; d = parentOf(d)) folder.open.add(d); }
let treeRendering = false; // 木を描き直している間(名前の入力欄の blur で決めないため)
function renderTree() {
  if (!folder) return;
  treeRendering = true;
  try { renderTreeNow(); } finally { treeRendering = false; }
}
function renderTreeNow() {
  treeBodyEl.textContent = '';
  const root = buildTree(folder.items.map((x) => x.path), [...folder.dirs]);
  const cur = folder.files[folder.cur]?.path ?? null;
  const row = (node, depth, isDir) => {
    const r = el('div', 'trow');
    r.dataset.path = node.path;
    r.dataset.kind = isDir ? 'dir' : 'file';
    r.draggable = true; // 木の項目はドラッグできる(GR24 の P5 の D。名前の入力欄の行 editRow には付けない)
    r.style.paddingLeft = `${4 + depth * INDENT}px`;
    const open = isDir && folder.open.has(node.path);
    r.append(el('span', 'tw', isDir ? (open ? '▾' : '▸') : ''));
    r.append(el('span', 'nm', node.name));
    let title = node.path;
    if (isDir) {
      if (open) r.classList.add('open');
      if (dirDirty(node.path)) { r.classList.add('dirty'); r.append(el('span', 'dm', '●')); title += '(中に、書き換えて保存していないファイルがある)'; }
    } else {
      const it = itemByPath(node.path);
      if (!(it?.sysml && it.el)) { r.classList.add('dim'); title += it?.bad ? `(.sysml として読めない: ${it.bad})` : '(.sysml でないファイル。このアプリでは開かない)'; }
      if (node.path === cur) r.classList.add('cur');
      if (it?.dirty) { r.classList.add('dirty'); r.append(el('span', 'dm', '●')); title += '(書き換えて、まだ保存していない)'; }
      if (it?.missing) { r.classList.add('missing'); r.append(el('span', 'ms', '(ディスクにない)')); title += '(再読み込みで、ほかで消えていた。保存で作り直す)'; }
    }
    if (node.path === folder.sel) r.classList.add('sel');
    r.title = title;
    treeBodyEl.append(r);
    return open;
  };
  // 名前の入力欄(GR24 の F): 新しいファイル・新しいフォルダは、作るフォルダの中の先頭に、名前の変更は、その項目の代わりに出す
  const ed = folder.editing;
  // フォルダの深さに比例して呼び出しを深くしないよう、明示のスタックで回す(GR27 の E。行を出す順は前の再帰と同じ: フォルダの中の
  // 名前の入力欄、子のフォルダを順に(開いていればその中を続けて)、ファイルを順に)
  const stack = [{ node: root, depth: 0, i: -1 }];
  while (stack.length) {
    const t = stack[stack.length - 1], node = t.node, depth = t.depth;
    if (t.i < 0) { t.i = 0; if (ed && !ed.path && ed.dir === node.path) treeBodyEl.append(editRow(depth)); }
    if (t.i < node.dirs.length) {
      const d = node.dirs[t.i++];
      if (ed?.path === d.path) { treeBodyEl.append(editRow(depth)); continue; }
      if (row(d, depth, true)) stack.push({ node: d, depth: depth + 1, i: -1 });
      continue;
    }
    for (const f of node.files) { if (ed?.path === f.path) { treeBodyEl.append(editRow(depth)); continue; } row(f, depth, false); }
    stack.pop();
  }
  treeBodyEl.querySelector('.trow.cur')?.scrollIntoView?.({ block: 'nearest' });
}
// 木の項目のクリック: フォルダは開閉、.sysml のファイルはテキスト欄に出す。.sysml でないファイルは選ぶだけ(今のファイルを変えない)
treeBodyEl.addEventListener('click', (e) => {
  if (!folder) return;
  const r = e.target.closest?.('.trow');
  if (!r || !treeBodyEl.contains(r)) return;
  const p = r.dataset.path;
  folder.sel = p;
  if (r.dataset.kind === 'dir') { if (folder.open.has(p)) folder.open.delete(p); else folder.open.add(p); renderTree(); return; }
  const it = itemByPath(p);
  if (it && folder.files.includes(it)) { setCurrentItem(it); return; }
  renderTree();
});
// 上のボタン: すべて折りたたむ・畳む
$('#btnCollapse').addEventListener('click', () => { if (!folder) return; folder.open.clear(); renderTree(); });
// 木の欄を畳む・広げる(GR24 の P5 の P)。フォルダを開いていないときも畳める。畳んだかどうかはブラウザの中(localStorage)に覚え、次に
// ページを開いたときも同じにする。読み書きできないときは、開いた状態で始める(設計書 9.4 節の段階 C)
const FOLD_KEY = 'sysmlv2.treeFolded';
let treeFolded = false;
try { treeFolded = window.localStorage?.getItem(FOLD_KEY) === '1'; } catch { treeFolded = false; }
// ---- 左右の配置の幅(GR25 の B。設計書 4 章・9.1 節。幅の決め方は src/app/layout.js)。左の列は木の欄の幅の分だけ広げ、テキスト欄の初めの
// 幅を木の欄がないとき(GR22 の版)と同じにする。木の欄を畳んだときは左の列をその分狭める(テキスト欄の幅は保つ)。分割バーは、テキスト欄に
// 240px、図の欄に 320px を残す(両方を守れないときはテキスト欄を優先)。ウィンドウの大きさを変えたときも同じ。lay.text が null の間
// (真ん中・木の分割バーを引くまで)は、テキスト欄の幅を画面の幅から決め直す(GR22 の版の 38% と同じ)
const leftEl = $('#left');
const lay = { tree: TREE_INIT, text: null };
const layState = () => ({ W: window.innerWidth, tree: lay.tree, folded: treeFolded, text: lay.text });
function applyLayout() {
  const w = widths(layState());
  treeEl.style.width = `${lay.tree}px`; // 畳んだときは style.css の #tree.folded の幅が勝つ
  leftEl.style.width = `${w.left}px`;
}
window.addEventListener('resize', applyLayout);
function applyFold() {
  treeEl.classList[treeFolded ? 'add' : 'remove']('folded');
  const b = $('#btnFold'), t = treeFolded ? '木の欄を広げる' : '木の欄を畳む'; // GR26 の P5 の W(設計書 9.5 節の「置き場所」)
  b.title = t;
  b.setAttribute('aria-label', t);
  b.setAttribute('aria-expanded', treeFolded ? 'false' : 'true');
  applyLayout();
  if (secReady) applySections(); // 広げたときに、区画の高さを付け直す
}
$('#btnFold').addEventListener('click', () => {
  treeFolded = !treeFolded;
  try { window.localStorage?.setItem(FOLD_KEY, treeFolded ? '1' : '0'); } catch { /* 覚えられないときは、このページの間だけ */ }
  applyFold();
});
applyFold();
// 木の幅の分割バー
(() => {
  let drag = false;
  treeSplitEl.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; });
  // GR25 の B2: テキスト欄に 240px を残す(左の列の幅は変えない)。畳んでいるときは引かない
  window.addEventListener('mousemove', (e) => {
    if (!drag || treeFolded) return;
    const r = dragTree(window.innerWidth, layState(), e.clientX - (treeEl.getBoundingClientRect?.().left ?? 0));
    lay.tree = r.tree; lay.text = r.text;
    applyLayout();
  });
})();
// ---- 木の欄の 2 つの区画(GR26 の L。設計書 4 章・9.5 節の「置き場所」)。上の帯(フォルダの名前とボタン。9.4 節)の下に、上の区画
// 「ファイル」(フォルダの木)と下の区画「モデル」(モデルツリー)を置き、その間の分割バーで高さを変えられる(各区画に SEC_MIN を残す)。
// 区画はそれぞれ見出しの行で畳め、畳んだかどうかは区画ごとにブラウザの中(localStorage の鍵 sysmlv2.filesFolded・sysmlv2.modelFolded。
// 値は 1 か 0)に覚える。読み書きできないときは、開いた状態で始める。「モデル」の区画の下部に「参照箇所」の欄を置く。木の欄そのものを
// 畳むときは、両方の区画をまとめて畳む(#tree.folded)。区画は、テンプレートを変えずに、ここで作って木の欄に入れる
const SEC_KEYS = { files: 'sysmlv2.filesFolded', model: 'sysmlv2.modelFolded' };
const secFolded = { files: false, model: false };
for (const k of Object.keys(SEC_KEYS)) { try { secFolded[k] = window.localStorage?.getItem(SEC_KEYS[k]) === '1'; } catch { secFolded[k] = false; } }
const treeMsgBox = $('#treeMsg');
function makeSection(key, label) {
  const sec = el('div', 'tsec');
  sec.id = key === 'files' ? 'secFiles' : 'secModel';
  const head = el('div', 'tsech');
  const btn = el('button', 'tsecbtn');
  btn.id = key === 'files' ? 'btnSecFiles' : 'btnSecModel';
  btn.append(el('span', 'tw', '▾'), el('span', null, label));
  head.append(btn);
  const body = el('div', 'tsecbody');
  sec.append(head, body);
  btn.addEventListener('click', () => {
    secFolded[key] = !secFolded[key];
    try { window.localStorage?.setItem(SEC_KEYS[key], secFolded[key] ? '1' : '0'); } catch { /* 覚えられないときは、このページの間だけ */ }
    applySections();
  });
  return { sec, head, btn, body };
}
const secFiles = makeSection('files', 'ファイル');
const secModel = makeSection('model', 'モデル');
// 「ファイル」の区画: 今の木の中身(フォルダを開いていないときの案内・フォルダの木・木の欄の知らせ)を移す
secFiles.body.append(treeEmptyEl, treeBodyEl, treeMsgBox);
const secSplitEl = el('div', 'secsplit');
secSplitEl.id = 'secSplit';
treeEl.append(secFiles.sec, secSplitEl, secModel.sec);
// 「モデル」の区画と参照箇所の欄に焦点の要素を置く(区画の中をクリックしたときに、焦点が木の欄そのものに行き、フォルダの木のキーが効かないように。
// GR26 の P5 の K)。モデルツリーの本体(#modelBody)は、前から焦点を受ける
secModel.sec.tabIndex = -1;
// 「モデル」の区画の上の帯: 「すべて折りたたむ」(9.4 節のフォルダの木と同じアイコン)
const btnModelCollapse = el('button', 'ticon');
btnModelCollapse.id = 'btnModelCollapse';
btnModelCollapse.title = 'モデルツリーをすべて折りたたむ';
btnModelCollapse.setAttribute('aria-label', 'モデルツリーをすべて折りたたむ');
btnModelCollapse.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 4.5v-2h8.5V11h-2M2.5 5h9v9h-9zM4.5 9.5h5"/></svg>';
secModel.head.append(btnModelCollapse);
const modelNoteEl = el('div', 'mnote');
modelNoteEl.id = 'modelNote';
const modelBodyEl = el('div', 'mbody');
modelBodyEl.id = 'modelBody';
modelBodyEl.tabIndex = 0;
const refPaneEl = el('div', 'rpane');
refPaneEl.id = 'refPane';
const refHeadEl = el('div', 'rhead', '参照箇所');
refHeadEl.id = 'refHead';
const refBodyEl = el('div', 'rbody');
refBodyEl.id = 'refBody';
refPaneEl.append(refHeadEl, refBodyEl);
const modelMsgEl = el('div', 'mmsg');
modelMsgEl.id = 'modelMsg';
// モデルツリーと参照箇所の欄の境目の分割バー(GR26 の P5 の H。区画の境目の分割バーと同じ見た目)
const refSplitEl = el('div', 'secsplit');
refSplitEl.id = 'refSplit';
secModel.body.append(modelNoteEl, modelBodyEl, modelMsgEl, refSplitEl, refPaneEl);
// 区画と欄の高さ(GR26 の P5 の H。設計書 9.5 節の「区画の高さ」): 分割バーで変えた高さは、木の欄の上の帯(#treeHead)の下の残りの高さに対する
// 割合(sec.files・sec.refs。null なら初めの高さ)で持ち、窓の大きさが変わったとき・区画を畳んだ・開いたとき・木の欄を広げたとき・フォルダを
// 開いた・閉じたときに、割合から付け直す(src/app/modeltree.js の sectionSizes。最小の高さを残し、足りなければ区画の中のスクロールで見せる)。
// 割合は localStorage に覚えない
const sec = { files: null, refs: null };
const boxH = (e) => e?.getBoundingClientRect?.().height ?? 0;
const treeHeadEl = $('#treeHead');
const secTotal = () => boxH(treeEl) - boxH(treeHeadEl);
function sizesNow() {
  const total = secTotal();
  if (!(total > 0)) return null;
  const head = boxH(secFiles.head) || 22;
  return sectionSizes({ total, head, filesFolded: secFolded.files, modelFolded: secFolded.model, folder: !!folder,
    filesNat: head + [...secFiles.body.children].reduce((n, c) => n + boxH(c), 0), rFiles: sec.files, rRefs: sec.refs });
}
function applySections() {
  for (const [k, s] of [['files', secFiles], ['model', secModel]]) {
    s.sec.classList[secFolded[k] ? 'add' : 'remove']('sfold');
    s.btn.querySelector('.tw').textContent = secFolded[k] ? '▸' : '▾';
    s.btn.setAttribute('aria-expanded', secFolded[k] ? 'false' : 'true');
    s.btn.title = `${k === 'files' ? '「ファイル」' : '「モデル」'}の区画を${secFolded[k] ? '広げる' : '畳む'}`;
  }
  const both = !secFolded.files && !secFolded.model;
  secSplitEl.hidden = !both;
  const z = sizesNow();
  if (!z) {
    // 高さを測れないとき(木の欄を畳んで隠しているときなど): 割合の flex で分ける(測れるようになったら付け直す)
    secFiles.sec.style.height = ''; secModel.sec.style.height = ''; refPaneEl.style.height = '';
    secFiles.sec.style.flex = secFolded.files || !folder ? '0 1 auto' : '2 1 0';
    secModel.sec.style.flex = secFolded.model ? '0 0 auto' : '3 1 0';
    return;
  }
  secFiles.sec.style.flex = '0 0 auto'; secFiles.sec.style.height = `${z.files}px`;
  secModel.sec.style.flex = '0 0 auto'; secModel.sec.style.height = `${z.model}px`;
  refPaneEl.style.height = `${z.refs}px`;
  if (modelWinReady) modelWindow(); // 本体の高さが変わったら、並べる行を入れ直す(GR27 P5 の M)
}
secReady = true;
applySections();
window.addEventListener('resize', applySections);
// 木の欄の上の帯の高さが変わったとき(フォルダの名前の行の有無、ボタンの折り返しなど)も、割合から付け直す(GR26 の P6 の B。設計書 9.5 節の
// 「区画の高さ」)。ResizeObserver のないブラウザでは、フォルダを開いた・閉じた後(showTreeEmpty)と窓の大きさの変化で付け直す
if (typeof ResizeObserver === 'function' && treeHeadEl) {
  let headSeen = boxH(treeHeadEl);
  new ResizeObserver(() => { const h = boxH(treeHeadEl); if (h !== headSeen) { headSeen = h; applySections(); } }).observe(treeHeadEl);
}
// 区画の境目の分割バーと、モデルツリーと参照箇所の欄の境目の分割バー: 引いた位置から高さを決め、付け直した高さ(最小の高さを残したもの)の
// 割合を覚える
(() => {
  let drag = null;
  secSplitEl.addEventListener('mousedown', () => { drag = 'files'; document.body.style.userSelect = 'none'; });
  refSplitEl.addEventListener('mousedown', () => { drag = 'refs'; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = null; });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const total = secTotal();
    if (!(total > 0)) return;
    if (drag === 'files') {
      if (secFolded.files || secFolded.model) return;
      sec.files = (e.clientY - (secFiles.sec.getBoundingClientRect?.().top ?? 0)) / total;
    } else {
      if (secFolded.model) return;
      sec.refs = ((secModel.sec.getBoundingClientRect?.().bottom ?? 0) - e.clientY - SEC_SPLIT / 2) / total;
    }
    const z = sizesNow();
    if (z) { if (drag === 'files') sec.files = z.files / total; else sec.refs = z.refs / total; }
    applySections();
  });
})();

// ---- モデルツリー(GR26 の T。設計書 9.5 節)。Worker が解析の結果から作った木(src/app/outline.js の buildOutline。結果の outline)を出す。
// 根は大域の名前空間で、各ファイルの根の要素を、ファイルの並びの順、ファイルの中は記述の順に並べる(ファイルの境目は形に出さない)。
// 根の要素は開き、それより下は閉じた状態で始める。開閉と選択は、項目の鍵(ファイルの相対パスと修飾名と、同じ修飾名の中の記述の順)で
// 覚え、解析し直した後の木でも保つ。画面には、開いた項目の子だけを出す(src/app/outline.js の visibleRows。大きなモデルでも開いた分だけ)
const model = { outline: null, items: null, text: null, open: new Set(), known: new Set(), sel: null, stale: false, rows: [] };
const DU_MARK = { def: '定', use: '使' };
const DU_TIP = { def: '定義', use: '使用' };
const TYPE_MARK = { library: '(標準ライブラリ)', unchecked: '(未検査)', ambiguous: '(曖昧)' };
// 開く・新規・例・フォルダを開く: 開閉と選択を始めの状態に戻す。同じテキストの解析の結果でも木を作り直すよう、前の解析のテキストを忘れる
function resetModel() { model.open.clear(); model.known.clear(); model.sel = null; model.text = null; }
const modelItemByKey = (k) => model.outline?.items.find((x) => x.key === k) ?? null;
// 結果を受け取ったとき: 木を作り直し、開閉と選択を鍵で戻す。参照箇所の欄で選んだ要素がなくなったときは、欄を空にする
// GR26 の P5 の P(設計書 9.5 節の「作り直し」): 解析したテキスト(フォルダのときは、全ファイルの相対パスとテキスト。resultText)が前と同じ結果
// (ビュー・範囲の切り替えなど)では、木と参照箇所を作り直さない(画面の側で比べる)。GR26 の P5 の A(「古い解析」): 古い解析の印は、今の
// テキスト(curKey)の解析の結果が届いたときだけ外し、そのときに押したときの知らせも消す。前のテキストの解析の結果では、中身は作り直しても
// 印は付けたままにする。型の一覧は、結果を受け取ったときに閉じる(GR26 の P5 の M)
function applyOutline(r) {
  hideTypeMenu();
  const cur = resultText === curKey();
  const same = model.text != null && model.text === resultText;
  model.items = resultItems;
  if (!same) {
    model.outline = r.outline ?? null;
    model.text = resultText;
    if (model.outline) for (const id of model.outline.roots) { const k = model.outline.items[id].key; if (!model.known.has(k)) { model.known.add(k); model.open.add(k); } }
  }
  model.stale = !cur;
  if (cur && modelMsgEl.textContent === STALE_MSG) modelMsg('');
  if (!same) renderModel(); else renderStale();
}
function renderStale() {
  renderModelNote();
  modelBodyEl.classList[model.stale ? 'add' : 'remove']('stale');
  refPaneEl.classList[model.stale ? 'add' : 'remove']('stale');
}
// テキストを書き換えてから解析が終わるまでの間(設計書 9.5 節の「古い解析」): 木と参照箇所を「解析し直しています」の印を付けて薄く出す
function modelStale() {
  hideTypeMenu(); // 型の一覧は、古い解析になったときに閉じる(GR26 の P5 の M)
  if (model.stale) return;
  model.stale = true;
  renderModelNote();
  modelBodyEl.classList.add('stale');
  refPaneEl.classList.add('stale');
}
const modelIsStale = () => model.stale || model.text == null || curKey() !== model.text;
let modelMsgTimer = null;
function modelMsg(t) {
  clearTimeout(modelMsgTimer);
  modelMsgEl.textContent = t ?? '';
  if (t) modelMsgTimer = setTimeout(() => { modelMsgEl.textContent = ''; }, 5000);
}
const STALE_MSG = '解析し直しています。解析が終わってから、もう一度押してください';
function renderModelNote() {
  const o = model.outline;
  const notes = [];
  if (model.stale) notes.push('解析し直しています');
  if (!o) notes.push(last && !last.ok && !last.internal ? 'テキストに構文エラーがあるので、モデルを出せません(構文エラーを直すと出ます)' : '');
  else if (o.errorFiles.length) notes.push(folder ? `構文エラーのあるファイル(その要素は出していません): ${o.errorFiles.join('、')}` : 'テキストに構文エラーがあるので、モデルを出せません(構文エラーを直すと出ます)');
  modelNoteEl.textContent = notes.filter(Boolean).join('。');
  modelNoteEl.hidden = !modelNoteEl.textContent;
}
function renderModel() {
  renderStale();
  modelBodyEl.textContent = '';
  const o = model.outline;
  if (!o || !o.items.length) {
    model.rows = []; // 並べる行がない(GR27 P5 の M: スクロールなどで前の木の行を並べ直さない)
    if (o && !o.errorFiles.length) modelBodyEl.append(el('div', 'mempty', '並べる要素がありません(パッケージ・定義・使用を書くと、ここに出ます)'));
    renderRefs();
    return;
  }
  model.rows = visibleRows(o, (it) => model.open.has(it.key));
  renderModelRows();
  renderRefs();
}
// ---- モデルツリーの行を、見えている範囲と前後の少し(画面 1 枚分ずつ)だけ並べる(GR27 P5 の M。指示書 3.3 節)。上と下の残りの行は、
// 高さだけを持つ空き(.mpad)で表す。行の要素は、今と同じく本体(#modelBody)の直下に、空きの間に並べる。
// 行の高さは固定として扱う: 初めて並べた行の高さ(行の外接矩形の高さの最大)を測り、すべての行をその高さにする(本体の CSS の変数
// --mrow-h。style.css の .mrow)。測れないとき(区画を畳んでいるなど)は MROW_H0 として計算し、行の高さは決めない(測れたときに付け直す)。
// 窓の大きさが変わったとき(字の大きさの拡大を含む)は、測り直す。
// 並べる行を入れ直すのは: 開閉・選択・解析し直し(renderModel)、スクロールしたとき・本体の高さが変わったとき(区画と欄の高さの付け直し
// applySections、本体の ResizeObserver)で、見えている範囲が並べている範囲を出たとき、窓の大きさが変わったとき
const MROW_H0 = 20;
const mwin = { h: null, from: 0, to: 0 };
const mrowH = () => mwin.h ?? MROW_H0;
// 見えている行の範囲 [first, last) と、画面 1 枚分の行の数 per。本体の高さが 0(畳んでいる・測れない)なら、窓の高さで見積もる
function modelSpan() {
  const n = model.rows.length, H = mrowH();
  const ch = modelBodyEl.clientHeight;
  const vh = ch > 0 ? ch : (window.innerHeight || 600);
  const per = Math.max(1, Math.ceil(vh / H));
  const first = Math.min(Math.max(0, Math.floor((modelBodyEl.scrollTop || 0) / H)), Math.max(0, n - per));
  return { first, last: Math.min(n, first + per), per };
}
function renderModelRows() {
  const o = model.outline, n = model.rows.length;
  const { first, last, per } = modelSpan(); // 中身を消す前に、スクロールの位置と高さを読む
  const from = Math.max(0, first - per), to = Math.min(n, last + per);
  const H = mrowH();
  modelBodyEl.textContent = '';
  const top = el('div', 'mpad');
  top.style.height = `${from * H}px`;
  modelBodyEl.append(top);
  const made = [];
  for (let i = from; i < to; i++) { const { id, depth } = model.rows[i]; const r = modelRow(o.items[id], depth); made.push(r); modelBodyEl.append(r); }
  const bottom = el('div', 'mpad');
  bottom.style.height = `${(n - to) * H}px`;
  modelBodyEl.append(bottom);
  mwin.from = from; mwin.to = to;
  if (mwin.h == null && made.length) {
    const h = Math.max(...made.map((r) => r.getBoundingClientRect?.().height ?? 0));
    if (h > 0) { mwin.h = h; modelBodyEl.style.setProperty?.('--mrow-h', `${h}px`); if (h !== H) renderModelRows(); }
  }
}
// スクロール・高さの変化: 見えている範囲が並べている範囲を出たとき(と、行の高さをまだ測れていないとき)だけ入れ直す
function modelWindow() {
  if (!model.outline || !model.rows.length) return;
  const { first, last } = modelSpan();
  if (mwin.h == null || first < mwin.from || last > mwin.to) renderModelRows();
}
modelBodyEl.addEventListener('scroll', modelWindow);
modelWinReady = true;
if (typeof ResizeObserver === 'function') new ResizeObserver(() => modelWindow()).observe(modelBodyEl);
window.addEventListener('resize', () => {
  if (!model.outline || !model.rows.length) return;
  mwin.h = null;
  modelBodyEl.style.removeProperty?.('--mrow-h');
  renderModelRows();
});
function modelRow(it, depth) {
  const r = el('div', 'mrow');
  r.dataset.id = String(it.id);
  r.style.paddingLeft = `${4 + depth * INDENT}px`;
  const open = model.open.has(it.key);
  r.append(el('span', 'tw', it.kids.length ? (open ? '▾' : '▸') : ''));
  if (DU_MARK[it.du]) { const b = el('span', `mdu ${it.du}`, DU_MARK[it.du]); b.title = DU_TIP[it.du]; r.append(b); }
  r.append(el('span', it.named ? 'nm' : 'nm unnamed', it.name));
  // 型か多重度を出す項目は、名前を縮めて型と多重度に最小の幅を残す(GR26 の P6 の Y。style.css の .mrow.typed)。型も多重度もない項目は名前を縮めない
  if (it.types.length || it.mult) r.classList.add('typed');
  // 型と多重度(GR26 の P5 の T。並びは印・名前・型と多重度・種類の順。幅が足りないときは、種類、型と多重度の順に省略の記号で切る。style.css)
  const typeText = it.types.map((x) => x.text + (TYPE_MARK[x.status] ?? '')).join(', ');
  if (it.types.length) {
    const t = el('span', 'mty');
    t.dataset.types = '1';
    t.textContent = `: ${it.types.map((x) => x.text + (TYPE_MARK[x.status] ?? '')).join(', ')}`;
    const go = it.types.filter((x) => x.status === 'resolved');
    if (go.length) t.classList.add('go');
    if (it.types.some((x) => x.status === 'unchecked' || x.status === 'ambiguous')) t.classList.add('bad');
    t.title = it.types.length > 1 ? '押すと型の一覧を出します' : go.length ? `押すと型の定義(${go[0].q})へ移ります` : it.types[0].status === 'library' ? '標準ライブラリ・内蔵する表の型には移りません' : `${it.types[0].status === 'unchecked' ? '未検査' : '曖昧'}の型には移りません(移動先が決まっていないため)`;
    r.append(t);
  }
  if (it.mult) r.append(el('span', 'mmu', ` ${it.mult}`));
  r.append(el('span', 'mkd', it.kindJa));
  // マウスを載せたときの文: 修飾名・ファイルの相対パスと行・種類・型と多重度(GR26 の P5 の T で、型と多重度を足した)
  const tmText = `${typeText}${it.mult ? `${typeText ? ' ' : ''}${it.mult}` : ''}`;
  r.title = `${it.q}\n${it.file ? `${it.file} ` : ''}${it.at.line} 行\n種類: ${it.kindJa}${DU_TIP[it.du] ? `(${DU_TIP[it.du]})` : ''}${tmText ? `\n型と多重度: ${tmText}` : ''}`;
  if (model.sel === it.key) r.classList.add('sel');
  return r;
}
// 移動(設計書 9.5 節の「移動」): その要素(参照箇所の行では、その参照の名前)が書かれているファイルを表示し、その箇所までテキスト欄を
// 送り、名前の字句を選ぶ。別のファイルへは、今のファイルの切り替え(setCurrent)と、ファイルの中の位置の経路(selectText の file)で移り、
// 保存していない書き換えと取り消しの履歴を保つ。古い解析の間は移らず、知らせを出す
function modelGo(at) {
  if (!at) return false;
  if (modelIsStale()) { modelMsg(STALE_MSG); return false; }
  if (folder) {
    const it = at.f != null ? model.items?.[at.f] : null;
    if (!it || !folder.files.includes(it)) { modelMsg('移る先のファイルが見つかりません(解析し直してから、もう一度押してください)'); return false; }
    selectText(at.start, at.end, it);
  } else selectText(at.start, at.end);
  return true;
}
let typeMenuEl = null;
function hideTypeMenu() { typeMenuEl?.remove(); typeMenuEl = null; }
// 型の一覧の項目を押したとき: そのときの解析の結果から移動先を引き直す。古い解析の間は移らず、知らせを出す。見つからなければ移らない
function typeGo(w) {
  if (modelIsStale()) { modelMsg(STALE_MSG); return; }
  const tgt = w.k != null ? modelItemByKey(w.k) : null;
  const t = modelItemByKey(w.owner)?.types[w.i];
  const at = tgt ? tgt.at : t && t.text === w.text && t.status === 'resolved' ? t.to : null;
  if (!at) { modelMsg(`型「${w.text}」の定義が見つかりません(解析し直して変わったため)。もう一度、型を押してください`); return; }
  modelGo(at);
}
// 型の一覧(型が 2 つ以上のとき)。右クリックのメニューと同じ見た目で、画面の中に収める
function showTypeMenu(x, y, it) {
  hideTypeMenu();
  typeMenuEl = el('div', 'tmenu');
  typeMenuEl.id = 'typeMenu';
  it.types.forEach((t, i) => {
    const b = el('button', null, `${t.text}${TYPE_MARK[t.status] ?? ''}`);
    b.disabled = t.status !== 'resolved';
    b.title = t.status === 'resolved' ? `${t.q} へ移る` : t.status === 'library' ? '標準ライブラリ・内蔵する表の型には移りません' : `${t.status === 'unchecked' ? '未検査' : '曖昧'}の型には移りません`;
    // 移動先そのものでなく、型の要素の項目の鍵(と、持ち主の項目の鍵と何番目の型か)を持ち、押したときの解析の結果から移動先を引き直す(GR26 の P5 の M)
    const want = { owner: it.key, i, text: t.text, k: t.k ?? null };
    b.addEventListener('click', () => { hideTypeMenu(); typeGo(want); });
    typeMenuEl.append(b);
  });
  typeMenuEl.style.left = `${x}px`; typeMenuEl.style.top = `${y}px`;
  document.body.append(typeMenuEl);
  const bb = typeMenuEl.getBoundingClientRect?.() ?? { width: 0, height: 0 };
  const w = bb.width || 180, h = bb.height || typeMenuEl.children.length * 26 + 8;
  const W = window.innerWidth ?? 0, H = window.innerHeight ?? 0;
  let mx = x, my = y;
  if (W && mx + w > W) mx = Math.max(0, x - w >= 0 ? x - w : W - w);
  if (H && my + h > H) my = Math.max(0, y - h >= 0 ? y - h : H - h);
  typeMenuEl.style.left = `${mx}px`; typeMenuEl.style.top = `${my}px`;
}
window.addEventListener('click', (e) => { if (typeMenuEl && !typeMenuEl.contains(e.target) && !e.target?.closest?.('.mty')) hideTypeMenu(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTypeMenu(); });
modelBodyEl.addEventListener('click', (e) => {
  const r = e.target.closest?.('.mrow');
  if (!r || !modelBodyEl.contains(r) || !model.outline) return;
  const it = model.outline.items[+r.dataset.id];
  if (!it) return;
  // 開閉の印: 開閉だけ(古い解析の間も、開閉はできる)
  if (e.target.closest?.('.tw')) {
    if (it.kids.length) { if (model.open.has(it.key)) model.open.delete(it.key); else model.open.add(it.key); renderModel(); }
    return;
  }
  // 型: 1 つなら型の定義へ移り、2 つ以上なら一覧を出す。標準ライブラリ・未検査・曖昧の型には移らない
  if (e.target.closest?.('.mty')) {
    if (modelIsStale()) { modelMsg(STALE_MSG); return; }
    if (it.types.length > 1) { showTypeMenu(e.clientX ?? 0, e.clientY ?? 0, it); return; }
    const t = it.types[0];
    if (t.status === 'resolved') modelGo(t.to);
    else modelMsg(t.status === 'library' ? `型「${t.text}」は標準ライブラリ・内蔵する表の要素なので、移りません` : `型「${t.text}」は${t.status === 'unchecked' ? '未検査' : '曖昧'}なので、移りません(移動先が決まっていないため)`);
    return;
  }
  // 項目: 選んで参照箇所を出し、その要素へ移る
  if (modelIsStale()) { modelMsg(STALE_MSG); return; }
  model.sel = it.key;
  renderModel();
  modelGo(it.at);
});
btnModelCollapse.addEventListener('click', () => { model.open.clear(); renderModel(); });

// ---- 参照箇所(GR26 の R。設計書 9.5 節の「参照箇所」)。モデルツリーで選んだ要素に解決している参照を、すべてのファイルから集めて出す
// (src/app/outline.js の refs。未検査・曖昧の参照は入らない)。役割ごとにまとめ、件数を見出しに出す。各行に、参照している要素の修飾名
// (所属)と、ファイルの相対パスと行を出す。モデルツリーの子要素とは別の欄に、別の見た目(左の矢印と、色の違う下地)で出す
function renderRefs() {
  refBodyEl.textContent = '';
  const o = model.outline;
  const it = model.sel != null ? modelItemByKey(model.sel) : null;
  if (!it) {
    refHeadEl.textContent = '参照箇所';
    refBodyEl.append(el('div', 'rempty', 'モデルで要素を選ぶと、参照している箇所を出します'));
    return;
  }
  const list = o.refs[it.id] ?? [];
  refHeadEl.textContent = `参照箇所: ${it.name}(${list.length} 件)`;
  refHeadEl.title = it.q;
  if (!list.length) { refBodyEl.append(el('div', 'rempty', 'この要素を参照している箇所はありません')); return; }
  const by = new Map();
  for (const x of list) { if (!by.has(x.role)) by.set(x.role, []); by.get(x.role).push(x); }
  const order = [...by.keys()].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  let n = 0;
  for (const role of order) {
    refBodyEl.append(el('div', 'rrole', `${role}(${by.get(role).length})`));
    for (const x of by.get(role)) {
      const r = el('div', 'rrow');
      r.dataset.ref = String(n++);
      r._ref = x;
      const path = folder ? (model.items?.[x.at.f]?.path ?? '') : '';
      // 2 段(GR26 の P5 の H): 上の段に役割の印と所属、下の段にファイルの相対パスと行。所属が長いときは、先頭を省略の記号にして末尾を残す
      // (style.css の .rown の direction: rtl。文字の並びが崩れないよう、中身は左から右の向きに切り離す bdi に入れる)
      const own = el('span', 'rown');
      const bd = el('bdi', null, x.owner);
      bd.setAttribute('dir', 'ltr');
      own.append(bd);
      const top = el('div', 'rtop');
      top.append(el('span', 'rar', '←'), own);
      r.append(top, el('div', 'rloc', `${path ? `${path} ` : ''}${x.at.line} 行`));
      r.title = `${role}: ${x.owner}\n${path ? `${path} ` : ''}${x.at.line} 行「${x.text}」`;
      refBodyEl.append(r);
    }
  }
}
refBodyEl.addEventListener('click', (e) => {
  const r = e.target.closest?.('.rrow');
  if (!r || !refBodyEl.contains(r) || !r._ref) return;
  // 文字を選んだ(ドラッグした)ときは移らない(選んだ文字を Ctrl+C でコピーできるように。GR26 の P5 の K)
  const sel = window.getSelection?.();
  if (sel && String(sel) && refBodyEl.contains(sel.anchorNode)) return;
  modelGo(r._ref.at);
});
// フォルダを選ぶ画面(File System Access API)のハンドルから、ファイルとフォルダの一覧を作る。名前が . で始まるフォルダの中には入らない
async function listHandle(dir) {
  const { files, dirs } = await listDisk(dir);
  return [...dirs.map((p) => ({ path: p, kind: 'dir' })), ...files.map(({ path, handle: h }) => {
    // 読んだときの最終更新の時刻を覚える(上書き保存の前に、ほかで変えられていないかを確かめるのに使う。GR21 の O)。.sysml でない
    // ファイルの中身は、写す・zip に入れるときに、そのときのディスクから読む(GR24 の T)
    const x = { path, kind: 'file', lastModified: null, read: async () => { const file = await h.getFile(); x.lastModified = file.lastModified ?? null; return new Uint8Array(await file.arrayBuffer()); } };
    return x;
  })];
}
// ドロップしたフォルダ(webkitGetAsEntry の項目)から、ファイルとフォルダの一覧を作る。名前が . で始まるフォルダの中には入らない。
// ファイルは File を持っておき、中身はそこから読む(GR24 の T)
async function listEntry(dir, prefix = '') {
  const out = [];
  const reader = dir.createReader();
  const batch = () => new Promise((res, rej) => reader.readEntries(res, rej));
  for (let es = await batch(); es.length; es = await batch()) {
    for (const e of es) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory) { if (!e.name.startsWith('.')) { out.push({ path: rel, kind: 'dir' }); out.push(...await listEntry(e, rel)); } }
      else { const file = await new Promise((res, rej) => e.file(res, rej)); out.push({ path: rel, kind: 'file', read: async () => new Uint8Array(await file.arrayBuffer()) }); }
    }
  }
  return out;
}
const readAsBytes = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
async function openDroppedFolder(entry, hp = null) {
  // ハンドルが得られれば、選ぶ画面と同じくハンドルから読む(上書き保存できる。GR21 の O)。得られなければ、今までの読み方(zip で保存する)
  let h = null;
  try { h = hp ? await hp : null; } catch { h = null; }
  if (h?.kind === 'directory') { try { await loadFolder(h.name, await listHandle(h), h); } catch (e) { alert(`フォルダ「${h.name}」を読み込めませんでした(${e?.message ?? e})`); } return; }
  try { await loadFolder(entry.name, await listEntry(entry)); } catch (e) { alert(`フォルダ「${entry.name}」を読み込めませんでした(${e?.message ?? e})`); }
}
$('#btnFolder').addEventListener('click', async () => {
  if (typeof window.showDirectoryPicker === 'function') {
    let h;
    try { h = await window.showDirectoryPicker(); } catch { return; } // フォルダを選ぶ画面でやめたとき
    try { await loadFolder(h.name, await listHandle(h), h); } catch (e) { alert(`フォルダ「${h.name}」を読み込めませんでした(${e?.message ?? e})`); }
    return;
  }
  $('#dirOpen').click();
});
// webkitdirectory の欄(showDirectoryPicker のないブラウザ)。webkitRelativePath の先頭は選んだフォルダの名前。ファイルは File を持っておく
$('#dirOpen').addEventListener('change', async (e) => {
  const picked = [...(e.target.files ?? [])];
  e.target.value = '';
  if (!picked.length) return;
  const name = (picked[0].webkitRelativePath || picked[0].name).split('/')[0];
  const list = picked.map((f) => ({ path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name, kind: 'file', read: () => readAsBytes(f) }));
  try { await loadFolder(name, list); } catch (x) { alert(`フォルダ「${name}」を読み込めませんでした(${x?.message ?? x})`); }
});

// ---- フォルダの木の操作(GR24 の F・M。設計書 9.4 節の段階 C)。新しいファイル・新しいフォルダ・名前の変更・削除・移動・切り取り・
// コピー・貼り付け。フォルダのハンドルがあり書き込みが許可されているときは、その場でディスクに入れる(許可は最初の操作のときに求め、
// 許可されなければ何もせずに理由を出す)。ハンドルがないときは、アプリの中だけで行い、「保存」の zip に入れる。ディスクへの書き込みが
// 失敗したときは、木も変えず(ディスクと木を食い違わせない)、理由を出す。ファイルの操作は、テキストの取り消しの履歴に入れない
// 木の欄の知らせ(GR24 の P5 の N。設計書 9.4 節の段階 C): うまくいった知らせ(treeMsg)は 5 秒ほどで消す(次の知らせが来たら置き換える)。
// 失敗の理由(treeWhy)は、次の操作をするか、「×」で閉じるまで残す。「×」は失敗の理由のときだけ出す
const treeMsgEl = $('#treeMsg');
const TREE_OK_MS = 5000;
let treeMsgTimer = null;
function setTreeMsg(t, isFail = false) {
  clearTimeout(treeMsgTimer);
  treeMsgTimer = null;
  treeMsgEl.textContent = '';
  treeMsgEl.classList[t && isFail ? 'add' : 'remove']('fail');
  treeMsgEl.dataset.kind = t ? (isFail ? 'fail' : 'ok') : '';
  if (!t) return;
  treeMsgEl.append(el('span', 'tmtext', t));
  if (isFail) {
    const x = el('button', 'tmclose', '×');
    x.title = 'この知らせを閉じる';
    x.setAttribute('aria-label', 'この知らせを閉じる');
    x.addEventListener('click', () => setTreeMsg(''));
    treeMsgEl.append(x);
  } else treeMsgTimer = setTimeout(() => { treeMsgTimer = null; setTreeMsg(''); }, TREE_OK_MS);
}
const treeMsg = (t) => setTreeMsg(t ?? '', false);
const treeWhy = (t) => setTreeMsg(t ?? '', true);
// 次の操作を始めたときに、前の失敗の理由を消す
const clearTreeWhy = () => { if (treeMsgEl.dataset.kind === 'fail') setTreeMsg(''); };
const TRASH = 'ブラウザから消したファイルは、ごみ箱に入らず、元に戻せません';
const OP_BUSY = 'ファイルの操作の途中です。今の操作が終わってから、もう一度行ってください';
// 選んだ項目の種類と、新しいものを作る・貼り付けるフォルダ(選んだのがフォルダならその中、ファイルならその持ち主、なければ根)
const kindOf = (p) => (p == null ? null : folder.dirs.has(p) ? 'dir' : itemByPath(p) ? 'file' : null);
const targetDir = (p) => (p == null || kindOf(p) == null ? '' : kindOf(p) === 'dir' ? p : parentOf(p));
// 同じフォルダのほかの名前(self は除く)
const siblings = (dir, self = null) => [...folder.items.map((x) => x.path), ...folder.dirs].filter((p) => parentOf(p) === dir && p !== self).map(baseOf);
const under = (p) => ({ items: folder.items.filter((x) => isSameOrUnder(x.path, p) && x.path !== p), dirs: [...folder.dirs].filter((d) => isSameOrUnder(d, p) && d !== p) });
// 1 つの操作を行う。操作の途中・保存の途中は行わない。フォルダを閉じたら、結果を木に入れない
async function treeOp(fn) {
  if (!folder) return;
  clearTreeWhy();
  if (folder.busy) { treeWhy(OP_BUSY); return; }
  if (saving) { treeWhy(SAVING_NOW); return; }
  const fd = folder;
  fd.busy = true;
  // GR25 の A3: ハンドルがないとき(アプリの中だけの操作)、操作で木(ファイルとフォルダの相対パス)が変わったら、保存の zip に入れるまで
  // 置き換えの確認を出す印を付ける
  const shape = () => JSON.stringify([fd.items.map((x) => x.path).sort(), [...fd.dirs].sort()]);
  const before = fd.handle ? null : shape();
  try { await fn(fd); }
  catch (e) { if (folder === fd) { const m = `ファイルの操作に失敗しました(${errText(e)})`; treeWhy(m); alert(m); } }
  finally { fd.busy = false; if (!fd.handle && shape() !== before) fd.opsDirty = true; if (folder === fd) afterTreeChange(); }
}
// ディスクに入れる前の書き込みの許可(ハンドルがなければ要らない)
async function canWrite(fd) {
  if (!fd.handle) return true;
  const r = await askWrite(fd.handle);
  if (r.ok) return true;
  treeWhy(r.reason);
  alert(r.reason);
  return false;
}
function fail(m) { treeWhy(m); alert(m); }
// GR25 の A6(設計書 9.4 節の段階 C): ディスクへの書き込みが途中で失敗したときの理由。作りかけのファイルは fsops.js が消している。
// 消せなかったもの(e.left)は、理由に書き、木にも出す(ディスクと木を食い違わせない)
async function failWrite(fd, e, head) {
  if (e?.left?.length) {
    if (folder === fd) await addFromDisk(fd, e.left);
    fail(`${head}。作りかけのファイル(${e.left.join('、')})を消せず、ディスクに残っています(${e.leftError ?? ''})。木にも出しました`);
    return;
  }
  fail(`${head}。何も変えていません`);
}
// GR25 の F(設計書 9.4 節の段階 C): フォルダの写し(名前の変更・移動・コピー)が途中で失敗したときの理由。fsops.js の copyDir が、写す先に
// 作ったものを消している。消せなかったもの(r.remain)は、理由に書き、木にも出す(ディスクと木を食い違わせない)
// (moving: 名前の変更・移動のとき。元を消していないことも書く)
async function failCopyDir(fd, r, head, moving = false) {
  if (!r.remain.length) { fail(`${head}(${r.error})。何も変えていません(写す先に作ったものは消しました)`); return; }
  if (folder === fd) await addFromDisk(fd, r.remain);
  fail(`${head}(${r.error})。${moving ? '元のフォルダは消していません。' : ''}\n写す先に作ったもののうち、消せずにディスクに残っているもの(${r.remain.length}): ${r.remain.join('、')}(${r.remainError ?? ''})。木にも出しました`);
}
// 操作の後: モデルに入るファイルの並びを作り直し、木と相対パスを出し直し、全ファイルを解析し直す
function afterTreeChange() {
  syncFiles();
  if (!folder.files[folder.cur] || folder.files[folder.cur].el !== srcEl) setCurrent(folder.cur); else { renderTree(); updatePathBar(); }
  analyze();
}
// テキストを持たないファイルが .sysml になったとき、中身を読んでテキストを持たせる。読めなければ理由を覚える(木では薄く出し、開かない)
async function giveText(fd, it) {
  let r;
  try { r = readSysml(await plainBytes(it)); } catch (e) { r = { ok: false, error: `読めませんでした(${errText(e)})` }; }
  if (!r.ok) { it.bad = r.error; return; }
  const lm = fd.handle ? (await readAt(fd.handle, it.path).catch(() => ({ lastModified: null }))).lastModified : null;
  makeTextItem(it.path, r.text, lm, it);
}
// ファイルの相対パスを変えたときの、テキストを持つファイルのモデルへの出入り(拡張子を .sysml に変えた・.sysml から変えた)と最終更新の時刻
async function moved(fd, it, dst) {
  it.path = dst;
  if (it.el) it.el.dataset.path = dst;
  it.sysml = fileKind(baseOf(dst)) === 'sysml';
  if (it.sysml && !it.el) await giveText(fd, it);
  else if (!it.sysml) it.bad = null;
  // GR25 の A1(設計書 9.4 節の段階 B): 覚えた最終更新の時刻と中身(stamp。読み込んだ・保存したときのもの)は、移したときの時刻で置き換えずに
  // 引き継ぐ。move() や写して名前を変えると時刻が変わるが、上書き保存の前の確かめは、時刻が違えば中身を stamp の中身と比べるので、
  // ほかで変えられていなければ確認は出ず、変えられていれば確認が出る
}
// GR25 の C9: 消したフォルダ(とその中)を、切り取り・コピーしたものから除く(ファイルは dropItem が除く)
function dropClip(fd, p) { if (fd.clip) fd.clip.paths = fd.clip.paths.filter((x) => !isSameOrUnder(x, p)); }
// ファイルを消したときの片づけ(テキスト欄と取り消しの履歴)
function dropItem(fd, it) {
  it.el?.remove();
  if (it.el) fd.history.remove(it.id);
  fd.items = fd.items.filter((x) => x !== it);
  if (fd.clip) fd.clip.paths = fd.clip.paths.filter((p) => p !== it.path);
}
// 名前の入力欄(新しいファイル・新しいフォルダ・名前の変更)。木の中に出し、Enter で決め、Esc でやめる(焦点が外れてもやめる)
function startEdit(mode, path) {
  if (!folder || folder.busy) { if (folder) treeWhy(OP_BUSY); return; }
  const dir = mode === 'rename' ? parentOf(path) : targetDir(path);
  if (dir) { folder.open.add(dir); revealPath(dir); }
  folder.editing = { mode, dir, path: mode === 'rename' ? path : null, isDir: mode === 'newDir' || (mode === 'rename' && folder.dirs.has(path)) };
  treeMsg('');
  renderTree();
}
// 名前の入力欄は、Enter か、焦点が外れたとき(VS Code と同じ)に、入力した名前で決める。名前の規則に反するときは決めずに、理由を出して
// 入力欄に戻す。Esc でやめる(GR24 P3 の裁定)。木を描き直しても、入力した名前を保つ
function editRow(depth) {
  const ed = folder.editing;
  const r = el('div', 'trow tedit');
  r.style.paddingLeft = `${4 + depth * INDENT}px`;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = ed.value ?? (ed.path ? baseOf(ed.path) : '');
  inp.placeholder = ed.mode === 'newDir' ? '新しいフォルダの名前' : ed.mode === 'newFile' ? '新しいファイルの名前(例: 部品.sysml)' : '新しい名前';
  inp.title = 'Enter で決め(焦点が外れたときも決める)、Esc でやめる';
  const why = el('div', 'twhy', ed.why ?? '');
  let done = false;
  // GR25 の C8(設計書 9.4 節の段階 C): 入力欄を閉じたら、焦点を木に戻す(決めた項目は操作が選び、やめたときは元の項目を選んだまま)。
  // 焦点が外れて閉じたとき(木の外へのクリックなど)は、焦点をそこに残す
  const close = (refocus) => { done = true; folder.editing = null; renderTree(); if (refocus) treeEl.focus?.(); };
  const commit = (how) => {
    if (done || folder?.editing !== ed) return;
    const name = inp.value;
    ed.value = name;
    if (ed.path && name === baseOf(ed.path)) { close(how !== 'blur'); return; } // 名前が変わっていない
    // GR25 の C10: 名前が空のまま焦点が外れたら、やめる(理由を出さない)。Enter で空なら、今までどおり理由を出して入力欄に戻す
    if (how === 'blur' && name === '') { close(false); return; }
    const err = nameError(name, siblings(ed.dir, ed.path));
    if (err) { ed.why = err; why.textContent = err; treeWhy(err); setTimeout(() => { if (!done) inp.focus?.(); }, 0); return; }
    // GR25 の C3: ファイルの操作・保存の途中は、入力欄を閉じずに理由を出す(入力した名前を保つ)
    const wait = folder.busy ? OP_BUSY : saving ? SAVING_NOW : null;
    if (wait) { ed.why = wait; why.textContent = wait; treeWhy(wait); return; }
    done = true;
    folder.editing = null;
    if (how !== 'blur') treeEl.focus?.();
    if (ed.mode === 'newFile') treeOp((fd) => newFile(fd, ed.dir, name));
    else if (ed.mode === 'newDir') treeOp((fd) => newDir(fd, ed.dir, name));
    else treeOp((fd) => renameTo(fd, ed.path, name));
  };
  inp.addEventListener('input', () => { ed.value = inp.value; });
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commit('enter');
  });
  // 木の描き直しで入力欄を作り直すときの blur は、決めない(作り直した入力欄が、入力した名前を引き継ぐ)
  inp.addEventListener('blur', () => { if (!treeRendering) commit('blur'); });
  r.append(el('span', 'tw', ed.isDir ? '▸' : ''), inp);
  const box = el('div', 'tbox');
  box.append(r, why);
  // GR25 の C11: 名前の変更の入力欄は、最初に出したとき、ファイルは最後の . の前まで(. がない、または先頭だけなら全体)、フォルダは全体を
  // 選ぶ。新しいファイル・フォルダの入力欄は空のまま。木の描き直しで作り直したときは、カーソルを末尾に置く(今までどおり)
  const first = !ed.shown;
  ed.shown = true;
  setTimeout(() => {
    inp.focus?.();
    if (first && ed.path) {
      const dot = ed.isDir ? -1 : inp.value.lastIndexOf('.');
      inp.setSelectionRange?.(0, dot > 0 ? dot : inp.value.length);
    }
  }, 0);
  return box;
}
async function newFile(fd, dir, name) {
  const p = joinPath(dir, name);
  if (!(await canWrite(fd))) return;
  let lm = null;
  if (fd.handle) {
    try { lm = (await writeNew(fd.handle, p, '')).lastModified; } catch (e) { await failWrite(fd, e, `ファイル「${p}」を作れませんでした(${errText(e)})`); return; }
  }
  if (folder !== fd) return;
  // 新しいファイルの中身は空とし、拡張子は付け足さない。.sysml で終わる名前ならモデルに入り、テキスト欄に出す(設計書 9.4 節)
  const it = fileKind(name) === 'sysml' ? makeTextItem(p, '', lm) : makePlainItem(p, fd.handle ? null : async () => new Uint8Array(0));
  if (!fd.handle && it.el) it.stamp = null;
  fd.items.push(it);
  fd.sel = p;
  revealPath(p);
  syncFiles();
  if (it.el) setCurrentItem(it);
  treeMsg(`ファイル「${p}」を作りました${fd.handle ? '' : '(アプリの中だけ。「保存」の zip に入る)'}`);
}
async function newDir(fd, dir, name) {
  const p = joinPath(dir, name);
  if (!(await canWrite(fd))) return;
  if (fd.handle) {
    try { await makeDir(fd.handle, p); } catch (e) { fail(`フォルダ「${p}」を作れませんでした(${errText(e)})。何も変えていません`); return; }
  }
  if (folder !== fd) return;
  fd.dirs.add(p);
  fd.open.add(p);
  revealPath(p);
  fd.sel = p;
  treeMsg(`フォルダ「${p}」を作りました${fd.handle ? '' : '(アプリの中だけ。「保存」の zip に入る)'}`);
}
// 名前の変更(ファイル・フォルダ)。同じフォルダの中での移動として行う
async function renameTo(fd, src, name) { return moveTo(fd, src, joinPath(parentOf(src), name), 'rename'); }
// ファイル・フォルダを dst に動かす(名前の変更・移動)。書き換えたまま保存していないファイルは、書き換えと取り消しの履歴を引き継ぎ、
// ディスクには動かす前の保存した中身を写す(設計書 9.4 節)
async function moveTo(fd, src, dst, what = 'move') {
  const isDir = fd.dirs.has(src);
  let kept = false; // 失敗の理由を出した(うまくいった知らせで置き換えない。GR24 の P5 の N)
  if (isDir && (dst === src || isSameOrUnder(dst, src))) { fail(`フォルダ「${src}」を、自分自身かその中には移せません`); return false; }
  if (isDir && dst.toLowerCase() === src.toLowerCase()) { fail(`フォルダの名前を、大文字・小文字だけ変えることはできません(写して元を消すとき、大文字・小文字を区別しないディスクでは、元と同じフォルダを消すおそれがあるため)`); return false; }
  if (!(await canWrite(fd))) return false;
  if (!isDir) {
    const it = itemByPath(src);
    if (fd.handle && !it.missing) {
      let r;
      try { r = await moveFile(fd.handle, src, dst); } catch (e) { await failWrite(fd, e, `ファイル「${src}」を「${dst}」に${what === 'rename' ? '名前を変えられ' : '移せ'}ませんでした(${errText(e)})`); return false; }
      treeEl.dataset.via = r.via; // どちらの経路を通ったか(move() か、写して確かめてから消す)。検査で確かめる
      if (folder !== fd) return false;
      if (r.removeError) {
        // 写せたが元を消せなかった: ディスクには両方がある。木にも両方を出す(元はそのまま、写したものは保存した中身の新しいファイル)
        fd.items.push(makePlainItem(dst, null));
        const n = fd.items.at(-1);
        if (n.sysml) await giveText(fd, n);
        fail(`ファイル「${src}」を「${dst}」に写しましたが、元を消せませんでした(${r.removeError})。両方が残っています`);
        return false;
      }
    } else if (!fd.handle) treeEl.dataset.via = 'app';
    await moved(fd, it, dst);
    if (fd.clip) fd.clip.paths = fd.clip.paths.map((p) => (p === src ? dst : p));
  } else {
    const inside = under(src);
    if (fd.handle) {
      const r = await moveDir(fd.handle, src, dst);
      if (folder !== fd) return false;
      if (!r.ok) {
        // 途中で失敗した: 元は消さずに止める。写す先に作ったものは消してある(GR25 の F)
        await failCopyDir(fd, r, `フォルダ「${src}」を「${dst}」に${what === 'rename' ? '名前を変えられ' : '移せ'}ませんでした`, true);
        return false;
      }
      if (r.removeError) { fail(`フォルダ「${src}」を「${dst}」に写して確かめましたが、元を消せませんでした(${r.removeError})。元のフォルダに残ったものは、再読み込みで確かめてください`); kept = true; }
    }
    const map = (p) => dst + p.slice(src.length);
    fd.dirs.delete(src); fd.dirs.add(dst);
    for (const d of inside.dirs) { fd.dirs.delete(d); fd.dirs.add(map(d)); }
    for (const d of [...fd.open]) if (isSameOrUnder(d, src)) { fd.open.delete(d); fd.open.add(map(d)); }
    for (const it of inside.items) await moved(fd, it, map(it.path));
    if (fd.clip) fd.clip.paths = fd.clip.paths.map((p) => (isSameOrUnder(p, src) ? map(p) : p));
  }
  if (fd.sel != null && isSameOrUnder(fd.sel, src)) fd.sel = dst + fd.sel.slice(src.length);
  revealPath(dst);
  if (!kept) treeMsg(`「${src}」を「${dst}」に${what === 'rename' ? '名前を変えました' : '移しました'}`);
  return true;
}
// ディスクに残ったもの(dst の相対パス。/ で終わるものはフォルダ)を木に足す(フォルダの写しが途中で失敗し、作ったものを消せなかったとき)
async function addFromDisk(fd, paths) {
  for (const p of paths) {
    if (p.endsWith('/')) { const d = p.slice(0, -1); if (!hiddenDir(d, true)) fd.dirs.add(d); continue; }
    if (hiddenDir(p) || itemByPath(p)) continue;
    const it = makePlainItem(p, null);
    fd.items.push(it);
    if (it.sysml) await giveText(fd, it);
  }
}
// 削除: 必ず確認を出し、「はい」(OK)のときだけ消す
async function removePaths(fd, paths) {
  const ps = paths.filter((p) => kindOf(p) && !paths.some((q) => q !== p && fd.dirs.has(q) && isSameOrUnder(p, q)));
  if (!ps.length) return;
  const files = ps.flatMap((p) => (fd.dirs.has(p) ? under(p).items : [itemByPath(p)]));
  const dirtyOnes = files.filter((x) => x.dirty);
  const what = ps.map((p) => (fd.dirs.has(p) ? `フォルダ「${p}」(中のファイル ${under(p).items.length})` : `ファイル「${p}」`)).join('、');
  // GR25 の A5(設計書 9.4 節の段階 C)と P1 の裁定の問 2: フォルダの削除では、削除の前にディスクのそのフォルダの中を読み、木にないもの
  // (名前が . で始まるフォルダの中のもの、読み込んだ後にほかで足されたもの)をまとめて数えて、そのことと数を書く。数えるのは、木にない
  // ファイルと、木にない空のフォルダ。読めなければ、消えることがあると書く
  const hidden = [];
  if (fd.handle) {
    for (const p of ps.filter((x) => fd.dirs.has(x))) {
      try {
        const disk = await listIn(fd.handle, p, { hidden: true });
        const full = (rel) => `${p}/${rel}`;
        const extraFiles = disk.files.map((f) => f.path).filter((rel) => !itemByPath(full(rel)));
        const extraDirs = disk.dirs.filter((rel) => !fd.dirs.has(full(rel)) && !disk.files.some((f) => f.path.startsWith(`${rel}/`)) && !disk.dirs.some((d) => d.startsWith(`${rel}/`)));
        const extra = [...extraDirs, ...extraFiles];
        if (extra.length) {
          const names = [...new Set(extra.map((rel) => rel.split('/')[0]))].sort((a, b) => (b.startsWith('.') - a.startsWith('.')) || comparePaths(a, b));
          hidden.push(`「${p}」の中の、木にないもの ${extra.length} 個(${names.slice(0, 3).join('・')} など)も消えます`);
        }
      } catch { hidden.push(`「${p}」の中を読めなかったので、木にないものも消えることがあります`); }
    }
  }
  const q = `${what}を削除しますか?\n${TRASH}。${hidden.length ? `\n${hidden.join('\n')}。` : ''}${dirtyOnes.length ? `\n書き換えたまま保存していないファイル(${dirtyOnes.map((x) => x.path).join('、')})が含まれます。その書き換えも失われます。` : ''}`;
  if (!confirm(q)) { treeMsg('削除をやめました'); return; }
  if (!(await canWrite(fd))) return;
  for (const p of ps) {
    const isDir = fd.dirs.has(p);
    const it = isDir ? null : itemByPath(p);
    if (fd.handle && !(it && it.missing)) {
      try { await removeAt(fd.handle, p, isDir); } catch (e) {
        // フォルダの中の一部だけが消えたかもしれないので、ディスクに残っているかを確かめて、木を合わせる
        if (isDir) await dropGone(fd, p);
        fail(`「${p}」を消せませんでした(${errText(e)})${isDir ? '。ディスクに残っているものは、木にも残しました' : '。何も変えていません'}`);
        return;
      }
    }
    if (folder !== fd) return;
    if (isDir) { for (const x of under(p).items) dropItem(fd, x); for (const d of under(p).dirs) fd.dirs.delete(d); fd.dirs.delete(p); dropClip(fd, p); }
    else dropItem(fd, it);
    if (fd.sel != null && isSameOrUnder(fd.sel, p)) fd.sel = null;
  }
  treeMsg(`${what}を削除しました`);
}
// フォルダ p の中で、ディスクから消えたものを木から除く(削除が途中で失敗したとき)
async function dropGone(fd, p) {
  let disk;
  try { disk = await listDisk(fd.handle); } catch { return; }
  const files = new Set(disk.files.map((f) => f.path)), dirs = new Set(disk.dirs);
  for (const x of under(p).items) if (!files.has(x.path) && !x.missing) dropItem(fd, x);
  for (const d of under(p).dirs) if (!dirs.has(d)) fd.dirs.delete(d);
  if (!dirs.has(p) && ![...fd.items].some((x) => isSameOrUnder(x.path, p))) fd.dirs.delete(p);
}
// ---- 右クリックのメニューとキー
let menuEl = null;
function hideMenu() { menuEl?.remove(); menuEl = null; }
function showMenu(x, y, p) {
  hideMenu();
  const k = kindOf(p);
  menuEl = el('div', 'tmenu');
  menuEl.id = 'treeMenu';
  const item = (label, f, ok = true) => { const b = el('button', null, label); b.disabled = !ok; b.addEventListener('click', () => { hideMenu(); f(); }); menuEl.append(b); };
  if (k !== 'file') item('新しいファイル', () => startEdit('newFile', p));
  if (k !== 'file') item('新しいフォルダ', () => startEdit('newDir', p));
  if (k) { item('切り取り', () => clipTo('cut', p)); item('コピー', () => clipTo('copy', p)); }
  item('貼り付け', () => treeOp((fd) => paste(fd, targetDir(p))), !!folder.clip?.paths.length);
  if (k) { item('名前の変更', () => startEdit('rename', p)); item('削除', () => treeOp((fd) => removePaths(fd, [p]))); }
  menuEl.style.left = `${x}px`; menuEl.style.top = `${y}px`;
  document.body.append(menuEl);
  // GR25 の C7: メニューを画面の中に収める(下や右にはみ出すときは、上や左に開く。それでも収まらなければ画面の端に寄せる)。大きさは
  // 置いた後に測り、測れないときは項目の数から見積もる
  const b = menuEl.getBoundingClientRect?.() ?? { width: 0, height: 0 };
  const w = b.width || 180, h = b.height || menuEl.children.length * 26 + 8;
  const W = window.innerWidth ?? 0, H = window.innerHeight ?? 0;
  let mx = x, my = y;
  if (W && mx + w > W) mx = Math.max(0, x - w >= 0 ? x - w : W - w);
  if (H && my + h > H) my = Math.max(0, y - h >= 0 ? y - h : H - h);
  menuEl.style.left = `${mx}px`; menuEl.style.top = `${my}px`;
}
window.addEventListener('click', (e) => { if (menuEl && !menuEl.contains(e.target)) hideMenu(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
treeBodyEl.addEventListener('contextmenu', (e) => {
  if (!folder) return;
  e.preventDefault();
  const r = e.target.closest?.('.trow');
  const p = r && treeBodyEl.contains(r) && r.dataset.path != null ? r.dataset.path : null;
  folder.sel = p;
  renderTree();
  showMenu(e.clientX ?? 0, e.clientY ?? 0, p);
});
// 木に焦点があるときのキー: F2 で名前の変更、Delete で削除、Ctrl+X・Ctrl+C・Ctrl+V で切り取り・コピー・貼り付け
// GR26 の P5 の K(設計書 9.4 節の段階 C の「操作」): 「ファイル」の区画(#secFiles の中。区画の中に焦点を受ける要素がないので、木の欄
// そのもの #tree に焦点があるときを含む)に焦点があるときだけ。「モデル」の区画・参照箇所の欄・木の欄の上の帯のボタンでは処理しない
// (文字を選んで Ctrl+C を押したときは、ブラウザの文字のコピーを止めない)
const fileKeys = (t) => t === treeEl || secFiles.sec.contains(t);
treeEl.addEventListener('keydown', (e) => {
  if (!folder || folder.editing) return;
  if (!fileKeys(e.target)) return;
  const p = folder.sel, k = kindOf(p);
  const key = (e.key ?? '').toLowerCase(), ctrl = (e.ctrlKey || e.metaKey) && !e.altKey;
  if (e.key === 'F2' && k) { e.preventDefault(); startEdit('rename', p); }
  else if (e.key === 'Delete' && k) { e.preventDefault(); treeOp((fd) => removePaths(fd, [p])); }
  else if (ctrl && key === 'x' && k) { e.preventDefault(); clipTo('cut', p); }
  else if (ctrl && key === 'c' && k) { e.preventDefault(); clipTo('copy', p); }
  else if (ctrl && key === 'v') { e.preventDefault(); treeOp((fd) => paste(fd, targetDir(p))); }
});
$('#btnNewFile').addEventListener('click', () => startEdit('newFile', folder?.sel ?? null));
$('#btnNewDir').addEventListener('click', () => startEdit('newDir', folder?.sel ?? null));

// ---- 移す・写す(GR24 の M)。ドラッグで、ファイル・フォルダをほかのフォルダ(根を含む)に移す(自分自身や自分の下のフォルダには
// 移せない)。切り取り・コピー・貼り付け(右クリックと Ctrl+X・Ctrl+C・Ctrl+V)。貼り付けで同じ名前があるときは、拡張子の前に「 のコピー」
// (さらに重なれば「 のコピー 2」…)を付ける。切り取ったものの貼り付けは移動、コピーしたものの貼り付けは写し(書き換えたまま保存して
// いないファイルを写すときは、保存した中身を写す)
function clipTo(mode, p) {
  if (!folder || !kindOf(p)) return;
  folder.clip = { mode, paths: [p] };
  treeMsg(`「${p}」を${mode === 'cut' ? '切り取りました(貼り付けると移します)' : 'コピーしました(貼り付けると写します)'}`);
  renderTree();
}
async function paste(fd, dir0) {
  let dir = dir0;
  const c = fd.clip;
  if (!c?.paths.length) { treeWhy('貼り付けるものがありません(先に切り取りかコピーをしてください)'); return; }
  for (const src of c.paths) {
    // GR25 の C9: 写す元・移す元が消えていたら、理由を出す
    if (!kindOf(src)) { fail(`「${src}」は、${c.mode === 'cut' ? '切り取った' : 'コピーした'}後に消えたので、貼り付けられません`); return; }
    const isDir = fd.dirs.has(src);
    // フォルダを選んだまま、そのフォルダを写して貼り付けたときは、その隣(持ち主のフォルダ)に写す(自分の中には写せないため)
    if (isDir && dir === src) dir = parentOf(src);
    if (isDir && isSameOrUnder(dir, src)) { fail(`フォルダ「${src}」を、自分自身かその中には${c.mode === 'cut' ? '移せません' : '写せません'}`); return; }
    if (c.mode === 'cut' && parentOf(src) === dir) continue; // 同じフォルダへの切り取りと貼り付けは、何もしない
    const name = copyName(baseOf(src), siblings(dir), isDir);
    const dst = joinPath(dir, name);
    const ok = c.mode === 'cut' ? await moveTo(fd, src, dst) : await copyTo(fd, src, dst);
    if (!ok) return;
  }
  if (c.mode === 'cut') fd.clip = null;
}
// 保存した中身(書き換えたまま保存していないファイルは、書き換える前の保存した中身)
const savedBytes = async (it) => (it.el ? new TextEncoder().encode(it.original.text) : plainBytes(it));
async function copyTo(fd, src, dst) {
  const isDir = fd.dirs.has(src);
  if (!(await canWrite(fd))) return false;
  if (!isDir) {
    const it = itemByPath(src);
    let lm = null, bytes = null;
    if (fd.handle) {
      // GR25 の A1: ディスクに写した中身(ほかで消えていたファイルは保存した中身、それ以外はディスクの今の中身)を覚えて、アプリにも同じ中身を出す
      try { bytes = it.missing ? await savedBytes(it) : (await readAt(fd.handle, src)).bytes; lm = (await writeNew(fd.handle, dst, bytes)).lastModified; }
      catch (e) { await failWrite(fd, e, `ファイル「${src}」を「${dst}」に写せませんでした(${errText(e)})`); return false; }
    }
    if (folder !== fd) return false;
    await addCopy(fd, it, dst, lm, bytes);
  } else {
    const inside = under(src);
    if (fd.handle) {
      const r = await copyDir(fd.handle, src, dst);
      if (folder !== fd) return false;
      if (!r.ok) {
        await failCopyDir(fd, r, `フォルダ「${src}」を「${dst}」に写せませんでした`);
        return false;
      }
    }
    const map = (p) => dst + p.slice(src.length);
    fd.dirs.add(dst);
    for (const d of inside.dirs) fd.dirs.add(map(d));
    for (const it of inside.items) {
      // GR25 の A1: 写した先の中身(写して確かめたもの)を読んで、アプリにも同じ中身を出し、比較の元にする
      let lm = null, bytes = null;
      if (fd.handle) { try { const r = await readAt(fd.handle, map(it.path)); lm = r.lastModified; bytes = r.bytes; } catch { lm = null; bytes = null; } }
      await addCopy(fd, it, map(it.path), lm, bytes);
    }
  }
  revealPath(dst);
  fd.sel = dst;
  treeMsg(`「${src}」を「${dst}」に写しました`);
  return true;
}
// 写したファイルを木に足す(テキストを持つものは、書き換えていない新しいファイル)。GR25 の A1: ディスクに写したときは、その中身 bytes の
// テキストにする(ハンドルがないときは、保存した中身のテキスト)
async function addCopy(fd, it, dst, lm, bytes = null) {
  if (it.el) {
    let text = it.original.text;
    if (bytes) {
      const r = readSysml(bytes);
      if (!r.ok) { const n = makePlainItem(dst, null); n.bad = r.error; fd.items.push(n); return; }
      text = r.text;
    }
    fd.items.push(makeTextItem(dst, text, fd.handle ? lm : null));
    const n = fd.items.at(-1);
    if (!n.sysml) { /* .sysml でない名前のファイルの写し(テキストは持つが、モデルに入らない) */ }
    return;
  }
  const n = makePlainItem(dst, fd.handle ? null : it.read);
  fd.items.push(n);
  if (n.sysml) await giveText(fd, n);
}
// ---- ドラッグ(木の中だけ。ほかのフォルダ(根を含む)に移す)。木の外へのドロップは何もしない
treeBodyEl.addEventListener('dragstart', (e) => {
  const r = e.target.closest?.('.trow');
  if (!folder || !r || r.dataset.path == null) return;
  clearTreeWhy();
  folder.drag = r.dataset.path;
  try { e.dataTransfer.setData('text/plain', r.dataset.path); e.dataTransfer.effectAllowed = 'move'; } catch { /* 偽物の出来事 */ }
});
treeBodyEl.addEventListener('dragend', () => { if (folder) folder.drag = null; treeBodyEl.querySelectorAll('.trow.drop').forEach((x) => x.classList.remove('drop')); });
// GR25 の C6: 名前の入力欄の行(data-path を持たない)の上では、null(何もしない)
const dropDir = (e) => { const r = e.target.closest?.('.trow'); if (!r || !treeBodyEl.contains(r)) return ''; if (r.dataset.path == null) return null; return r.dataset.kind === 'dir' ? r.dataset.path : parentOf(r.dataset.path); };
treeBodyEl.addEventListener('dragover', (e) => {
  if (!folder?.drag) return;
  e.preventDefault(); e.stopPropagation();
  treeBodyEl.querySelectorAll('.trow.drop').forEach((x) => x.classList.remove('drop'));
  const d = dropDir(e);
  if (d == null) return;
  treeBodyEl.querySelector(`.trow[data-path="${CSS.escape(d)}"]`)?.classList.add('drop');
});
treeBodyEl.addEventListener('drop', (e) => {
  if (!folder?.drag) return;
  e.preventDefault(); e.stopPropagation();
  const src = folder.drag, dir = dropDir(e);
  folder.drag = null;
  treeBodyEl.querySelectorAll('.trow.drop').forEach((x) => x.classList.remove('drop'));
  if (dir == null) return; // 名前の入力欄の行の上(GR25 の C6)
  if (parentOf(src) === dir) return; // 同じフォルダには何もしない
  if (folder.dirs.has(src) && isSameOrUnder(dir, src)) { fail(`フォルダ「${src}」を、自分自身かその中には移せません`); return; }
  // GR25 の C2(設計書 9.4 節の段階 C): 名前を変えずに移すときは、名前の規則をかけず、移す先での名前の重なりだけを確かめる
  // (名前の規則は、入力した名前にかける。読み込んだ .gitignore なども移せる)
  const same = siblings(dir).find((n) => n.toLowerCase() === baseOf(src).toLowerCase());
  if (same != null) { fail(`「${src}」を「${dir || folder.name}」に移せません(移す先に同じ名前の「${same}」があります。大文字・小文字は区別しません)`); return; }
  treeOp((fd) => moveTo(fd, src, joinPath(dir, baseOf(src))));
});
// ---- 再読み込み(GR24 の M。設計書 9.4 節): フォルダの木をディスクから読み直す(ハンドルがあるとき)。書き換えていないファイルは
// 中身を読み直す。書き換えたまま保存していないファイルは、今のテキストを保つ(ほかで変えられていれば、保存のときに段階 B の確認を出す)。
// ほかで消えていたら、木に残して印を付け、保存で作り直す。書き換えていないファイルがほかで消えていたら、木から除く
async function reloadTree(fd) {
  if (!fd.handle) { treeWhy('ドロップか「フォルダを開く」の欄で開いたフォルダは、ディスクのフォルダを指していないので、再読み込みできません'); return; }
  let disk;
  try { disk = await listDisk(fd.handle); } catch (e) { fail(`フォルダ「${fd.name}」を読み直せませんでした(${errText(e)})。何も変えていません`); return; }
  if (folder !== fd) return;
  const onDisk = new Map(disk.files.map((f) => [f.path, f]));
  const n = { added: 0, changed: 0, gone: 0, kept: 0 };
  for (const it of [...fd.items]) {
    const d = onDisk.get(it.path);
    if (!d) {
      if (it.dirty || it.missing) { if (!it.missing) n.kept++; it.missing = true; continue; }
      dropItem(fd, it); n.gone++; continue;
    }
    it.missing = false;
    // GR25 の C4: UTF-8 として読めなかった .sysml も読み直す(読めるようになっていれば、テキストを持たせて .sysml として扱う)
    if (!it.el) { if (it.sysml && it.bad) { await giveText(fd, it); if (it.el) n.changed++; } continue; }
    if (it.dirty) continue;
    // 書き換えていないファイル: 中身を読み直す(変わっていれば、テキストと保存したときのテキストを替え、取り消しの履歴を捨てる)
    const shown = it.el.value;
    let file;
    try { file = await d.handle.getFile(); } catch { continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = readSysml(bytes);
    if (!r.ok) continue;
    // GR25 の C1: 読む待ちの間に書き換えられていたら、読み直さない(書き換えたまま保存していないファイルの扱いにする。覚えた比較の元も替えない)
    if (it.dirty || it.el.value !== shown) continue;
    if (r.text !== it.original.text) {
      it.el.value = r.text; it.shadow = it.el.value;
      it.original = { text: r.text, edited: false, eol: eolOf(r.text) };
      it.saved = lf(r.text);
      fd.history.remove(it.id); fd.history.add(it.id);
      refreshDirty(it);
      if (it.el === srcEl) updateHighlight();
      n.changed++;
    }
    it.stamp = { lastModified: file.lastModified ?? null, text: it.original.text };
  }
  for (const f of disk.files) {
    if (itemByPath(f.path)) continue;
    const it = makePlainItem(f.path, null);
    fd.items.push(it);
    if (it.sysml) await giveText(fd, it);
    n.added++;
  }
  const keep = (d) => disk.dirs.includes(d) || fd.items.some((x) => x.missing && isSameOrUnder(x.path, d));
  for (const d of [...fd.dirs]) if (!keep(d)) { fd.dirs.delete(d); dropClip(fd, d); }
  for (const d of disk.dirs) fd.dirs.add(d);
  if (fd.sel != null && !kindOf(fd.sel)) fd.sel = null;
  treeMsg(`ディスクから読み直しました(足されたファイル ${n.added}、変わったファイル ${n.changed}、消えたファイル ${n.gone}${n.kept ? `、消えていたが書き換えたまま保存していないので残したファイル ${n.kept}` : ''})`);
}
$('#btnReload').addEventListener('click', () => treeOp((fd) => reloadTree(fd)));

// ---- 上の帯のボタン
// 「新規」は、空のパッケージの骨組みを入れる。一般ビューでその外枠を選べば「部品を足す」から始められる(GR19 の U2。設計書 9.1 節)
const NEW_TEXT = "package '新しいシステム' {\n}\n";
$('#btnNew').addEventListener('click', () => {
  if (folder) { if (!anyDirty() || confirm(`${unsavedHead()}。フォルダ「${folder.name}」を閉じて新規作成しますか?`)) setText(NEW_TEXT, 'sysmlv2'); return; }
  // 書き換えていたときだけ確認を出す(GR22 の D1。設計書 9.1 節。「開く」・ドロップと同じ判定)
  if (!dirty || confirm('書いている内容を消して新規作成しますか?')) setText(NEW_TEXT, 'sysmlv2');
});
// 「例を読み込む」は、入門用の例と機能紹介用の例の 2 つから、小さなダイアログで選ぶ(GR19 の U3。設計書 9.1 節)。選んだ後の置き換えの
// 確認は今までと同じ
const SAMPLES = [
  { label: '入門用の例(電池・スイッチ・ランプの回路)', note: '部品の定義と使用・ポート・接続と view 1 つだけの短い例', text: () => SAMPLE_INTRO_TEXT, base: 'sample_intro' },
  { label: '機能紹介用の例(見守りシステム)', note: '5 つのビューとグリッドビューの描き方を一通り使う例', text: () => SAMPLE_TEXT, base: 'sample' },
];
$('#btnSample').addEventListener('click', () => {
  const d = $('#dlgSample');
  d.textContent = '';
  d.append(el('h2', null, '例を読み込む'));
  for (const x of SAMPLES) {
    const b = el('button', 'pick', x.label);
    b.title = x.note;
    b.addEventListener('click', () => {
      d.close();
      if (folder) { if (!anyDirty() || confirm(`${unsavedHead()}。フォルダ「${folder.name}」を閉じて、例で置き換えますか?`)) setText(x.text(), x.base); return; }
      if (!dirty || confirm('書いている内容を例で置き換えますか?')) setText(x.text(), x.base); // GR22 の D1(書き換えていたときだけ確認)
    });
    d.append(b, el('div', 'small', x.note));
  }
  const cancel = el('button', null, 'やめる');
  cancel.addEventListener('click', () => d.close());
  d.append(cancel);
  d.showModal();
});
// 範囲・ビューを替えたら、接続を足す途中をやめる(選んだ端が今の図のものでなくなるため。GR18 の E4)
scopeEl.addEventListener('change', () => { syncScopeTitle(); selectedId = null; selectedSrc = null; endConnect(); analyze(); });
// ビューを変えたら、範囲の候補はそのビューのものに変わるので、範囲を選び直す
viewKindEl.addEventListener('change', () => { selectedId = null; selectedSrc = null; scopeEl.value = ''; syncScopeTitle(); endConnect(); analyze(); });
// 「書き方」の中の「コピー」(data-copy の id の要素の文字をコピーする。生成 AI 向けプロンプト。GR17 の H)
$('#btnHelp').addEventListener('click', () => {
  const d = $('#dlgHelp');
  d.innerHTML = HELP_HTML;
  d.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => { const t = d.querySelector(`#${b.dataset.copy}`); if (t) copyText(t.textContent, b); }));
  d.showModal();
});
// ダイアログは枠外をクリックすると閉じる
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }));

// ---- 分割バー
(() => {
  const sp = $('#splitter');
  let drag = false;
  sp.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
  // GR25 の B2: テキスト欄に 240px、図の欄に 320px を残す(両方を守れないときはテキスト欄を優先。src/app/layout.js の dragMiddle)
  window.addEventListener('mousemove', (e) => { if (drag) { lay.text = dragMiddle(window.innerWidth, layState(), e.clientX).text; applyLayout(); } });
})();

// 「ビュー」の選択欄: 作ってあり、この HTML で選べるビューだけを選べるようにする(ほかは「未実装」)
for (const o of $('#viewKind').options) {
  if (ENABLED_VIEWS.includes(o.value)) continue;
  o.disabled = true;
  // 作ってあるが、この HTML のビルドの設定で選べないビュー(ビューごとの HTML)
  if (!/未実装/.test(o.textContent)) o.textContent += '(この HTML では選べない)';
}
if (!ENABLED_VIEWS.includes(viewKindEl.value)) viewKindEl.value = ENABLED_VIEWS[0];

startWorker();
updateHighlight();
analyze();
