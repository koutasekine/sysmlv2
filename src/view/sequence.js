// シーケンスビュー(GR9 指示書 6 章、設計書 7.6 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// listSequenceCandidates(ctx) → [{ id, kind: 'view' | 'sequence', label, el }]
//   テキストに view があれば view を記述の順に並べる。なければ、メッセージか、頭を経る事象の間の継承を直接持つ、
//   部品の定義・使用(isPartLike)とオカレンスの定義・使用(種類がちょうど OccurrenceDefinition・OccurrenceUsage)を、
//   入れ子のものも含めて記述の順に並べる(GR9 P1 の裁定 Q6)
// buildSequenceDiagram(ctx, candidate, scope) → 図(src/view/index.js の他のビューと同じ形)。座標も、この中で決める
//   (layoutSequence。相互接続ビューの格子の配置 src/view/layout.js は使わない)
//
// 読み方(GR9 P1 の裁定。reports/GR9/P1_symbols_*.md の問):
//   Q1(ア) 頭(sq-part)は、描く範囲が直接持つ(view なら公開した)部品の使用。記述の順に左から並べる。
//          メッセージの端の連鎖の最初の区切りが頭なら、その頭の生存線に着ける。最初の区切りが頭でない・解決しないものは描かない
//   Q2    端が「頭.事象」か頭そのものなら点を描かず生存線に直接着ける。頭の後ろが 2 区切り以上なら sq-proxy を描き、
//          proxy-label は '.' と頭からの残りの連鎖。sq-succession の端はいつも sq-proxy。点の文字は線と反対の側に書く
//   Q3    縦の順: (a) 範囲が直接持つメッセージの間の継承、(b) 頭の中の事象の間の継承、(c) 範囲が直接持つ、頭を経る事象の間の
//          継承(sq-succession として描く)から、メッセージ(と (c) の端だけの事象)の前後を求め、トポロジカルソートで並べる。
//          入ってくる関係の残っていないもののうち記述の順で最も早いものを次の行にし、輪で進めなければ残りの最も早いものを取る。
//          1 つの行に 1 つ
//   Q4    頭の部品のポートのうち、端の連鎖が通るものだけを、部品の頭の下の辺に sq-port として付け、ポートの生存線を伸ばす。
//          範囲が直接持つポートで端の連鎖が通るものは、別の頭として並べる
//   Q5(ア) オカレンスの定義・使用は occurrence-def・occurrence(参照なら occurrence-ref)の箱の中に直接、
//          部品の定義・使用は part-def・part・part-ref の箱の sequence-compartment(見出し sequence)の中に描く
//   Q7    端: from … to … の 2 つの引数の参照の連鎖。書いていなければ、頭の中の事象で、参照の連鎖が
//          メッセージ.sourceEvent・メッセージ.source(送り手)、メッセージ.targetEvent・メッセージ.target(受け手)のもの。
//          型のメッセージを再定義して受け継ぐ端は求めない。1 区切りで範囲が直接持つ事象(ゲート)を指す端は描かない
//   Q9    生存線は線ではなく頭に付く記号(type 'lifeline')。図の質の (a) の障害物と (b) の線に入れない

import { joinTokens, compareEdgeIds } from './common.js';
import { compartmentOf, headerOf, noteContent, classify } from './diagram.js';
import { isPartLike, pathOf } from './scope.js';
import { successionEnds } from './ends.js';
import { textWidth } from './textwidth.js';
import { FS, FSS, LINE, noteSize } from './layout.js';
import { walkTree } from '../parser/tree.js';

const conf = (ctx, e, k) => !!e && ctx.model.conforms(e.kind, k);
const PAD = 10;

// メッセージ(端のない抽象の FlowUsage。src/view/diagram.js の isMessage と同じ判定)
export function isMessage(ctx, el) {
  return ctx.is(el, 'FlowUsage') && !!el.attrs.isAbstract && !el.owned.some((c) => conf(ctx, c, 'EndFeatureMembership'));
}
const isOccurrenceLike = (ctx, e) => ctx.user(e) && (e.kind === 'OccurrenceDefinition' || e.kind === 'OccurrenceUsage');
const isScopeLike = (ctx, e) => isPartLike(ctx, e) || isOccurrenceLike(ctx, e);
const isSuccession = (ctx, el) => ctx.is(el, 'Succession') && !ctx.is(el, 'TransitionUsage');

// 継承の端の参照の連鎖([{ el, name, status }])。端の特徴の ReferenceSubsetting の連鎖。始点・終点を省いたものは []
function successionChains(ctx, s) {
  const ends = s.owned.filter((c) => conf(ctx, c, 'EndFeatureMembership')).map((c) => c.related[0]);
  return [0, 1].map((k) => {
    const f = ends[k];
    const rs = f?.owned.find((c) => conf(ctx, c, 'ReferenceSubsetting'));
    return rs ? ctx.chainOf(rs, 'referencedFeature') : [];
  });
}
const redefines = (ctx, a, b) => ctx.user(a) && a.owned.some((c) => conf(ctx, c, 'Redefinition') && ctx.target(c, 'redefinedFeature') === b);

// 範囲 ns の頭になる部品(Q1)。view のときは公開したものだけ
function headParts(ctx, ns, drawn) {
  return ctx.members(ns).map((m) => m.el).filter((el) => ctx.is(el, 'PartUsage') && isPartLike(ctx, el) && el.start !== el.end && drawn(el));
}

export function listSequenceCandidates(ctx) {
  const views = [];
  const seqs = [];
  const all = () => true;
  walkTree(ctx.tree, (e) => {
    if (ctx.is(e, 'ViewUsage')) views.push(e);
    else if (isScopeLike(ctx, e)) {
      const ms = ctx.members(e).map((m) => m.el);
      const heads = headParts(ctx, e, all);
      const viaHead = (ch) => ch.length >= 2 && heads.some((h) => ch[0].el && (h === ch[0].el || redefines(ctx, h, ch[0].el)));
      if (ms.some((el) => isMessage(ctx, el)) || ms.some((el) => isSuccession(ctx, el) && successionChains(ctx, el).every(viaHead))) seqs.push(e);
    }
  }); // 明示のスタックでたどる(GR18 の B1)
  const list = views.length ? views.map((el) => ({ kind: 'view', el })) : seqs.map((el) => ({ kind: 'sequence', el }));
  const seen = new Map();
  return list.map((c) => {
    const p = pathOf(ctx, c.el);
    const base = `${c.kind}:${p}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const word = c.kind === 'view' ? 'view' : c.el.kind === 'OccurrenceDefinition' ? 'occurrence def' : c.el.kind === 'OccurrenceUsage' ? 'occurrence' : ctx.is(c.el, 'PartDefinition') ? 'part def' : 'part';
    return { id: k === 1 ? base : `${base}#${k}`, kind: c.kind, label: `${word} ${p}`, el: c.el };
  });
}

