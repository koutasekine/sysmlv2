// 表(GR13 指示書 6 章、設計書 3.2 節・5 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// 表は SysML 2.0 の 9.2.20.2.5 節の GridView にあたるものとして、「ビュー」の選択欄の「表」で出す。図表記の規格はないので、
// 形はこのアプリで決める(設計書 3.2 節)。4 つの表(部品の一覧、ポートと接続先、要求と満たす部品、機能の割り当て表)を、この順に縦に並べる。
// 表の手本は S Apps のプロジェクト計画(reference/plan/core.js の collect.tables・collect.anchors・pieces・tsv。同じ作者の MIT のコード)。
//
// listTableCandidates(ctx) → [{ id, kind: 'view' | 'root' | 'package', label, el }]
//   型が GridView(またはそれを特殊化した定義)の view があれば、その view を記述の順に並べる。なければ、パッケージ(根の名前空間を含む。
//   根の名前空間は、一般ビューと同じく、パッケージ以外の要素を直接持つときだけ)を記述の順に並べる(設計書 5 章)
// renderTables(prepared, candidateId?) → { candidate, svg, structure, diagnostics, tables, anchors }
//   svg は画面に出す 4 つの表(題を含む)。行は <g data-id data-start data-end>(段階 0 のクリックで、行の要素の宣言を選ぶ)。
//   機能の割り当て表のセルは <g data-start data-end>(その perform・allocate の宣言を選ぶ)
//   tables: [{ name(表の題。ファイル名に使う), header, rows(文字の表), empty, svg(保存する表 1 つ。題を入れない) }]
//   anchors: [{ kind: 'table', name, label, y, fs, bodyTop }](題の位置と表の本体の上端。行のある表だけ。画面で題の右にボタンを置くのに使う)
// tsv(table) → タブ区切りの文字。1 行目は見出し。セルの中のタブ・改行は空白 1 個。行の区切りは LF
//
// 1 つのセルに値が 2 つ以上あるときは「、」で区切る。行が 0 の表は、題と「該当なし」の 1 行だけを出す(設計書 3.2 節)。

import { escapeXml as X, joinTokens, commentLines } from './common.js';
import { FONT_FAMILY, textWidth } from './textwidth.js';
import { isPartLike, pathOf, exposeScope, standardViewOf } from './scope.js';
import { walkTree } from '../parser/tree.js';

export const TABLE_TITLES = ['部品の一覧', 'ポートと接続先', '要求と満たす部品', '機能の割り当て表'];

const INK = '#1f2328';
const PAPER = '#ffffff';
const HEAD_BG = '#f0f0ee';
const GRID = '#8c959f';
const FS = 12;          // 表の文字の大きさ
const TITLE_FS = 14;    // 画面の表の題の大きさ
const ROW_H = 22;       // 行の高さ
const BASE = 15;        // 行の上端から文字の基準線まで
const CPAD = 8;         // セルの左右の余白
const MIN_W = 36;       // 列の最小の幅
const MARGIN = 20;      // 画面の表の周りの余白
const TITLE_GAP = 8;    // 題の基準線と表の上端の間
const TABLE_GAP = 32;   // 表と次の表の題の間
const SAVE_PAD = 12;    // 保存する表の周りの余白
const n = (v) => String(Math.round(v * 2) / 2);
const cellText = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ');

// ---- 描く範囲の候補
function isMemberPackage(ctx, e) {
  const r = ctx.owningRel(e);
  return !!r && ctx.model.conforms(r.kind, 'Membership');
}
export function listTableCandidates(ctx) {
  const views = [];
  const pkgs = [];
  walkTree(ctx.tree, (e) => {
    if (ctx.is(e, 'ViewUsage')) { if (standardViewOf(ctx, e) === 'grid') views.push(e); }
    else if (ctx.is(e, 'Package') && isMemberPackage(ctx, e)) pkgs.push(e);
  }); // 明示のスタックでたどる(GR18 の B1)
  const list = [];
  if (views.length) list.push(...views.map((el) => ({ kind: 'view', el })));
  else {
    if (ctx.members(ctx.tree).some(({ rel, el }) => rel.kind !== 'Membership' && el.start !== el.end && !ctx.is(el, 'Package'))) list.push({ kind: 'root', el: ctx.tree });
    for (const el of pkgs) list.push({ kind: 'package', el });
  }
  const seen = new Map();
  return list.map((c) => {
    const p = c.kind === 'root' ? '' : pathOf(ctx, c.el);
    const base = c.kind === 'root' ? 'root' : `${c.kind}:${p}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const label = c.kind === 'root' ? '(根の名前空間)' : `${c.kind === 'view' ? 'view' : 'package'} ${p}`;
    return { id: k === 1 ? base : `${base}#${k}`, kind: c.kind, label, el: c.el };
  });
}

