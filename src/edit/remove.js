// 図からの編集の段階 3(削除)の本体(GR16 指示書 3.2 節、設計書 8 章の「段階 3(削除)の規則」)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。Node.js の検査(tests/edit/run.mjs)からも、画面(src/app/worker.js)からも呼ぶ。
//
// isDeclared({ analysis, element, text }) → 削除の対象にできる「宣言した要素」か。declaredElements({ analysis, text }) はその一覧(記述の順)
//   利用者のモデルの要素で、所有の Membership(FeatureMembership などを含む)の要素であり、その Membership が名前空間の本体の 1 つの文
//   (原文が ; か } で終わるもの、注釈・説明なら */ で終わるもの)であるもの。式の中の要素(KerML の式の節とその中。計算・制約などの
//   使用は含める)、値(=)、if・ループの本体、接続の端などの文の一部は含めない
// deletePlan({ analysis, element, text }) → { ok: true, items, units } | { ok: false, reverted: false, code, reason, details }
//   消す前の確認の一覧。items は [{ role: 'target'|'with', kind, name, line, col, text }](消す要素と、一緒に消すもの)。
//   拒否のときの details は、残る参照・未検査などの参照の箇所(行と列)の一覧
// deleteElement({ text, analysis, element }, opts) → { ok: true, text, edits, plan, owner } | { ok: false, reverted, code, reason, details }
//   owner は消した要素の持ち主の、消した後のテキストでの原文の範囲と種類 { start, end, kind }(画面が描き直した図で選ぶのに使う)
//   code: 設計書 8 章の条件に当たるもの: syntax(構文エラーがある間)、not-user(内蔵する表の項目・暗黙の要素)、not-declared(文として
//   宣言した要素でない)、unchecked-refs(消す名前を参照しうる箇所に未検査・曖昧・D3 の印の参照)、remaining-refs(消す範囲の外に、消す
//   要素とその中のものに解決する参照が残る)。戻したもの: revert
//
// 一緒に消すもの(設計書 8 章): 端(特徴の連鎖の途中を含む)が消す要素かその中のものに解決する、接続・インターフェース・フロー・結合・
//   継承の宣言(消す要素の外にある文)。種類は Connector に適合するもの(ConnectionUsage・InterfaceUsage・FlowUsage(メッセージを含む)・
//   SuccessionFlowUsage・BindingConnectorAsUsage・SuccessionAsUsage と KerML の同じもの)で、割り当て(AllocationUsage)は含めない。
//   端は、接続の EndFeatureMembership・ParameterMembership(メッセージの from・to)の中の参照。継承の省いた端(then X の始点と、
//   then action x の終点。設計書 7.8 節。src/view/ends.js の successionEnds)も端に数える
// 拒否する条件(設計書 8 章): 消す名前(消す要素と一緒に消すものの名前・短い名前)で書かれた区切りを持つ、消す範囲の外の参照に、
//   未検査・曖昧・D3 の印のものがあるとき。消す要素・一緒に消すものとその中のものに解決する参照(区切りのどれかが解決するもの)が、
//   消す範囲の外に残るとき。参照でない暗黙の端・再定義を残る参照に数えるかは、下の X_IMPLICIT で切り替える
// 消し方(設計書 8 章): 消す文(Membership)の範囲を消す。同じ行で空白だけを挟んで並ぶ消す文は 1 つにまとめる。消す範囲の前と後ろが行の
//   中で空白だけなら、その行ごと(字下げと改行を含めて)消す(ファイルの最後の行で改行がなければ、前の行の改行を消す)。前が空白だけで
//   後ろにほかのもの(文・注・閉じ括弧)があれば、消す範囲と後ろの空白を消す。前にほかのものがあれば、前の空白と消す範囲を消す。
//   宣言の直前の行の注は消さない
// 確かめ(設計書 8 章): 消した後のテキストを解析し直し、構文エラーがない、意味エラーの件数が増えない、残った参照の状態と解決先が
//   変わらない、モデルの差分が消した要素とその中身と一緒に消したものだけ(消した文の後ろのメンバーの位置は詰めて比べる)であること。
//   満たさなければ消す前に戻す

