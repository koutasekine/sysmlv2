// モデルツリーと参照箇所(GR26 の T・R。設計書 9.5 節)。解析の結果から、画面の「モデル」の区画に出す木と、要素ごとの参照箇所を作る。
// DOM・外部パッケージ・Node.js 固有の機能を使わない(Worker の src/app/worker.js から使い、検査 tests/view・道具 tools/model からも直接呼ぶ)。
// 名前解決・意味エラー・警告・描画・図からの編集の規則と結果は変えない(読むだけ)。
//
// buildOutline(prepared, folder, opts?) → outline
//   prepared は src/view/index.js の prepareView(または src/app/prepare.js の prepareFromAnalysis)の結果(ok が true のもの)。
//   folder はフォルダのときの解析(src/model/files.js の analyzeFiles の結果)。1 つのテキストのときは null。
//   opts.elements が真なら、項目に構文木の要素 element を残す(道具 tools/model/gr26_refs_check.mjs と検査が使う。画面には渡さない)
//   opts.dropped にオブジェクトを渡すと、GR26 の P5 で並べなくした要素を「理由<TAB>種類」ごとに数えて入れる(道具 tools/model/gr26_outline_count.mjs)
//   outline = {
//     items: [item]   木の項目。番号(配列の添字)が項目の id。親は子より前に並ぶ(ファイルの並びの順、ファイルの中は記述の順の、深さ優先の順)
//     roots: [id]     根(大域の名前空間)の子。各ファイルの根の名前空間が直接持つ要素を、ファイルの並びの順、ファイルの中は記述の順に並べる
//     refs: { [id]: [ref] }   その項目の要素に解決している参照(参照箇所。解決済みのものだけ。未検査・曖昧は入れない)
//     errorFiles: [相対パス]  構文エラーのあるファイル(その要素は並ばない)
//     other: 数             役割を決められず「その他の参照」にした参照の数(全体)
//   }
//   item = { id, parent(親の id。根の子は -1), kids: [id], name(表示の名前。名前のない要素は要約), named(名前を持つか), kind(メタクラス),
//            kindJa(種類の日本語名), du('def'・'use'・'pkg'・''), types: [{ text, status, to, q }], mult(多重度の原文。なければ ''),
//            at(移動先 { f, start, end, line }), q(修飾名の表示), file(相対パス。1 つのテキストなら null), key(解析し直した後に同じ要素を
//            見つける鍵: ファイルの相対パスと修飾名と、同じ修飾名の中の記述の順) }
//     types の status は 'resolved'(利用者のモデルの要素。to が移動先、q がその修飾名、k が型の要素の項目の鍵(項目がなければ null))・
//     'library'(標準ライブラリ・内蔵する表の要素)・
//     'unchecked'(未検査)・'ambiguous'(曖昧)。to は status が 'resolved' のときだけ持つ
//   ref = { role(役割の日本語名), owner(参照している要素の修飾名の表示), at({ f, start, end, line }。参照の名前の字句), text(書いた名前) }
//   at の f は、フォルダのときは解析のファイルの番号(analyzeFiles の files の添字)、1 つのテキストのときは null。start・end はそのファイル
//   (1 つのテキストならそのテキスト)の中の位置、line はそのファイルの中の行(1 から)
// visibleRows・ROLE・ROLE_ORDER は src/app/modeltree.js(画面 src/app/main.js も使うので、何も読み込まない別のファイルに置く)

import { USAGE_JA, DEF_JA } from '../model/warn.js';
import { tokensOf } from '../edit/index.js';
import { unquote } from '../parser/lexer.js';
import { transitionEnds, successionEnds } from '../view/ends.js';
import { ROLE } from './modeltree.js';

export { ROLE, ROLE_ORDER, visibleRows } from './modeltree.js';