// ---- 範囲の要素(記述の順)。パッケージ・根の名前空間なら、中のすべての要素(入れ子のパッケージ・定義・使用の中を含む)。
// view なら、expose と filter で公開した要素(相互接続ビューなどと同じ exposeScope)
function scopeElements(ctx, candidate, scope) {
  if (candidate.kind === 'view') return [...scope.drawn].filter((e) => ctx.user(e)).sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
  const out = [];
  // 前順(要素を入れてから、その中へ)。明示のスタックでたどる(GR18 の B1)
  const stack = [ctx.members(candidate.el)[Symbol.iterator]()];
  while (stack.length) {
    const r = stack[stack.length - 1].next();
    if (r.done) { stack.pop(); continue; }
    const el = r.value.el;
    if (!ctx.user(el)) continue;
    out.push(el);
    stack.push(ctx.members(el)[Symbol.iterator]());
  }
  return out.sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
}

const written = (e) => e.start < e.end;
const src = (e) => [e.start, e.end];
const nm = (ctx, e) => ctx.nameOf(e) ?? '';

// 要素の説明(doc の本文。2 つ以上なら「、」で区切る)
function docOf(ctx, e) {
  return ctx.members(e).filter(({ el }) => ctx.is(el, 'Documentation')).map(({ el }) => commentLines(el.attrs.body).join(' ')).filter(Boolean).join('、');
}
// 多重度([2] など)。要素が直接持つ MultiplicityRange の原文
function multOf(ctx, e) {
  for (const r of e.owned) {
    if (ctx.model.conforms(r.kind, 'ReferenceSubsetting')) continue;
    for (const m of r.related) if (ctx.model.conforms(m.kind, 'MultiplicityRange')) return ctx.text.slice(m.start, m.end).replace(/\s+/g, '');
  }
  return '';
}
// 型(FeatureTyping・ConjugatedPortTyping。2 つ以上なら「、」で区切る)
function typesText(ctx, e) {
  const out = [];
  for (const c of e.owned) {
    if (ctx.model.conforms(c.kind, 'ConjugatedPortTyping')) out.push('~' + ctx.refText(ctx.ref(c, 'originalPortDefinition')));
    else if (ctx.model.conforms(c.kind, 'FeatureTyping')) out.push(ctx.refText(ctx.ref(c, 'type')));
  }
  return out.join('、');
}
const redefines = (ctx, a, b) => ctx.user(a) && a.owned.some((c) => ctx.model.conforms(c.kind, 'Redefinition') && ctx.target(c, 'redefinedFeature') === b);
const sameFeature = (ctx, a, b) => a === b || redefines(ctx, a, b) || redefines(ctx, b, a);

// 接続の端の特徴の連鎖(相互接続ビュー src/view/diagram.js の endChainOf と同じ読み方): [{ el, name }]
function endChainOf(ctx, f) {
  const rs = f.owned.find((c) => ctx.model.conforms(c.kind, 'ReferenceSubsetting'));
  if (!rs) return f.name ? [{ el: null, name: f.name }] : [];
  const chain = ctx.chainOf(rs, 'referencedFeature');
  for (const { el: x } of ctx.members(f)) {
    if (!ctx.model.conforms(x.kind, 'ReferenceUsage')) continue;
    const rd = x.owned.find((c) => ctx.model.conforms(c.kind, 'Redefinition'));
    if (rd) { const r = ctx.ref(rd, 'redefinedFeature'); chain.push({ el: r?.status === 'resolved' ? r.target : null, name: r?.segments?.at(-1)?.name ?? r?.text ?? '' }); }
  }
  return chain;
}
const endFeatures = (ctx, el) => el.owned.filter((c) => ctx.model.conforms(c.kind, 'EndFeatureMembership')).map((c) => c.related[0]).filter(Boolean);

// 接続の端を (部品, ポート) にする。連鎖の最初のポートと、その前の部品。連鎖がポートから始まるときは、接続の持ち主の部品
function endPortOf(ctx, conn, chain) {
  const i = chain.findIndex((s) => ctx.is(s.el, 'PortUsage'));
  if (i < 0) return null;
  const part = i > 0 ? chain[i - 1].el : ctx.ownerOf(conn);
  return part && ctx.is(part, 'PartUsage') ? { part, port: chain[i].el } : null;
}