import { EDIT18, analyze, modelDump, positionsOf, folderScope, fileOfRange } from './index.js';
import { makeContext } from '../view/common.js';
import { successionEnds, transitionEnds } from '../view/ends.js';

// 設計書 8 章(v16.1)の拒否する条件のうち、参照でない暗黙のつながりの 3 つ(GR16 P2 で作り、P2 の裁定 Q1〜Q3 で既定に入れた)。
//   T  消す要素(かその中)が、消す範囲の外の遷移の省いた始点(設計書 7.8 節。src/view/ends.js の transitionEnds)になっているとき。
//      切ると、遷移の始点は消した後のテキストで前のメンバーから求め直され、確かめでも差分に出ない(参照でないため)
//   R  消す範囲の外の特徴が、消す範囲の中の特徴を暗黙に再定義する(設計書 6.2 節の暗黙の再定義。位置による端・引数・結果の再定義)とき
//   P  消す要素が端か引数(位置で暗黙に再定義する・される特徴)で、同じ持ち主の後ろの端・引数の暗黙の再定義が、消すと位置がずれて
//      変わるとき
//   拒否の理由(reason)には、当たったつながりの種類を書き、details の各行に箇所(行と列)とつながりの種類を書く。
// opts.implicit で 1 回の削除だけ変えられる(検査と比べの道具が使う)
export const X_IMPLICIT = { T: true, R: true, P: true };
const LINK = { ref: '消す要素とその中のものを指す参照', T: '遷移の省いた始点', R: '消す要素を暗黙に再定義する特徴', P: '端・引数の位置のずれによる暗黙の再定義の変化' };
const reject = (code, reason, details = []) => ({ ok: false, reverted: false, code, reason, details });
const revert = (reason, details = []) => ({ ok: false, reverted: true, code: 'revert', reason: `消した後の確かめで戻した: ${reason}`, details });
const user = (e) => !!e && !e.builtin && !e.virtual && e.end > e.start;
const lineCol0 = (text, at) => { let line = 1, col = 1; for (let i = 0; i < at; i++) { const c = text.charCodeAt(i); if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) { line++; col = 1; } else if (c !== 13) col++; } return { line, col }; };
// 行と列。フォルダのとき(F を渡したとき)は、そのファイルの中の行と列と、相対パス(path)。GR20 の F
const lineCol = (text, at, F = null) => {
  const k = F ? fileOfRange(F, at) : -1;
  if (k < 0) return lineCol0(text, at);
  const f = F.files[k];
  return { ...lineCol0(f.text, at - f.base), path: f.path };
};
const pre = (x) => (x.path ? `${x.path} ` : '');

// 構文木の親(関係も要素も)
function parents(tree) {
  const p = new Map();
  (function walk(e, up) { p.set(e, up); e.owned.forEach(c => walk(c, e)); e.related.forEach(c => walk(c, e)); })(tree, null);
  return p;
}
const subtree = (e, into = new Set()) => { into.add(e); e.owned.forEach(c => subtree(c, into)); e.related.forEach(c => subtree(c, into)); return into; };