// ---- 並べる要素(設計書 9.5 節の「並べる要素」)
// パッケージ、すべての種類の定義と使用、名前がなくても構成をたどるのに要る要素(遷移・継承・接続・結合・流れ・perform・exhibit・satisfy など)。
// import・注釈(メタデータ・注・doc)・式・値・多重度の中身は並べない(要素を並べず、その中にも入らない)。原文に書かれていない暗黙の要素
// (原文の範囲が空のもの)も並べない。接続・継承・遷移・流れ・メッセージの端の特徴で名前のないもの(端の書き方の一部)と、遷移が持つ継承
// (遷移の先の書き方の一部)も並べない(持ち主の要約に端を書く)
const conf = (model, e, k) => !!e && model.conforms(e.kind, k);
const ENDS_OF = ['Connector', 'FlowUsage', 'SuccessionFlowUsage'];
function listed(model, rel, el, owner) {
  if (!el || el.builtin || el.virtual || el.start >= el.end) return false;
  if (conf(model, el, 'AnnotatingElement') || conf(model, el, 'MetadataUsage')) return false;
  if (conf(model, el, 'Multiplicity')) return false;
  const named = el.name !== undefined || el.shortName !== undefined;
  // 端(接続・継承・流れの EndFeatureMembership、メッセージの端の ParameterMembership)と、流れの運ぶもの(PayloadFeature)で、名前のないもの
  if (!named && ENDS_OF.some((k) => conf(model, owner, k)) && (conf(model, rel, 'EndFeatureMembership') || conf(model, rel, 'ParameterMembership'))) return false;
  if (!named && conf(model, el, 'PayloadFeature')) return false;
  if (!named && conf(model, el, 'FlowEnd')) return false;
  // satisfy の by の主体(satisfy R by X の X を値に持つ、名前を宣言しない主体の引数。satisfy の書き方の一部)
  if (!named && conf(model, owner, 'SatisfyRequirementUsage') && conf(model, rel, 'SubjectMembership')) return false;
  // 遷移が持つ継承(遷移の先の書き方の一部)
  if (conf(model, el, 'Succession') && !conf(model, el, 'TransitionUsage') && conf(model, owner, 'TransitionUsage')) return false;
  // 式(計算・制約・要求などの使用は Expression に適合するが、使用なので並べる)
  if (conf(model, el, 'Expression') && !conf(model, el, 'Usage')) return false;
  // GR26 の P5 の T(設計書 9.5 節の「並べる要素」): 送信・受信・代入の行動の引数で名前を宣言していないもの(送るもの・宛先・経由・代入する値。
  // 行動の書き方の一部で、持ち主の要約に書く)と、式を値に持つだけの名前のない特徴は並べない(その下の要素も並べない)
  if (!named && conf(model, rel, 'ParameterMembership') && ARGS_OF.some((k) => conf(model, owner, k))) return dropped(el, 'arg');
  if (!named && conf(model, el, 'Feature') && valueOnly(model, el)) return dropped(el, 'value');
  // 名前のない特徴の連鎖(遷移の元 first a.b、代入の対象などの a.b を表す KerML の特徴。参照の書き方の一部)
  if (!named && el.kind === 'Feature' && el.owned.some((c) => conf(model, c, 'FeatureChaining'))) return dropped(el, 'chain');
  if (conf(model, el, 'Usage') || conf(model, el, 'Definition') || conf(model, el, 'Package')) return true;
  // KerML の型(クラス・特徴・継承など)
  return conf(model, el, 'Type');
}
const ARGS_OF = ['SendActionUsage', 'AcceptActionUsage', 'AssignmentActionUsage'];
const PERFORMS = ['PerformActionUsage'];
// 種類と相手の名前を要約に書く要素(宣言の始まりの字句を選ぶもの)
const SUMMARY_KINDS = ['Connector', 'Succession', 'TransitionUsage', 'FlowUsage', 'SuccessionFlowUsage', 'SatisfyRequirementUsage', 'AssertConstraintUsage',
  'EventOccurrenceUsage', 'AcceptActionUsage', 'SendActionUsage', 'AssignmentActionUsage', 'ControlNode', 'IfActionUsage', 'LoopActionUsage', 'TerminateActionUsage'];
const CONTROL = ['ControlNode', 'IfActionUsage', 'LoopActionUsage', 'TerminateActionUsage'];
// キーワードだけで書く、名前のない要素を持つ関係(objective; subject; actor; stakeholder; require; frame; return; など)
const KEYWORD_RELS = ['ObjectiveMembership', 'SubjectMembership', 'ActorMembership', 'StakeholderMembership', 'RequirementConstraintMembership',
  'FramedConcernMembership', 'RequirementVerificationMembership', 'ReturnParameterMembership', 'ViewRenderingMembership'];
// 式を値に持つだけ: 名前を宣言せず、原文に書かれた関係が値(FeatureValue)だけの特徴(型・再定義・本体を持たない)
function valueOnly(model, el) {
  const rs = el.owned.filter((c) => c.end > c.start);
  return rs.length > 0 && rs.every((c) => conf(model, c, 'FeatureValue'));
}
// 並べなくした要素を、種類と理由ごとに数える(道具 tools/model/gr26_outline_count.mjs が buildOutline の opts.dropped で受け取る)
let dropStats = null;
function dropped(el, why) {
  if (dropStats) { const k = `${why}\t${el.kind}`; dropStats[k] = (dropStats[k] ?? 0) + 1; }
  return false;
}

// ---- 種類の日本語名(設計書 9.5 節の「項目の表示」。「書き方」の言葉で、9.2 節の警告の文と同じもの: src/model/warn.js の表)
// 表にない種類は、表にある種類のうち、適合する最も下位のもの(例: 受け取りの行動 AcceptActionUsage は「行動の使用」)とする
const KIND_JA = { ...Object.fromEntries(Object.entries(USAGE_JA).map(([k, v]) => [k, `${v}の使用`])), ...DEF_JA, Succession: '継承', Namespace: '名前空間' };
const jaCache = new Map();
function kindJaOf(model, kind) {
  if (jaCache.has(kind)) return jaCache.get(kind);
  let best = null, depth = -1;
  if (KIND_JA[kind]) best = KIND_JA[kind];
  else {
    for (const k of Object.keys(KIND_JA)) {
      if (!model.conforms(kind, k)) continue;
      // 下位の種類ほど、適合する表の種類が多い(上位の種類をたどった数で比べる)
      const d = Object.keys(KIND_JA).filter((x) => model.conforms(k, x)).length;
      if (d > depth) { depth = d; best = KIND_JA[k]; }
    }
  }
  const v = best ?? kind;
  jaCache.set(kind, v);
  return v;
}
const duOf = (model, el) => (conf(model, el, 'Package') ? 'pkg' : conf(model, el, 'Definition') || conf(model, el, 'Classifier') && !conf(model, el, 'Feature') ? 'def' : conf(model, el, 'Usage') || conf(model, el, 'Feature') ? 'use' : '');

