// 相互接続ビューの SVG の文字列の生成(GR4 指示書 5.3 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// toSvg(diagram) → SVG の文字列。記号は仕様書 PDF の図から描き起こしたもの(tools/view/symbols.json の図形の要点)。
// 図の要素ごとに <g data-id data-sym data-start data-end> でまとめる(段階 0 で、原文の範囲に移るのに使う)。
// 文字はすべて escapeXml を通す(設計書 10 章の安全性)。

import { escapeXml as X, runNested } from './common.js';
import { FONT_FAMILY, textWidth } from './textwidth.js';
import { FS, FSS, LINE, ICON_W, centerOf, holderHead } from './layout.js';
import { svgShapes, boxConflicts, GR12_EDGES } from './quality.js';

const INK = '#1f2328';
const PAPER = '#ffffff';
const MUTED = '#57606a';
const PAD = 10;
const n = (v) => String(Math.round(v * 2) / 2);

const text = (x, y, s, { size = FSS, anchor = 'start', bold = false, italic = false, fill = INK, rotate = null } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${size}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${bold ? ' font-weight="bold"' : ''}${italic ? ' font-style="italic"' : ''}${fill !== INK ? ` fill="${fill}"` : ''}${rotate !== null ? ` transform="rotate(${rotate} ${n(x)} ${n(y)})"` : ''}>${X(s)}</text>`;
const group = (o, sym, body) => `<g data-id="${X(o.id)}" data-sym="${X(sym)}"${o.src ? ` data-start="${o.src[0]}" data-end="${o.src[1]}"` : ''}>${body}</g>`;

export function toSvg(d, opts = { labels: true }) {
  const get = (id) => d.objects.get(id);
  const out = [];
  const W = d.width, H = d.height;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${X(FONT_FAMILY)}">`);
  out.push(`<defs>`
    + `<marker id="sv2-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L11,6 L1,11" fill="none" stroke="${INK}" stroke-width="1.2"/></marker>`
    + `<marker id="sv2-filled" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L11,6 L1,11 Z" fill="${INK}" stroke="${INK}" stroke-width="1"/></marker>`
    + `</defs>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>`);
  if (d.frame) out.push(frameSvg(d.frame));
  // 箱は外側から順に描く(入れ子の箱が上に重なる)。区画の中の本体の図(GR7)は、持ち主の箱の領域の後に描く。
  // 入れ子の箱は明示のスタックで回す(GR27 の R。描く順は前の再帰と同じ)
  const drawBox = function* (o) {
    if (o.type === 'box') out.push(boxSvg(o, get));
    else if (o.type === 'note') out.push(noteSvg(o));
    else if (o.type === 'dparam') out.push(dparamSvg(o));
    else if (o.type === 'pnode') out.push(pnodeSvg(o));
    if (o.type === 'box') { for (const id of o.region) yield drawBox(get(id)); for (const id of bodiesOf(o)) yield drawBox(get(id)); }
  };
  for (const id of d.top) runNested(drawBox(get(id)));
  // シーケンスビューの生存線とポートの頭(GR9)。頭の箱の後、線の前に描く
  for (const o of d.objects.values()) if (o.type === 'lifeline') out.push(lifelineSvg(o));
  for (const o of d.objects.values()) if (o.type === 'sqport') out.push(sqPortSvg(o));
  // 線の当たり判定(設計書 7.3 節。GR9 P1 の裁定 H1): すべての見える線より下の 1 つの層に、線ごとに同じ経路の透明な幅 10 px の線を置く。
  // 線の形だけを当たり判定にし(pointer-events="stroke")、線と同じ data-id・data-start・data-end を付ける(段階 0 のクリックで線を選ぶ)。
  // 見える線を上に描くので、線の真上はその線に当たる。図の質の検査は data-hit の要素を数えない(src/view/quality.js の svgShapes)
  // シーケンスビューの生存線にも、同じ層に当たり判定を置く(GR9 P3 の確認の後の裁定)。data-id・data-start・data-end は、その頭のもの
  const lifeHits = [...d.objects.values()].filter((o) => o.type === 'lifeline').map((o) => hitSvg({ id: o.parent, src: o.src, points: [{ x: o.x, y: o.y1 }, { x: o.x, y: o.y2 }] }));
  if (d.edges.length || lifeHits.length) out.push(`<g data-sym="hit-areas">${d.edges.map(hitSvg).join('')}${lifeHits.join('')}</g>`);
  for (const e of d.edges) out.push(edgeSvg(e, get));
  // ポートと点は線の上に描く
  const drawPorts = function* (o) {
    if (o.type !== 'box') return;
    for (const id of o.ports) out.push(portSvg(get(id), get));
    for (const id of o.region) yield drawPorts(get(id));
    for (const id of bodiesOf(o)) yield drawPorts(get(id));
  };
  for (const id of d.top) runNested(drawPorts(get(id)));
  for (const o of d.objects.values()) if (o.type === 'dot') out.push(dotSvg(o));
  // シーケンスビューの生存線の上の点(sq-proxy)
  for (const o of d.objects.values()) if (o.type === 'lifeline') for (const id of o.proxies) out.push(portSvg(get(id), get));
  if (opts.labels) {
    const specs = opts.specs ?? labelSpecs(d);
    for (const sp of specs) out.push(drawSpec(sp, sp.cands[d.labelChoice?.get(sp.key) ?? 0]));
  }
  out.push('</svg>');
  return out.join('\n');
}