// 文として宣言した要素の Membership(なければ null)
function statementOf(analysis, element, parent) {
  const { model, text } = analysis;
  if (!user(element)) return null;
  const m = parent.get(element);
  if (!m || !model.conforms(m.kind, 'OwningMembership') || m.related[0] !== element) return null;
  if (model.conforms(m.kind, 'FeatureValue') || model.conforms(m.kind, 'ResultExpressionMembership')) return null;
  const owner = parent.get(m);
  if (!owner || !model.conforms(owner.kind, 'Namespace')) return null;
  // if・ループの本体(文の一部)と、式(計算・制約などの使用を除く、KerML の式の節)とその中の要素は除く
  if (model.conforms(owner.kind, 'IfActionUsage') || model.conforms(owner.kind, 'LoopActionUsage')) return null;
  const exprNode = (k) => model.conforms(k, 'Expression') && !model.conforms(k, 'Usage');
  if (exprNode(owner.kind) || exprNode(element.kind)) return null;
  const tail = text.slice(m.start, m.end);
  const isComment = model.conforms(element.kind, 'Comment');
  if (!(/[;}]$/.test(tail) || (isComment && /\*\/$/.test(tail)))) return null;
  return m;
}
export function isDeclared({ analysis, element, text }) {
  if (!analysis?.ok) return false;
  return !!statementOf({ ...analysis, text }, element, parents(analysis.tree));
}
// 宣言した要素の一覧(記述の順)
export function declaredElements({ analysis, text }) {
  if (!analysis?.ok) return [];
  const parent = parents(analysis.tree), a = { ...analysis, text }, out = [];
  (function walk(e) { if (statementOf(a, e, parent)) out.push(e); e.owned.forEach(walk); e.related.forEach(walk); })(analysis.tree);
  return out;
}

const nameOf = (model, e) => e.name ?? e.shortName ?? model.namesOf(e).name ?? null;
// 一覧の 1 行。範囲の空の要素(then action x の then の継承)は、Membership の原文で示す
const describe = (text, model, u, role, F = null) => {
  const e = u.related[0] ?? u;
  const r = e.end > e.start ? e : u;
  const lc = lineCol(text, r.start, F);
  const first = text.slice(r.start, r.end).split(/\r\n|\r|\n/)[0];
  return { role, kind: e.kind, name: nameOf(model, e), line: lc.line, col: lc.col, ...(lc.path ? { path: lc.path } : {}), text: first.length > 80 ? `${first.slice(0, 80)} …` : first };
};