// ---- 参照の役割(設計書 9.5 節の「参照箇所」。役割の日本語名と並びは src/app/modeltree.js の ROLE・ROLE_ORDER)。参照を持つ関係の種類と、
// その上の要素の並び(持ち主の種類と、何番目の端か)で決める
// 端の何番目か(EndFeatureMembership・メッセージの ParameterMembership の中で)
function endIndex(model, conn, rel, kind) {
  let i = 0;
  for (const c of conn.owned) {
    if (!conf(model, c, kind)) continue;
    if (c === rel) return i;
    i++;
  }
  return -1;
}
// 端の特徴 f(持ち主の関係 rel、その持ち主 conn)の役割。端でなければ null
function endRole(model, rel, conn) {
  if (!conn) return null;
  const end = conf(model, rel, 'EndFeatureMembership');
  const par = conf(model, rel, 'ParameterMembership');
  if (!end && !par) return null;
  if (conf(model, conn, 'FlowUsage') || conf(model, conn, 'SuccessionFlowUsage')) {
    // メッセージ(端を持たない流れ)の送り手・受け手は ParameterMembership の事象
    const k = end ? endIndex(model, conn, rel, 'EndFeatureMembership') : endIndex(model, conn, rel, 'ParameterMembership');
    if (par && conn.owned.some((c) => conf(model, c, 'EndFeatureMembership'))) return null;
    if (par) return k === 0 ? 'messageSource' : k === 1 ? 'messageTarget' : null;
    return k === 0 ? 'flowSource' : k === 1 ? 'flowTarget' : 'flowTarget';
  }
  if (!end) return null;
  if (conf(model, conn, 'TransitionUsage')) return null;
  if (conf(model, conn, 'Succession')) return endIndex(model, conn, rel, 'EndFeatureMembership') === 0 ? 'successionSource' : 'successionTarget';
  if (conf(model, conn, 'BindingConnector')) return 'bindEnd';
  if (conf(model, conn, 'AllocationUsage')) return 'allocateEnd';
  if (conf(model, conn, 'Connector')) return 'connectEnd';
  return null;
}
// 参照 rec の役割の記号(ROLE の鍵)。parent は構文木の親の Map
function roleOf(model, parent, rec, seg = null) {
  let node = rec.node, prop = rec.prop;
  const up = (e) => parent.get(e) ?? null;
  // 修飾名の途中の区切り(P::X の P)は、参照を持つ関係によらず「修飾名の区切り」(GR26 の P5 の R)
  if (seg != null && rec.segments && seg < rec.segments.length - 1) return 'qualifier';
  // 特徴の連鎖(a.b)の区切り: 連鎖の特徴を持つ関係の役割とする
  for (let k = 0; k < 20 && conf(model, node, 'FeatureChaining'); k++) {
    const chain = up(node), rel = up(chain);
    if (!rel) break;
    node = rel; prop = null;
  }
  const P = up(node);           // 関係の持ち主(型付けなら、型を付けた特徴)
  const PR = up(P);             // その持ち主を所有する関係
  const PO = up(PR);            // その関係の持ち主
  // 遷移の元(first A)と、遷移が持つ継承の終点(遷移の先)
  if (conf(model, node, 'Membership') && !conf(model, node, 'FeatureMembership') && conf(model, P, 'TransitionUsage')) return 'transitionSource';
  if (conf(model, node, 'OwningMembership') && conf(model, P, 'TransitionUsage')) return 'transitionSource';
  for (let x = node, k = 0; x && k < 8; x = up(x), k++) {
    if (conf(model, x, 'Succession') && !conf(model, x, 'TransitionUsage') && conf(model, up(up(x)), 'TransitionUsage')) return 'transitionTarget';
  }
  if (conf(model, node, 'FeatureTyping') || conf(model, node, 'ConjugatedPortTyping')) {
    if (conf(model, P, 'PayloadFeature')) return 'payload';
    if (conf(model, PO, 'AcceptActionUsage') && conf(model, PR, 'ParameterMembership')) return 'accept';
    return 'typing';
  }
  if (conf(model, node, 'Subclassification') || conf(model, node, 'Specialization') && !conf(model, node, 'Subsetting') && !conf(model, node, 'FeatureTyping')) {
    if (conf(model, node, 'Subclassification') || !conf(model, node, 'Subsetting')) return 'specialization';
  }
  if (conf(model, node, 'Conjugation')) return 'conjugation';
  if (conf(model, node, 'ReferenceSubsetting') || conf(model, node, 'Redefinition') || conf(model, node, 'Subsetting')) {
    // 端の特徴(P)の参照なら、端の役割。流れの端(FlowEnd)の中の再定義(a.b の b)も流れの端
    let e = P, rel = PR, conn = PO;
    if (conf(model, P, 'ReferenceUsage') && conf(model, PR, 'FeatureMembership') && conf(model, PO, 'FlowEnd')) { e = PO; rel = up(PO); conn = up(rel); }
    if (conf(model, e, 'FlowEnd') || conf(model, rel, 'EndFeatureMembership') || conf(model, rel, 'ParameterMembership')) {
      const r = endRole(model, rel, conn);
      if (r) return r;
    }
    if (conf(model, node, 'ReferenceSubsetting')) {
      // exhibit の状態の使用と include のユースケースの使用は perform の行動の使用の特殊化なので、先に調べる(GR26 の P5 の R)
      if (conf(model, P, 'ExhibitStateUsage')) return 'exhibit';
      if (conf(model, P, 'IncludeUseCaseUsage')) return 'include';
      if (conf(model, P, 'PerformActionUsage')) return 'perform';
      if (conf(model, P, 'SatisfyRequirementUsage')) return 'satisfy';
      if (conf(model, P, 'AssertConstraintUsage')) return 'assert';
      if (conf(model, PR, 'RequirementVerificationMembership')) return 'verify';
      if (conf(model, P, 'EventOccurrenceUsage')) return 'event';
      return 'reference';
    }
    if (conf(model, node, 'Redefinition')) return 'redefinition';
    return 'subsetting';
  }
  if (conf(model, node, 'MembershipImport') || conf(model, node, 'NamespaceImport')) {
    return conf(model, node, 'MembershipExpose') || conf(model, node, 'NamespaceExpose') ? 'expose' : 'import';
  }
  if (conf(model, node, 'Dependency')) return prop === 'client' ? 'dependencyClient' : prop === 'supplier' ? 'dependencySupplier' : 'other';
  if (conf(model, node, 'Annotation')) return 'annotation';
  if (conf(model, node, 'FeatureMembership') && prop === 'memberFeature') return 'first';
  // 名前の参照(memberElement)と、式の中の特徴の連鎖(a.b.c。連鎖の特徴を所有する Membership)
  if (conf(model, node, 'Membership') && (rec.prop === 'memberElement' || prop === null)) {
    // 別名(alias A for X)は、名前空間が所有する参照の Membership
    if (!conf(model, P, 'Expression') && !conf(model, P, 'Step') && !conf(model, P, 'TransitionUsage') && conf(model, P, 'Namespace') && !conf(model, P, 'AssignmentActionUsage')) return 'alias';
    if (conf(model, P, 'AssignmentActionUsage')) return 'assign';
    if (conf(model, P, 'Expression')) {
      // 式の中の参照。satisfy の by、send の送るもの・宛先・経由、accept の経由は、式を値に持つ引数の持ち主で見分ける。式の中の
      // 引数の特徴(連鎖 a.b の a を値に持つ特徴など。使用でないもの)も式の一部としてたどり、連鎖のどの区切りも同じ役割にする(GR26 の P5 の R)
      let x = P;
      const inExpr = (e) => conf(model, e, 'Expression') && !conf(model, e, 'Usage')
        || conf(model, e, 'Feature') && !conf(model, e, 'Usage') && conf(model, up(up(e)), 'Expression') && !conf(model, up(up(e)), 'Usage');
      for (let k = 0; k < 60 && x && inExpr(x); k++) x = up(up(x));
      // x は式の外の最初の要素(式を値に持つ特徴)。xr はそれを持つ関係、xo はその持ち主
      const xr = up(x), xo = up(xr);
      if (conf(model, xo, 'SatisfyRequirementUsage')) return 'satisfyBy';
      if (conf(model, xo, 'SendActionUsage') && conf(model, xr, 'ParameterMembership')) {
        // 送信の引数は、送るもの・経由(via)・宛先(to)の順(via を書かないときも、空の引数を置く。SysML 2.0 の SendNode)
        const i = endIndex(model, xo, xr, 'ParameterMembership');
        return i === 0 ? 'sendPayload' : i === 1 ? 'sendVia' : i === 2 ? 'sendTo' : 'expression';
      }
      if (conf(model, xo, 'AcceptActionUsage') && conf(model, xr, 'ParameterMembership') && endIndex(model, xo, xr, 'ParameterMembership') === 1) return 'acceptVia';
      // 代入の対象の連鎖(assign a.b := … の a。b は対象の特徴の名前の参照で、assign の対象)
      if (conf(model, xo, 'AssignmentActionUsage') && conf(model, xr, 'ParameterMembership') && endIndex(model, xo, xr, 'ParameterMembership') === 0) return 'assign';
      return 'expression';
    }
  }
  return 'other';
}