function frameSvg(f) {
  const r = 8;
  const parts = [];
  parts.push(`<rect x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`);
  // 名前の区画(右下の角だけ丸い)
  parts.push(`<path d="M${n(f.x)},${n(f.y + f.headH)} H${n(f.x + f.headW - r)} Q${n(f.x + f.headW)},${n(f.y + f.headH)} ${n(f.x + f.headW)},${n(f.y + f.headH - r)} V${n(f.y)}" fill="none" stroke="${INK}"/>`);
  parts.push(text(f.x + PAD, f.y + LINE + 1, f.title, { size: FS }));
  // 情報の区画: 右上に expose、左下に filter、右下に注釈(view-frame-info-compartment-tr・bl・br)
  const box = (lines, corner) => {
    if (!lines.length) return '';
    const w = f.infoW, h = lines.length * LINE + 8;
    let x, y, path;
    if (corner === 'tr') { x = f.x + f.w - w; y = f.y; path = `M${n(x)},${n(y)} V${n(y + h - r)} Q${n(x)},${n(y + h)} ${n(x + r)},${n(y + h)} H${n(f.x + f.w)}`; }
    if (corner === 'bl') { x = f.x; y = f.y + f.h - h; path = `M${n(x)},${n(y)} H${n(x + w - r)} Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)} V${n(f.y + f.h)}`; }
    if (corner === 'br') { x = f.x + f.w - w; y = f.y + f.h - h; path = `M${n(x)},${n(f.y + f.h)} V${n(y + r)} Q${n(x)},${n(y)} ${n(x + r)},${n(y)} H${n(f.x + f.w)}`; }
    const sym = `view-frame-info-compartment-${corner}`;
    return `<g data-sym="${sym}"><path d="${path}" fill="none" stroke="${INK}"/>${lines.map((l, i) => text(x + PAD, y + (i + 1) * LINE, l)).join('')}</g>`;
  };
  parts.push(box(f.exposes, 'tr'), box(f.filters, 'bl'), box(f.notes, 'br'));
  return group({ id: 'frame', src: f.src }, 'framed-view', parts.join(''));
}

// 箱の区画の中の本体の図(アクションフロービューの action-flow-view。GR7)の箱
export const bodiesOf = (o) => [...(o.preCompartments ?? []), ...(o.compartments ?? [])].filter((c) => c.body).map((c) => c.body);

function boxSvg(o, get) {
  const parts = [];
  // 枠なしの箱(本体の図・列の入れ物など): 枠と名前の区画を描かない
  if (o.plain) {
    if (o.ellipsis) parts.push(`<g data-sym="ellipsis-at-lower-left-corner">${text(o.x + PAD, o.regionY + o.regionH - 7, '...', { size: FS })}</g>`);
    return group(o, o.symbol, parts.join(''));
  }
  // 一般ビューのパッケージ(GR10)
  if (PACKAGE_BOXES.has(o.symbol)) return group(o, o.symbol, packageSvg(o));
  // アクションフロービューの列(swimlane)は、角の尖った破線の四角(本文 8.2.3.17 節の図)
  // 一般ビューの汎用の箱で、参照の使用(o.dashed。GR10)も破線にする
  const rounded = !o.symbol.endsWith('-def') && o.symbol !== 'swimlane';
  const dashed = o.symbol.endsWith('-ref') || o.symbol === 'swimlane' || !!o.dashed;
  parts.push(`<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}"${rounded ? ' rx="10"' : ''} fill="${PAPER}" fill-opacity="0.85" stroke="${INK}" stroke-width="1.2"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`);
  const cx = o.x + o.w / 2;
  // 名前の区画の記号(参照の箱は参照でないものと同じ区画。port-usage は port-name-compartment)
  const nameSym = o.nameSym ?? o.symbol.replace(/-ref$/, '').replace(/^port-usage$/, 'port') + '-name-compartment';
  const before = o.header.before ?? [], after = o.header.after ?? [];
  if (before.length || after.length) {
    // 状態遷移ビューの名前の区画: 前の行(«exhibit-state»)、キーワードの行、名前の行、後の行(«parallel»・本体の文字)
    const y0 = o.y + (o.headInset ?? 0);
    const rows = before.map((t, i) => text(cx, y0 + (i + 1) * LINE, t, { anchor: 'middle' }));
    const k = before.length;
    rows.push(text(cx, y0 + (k + 1) * LINE, o.header.keyword, { anchor: 'middle' }), text(cx, y0 + (k + 2) * LINE + 2, o.header.name, { size: FS, anchor: 'middle', bold: true }));
    after.forEach((t, i) => rows.push(text(cx, y0 + (k + 3 + i) * LINE + 2, t, { anchor: 'middle' })));
    parts.push(`<g data-sym="${X(nameSym)}">${rows.join('')}</g>`);
  } else parts.push(`<g data-sym="${X(nameSym)}">${text(cx, o.y + (o.headInset ?? 0) + LINE, o.header.keyword, { anchor: 'middle' })}${text(cx, o.y + (o.headInset ?? 0) + 2 * LINE + 2, o.header.name, { size: FS, anchor: 'middle', bold: true })}</g>`);
  // アクションフロービューの send・accept の箱の左上の印(PDF 260 ページの図。GR7 P1 の裁定 Q6)
  if (o.icon) parts.push(`<g data-sym="${o.icon}-icon">${iconPath(o.icon, o.x + 9, o.y + (o.headInset ?? 0) + 6)}</g>`);
  // 名前の区画の下の文字の区画(状態遷移ビューの entry・do。見出しは本文の図どおり斜体にしない)
  for (const c of o.preCompartments ?? []) parts.push(compartmentSvg(o, c, c.y, cx));
  if (o.ellipsis) parts.push(`<g data-sym="ellipsis-at-lower-left-corner">${text(o.x + PAD, o.regionY + o.regionH - 7, '...', { size: FS })}</g>`);
  let y = o.compY;
  for (const c of o.compartments) {
    parts.push(compartmentSvg(o, c, c.y ?? y, cx));
    y = (c.y ?? y) + (c.lines.length + 1) * LINE + 8;
  }
  return group(o, o.symbol, parts.join(''));
}