export function deletePlan({ analysis, element, text }, opts = {}) {
  const imp = { ...X_IMPLICIT, ...(opts.implicit ?? {}) };
  const F = opts.folder ?? null; // フォルダのとき(GR20 の F)
  if (!analysis?.ok) return reject('syntax', 'テキストに構文エラーがある間は、消せない');
  const a = { ...analysis, text };
  if (!element || element.builtin || element.virtual || element.end <= element.start) return reject('not-user', '内蔵する表の項目や暗黙の要素は消せない');
  const { tree, model } = a;
  const parent = parents(tree);
  const mem = statementOf(a, element, parent);
  if (!mem) return reject('not-declared', 'この要素は、文として宣言した要素(部品・ポート・接続などの宣言)でないので、消せない');
  const ctx = makeContext(tree, model, a.text);
  const D0 = subtree(mem);
  // 一緒に消すもの
  const units = [mem];
  const ends = (c) => {
    const out = [];
    for (const m of c.owned) if (model.conforms(m.kind, 'EndFeatureMembership') || model.conforms(m.kind, 'ParameterMembership')) out.push(...subtree(m));
    return new Set(out);
  };
  const refsByNode = new Map();
  for (const r of model.refs) { if (!refsByNode.has(r.node)) refsByNode.set(r.node, []); refsByNode.get(r.node).push(r); }
  const hits = (r, S) => (r.target && (S.has(r.target) || (r.target.virtual && S.has(r.target.of)))) || r.segments.some(s => s.target && (S.has(s.target) || (s.target.virtual && S.has(s.target.of))));
  const all = [];
  (function walk(e) { all.push(e); e.owned.forEach(walk); e.related.forEach(walk); })(tree);
  for (const c of all) {
    if (D0.has(c) || c.builtin || c.virtual || !model.conforms(c.kind, 'Connector') || model.conforms(c.kind, 'AllocationUsage')) continue;
    const cm = statementOf(a, c, parent) ?? emptySuccessionStatement(a, c, parent);
    if (!cm) continue;
    // 消す要素の祖先(消す要素を中に持つ接続)は一緒に消さない
    if (subtree(cm).has(mem)) continue;
    let hit = false;
    for (const n of ends(c)) for (const r of refsByNode.get(n) ?? []) if (hits(r, D0)) hit = true;
    if (!hit && model.conforms(c.kind, 'Succession')) {
      const se = successionEnds(ctx, c);
      if ((se.implicit && se.source && D0.has(se.source)) || (se.targetImplicit && se.target && D0.has(se.target))) hit = true;
    }
    if (hit) units.push(cm);
  }
  const D = new Set();
  for (const u of units) subtree(u, D);
  const names = new Set();
  for (const u of units) { const e = u.related[0]; for (const n of [e?.name, e?.shortName]) if (n !== undefined && n !== null) names.add(n); }
  // 拒否する条件
  const where = (r, why) => { const lc = lineCol(a.text, r.start ?? 0, F); return `${pre(lc)}${lc.line} 行 ${lc.col} 列「${a.text.slice(r.start, r.end)}」(${why})`; };
  const bad = [];
  for (const r of model.refs) {
    if (D.has(r.node)) continue;
    if (r.status === 'resolved' && !r.shadow) continue;
    const s = r.segments.find(s => s.start != null && names.has(s.name));
    if (s) bad.push(where(r, `「${s.name}」を参照しうる参照が${r.status === 'unchecked' ? '未検査' : r.status === 'ambiguous' ? '曖昧' : 'D3 の印(ライブラリの名前に遮られているかもしれない)'}`));
  }
  if (bad.length) return reject('unchecked-refs', '消す名前を参照しうる箇所に、未検査・曖昧・D3 の印の付いた参照がある', bad);
  const left = [], linkKinds = new Set();
  const push = (kind, line) => { linkKinds.add(kind); left.push(line); };
  for (const r of model.refs) if (!D.has(r.node) && hits(r, D)) push('ref', where(r, `${refKind(model, r, parent)}が消す要素${D0.has(r.target) || r.segments.some(s => D0.has(s.target)) ? '' : '(一緒に消すもの)'}を指す`));
  if (imp.T) for (const tu of all) {
    if (D.has(tu) || !user(tu) || !model.conforms(tu.kind, 'TransitionUsage')) continue;
    const te = transitionEnds(ctx, tu);
    if (te.implicit && te.source && D.has(te.source)) { const lc = lineCol(a.text, tu.start, F); push('T', `${pre(lc)}${lc.line} 行 ${lc.col} 列「${a.text.slice(tu.start, tu.end).split(/\r\n|\r|\n/)[0]}」(遷移の省いた始点が消す要素になる)`); }
  }
  if (imp.R || imp.P) {
    // 暗黙の再定義: 再定義される特徴 → 再定義する特徴の一覧
    const by = new Map();
    for (const f of all) { if (!user(f) || !model.conforms(f.kind, 'Feature')) continue; for (const g of model.impliedRedefinitionsOf(f)) { if (!by.has(g)) by.set(g, []); by.get(g).push(f); } }
    const at = (f) => { const lc = lineCol(a.text, f.start, F); return `${pre(lc)}${lc.line} 行 ${lc.col} 列「${a.text.slice(f.start, f.end).split(/\r\n|\r|\n/)[0]}」`; };
    if (imp.R) for (const [g, fs] of by) if (D.has(g)) for (const f of fs) if (!D.has(f)) push('R', `${at(f)}(暗黙の再定義が消す要素を指す)`);
    if (imp.P) {
      // 消す要素と同じ持ち主の、後ろの端・引数(位置で数えるもの)
      const owner = parent.get(mem);
      const isEnd = (m) => model.conforms(m.kind, 'EndFeatureMembership') || m.related[0]?.attrs?.isEnd === true;
      const isPar = (m) => model.conforms(m.kind, 'ParameterMembership') && !model.conforms(m.kind, 'ReturnParameterMembership') || (m.related[0]?.attrs?.direction !== undefined && model.conforms(m.kind, 'FeatureMembership'));
      const same = isEnd(mem) ? isEnd : isPar(mem) ? isPar : null;
      if (same) {
        const later = owner.owned.slice(owner.owned.indexOf(mem) + 1).filter(m => same(m) && m.related[0]).map(m => m.related[0]);
        for (const f of later) {
          if (model.impliedRedefinitionsOf(f).length) push('P', `${at(f)}(後ろの${isEnd(mem) ? '端' : '引数'}の、位置による暗黙の再定義が変わる)`);
          for (const h of by.get(f) ?? []) if (!D.has(h)) push('P', `${at(h)}(位置による暗黙の再定義が、消すと別の${isEnd(mem) ? '端' : '引数'}に変わる)`);
        }
      }
    }
  }
  if (left.length) {
    const kinds = ['ref', 'T', 'R', 'P'].filter(k => linkKinds.has(k));
    const reason = linkKinds.has('ref') && kinds.length === 1 ? '消す要素とその中のものを指す参照が、消す範囲の外に残る'
      : `消す範囲の外に、${kinds.map(k => LINK[k]).join('・')}が残る${linkKinds.has('ref') ? '' : '(参照でない暗黙のつながり)'}`;
    return reject('remaining-refs', reason, left);
  }
  const items = units.map((u, i) => describe(a.text, model, u, i === 0 ? 'target' : 'with', F));
  // フォルダのときは、一緒に消すものがほかのファイルにあれば、消す前の確認の前に理由を返す(GR20 の F。設計書 8 章)
  if (F) { const sc = folderScope(opts, units.map(u => ({ start: u.start, end: u.end, text: '' })), element.start, true); if (sc.reject) return sc.reject; }
  return { ok: true, items, units };
}
// then action x の then(本体のない継承。範囲が空の SuccessionAsUsage を持つ Membership で、原文は then だけ)
function emptySuccessionStatement(a, c, parent) {
  const m = parent.get(c);
  if (!m || !a.model.conforms(m.kind, 'FeatureMembership') || m.related[0] !== c || c.end > c.start) return null;
  return /^then$/.test(a.text.slice(m.start, m.end)) ? m : null;
}
const refKind = (model, r, parent) => {
  const n = r.node;
  const k = n.kind;
  if (/Typing$/.test(k)) return '型付け';
  if (k === 'Subclassification' || k === 'Specialization') return '特殊化';
  if (k === 'Redefinition') return '再定義';
  if (/Subsetting$/.test(k)) return '部分集合';
  // Expose は Import の下位の種類なので、先に見る(GR18 の E7)
  if (EDIT18.E7 && model.conforms(k, 'Expose')) return 'expose';
  if (model.conforms(k, 'Import')) return 'import';
  if (model.conforms(k, 'Expose')) return 'expose';
  let up = parent.get(n);
  while (up && !model.conforms(up.kind, 'Expression') && !model.conforms(up.kind, 'Namespace')) up = parent.get(up);
  if (up && model.conforms(up.kind, 'Expression')) return '式の中の参照';
  return '参照';
};

