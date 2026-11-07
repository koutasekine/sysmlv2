// 標準ライブラリの名前の索引(GR17 指示書 3.1 節、設計書 6.1 節)を、名前解決(src/model/resolve.js)が使う形にする。
// 外部パッケージと Node.js 固有の機能を使わない。
//
// makeLibrary(conforms) → { roots, byQname, implicit }
//   索引の要素を、構文木の要素と同じ形({ kind, name, shortName, owned, related, refs, attrs, start, end })の節点にする。
//   どの節点も builtin: true(利用者のモデルの要素でない。図に描かず、図からの編集の対象にしない)と lib: true を持つ。
//   持ち主への辺は libParent(構文木の parent の代わり)。要素は所有の Membership(型の中の特徴は FeatureMembership、
//   ほかは OwningMembership)の下に置く。上位の型は特殊化の関係の節点、import は import の節点、別名は Membership の節点にする。
//   参照(refs の値)は、区切りの名前の配列(構文木では原文の文字)。特徴の連鎖は、構文木と同じく関係の related の Feature の
//   FeatureChaining の並び。
//   roots    最上位のパッケージの節点
//   byQname  修飾名(引用符を外した名前を「::」でつないだもの)→ 名前のある要素の節点
//   implicit 暗黙の特殊化の相手 [[メタクラス, 修飾名, 本文の行]](src/model/library_table.js の説明)
//   slots    要素ごとの参照の並び [[節点, 属性名]](上位の型・別名の相手・import の順。特徴の連鎖は区切りごと)
//   表の resolved(道具 tools/model/build_library_table.mjs が、今の名前解決で索引の中の参照を解いた解決先)があれば、
//   参照の節点に libPre[属性名] として付ける(索引の要素の番号、内蔵する表の項目の修飾名 { builtin }、解決なしは null)。
//   索引の中の参照は利用者のモデルによらないので、名前解決はこれをそのまま使う
// 作った節点は、名前解決のたびに作り直さない(1 回だけ作る)。名前解決の結果は、呼び出しごとの表に持つ。

import table from './library_table.js';