// 一般ビューのパッケージ(本文 8.2.3.5 節の図、PDF 229 ページ。GR10 P1 の裁定 Q1・Q2)
//   package-with-name-in-tab           描く範囲のパッケージの外枠。左上のタブに名前を書き、本体の中に領域を置く
//   package-with-name-inside           左上に小さなタブ。名前は本体の中ほど
//   imported-package-with-name-inside  上と同じ形の破線。«private»・«protected» の行があれば名前の上に書く
// 箱の外接矩形(x・y・w・h)はタブを含む。名前の区画の «» の行(header.keyword)は構造の文字だけに使い、図には書かない
const PACKAGE_BOXES = new Set(['package-with-name-in-tab', 'package-with-name-inside', 'imported-package-with-name-inside']);
export const PACKAGE_TAB_H = LINE + 8;
function packageSvg(o) {
  const dash = o.symbol.startsWith('imported') ? ' stroke-dasharray="6 4"' : '';
  const rect = (x, y, w, h) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${PAPER}" fill-opacity="0.85" stroke="${INK}" stroke-width="1.2"${dash}/>`;
  if (o.symbol === 'package-with-name-in-tab') {
    const th = PACKAGE_TAB_H, tw = Math.min(o.w, Math.max(60, textWidth(o.header.name, FS, true) + 2 * PAD));
    return rect(o.x, o.y, tw, th) + rect(o.x, o.y + th, o.w, o.h - th) + `<g data-sym="package-name">${text(o.x + PAD, o.y + LINE + 1, o.header.name, { size: FS, bold: true })}</g>`;
  }
  const th = 12, tw = Math.max(30, Math.round(o.w * 0.4));
  const lines = [...(o.header.before ?? []), o.header.name];
  const y0 = o.y + th + (o.h - th - lines.length * LINE) / 2 + LINE - 4;
  const rows = lines.map((t, i) => text(o.x + o.w / 2, y0 + i * LINE, t, i === lines.length - 1 ? { size: FS, anchor: 'middle', bold: true } : { anchor: 'middle' }));
  return rect(o.x, o.y, tw, th) + rect(o.x, o.y + th, o.w, o.h - th) + `<g data-sym="package-name">${rows.join('')}</g>`;
}

// send の印は右を向いた五角形の旗、accept の印は左に切り込みのある四角(どちらも黒く塗る。PDF 260 ページの図)。(x, y) は左上
function iconPath(kind, x, y) {
  const w = ICON_W, h = 10;
  const d = kind === 'send'
    ? `M${n(x)},${n(y)} H${n(x + w - 5)} L${n(x + w)},${n(y + h / 2)} L${n(x + w - 5)},${n(y + h)} H${n(x)} Z`
    : `M${n(x)},${n(y)} H${n(x + w)} V${n(y + h)} H${n(x)} L${n(x + 5)},${n(y + h / 2)} Z`;
  return `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="1"/>`;
}

function compartmentSvg(o, c, y, cx) {
  // 区切りの線。アクションフロービューの列の perform actions の区切りは破線(本文 7 章の Perform Actions Swimlanes の図)
  const lines = [`<line x1="${n(o.x)}" y1="${n(y)}" x2="${n(o.x + o.w)}" y2="${n(y)}" stroke="${INK}"${c.dashed ? ' stroke-dasharray="3 3"' : ''}/>`, text(cx, y + LINE, c.title, { anchor: 'middle', italic: !c.upright })];
  c.lines.forEach((l, i) => {
    // 線の端になった行は灰色にする(element-inside-textual-compartment)
    const hl = l.highlight ? `<rect data-sym="element-inside-textual-compartment" x="${n(o.x + PAD - 3)}" y="${n(y + (i + 1) * LINE + 3)}" width="${n(Math.min(o.w - 2 * PAD + 6, textWidth(l.text, FSS) + 6))}" height="${LINE}" fill="#d0d7de"/>` : '';
    lines.push(`<g data-start="${l.src[0]}" data-end="${l.src[1]}">${hl}${text(o.x + PAD, y + (i + 2) * LINE, l.text)}</g>`);
  });
  return `<g data-sym="${X(c.symbol)}">${lines.join('')}</g>`;
}