// 消す文の範囲から、テキストの編集(行ごとに消すなど)を作る
export function deletionEdits(text, ranges) {
  const rs = ranges.map(r => ({ start: r.start, end: r.end })).sort((x, y) => x.start - y.start);
  const merged = [];
  for (const r of rs) {
    const p = merged[merged.length - 1];
    if (p && (r.start <= p.end || /^[ \t]*$/.test(text.slice(p.end, r.start)))) p.end = Math.max(p.end, r.end);
    else merged.push({ ...r });
  }
  const lineStart = (at) => { let i = at; while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--; return i; };
  const lineEnd = (at) => { let i = at; while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++; return i; };
  const nlLen = (at) => (text[at] === '\r' && text[at + 1] === '\n' ? 2 : text[at] === '\r' || text[at] === '\n' ? 1 : 0);
  const edits = [];
  for (const r of merged) {
    const ls = lineStart(r.start), le = lineEnd(r.end);
    const before = text.slice(ls, r.start), after = text.slice(r.end, le);
    const wsB = /^[ \t]*$/.test(before), wsA = /^[ \t]*$/.test(after);
    if (wsB && wsA) {
      if (nlLen(le)) edits.push({ start: ls, end: le + nlLen(le) });
      else if (ls > 0) { const pe = ls - (text[ls - 1] === '\n' && text[ls - 2] === '\r' ? 2 : 1); edits.push({ start: pe, end: le }); }
      else edits.push({ start: ls, end: le });
    } else if (wsB) edits.push({ start: r.start, end: r.end + /^[ \t]*/.exec(after)[0].length });
    else edits.push({ start: r.start - /[ \t]*$/.exec(before)[0].length, end: r.end });
  }
  return edits.map(e => ({ ...e, text: '' }));
}