// つなぎ方の語
function howOf(ctx, conn) {
  if (ctx.is(conn, 'InterfaceUsage')) { const t = typesText(ctx, conn); return t ? `interface : ${t}` : 'interface'; }
  if (ctx.is(conn, 'AllocationUsage')) return 'allocate';
  if (ctx.is(conn, 'ConnectionUsage')) return 'connect';
  if (ctx.is(conn, 'BindingConnectorAsUsage')) return 'bind';
  if (ctx.is(conn, 'SuccessionFlowUsage')) return 'succession flow';
  if (ctx.is(conn, 'FlowUsage')) return 'flow';
  return null;
}

// 要素が属する要素(要求の verify の持ち主の検証など)を、持ち主をたどって探す
function ownerWhere(ctx, e, ok) {
  for (let x = ctx.ownerOf(e); x; x = ctx.ownerOf(x)) if (ok(x)) return x;
  return null;
}

// ---- 4 つの表の中身。行: { id, cells: [文字], src, info, cellSrc?: [原文の範囲 | null] }
export function buildTables(ctx, candidate, scope) {
  const els = scopeElements(ctx, candidate, scope);
  const viewMode = candidate.kind === 'view';
  const info = (e) => ({ kind: e.kind, name: ctx.nameOf(e), qname: pathOf(ctx, e) });
  const all = [...ctx.order.keys()].filter((e) => ctx.user(e));

  // 1. 部品の一覧
  // 引数(subject・actor・stakeholder など、ParameterMembership が持つもの)は部品に数えない
  const parts = els.filter((e) => written(e) && ctx.is(e, 'PartUsage') && isPartLike(ctx, e) && !ctx.model.conforms(ctx.owningRel(e)?.kind ?? 'Element', 'ParameterMembership'));
  const t1 = parts.map((e, i) => ({ id: `t1.${i}`, cells: [nm(ctx, e), typesText(ctx, e), ctx.ownerOf(e) && ctx.ownerOf(e) !== ctx.tree ? pathOf(ctx, ctx.ownerOf(e)) : '', multOf(ctx, e), docOf(ctx, e)], src: src(e), info: info(e) }));

  // 2. ポートと接続先: 部品の使用ごとに、そのポート(所有するものと、型の定義から受け継いだもの。相互接続ビューで描くものと同じ)
  const conns = els.filter((e) => howOf(ctx, e) && !(ctx.is(e, 'FlowUsage') && !endFeatures(ctx, e).length));
  const connEnds = conns.map((c) => ({ c, how: howOf(ctx, c), ends: endFeatures(ctx, c).map((f) => { const chain = endChainOf(ctx, f); return { chain, at: endPortOf(ctx, c, chain) }; }) }));
  const endText = (x) => (x.at ? `${nm(ctx, x.at.part)}.${nm(ctx, x.at.port)}` : x.chain.map((s) => s.name).join('.'));
  const t2 = [];
  for (const p of parts) {
    const ports = [];
    for (const { el } of ctx.members(p)) if (ctx.is(el, 'PortUsage') && written(el) && (!viewMode || scope.drawn.has(el))) ports.push(el);
    for (const m of ctx.model.inheritedMembersOf(p).members) {
      const q = m.element;
      if (!ctx.is(q, 'PortUsage') || ports.includes(q)) continue;
      if (viewMode && !scope.exposedVia.get(q)?.has(p)) continue;
      ports.push(q);
    }
    for (const q of ports) {
      const to = [], how = [];
      for (const ce of connEnds) {
        ce.ends.forEach((x, k) => {
          if (!x.at || x.at.part !== p || !sameFeature(ctx, x.at.port, q)) return;
          ce.ends.forEach((y, j) => { if (j !== k) { to.push(endText(y)); how.push(ce.how); } });
        });
      }
      t2.push({ id: `t2.${t2.length}`, cells: [nm(ctx, p), nm(ctx, q), q.attrs.direction ?? '', typesText(ctx, q), to.join('、'), how.join('、')], src: src(q), info: info(q) });
    }
  }

  // 3. 要求と満たす部品: 要求の定義と使用(satisfy、verify・require・objective の中の要求は除く)
  const NOT_REQ_RELS = ['RequirementVerificationMembership', 'RequirementConstraintMembership', 'ObjectiveMembership'];
  const reqs = els.filter((e) => written(e) && (ctx.is(e, 'RequirementDefinition') || ctx.is(e, 'RequirementUsage')) && !ctx.is(e, 'SatisfyRequirementUsage')
    && !NOT_REQ_RELS.some((k) => ctx.model.conforms(ctx.owningRel(e)?.kind ?? 'Element', k)));
  const refTarget = (e) => { const rs = e.owned.find((r) => ctx.model.conforms(r.kind, 'ReferenceSubsetting')); return rs ? ctx.target(rs, 'referencedFeature') : null; };
  // satisfy の by の相手(SubjectMembership の値の特徴の参照。一般ビュー src/view/general.js の satisfier と同じ読み方)。by がなければ持ち主
  const satisfier = (s) => {
    const sm = s.owned.find((r) => ctx.model.conforms(r.kind, 'SubjectMembership') && r.start < r.end);
    if (!sm) return ctx.ownerOf(s);
    const fv = sm.related[0]?.owned.find((r) => ctx.model.conforms(r.kind, 'FeatureValue'));
    const ex = fv?.related[0];
    const m = ex && ctx.model.conforms(ex.kind, 'FeatureReferenceExpression') ? ex.owned.find((r) => r.kind === 'Membership') : null;
    return m ? ctx.target(m, 'memberElement') : null;
  };
  const satisfies = all.filter((e) => ctx.is(e, 'SatisfyRequirementUsage') && !e.attrs.isNegated);
  const verifies = all.filter((e) => ctx.model.conforms(ctx.owningRel(e)?.kind ?? 'Element', 'RequirementVerificationMembership'));
  const t3 = reqs.map((e, i) => {
    const by = satisfies.filter((s) => refTarget(s) === e).map((s) => { const t = satisfier(s); return t ? nm(ctx, t) : ''; }).filter(Boolean);
    const vs = verifies.filter((v) => refTarget(v) === e).map((v) => ownerWhere(ctx, v, (x) => ctx.is(x, 'VerificationCaseUsage') || ctx.is(x, 'VerificationCaseDefinition'))).filter(Boolean).map((x) => nm(ctx, x));
    const def = ctx.is(e, 'RequirementDefinition');
    return { id: `t3.${i}`, cells: [nm(ctx, e), def ? '定義' : '使用', def ? '' : typesText(ctx, e), docOf(ctx, e), [...new Set(by)].join('、'), [...new Set(vs)].join('、')], src: src(e), info: info(e) };
  });

  // 4. 機能の割り当て表: perform か allocate で部品に割り当てた行動(行)と、その部品(列)
  const pairs = []; // { action, part, how, decl }
  for (const e of els) {
    if (!written(e)) continue;
    if (ctx.is(e, 'PerformActionUsage') && !ctx.is(e, 'ExhibitStateUsage') && !ctx.is(e, 'IncludeUseCaseUsage')) {
      const part = ctx.ownerOf(e);
      if (!isPartLike(ctx, part)) continue;
      const t = refTarget(e);
      pairs.push({ action: t && ctx.user(t) ? t : e, part, how: 'perform', decl: e });
    } else if (ctx.is(e, 'AllocationUsage')) {
      const ends = endFeatures(ctx, e).map((f) => endChainOf(ctx, f).at(-1)?.el ?? null);
      if (ends.length !== 2) continue;
      const [a, b] = ends;
      if ((ctx.is(a, 'ActionUsage') || ctx.is(a, 'ActionDefinition')) && isPartLike(ctx, b)) pairs.push({ action: a, part: b, how: 'allocate', decl: e });
    }
  }
  const byOrder = (a, b) => ctx.order.get(a) - ctx.order.get(b);
  const actions = [...new Set(pairs.map((x) => x.action))].sort(byOrder);
  const cols = [...new Set(pairs.map((x) => x.part))].sort(byOrder);
  const t4 = actions.map((a, i) => {
    const cells = [nm(ctx, a)], cellSrc = [null];
    for (const p of cols) {
      const hit = pairs.filter((x) => x.action === a && x.part === p).sort((x, y) => byOrder(x.decl, y.decl));
      const kinds = ['perform', 'allocate'].filter((k) => hit.some((x) => x.how === k));
      cells.push(kinds.join(', '));
      cellSrc.push(hit.length ? src(hit[0].decl) : null);
    }
    return { id: `t4.${i}`, cells, cellSrc, src: src(a), info: info(a) };
  });

  return [
    { name: TABLE_TITLES[0], header: ['部品', '型', '持ち主', '多重度', '説明'], rows: t1 },
    { name: TABLE_TITLES[1], header: ['部品', 'ポート', '向き', '型', '接続先', 'つなぎ方'], rows: t2 },
    { name: TABLE_TITLES[2], header: ['要求', '種類', '型', '本文', '満たす部品', '検証'], rows: t3 },
    { name: TABLE_TITLES[3], header: ['行動', ...cols.map((p) => nm(ctx, p))], rows: t4, matrix: true },
  ];
}