// 状態遷移ビューの節点(8.2.3.17 節の start-node〜merge-node と、8.2.3.18 節の entry-action の黒い角の丸い四角)
function pnodeSvg(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  let body;
  switch (o.symbol) {
    case 'start-node': body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(o.w / 2)}" fill="${INK}"/>`; break;
    case 'done-node': body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(o.w / 2)}" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(o.w / 2 - 4)}" fill="${INK}"/>`; break;
    case 'terminate-node': {
      const r = o.w / 2, k = r * 0.7071;
      body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/><path d="M${n(cx - k)},${n(cy - k)} L${n(cx + k)},${n(cy + k)} M${n(cx - k)},${n(cy + k)} L${n(cx + k)},${n(cy - k)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
      break;
    }
    case 'fork-node': case 'join-node': body = `<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" fill="${INK}"/>`; break;
    case 'decision-node': case 'merge-node': body = `<path d="M${n(cx)},${n(o.y)} L${n(o.x + o.w)},${n(cy)} L${n(cx)},${n(o.y + o.h)} L${n(o.x)},${n(cy)} Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>`; break;
    default: body = `<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" rx="3" fill="${INK}"/>`;
  }
  return group(o, o.symbol, body);
}

// ポートの向きの矢印(pdh・pdv。裁定 Q6: in は箱の内向き、out は外向き、inout は両向き、向きのないものは描かない)
function arrowDir(p, get) {
  let dir = p.dir;
  if (!dir) return null;
  if (dir === 'inout') return p.side === 'l' || p.side === 'r' ? 'h2' : 'v2';
  const inward = { l: 'r', r: 'l', t: 'd', b: 'u' }[p.side];
  const outward = { l: 'l', r: 'r', t: 'u', b: 'd' }[p.side];
  return dir === 'in' ? inward : outward;
}
function arrowGlyph(cx, cy, a) {
  const L = 4.5, h = 2.6;
  const seg = (x1, y1, x2, y2) => `M${n(x1)},${n(y1)} L${n(x2)},${n(y2)}`;
  let d = '';
  const head = (x, y, dx, dy) => seg(x - dx * h - dy * h, y - dy * h - dx * h, x, y) + ' ' + seg(x, y, x - dx * h + dy * h, y - dy * h + dx * h);
  if (a === 'r' || a === 'l' || a === 'h2') { d += seg(cx - L, cy, cx + L, cy); if (a !== 'l') d += ' ' + head(cx + L, cy, 1, 0); if (a !== 'r') d += ' ' + head(cx - L, cy, -1, 0); }
  else { d += seg(cx, cy - L, cx, cy + L); if (a !== 'u') d += ' ' + head(cx, cy + L, 0, 1); if (a !== 'd') d += ' ' + head(cx, cy - L, 0, -1); }
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1"/>`;
}

// 入れ子のポートは明示のスタックで回す(GR27 の R。文字列の並びは前の再帰と同じ)
function portSvg(p, get) { return runNested(portSvgGen(p, get)); }
function* portSvgGen(p, get) {
  const parts = [];
  const side = p.side ?? 't';
  const vertical = side === 'l' || side === 'r';
  if (p.type === 'proxy') {
    parts.push(`<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="5" fill="${INK}"/>`);
    return group(p, p.symbol === 'sq-proxy' ? 'sq-proxy' : vertical ? 'proxy-v' : 'proxy-h', parts.join(''));
  }
  const sym = `${p.symbol}-${side}`;
  const w = p.pw, h = p.ph;
  parts.push(`<rect x="${n(p.cx - w / 2)}" y="${n(p.cy - h / 2)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${PAPER}" stroke="${INK}"${p.dashed ? ' stroke-dasharray="3 2"' : ''}/>`);
  const a = arrowDir(p, get);
  if (p.children?.length) {
    // 入れ子のポートを持つポート: 長い四角の端に矢印、ラベルは長い向きに書く
    // ラベルは長い四角の端(上か左)に書き、矢印はその先に置く
    const head = holderHead(p);
    // 文字と矢印は、持ち主の縁(四角の中心を通る)より外側の半分に書く
    if (vertical) {
      const ox = side === 'l' ? -9 : 9;
      if (a) parts.push(`<g data-sym="pdh">${arrowGlyph(p.cx + ox, p.cy - h / 2 + 9, a)}</g>`);
      parts.push(text(side === 'l' ? p.cx - 5 : p.cx + 12.8, p.cy - h / 2 + 20, p.label, { anchor: 'end', rotate: -90 }));
    } else {
      parts.push(text(p.cx - w / 2 + 6, side === 't' ? p.cy - 5 : p.cy + 13, p.label));
      if (a) parts.push(`<g data-sym="pdv">${arrowGlyph(p.cx - w / 2 + head - 10, p.cy + (side === 't' ? -9 : 9), a)}</g>`);
    }
    let body = group(p, sym, parts.join(''));
    for (const id of p.children) body += yield portSvgGen(get(id), get);
    return body;
  }
  if (a) parts.push(`<g data-sym="${vertical ? 'pdh' : 'pdv'}">${arrowGlyph(p.cx, p.cy, a)}</g>`);
  return group(p, sym, parts.join(''));
}