// 位置の詰め直し: 消した文(所有の Membership)の位置の一覧から、消す前の位置 → 消した後の位置(消えたものは null)
function positionMapper(unitPositions) {
  const byOwner = new Map();
  for (const p of unitPositions) {
    const m = /^(.*)o(\d+)$/.exec(p);
    if (!m) continue;
    const owner = m[1] === '' ? '/' : m[1];
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(Number(m[2]));
  }
  const memo = new Map();
  return (pos) => {
    if (pos === null || pos === undefined) return pos;
    if (memo.has(pos)) return memo.get(pos);
    const steps = pos === '/' ? [] : pos.slice(1).match(/[for]\d+/g); // f<i> はフォルダのファイルの根(GR20 の F。位置はずれない)
    let cur = '/', out = '/';
    let res = null, dead = false;
    for (const s of steps) {
      const kind = s[0], i = Number(s.slice(1));
      let j = i;
      if (kind === 'o') {
        const rem = byOwner.get(cur) ?? [];
        if (rem.includes(i)) { dead = true; break; }
        j = i - rem.filter(x => x < i).length;
      }
      cur = cur === '/' ? `/${s}` : `${cur}${s}`;
      out = out === '/' ? `/${kind}${j}` : `${out}${kind}${j}`;
    }
    res = dead ? null : out;
    memo.set(pos, res);
    return res;
  };
}

