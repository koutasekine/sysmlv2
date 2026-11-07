// このアプリの構文木を、tools/pilot-runner が書き出す「種類と名前の木」と同じ形にする(GR2 指示書 6.1 節)。
//
//   { type, name?, shortName?, owned?: [...], related?: [...] }
//   type は要素の種類(メタクラス名)、name・shortName は宣言した名前(引用符を外し、エスケープを解いたもの)、
//   owned は ownedRelationship、related は ownedRelatedElement の並び。空の並びは書かない(パイロット実装の実行器と同じ)。
// 原文の範囲などは比べないので落とす。
//
// 式の部分木(GR2 P2 の D5 の裁定、案 B): 式(抽象構文で Expression の下位のメタクラス。grammar/metaclasses.json の
// 一般化による)は種類だけを比べ、中の構造は比べない。collapseExpressions がその形にする。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const general = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'grammar/metaclasses.json'), 'utf8')).metaclasses.map(m => [m.name, m.general]));
const exprCache = new Map();
export function isExpressionKind(t) {
  if (exprCache.has(t)) return exprCache.get(t);
  exprCache.set(t, false);
  const r = t === 'Expression' || (general.get(t) ?? []).some(isExpressionKind);
  exprCache.set(t, r);
  return r;
}

// パイロット実装の形の木 e の、式の部分木を { type } だけにする
export function collapseExpressions(e) {
  if (isExpressionKind(e.type)) return { type: e.type };
  const out = { ...e };
  if (e.owned) out.owned = e.owned.map(collapseExpressions);
  if (e.related) out.related = e.related.map(collapseExpressions);
  return out;
}

export function toPilotFormat(e) {
  const out = { type: e.kind };
  if (e.name !== undefined) out.name = e.name;
  if (e.shortName !== undefined) out.shortName = e.shortName;
  if (e.owned.length) out.owned = e.owned.map(toPilotFormat);
  if (e.related.length) out.related = e.related.map(toPilotFormat);
  return out;
}

// 2 つの木の最初の食い違いを探す。一致すれば null。
//   { path, ours, pilot, what }  path は根からの道筋(例: "Namespace/owned[0]:OwningMembership/related[0]:Package")
export function firstDiff(a, b, path = '') {
  const here = (x) => `${path}${path ? '/' : ''}${x}`;
  if (!a || !b) return { path, what: a ? 'パイロット実装に要素がない' : 'このアプリに要素がない', ours: brief(a), pilot: brief(b) };
  if (a.type !== b.type) return { path: here(a.type), what: '種類', ours: a.type, pilot: b.type };
  if (a.name !== b.name) return { path: here(a.type), what: '名前', ours: a.name, pilot: b.name };
  if (a.shortName !== b.shortName) return { path: here(a.type), what: '短い名前', ours: a.shortName, pilot: b.shortName };
  for (const k of ['owned', 'related']) {
    const xs = a[k] ?? [], ys = b[k] ?? [];
    const m = Math.max(xs.length, ys.length);
    for (let i = 0; i < m; i++) {
      const d = firstDiff(xs[i], ys[i], `${here(a.type + (a.name !== undefined ? ` "${a.name}"` : ''))}/${k}[${i}]`);
      if (d) return d;
    }
  }
  return null;
}

const brief = (x) => x ? `${x.type}${x.name !== undefined ? ` "${x.name}"` : ''}` : null;