const REL = { C: 'Subclassification', P: 'Specialization', S: 'Subsetting', R: 'Redefinition', F: 'ReferenceSubsetting', X: 'CrossSubsetting', T: 'FeatureTyping', J: 'Conjugation' };
const PROP = { Subclassification: 'superclassifier', Specialization: 'general', Subsetting: 'subsettedFeature', Redefinition: 'redefinedFeature', ReferenceSubsetting: 'referencedFeature', CrossSubsetting: 'crossedFeature', FeatureTyping: 'type', Conjugation: 'originalType' };
const VIS = { '': 'public', p: 'private', r: 'protected', u: 'public' };
const BASIC = /^[A-Za-z_][A-Za-z0-9_]*$/;
const quote = (n) => (BASIC.test(n) ? n : `'${n.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);

let LIB = null;
export function makeLibrary(conforms) {
  if (LIB) return LIB;
  LIB = decodeLibrary(table, conforms);
  return LIB;
}
// 表 t(src/model/library_table.js の形)を節点にする。検査は仮の表を渡して読み方を確かめる(GR18 の M8)
export function decodeLibrary(table, conforms) {
  const names = table.names.split(';');
  const kinds = table.kinds.split(' ');
  const recs = table.elements.split(';');
  const nodes = new Array(recs.length);
  const roots = [];
  const byQname = new Map();
  const node = (kind, parent, extra = {}) => ({ builtin: true, lib: true, kind, owned: [], related: [], refs: {}, attrs: {}, start: 0, end: 0, libParent: parent, ...extra });
  const ref = (code) => code.split('.').map(link => link.split(':').map(x => names[parseInt(x, 36)]));
  // 参照 1 つ(修飾名か特徴の連鎖)を、関係の節点 rel の prop に付ける
  const slots = [];
  let cur = null;
  const attachRef = (rel, prop, code) => {
    const links = ref(code);
    if (links.length === 1) { rel.refs[prop] = links[0]; cur.push([rel, prop]); return; }
    const chain = node('Feature', rel);
    for (const l of links) { const fc = node('FeatureChaining', chain, { refs: { chainingFeature: l } }); chain.owned.push(fc); cur.push([fc, 'chainingFeature']); }
    rel.related.push(chain);
  };
  recs.forEach((r, i) => {
    slots.push(cur = []);
    const f = r.split(',');
    const kind = kinds[parseInt(f[0], 36)];
    const owner = f[1] ? nodes[i - parseInt(f[1], 36)] : null;
    const name = f[2] ? names[parseInt(f[2], 36)] : undefined;
    const shortName = f[3] ? names[parseInt(f[3], 36)] : undefined;
    const visibility = VIS[f[4] ?? ''];
    if (kind === 'Membership') {
      // 別名(alias X for Y)
      const m = node('Membership', owner, { libId: i, attrs: { visibility, ...(name !== undefined ? { memberName: name } : {}), ...(shortName !== undefined ? { memberShortName: shortName } : {}) } });
      attachRef(m, 'memberElement', f[6]);
      owner.owned.push(m);
      nodes[i] = m;
      return;
    }
    const qname = name === undefined ? null : owner ? (owner.qname == null ? null : `${owner.qname}::${quote(name)}`) : quote(name);
    const el = node(kind, null, { libId: i, qname, ...(name !== undefined ? { name } : {}), ...(shortName !== undefined ? { shortName } : {}) });
    if (owner) {
      const memKind = conforms(owner.kind, 'Type') && conforms(kind, 'Feature') ? 'FeatureMembership' : 'OwningMembership';
      const mem = node(memKind, owner, { attrs: { visibility }, related: [el] });
      el.libParent = mem;
      owner.owned.push(mem);
    } else roots.push(el);
    for (const g of (f[5] ? f[5].split('/') : [])) {
      const rk = REL[g[0]];
      const rel = node(rk, el);
      attachRef(rel, PROP[rk], g.slice(1));
      el.owned.push(rel);
    }
    for (const im of (f[7] ? f[7].split('/') : [])) {
      let k = 0;
      const ns = im[k++] === 'n';
      // 再帰の印は *(GR18 の M8。前は r で、protected の r と区別できなかった)
      const rec = im[k] === '*'; if (rec) k++;
      const vis = VIS[im[k++]];
      const imp = node(ns ? 'NamespaceImport' : 'MembershipImport', el, { attrs: { visibility: vis, ...(rec ? { isRecursive: true } : {}) } });
      attachRef(imp, ns ? 'importedNamespace' : 'importedMembership', im.slice(k));
      el.owned.push(imp);
    }
    if (qname != null) {
      const key = qnameKey(el, owner);
      el.libKey = key;
      if (!byQname.has(key)) byQname.set(key, el);
    }
    nodes[i] = el;
  });
  // 道具が解いた解決先
  if (table.resolved) {
    const res = table.resolved.split(';');
    slots.forEach((sl, i) => {
      const ts = res[i] ? res[i].split(',') : [];
      sl.forEach(([n, prop], k) => {
        const t = ts[k] ?? '';
        (n.libPre ??= {})[prop] = t === '' ? null : t[0] === '~' ? { builtin: table.resolvedBuiltins[parseInt(t.slice(1), 36)] } : nodes[parseInt(t, 36)];
      });
    });
  }
  return { roots, byQname, implicit: table.implicit, contextual: table.contextual ?? [], size: recs.length, slots, nodes, pre: !!table.resolved };
}
// 引用符を外した名前を「::」でつないだ修飾名(内蔵する表の qname と同じ形)
function qnameKey(el, owner) {
  return owner ? `${owner.libKey}::${el.name}` : el.name;
}