function noteSvg(o) {
  const f = 10;
  const parts = [`<path d="M${n(o.x)},${n(o.y)} H${n(o.x + o.w - f)} L${n(o.x + o.w)},${n(o.y + f)} V${n(o.y + o.h)} H${n(o.x)} Z" fill="${PAPER}" stroke="${INK}"/>`,
    `<path d="M${n(o.x + o.w - f)},${n(o.y)} V${n(o.y + f)} H${n(o.x + o.w)}" fill="none" stroke="${INK}"/>`];
  let y = o.y + PAD + LINE - 4;
  for (const h of o.heading) { parts.push(text(o.x + o.w / 2, y, h, { anchor: 'middle' })); y += LINE; }
  if (o.heading.length && o.lines.length) y += 4;
  for (const l of o.lines) { parts.push(text(o.x + PAD, y, l)); y += LINE; }
  return group(o, o.symbol, parts.join(''));
}

function dparamSvg(o) {
  const parts = [];
  const cx = o.x + o.w / 2;
  if (o.symbol === 'actor') {
    // 棒人間(裁定 Q5)
    const hy = o.y + 8;
    parts.push(`<circle cx="${n(cx)}" cy="${n(hy)}" r="7" fill="${PAPER}" stroke="${INK}"/>`,
      `<path d="M${n(cx)},${n(hy + 7)} V${n(hy + 26)} M${n(cx - 11)},${n(hy + 13)} H${n(cx + 11)} M${n(cx)},${n(hy + 26)} L${n(cx - 9)},${n(hy + 40)} M${n(cx)},${n(hy + 26)} L${n(cx + 9)},${n(hy + 40)}" fill="none" stroke="${INK}"/>`,
      text(cx, o.y + o.h - 2, o.label, { anchor: 'middle' }));
  } else {
    parts.push(`<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" rx="10" fill="${PAPER}" stroke="${INK}"/>`,
      text(cx, o.y + LINE + 2, `«${o.symbol}»`, { anchor: 'middle' }), text(cx, o.y + 2 * LINE + 4, o.label, { anchor: 'middle' }));
  }
  return group(o, o.symbol, parts.join(''));
}

// シーケンスビューの生存線(lifeline。PDF 239 ページの図): 頭の下から下へ伸びる破線の縦線
function lifelineSvg(o) {
  return group(o, 'lifeline', `<line x1="${n(o.x)}" y1="${n(o.y1)}" x2="${n(o.x)}" y2="${n(o.y2)}" stroke="${INK}" stroke-dasharray="6 4"/>`);
}
// シーケンスビューのポートの頭(sq-port。PDF 238 ページの図): 角の丸い小さな四角と、右の sq-port-label
function sqPortSvg(o) {
  const body = `<rect x="${n(o.cx - o.pw / 2)}" y="${n(o.cy - o.ph / 2)}" width="${n(o.pw)}" height="${n(o.ph)}" rx="3" fill="${PAPER}" stroke="${INK}"/>`
    + `<g data-sym="sq-port-label">${text(o.cx + o.pw / 2 + 4, o.cy + 13, o.label)}</g>`;
  return group(o, 'sq-port', body);
}

function dotSvg(o) {
  return group(o, o.symbol, `<circle cx="${n(o.cx)}" cy="${n(o.cy)}" r="5" fill="${INK}"/>`);
}

const DASHED = new Set(['binary-dependency', 'n-ary-dependency-client-link', 'n-ary-dependency-supplier-link', 'annotation-link', 'succession-flow', 'else-branch', 'aflow-succession', 'sq-succession',
  'import', 'top-level-import', 'recursive-import', 'expose-r', 'toplevel-expose-r', 'recursive-expose-r']);
const OPEN_END = new Set(['binary-dependency', 'n-ary-dependency-supplier-link', 'message', 'transition', 'st-succession', 'else-branch', 'aflow-succession', 'sq-succession',
  'import', 'top-level-import', 'recursive-import', ...GR12_EDGES]);
const FILLED_END = new Set(['flow', 'succession-flow']);
const STATE_EDGES = new Set(['transition', 'st-succession', 'else-branch', 'aflow-succession']);

const pointsAttr = (pts) => pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
function hitSvg(e) {
  return `<polyline data-id="${X(e.id)}"${e.src ? ` data-start="${e.src[0]}" data-end="${e.src[1]}"` : ''} data-hit="1" points="${pointsAttr(e.points)}" fill="none" stroke="${INK}" stroke-opacity="0" stroke-width="10" pointer-events="stroke"/>`;
}

function edgeSvg(e, get) {
  const pts = e.points;
  const parts = [];
  const marker = OPEN_END.has(e.symbol) ? ' marker-end="url(#sv2-open)"' : FILLED_END.has(e.symbol) ? ' marker-end="url(#sv2-filled)"' : '';
  parts.push(`<polyline points="${pointsAttr(pts)}" fill="none" stroke="${INK}" stroke-width="1.2"${DASHED.has(e.symbol) ? ' stroke-dasharray="6 4"' : ''}${marker}/>`);
  if (END_MARKS.has(e.symbol)) parts.push(endMarkSvg(e.symbol, pts[pts.length - 1], pts[pts.length - 2]));
  // 線の上の印(flow-node-*)は、ラベルを置く区間(labelSegment)の中ほどに 22 px 間隔で並べる
  const ms = e.markers ?? [];
  const { p, q } = labelSegment(pts);
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const horiz = p.y === q.y;
  ms.forEach((m, i) => {
    const dir = m.symbol.endsWith('-r') ? 1 : -1;
    const ux = horiz ? Math.sign(q.x - p.x) * dir : 0, uy = horiz ? 0 : Math.sign(q.y - p.y) * dir;
    const off = (i - ((ms.length - 1) / 2)) * 22;
    const cx = mx + (horiz ? off : 0), cy = my + (horiz ? 0 : off);
    const tri = `M${n(cx + ux * 6)},${n(cy + uy * 6)} L${n(cx - ux * 5 - uy * 5)},${n(cy - uy * 5 - ux * 5)} L${n(cx - ux * 5 + uy * 5)},${n(cy - uy * 5 + ux * 5)} Z`;
    const filled = !m.symbol.startsWith('message');
    parts.push(group({ id: `${e.id}.m${i}`, src: m.src }, m.symbol, `<path d="${tri}" fill="${filled ? INK : PAPER}" stroke="${INK}"/>`));
  });
  return group(e, e.symbol, parts.join(''));
}