// ---- 図の組み立て
export function buildSequenceDiagram(ctx, candidate, scope, fx = {}) {
  const objects = new Map();
  const top = [];
  const edges = [];
  const diagnostics = [];
  const viewMode = candidate.kind === 'view';
  const drawn = (el) => !viewMode || scope.drawn.has(el);
  const idOf = (el) => 'e' + ctx.order.get(el);
  const srcOf = (el) => [el.start, el.end];
  const diag = (level, code, message, el) => diagnostics.push({ level, code, message, start: el?.start ?? null, end: el?.end ?? null });
  const reg = (o) => { objects.set(o.id, o); return o; };
  const aliases = new Map();
  for (const n of ctx.order.keys()) {
    if (n.kind !== 'Membership' || n.attrs.memberName == null) continue;
    const t = ctx.target(n, 'memberElement');
    if (t) { if (!aliases.has(t)) aliases.set(t, []); aliases.get(t).push(n.attrs.memberName); }
  }
  const labelOf = (el) => {
    const nm = ctx.nameOf(el);
    const ty = ctx.typeText(el);
    let s = (nm ?? '') + (ty ? ` : ${ty}` : '');
    if (ctx.isAny(el, ['FlowUsage'])) {
      const pl = el.owned.flatMap((c) => c.related).find((x) => conf(ctx, x, 'PayloadFeature'));
      if (pl) s += `${s ? ' ' : ''}of ${joinTokens(ctx.declTokens(pl))}`;
    }
    return s.trim();
  };
  const addLine = (box, rel, el, ns) => {
    const c = compartmentOf(ctx, rel, el, ns);
    if (!c || !box) return;
    let comp = box.compartments.find((x) => x.symbol === c.symbol);
    if (!comp) { comp = { symbol: c.symbol, title: c.title, lines: [] }; box.compartments.push(comp); }
    comp.lines.push({ text: joinTokens(ctx.declTokens(el)), src: srcOf(el) });
  };

  // 領域(sequence-view)の中身を組み立てる。box は持ち主の箱(最上位なら null)、ns は名前空間(view なら公開した要素の並び)
  function buildRegion(box, ns, members) {
    const R = { box, heads: [], notes: [], items: [], succs: [], deps: [], annotations: [] };
    const regionId = box?.id ?? null;
    const headParts0 = members.filter((m) => ctx.is(m.el, 'PartUsage') && isPartLike(ctx, m.el) && m.el.start !== m.el.end);
    const heads = headParts0.map((m) => m.el);
    const messages = members.filter((m) => isMessage(ctx, m.el)).map((m) => m.el);
    const headOf = (el) => (el ? R.heads.find((h) => h.el === el || redefines(ctx, h.el, el)) : null);
    // 頭(sq-part)
    for (const el of heads) {
      const h = reg({ id: idOf(el), type: 'box', symbol: 'sq-part', nameSym: 'part-name-compartment', el, src: srcOf(el), parent: regionId, region: [], ports: [], compartments: [], header: headerOf(ctx, el, 'part', aliases), ellipsis: false, sqPorts: [] });
      (box ? box.region : top).push(h.id);
      R.heads.push(h);
      h.lifeline = reg({ id: `${h.id}.life`, type: 'lifeline', symbol: 'lifeline', el, src: srcOf(el), parent: h.id, proxies: [] });
    }
    // 範囲が直接持つポート(端の連鎖が通るものだけを頭にする。Q4)
    const scopePorts = members.filter((m) => ctx.is(m.el, 'PortUsage') && m.el.start !== m.el.end).map((m) => m.el);
    const portHeads = new Map(); // ポートの要素 → sqport
    const sqPortOf = (owner, el) => {
      const key = `${owner ? owner.id : 'top'}|${ctx.order.get(el)}`;
      if (portHeads.has(key)) return portHeads.get(key);
      const ty = ctx.typeText(el);
      const p = reg({ id: owner ? `${owner.id}.${idOf(el)}` : idOf(el), type: 'sqport', symbol: 'sq-port', el, src: srcOf(el), parent: owner ? owner.id : regionId, owner: owner?.id ?? null, label: (ctx.nameOf(el) ?? '') + (ty ? ` : ${ty}` : ''), order: ctx.order.get(el) });
      p.lifeline = reg({ id: `${p.id}.life`, type: 'lifeline', symbol: 'lifeline', el, src: srcOf(el), parent: p.id, proxies: [] });
      portHeads.set(key, p);
      if (owner) owner.sqPorts.push(p);
      else R.heads.push(p);
      return p;
    };
    // 端の連鎖 → { life, rest: [名前], event: 要素 | null }。頭が見つからなければ { fail }
    const endOf = (chain) => {
      if (!chain.length) return { fail: '端がない' };
      const first = chain[0];
      if (!first.el) return { fail: `「${first.name}」は${first.status === 'ambiguous' ? '曖昧' : '未検査'}` };
      const h = headOf(first.el);
      if (h) {
        const second = chain[1];
        if (second?.el && ctx.is(second.el, 'PortUsage') && (ctx.ownerOf(second.el) === h.el || ctx.members(h.el).some((m) => redefines(ctx, m.el, second.el)))) {
          const p = sqPortOf(h, second.el);
          return { life: p.lifeline, rest: chain.slice(2).map((s) => s.name), event: chain.length > 2 ? chain[chain.length - 1].el : null };
        }
        return { life: h.lifeline, rest: chain.slice(1).map((s) => s.name), event: chain.length > 1 ? chain[chain.length - 1].el : null };
      }
      if (scopePorts.includes(first.el)) {
        const p = sqPortOf(null, first.el);
        return { life: p.lifeline, rest: chain.slice(1).map((s) => s.name), event: chain.length > 1 ? chain[chain.length - 1].el : null };
      }
      if (ctx.is(first.el, 'EventOccurrenceUsage') && chain.length === 1 && members.some((m) => m.el === first.el)) return { fail: `「${first.name}」は範囲が直接持つ事象(生存線の上にない)` };
      return { fail: `「${first.name}」は頭(部品)でない` };
    };
    // 頭の中(入れ子の部品・ポート・事象)の要素を集める
    const inside = [];
    // then の継承(SourceSuccession)は原文の範囲が空のことがあるので、範囲の空のものも含める
    const walkIn = (e, path) => { for (const { el } of ctx.members(e)) { if (el.start === el.end && !isSuccession(ctx, el)) continue; inside.push({ el, path: [...path, el] }); if (ctx.isAny(el, ['PartUsage', 'PortUsage', 'OccurrenceUsage'])) walkIn(el, [...path, el]); } };
    for (const el of heads) walkIn(el, [el]);
    // 17b の短い書き方(event m.sourceEvent;)の事象。メッセージ → { src: [path], tgt: [path] }
    const shorthand = new Map();
    for (const { el, path } of inside) {
      if (!ctx.is(el, 'EventOccurrenceUsage')) continue;
      const rs = el.owned.find((c) => conf(ctx, c, 'ReferenceSubsetting'));
      const ch = rs ? ctx.chainOf(rs, 'referencedFeature') : [];
      if (ch.length < 2 || !messages.includes(ch[0].el)) continue;
      const last = ch[ch.length - 1].name;
      const k = /^source(Event)?$/.test(last) ? 'src' : /^target(Event)?$/.test(last) ? 'tgt' : null;
      if (!k) continue;
      if (!shorthand.has(ch[0].el)) shorthand.set(ch[0].el, {});
      const rec = shorthand.get(ch[0].el);
      if (!rec[k]) rec[k] = path;
    }
    const pathChain = (path) => path.map((el) => ({ el, name: ctx.nameOf(el) ?? joinTokens(ctx.declTokens(el)).replace(/^(ref\s+)?event\s+(occurrence\s+)?/, ''), status: 'resolved' }));
    // メッセージ
    for (const m of messages) {
      if (!drawn(m)) continue;
      const params = m.owned.filter((c) => conf(ctx, c, 'ParameterMembership') && ctx.is(c.related[0], 'EventOccurrenceUsage')).map((c) => c.related[0]);
      let chains = null;
      if (params.length >= 2) chains = params.slice(0, 2).map((f) => { const rs = f.owned.find((c) => conf(ctx, c, 'ReferenceSubsetting')); return rs ? ctx.chainOf(rs, 'referencedFeature') : []; });
      else if (shorthand.get(m)?.src && shorthand.get(m)?.tgt) chains = [pathChain(shorthand.get(m).src), pathChain(shorthand.get(m).tgt)];
      if (!chains) { addLine(box, ctx.owningRel(m), m, ns); diag('info', 'edge-not-drawn', `${labelOf(m) || 'message'} を描いていない: 端がない(from … to … も、頭の中の事象からの参照もない)`, m); continue; }
      const ends = chains.map(endOf);
      const bad = ends.find((x) => x.fail);
      if (bad) { addLine(box, ctx.owningRel(m), m, ns); diag('info', 'edge-not-drawn', `${labelOf(m) || 'message'} を描いていない: ${bad.fail}`, m); continue; }
      // 17b の短い書き方の事象は、事象の要素そのもの
      const events = params.length >= 2 ? ends.map((x) => x.event) : [shorthand.get(m).src.at(-1), shorthand.get(m).tgt.at(-1)];
      R.items.push({ kind: 'message', el: m, ends, events, order: ctx.order.get(m), label: labelOf(m) });
    }
    // 継承: (a) メッセージの間、(c) 頭を経る事象の間(sq-succession)。それ以外は文字の区画
    const scopeSuccs = [];
    for (const { rel, el } of members) {
      if (!isSuccession(ctx, el)) continue;
      const { source, target } = successionEnds(ctx, el);
      const chains = successionChains(ctx, el);
      const viaHead = chains.every((ch) => ch.length >= 2 && ch[0].el && (headOf(ch[0].el) || scopePorts.includes(ch[0].el)));
      if (viaHead && drawn(el)) {
        const ends = chains.map(endOf);
        if (!ends.some((x) => x.fail)) { scopeSuccs.push({ el, ends, source, target }); continue; }
      }
      scopeSuccs.push({ el, source, target, orderOnly: true });
      // then の継承(原文の範囲が空のもの)は文字にしない
      if (el.start !== el.end && joinTokens(ctx.declTokens(el)).trim()) addLine(box, rel, el, ns);
    }
    // (b) 頭の中の事象の間の継承
    const innerSuccs = inside.filter((x) => isSuccession(ctx, x.el)).map((x) => successionEnds(ctx, x.el));
    // 順の関係のグラフ(節: メッセージ・事象の要素)
    const next = new Map();
    const link = (a, b) => { if (!a || !b || a === b) return; if (!next.has(a)) next.set(a, new Set()); next.get(a).add(b); };
    for (const s of innerSuccs) link(s.source, s.target);
    for (const s of scopeSuccs) link(s.source, s.target);
    // (c) の端の事象のうち、どのメッセージの端でもないものは、それだけで 1 つの行(Q3)
    const msgEvents = new Set(R.items.flatMap((it) => it.events.filter(Boolean)));
    for (const s of scopeSuccs) {
      if (s.orderOnly) continue;
      R.succs.push({ kind: 'succession', el: s.el, ends: s.ends, source: s.source, target: s.target, order: ctx.order.get(s.el), label: ctx.nameOf(s.el) ?? '' });
      [s.source, s.target].forEach((ev, k) => {
        if (!ev || msgEvents.has(ev)) return;
        if (!R.items.some((it) => it.kind === 'event' && it.el === ev)) { R.items.push({ kind: 'event', el: ev, life: s.ends[k].life, order: ctx.order.get(ev), events: [ev] }); msgEvents.add(ev); }
      });
    }
    // 行の順(Q3: トポロジカルソート。決まらない組は記述の順)
    const nodesOf = (it) => (it.kind === 'message' ? [it.el, ...it.events.filter(Boolean)] : [it.el]);
    const reach = (it) => {
      const seen = new Set(), stack = [...nodesOf(it)];
      while (stack.length) { const x = stack.pop(); for (const y of next.get(x) ?? []) if (!seen.has(y)) { seen.add(y); stack.push(y); } }
      return seen;
    };
    const items = [...R.items].sort((a, b) => a.order - b.order);
    const before = items.map((it) => { const r = reach(it); return items.map((jt) => jt !== it && nodesOf(jt).some((x) => r.has(x))); });
    const indeg = items.map((_, j) => items.reduce((s, _2, i) => s + (before[i][j] ? 1 : 0), 0));
    const done = new Array(items.length).fill(false);
    const rows = [];
    for (let n = 0; n < items.length; n++) {
      let k = items.findIndex((_, j) => !done[j] && indeg[j] === 0);
      if (k < 0) k = done.findIndex((x) => !x);
      done[k] = true;
      rows.push(items[k]);
      items.forEach((_, j) => { if (before[k][j]) indeg[j]--; });
    }
    R.rows = rows;
    // 範囲が直接持つポートの頭も、記述の順に並べる
    R.heads.sort((a, b) => ctx.order.get(a.el) - ctx.order.get(b.el));
    // 注釈・依存・そのほかのメンバー
    for (const { rel, el } of members) {
      if (heads.includes(el) || messages.includes(el) || isSuccession(ctx, el)) continue;
      if (el.start === el.end) continue;
      if (ctx.is(el, 'PortUsage') && [...portHeads.values()].some((p) => p.el === el && !p.owner)) continue;
      const cls = classify(ctx, el);
      if (cls === 'note') {
        if (ctx.is(el, 'MetadataUsage') && ctx.text[el.start - 1] === '#') continue;
        const { symbol, heading, lines } = noteContent(ctx, el);
        const o = reg({ id: idOf(el), type: 'note', symbol, el, src: srcOf(el), parent: regionId, heading: heading.filter((x) => x !== ''), lines });
        (box ? box.region : top).push(o.id);
        R.notes.push(o);
        const abouts = el.owned.filter((c) => conf(ctx, c, 'Annotation'));
        const targets = abouts.length ? abouts.map((a) => ({ el: ctx.target(a, 'annotatedElement'), name: ctx.refText(ctx.ref(a, 'annotatedElement')) })) : (box ? [{ el: box.el, name: ctx.nameOf(box.el) }] : []);
        R.annotations.push({ note: o, targets });
        continue;
      }
      if (cls === 'dependency') { R.deps.push(el); continue; }
      if (box) addLine(box, rel, el, ns);
      else diag('info', 'not-drawn', `${pathOf(ctx, el)}(${el.kind})は、シーケンスビューの記号を持たないので描かない`, el);
    }
    return R;
  }

  // ---- 範囲の外側
  let frame = null;
  const regions = [];
  const scopeBox = (el) => {
    const sym = el.kind === 'OccurrenceDefinition' ? 'occurrence-def' : el.kind === 'OccurrenceUsage' ? (el.attrs.isReference ? 'occurrence-ref' : 'occurrence')
      : ctx.is(el, 'PartDefinition') ? 'part-def' : el.attrs.isReference ? 'part-ref' : 'part';
    const box = reg({ id: idOf(el), type: 'box', symbol: sym, el, src: srcOf(el), parent: null, region: [], ports: [], compartments: [], header: headerOf(ctx, el, sym, aliases), ellipsis: false });
    // Q5(ア): 部品の箱は sequence-compartment(見出し sequence)の中に sequence-view を描く
    if (sym.startsWith('part')) box.preCompartments = [{ symbol: 'sequence-compartment', title: 'sequence', lines: [] }];
    top.push(box.id);
    const members = ctx.members(el).filter(({ rel, el: x }) => !(rel.kind === 'Membership'));
    const shown = members.filter((m) => { if (drawn(m.el)) return true; box.ellipsis = true; return false; });
    regions.push(buildRegion(box, el, shown));
    return box;
  };
  if (candidate.kind !== 'view') scopeBox(candidate.el);
  else {
    const v = candidate.el;
    const vt = ctx.typeText(v);
    frame = { el: v, src: srcOf(v), title: `«view» ${pathOf(ctx, v).replace(/^.*::/, '')}${vt ? ` : ${vt}` : ''}`, exposes: [], filters: [], notes: [] };
    for (const c of v.owned) {
      if (conf(ctx, c, 'Expose')) frame.exposes.push(joinTokens(ctx.declTokens(c)));
      else if (conf(ctx, c, 'ElementFilterMembership')) frame.filters.push(joinTokens(ctx.declTokens(c)));
    }
    for (const { el: c } of ctx.members(v)) if (ctx.is(c, 'Comment')) frame.notes.push(...noteContent(ctx, c).lines);
    const hasDrawnAncestor = (el) => { for (let x = ctx.ownerOf(el); x; x = ctx.ownerOf(x)) if (scope.drawn.has(x)) return true; return false; };
    // 受け継いだメンバー(expose X::** で、型から受け継いだもの)は、受け継いだ先の要素の中のものとして扱い、最上位に置かない(ほかのビューと同じ)
    const placedInherited = (el) => [...(scope.exposedVia.get(el) ?? [])].some((via) => via && scope.drawn.has(via) && ctx.ownerOf(el) !== via);
    const tops = [...scope.drawn].filter((el) => !hasDrawnAncestor(el) && !placedInherited(el)).sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
    const loose = [];
    for (const el of tops) {
      if (isScopeLike(ctx, el) && (ctx.members(el).some((m) => isMessage(ctx, m.el)) || !ctx.is(el, 'PartUsage'))) scopeBox(el);
      else loose.push({ rel: ctx.owningRel(el), el });
    }
    // 範囲の箱に入らない公開した要素(部品・メッセージなど)は、図の最上位の 1 つの sequence-view に描く
    if (loose.length) regions.push(buildRegion(null, null, loose));
    for (const el of scope.memberOnly) {
      if (!scope.drawn.has(el) || !conf(ctx, el, 'Namespace')) continue;
      if (ctx.members(el).length && !ctx.members(el).some((m) => scope.drawn.has(m.el))) diag('info', 'expose-member-only', `${pathOf(ctx, el)} は expose で要素 1 つだけを公開しているので、中を描いていない。中を描くには expose ${pathOf(ctx, el)}::**; と書く`, el);
    }
    for (const nr of scope.notReflected) {
      if (nr.kind === 'expose-unresolved') { diag('warn', 'expose-unresolved', `「${joinTokens(ctx.declTokens(nr.el))}」の対象は、このテキストの要素に解決できない(未検査・曖昧・ライブラリの要素)ので、何も公開しない`, nr.el); continue; }
      const what = nr.kind === 'render' ? 'render' : nr.kind === 'filter' ? 'filter の条件' : 'expose の [ ] の条件';
      diag('warn', 'not-reflected', `${what}「${joinTokens(ctx.declTokens(nr.el))}」は反映していない(反映するのは @種類名 と @利用者の注釈 の形だけ。render は反映しない)`, nr.el);
    }
  }
  const d = { objects, top, edges, diagnostics, frame, viewMode, regions, sequenceView: true, fig14: fx };
  layoutSequence(d, ctx, idOf, srcOf, diag);
  for (const x of [...objects.values(), ...edges]) {
    if (!x.el || x.info) continue;
    x.info = { kind: x.el.kind, name: ctx.nameOf(x.el) ?? null, qname: pathOf(ctx, x.el) };
  }
  if (frame) frame.info = { kind: frame.el.kind, name: ctx.nameOf(frame.el) ?? null, qname: pathOf(ctx, frame.el) };
  delete d.regions;
  return d;
}