export function buildOutline(prepared, folder = null, opts = {}) {
  dropStats = opts.dropped ?? null;
  try { return build(prepared, folder, opts); } finally { dropStats = null; }
}
function build(prepared, folder, opts) {
  const ctx = prepared.ctx;
  const { tree, model, text } = ctx;
  const parent = ctx.parent;
  const files = folder && !folder.single ? folder.files : null;
  const fileAt = (at) => {
    if (!files) return -1;
    let lo = 0, hi = files.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (files[m].base <= at) { k = m; lo = m + 1; } else hi = m - 1; }
    return k >= 0 && at <= files[k].end ? k : -1;
  };
  // フォルダが 1 つのファイルだけのときは、位置はそのファイルの中の位置のまま(analyzeFiles の single)
  const single0 = folder && folder.single ? 0 : null;
  // 行の数え上げを速くする(ファイルごとに、行の始まりの位置の並び)
  const lineStarts = new Map();
  const startsOf = (k) => {
    if (lineStarts.has(k)) return lineStarts.get(k);
    const t = k < 0 ? text : files[k].text;
    const s = [0];
    for (let i = t.indexOf('\n'); i >= 0; i = t.indexOf('\n', i + 1)) s.push(i + 1);
    lineStarts.set(k, s);
    return s;
  };
  const lineOf = (k, local) => { const s = startsOf(k); let lo = 0, hi = s.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= local) lo = m; else hi = m - 1; } return lo + 1; };
  const at = (start, end) => {
    const k = fileAt(start);
    if (files && k < 0) return null;
    const base = k >= 0 ? files[k].base : 0;
    return { f: k >= 0 ? k : single0, start: start - base, end: end - base, line: lineOf(k, start - base) };
  };
  const tokens = tokensOf(text) ?? [];
  const refsOfNode = new Map();
  for (const r of model.refs) { if (!refsOfNode.has(r.node)) refsOfNode.set(r.node, []); refsOfNode.get(r.node).push(r); }
  // 字句の二分探索(位置 p 以降の最初の字句)
  const tokAt = (p) => { let lo = 0, hi = tokens.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tokens[m].start < p) lo = m + 1; else hi = m; } return tokens[lo] ?? null; };
  // 宣言の名前の字句(src/edit/index.js の declarationRange と同じ結果: 要素の範囲の字句のうち、子の要素と、要素が持つ参照の範囲の外にある、
  // 名前が同じ字句の最初のもの。短い名前は < と > の間のもの)。declarationRange は要素ごとに全ての参照と字句をたどるので、大きなモデルでは
  // 要素の数の 2 乗に比例して遅くなる。ここでは、字句を二分探索で探し、要素ごとの参照の表を使う(検査 tests/view/app.mjs の 26 で同じ結果を確かめる)
  const declName = (el, which) => {
    const want = el[which];
    if (want === undefined) return null;
    const skip = [...el.owned, ...el.related].filter((c) => c.end > c.start).map((c) => [c.start, c.end]);
    for (const r of refsOfNode.get(el) ?? []) if (r.start != null) skip.push([r.start, r.end]);
    const inside = (t) => skip.some(([a, b]) => t.start >= a && t.end <= b);
    let lo = 0, hi = tokens.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tokens[m].start < el.start) lo = m + 1; else hi = m; }
    for (let i = lo; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.start >= el.end) break;
      if (t.kind !== 'NAME' || inside(t) || unquote(t.text) !== want) continue;
      const short = tokens[i - 1]?.text === '<' && tokens[i + 1]?.text === '>';
      if (short === (which === 'shortName')) return { start: t.start, end: t.end };
    }
    return null;
  };
  // 要素の移動先(設計書 9.5 節の「移動」。GR26 の P5 の J): 名前を宣言した要素は名前の字句。名前を宣言せずに参照する名前を項目の名前として
  // 出す要素(perform drive; の drive、:>> '光量' の '光量' など)は、その参照の名前の字句(連鎖・修飾名なら最後の区切り)。それ以外の名前が
  // ない要素は、宣言の始まりの字句(entry; の entry、then s1; の then。要素を持つ関係の始まりから。注と可視性の字句は飛ばす)
  const isNote = (t) => t.kind === 'REGULAR_COMMENT' || t.kind === 'SINGLE_LINE_NOTE' || t.kind === 'MULTI_LINE_NOTE';
  const VIS = new Set(['public', 'private', 'protected']);
  // 要素が書いた再定義・参照の部分集合・部分集合の参照(書いた順。特徴の連鎖 a.b は最後の区切りの参照)。op は書き方の記号
  const namingRefs = (el) => {
    const out = [];
    for (const c of el.owned) {
      const [prop, op] = conf(model, c, 'ReferenceSubsetting') ? ['referencedFeature', '::>'] : conf(model, c, 'Redefinition') ? ['redefinedFeature', ':>>']
        : conf(model, c, 'Subsetting') ? ['subsettedFeature', ':>'] : [null, null];
      if (!prop) continue;
      let r = refOf(c, prop), full = r;
      if (!r) {
        const ch = c.related.find((x) => conf(model, x, 'Feature') && x.owned.some((y) => conf(model, y, 'FeatureChaining')));
        const segs = ch ? ch.owned.filter((y) => conf(model, y, 'FeatureChaining')).map((y) => refOf(y, 'chainingFeature')) : [];
        r = segs.at(-1) ?? null;
        full = segs.length && segs.every(Boolean) ? { segments: [{ name: segs.map((x) => written(x)).join('.') }] } : r;
      }
      const sg = r?.segments?.at(-1);
      if (!sg || sg.start == null || sg.end <= sg.start) continue;
      out.push({ op, r: full, sg });
    }
    return out;
  };
  const namingRef = (el, nm) => {
    const rs = namingRefs(el);
    const hit = rs.find((x) => x.sg.name === nm) ?? rs[0];
    return hit ? { start: hit.sg.start, end: hit.sg.end } : null;
  };
  // 名前のない要素の、名前の代わりに書く再定義などの参照(perform・exhibit・include の参照の部分集合を含む)
  const namingRefOf = (el) => namingRefs(el)[0] ?? null;
  const nameRange = (el) => {
    for (const which of ['name', 'shortName']) {
      if (el[which] === undefined) continue;
      const r = declName(el, which);
      if (r) return r;
    }
    // 名前を宣言せずに参照する名前を項目の名前として出す要素(実効の名前があるもの、perform・exhibit・include、名前の代わりに :>> x などを
    // 要約に書く要素)は、その参照の名前の字句
    const nm = nameOf(el);
    if (nm != null || PERFORMS.some((k) => conf(model, el, k)) || !SUMMARY_KINDS.some((k) => conf(model, el, k))) { const r = namingRef(el, nm); if (r) return r; }
    const rel = parent.get(el);
    const p = rel && conf(model, rel, 'Membership') && rel.end > rel.start && rel.start < el.start ? rel.start : el.start;
    let t = tokAt(p);
    while (t && t.start < el.end && (isNote(t) || VIS.has(t.text))) t = tokAt(t.end);
    return t && t.start < el.end ? { start: t.start, end: t.end } : { start: el.start, end: el.start };
  };

  const items = [];
  const idOf = new Map();
  const nameOf = (el) => { const n = model.namesOf(el); return n?.name ?? n?.shortName ?? null; };
  const refOf = (node, prop) => (refsOfNode.get(node) ?? []).find((r) => r.prop === prop) ?? null;
  const written = (r) => (r ? (r.segments?.length ? (r.global ? '$::' : '') + r.segments.map((s) => s.name).join('::') : r.text) : '?');
  // 端の名前(連鎖 a.b を含めて全部。GR26 の P5 の T)。接続の端は参照の部分集合(名前か特徴の連鎖)、流れの端(a.b)は参照の部分集合の a と、
  // 端の中の特徴の再定義の b
  const endText = (f) => {
    if (!f) return '?';
    const parts = [];
    for (const c of f.owned) {
      if (conf(model, c, 'ReferenceSubsetting')) {
        const r = refOf(c, 'referencedFeature');
        if (r) parts.push(written(r));
        else {
          const ch = c.related.find((x) => conf(model, x, 'Feature'));
          if (ch) parts.push(ch.owned.filter((y) => conf(model, y, 'FeatureChaining')).map((y) => written(refOf(y, 'chainingFeature'))).join('.'));
        }
      }
      if (conf(model, c, 'FeatureMembership')) for (const x of c.related) { const rd = x.owned.find((y) => conf(model, y, 'Redefinition')); if (rd) parts.push(written(refOf(rd, 'redefinedFeature'))); }
    }
    return parts.length ? parts.join('.') : nameOf(f) ?? '?';
  };
  // 原文の短い写し(空白をまとめ、長いものは省略の記号で切る)
  const srcText = (e) => { const t = text.slice(e.start, e.end).replace(/\s+/g, ' ').trim(); return t.length > 40 ? `${t.slice(0, 39)}…` : t; };
  const params = (el) => el.owned.filter((c) => conf(model, c, 'ParameterMembership')).map((c) => c.related[0] ?? null);
  const typeText = (x) => { const ty = x.owned.find((c) => conf(model, c, 'FeatureTyping')); return ty ? written(refOf(ty, 'type')) : null; };
  // 遷移・継承の端の名前(名前のない entry・do・exit の行動は entry などと書く)
  const targetName = (t, fallback) => {
    if (!t) return fallback;
    const n = nameOf(t);
    if (n != null) return n;
    const r = parent.get(t);
    return conf(model, r, 'StateSubactionMembership') ? (r.attrs.kind ?? fallback) : fallback;
  };
  // 名前のない要素の要約(種類と、たどる相手の名前)
  const summary = (el) => {
    if (conf(model, el, 'TransitionUsage')) {
      const e = transitionEnds(ctx, el);
      return `遷移 ${targetName(e.source, '?')} → ${targetName(e.target, '?')}`;
    }
    if (conf(model, el, 'Succession') && !conf(model, el, 'SuccessionFlowUsage')) {
      const e = successionEnds(ctx, el);
      return `継承 ${targetName(e.source, '?')} → ${targetName(e.target, '?')}`;
    }
    const ends = el.owned.filter((c) => conf(model, c, 'EndFeatureMembership')).map((c) => c.related[0]).filter(Boolean);
    const msgEnds = el.owned.filter((c) => conf(model, c, 'ParameterMembership')).map((c) => c.related[0]).filter((x) => conf(model, x, 'EventOccurrenceUsage'));
    if (conf(model, el, 'FlowUsage') || conf(model, el, 'SuccessionFlowUsage')) {
      if (ends.length) return `フロー ${ends.map(endText).join(' → ')}`;
      if (msgEnds.length) return `メッセージ ${msgEnds.map(endText).join(' → ')}`;
      return 'メッセージ';
    }
    if (conf(model, el, 'BindingConnector')) return `結合 ${ends.map(endText).join(' = ')}`;
    if (conf(model, el, 'AllocationUsage')) return `割り当て ${ends.map(endText).join(' → ')}`;
    if (conf(model, el, 'InterfaceUsage')) return `インターフェース ${ends.map(endText).join(' – ')}`;
    if (conf(model, el, 'Connector')) return `接続 ${ends.map(endText).join(' – ')}`;
    const rs = el.owned.find((c) => conf(model, c, 'ReferenceSubsetting'));
    // exhibit・include は perform の特殊化なので先に調べる(GR26 の P5 の R・T)
    const word = conf(model, el, 'ExhibitStateUsage') ? 'exhibit' : conf(model, el, 'IncludeUseCaseUsage') ? 'include' : conf(model, el, 'PerformActionUsage') ? 'perform'
      : conf(model, el, 'SatisfyRequirementUsage') ? 'satisfy' : conf(model, el, 'AssertConstraintUsage') ? 'assert' : conf(model, el, 'EventOccurrenceUsage') ? '事象' : null;
    if (word) {
      const what = rs ? endText(el) : (() => { const ty = el.owned.find((c) => conf(model, c, 'FeatureTyping')); return ty ? written(refOf(ty, 'type')) : '?'; })();
      if (conf(model, el, 'SatisfyRequirementUsage')) {
        const by = el.owned.filter((c) => conf(model, c, 'SubjectMembership')).flatMap((c) => c.related).flatMap((x) => x.owned).filter((c) => conf(model, c, 'FeatureValue')).flatMap((c) => c.related)[0];
        const byRef = by ? (refsOfNode.get(by.owned.find((c) => conf(model, c, 'Membership'))) ?? [])[0] : null;
        return `satisfy ${what}${byRef ? ` by ${written(byRef)}` : ''}`;
      }
      return `${word} ${what}`;
    }
    // 受信・送信・代入の行動(GR26 の P5 の T)。受信は受け取るものの名前か型(どちらもなければ原文)、送信は送るものと宛先(to)、代入は対象
    if (conf(model, el, 'AcceptActionUsage')) {
      const pl = params(el)[0];
      return `受信 ${pl && pl.start < pl.end ? nameOf(pl) ?? typeText(pl) ?? srcText(pl) : '?'}`;
    }
    if (conf(model, el, 'SendActionUsage')) {
      const [pl, , to] = params(el);
      const what = pl && pl.start < pl.end ? srcText(pl) : '?';
      return to && to.start < to.end ? `送信 ${what} → ${srcText(to)}` : `送信 ${what}`;
    }
    if (conf(model, el, 'AssignmentActionUsage')) {
      // 対象は、最初の引数(連鎖の前の部分。書いたときだけ)と、対象の特徴の名前の参照
      const tr = el.owned.filter((c) => conf(model, c, 'Membership') && !conf(model, c, 'ParameterMembership')).map((c) => refOf(c, 'memberElement')).find(Boolean);
      const head = params(el)[0];
      return `代入 ${head && head.start < head.end ? `${srcText(head).replace(/\s*\.$/, '')}.` : ''}${tr ? written(tr) : '?'}`;
    }
    // entry・do・exit の行動
    const rel = parent.get(el);
    if (conf(model, rel, 'StateSubactionMembership')) return `${rel.attrs.kind ?? 'entry'} の行動`;
    // 制御の節(decide・fork・join・merge)、if・ループ、terminate: 宣言の始まりのキーワード(terminate は止める相手も)
    if (CONTROL.some((k) => conf(model, el, k))) {
      const kw = text.slice(nameRange(el).start, nameRange(el).end);
      if (conf(model, el, 'TerminateActionUsage')) { const pl = params(el).find((x) => x && x.start < x.end); return pl ? `${kw} ${srcText(pl)}` : kw; }
      return kw;
    }
    // 名前を書かずに再定義・参照の部分集合・部分集合だけを書いた特徴(:>> x、::> x、:> x。実効の名前が求まらないもの)は、その書き方
    const nr = namingRefOf(el);
    if (nr) return `${nr.op} ${written(nr.r)}`;
    // キーワードだけの要素(objective; subject; など。名前を書かない要素を持つ関係の種類で見分ける)は、種類の日本語名
    if (KEYWORD_RELS.some((k) => conf(model, rel, k))) return kindJaOf(model, el.kind);
    return '(名前なし)';
  };
  // 多重度([2] など。要素が直接持つ MultiplicityRange の原文。src/view/table.js の多重度と同じ読み方)
  const multOf = (el) => {
    for (const r of el.owned) {
      if (conf(model, r, 'ReferenceSubsetting')) continue;
      for (const m of r.related) if (conf(model, m, 'MultiplicityRange')) return text.slice(m.start, m.end).replace(/\s+/g, '');
    }
    return '';
  };
  const typesOf = (el) => {
    const out = [];
    for (const c of el.owned) {
      const conj = conf(model, c, 'ConjugatedPortTyping');
      if (!conj && !conf(model, c, 'FeatureTyping')) continue;
      const r = refOf(c, conj ? 'originalPortDefinition' : 'type');
      if (!r) continue;
      const t = r.status === 'resolved' ? r.target : null;
      const lib = !!t && (t.builtin || t.lib || t.virtual && t.of?.builtin);
      // 共役ポート定義(暗黙の要素)は、元のポート定義へ移る
      const dest = t && !lib ? (t.virtual ? t.of : t) : null;
      out.push({ text: (conj ? '~' : '') + written(r), status: r.status === 'resolved' ? (lib ? 'library' : 'resolved') : r.status, el: dest });
    }
    return out;
  };

  // ---- 木を作る(明示のスタックでたどる。入れ子の深さで呼び出しを深くしない。設計書 2.6 節)
  const roots = [];
  const errorFiles = [];
  const rootNs = [];
  if (files) {
    for (let k = 0; k < files.length; k++) { if (files[k].ok && files[k].root) rootNs.push({ ns: files[k].root, k }); else if (!files[k].ok) errorFiles.push(files[k].path); }
  } else rootNs.push({ ns: tree, k: single0 ?? -1 });
  const keyCount = new Map();
  for (const { ns, k } of rootNs) {
    const path = files ? files[k].path : folder ? folder.files[0].path : null;
    const stack = [];
    // qparts は修飾名の表示の区切り、kparts は同一性の鍵の区切り(GR26 の P6 の Q で分けた。鍵は P5 と同じく、名前のない持ち主を「(名前なし)」と書く)
    const push = (owner, pid, qparts, kparts) => {
      const kids = [];
      for (const rel of owner.owned) {
        if (!model.conforms(rel.kind, 'Membership')) continue;
        for (const c of rel.related) kids.push({ rel, el: c });
      }
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ ...kids[i], owner, pid, qparts, kparts });
    };
    push(ns, -1, [], []);
    while (stack.length) {
      const { rel, el, owner, pid, qparts, kparts } = stack.pop();
      if (!listed(model, rel, el, owner)) continue;
      const id = items.length;
      const nm = nameOf(el);
      const named = nm != null;
      const name = named ? nm : summary(el);
      // 名前のない要素の修飾名の区切りは、その要素の要約(項目の名前)をかっこで囲み、要約がないときだけ「(名前なし)」と書く(かっこを重ねない。
      // GR26 の P6 の Q。設計書 9.5 節の「項目の表示」。P5 はどれも「(名前なし)」)。参照箇所の所属・型の一覧などは、この q を使う
      const qp = [...qparts, named ? nm : name === '(名前なし)' ? name : `(${name})`];
      // 同一性の鍵(設計書 9.5 節の「開閉と選択」)は P5 と同じ: 持ち主の区切りは名前(名前のない持ち主は「(名前なし)」)、自分は名前か #種類
      const kp = [...kparts, named ? nm : `#${el.kind}`];
      const kq = `${path ?? ''}\u0000${kp.join('::')}`;
      const n = keyCount.get(kq) ?? 0;
      keyCount.set(kq, n + 1);
      const nr = nameRange(el);
      const item = { id, parent: pid, kids: [], name, named, kind: el.kind, kindJa: kindJaOf(model, el.kind), du: duOf(model, el),
        types: [], mult: multOf(el), at: at(nr.start, nr.end), q: qp.join('::'), file: path, key: `${kq}\u0000${n}`, _el: el, _types: typesOf(el) };
      items.push(item);
      idOf.set(el, id);
      if (pid < 0) roots.push(id); else items[pid].kids.push(id);
      push(el, id, qp, [...kparts, named ? nm : '(名前なし)']);
    }
  }
  // 型の移動先(型の定義の項目の名前の字句)
  for (const it of items) {
    it.types = it._types.map((t) => {
      if (t.status !== 'resolved' || !t.el) return { text: t.text, status: t.status, to: null, q: null };
      const tid = idOf.get(t.el);
      const r = tid != null ? items[tid].at : (() => { const nr = nameRange(t.el); return at(nr.start, nr.end); })();
      return { text: t.text, status: 'resolved', to: r, q: tid != null ? items[tid].q : nameOf(t.el), k: tid != null ? items[tid].key : null };
    });
  }
  // ---- 参照箇所: 項目の要素に解決している参照(逆引き。修飾名・特徴の連鎖の途中の区切りを含む)。解決済みのものだけ
  const refs = {};
  let other = 0;
  const ownerLabel = (node) => {
    // 参照を持つ関係から上へたどり、最初の項目(参照している要素)の修飾名
    for (let x = node, k = 0; x && k < 200; x = parent.get(x), k++) { const id = idOf.get(x); if (id != null) return items[id].q; }
    return '(根の名前空間)';
  };
  for (const it of items) {
    const list = [];
    for (const x of model.referencesTo(it._el)) {
      const rec = x.ref;
      if (rec.status !== 'resolved') continue;
      const role = roleOf(model, parent, rec, x.segment);
      if (role === 'other') other++;
      const a = at(x.start, x.end);
      if (!a) continue;
      list.push({ role: ROLE[role], owner: ownerLabel(rec.node), at: a, text: text.slice(x.start, x.end) });
    }
    if (list.length) refs[it.id] = list;
  }
  for (const it of items) { if (opts.elements) it.element = it._el; delete it._el; delete it._types; }
  return { items, roots, refs, errorFiles, other };
}