// ---- 表の SVG の断片。左上が (0, 0)。interactive なら行と割り当て表のセルに data-* を付ける
function tableFrag(t, interactive) {
  const header = t.header.map(cellText), rows = t.rows.map((r) => r.cells.map(cellText));
  const cols = header.map((h, j) => Math.max(MIN_W, Math.ceil(Math.max(textWidth(h, FS, true), ...rows.map((r) => textWidth(r[j], FS))) + 2 * CPAD)));
  const xs = [0];
  for (const w of cols) xs.push(xs[xs.length - 1] + w);
  const W = xs[xs.length - 1], H = (rows.length + 1) * ROW_H;
  const center = (j) => t.matrix && j > 0;
  const tx = (j, y, s, bold = false) => `<text ${center(j) ? `x="${n(xs[j] + cols[j] / 2)}" text-anchor="middle"` : `x="${n(xs[j] + CPAD)}"`} y="${n(y)}" font-size="${FS}"${bold ? ' font-weight="bold"' : ''}>${X(s)}</text>`;
  const out = [];
  out.push(`<rect x="0" y="0" width="${n(W)}" height="${ROW_H}" fill="${HEAD_BG}"/>`);
  header.forEach((h, j) => out.push(tx(j, BASE, h, true)));
  rows.forEach((r, i) => {
    const y = (i + 1) * ROW_H;
    const row = t.rows[i];
    const cells = r.map((s, j) => {
      const txt = s ? tx(j, y + BASE, s) : '';
      const cs = interactive && row.cellSrc?.[j];
      return cs ? `<g data-start="${cs[0]}" data-end="${cs[1]}"><rect x="${n(xs[j])}" y="${n(y)}" width="${n(cols[j])}" height="${ROW_H}" fill="${PAPER}" fill-opacity="0"/>${txt}</g>` : txt;
    }).join('');
    const bg = `<rect x="0" y="${n(y)}" width="${n(W)}" height="${ROW_H}" fill="${PAPER}" fill-opacity="0"/>`;
    out.push(interactive ? `<g data-id="${X(row.id)}" data-sym="table-row" data-start="${row.src[0]}" data-end="${row.src[1]}">${bg}${cells}</g>` : cells);
  });
  // 罫線
  const lines = [];
  for (let i = 0; i <= rows.length + 1; i++) lines.push(`M0,${n(i * ROW_H)} H${n(W)}`);
  for (const x of xs) lines.push(`M${n(x)},0 V${n(H)}`);
  out.push(`<path d="${lines.join(' ')}" fill="none" stroke="${GRID}" stroke-width="1"/>`);
  return { frag: out.join(''), w: W, h: H };
}