// ---- 配置(設計書 7.6 節。決めた値は GR9 P3 の報告に書く)
const HEAD_TOP = 24;      // 領域の上の縁から頭の上までの余白(注釈の線の通り道)
const BAND = 8;           // 注釈・依存の線の通り道の間隔
const BAND_DROP = 34;     // いちばん下の通り道から頭の上の辺まで(コの字の短い区間 30 px より長くする)
const NOTE_DROP = 34;     // 頭の上に置いた注(GR14 の N)の下の辺から頭の上の辺まで
const HEAD_GAP = 30;      // 隣り合う頭の箱の間の最小の間隔
const MIN_GAP = 60;       // 隣り合う生存線の最小の間隔
const LABEL_MARGIN = 18;  // メッセージのラベルと生存線の間の余白(矢じりの長さ 11 と、文字の周りの 2 px を含む)
const PORT_STEP = 30;     // 部品の生存線とポート、ポートどうしの最小の間隔
const ROW = 40;           // 行の間隔
const LOOP_W = 40, LOOP_H = 24; // 同じ生存線に戻る線の横と縦の長さ(コの字 (d) にならないよう 30 px より長くする)
const FIRST_ROW = 44;     // 頭の下の辺から最初の行まで
const TAIL = 30;          // 最後の行から生存線の下の端まで
const SIDE_PAD = 24;      // 領域の左右の余白