// 一般ビューの型の関係の線の終点の記号(本文 8.2.3.6 節の図、PDF 232・233 ページ。8.2.3.9 節の portion-relationship、PDF 237 ページ)。
// 本文の図の左の端(上位・型・持ち主)が、線の終点 t。q は 1 つ前の点。記号は SVG の marker にせず、図形として描く
// (文字の重なりの検査 src/view/quality.js の svgShapes が形を読めるように)。大きさは矢じり(長さ 11、幅 10)に合わせた
//   subclassification・subsetting  白抜きの三角
//   definition                      白抜きの三角と、その手前に縦に並ぶ黒い点 2 つ
//   reference-subsetting            白抜きの三角と、その手前に 2 行 2 列の黒い点 4 つ
//   redefinition                    白抜きの三角と、その手前に線と直角の短い棒
//   composite-feature-membership    黒いひし形。noncomposite-feature-membership は白抜きのひし形
//   portion-relationship            線の側に切り込みのある黒い円
const END_MARKS = new Set(['subclassification', 'definition', 'subsetting', 'reference-subsetting', 'redefinition', 'composite-feature-membership', 'noncomposite-feature-membership', 'portion-relationship']);
function endMarkSvg(sym, t, q) {
  const ux = Math.sign(t.x - q.x), uy = Math.sign(t.y - q.y);
  const px = -uy, py = ux;
  const at = (a, b) => ({ x: t.x - ux * a + px * b, y: t.y - uy * a + py * b });
  const poly = (ps, fill) => `<path d="M${ps.map((p) => `${n(p.x)},${n(p.y)}`).join(' L')} Z" fill="${fill}" stroke="${INK}" stroke-width="1.2"/>`;
  const dot = (p) => `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="1.5" fill="${INK}"/>`;
  const tri = poly([at(0, 0), at(11, 5.5), at(11, -5.5)], PAPER);
  switch (sym) {
    case 'definition': return tri + dot(at(15, 3)) + dot(at(15, -3));
    case 'reference-subsetting': return tri + dot(at(14.5, 3)) + dot(at(14.5, -3)) + dot(at(18.5, 3)) + dot(at(18.5, -3));
    case 'redefinition': { const a = at(15, 5), b = at(15, -5); return tri + `<path d="M${n(a.x)},${n(a.y)} L${n(b.x)},${n(b.y)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`; }
    case 'composite-feature-membership': return poly([at(0, 0), at(7, 5), at(14, 0), at(7, -5)], INK);
    case 'noncomposite-feature-membership': return poly([at(0, 0), at(7, 5), at(14, 0), at(7, -5)], PAPER);
    case 'portion-relationship': {
      // 中心は終点から 6 手前。切り込みは線の来る側(-u の向き)に、開き 70 度
      const c = at(6, 0), r = 6, base = Math.atan2(-uy, -ux), ps = [c];
      for (let k = 0; k <= 10; k++) { const a = base + (35 + k * 29) * Math.PI / 180; ps.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); }
      return poly(ps, INK);
    }
    default: return tri;
  }
}

// 印を並べる区間: 長さ 40 以上の横の区間があればそのうち最も長いもの、なければ最も長い区間
function labelSegment(pts) {
  let best = 0, bl = -1;
  for (let i = 0; i + 1 < pts.length; i++) { const l = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y) + (pts[i].y === pts[i + 1].y && Math.abs(pts[i + 1].x - pts[i].x) >= 40 ? 100000 : 0); if (l > bl) { bl = l; best = i; } }
  return { p: pts[best], q: pts[best + 1] };
}