const svgOpen = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" font-family="${X(FONT_FAMILY)}">`;

// 保存する表 1 つの SVG(題を入れない。data-* を付けない)
export function tableSvg(t) {
  const { frag, w, h } = tableFrag(t, false);
  return `${svgOpen(w + 2 * SAVE_PAD, h + 2 * SAVE_PAD)}<rect x="0" y="0" width="${n(w + 2 * SAVE_PAD)}" height="${n(h + 2 * SAVE_PAD)}" fill="${PAPER}"/><g transform="translate(${SAVE_PAD},${SAVE_PAD})">${frag}</g></svg>`;
}

// タブ区切りの文字のセル: =・+・-・@ で始まるセルは、表計算ソフトで式として評価されないよう、先頭に ' を付ける(設計書 9.3 節 v18.0。
// GR18 の S2)。" で始まるセルも、表計算ソフトが引用の始まりとして読み、後ろのセルとつなげないよう、先頭に ' を付ける(設計書 9.3 節
// v22.1。GR22 の B4)。SVG・PNG・PDF の表の文字(cellText)は変えない
const tsvCell = (s) => { const t = cellText(s); return /^[=+\-@"]/.test(t) ? `'${t}` : t; };
export function tsv(t) {
  return `${[t.header, ...t.rows].map((row) => row.map(tsvCell).join('\t')).join('\n')}\n`;
}

// 画面に出す 4 つの表(題を含む)と、保存する表・題の位置
export function layoutTables(tables) {
  const parts = [];
  const anchors = [];
  let y = MARGIN;
  let W = 0;
  const out = [];
  for (const t of tables) {
    const ty = y + TITLE_FS;
    out.push(`<text x="${MARGIN}" y="${n(ty)}" font-size="${TITLE_FS}" font-weight="bold">${X(t.name)}</text>`);
    y = ty + TITLE_GAP;
    if (!t.rows.length) {
      out.push(`<text x="${MARGIN}" y="${n(y + BASE)}" font-size="${FS}" fill="#57606a">該当なし</text>`);
      W = Math.max(W, textWidth(t.name, TITLE_FS, true), textWidth('該当なし', FS));
      y += ROW_H + TABLE_GAP;
      parts.push({ name: t.name, header: t.header, rows: [], empty: true, svg: null });
      continue;
    }
    // bodyTop は表の本体(罫線と文字)の上端。題の右のボタンを、これより上(題の行の中)に収めるのに使う(GR13 の追加の直し)
    anchors.push({ kind: 'table', name: t.name, label: t.name, y: ty, fs: TITLE_FS, bodyTop: ty + TITLE_GAP });
    const { frag, w, h } = tableFrag(t, true);
    out.push(`<g data-sym="table" transform="translate(${MARGIN},${n(y)})">${frag}</g>`);
    W = Math.max(W, w, textWidth(t.name, TITLE_FS, true));
    y += h + TABLE_GAP;
    parts.push({ name: t.name, header: t.header, rows: t.rows.map((r) => r.cells.map(cellText)), empty: false, svg: tableSvg(t) });
  }
  const width = Math.ceil(W + 2 * MARGIN), height = Math.ceil(y - TABLE_GAP + MARGIN);
  const svg = `${svgOpen(width, height)}\n<rect x="0" y="0" width="${width}" height="${height}" fill="${PAPER}"/>\n${out.join('\n')}\n</svg>`;
  return { svg, tables: parts, anchors };
}

// 表のビューの描画。ほかのビューの描く関数と同じ形の戻り値に、tables と anchors を足す
export function renderTables(prepared, candidateId = null) {
  const { ctx } = prepared;
  const candidates = prepared.tableCandidates ?? listTableCandidates(ctx);
  const candidate = (candidateId && candidates.find((c) => c.id === candidateId)) || candidates[0] || null;
  if (!candidate) {
    return { candidate: null, svg: null, structure: null, diagnostics: [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない(パッケージか、パッケージ以外の要素を直接持つテキストか、型が GridView の view を書く)', start: null, end: null }], tables: [], anchors: [] };
  }
  const scope = candidate.kind === 'view' ? exposeScope(ctx, candidate.el) : null;
  const diagnostics = [];
  for (const nr of scope?.notReflected ?? []) {
    if (nr.kind === 'expose-unresolved') diagnostics.push({ level: 'warn', code: 'expose-unresolved', message: `「${joinTokens(ctx.declTokens(nr.el))}」の対象は、このテキストの要素に解決できない(未検査・曖昧・ライブラリの要素)ので、何も公開しない`, start: nr.el.start, end: nr.el.end });
    else diagnostics.push({ level: 'warn', code: 'not-reflected', message: `${nr.kind === 'render' ? 'render' : nr.kind === 'filter' ? 'filter の条件' : 'expose の [ ] の条件'}「${joinTokens(ctx.declTokens(nr.el))}」は反映していない(反映するのは @種類名 と @利用者の注釈 の形だけ。render は反映しない)`, start: nr.el.start, end: nr.el.end });
  }
  const tables = buildTables(ctx, candidate, scope);
  const { svg, tables: parts, anchors } = layoutTables(tables);
  // 構造(選んだ要素の欄に出す要素の種類・名前・修飾名。座標を含まない)
  const nodes = [];
  tables.forEach((t, k) => {
    const id = `t${k + 1}`;
    nodes.push({ id, symbol: 'table', parent: null, label: t.name, src: null });
    for (const r of t.rows) nodes.push({ id: r.id, symbol: 'table-row', parent: id, label: r.cells.map(cellText).join(' | '), src: r.src, info: r.info });
  });
  return { candidate: { id: candidate.id, kind: candidate.kind, label: candidate.label }, svg, structure: { candidate: candidate.id, frame: null, nodes, edges: [] }, diagnostics, tables: parts, anchors };
}