function layoutSequence(d, ctx, idOf, srcOf, diag) {
  const O = d.objects;
  const get = (id) => O.get(id);
  let ox = 20, oy = 20;
  const f = d.frame;
  let bottomH = 0;
  if (f) {
    f.headW = Math.max(textWidth(f.title, FS) + 2 * PAD, 80);
    f.headH = LINE + 10;
    const info = [...f.exposes, ...f.filters, ...f.notes];
    f.infoW = info.length ? Math.ceil(Math.max(...info.map((t) => textWidth(t, FSS))) + 2 * PAD) : 0;
    const trH = f.exposes.length ? f.exposes.length * LINE + 8 : 0;
    bottomH = Math.max(f.filters.length, f.notes.length) ? Math.max(f.filters.length, f.notes.length) * LINE + 8 : 0;
    ox = 30; oy = 10 + Math.max(f.headH, trH) + 24;
  }
  let x = ox, maxW = 0, maxH = 0;
  for (const R of d.regions) {
    const s = layoutRegion(d, R, x, oy, ctx, idOf, srcOf, diag);
    x += s.w + 40;
    maxW = x - 40 - ox;
    maxH = Math.max(maxH, s.h);
  }
  if (f) {
    f.x = 10; f.y = 10;
    const both = f.filters.length && f.notes.length;
    f.w = Math.ceil(Math.max(maxW + ox + 10, f.headW + (f.exposes.length ? f.infoW + 20 : 0), both ? 2 * f.infoW + 20 : f.infoW, 200));
    f.h = Math.ceil(oy - 10 + maxH + 20 + bottomH);
    d.width = f.w + 20; d.height = f.h + 20;
  } else {
    d.width = Math.ceil(Math.max(maxW + ox + 20, 200));
    d.height = Math.ceil(maxH + oy + 20);
  }
  // 線は記述の順(線の id の数の順。設計書 7.3 節)
  d.edges.sort((a, b) => compareEdgeIds(a.id, b.id));
}