// ---- 動かせる文字(GR4 P2 の 3 回目の指示 1)
// ポートのラベル、線のラベル、線の端の役割名・多重度・残りの連鎖、線の上の印のラベル、黒丸のラベル。
// 各文字に置き場所の候補を並べ、placeLabels が、ほかの文字・線・箱の縁と重ならない最初の候補を選ぶ。
// spec = { key, owner: { id, src }, sym, lines: [{ s, size, fill? }], cands: [{ x, y, anchor }] }
//   1 行目の基線が (x, y)。2 行目以降は LINE ずつ下
export function labelSpecs(d) {
  const get = (id) => d.objects.get(id);
  const specs = [];
  const L = (s, extra = {}) => ({ s, size: FSS, ...extra });
  // ポート・proxy・引数のラベル
  for (const o of d.objects.values()) {
    if (!(o.type === 'port' || o.type === 'proxy') || !o.label || o.children?.length) continue;
    const half = o.type === 'proxy' ? 6 : (o.side === 'l' || o.side === 'r' ? o.pw : o.ph) / 2;
    const { cx, cy } = o;
    const c = [];
    for (const k of [0, 1, 2, 3]) {
      const up = cy - half - 5 - k * 12, down = cy + half + LINE - 1 + k * 12;
      const gx = 5 + (k >= 2 ? 6 : 0);
      if (o.side === 'l') c.push({ x: cx - half - gx, y: up, anchor: 'end' }, { x: cx - half - gx, y: down, anchor: 'end' });
      else if (o.side === 'r') c.push({ x: cx + half + gx, y: up, anchor: 'start' }, { x: cx + half + gx, y: down, anchor: 'start' });
      else if (o.side === 'b') c.push({ x: cx + half + gx, y: down, anchor: 'start' }, { x: cx - half - gx, y: down, anchor: 'end' });
      else c.push({ x: cx - half - gx, y: up, anchor: 'end' }, { x: cx + half + gx, y: up, anchor: 'start' });
    }
    specs.push({ key: `p:${o.id}`, owner: o, sym: 'port-label', lines: [L(o.label)], cands: c });
  }
  for (const e of d.edges) {
    const pts = e.points;
    if (!pts || pts.length < 2) continue;
    // 線の端の役割名・多重度・残りの連鎖
    const ends = [[pts[0], pts[1], e.fromRole, e.fromMult, e.fromExtra, 'f'], [pts[pts.length - 1], pts[pts.length - 2], e.toRole, e.toMult, e.toExtra, 't']];
    for (const [pt, nx, role, mult, extra, tag] of ends) {
      const items = [[role, 'r', INK], [mult, 'm', INK], [extra ? '.' + extra : null, 'x', MUTED]].filter((x) => x[0]);
      for (const [s0, k0, fill] of items) {
        const hx = nx.y === pt.y;
        const sx = Math.sign(nx.x - pt.x), sy = Math.sign(nx.y - pt.y);
        // 本文の connection-graphical の図(PDF 247 ページ)のとおり、端の名前(rolename)は線の上、多重度は線の下に、
        // どちらもその端の近くに置く(GR4 P2 の 4 回目の裁定 2)。端の区間が縦のときは、端の名前を右、多重度を左に置く。
        // 残りの連鎖(.x)は上と下のどちらでもよい
        const c = [];
        const above = k0 === 'r' || k0 === 'x', below = k0 === 'm' || k0 === 'x';
        for (const dd of [8, 16, 24, 32, 40, 48, 56, 64]) {
          if (hx) {
            const x = pt.x + sx * dd, anchor = sx > 0 ? 'start' : 'end';
            if (above) c.push({ x, y: pt.y - 5, anchor });
            if (below) c.push({ x, y: pt.y + 14, anchor });
          } else {
            const y = pt.y + sy * dd + (sy > 0 ? 9 : 0);
            if (above) c.push({ x: pt.x + 5, y, anchor: 'start' });
            if (below) c.push({ x: pt.x - 5, y, anchor: 'end' });
          }
        }
        specs.push({ key: `e:${e.id}:${tag}${k0}`, owner: e, sym: 'end-label', lines: [L(s0, fill !== INK ? { fill } : {})], cands: c });
      }
    }
    // 線のラベル(«interface» と UsageDeclaration など)
    const labels = [];
    if (e.symbol === 'interface-connection') labels.push('«interface»');
    if (e.labelLines) labels.push(...e.labelLines); // 状態遷移ビューの遷移のラベル(行に分けたもの)
    else if (e.label) labels.push(e.label);
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push({ p: pts[i], q: pts[i + 1], len: Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y), h: pts[i].y === pts[i + 1].y });
    const order = segs.map((sg, i) => ({ ...sg, i })).sort((a, b) => (b.h - a.h) || (b.len - a.len) || (a.i - b.i));
    if (labels.length) {
      const k = labels.length;
      const c = [];
      // 線の近くに置く(GR4 P2 の 3 回目の裁定 2。本文の message・flow・succession-flow の図はラベルが線の上)。
      // 横の区間の上 → 縦の区間の右・左 → 横の区間の下 の順に、区間の中ほどから端の方へ候補を並べる
      const ts = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
      // シーケンスビューの線は、配置で決めた候補(生存線の間の中ほど)を使う(GR9)
      if (e.labelCands) c.push(...e.labelCands);
      else for (const sg of order) if (sg.h) for (const t of ts) c.push({ x: sg.p.x + (sg.q.x - sg.p.x) * t, y: sg.p.y - 6 - (k - 1) * LINE, anchor: 'middle' });
      for (const sg of order) if (!sg.h) for (const t of ts) { const my = sg.p.y + (sg.q.y - sg.p.y) * t; c.push({ x: sg.p.x + 7, y: my - ((k - 1) * LINE) / 2 + 4, anchor: 'start' }, { x: sg.p.x - 7, y: my - ((k - 1) * LINE) / 2 + 4, anchor: 'end' }); }
      for (const sg of order) if (sg.h) for (const t of ts) c.push({ x: sg.p.x + (sg.q.x - sg.p.x) * t, y: sg.p.y + 15, anchor: 'middle', below: true });
      // 状態遷移ビューの線は、ラベルが長いので、線から離した候補を後ろに足す(相互接続ビューの線には足さない)
      if (STATE_EDGES.has(e.symbol)) {
        for (const off of [24, 48, 72, 96]) {
          for (const sg of order) if (!sg.h) for (const t of ts) { const my = sg.p.y + (sg.q.y - sg.p.y) * t; c.push({ x: sg.p.x + 7 + off, y: my - ((k - 1) * LINE) / 2 + 4, anchor: 'start' }, { x: sg.p.x - 7 - off, y: my - ((k - 1) * LINE) / 2 + 4, anchor: 'end' }); }
          for (const sg of order) if (sg.h) for (const t of ts) c.push({ x: sg.p.x + (sg.q.x - sg.p.x) * t, y: sg.p.y - 6 - off / 2 - (k - 1) * LINE, anchor: 'middle' });
        }
      }
      specs.push({ key: `e:${e.id}:label`, owner: e, sym: 'edge-label', lines: labels.map((l) => L(l)), cands: c });
    }
    // 線の上の印のラベル: 向きを付けて縦に並べる
    const ms = e.markers ?? [];
    if (ms.length) {
      const { p, q } = labelSegment(pts);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, horiz = p.y === q.y;
      const lines = ms.map((m) => {
        const dir = m.symbol.endsWith('-r') ? 1 : -1;
        const kw = m.symbol.startsWith('sflow') ? '«succession flow» ' : m.symbol.startsWith('message') ? '«message» ' : '';
        const arrow = (horiz ? Math.sign(q.x - p.x) : Math.sign(q.y - p.y)) * dir > 0 ? (horiz ? '→' : '↓') : (horiz ? '←' : '↑');
        return L(`${arrow} ${kw}${m.label ?? ''}`.trim());
      });
      const k = lines.length;
      const span = (k - 1) * 22 / 2 + 8;
      const c = horiz
        ? [{ x: mx, y: my + 8 + FSS, anchor: 'middle' }, { x: mx, y: my - 8 - (k - 1) * LINE - 4, anchor: 'middle' }, { x: mx, y: my + 20 + FSS, anchor: 'middle' }]
        : [{ x: mx + 10, y: my - span - (k - 1) * LINE / 2, anchor: 'start' }, { x: mx - 10, y: my - span - (k - 1) * LINE / 2, anchor: 'end' }];
      specs.push({ key: `e:${e.id}:markers`, owner: e, sym: 'marker-label', lines, cands: c });
    }
  }
  // 黒丸のラベル
  for (const o of d.objects.values()) {
    if (o.type !== 'dot' || !o.label) continue;
    const c = [];
    for (const r of [8, 16]) c.push({ x: o.cx - r, y: o.cy - r, anchor: 'end' }, { x: o.cx + r, y: o.cy - r, anchor: 'start' }, { x: o.cx - r, y: o.cy + r + 8, anchor: 'end' }, { x: o.cx + r, y: o.cy + r + 8, anchor: 'start' });
    specs.push({ key: `d:${o.id}`, owner: o, sym: 'dot-label', lines: [L(o.label)], cands: c });
  }
  return specs;
}