export function deleteElement({ text, analysis, element }, opts = {}) {
  const plan = deletePlan({ analysis, element, text }, opts);
  if (!plan.ok) return plan;
  const { tree } = analysis;
  // フォルダのとき(GR20 の F)は、消す範囲(行ごと消す範囲の広げ方を含む)を、消す要素のファイルのテキストで求める(ファイルの末尾に
  // 改行がないとき、つないだテキストのファイルの間の改行まで消さないように)。1 つのファイルのときと同じ消し方になる
  const F = opts.folder ?? null;
  const ranges = plan.units.map(u => ({ start: u.start, end: u.end }));
  // 複数のファイルにまたがる削除(GR21 の X)も、ファイルごとに、そのファイルのテキストで求める
  const fileOf = (r) => (F ? fileOfRange(F, r.start, r.end) : -1);
  const edits = F && ranges.every(r => fileOf(r) >= 0)
    ? [...new Set(ranges.map(fileOf))].sort((a, b) => a - b).flatMap(k => {
      const hf = F.files[k];
      return deletionEdits(hf.text, ranges.filter(r => fileOf(r) === k).map(r => ({ start: r.start - hf.base, end: r.end - hf.base }))).map(e => ({ ...e, start: e.start + hf.base, end: e.end + hf.base }));
    })
    : deletionEdits(text, ranges);
  // フォルダのときは、消す箇所がすべて消す要素のファイルの中にあるときだけ行う(GR20 の F。設計書 8 章)。GR21 の X では、複数の
  // ファイルにまたがっても行い、確かめは全ファイルで行う(設計書 9.4 節の段階 B)
  const scope = folderScope(opts, edits, element.start, true);
  if (scope.reject) return scope.reject;
  let out = text;
  for (const e of edits.slice().sort((x, y) => y.start - x.start)) out = out.slice(0, e.start) + out.slice(e.end);
  const after = analyze(out, scope.opts);
  if (!after.ok) return revert('構文エラーになる', after.errors.map(e => `${e.line} 行 ${e.col} 列 ${e.message}`));
  const semantic = analysis.semantic ?? analyze(text, opts).semantic;
  if (after.semantic.length > semantic.length) return revert('意味エラーが増える', after.semantic.map(x => `${x.item} ${x.message}`));
  // モデルの差分: 消す前の書き出しから消したものを除き、位置を詰めたものが、消した後の書き出しと同じ
  const before = modelDump(analysis), now = modelDump(after);
  // 位置は modelDump と同じ求め方(src/edit/index.js の positionsOf。フォルダのときはファイルごとの位置 /f<i>…。GR20 の F)
  const positions = positionsOf(tree);
  const map = positionMapper(plan.units.map(u => positions.get(u)));
  const mapId = (t) => t === null ? null : t.startsWith('builtin:') ? t : t.startsWith('virtual:') ? (map(t.slice(8)) === null ? 'removed' : `virtual:${map(t.slice(8))}`) : (map(t) ?? 'removed');
  const bad = [];
  const ea = new Map(now.elements.map(x => [x.pos, x]));
  let kept = 0;
  for (const x of before.elements) {
    const p = map(x.pos);
    if (p === null) continue;
    kept++;
    const y = ea.get(p);
    if (!y) { bad.push(`${x.pos} がなくなる`); continue; }
    const owner = x.owner === null ? null : map(x.owner);
    if (y.kind !== x.kind || y.owner !== owner || y.name !== x.name || y.shortName !== x.shortName) bad.push(`${x.pos} → ${p}: ${x.kind} ${x.name} が ${y.kind} ${y.name} になる`);
  }
  if (kept !== now.elements.length) bad.push(`要素の数が ${kept} でなく ${now.elements.length}`);
  if (bad.length) return revert('モデルの差分が、消した要素とその中身と一緒に消したものだけでない', bad.slice(0, 5));
  const ra = new Map(now.refs.map(x => [x.key, x]));
  let keptRefs = 0;
  for (const x of before.refs) {
    const [p, prop, idx] = x.key.split('|');
    const q = map(p);
    if (q === null) continue;
    keptRefs++;
    const y = ra.get(`${q}|${prop}|${idx}`);
    if (!y || y.status !== x.status || y.target !== mapId(x.target)) bad.push(`${x.key}: ${x.status} ${x.target} → ${y?.status} ${y?.target}`);
  }
  if (keptRefs !== now.refs.length) bad.push(`参照の数が ${keptRefs} でなく ${now.refs.length}`);
  if (bad.length) return revert('残った参照の状態か解決先が変わる', bad.slice(0, 5));
  // 持ち主の、消した後の範囲。消した後の木で、持ち主の原文の範囲を消した分だけずらした範囲と種類で探す(GR18 の E2。消す前の木の
  // 位置は、前の兄弟を一緒に消すとずれるので使わない)
  const owner0 = parents(tree).get(plan.units[0]);
  let ownerA = null;
  if (EDIT18.E2) {
    const shift = (p) => { let d = 0; for (const e of edits) d += Math.max(0, Math.min(e.end, p) - e.start); return p - d; };
    const s0 = shift(owner0.start), e0 = shift(owner0.end);
    (function walk(e) { if (ownerA) return; if (e.start === s0 && e.end === e0 && e.kind === owner0.kind) { ownerA = e; return; } e.owned.forEach(walk); e.related.forEach(walk); })(after.tree);
  } else {
    const ownerPos = positions.get(owner0);
    (function walk(e, s) { if (ownerA) return; if (s === ownerPos) { ownerA = e; return; } e.owned.forEach((c, i) => walk(c, `${s}o${i}`)); e.related.forEach((c, i) => walk(c, `${s}r${i}`)); })(after.tree, '/');
  }
  return { ok: true, text: out, edits, plan: plan.items, owner: ownerA && ownerA !== after.tree ? { start: ownerA.start, end: ownerA.end, kind: ownerA.kind } : null };
}