// 1 つの領域を (x0, y0) に置く。持ち主の箱があれば、箱ごと置く。戻り値 { w, h }(箱か領域の大きさ)
function layoutRegion(d, R, x0, y0, ctx, idOf, srcOf, diag) {
  const O = d.objects;
  const box = R.box;
  // 箱の名前の区画と、部品の箱の sequence-compartment の見出し
  let headH = 0, preH = 0, headW = 0;
  if (box) {
    headW = Math.max(textWidth(box.header.keyword, FSS), textWidth(box.header.name, FS, true)) + 2 * PAD;
    headH = 2 * LINE + 8;
    box.headInset = 0;
    for (const c of box.preCompartments ?? []) preH += (c.lines.length + 1) * LINE + 8;
  }
  const rx = x0, ry = y0 + headH + preH;
  // 生存線の並び(頭ごとに、部品の生存線と、下の辺のポートの生存線)
  const lifes = [];
  const headGeom = new Map();
  for (const h of R.heads) {
    if (h.type === 'sqport') { lifes.push({ head: h, life: h.lifeline, port: h }); continue; }
    h.sqPorts.sort((a, b) => a.order - b.order);
    lifes.push({ head: h, life: h.lifeline });
    for (const p of h.sqPorts) lifes.push({ head: h, life: p.lifeline, port: p });
  }
  const li = new Map(lifes.map((l, i) => [l.life.id, i]));
  // 線ごとの向きと、ラベルを置く間(送り手の隣の間)
  const msgs = R.rows.filter((it) => it.kind === 'message');
  const need = new Array(Math.max(0, lifes.length - 1)).fill(MIN_GAP);
  let leftNeed = 0, rightNeed = 0;
  const proxyNeed = (life, side, label) => {
    const w = textWidth(label, FSS) + 20;
    const i = li.get(life.id);
    if (side === 'l') { if (i === 0) leftNeed = Math.max(leftNeed, w); else need[i - 1] = Math.max(need[i - 1], w); }
    else if (i === lifes.length - 1) rightNeed = Math.max(rightNeed, w); else need[i] = Math.max(need[i], w);
  };
  for (const it of R.rows) {
    if (it.kind === 'message') {
      const a = li.get(it.ends[0].life.id), b = li.get(it.ends[1].life.id);
      const lw = it.label ? textWidth(it.label, FSS) : 0;
      if (a === b) {
        const w = LOOP_W + (lw ? lw + 20 : 0);
        if (a === lifes.length - 1) rightNeed = Math.max(rightNeed, w + 10); else need[a] = Math.max(need[a], w + 20);
        it.dir = 1;
      } else {
        it.dir = b > a ? 1 : -1;
        const g = it.dir > 0 ? a : a - 1;
        it.gap = g;
        if (lw) need[g] = Math.max(need[g], lw + 2 * LABEL_MARGIN);
      }
      it.ends.forEach((e, k) => {
        if (e.rest.length < 2) return;
        const out = k === 0 ? it.dir : (a === b ? 1 : -it.dir); // 線が出ていく向き。文字はその反対の側
        proxyNeed(e.life, out > 0 ? 'l' : 'r', '.' + e.rest.join('.'));
      });
    }
  }
  for (const s of R.succs) {
    const a = li.get(s.ends[0].life.id), b = li.get(s.ends[1].life.id);
    s.dir = b > a ? 1 : b < a ? -1 : 0;
    s.ends.forEach((e, k) => {
      const out = s.dir === 0 ? 1 : k === 0 ? s.dir : -s.dir;
      if (e.rest.length) proxyNeed(e.life, out > 0 ? 'l' : 'r', '.' + e.rest.join('.'));
    });
    if (s.dir === 0) { const i = a; if (i === lifes.length - 1) rightNeed = Math.max(rightNeed, LOOP_W + 10); else need[i] = Math.max(need[i], LOOP_W + 20); }
  }
  // 頭の大きさと、頭の中の生存線の位置(箱の左の辺からの距離)
  for (const h of R.heads) {
    if (h.type === 'sqport') { const lw = textWidth(h.label, FSS); headGeom.set(h.id, { w: Math.max(14, 14 / 2 + 11 + lw), h: 24, offs: [7] }); continue; }
    const nameW = Math.max(textWidth(h.header.keyword, FSS), textWidth(h.header.name, FS, true)) + 2 * PAD;
    const hh = 2 * LINE + 16;
    if (!h.sqPorts.length) { const w = Math.max(80, nameW); headGeom.set(h.id, { w, h: hh, offs: [w / 2] }); continue; }
    const offs = [30];
    const i0 = li.get(h.lifeline.id);
    h.sqPorts.forEach((p, k) => {
      const prevLabel = k === 0 ? 0 : textWidth(h.sqPorts[k - 1].label, FSS) + 11 + 10;
      offs.push(offs[k] + Math.max(PORT_STEP, prevLabel, need[i0 + k]));
    });
    const last = h.sqPorts[h.sqPorts.length - 1];
    const w = Math.max(80, nameW, offs[offs.length - 1] + 11 + textWidth(last.label, FSS) + 10);
    headGeom.set(h.id, { w, h: hh, offs });
  }
  // 頭を左から並べる。隣の頭の最後の生存線との間を need に合わせて広げる
  const leftPad = Math.max(SIDE_PAD, leftNeed);
  let prevLife = null, prevRight = null;
  // GR14 の N(src/view/index.js の FIG14.N。指示書 3.1 節): 注釈先が頭 1 つの注は、その頭の上に置き、注の下の辺から頭の上の辺へ
  // 短く縦に結ぶ。頭の上の通り道を通る線(ほかの注釈の線・依存の線)が残る領域では、注を横切らないよう、今の置き方のままにする
  const isHead = (el) => R.heads.some((h) => h.el === el);
  const nearNotes = new Set();
  if (d.fig14?.N && !R.deps.length) {
    const movable = R.annotations.filter((a) => a.targets.length === 1 && a.targets[0].el && !(box && a.targets[0].el === box.el) && isHead(a.targets[0].el));
    if (movable.length && movable.length === R.annotations.filter((a) => a.targets.length).length) for (const a of movable) nearNotes.add(a.note);
  }
  if (nearNotes.size) d.notesMoved = true;
  const nearH = nearNotes.size ? Math.max(...[...nearNotes].map((n) => noteSize(n).h)) + NOTE_DROP : 0;
  // 注釈・依存の線は頭の上の通り道を通る。通り道から頭の上までの縦の区間を BAND_DROP にして、コの字 (d) にしない
  const nBands = nearNotes.size ? 0 : R.annotations.reduce((s, a) => s + a.targets.length, 0) + R.deps.length;
  const headY = ry + HEAD_TOP + nearH + (nBands ? nBands * BAND + BAND_DROP : 0);
  let headsBottom = headY;
  const lifeX = new Map();
  for (const h of R.heads) {
    const g = headGeom.get(h.id);
    // 最初の頭は、箱の縁から SIDE_PAD 以上、最初の生存線が左の点の文字の幅(leftPad)以上離れる位置
    let left = prevRight === null ? Math.max(rx + SIDE_PAD, rx + leftPad - g.offs[0]) : prevRight + HEAD_GAP;
    const i0 = li.get(h.lifeline.id);
    if (prevLife !== null) left = Math.max(left, prevLife + need[i0 - 1] - g.offs[0]);
    if (h.type === 'sqport') {
      h.cx = left + 7; h.cy = headY + 16; h.pw = 14; h.ph = 14;
      lifeX.set(h.lifeline.id, h.cx);
      headsBottom = Math.max(headsBottom, h.cy + 16);
      prevLife = h.cx; prevRight = left + g.w;
      continue;
    }
    Object.assign(h, { x: left, y: headY, w: g.w, h: g.h });
    lifeX.set(h.lifeline.id, left + g.offs[0]);
    h.sqPorts.forEach((p, k) => { p.cx = left + g.offs[k + 1]; p.cy = headY + g.h; p.pw = 14; p.ph = 14; lifeX.set(p.lifeline.id, p.cx); });
    headsBottom = Math.max(headsBottom, headY + g.h + (h.sqPorts.length ? 16 : 0));
    prevLife = left + g.offs[g.offs.length - 1];
    prevRight = left + g.w;
  }
  // 行の高さ
  let y = headsBottom + FIRST_ROW;
  for (const it of R.rows) {
    it.y = y;
    const loop = it.kind === 'message' && it.ends[0].life === it.ends[1].life;
    y += ROW + (loop ? LOOP_H : 0);
  }
  for (const s of R.succs) if (s.dir === 0) y += LOOP_H;
  const lifeBottom = (R.rows.length ? y - ROW : headsBottom + 20) + TAIL;
  // 生存線
  for (const l of lifes) {
    const lx = lifeX.get(l.life.id);
    l.life.x = lx;
    l.life.y1 = l.port ? l.port.cy + 7 : l.head.y + l.head.h;
    l.life.y2 = lifeBottom;
  }
  // 点(sq-proxy)
  const proxyAt = (e, yy, side) => {
    const life = e.life;
    const id = `${life.id}>${yy}`;
    const p = { id, type: 'proxy', symbol: 'sq-proxy', el: null, src: life.src, owner: life.id, side, cx: life.x, cy: yy, label: e.rest.length ? '.' + e.rest.join('.') : '' };
    O.set(id, p);
    life.proxies.push(id);
    return p;
  };
  // メッセージの線
  for (const it of R.rows) {
    if (it.kind !== 'message') continue;
    const [a, b] = it.ends;
    const xa = a.life.x, xb = b.life.x, yy = it.y;
    const loop = a.life === b.life;
    let from = a.life.id, to = b.life.id, pts;
    if (loop) {
      const y2 = yy + LOOP_H;
      const pa = a.rest.length >= 2 ? proxyAt(a, yy, 'l') : null;
      const pb = b.rest.length >= 2 ? proxyAt(b, y2, 'l') : null;
      if (pa) from = pa.id; if (pb) to = pb.id;
      pts = [{ x: xa + (pa ? 5 : 0), y: yy }, { x: xa + LOOP_W, y: yy }, { x: xa + LOOP_W, y: y2 }, { x: xa + (pb ? 5 : 0), y: y2 }];
      it.labelCands = [{ x: xa + LOOP_W + 7, y: yy + LOOP_H / 2 + 4, anchor: 'start' }, { x: xa + LOOP_W / 2, y: yy - 6, anchor: 'middle' }, { x: xa + LOOP_W / 2, y: y2 + 15, anchor: 'middle', below: true }];
    } else {
      const dir = it.dir;
      const pa = a.rest.length >= 2 ? proxyAt(a, yy, dir > 0 ? 'l' : 'r') : null;
      const pb = b.rest.length >= 2 ? proxyAt(b, yy, dir > 0 ? 'r' : 'l') : null;
      if (pa) from = pa.id; if (pb) to = pb.id;
      pts = [{ x: xa + (pa ? 5 * dir : 0), y: yy }, { x: xb - (pb ? 5 * dir : 0), y: yy }];
      // ラベルは送り手の隣の間の中ほどの上(置けなければ、ほかの間、線の下)
      const gaps = [];
      for (let g = it.gap; g >= 0 && g < lifes.length - 1 && (dir > 0 ? g < li.get(b.life.id) : g >= li.get(b.life.id)); g += dir) gaps.push(g);
      const mid = (g) => (lifes[g].life.x + lifes[g + 1].life.x) / 2;
      it.labelCands = [...gaps.map((g) => ({ x: mid(g), y: yy - 6, anchor: 'middle' })), ...gaps.map((g) => ({ x: mid(g), y: yy + 15, anchor: 'middle', below: true }))];
    }
    d.edges.push({ id: idOf(it.el), symbol: 'message', el: it.el, src: srcOf(it.el), from, to, label: it.label, markers: [], points: pts, labelCands: it.labelCands, box: box?.id ?? null });
  }
  // 事象だけの行の点と、sq-succession の線
  const eventRow = new Map(R.rows.filter((it) => it.kind === 'event').map((it) => [it.el, it.y]));
  const msgRow = new Map();
  for (const it of R.rows) if (it.kind === 'message') it.events.forEach((ev, k) => { if (ev) msgRow.set(ev, { y: k === 1 && it.ends[0].life === it.ends[1].life ? it.y + LOOP_H : it.y }); });
  for (const s of R.succs) {
    const [ea, eb] = s.ends;
    const ya = eventRow.get(s.source) ?? msgRow.get(s.source)?.y, yb = eventRow.get(s.target) ?? msgRow.get(s.target)?.y;
    if (ya == null || yb == null) { diag('info', 'edge-not-drawn', `継承を描いていない: 端の事象の行が求まらない`, s.el); continue; }
    if (s.dir === 0) {
      const pa = proxyAt(ea, ya, 'l'), pb = proxyAt(eb, yb === ya ? yb + LOOP_H : yb, 'l');
      const xa = ea.life.x;
      const pts = [{ x: xa + 5, y: pa.cy }, { x: xa + LOOP_W, y: pa.cy }, { x: xa + LOOP_W, y: pb.cy }, { x: xa + 5, y: pb.cy }];
      d.edges.push({ id: idOf(s.el), symbol: 'sq-succession', el: s.el, src: srcOf(s.el), from: pa.id, to: pb.id, label: s.label, markers: [], points: pts, labelCands: [{ x: xa + LOOP_W + 7, y: (pa.cy + pb.cy) / 2 + 4, anchor: 'start' }] });
      continue;
    }
    const dir = s.dir;
    const pa = O.get(`${ea.life.id}>${ya}`) ?? proxyAt(ea, ya, dir > 0 ? 'l' : 'r');
    const pb = O.get(`${eb.life.id}>${yb}`) ?? proxyAt(eb, yb, dir > 0 ? 'r' : 'l');
    const xa = ea.life.x + 5 * dir, xb = eb.life.x - 5 * dir;
    const xm = xb - dir * 30; // 終点の手前の横の区間は、矢じり(長さ 11)より十分長くする
    const pts = ya === yb ? [{ x: xa, y: ya }, { x: xb, y: yb }] : [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }, { x: xb, y: yb }];
    d.edges.push({ id: idOf(s.el), symbol: 'sq-succession', el: s.el, src: srcOf(s.el), from: pa.id, to: pb.id, label: s.label, markers: [], points: pts, labelCands: [{ x: (xa + xm) / 2, y: ya - 6, anchor: 'middle' }, { x: (xa + xm) / 2, y: ya + 15, anchor: 'middle', below: true }] });
  }
  // 注釈の記号は、頭の並びの右に置く
  const lastLife = lifes.length ? lifes[lifes.length - 1].life.x : rx + leftPad;
  const headsRight = Math.max(prevRight ?? rx + leftPad, lastLife + rightNeed);
  let nx = Math.max((prevRight ?? rx + leftPad) + HEAD_GAP, lastLife + rightNeed + 10);
  let notesBottom = headY;
  const restNotes = R.notes.filter((n) => !nearNotes.has(n));
  for (const n of restNotes) {
    const s = noteSize(n);
    Object.assign(n, { x: nx, y: headY, w: s.w, h: s.h });
    nx += s.w + HEAD_GAP;
    notesBottom = Math.max(notesBottom, headY + s.h);
  }
  let contentRight = restNotes.length ? nx - HEAD_GAP : headsRight;
  // 頭の上に置く注(GR14 の N): 注釈先の頭の並びの順に、頭の中央にそろえ、左の注と HEAD_GAP 以上離す
  const headOf = (n) => R.heads.find((h) => h.el === R.annotations.find((a) => a.note === n).targets[0].el);
  const midX = (h) => (h.type === 'sqport' ? h.cx : h.x + h.w / 2);
  let px = rx + SIDE_PAD;
  for (const n of [...nearNotes].sort((a, b) => midX(headOf(a)) - midX(headOf(b)) || ctx.order.get(a.el) - ctx.order.get(b.el))) {
    const s = noteSize(n);
    const x = Math.max(px, Math.round(midX(headOf(n)) - s.w / 2));
    Object.assign(n, { x, y: ry + HEAD_TOP, w: s.w, h: s.h });
    px = x + s.w + HEAD_GAP;
    contentRight = Math.max(contentRight, x + s.w);
  }
  const regionW = Math.max(contentRight - rx + SIDE_PAD, 120);
  const ellipsisH = box?.ellipsis ? LINE : 0;
  const regionH = Math.max(lifeBottom, notesBottom) - ry + 20 + ellipsisH;
  // 注釈の線・依存の線(頭の上の通り道を通る)
  let band = 0;
  const topOf = (o) => (o.type === 'sqport' ? { x: o.cx, y: o.cy - 7 } : { x: o.x + o.w / 2, y: o.y });
  const bandRoute = (A, B) => {
    const yb = headY - BAND_DROP - band * BAND; band++;
    const a = topOf(A), b = topOf(B);
    if (a.x === b.x) return [a, b];
    return [a, { x: a.x, y: yb }, { x: b.x, y: yb }, b];
  };
  const drawnObj = (el) => R.heads.find((h) => h.el === el) ?? R.notes.find((n) => n.el === el) ?? null;
  for (const { note, targets } of R.annotations) {
    targets.forEach((t, i) => {
      const id = `${note.id}.a${i}`;
      if (box && t.el === box.el) {
        // 持ち主の箱へ: 注の記号の右の辺から、箱の右の縁へ
        const yy = note.y + Math.min(note.h / 2, 18);
        d.edges.push({ id, symbol: 'annotation-link', el: note.el, src: note.src, from: note.id, to: box.id, label: '', markers: [], points: [{ x: note.x + note.w, y: yy }, { x: rx + regionW, y: yy }] });
        return;
      }
      const o = t.el ? drawnObj(t.el) : null;
      if (!o || o === note) { diag('info', 'edge-not-drawn', `注釈の線を描いていない: 「${t.name ?? ''}」は図に描いていない`, note.el); band++; return; }
      if (nearNotes.has(note)) {
        // 頭の上に置いた注(GR14 の N): 注の下の辺から頭の上の辺へ。頭の中央が注の幅の中になければ、間で 1 回横に進む
        const b = topOf(o), nb = note.y + note.h;
        const pts = b.x >= note.x + 8 && b.x <= note.x + note.w - 8 ? [{ x: b.x, y: nb }, b] : [{ x: note.x + note.w / 2, y: nb }, { x: note.x + note.w / 2, y: nb + NOTE_DROP / 2 }, { x: b.x, y: nb + NOTE_DROP / 2 }, b];
        d.edges.push({ id, symbol: 'annotation-link', el: note.el, src: note.src, from: note.id, to: o.id, label: '', markers: [], points: pts });
        return;
      }
      d.edges.push({ id, symbol: 'annotation-link', el: note.el, src: note.src, from: note.id, to: o.id, label: '', markers: [], points: bandRoute(note, o) });
    });
  }
  for (const el of R.deps) {
    const pick = (prop) => ctx.refsOf(el, prop).map((r) => (r.status === 'resolved' ? drawnObj(r.target) : null));
    const cs = pick('client'), ss = pick('supplier');
    if (cs.length !== 1 || ss.length !== 1 || !cs[0] || !ss[0]) { diag('info', 'edge-not-drawn', `${ctx.nameOf(el) ?? 'dependency'} を描いていない: 依存の端を図に描いていない(シーケンスビューでは、頭と注釈の記号の間の 1 対 1 の依存だけを描く)`, el); band++; continue; }
    d.edges.push({ id: idOf(el), symbol: 'binary-dependency', el, src: srcOf(el), from: cs[0].id, to: ss[0].id, label: ctx.nameOf(el) ?? '', markers: [], points: bandRoute(cs[0], ss[0]) });
  }
  if (!box) return { w: regionW, h: regionH };
  // 箱
  let compW = 0, compH = 0;
  for (const c of box.compartments) {
    compW = Math.max(compW, textWidth(c.title, FSS) + 2 * PAD, ...c.lines.map((l) => textWidth(l.text, FSS) + 2 * PAD));
    compH += (c.lines.length + 1) * LINE + 8;
  }
  const w = Math.ceil(Math.max(120, headW, regionW, compW));
  Object.assign(box, { x: x0, y: y0, w, h: Math.ceil(headH + preH + regionH + compH + 6) });
  let py = y0 + headH;
  for (const c of box.preCompartments ?? []) { c.y = py; py += (c.lines.length + 1) * LINE + 8; }
  box.regionY = ry; box.regionH = regionH;
  box.compY = ry + regionH;
  // 持ち主の箱への注釈の線を、箱の右の縁まで伸ばす
  for (const e of d.edges) if (e.symbol === 'annotation-link' && e.to === box.id) e.points[1].x = x0 + w;
  return { w, h: box.h };
}