function drawSpec(sp, cand) {
  const body = sp.lines.map((l, i) => text(cand.x, cand.y + i * LINE, l.s, { size: l.size, anchor: cand.anchor, fill: l.fill ?? INK })).join('');
  return `<g data-id="${X(sp.owner.id)}" data-sym="${sp.sym}"${sp.owner.src ? ` data-start="${sp.owner.src[0]}" data-end="${sp.owner.src[1]}"` : ''}>${body}</g>`;
}

// 文字の外接矩形(textOverlaps と同じ見積もり)
export function specBox(sp, cand) {
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  sp.lines.forEach((l, i) => {
    const w = textWidth(l.s, l.size);
    const xa = cand.anchor === 'middle' ? cand.x - w / 2 : cand.anchor === 'end' ? cand.x - w : cand.x;
    const y = Math.round((cand.y + i * LINE) * 2) / 2;
    x1 = Math.min(x1, Math.round(xa * 2) / 2); x2 = Math.max(x2, Math.round(xa * 2) / 2 + w);
    y1 = Math.min(y1, y - l.size * 0.8); y2 = Math.max(y2, y + l.size * 0.25);
  });
  return { x1, x2, y1, y2 };
}

// 動かせる文字を除いた SVG から、動かせない文字・線・縁を読み取り、動かせる文字を順に置く。戻り値 { svg, conflicts, below }
export function renderWithLabels(d) {
  const base = toSvg(d, { labels: false });
  const { texts, segs } = svgShapes(base);
  const specs = labelSpecs(d);
  const placed = [];
  const choice = new Map();
  let conflicts = 0, below = 0;
  for (const sp of specs) {
    let best = 0, bestHits = Infinity;
    sp.cands.forEach((c, i) => {
      if (bestHits === 0) return;
      const b = specBox(sp, c);
      const hits = boxConflicts(b, texts, segs) + boxConflicts(b, placed, []) + (b.x1 < 1 || b.y1 < 1 || b.x2 > d.width - 1 || b.y2 > d.height - 1 ? 1 : 0);
      if (hits < bestHits) { bestHits = hits; best = i; }
    });
    choice.set(sp.key, best);
    placed.push(specBox(sp, sp.cands[best]));
    conflicts += bestHits;
    if (sp.cands[best].below) below++;
  }
  d.labelChoice = choice;
  // below: 線のラベルを線の下に置いた数(上に置けなかったもの。間隔を広げてやり直す判断に使う)
  return { svg: toSvg(d, { labels: true, specs }), conflicts, below };
}

export { centerOf };

