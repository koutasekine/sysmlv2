// 名前解決(GR3 指示書 6 章)。外部パッケージと Node.js 固有の機能を使わない。
//
// 規則は KerML 1.0 の 8.2.3.5 節(名前解決)・8.3.2.4 節(名前空間・import)・8.3.3.1.10 節(継承)と、
// GR3 P1 の裁定 D1〜D9 による(reports/GR3/P1_resolution_rules_*.md、P1_rulings_*.md)。
//
// resolveNames(tree, text, opts) → model
//   tree  src/parser の構文木(parse(text).tree)
//   text  原文(参照の範囲を求めるのに使う)
//   opts.order  参照を解く順を決める関数(参照の一覧 → 並べ替えた一覧)。省略時は文書の順。
//               解く順序に結果が左右されないことの検査(tools/model/order_check.mjs)に使う
// model.refs        参照の一覧。1 つの参照は次の形:
//   { node, prop, index, text, start, end, global, conjugated, segments, status, target, candidates, shadow, reason, kindMismatch }
//     node      参照を持つ関係の要素(構文木の要素)。prop・index はその refs の属性名と、一覧なら何番目か
//     start,end 原文の範囲(修飾名の全体。共役ポートの ~ は含まない)
//     segments  区切りごとの { name, start, end, target }。target はその区切りが指す要素(わからなければ null)
//     status    'resolved'(解決済み)・'unchecked'(未検査)・'ambiguous'(曖昧)
//     target    解決済みなら、利用者のモデルの要素(構文木の要素)か、内蔵する表の項目(builtin: true)
//     candidates 曖昧なら、候補の要素の一覧
//     shadow    裁定 D3: 暗黙の特殊化や中身のわからない import を持つ名前空間を通り越して外側で見つかったとき、
//               その名前空間の一覧 [{ ns, why: 'inherit' | 'import' | 'filter' }]。図からの編集の前の検査では未検査と同じに扱う
//     reason    未検査・曖昧の理由
//     kindMismatch 解決した要素が、文脈で期待される種類に適合しないとき、その期待される種類(KerML 8.2.3.5.1、kerml10 L5479–L5482)
// model.referencesTo(elem) その要素を指す区切りの一覧 [{ ref, segment, start, end }](逆引き。修飾名の途中の区切りを含む)
// model.namesOf(elem)      要素の実効の名前 { name, shortName }(KerML 8.3.3.3.4 の effectiveName)
// model.conforms(kind, metaclass)  種類の適合(内蔵する表の上位の種類をたどる)

import builtinTable from './builtin_table.js';
import grammar from '../parser/grammar_table.js';
import { makeLexer, unquote } from '../parser/lexer.js';
import { walkTree } from '../parser/tree.js';
import { makeLibrary } from './library.js';

// GR17 の L(GR17 指示書 3.1 節、設計書 6.1 節・6.2 節): 標準ライブラリの名前の索引(src/model/library_table.js)を名前解決に使うか。
// 使うときは、標準ライブラリの要素への参照を索引の要素(src/model/library.js の節点。builtin: true・lib: true)に解決し、
// 型の暗黙の特殊化の相手(仕様書本文の check〜Specialization のうち条件のないもの。表の implicit)を上位の型に加えて、
// そのメンバーで局所の解決を行う(D3 の印の理由にしない)。内蔵する表の項目(メタクラス・標準ビューの定義・Actions::Action と
// start・done、パッケージ KerML・SysML・StandardViewDefinitions・Actions)は今のまま使い、同じ修飾名の索引の要素は、内蔵する表の
// 項目に読み替える(内蔵する表の項目に名前がなければ、その索引の要素のメンバーを探す)。
// false にすれば、索引を入れる前の扱い(内蔵する表の項目以外の標準ライブラリへの参照は未検査)に戻る。
// resolveNames の opts.libraryIndex で 1 回の解決だけ変えられる(検査と全数比較の道具が使う)
// GR17 P2 では図からの編集の基準を満たさず false のままにした。P7 の E3(src/edit/index.js の EDIT17.E3)の後、P8 で既定に入れた
// (GR17 指示書 v17.2 の 3.2 節。reports/GR17/P8_L_*.md)
export const LIBRARY_INDEX = true;
// GR18 の直し(GR18 指示書 2.1 節)。項目ごとに切れる(切れば GR17 の終わりの扱い。検査と全数比較の道具が使う)
//   M1 見える解決と import で取り込む列挙で、所有する Membership と区別できない取り込みを除く
//   M3 局所の解決で、所有する項目を名前の索引で引く(結果は変えない)
//   M4 演算子の式は、索引の演算子の関数を呼び出しの型にする(as・istype・@ の型の被演算子などに D3 の印を付けない)
//   M5 $:: で、根の名前空間の曖昧を大域の検索で上書きしない
//   M6 別名の参照の範囲を、宣言の名前・短い名前の字句でなく for の後ろの字句にする
//   M7 大域で 2 つ以上の根の名前空間に当たる名前を曖昧にする
export const GR18 = { M1: true, M3: true, M4: true, M5: true, M6: true, M7: true };

const META = builtinTable.metaclasses;
// GR15 の D2・D3(GR15 指示書 v15.3 の 3.1 節、設計書 6.2 節の D3 の印の行): 暗黙の特殊化(局所の解決の unknown の 'inherit')は、参照の
// 書かれた区切りの名前が空白(U+0020)か ASCII 以外の文字を含むときは、D3 の印の理由にしない。標準ライブラリの型(Quantities and Units
// のものを除く)のメンバーの名前は、受け継ぐものを含めてすべて空白を含まず ASCII の文字だけからなる(tests/model/run.mjs の 6 章 D1 で、
// 照合用の標準ライブラリのファイルで確かめる。名前はアプリに写さない)。内蔵する表の型(メタクラス・標準ビューの定義・Actions::Action)も
// その標準ライブラリの型なので 'inherit' とする。明示の特殊化・型付けなど(特徴の連鎖、呼び出しの型を含む)の上位の型が未検査のときは、
// 'inherit' でなく 'general' とし、名前によらず印を付ける。それより外側の名前空間でも、その型を受け継ぐかぎり 'general' が伝わる。
// ASCII だけで空白のない名前と、'general'・'import'・'filter' の理由は GR14 の終わりと同じ(印の有無)。D3_ASCII_NAMES が false なら
// GR14 の終わりの判定。D3_SCOPE が false なら P10 の終わり(GR15 の D2)の判定(ASCII 以外の文字を含む名前だけを見て、'general' も
// 'inherit' と同じに扱う)。resolveNames の opts.d3Ascii・opts.d3Scope で 1 回の解決だけ変えられる(検査と全数比較の道具が使う)。
// 名前解決の結果(参照の状態と解決先)はどれでも同じ
export const D3_ASCII_NAMES = true;
// GR15 P13: 既定に入れた(P12 の完了報告の裁定 Q1。tests/edit の E4 の拒否の入力を、D3 の印によらず拒否される操作に替えた)
export const D3_SCOPE = true;
const NON_ASCII = /[^\x00-\x7f]/;
// 入れ子の深さに比例して呼び出しを深くしないための回し方(GR27 の E。src/view/common.js の runNested と同じもの。src/model/ から
// src/view/ を読み込まないよう、ここにも置く)。再帰の関数をジェネレーターにし、子の呼び出しを `yield 子のジェネレーター` と書く(子の戻り値は
// yield の値)。1 つのループと配列のスタックで回し、子を呼ぶ順・戻り値・副作用の順は、ふつうの再帰と同じ
function runNested(g0) {
  const st = [g0];
  let v;
  while (st.length) {
    const r = st[st.length - 1].next(v);
    if (r.done) { st.pop(); v = r.value; } else { st.push(r.value); v = undefined; }
  }
  return v;
}
const NOT_LIBRARY_NAME = /[ \u0080-\uffff]/;
const ancestorsCache = new Map();
function ancestors(kind) {
  let a = ancestorsCache.get(kind);
  if (a) return a;
  a = new Set([kind]);
  for (const g of META[kind]?.general ?? []) for (const x of ancestors(g)) a.add(x);
  ancestorsCache.set(kind, a);
  return a;
}
export const conforms = (kind, metaclass) => ancestors(kind).has(metaclass);

// ---- 内蔵する表から作る、ライブラリの要素(すべて中身の一部だけを知っている。表にない名前は未検査)
function makeBuiltins() {
  const mk = (kind, name, qname, extra = {}) => ({ builtin: true, kind, name, shortName: extra.shortName, qname, members: [], general: [], partial: true, ...extra });
  const entry = (elem) => ({ elem, names: [elem.name, elem.shortName], vis: 'public' });
  const global = [];
  const byQname = new Map();
  const add = (e) => { byQname.set(e.qname, e); return e; };
  const pk = Object.fromEntries(builtinTable.packages.map(p => [p.name, p]));
  // KerML(KerML 9.2.17): 下位のパッケージ Root・Core・Kernel と、そのすべての要素を最上位にも import する
  const kerml = add(mk('LibraryPackage', 'KerML', 'KerML'));
  const subs = {};
  for (const s of pk.KerML.subpackages) { subs[s] = add(mk('Package', s, `KerML::${s}`)); kerml.members.push(entry(subs[s])); }
  const sysml = add(mk('LibraryPackage', 'SysML', 'SysML'));
  const metaObj = {};
  for (const [name, m] of Object.entries(META)) {
    const kinds = pk[m.lang].memberKinds;
    const kind = m.enum ? kinds.enum : kinds.metaclass;
    const o = add(mk(kind, name, m.lang === 'KerML' ? `${m.package}::${name}` : `SysML::${name}`, { metaclass: name }));
    metaObj[name] = o;
    if (m.lang === 'KerML') { subs[m.package.split('::')[1]].members.push(entry(o)); kerml.members.push(entry(o)); sysml.members.push(entry(o)); }
    else sysml.members.push(entry(o));
  }
  for (const o of Object.values(metaObj)) o.general = (META[o.metaclass].general).map(g => metaObj[g]);
  const views = add(mk('LibraryPackage', 'StandardViewDefinitions', 'StandardViewDefinitions'));
  const viewObj = {};
  for (const v of builtinTable.views) { viewObj[v.name] = add(mk(v.kind, v.name, `StandardViewDefinitions::${v.name}`, { shortName: v.shortName })); views.members.push(entry(viewObj[v.name])); }
  for (const v of builtinTable.views) viewObj[v.name].general = v.general.map(g => viewObj[g]);
  const actions = add(mk('LibraryPackage', 'Actions', 'Actions'));
  const ad = builtinTable.actionDefinition;
  const action = add(mk(ad.kind, ad.name, `Actions::${ad.name}`));
  actions.members.push(entry(action));
  const actionFeatures = builtinTable.actionFeatures.map(f => add(mk('Feature', f.name, `${f.owner}::${f.name}`)));
  for (const f of actionFeatures) action.members.push(entry(f));
  for (const p of [kerml, sysml, views, actions]) global.push(entry(p));
  const inheritsActionFeatures = builtinTable.actionFeaturesInheritedBy.map(x => x.metaclass);
  return { global, byQname, actionFeatures, inheritsActionFeatures, metaObj };
}
let BUILTINS = null;

// ---- 索引(GR17 の L)。内蔵する表の項目と、同じ修飾名の索引の要素を結ぶ(twin・builtinTwin)。1 回だけ作る
let LIBRARY = null;
function libraryWith(B) {
  if (LIBRARY) return LIBRARY;
  const lib = makeLibrary(conforms);
  for (const [q, b] of B.byQname) {
    const l = lib.byQname.get(q);
    if (l) { b.twin = l; l.builtinTwin = b; }
  }
  // start・done は Actions::Action の中の要素(内蔵する表の qname は Actions::Action::start の形)
  // 大域の名前空間: 内蔵する表のパッケージと、それと同じ名前でない索引の最上位のパッケージ
  const global = [...B.global];
  for (const r of lib.roots) if (!r.builtinTwin) global.push({ elem: r, names: [r.name ?? null, r.shortName ?? null], vis: 'public' });
  // 暗黙の特殊化の相手: メタクラス → 修飾名(仕様書本文の制約)。種類ごとに、最も近い上位の種類の制約を使う
  const rule = ([mc, q, , cond]) => ({ mc, el: B.byQname.get(q) ?? lib.byQname.get(q) ?? null, q, cond: cond ?? null, d: 0 });
  const rules = lib.implicit.filter(x => !x[3]).map(rule);
  // 条件のある制約は、種類の近い順(同じ近さなら本文の順)に並べる
  const conditional = lib.implicit.filter(x => x[3]).map(rule);
  LIBRARY = { ...lib, global, rules, conditional, implicitByKind: new Map() };
  return LIBRARY;
}

// 参照の属性のうち、特殊化で上位の型を指すもの(KerML 8.3.3.1.10 の supertypes が使う general)
const GENERAL_PROP = {
  FeatureTyping: 'type', Subclassification: 'superclassifier', Subsetting: 'subsettedFeature', Redefinition: 'redefinedFeature',
  ReferenceSubsetting: 'referencedFeature', CrossSubsetting: 'crossedFeature', Specialization: 'general',
  ConjugatedPortTyping: 'originalPortDefinition', Conjugation: 'originalType',
};
// 最も近い種類の属性を使う(ConjugatedPortTyping は FeatureTyping より先)
const generalPropCache = new Map();
const generalPropOf = (kind) => {
  if (generalPropCache.has(kind)) return generalPropCache.get(kind);
  let best = null, depth = Infinity;
  for (const [k, p] of Object.entries(GENERAL_PROP)) {
    if (!conforms(kind, k)) continue;
    const d = distance(kind, k);
    if (d < depth) { depth = d; best = p; }
  }
  generalPropCache.set(kind, best);
  return best;
};
function distance(kind, target) {
  if (kind === target) return 0;
  let best = Infinity;
  for (const g of META[kind]?.general ?? []) best = Math.min(best, 1 + distance(g, target));
  return best;
}

// 文脈で期待される種類(抽象構文の属性の型。KerML 8.3・SysML 8.3)。照合の印(kindMismatch)にだけ使う
const EXPECTED = {
  type: 'Type', superclassifier: 'Classifier', subsettedFeature: 'Feature', redefinedFeature: 'Feature', referencedFeature: 'Feature',
  crossedFeature: 'Feature', general: 'Type', originalPortDefinition: 'PortDefinition', originalType: 'Type',
  chainingFeature: 'Feature', importedNamespace: 'Namespace', memberFeature: 'Feature',
};

export function resolveNames(tree, text, opts = {}) {
  return resolveForest([tree], text, opts);
}

// GR20 の M(設計書 6.2 節の「複数のファイル」と「$::A」の行、9.4 節): 複数のファイルの構文木 roots を 1 つのモデルとして解く。
// 各ファイルの構文木の根を、そのファイルの根の名前空間とする。要素の原文の範囲は、ファイルをつないだ 1 つのテキスト text の中の範囲に
// ずらしてあること(src/model/files.js の analyzeFiles が作る)。大域の名前空間は、索引と内蔵する表に、ほかのファイルの根の名前空間の
// 見える要素を加えたもの(ある根の名前空間から外へ出た名前は、ほかのファイルの根の名前空間を探す。2 つ以上の根の名前空間(別々の要素)に
// 当たれば曖昧。GR18 の M7 と同じ)。$::A は、参照のあるファイルの根の名前空間を先に探す。
// opts.forestTop を渡すと、model.parentNamespaceOf は、ファイルの根の名前空間の代わりにそれを返す(図からの編集が、全ファイルの
// 最上位の要素をまとめた仮の根(src/model/files.js)を根の名前空間として扱うため)。roots が 1 つなら resolveNames と同じ
export function resolveForest(roots, text, opts = {}) {
  const tree = roots[0];
  const FOREST = roots.length > 1;
  const ROOTSET = new Set(roots);
  BUILTINS ??= makeBuiltins();
  const B = BUILTINS;
  // 索引(GR17 の L)。L が null なら索引を使わない
  // 利用者のモデルが最上位に標準ライブラリのパッケージ(standard library package)を宣言しているとき(標準ライブラリのファイル自身を
  // 解析するとき。利用者のパッケージには standard を付けない)は、索引を使わない(索引の要素とモデルの要素が二重になるため。索引を
  // 入れる前と同じ扱い)
  const selfLibrary = () => roots.some(t => t.owned.some(c => { const pk = conforms(c.kind, 'OwningMembership') ? c.related[0] : null; return !!pk && conforms(pk.kind, 'LibraryPackage') && pk.attrs.isStandard === true; }));
  const L0 = (opts.libraryIndex ?? LIBRARY_INDEX) ? libraryWith(B) : null;
  const L = L0 && !selfLibrary() ? L0 : null;
  // 道具(tools/model/build_library_table.mjs)だけが使う: 索引の中のすべての参照を、利用者の参照と同じ手順(解き直しを含む)で解く
  const libAll = !!(L && opts.libraryAll);
  // 内蔵する表の項目(索引の要素でない builtin)
  const pureB = (e) => !!e && e.builtin === true && !e.lib;
  // 内蔵する表の項目と同じ修飾名の索引の要素(索引を使うときだけ)
  const twinOf = (e) => (L && pureB(e) ? e.twin ?? null : null);
  // 索引の要素が内蔵する表の項目と同じ修飾名なら、内蔵する表の項目に読み替える
  const canon = (e) => (L && e?.lib && e.builtinTwin ? e.builtinTwin : e);
  // 内蔵する start・done(GR17 の L で、これを再定義する索引の特徴より先に当てる)
  const BUILTIN_FEATURES = new Set(B.actionFeatures);
  // 配列 a の後ろに b を足す(大きな配列を引数に展開しない)
  const pushAll = (a, b) => { for (const x of b) a.push(x); };
  // 索引の要素の項目の重複を除く(同じ項目の物は 1 つ。利用者のモデルの要素の項目はそのまま残す)
  const dedupeLib = (entries) => {
    const seen = new Set();
    return entries.filter(en => { const el = en.elem; if (!el?.lib && !(en.elemOf?.lib)) return true; if (seen.has(en)) return false; seen.add(en); return true; });
  };
  // 内蔵する表の項目 b のメンバーに、同じ修飾名の索引の要素のメンバー entries を足すときの、足すもの(b のメンバーと同じ名前・
  // 同じ要素のものは足さない。内蔵する表の項目を先に当てる)
  const twinExtra = (b, entries) => {
    const taken = new Set(), els = new Set();
    for (const en of b.members) { els.add(en.elem); for (const n of en.names) if (n != null) taken.add(n); }
    return entries.filter(en => {
      if (en.elem && els.has(en.elem)) return false;
      const ns = en.names ?? (en.elem ? [en.elem.name ?? null, en.elem.shortName ?? null] : [null, null]);
      return !ns.some(n => n != null && taken.has(n));
    });
  };
  // 要素の暗黙の特殊化の相手。条件が端の特徴の数だけの制約(表の implicit の 4 番目の 'binary'・'ends')は、条件を満たせば、種類の
  // 制約より先に使う(相手が索引にないときは使わない)。端の特徴は、所有する特徴のうち端のもの
  const implicitOfElement = (t) => {
    let ends = null, best = null, bd = Infinity;
    for (const c of L.conditional) {
      if (!c.el || !conforms(t.kind, c.mc)) continue;
      ends ??= (t.owned ?? []).filter(m => conforms(m.kind, 'FeatureMembership') && m.related[0] && isEndFeature(m.related[0])).length;
      const d = distance(t.kind, c.mc);
      if ((c.cond === 'binary' ? ends === 2 : ends > 0) && d < bd) { best = c; bd = d; }
    }
    const u = implicitOf(t.kind);
    // 条件のある制約の種類が、条件のない制約の種類と同じか近いときだけ使う
    if (best && (!u.el || bd <= u.d)) return { el: best.el, missing: false };
    return u;
  };
  // 種類 kind の暗黙の特殊化の相手(GR17 の L)。仕様書本文の制約のうち、kind に最も近い上位の種類(kind 自身を含む)のもの。
  // その相手が索引にない(本文の書き誤りの名前など)ときは、次に近いもので索引にあるものを使い、missing を true にする
  // (暗黙の特殊化を未検査の理由に残す)。→ { el, missing }
  const implicitOf = (kind) => {
    let r = L.implicitByKind.get(kind);
    if (r) return r;
    const cands = L.rules.filter(x => conforms(kind, x.mc)).map(x => ({ ...x, d: distance(kind, x.mc) })).sort((a, b) => a.d - b.d);
    const hit = cands.find(x => x.el);
    r = { el: hit?.el ?? null, missing: !hit || cands[0].el === null, d: hit ? hit.d : Infinity };
    L.implicitByKind.set(kind, r);
    return r;
  };

  // ---- 構造: 親(構文木の上で直接含む要素。索引の節点は libParent)
  const pmap = new Map();
  const parent = { get: (e) => (pmap.has(e) ? pmap.get(e) : e?.libParent ?? undefined), set: (e, p) => pmap.set(e, p) };
  const allNodes = [];
  for (const t of roots) walkTree(t, (e, p) => { parent.set(e, p); allNodes.push(e); });
  // 要素のあるファイルの根の名前空間(1 ファイルなら tree)
  const rootOf = (e) => { if (!FOREST) return tree; let x = e; while (parent.get(x)) x = parent.get(x); return ROOTSET.has(x) ? x : tree; };
  const isNS = (e) => e && (e.lib ? conforms(e.kind, 'Namespace') : e.builtin ? true : e.virtual ? true : conforms(e.kind, 'Namespace'));
  // 最も近い外側の名前空間(関係の要素は飛ばす)。パイロット実装の NamespaceUtil.getParentNamespaceOf と同じ
  const parentNS = (e) => { let p = parent.get(e); while (p && !conforms(p.kind, 'Namespace')) p = parent.get(p); return p ?? null; };
  const owningRel = (e) => parent.get(e) ?? null;

  // ---- 字句と、参照の範囲
  const lexer = makeLexer({ keywords: grammar.keywords, symbols: grammar.symbols });
  const lx = lexer(text);
  const toks = lx.ok ? lx.tokens : [];
  const firstTokAt = (pos) => { let lo = 0, hi = toks.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[m].start < pos) lo = m + 1; else hi = m; } return lo; };

  const refs = [];
  for (const node of allNodes) {
    const entries = Object.entries(node.refs);
    if (!entries.length) continue;
    // この要素の範囲の字句のうち、子の要素の範囲にないもの
    const kids = [...node.owned, ...node.related].filter(k => k.end > k.start);
    const own = [];
    for (let i = firstTokAt(node.start); i < toks.length && toks[i].start < node.end; i++) {
      const t = toks[i];
      if (t.kind === 'REGULAR_COMMENT') continue;
      if (kids.some(k => t.start >= k.start && t.end <= k.end)) continue;
      own.push(t);
    }
    let cur = 0;
    // 別名(alias <S> N for X)の参照は、for の後ろから探す(宣言の名前・短い名前の字句を参照の範囲にしない。GR18 の M6)
    if (GR18.M6 && conforms(node.kind, 'Membership') && (node.attrs.memberName !== undefined || node.attrs.memberShortName !== undefined)) {
      const f = own.findIndex(t => t.kind === 'KEYWORD' && t.text === 'for');
      if (f >= 0) cur = f + 1;
    }
    for (const [prop, v] of entries) {
      const list = Array.isArray(v) ? v : [v];
      list.forEach((refText, index) => {
        const rt = lexer(refText);
        const want = rt.ok ? rt.tokens.map(t => t.text) : [];
        let at = -1;
        for (let i = cur; i + want.length <= own.length; i++) {
          let ok = true;
          for (let j = 0; j < want.length; j++) if (own[i + j].text !== want[j]) { ok = false; break; }
          if (ok) { at = i; break; }
        }
        const rec = { node, prop, index: Array.isArray(v) ? index : null, text: refText, start: null, end: null, global: false, conjugated: node.kind === 'ConjugatedPortTyping' && prop === 'originalPortDefinition', segments: [], status: null, target: null, candidates: null, shadow: null, reason: null, kindMismatch: null };
        if (at >= 0) {
          const ts = own.slice(at, at + want.length);
          cur = at + want.length;
          rec.start = ts[0].start; rec.end = ts[ts.length - 1].end;
          let k = 0;
          if (ts[0]?.text === '$') { rec.global = true; k = 2; }
          for (; k < ts.length; k += 2) rec.segments.push({ name: unquote(ts[k].text), start: ts[k].start, end: ts[k].end, target: null });
        } else {
          // 範囲が見つからない(起きないはず。照合で数える)
          rec.rangeMissing = true;
          const parts = (rt.ok ? rt.tokens : []).filter(t => t.text !== '::');
          if (parts[0]?.text === '$') { rec.global = true; parts.shift(); }
          for (const t of parts) rec.segments.push({ name: unquote(t.text), start: null, end: null, target: null });
        }
        refs.push(rec);
      });
    }
  }
  const recOf = new Map(); // node → prop → [rec]
  for (const r of refs) {
    if (!recOf.has(r.node)) recOf.set(r.node, new Map());
    const m = recOf.get(r.node);
    if (!m.has(r.prop)) m.set(r.prop, []);
    m.get(r.prop).push(r);
  }
  // 索引の節点の参照(呼び出しごとに作る。参照の一覧 refs には入れない)
  const libRecs = L ? (L.recs ??= new Map()) : new Map();
  const libRecFor = (node, prop) => {
    let m = libRecs.get(node);
    if (!m) libRecs.set(node, m = new Map());
    if (m.has(prop)) return m.get(prop);
    const names = node.refs[prop];
    const rec = names === undefined ? null : { node, prop, index: null, text: names.join('::'), start: null, end: null, global: false, conjugated: false, segments: names.map(name => ({ name, start: null, end: null, target: null })), status: null, target: null, lib: true };
    // 道具が解いた解決先(src/model/library.js の libPre)。利用者のモデルによらないので、そのまま使う
    if (rec && node.libPre && prop in node.libPre) rec.preRaw = node.libPre[prop];
    m.set(prop, rec);
    return rec;
  };
  const recFor = (node, prop) => (node.lib ? libRecFor(node, prop) : recOf.get(node)?.get(prop)?.[0] ?? null);

  // ---- 循環の見張り。見張りに当たった計算の結果は覚えない(KerML 8.2.3.5.1 の注、kerml10 L5512–L5526)
  // 解いている参照そのものの import(とフィルター条件)は除いて先へ進み、その結果は仮にしない(exclusionHits。除いて計算した
  // 途中の結果は覚えない)。自分以外の解決中の import・条件を除いたときは、見張りと同じく仮にする(guardHits)。
  // GR3 P3 の判断 D と、その修正の裁定(2026-10-22)。パイロット実装 KerMLScope.imp の scopeProvider.visited に当たる。
  let guardHits = 0, exclusionHits = 0;
  const unchanged = (g, x) => guardHits === g && exclusionHits === x;
  const derivedCaches = []; // 解き直しの各回の初めに空にする
  // 索引の要素だけで決まる計算(索引の節点を鍵とする計算と、索引の節点の参照の解決)は、利用者のモデルに触れない(索引の節点の
  // 持ち主・上位の型・import は索引の中か内蔵する表の項目で、大域の名前空間も内蔵する表と索引だけ)。見張りに当たらなかった結果は、
  // 名前解決の呼び出しをまたいで覚える(LIBC。GR17 の L)。結果は、呼び出しごとに求めたものと同じ
  const LIBC = L ? (L.cache ??= { memo: [], rec: new Map(), local: new Map(), visible: new Map() }) : null;
  let memoCount = 0;
  const memo = (fn) => {
    const cache = new Map(), pending = new Set();
    derivedCaches.push(cache);
    const gcache = LIBC ? (LIBC.memo[memoCount] ??= new Map()) : null;
    memoCount++;
    return (key, ...rest) => {
      if (cache.has(key)) return cache.get(key);
      if (gcache && key?.lib && gcache.has(key)) return gcache.get(key);
      if (pending.has(key)) { guardHits++; return undefined; }
      pending.add(key);
      const g = guardHits, x = exclusionHits;
      let v;
      try { v = fn(key, ...rest); } finally { pending.delete(key); }
      if (unchanged(g, x)) { cache.set(key, v); if (gcache && key?.lib) gcache.set(key, v); }
      return v;
    };
  };

  const idOf = (e) => !e ? '' : e.lib ? 'L:' + e.libId : e.builtin ? 'B:' + e.qname : e.virtual ? 'V:' + (e.of.lib ? 'L' + e.of.libId : e.of.start) : `${e.kind}@${e.start}-${e.end}`;

  // ---- 共役ポート定義(構文木にない暗黙の要素。SysML 8.2.2.12 の注 1、sysml20 L11162–L11166)
  const conjCache = new Map();
  const conjugatedOf = (pd) => {
    if (!conjCache.has(pd)) conjCache.set(pd, { virtual: 'ConjugatedPortDefinition', kind: 'ConjugatedPortDefinition', of: pd });
    return conjCache.get(pd);
  };

  // ---- 参照の解決(参照ごとに覚える)
  // 参照の結果は、見張りに当たっていても覚える(パイロット実装と同じく、解決中の関係を除いて先へ進む)。
  // 見張りに当たった結果は「仮」として印を付け、仮の結果を使った計算は覚えない。最後に仮の参照だけを解き直す。
  const recCache = new Map(), recPending = new Set(), recStack = [];
  let stale = null; // 解き直しの途中で、まだ解き直していない仮の参照の集合
  // 道具が解いた索引の参照の解決先(呼び出しごとに読み替える)
  const preCache = new Map();
  const preOf = (rec) => {
    let r = preCache.get(rec);
    if (r) return r;
    const t = rec.preRaw;
    const el = !t ? null : t.lib ? canon(t) : B.byQname.get(t.builtin) ?? null;
    r = el ? { status: 'resolved', target: el, segTargets: [] } : { status: 'unchecked', reason: 'library', segTargets: [] };
    preCache.set(rec, r);
    return r;
  };
  const resultOf = (rec) => {
    if (rec.preRaw !== undefined && !libAll) return preOf(rec);
    let c = recCache.get(rec);
    if (!c && rec.lib && LIBC?.rec.has(rec)) { c = LIBC.rec.get(rec); recCache.set(rec, c); }
    if (c) { if (c.tainted && (stale === null || stale.has(rec))) guardHits++; return c.r; }
    if (recPending.has(rec)) { guardHits++; return { status: 'unchecked', reason: 'cycle' }; }
    recPending.add(rec);
    recStack.push(rec);
    const before = guardHits;
    let r;
    try { r = computeRec(rec); } finally { recPending.delete(rec); recStack.pop(); }
    recCache.set(rec, { r, tainted: guardHits !== before });
    if (rec.lib && LIBC && guardHits === before) LIBC.rec.set(rec, { r, tainted: false });
    return r;
  };
  const targetOf = (node, prop) => { const rec = recFor(node, prop); if (!rec) return null; const r = resultOf(rec); return r.status === 'resolved' ? r.target : null; };

  // ---- 実効の名前(KerML 8.3.3.3.4 Feature の effectiveName・namingFeature、SysML 8.3.6.3・8.3.6.4・8.3.17.14・8.3.20.4)
  const namesOf = memo((e) => {
    if (pureB(e)) return { name: e.name ?? null, shortName: e.shortName ?? null };
    if (e.virtual) { const n = namesOf(e.of); return { name: n?.name != null ? '~' + n.name : null, shortName: null }; }
    if (e.name !== undefined || e.shortName !== undefined) return { name: e.name ?? null, shortName: e.shortName ?? null };
    if (!conforms(e.kind, 'Feature')) return { name: null, shortName: null };
    const nf = namingFeature(e);
    if (!nf) return { name: null, shortName: null };
    return namesOf(nf) ?? { name: null, shortName: null };
  });
  const ownedOfKind = (e, k) => (e.owned ?? []).filter(c => conforms(c.kind, k)); // 内蔵する表の項目は owned を持たない
  const specTarget = (rel) => {
    const prop = generalPropOf(rel.kind);
    if (prop && rel.refs[prop] !== undefined) return targetOf(rel, prop);
    const chain = rel.related.find(x => conforms(x.kind, 'Feature'));
    return chain ?? null;
  };
  const featureTarget = (f) => {
    if (!f || pureB(f) || f.virtual) return f;
    const ch = ownedOfKind(f, 'FeatureChaining');
    if (ch.length) return targetOf(ch[ch.length - 1], 'chainingFeature');
    return f;
  };
  // e が遷移の受け取りの引数なら、引き金の受け取りのアクションの受け取りの引数(なければ null)
  function triggerPayloadOf(e) {
    const tu = parentNS(e);
    if (!conforms(e.kind, 'ReferenceUsage') || !tu || !conforms(tu.kind, 'TransitionUsage')) return null;
    const params = tu.owned.filter(c => conforms(c.kind, 'ParameterMembership') && !conforms(c.kind, 'ReturnParameterMembership')).map(c => c.related[0]);
    if (params[1] !== e) return null;
    const trig = tu.owned.find(c => conforms(c.kind, 'TransitionFeatureMembership') && c.attrs.kind === 'trigger');
    const acc = trig?.related[0];
    return acc ? acc.owned.filter(c => conforms(c.kind, 'ParameterMembership')).map(c => c.related[0])[0] ?? null : null;
  }
  function namingFeature(e) {
    const rel = owningRel(e);
    const refSub = ownedOfKind(e, 'ReferenceSubsetting')[0];
    if (rel && conforms(rel.kind, 'VariantMembership')) return refSub ? specTarget(refSub) : null;
    if (conforms(e.kind, 'PerformActionUsage') && refSub) return specTarget(refSub);
    if (conforms(e.kind, 'ConstraintUsage') && rel && conforms(rel.kind, 'RequirementConstraintMembership') && refSub) return featureTarget(specTarget(refSub));
    // 遷移の受け取りの引数(TransitionUsage の 2 番目の入力の引数)は、引き金の受け取りの引数を naming feature とする
    // (SysML 8.3.6.3 ReferenceUsage の namingFeature、sysml20 L16706–L16714。GR3 P4 の裁定 2)
    const pp = triggerPayloadOf(e);
    if (pp) return pp;
    const redef = ownedOfKind(e, 'Redefinition')[0];
    if (redef) return specTarget(redef);
    // 暗黙の再定義も ownedRedefinition に入る(KerML 8.4.2)
    return (impliedRedefs(e) ?? [])[0] ?? null;
  }

  // ---- 所有の Membership(KerML 8.3.2.4.3・8.3.2.4.8)
  const ownedEntries = memo((n) => {
    if (pureB(n)) return n.members;
    if (n.virtual) return [];
    const out = [];
    for (const c of n.owned) {
      if (conforms(c.kind, 'OwningMembership')) {
        const elem = canon(c.related[0]);
        if (elem) out.push({ elem, names: null, vis: c.attrs.visibility ?? 'public', mem: c });
      } else if (conforms(c.kind, 'Membership') && (c.attrs.memberName !== undefined || c.attrs.memberShortName !== undefined)) {
        // 別名(KerML 8.2.3.4.1 AliasMember)
        out.push({ elemOf: c, names: [c.attrs.memberName ?? null, c.attrs.memberShortName ?? null], vis: c.attrs.visibility ?? 'public', mem: c });
      }
    }
    if (conforms(n.kind, 'PortDefinition') && !conforms(n.kind, 'ConjugatedPortDefinition')) out.push({ elem: conjugatedOf(n), names: null, vis: 'public', mem: null });
    return out;
  });
  const entryNames = (en) => {
    if (en.names) return en.names;
    const n = namesOf(en.elem);
    return n ? [n.name, n.shortName] : [null, null];
  };
  const entryElem = (en) => en.elem ?? (en.elemOf ? canon(targetOf(en.elemOf, 'memberElement')) : null);
  const matches = (en, name) => { const ns = entryNames(en); return ns[0] === name || ns[1] === name; };

  // ---- フィルターの条件(裁定 D8: @種類名 と and だけを評価する)
  // 戻り値 true・false・null(評価できない)
  function evalCond(expr, elem) {
    if (!expr || elem == null) return null;
    if (conforms(expr.kind, 'OperatorExpression')) {
      const op = expr.attrs.operator;
      const params = expr.owned.filter(c => conforms(c.kind, 'ParameterMembership') && !conforms(c.kind, 'ReturnParameterMembership')).map(c => c.related[0]);
      if (op === '@' && params.length === 1) {
        const typing = params[0] && ownedOfKind(params[0], 'FeatureTyping')[0];
        // 条件の中の名前を解いている途中なら、その条件は評価しない(SysML 7.5.4、sysml20 L2678–L2680)
        const tr = typing ? recFor(typing, 'type') : null;
        if (tr && recPending.has(tr)) { if (recStack[recStack.length - 1] === tr) exclusionHits++; else guardHits++; return null; }
        const t = typing ? targetOf(typing, 'type') : null;
        if (!t) return null;
        if (t.builtin && t.metaclass) return elem.builtin ? null : conforms(elem.kind, t.metaclass);
        if (!t.builtin && conforms(t.kind, 'MetadataDefinition')) {
          if (elem.builtin || elem.virtual) return null;
          // 要素が所有するメタデータ(MetadataUsage)の型が t か、その下位
          for (const c of elem.owned) for (const m of c.related) {
            if (!conforms(m.kind, 'MetadataUsage')) continue;
            for (const ty of ownedOfKind(m, 'FeatureTyping')) { const mt = targetOf(ty, 'type'); if (mt && (mt === t || specializes(mt, t))) return true; }
          }
          return false;
        }
        return null;
      }
      if (op === 'and' && params.length === 2) {
        const a = evalCond(valueExpr(params[0]), elem);
        const b = evalCond(valueExpr(params[1]), elem);
        if (a === false || b === false) return false;
        if (a === true && b === true) return true;
        return null;
      }
      return null;
    }
    if (conforms(expr.kind, 'FeatureReferenceExpression')) {
      // and の 2 番目の被演算子(本体の式。KerML 8.2.5.8.1 の BodyExpression)
      const fm = expr.owned.find(c => conforms(c.kind, 'FeatureMembership') && !conforms(c.kind, 'ReturnParameterMembership'));
      const inner = fm?.related[0];
      if (inner && conforms(inner.kind, 'Expression')) return evalCond(inner, elem);
      return null;
    }
    return null;
  }
  // 引数の特徴の値の式
  function valueExpr(f) {
    if (!f) return null;
    if (conforms(f.kind, 'Expression')) return f;
    const fv = f.owned.find(c => conforms(c.kind, 'FeatureValue'));
    return fv?.related[0] ?? null;
  }
  const filterConditions = (n) => (n.builtin || n.virtual) ? [] : n.owned.filter(c => conforms(c.kind, 'ElementFilterMembership')).map(c => c.related[0]);

  // ---- import(KerML 8.3.2.4.4・8.3.2.4.6、8.3.4.13.4 Package::importedMemberships)
  // 戻り値 { entries, unknown: [理由] }
  // importedBy と visibleEntries は互いに呼ぶ(再帰の import と、入れ子の名前空間の import)。入れ子の深さに比例して呼び出しを深くしないよう、
  // どちらもジェネレーター(importedByG・visibleEntriesG)にし、互いの呼び出しを yield で書いて runNested の 1 つのループで回す
  // (呼ぶ順・戻り値・副作用の順は前の再帰と同じ。GR27 の E。設計書 2.6 節)。外から呼ぶときは、今までの名前の関数を使う
  function importedBy(imp, excluded) { return runNested(importedByG(imp, excluded)); }
  function* importedByG(imp, excluded) {
    // 解決中の import(自身か、それを求めている途中の import)は除く
    const ir = recFor(imp, conforms(imp.kind, 'MembershipImport') ? 'importedMembership' : 'importedNamespace');
    if (ir && recPending.has(ir)) { if (recStack[recStack.length - 1] === ir) exclusionHits++; else guardHits++; return { entries: [], unknown: [] }; }
    const owner = parent.get(imp);
    const all = imp.attrs.isImportAll === true || conforms(imp.kind, 'Expose') || (parent.get(owner) && conforms(parent.get(owner).kind, 'Import') && parent.get(owner).attrs.isImportAll === true);
    const rec = imp.attrs.isRecursive === true;
    let res;
    if (conforms(imp.kind, 'NamespaceImport')) {
      const fp = imp.related.find(x => conforms(x.kind, 'Package'));
      const ns = fp ?? targetOf(imp, 'importedNamespace');
      if (!ns || !isNS(ns)) res = { entries: [], unknown: ['import'] };
      else if (excluded.has(ns)) res = { entries: [], unknown: [] };
      else res = yield visibleEntriesG(ns, excluded, rec, all, true);
    } else if (conforms(imp.kind, 'MembershipImport')) {
      const r = recFor(imp, 'importedMembership');
      const got = r ? resultOf(r) : null;
      // 道具が解いた解決先(索引の import)は Membership を持たないので、要素から項目を作る
      const gotEntry = got?.status === 'resolved' ? (got.entry ?? (got.target && imp.lib ? { elem: got.target, names: null, vis: 'public' } : null)) : null;
      if (!got || got.status !== 'resolved' || !gotEntry) res = { entries: [], unknown: ['import'] };
      else {
        res = { entries: [gotEntry], unknown: [] };
        const el = got.target;
        if (rec && isNS(el) && !excluded.has(el)) {
          const v = yield visibleEntriesG(el, excluded, true, all, true);
          res = { entries: [gotEntry, ...v.entries], unknown: v.unknown };
        }
      }
    } else res = { entries: [], unknown: ['import'] };
    // パッケージのフィルターの条件(filter と、フィルター付きの import の [ ])
    const conds = owner && conforms(owner.kind, 'Package') ? filterConditions(owner) : [];
    if (conds.length) {
      const kept = [];
      let unknown = false;
      for (const en of res.entries) {
        const el = entryElem(en);
        const vals = conds.map(c => evalCond(c, el));
        if (vals.some(v => v === false)) continue;
        if (vals.every(v => v === true)) kept.push(en); else unknown = true;
      }
      res = { entries: kept, unknown: unknown ? [...res.unknown, 'filter'] : res.unknown };
    }
    return res;
  }

  // 見える Membership(KerML 8.3.2.4.5 visibleMemberships、8.3.3.1.10 Type::visibleMemberships)
  const visibleCache = new Map();
  derivedCaches.push(visibleCache);
  // forImport が true なら import で取り込むメンバーの列挙: 利用者のモデルの型が索引の型から受け継いだメンバーは入れない(GR17 の L。
  // 再帰の import が、入れ子の型ごとに標準ライブラリの同じメンバーを集めて大きく遅くなるのを防ぐ。名前で探すとき(局所の解決・
  // 見える解決)は入れる。索引を使わないときは今のまま)
  function visibleEntries(ns, excluded, recursive, includeAll, forImport = false) { return runNested(visibleEntriesG(ns, excluded, recursive, includeAll, forImport)); }
  function* visibleEntriesG(ns, excluded, recursive, includeAll, forImport = false) {
    forImport = forImport && !!L;
    const key = excluded.size === 0 ? `${recursive}|${includeAll}${forImport ? '|i' : ''}` : null;
    if (key) { const c = visibleCache.get(ns)?.get(key) ?? (ns.lib && LIBC ? LIBC.visible.get(ns)?.get(key) : undefined); if (c) return c; }
    // 索引の名前空間は、除く名前空間がすべて利用者のモデルの要素なら、除くものがないときと同じ結果になる(索引の中をたどるときに、
    // 利用者のモデルの要素には当たらない)ので、その結果を使う(GR17 の L)
    const libKey = !key && ns.lib && LIBC && [...excluded].every(e => !e.lib && !e.builtin) ? `${recursive}|${includeAll}${forImport ? '|i' : ''}` : null;
    if (libKey) { const c = LIBC.visible.get(ns)?.get(libKey); if (c) return c; }
    const g0 = guardHits, x0 = exclusionHits;
    const ex2 = new Set(excluded); ex2.add(ns);
    const unknown = [];
    let entries = [];
    if (pureB(ns)) {
      entries = [...ns.members];
      const tw = twinOf(ns);
      if (tw) { const r = yield visibleEntriesG(tw, ex2, recursive, includeAll, forImport); pushAll(entries, twinExtra(ns, r.entries)); unknown.push(...r.unknown); }
      else if (ns.partial) unknown.push('import');
    }
    else if (ns.virtual) { const h = inheritedEntries(ns) ?? { entries: [], unknown: ['inherit'] }; entries = h.entries; unknown.push(...h.unknown); }
    else {
      for (const en of ownedEntries(ns) ?? []) if (includeAll || en.vis === 'public') entries.push(en);
      // 所有する Membership と区別できない取り込みは除く(KerML 1.0 8.3.2.4.5 importedMemberships。局所の解決 local() と同じ扱いで、
      // 名前か短い名前が、所有する Membership(可視性によらない)の名前か短い名前と同じものを除く。GR18 の M1)
      const ownNames = GR18.M1 ? new Set() : null;
      if (ownNames) for (const en of ownedEntries(ns) ?? []) for (const x of entryNames(en)) if (x != null) ownNames.add(x);
      const clashes = (en) => !!ownNames?.size && entryNames(en).some(x => x != null && ownNames.has(x));
      for (const imp of (GR18.M3 ? importsOf(ns) : ns.owned)) {
        if (!conforms(imp.kind, 'Import')) continue;
        if (!(includeAll || (imp.attrs.visibility ?? 'private') === 'public')) continue;
        const r = yield importedByG(imp, ex2);
        pushAll(entries, ownNames?.size ? r.entries.filter(en => !clashes(en)) : r.entries); unknown.push(...r.unknown);
      }
      if (conforms(ns.kind, 'Type')) {
        const h = (forImport && userNS(ns) ? inheritedUserEntries(ns) : inheritedEntries(ns)) ?? { entries: [], unknown: ['inherit'] };
        for (const en of h.entries) if (includeAll || en.vis === 'public') entries.push(en);
        unknown.push(...h.unknown);
      }
      if (recursive) {
        for (const en of ownedEntries(ns) ?? []) {
          const el = en.elem;
          if (!el || !(includeAll || en.vis === 'public') || !isNS(el) || el.virtual || ex2.has(el)) continue;
          const r = yield visibleEntriesG(el, ex2, true, includeAll, forImport);
          pushAll(entries, r.entries); unknown.push(...r.unknown);
        }
      }
      // 索引の要素の項目は、同じ項目を 2 回入れない(GR17 の L。再帰の import が、入れ子の名前空間ごとに標準ライブラリから受け継いだ
      // 同じ項目を集めて大きくなるのを防ぐ。利用者のモデルの要素の項目は今のまま)
      if (L) entries = dedupeLib(entries);
    }
    const res = { entries, unknown: [...new Set(unknown)] };
    if (key && unchanged(g0, x0)) {
      if (!visibleCache.has(ns)) visibleCache.set(ns, new Map());
      visibleCache.get(ns).set(key, res);
      if (ns.lib && LIBC) { if (!LIBC.visible.has(ns)) LIBC.visible.set(ns, new Map()); LIBC.visible.get(ns).set(key, res); }
    } else if (libKey && unchanged(g0, x0)) { if (!LIBC.visible.has(ns)) LIBC.visible.set(ns, new Map()); LIBC.visible.get(ns).set(libKey, res); }
    return res;
  }

  // ---- 継承(KerML 8.3.3.1.10 inheritedMemberships・removeRedefinedFeatures)
  const generalsOf = memo((t) => {
    if (pureB(t)) { const tw = twinOf(t); return tw ? generalsOf(tw) : { types: t.general ?? [], unknown: ['inherit'] }; }
    if (t.virtual) return { types: [t.of], unknown: [] };
    const types = [];
    let unknown = ['inherit']; // すべての型は Base::Anything を暗黙に特殊化する(KerML 8.3.3.1.10 checkTypeSpecialization)
    for (const c of t.owned) {
      if (!(conforms(c.kind, 'Specialization') || conforms(c.kind, 'Conjugation'))) continue;
      const g = specTarget(c);
      if (!g) { unknown.push('general'); continue; } // 明示の上位の型が未検査(GR15 の D3。下の D3_ASCII_NAMES)
      types.push(g);
    }
    // 特徴の連鎖は、最後の連鎖の特徴を受け継ぐ(パイロット実装 TypeUtil.getGeneralTypesOf と同じ)
    const ch = ownedOfKind(t, 'FeatureChaining');
    if (ch.length) { const last = targetOf(ch[ch.length - 1], 'chainingFeature'); if (last) types.push(last); else unknown.push('general'); }
    // 遷移の受け取りの引数は、引き金の受け取りの引数を部分集合にする(checkTransitionUsagePayloadSpecialization、
    // SysML 8.3.18.9、sysml20 L21270。GR3 P4 の 2 回目の裁定 1)。連鎖 triggerAction.payload の最後の特徴を上位の型とする
    { const pp = triggerPayloadOf(t); if (pp && !types.includes(pp)) types.push(pp); }
    // 暗黙の再定義も上位の型になる(KerML 8.4.2。GR3 P4 の裁定 2、U2)
    for (const g of impliedRedefs(t) ?? []) if (!types.includes(g)) types.push(g);
    // 呼び出しの型(GR3 P4 の裁定 2):
    //   checkInvocationExpressionSpecialization(kerml10 L13321): InvocationExpression は instantiatedType を特殊化する
    //   checkConstructorExpressionResultSpecialization(kerml10 L12869): ConstructorExpression の結果は instantiatedType を特殊化する
    if (conforms(t.kind, 'InvocationExpression')) { const it = instantiatedTypeOf(t) ?? operatorFunctionOf(t); if (!it) unknown.push('general'); else if (!types.includes(it)) types.push(it); }
    const ce = parentNS(t);
    if (ce && conforms(ce.kind, 'ConstructorExpression') && isResult(t)) { const it = instantiatedTypeOf(ce); if (!it) unknown.push('general'); else if (!types.includes(it)) types.push(it); }
    // 暗黙の特殊化の相手(GR17 の L。仕様書本文の check〜Specialization)。求まれば、暗黙の特殊化を D3 の印・未検査の理由にしない
    if (L) {
      const imp = implicitOfElement(t);
      const ie = canon(imp.el);
      // 自分自身(内蔵する表の項目と同じ修飾名の索引の要素なら、その項目)は上位の型にしない
      if (ie && ie !== t && ie !== canon(t)) {
        if (!types.includes(ie)) types.push(ie);
        if (!imp.missing) unknown = unknown.filter(x => x !== 'inherit');
      } else if (ie && (ie === t || ie === canon(t))) unknown = unknown.filter(x => x !== 'inherit');
    }
    return { types, unknown };
  });
  // 演算子の式(OperatorExpression)の関数(GR18 の M4)。演算子の式は、演算子の名前の関数を呼び出しの型にする(KerML 1.0 8.3.4.8.6
  // OperatorExpression の instantiatedType。パイロット実装の OperatorExpression の解決と同じく、BaseFunctions・DataFunctions・
  // ControlFunctions の順に、演算子の名前の関数を索引で探す)。索引を使わないとき、見つからないときは null(今のとおり印の理由にする)
  const OPERATOR_PACKAGES = ['BaseFunctions', 'DataFunctions', 'ControlFunctions'];
  function operatorFunctionOf(t) {
    if (!GR18.M4 || !L || !conforms(t.kind, 'OperatorExpression') || typeof t.attrs.operator !== 'string') return null;
    for (const pk of OPERATOR_PACKAGES) { const f = L.byQname.get(`${pk}::${t.attrs.operator}`); if (f && conforms(f.kind, 'Function')) return canon(f); }
    return null;
  }
  // 呼び出しの式の instantiatedType(InstantiatedTypeMember の memberElement。KerML 8.2.5.8.3、kerml10 L6667–L6672)
  function instantiatedTypeOf(ie) {
    const m = ie.owned.find(c => conforms(c.kind, 'Membership') && !conforms(c.kind, 'FeatureMembership'));
    if (!m) return null;
    if (m.refs.memberElement !== undefined) return targetOf(m, 'memberElement');
    const chain = m.related.find(x => conforms(x.kind, 'Feature'));
    return chain ? featureTarget(chain) : null;
  }
  // 暗黙の再定義(KerML 8.4.2 の再定義の制約のうち、利用者のモデルの特徴どうしのもの。KerML 8.3.3.3.4 Feature):
  //   checkFeatureEndRedefinition(kerml10 L10550): 端の特徴は、所有する型の各直接の上位の型の、同じ位置の端の特徴を再定義する
  //   checkFeatureParameterRedefinition(kerml10 L10662): Behavior・Step の引数(結果を除く)は、上位の Behavior・Step の同じ位置の引数を再定義する
//     (上位の型の引数は受け継いだものを含む。GR5 P3 の裁定 Q8・Q9)
  //   checkFeatureResultRedefinition(kerml10 L10714): Function・Expression の結果の引数は、上位の Function・Expression の結果の引数を再定義する
  const ownedFeaturesOf = (t) => t.builtin || t.virtual ? [] : t.owned.filter(c => conforms(c.kind, 'FeatureMembership')).map(c => c.related[0]).filter(Boolean);
  const isResult = (f) => owningRel(f) && conforms(owningRel(f).kind, 'ReturnParameterMembership');
  const endsOf = (t) => ownedFeaturesOf(t).filter(isEndFeature);
  // 引数(KerML 8.3.4.6.2 Behavior::parameter、8.3.4.6.3 Step::parameter: 向きのある特徴)。ParameterMembership で所有される
  // 特徴は、向きを書かなくても parameterDirection() の向きを持つ(validateParameterMembershipParameterDirection、kerml10 L12171〜。
  // subject・actor など)。GR5 P3 の裁定 Q8 で足した
  const isParam = (f) => f.attrs.direction !== undefined || (owningRel(f) && conforms(owningRel(f).kind, 'ParameterMembership'));
  const paramsOf = (t) => ownedFeaturesOf(t).filter(f => isParam(f) && !isResult(f));
  // 上位の型の引数: 所有するものと、受け継いだもの(再定義されたものを除く)。checkFeatureParameterRedefinition の説明の
  // 「the parameter at the same position」(kerml10 L10668–L10670)と parameter の定義(L12054–L12057)による。式(L10672〜)は
  // 所有する特徴だけで書いた簡略と読む(GR5 P3 の裁定 Q9)。特徴の連鎖は、連鎖の先から受け継いだ引数を持つ
  const allParamsOf = (t) => {
    const own = paramsOf(t);
    const h = inheritedEntries(t) ?? { entries: [] };
    const inh = [];
    for (const en of h.entries) {
      const e = entryElem(en);
      if (!e || e.builtin || e.virtual || !conforms(e.kind, 'Feature') || own.includes(e) || inh.includes(e)) continue;
      const rel = owningRel(e);
      if (!rel || !conforms(rel.kind, 'FeatureMembership') || !isParam(e) || isResult(e)) continue;
      inh.push(e);
    }
    return [...own, ...inh];
  };
  // 上位の型が Behavior・Step か。特徴の連鎖なら、連鎖の先(featureTarget)の種類で決める
  const behaviorOrStep = (S) => {
    const k = ownedOfKind(S, 'FeatureChaining').length ? featureTarget(S) : S;
    return !!k && !k.builtin && !k.virtual && (conforms(k.kind, 'Behavior') || conforms(k.kind, 'Step'));
  };
  const resultOf_ = (t, seen = new Set()) => {
    if (!t || t.builtin || t.virtual || seen.has(t)) return null;
    seen.add(t);
    const r = ownedFeaturesOf(t).find(isResult);
    if (r) return r;
    for (const g of generalsOf(t)?.types ?? []) { const x = resultOf_(g, seen); if (x) return x; }
    return null;
  };
  // 入れ子の深い特徴(持ち主の型が DEEP_OWNERS 段以上続くもの)では、持ち主の上位の型を、外側から順に先に求める。generalsOf と
  // impliedRedefs が持ち主をさかのぼって互いに呼ぶ再帰が、入れ子の深さに比例して深くならないようにする(設計書 2.6 節 v18.1。
  // GR18 の B1)。外側から求めるのは、再帰で呼んだときに求め終わる順序と同じ。浅い入れ子(309 ファイルの入れ子はどれもこれより浅い)
  // では何もしない
  const DEEP_OWNERS = 64;
  const warmOwners = (O) => {
    const chain = [];
    for (let x = O; x && conforms(x.kind, 'Type') && !x.builtin && !x.virtual; x = parentNS(x)) chain.push(x);
    if (chain.length < DEEP_OWNERS) return;
    for (let k = chain.length - 1; k > 0; k--) generalsOf(chain[k]);
  };
  const impliedRedefs = memo((f) => {
    const out = [];
    if (f.builtin || f.virtual || !conforms(f.kind, 'Feature')) return out;
    const O = parentNS(f);
    if (!O || !conforms(O.kind, 'Type') || !owningRel(f) || !conforms(owningRel(f).kind, 'FeatureMembership')) return out;
    warmOwners(O);
    const gens = (generalsOf(O)?.types ?? []).filter(g => !g.builtin && !g.virtual);
    if (isEndFeature(f)) {
      const i = endsOf(O).indexOf(f);
      for (const S of gens) { const e = endsOf(S)[i]; if (e) out.push(e); }
    }
    if (isParam(f) && !isResult(f) && (conforms(O.kind, 'Behavior') || conforms(O.kind, 'Step'))
        && !(conforms(O.kind, 'InvocationExpression') && ownedOfKind(f, 'Redefinition').length)) {
      const i = paramsOf(O).indexOf(f);
      for (const S of gens) if (behaviorOrStep(S)) { const p = allParamsOf(S)[i]; if (p && p !== f) out.push(p); }
    }
    if (isResult(f) && (conforms(O.kind, 'Function') || conforms(O.kind, 'Expression'))) {
      for (const S of gens) if (conforms(S.kind, 'Function') || conforms(S.kind, 'Expression')) { const r = resultOf_(S); if (r && r !== f) out.push(r); }
    }
    return out;
  });
  const redefinedBy = (f) => {
    const out = [];
    for (const r of ownedOfKind(f, 'Redefinition')) { const g = specTarget(r); if (g) out.push(g); }
    for (const g of impliedRedefs(f) ?? []) if (!out.includes(g)) out.push(g);
    return out;
  };
  const redefinedClosure = memo((f) => {
    const out = new Set([f]);
    if (pureB(f) || f.virtual) return out;
    for (const g of redefinedBy(f)) if (!out.has(g)) for (const x of redefinedClosure(g) ?? [g]) out.add(x);
    return out;
  });
  // 受け継いだ項目の並び all を、内蔵する start・done の扱い(GR17 の L)と再定義の閉包で整えたもの { list, closures, redefByOthers }
  const libBF = new Map(); // 索引の特徴 → それが再定義する内蔵する start・done(なければ null)
  const builtinFeatureOf = (el) => {
    if (libBF.has(el)) return libBF.get(el);
    const bf = [...(redefinedClosure(el) ?? [])].find(x => BUILTIN_FEATURES.has(x)) ?? null;
    libBF.set(el, bf);
    return bf;
  };
  function combineInherited(all) {
    // 内蔵する start・done を再定義する索引の特徴(States::StateAction::start など)は除き、内蔵する start・done を残す(GR17 の L。
    // 図の開始・終了の節点と意味エラー U6 の判定を、索引を入れる前と同じに保つ)
    if (L) {
      const keep = [];
      for (const en of all) {
        const el = entryElem(en);
        if (el?.lib && conforms(el.kind, 'Feature')) {
          const bf = builtinFeatureOf(el);
          if (bf) { if (!keep.some(k => k.elem === bf) && !all.some(k => k.elem === bf)) keep.push({ elem: bf, names: [bf.name, null], vis: 'public', mem: null }); continue; }
        }
        keep.push(en);
      }
      all = keep;
    }
    const closures = all.map(en => { const el = entryElem(en); return el && !el.virtual && (el.builtin || conforms(el.kind, 'Feature')) ? (redefinedClosure(el) ?? new Set([el])) : new Set(el ? [el] : []); });
    // ほかの受け継いだ要素(自分と違う要素)の再定義の閉包に入る要素(GR17: 2 重の繰り返しを、同じ結果の 1 回のなめにした)
    const redefByOthers = new Set();
    all.forEach((en, j) => { const ej = entryElem(en); for (const x of closures[j]) if (x !== ej) redefByOthers.add(x); });
    return { list: all, closures, redefByOthers };
  }
  // 上位の型から受け継いだ項目を整えたもの(所有する特徴の再定義で除く前)。{ comb, unknown }
  const inheritedCombined = memo((t) => {
    const g = generalsOf(t) ?? { types: [], unknown: ['inherit'] };
    const unknown = [...g.unknown];
    const isAction = !t.builtin && !t.virtual && B.inheritsActionFeatures.some(k => conforms(t.kind, k));
    // 上位の型がすべて索引の要素(か、それを持つ内蔵する表の項目)なら、整えた並びは利用者のモデルによらないので、呼び出しをまたいで
    // 覚える(GR17 の L。結果は下の手順と同じ)
    let comb = null, ckey = null;
    if (LIBC && g.types.length && g.types.every(s => s.lib || twinOf(s))) {
      ckey = g.types.map(idOf).join('|') + (isAction ? '|A' : '');
      const c = (LIBC.comb ??= new Map()).get(ckey);
      if (c) { comb = c; for (const u of c.unknown) unknown.push(u); }
    }
    if (!comb) {
      const g0 = guardHits, x0 = exclusionHits;
      let all = [];
      const libUnknown = [];
      const seen = new Set([t]);
      for (const s of g.types) {
        if (seen.has(s)) continue;
        seen.add(s);
        const r = nonPrivateEntries(s, new Set([t]));
        pushAll(all, r.entries); unknown.push(...r.unknown); libUnknown.push(...r.unknown);
      }
      // start・done(SysML 9.2.10.2.4。ActionDefinition・ActionUsage は Actions::Action を特殊化する)
      if (isAction) for (const f of B.actionFeatures) all.push({ elem: f, names: [f.name, null], vis: 'public', mem: null });
      comb = combineInherited(all);
      if (ckey && unchanged(g0, x0)) {
        const kept0 = comb.list.filter(en => entryElem(en) && !comb.redefByOthers.has(entryElem(en)));
        comb = { ...comb, kept0, unknown: [...new Set(libUnknown)] };
        LIBC.comb.set(ckey, comb);
      }
    }
    return { comb, unknown: [...new Set(unknown)] };
  });
  const inheritedEntries = memo((t) => {
    const ic = inheritedCombined(t);
    if (!ic) return undefined;
    const { comb, unknown } = ic;
    // 再定義された特徴を除く
    const redefByOwned = new Set();
    if (!pureB(t) && !t.virtual) {
      for (const en of ownedEntries(t) ?? []) {
        const el = en.elem;
        if (!el || el.virtual || !conforms(el.kind, 'Feature')) continue;
        for (const x of redefinedBy(el)) redefByOwned.add(x);
      }
    }
    if (!redefByOwned.size && comb.kept0) return { entries: comb.kept0, unknown };
    const kept = [];
    comb.list.forEach((en, i) => {
      const el = entryElem(en);
      if (!el) return;
      if (redefByOwned.size && [...comb.closures[i]].some(x => redefByOwned.has(x))) return;
      if (comb.redefByOthers.has(el)) return;
      kept.push(en);
    });
    return { entries: kept, unknown };
  });
  // 受け継いだメンバーのうち、索引の要素でないもの(GR17 の L。import で取り込むメンバーの列挙が使う)。inheritedEntries の結果から
  // 索引の要素を除いたものと同じ(索引の要素は利用者のモデルの要素を再定義しないので、索引の型を除いて組んでも、ほかの項目は除かれ方が
  // 変わらない。内蔵する start・done は inheritedEntries と同じく残す)
  const inheritedUserEntries = memo((t) => {
    const g = generalsOf(t) ?? { types: [], unknown: ['inherit'] };
    const unknown = [...g.unknown];
    const all = [];
    const seen = new Set([t]);
    for (const s0 of g.types) {
      if (seen.has(s0) || s0.lib || pureB(s0)) continue;
      seen.add(s0);
      // 共役ポート定義(暗黙の要素)は、元のポート定義の受け継がれるメンバーを持つ
      const s = s0.virtual ? s0.of : s0;
      if (!s || s.lib || pureB(s)) continue;
      for (const en of ownedEntries(s) ?? []) if (en.vis !== 'private') all.push(en);
      for (const imp of s.owned) {
        if (!conforms(imp.kind, 'Import') || (imp.attrs.visibility ?? 'private') === 'private') continue;
        const r = importedBy(imp, new Set([s]));
        for (const en of r.entries) if (!entryElem(en)?.lib) all.push(en);
        unknown.push(...r.unknown);
      }
      if (conforms(s.kind, 'Type')) { const h = inheritedUserEntries(s) ?? { entries: [], unknown: ['inherit'] }; pushAll(all, h.entries); unknown.push(...h.unknown); }
    }
    if (!t.builtin && !t.virtual && B.inheritsActionFeatures.some(k => conforms(t.kind, k))) for (const f of B.actionFeatures) all.push({ elem: f, names: [f.name, null], vis: 'public', mem: null });
    const comb = combineInherited(all);
    const redefByOwned = new Set();
    for (const en of ownedEntries(t) ?? []) {
      const el = en.elem;
      if (!el || el.virtual || !conforms(el.kind, 'Feature')) continue;
      for (const x of redefinedBy(el)) redefByOwned.add(x);
    }
    const kept = [];
    comb.list.forEach((en, i) => {
      const el = entryElem(en);
      if (!el || el.lib) return;
      if (redefByOwned.size && [...comb.closures[i]].some(x => redefByOwned.has(x))) return;
      if (comb.redefByOthers.has(el)) return;
      kept.push(en);
    });
    return { entries: kept, unknown: [...new Set(unknown)] };
  });
  // 索引の要素(と、索引の要素を持つ内蔵する表の項目)の結果は、利用者のモデルによらないので、呼び出しをまたいで覚える(GR17 の L)
  function nonPrivateEntries(s, excludedTypes) {
    if (!LIBC || !(s.lib || twinOf(s))) return nonPrivateEntries0(s, excludedTypes);
    const c = (LIBC.npe ??= new Map()).get(s);
    if (c) return c;
    const g = guardHits, x = exclusionHits;
    const r = nonPrivateEntries0(s, excludedTypes);
    if (unchanged(g, x)) LIBC.npe.set(s, r);
    return r;
  }
  function nonPrivateEntries0(s, excludedTypes) {
    if (pureB(s)) {
      const tw = twinOf(s);
      if (!tw) return { entries: [...s.members], unknown: ['inherit'] };
      const r = nonPrivateEntries(tw, excludedTypes);
      return { entries: [...s.members, ...twinExtra(s, r.entries)], unknown: r.unknown };
    }
    if (s.virtual) { const h = inheritedEntries(s); return h ?? { entries: [], unknown: ['inherit'] }; }
    const entries = [];
    const unknown = [];
    for (const en of ownedEntries(s) ?? []) if (en.vis !== 'private') entries.push(en);
    for (const imp of s.owned) {
      if (!conforms(imp.kind, 'Import') || (imp.attrs.visibility ?? 'private') === 'private') continue;
      const r = importedBy(imp, new Set([s]));
      pushAll(entries, r.entries); unknown.push(...r.unknown);
    }
    if (conforms(s.kind, 'Type')) {
      const h = inheritedEntries(s) ?? { entries: [], unknown: ['inherit'] };
      pushAll(entries, h.entries); unknown.push(...h.unknown);
    }
    return { entries, unknown };
  }
  const specializes = (a, b) => {
    const seen = new Set();
    const walk = (x) => { if (x === b) return true; if (!x || seen.has(x)) return false; seen.add(x); return (generalsOf(x)?.types ?? []).some(walk); };
    return walk(a);
  };

  // 所有する項目の名前の索引(GR18 の M3。局所の解決が、名前ごとに所有する項目を全部見ないように)。名前が決まっている項目(別名、
  // 名前か短い名前を宣言した要素、特徴でない要素、内蔵する表の項目)は名前で引き、実効の名前を別の特徴から受け継ぐ項目(名前を
  // 書かない再定義など。名前は解決の途中で決まる)は、今のとおり 1 つずつ確かめる。結果の並びは、所有する項目の並びのまま
  const ownedNameIndex = memo((n) => {
    const by = new Map(), dyn = [];
    (ownedEntries(n) ?? []).forEach((en, i) => {
      const e = en.elem;
      const fixed = !!en.names || !e || pureB(e) || e.virtual || e.name !== undefined || e.shortName !== undefined || !conforms(e.kind, 'Feature');
      if (!fixed) { dyn.push(i); return; }
      for (const x of entryNames(en)) if (x != null) { let l = by.get(x); if (!l) by.set(x, l = []); if (l[l.length - 1] !== i) l.push(i); }
    });
    return { by, dyn };
  });
  // 名前空間が所有する import の並び(GR18 の M3。名前ごとに所有する関係を全部見ないように)
  const importsCache = new Map();
  const importsOf = (n) => { let r = importsCache.get(n); if (!r) importsCache.set(n, r = n.owned.filter(c => conforms(c.kind, 'Import'))); return r; };
  function ownedMatching(n, name) {
    const all = ownedEntries(n) ?? [];
    const ix = ownedNameIndex(n);
    if (!ix) return all.filter(en => matches(en, name));
    // 実効の名前を受け継ぐ項目は、名前が決まったら(namesOf の結果が覚えられたら。memo と同じ判定)名前の索引に移す。
    // 求める名前は、前のとおり項目ごとに matches で求めるものと同じ
    if (ix.dyn.length) {
      const still = [], moved = new Set();
      for (const i of ix.dyn) {
        const g1 = guardHits, x1 = exclusionHits;
        const ns = entryNames(all[i]);
        if (!unchanged(g1, x1)) { still.push(i); continue; }
        for (const x of ns) if (x != null) { let l = ix.by.get(x); if (!l) ix.by.set(x, l = []); if (!l.includes(i)) { l.push(i); moved.add(l); } }
      }
      for (const l of moved) l.sort((a, b) => a - b);
      ix.dyn = still;
    }
    const hit = ix.by.get(name) ?? [];
    if (!ix.dyn.length) return hit.map(i => all[i]);
    const idx = [...hit, ...ix.dyn.filter(i => matches(all[i], name))].sort((a, b) => a - b);
    return idx.map(i => all[i]);
  }
  // ---- 1 つの名前空間での局所の解決(KerML 8.2.3.5.3)。裁定 D2: 区別できない別々の要素が 2 つ以上なら曖昧
  // 戻り値 { found: [entry], unknown: [理由] }
  const localCache = new Map();
  derivedCaches.push(localCache);
  function local(n, name, skipSelf) {
    let m = localCache.get(n);
    const ck = name;
    if (!skipSelf && m?.has(ck)) return m.get(ck);
    if (!skipSelf && n.lib && LIBC?.local.get(n)?.has(ck)) return LIBC.local.get(n).get(ck);
    const g0 = guardHits, x0 = exclusionHits;
    const unknown = [];
    const owned = (GR18.M3 ? ownedMatching(n, name) : (ownedEntries(n) ?? []).filter(en => matches(en, name))).filter(en => entryElem(en) !== skipSelf);
    let imported = [];
    let inherited = [];
    if (!pureB(n) && !n.virtual) {
      for (const imp of (GR18.M3 ? importsOf(n) : n.owned)) {
        if (!conforms(imp.kind, 'Import')) continue;
        const r = importedBy(imp, new Set([n]));
        imported.push(...r.entries.filter(en => matches(en, name)));
        unknown.push(...r.unknown);
      }
      if (conforms(n.kind, 'Type')) {
        const h = inheritedEntries(n) ?? { entries: [], unknown: ['inherit'] };
        inherited = h.entries.filter(en => matches(en, name));
        unknown.push(...h.unknown);
      }
    } else if (pureB(n)) {
      // 内蔵する表の項目に名前がなければ、同じ修飾名の索引の要素で探す(GR17 の L)
      const tw = twinOf(n);
      if (tw && !owned.length) { const r = local(tw, name, skipSelf); inherited = r.found; unknown.push(...r.unknown); }
      else if (!tw && n.partial) unknown.push('inherit');
    }
    else { const h = inheritedEntries(n) ?? { entries: [], unknown: [] }; inherited = h.entries.filter(en => matches(en, name)); unknown.push(...h.unknown); }
    // 所有の Membership と衝突する import は除く(KerML 8.3.2.4.5 importedMemberships、kerml10 L8282–L8286)
    if (owned.length) imported = [];
    const found = [...owned, ...inherited, ...imported];
    const res = { found, unknown: [...new Set(unknown)] };
    if (!skipSelf && unchanged(g0, x0)) {
      if (!m) localCache.set(n, m = new Map());
      m.set(ck, res);
      if (n.lib && LIBC) { if (!LIBC.local.has(n)) LIBC.local.set(n, new Map()); LIBC.local.get(n).set(ck, res); }
    }
    return res;
  }
  const distinct = (found) => {
    const els = [];
    for (const en of found) { const el = entryElem(en); if (el && !els.includes(el)) els.push(el); }
    return els;
  };

  // D3 の印の判定(GR15 の D2。上の D3_ASCII_NAMES)
  const d3Ascii = opts.d3Ascii ?? D3_ASCII_NAMES, d3Scope = opts.d3Scope ?? D3_SCOPE;

  // ---- 完全な解決(KerML 8.2.3.5.4)。裁定 D1: 根の名前空間も、所有と import を先に探す。その外が大域の名前空間
  // 利用者のモデルの名前空間から、索引の型が持つ特徴(パッケージの直下でないもの。利用者の型が受け継いだもの)に当たったときは、
  // 未検査にする(GR17 の L)。利用者のモデルの特徴が、標準ライブラリの特徴を暗黙に再定義して隠しているかもしれない(設計書 6.2 節の
  // 暗黙の再定義の行のとおり、標準ライブラリの特徴を再定義する制約は入れないので、確かめられない)。再定義の名前を上位の型ごとに
  // 探すこと(D5)で、ほかの上位の型が受け継いだ特徴を隠す再定義も見ていない
  const libTypeFeature = (el) => { if (!el?.lib || !conforms(el.kind, 'Feature')) return false; const o = parentNS(el); return !!o && conforms(o.kind, 'Type'); };
  const userNS = (n) => !!n && !n.lib && !pureB(n) && !(n.virtual && n.of?.lib);
  const LIB_INHERITED = { status: 'unchecked', reason: 'library-inherited' };
  // 条件付きの暗黙の特殊化・再定義の相手(表の contextual)が所有する特徴の実効の名前(1 回だけ求める)
  const contextualNames = () => {
    if (L.contextualNames) return L.contextualNames;
    const out = new Set();
    for (const q of L.contextual) {
      const el = L.byQname.get(q.replace(/'/g, ''));
      for (const en of el ? ownedEntries(el) ?? [] : []) { const n = entryNames(en)[0]; if (n != null) out.add(n); }
    }
    L.contextualNames = out;
    return out;
  };
  function full(name, ns, skipSelf) {
    const shadow = [];
    let origin = null; // 最後に探した名前空間(ファイルの根の名前空間なら、大域でそのファイルを除く)
    for (let n = ns; n; n = pureB(n) || n.virtual ? null : parentNS(n)) {
      origin = n;
      const r = local(n, name, skipSelf);
      const els = distinct(r.found);
      if (L && userNS(n) && els.some(libTypeFeature)) return LIB_INHERITED;
      // 実効の名前のわからない所有の特徴を持つ名前空間を通り越して、索引の要素に当たったときは未検査にする(その特徴の名前かもしれない)

      if (els.length === 1) return { status: 'resolved', entry: r.found.find(en => entryElem(en) === els[0]), target: els[0], shadow: shadow.length ? shadow : null };
      if (els.length > 1) return { status: 'ambiguous', candidates: els, reason: 'same-namespace', shadow: shadow.length ? shadow : null };
      for (const why of r.unknown) shadow.push({ ns: n, why, name }); // name は D3 の印の後処理(下の「D3 の印の後処理」)が使う
    }
    return globalLookup(name, shadow, origin);
  }
  // 検査用の口(GR18 の M7): opts.testGlobal に [{ elem, names, vis }] を渡すと、大域の名前空間の項目に足す。今の索引では、大域で
  // 2 つ以上の根の名前空間に当たる名前がないため
  const GLOBAL = opts.testGlobal ? [...(L ? L.global : B.global), ...opts.testGlobal] : (L ? L.global : B.global);
  // ほかのファイルの根の名前空間の見える要素のうち、名前の当たるもの(GR20 の M)。origin がファイルの根の名前空間のときだけ探す
  // (索引の中や暗黙の要素から外へ出た名前は、利用者のファイルを探さない。1 ファイルのときと同じ)
  function otherRootHits(name, origin, shadow) {
    const hits = [];
    if (!FOREST || !ROOTSET.has(origin)) return hits;
    for (const R of roots) {
      if (R === origin) continue;
      const v = visibleEntries(R, new Set(), false, false);
      for (const en of v.entries) if (matches(en, name)) hits.push(en);
      for (const why of v.unknown) shadow.push({ ns: R, why, name });
    }
    return hits;
  }
  function globalLookup(name, shadow, origin = null) {
    const own = otherRootHits(name, origin, shadow);
    const hits = own.length ? [...own, ...GLOBAL.filter(en => matches(en, name))] : GLOBAL.filter(en => matches(en, name));
    // 大域で 2 つ以上の根の名前空間(別々の要素)に当たれば曖昧(設計書 6.2 節の曖昧の行。GR18 の M7)
    if (GR18.M7 && hits.length > 1) {
      const els = [...new Set(hits.map(h => canon(entryElem(h))))];
      if (els.length > 1) return { status: 'ambiguous', candidates: els, reason: 'global', shadow: shadow.length ? shadow : null };
    }
    if (hits.length === 1) {
      const el = canon(entryElem(hits[0]));
      return { status: 'resolved', entry: el === entryElem(hits[0]) ? hits[0] : { elem: el, names: null, vis: 'public' }, target: el, shadow: shadow.length ? shadow : null };
    }
    return { status: 'unchecked', reason: 'not-found' };
  }
  // 見える解決(KerML 8.2.3.5.3)
  function visible(name, ns) {
    if (!isNS(ns)) return { status: 'unchecked', reason: 'not-namespace' };
    const r = visibleEntries(ns, new Set(), false, false);
    const found = r.entries.filter(en => matches(en, name));
    const els = distinct(found);
    if (L && userNS(ns) && els.some(libTypeFeature)) return LIB_INHERITED;
    if (els.length === 1) return { status: 'resolved', entry: found.find(en => entryElem(en) === els[0]), target: els[0] };
    if (els.length > 1) return { status: 'ambiguous', candidates: els, reason: 'same-namespace' };
    // 索引を使うときは、実効の名前のわからない特徴を持つ名前空間でも、見つからないと確かめたことにしない
    return { status: 'unchecked', reason: r.unknown.length ? 'not-found' : 'not-found-known' };
  }

  // 修飾名の解決(KerML 8.2.3.5.1 の基本の手順)。seg ごとの解決先も返す
  function basic(rec, ns, skipSelf) {
    const segs = rec.segments;
    if (!segs.length) return { status: 'unchecked', reason: 'no-name', segTargets: [] };
    const segTargets = [];
    let r;
    if (rec.global) {
      // $: まずこのファイルの根の名前空間の見える要素、なければ内蔵する表(パイロット実装 KerMLGlobalScope と同じ順)
      const own = rootOf(rec.node);
      r = visible(segs[0].name, own);
      // 根の名前空間で曖昧なら、大域の検索で上書きしない(GR18 の M5)
      if (r.status !== 'resolved' && !(GR18.M5 && r.status === 'ambiguous')) r = globalLookup(segs[0].name, [], own);
    } else r = full(segs[0].name, ns, segs.length === 1 ? skipSelf : null);
    segTargets.push(r.status === 'resolved' ? r.target : null);
    for (let i = 1; i < segs.length; i++) {
      if (r.status !== 'resolved') break;
      const shadow = r.shadow;
      if (!isNS(r.target)) { r = { status: 'unchecked', reason: 'not-namespace' }; break; }
      r = visible(segs[i].name, r.target);
      if (shadow) r.shadow = shadow;
      segTargets.push(r.status === 'resolved' ? r.target : null);
    }
    return { ...r, segTargets };
  }

  // 呼び出しでない名前空間(KerML 8.2.3.5.2、kerml10 L5555–L5561)
  function nonInvocation(n) {
    while (n) {
      if (conforms(n.kind, 'FeatureReferenceExpression') || conforms(n.kind, 'InstantiationExpression')) { n = parentNS(n); continue; }
      const p = parentNS(n);
      if (p && conforms(n.kind, 'Feature') && (conforms(p.kind, 'InstantiationExpression') || (conforms(p.kind, 'Feature') && parentNS(p) && conforms(parentNS(p).kind, 'ConstructorExpression')))) { n = p; continue; }
      break;
    }
    return n;
  }
  // FeatureChainExpression の引数の結果(裁定 D4・D9: 名前の参照か連鎖のときだけ)
  function chainSource(fce) {
    const pm = fce.owned.find(c => conforms(c.kind, 'ParameterMembership') && !conforms(c.kind, 'ReturnParameterMembership'));
    const e = valueExpr(pm?.related[0]);
    return e ? exprReferent(e) : null;
  }
  // 名前の参照か連鎖の式の、指す特徴(それ以外の式は null)
  function exprReferent(e) {
    if (conforms(e.kind, 'FeatureReferenceExpression') || conforms(e.kind, 'FeatureChainExpression')) {
      const m = e.owned.find(c => conforms(c.kind, 'Membership') && !conforms(c.kind, 'FeatureMembership'));
      if (!m) return null;
      if (m.refs.memberElement !== undefined) return targetOf(m, 'memberElement');
      const chain = m.related.find(x => conforms(x.kind, 'Feature'));
      return chain ? featureTarget(chain) : null;
    }
    return null;
  }
  const isEndFeature = (f) => f.attrs?.isEnd === true || (owningRel(f) && conforms(owningRel(f).kind, 'EndFeatureMembership'));

  // 文脈の関係 rel から、局所の名前空間を決めて解決する(KerML 8.2.3.5.2 の表)
  function resolveInContext(rec, rel) {
    const owner = parent.get(rel); // 関係を所有する要素
    if (conforms(rel.kind, 'Import')) return basic(rec, owner);
    if (conforms(rel.kind, 'Membership')) {
      const mns = owner;
      if (conforms(mns.kind, 'FeatureReferenceExpression')) return basic(rec, nonInvocation(mns));
      if (!conforms(rel.kind, 'FeatureMembership') && conforms(mns.kind, 'InstantiationExpression') && !conforms(mns.kind, 'FeatureChainExpression')) return basic(rec, nonInvocation(mns));
      if (conforms(mns.kind, 'FeatureChainExpression')) {
        const src = chainSource(mns);
        if (!src) return { status: 'unchecked', reason: 'chain-source', segTargets: [] };
        return visibleBasic(rec, src);
      }
      // assign の対象の連鎖(SysML 8.2.2.17.5 AssignmentNodeDeclaration の FeatureChainMember)は、対象の引数の結果から
      // 見える解決で探す(GR3 P4 の裁定 1、U1。D4 と同じ考え方。パイロット実装 NamespaceUtil.getRelativeNamespaceFor と同じ)
      if (conforms(mns.kind, 'AssignmentActionUsage') && !conforms(rel.kind, 'FeatureMembership')) {
        const pm = mns.owned.find(c => conforms(c.kind, 'ParameterMembership'));
        const target = pm?.related[0];
        const fv = target?.owned.find(c => conforms(c.kind, 'FeatureValue'));
        const e = fv?.related[0];
        if (e) {
          const src = exprReferent(e);
          if (!src) return { status: 'unchecked', reason: 'chain-source', segTargets: [] };
          return visibleBasic(rec, src);
        }
      }
      return basic(rec, mns);
    }
    if (conforms(rel.kind, 'Specialization') || conforms(rel.kind, 'Conjugation')) {
      const T = owner; // owningType(特殊化を所有する型)
      if (conforms(rel.kind, 'Redefinition') && T && conforms(T.kind, 'Feature')) {
        const O = parentNS(T);
        if (O && conforms(O.kind, 'Type') && owningRel(T) && conforms(owningRel(T).kind, 'FeatureMembership')) return redefinition(rec, O, T);
      }
      if (conforms(rel.kind, 'ReferenceSubsetting') && T && isEndFeature(T)) {
        const C = parentNS(T);
        if (C && conforms(C.kind, 'Connector')) return basic(rec, parentNS(C));
      }
      if (T && conforms(T.kind, 'Type')) return basic(rec, parentNS(T));
      return basic(rec, parentNS(rel));
    }
    // 本文の表にない関係(注釈・依存・型の特徴づけ・素であることなど): パイロット実装と同じく、関係を所有する名前空間から
    return basic(rec, conforms(owner.kind, 'Namespace') ? owner : parentNS(owner));
  }
  // 修飾名を、名前空間 ns の見える解決だけで解く(裁定 D4)
  function visibleBasic(rec, ns) {
    const segs = rec.segments;
    const segTargets = [];
    let r = { status: 'resolved', target: ns };
    for (const s of segs) {
      if (!isNS(r.target)) { r = { status: 'unchecked', reason: 'not-namespace' }; break; }
      r = visible(s.name, r.target);
      segTargets.push(r.status === 'resolved' ? r.target : null);
      if (r.status !== 'resolved') break;
    }
    return { ...r, segTargets };
  }
  // 再定義の名前(KerML 8.2.3.5.1、kerml10 L5506–L5510。裁定 D5)
  function redefinition(rec, O, self) {
    const g = generalsOf(O) ?? { types: [] };
    const user = g.types.filter(x => !x.builtin);
    let firstAmb = null;
    // ActionDefinition・ActionUsage は内蔵の Actions::Action を暗黙に特殊化する(GR3 P2 の表。GR3 P4 の裁定 2、D5 の実装の誤り)
    const gens = [...g.types];
    if (B.inheritsActionFeatures.some(k => conforms(O.kind, k))) { const a = B.byQname.get('Actions::Action'); if (a && !gens.includes(a)) gens.push(a); }
    for (const G of gens) {
      let r = pureB(G) ? builtinBasic(rec, G) : basic(rec, G, self);
      if (r.status !== 'resolved' && twinOf(G)) r = basic(rec, twinOf(G), self);
      // 上位の型の中になく、その外側(D5)で索引の要素に当たったときは、未検査にする(GR17 の L。上位の型の中に、名前のわからない
      // 特徴(再定義の名前が D5 で解けないもの)があるかもしれない)
      if (L && userNS(O) && r.status === 'resolved' && r.target?.lib && rec.segments.length === 1 && !pureB(G) && !distinct(local(G, rec.segments[0].name, self).found).length) return { status: 'unchecked', reason: 'library-shadowed', segTargets: [] };
      // 索引の型が持つ特徴に当たったときは、所有する型が受け継いだメンバー全体(ほかの上位の型の再定義で隠したものを除いたもの)に、
      // 同じ名前で 1 つだけ残っているものにする。なければ未検査(GR17 の L。上の libTypeFeature の説明)
      if (L && userNS(O) && r.status === 'resolved' && libTypeFeature(r.target) && rec.segments.length === 1) {
        // 上位の型に未検査のものがあれば、その中の再定義で隠れているかもしれない
        if ((generalsOf(O)?.unknown ?? []).includes('general')) return { status: 'unchecked', reason: 'library-shadowed', segTargets: [] };
        // 条件付きの暗黙の特殊化の相手(入れていないもの)が再定義する特徴の名前は、隠されているかもしれない
        if (contextualNames().has(rec.segments[0].name)) return { ...LIB_INHERITED, segTargets: [] };
        // 所有する型自身の特徴の再定義で除く前の並び(この再定義の解決によらない)
        const ic = inheritedCombined(O);
        const alt = distinct((ic?.comb.list ?? []).filter(en => matches(en, rec.segments[0].name) && entryElem(en) !== self && !ic.comb.redefByOthers.has(entryElem(en))));
        if (alt.length !== 1) return { ...LIB_INHERITED, segTargets: [] };
        if (alt[0] !== r.target) r = { status: 'resolved', target: alt[0], entry: null, segTargets: [alt[0]], shadow: r.shadow };
      }
      if (r.status === 'resolved' || r.reason === 'library-inherited') return r;
      if (r.status === 'ambiguous' && !firstAmb) firstAmb = r;
    }
    if (firstAmb) return firstAmb;
    return { status: 'unchecked', reason: user.length ? 'redefinition-not-found' : 'redefinition-implicit-only', segTargets: [] };
  }
  function builtinBasic(rec, G) {
    // 内蔵する表の型の中だけを探す(表は一部しか知らないので、見つからなければ未検査)
    const segs = rec.segments;
    let t = G; const segTargets = [];
    for (const s of segs) {
      const hit = (t.members ?? []).find(en => matches(en, s.name));
      if (!hit) return { status: 'unchecked', reason: 'not-found', segTargets };
      t = hit.elem; segTargets.push(t);
    }
    return { status: 'resolved', target: t, entry: null, segTargets };
  }

  function computeRec(rec) {
    const node = rec.node;
    let r;
    if (node.kind === 'FeatureChaining' && rec.prop === 'chainingFeature') {
      const chain = parent.get(node);
      const list = ownedOfKind(chain, 'FeatureChaining');
      const i = list.indexOf(node);
      if (i <= 0) {
        const rel = parent.get(chain); // 連鎖の特徴を所有する関係
        r = rel ? resolveInContext(rec, rel) : { status: 'unchecked', reason: 'no-context', segTargets: [] };
      } else {
        const prev = targetOf(list[i - 1], 'chainingFeature');
        r = prev ? visibleBasic(rec, prev) : { status: 'unchecked', reason: 'chain-previous', segTargets: [] };
      }
    } else {
      r = resolveInContext(rec, node);
    }
    // 共役ポートの型付け(裁定 D7): PortDefinition に解決してから、その共役ポート定義を結果とする
    if (rec.conjugated && r.status === 'resolved') {
      if (!pureB(r.target) && conforms(r.target.kind, 'PortDefinition')) r = { ...r, portDefinition: r.target, target: conjugatedOf(r.target) };
      else if (pureB(r.target) || r.target.lib) r = { status: 'unchecked', reason: 'builtin-port', segTargets: r.segTargets };
    }
    return r;
  }

  // ---- すべての参照を解く。見張りに当たった参照は、後でもう一度解く
  const finalize = (rec, r) => {
    rec.status = r.status;
    rec.target = r.status === 'resolved' ? r.target : null;
    rec.entry = r.entry ?? null;
    rec.portDefinition = r.portDefinition ?? null;
    rec.candidates = r.status === 'ambiguous' ? r.candidates : null;
    rec.shadow = r.status === 'resolved' && r.shadow ? r.shadow.map(s => ({ ns: s.ns, why: s.why })) : null;
    rec.reason = r.reason ?? null;
    (r.segTargets ?? []).forEach((t, i) => { if (rec.segments[i]) rec.segments[i].target = t; });
    const exp = EXPECTED[rec.prop] ?? (rec.prop === 'memberElement' && parent.get(rec.node) && conforms(parent.get(rec.node).kind, 'FeatureReferenceExpression') ? 'Feature'
      : rec.prop === 'memberElement' && parent.get(rec.node) && conforms(parent.get(rec.node).kind, 'InstantiationExpression') && !conforms(parent.get(rec.node).kind, 'FeatureChainExpression') ? 'Type' : null);
    const tk = rec.target ? rec.target.kind : null;
    rec.kindMismatch = exp && tk && !conforms(tk, exp) ? exp : null;
  };
  const libSlots = libAll ? L.slots.flatMap(sl => sl.map(([n, prop]) => recFor(n, prop))).filter(Boolean) : [];
  const ordered = [...(opts.order ? opts.order(refs.slice()) : refs), ...libSlots];
  for (const rec of ordered) resultOf(rec);
  // 仮の参照を、解いた順に解き直す。どの参照の status と解決先も変わらなくなるまで繰り返す(上限 MAX_ITERATIONS)。
  // 各回の初めに途中の結果の覚えを空にし、まだ解き直していない仮の参照を使った計算は仮にする
  const MAX_ITERATIONS = 20;
  const sig = (r) => `${r.status}|${r.status === 'resolved' ? idOf(r.target) : ''}`;
  let iterations = 0, converged = true;
  let prev = new Map(ordered.map(rec => [rec, sig(recCache.get(rec).r)]));
  for (;;) {
    const provisional = ordered.filter(rec => recCache.get(rec)?.tainted);
    if (!provisional.length) break;
    if (iterations >= MAX_ITERATIONS) { converged = false; break; }
    iterations++;
    for (const c of derivedCaches) c.clear();
    // 索引の参照(参照の一覧にないもの)の仮の結果も解き直す
    for (const [r, c] of [...recCache]) if (r.lib && c.tainted) recCache.delete(r);
    stale = new Set(provisional);
    for (const rec of provisional) {
      recCache.delete(rec);
      stale.delete(rec);
      resultOf(rec);
      rec.provisional = true;
    }
    stale = null;
    const now = new Map(ordered.map(rec => [rec, sig(recCache.get(rec).r)]));
    let changed = 0;
    for (const [rec, v] of now) if (prev.get(rec) !== v) changed++;
    prev = now;
    if (!changed) break;
  }
  // 索引を使うときは、仮だった参照(解き直した参照)を、文書の順に、途中の結果の覚えを空にしてもう一度解く。どの参照の状態と解決先も
  // 変わらなくなるまで繰り返す(上限 MAX_ITERATIONS。GR17 の L。索引の型のメンバーで探すことで増えた循環のために、解く順序によって
  // 違う仮の結果で止まらないようにする)
  if (L && converged) {
    const prov = refs.filter(rec => rec.provisional);
    for (let k = 0; prov.length && k < MAX_ITERATIONS; k++) {
      iterations++;
      for (const c of derivedCaches) c.clear();
      for (const [r, c] of [...recCache]) if (r.lib && c.tainted) recCache.delete(r);
      const before = new Map(prov.map(rec => [rec, sig(recCache.get(rec).r)]));
      stale = new Set(prov);
      for (const rec of prov) { recCache.delete(rec); stale.delete(rec); resultOf(rec); }
      stale = null;
      if (prov.every(rec => before.get(rec) === sig(recCache.get(rec).r))) break;
      if (k === MAX_ITERATIONS - 1) converged = false;
    }
  }
  // 索引の要素に、明示の上位の型が未検査の名前空間('general')を通り越して当たった参照は、未検査にする(GR17 の L。遮る名前が、
  // 利用者のモデルにも索引にもない上位の型のメンバーかもしれず、確かめられない)
  if (L) for (const rec of refs) {
    const c = recCache.get(rec), r = c.r;
    if (r.status === 'resolved' && r.target?.lib && r.shadow?.some(x => x.why === 'general')) c.r = { status: 'unchecked', reason: 'library-shadowed', segTargets: (r.segTargets ?? []).map((t, i, a) => (i === a.length - 1 ? null : t)) };
  }
  // D3 の印の後処理(GR15 の D2・D3): 名前が空白か ASCII 以外の文字を含む区切りの、暗黙の特殊化('inherit')による印の理由を除く。
  // 解決を終えた後に shadow を絞るだけなので、参照の状態と解決先は変わらない
  if (d3Ascii) for (const rec of refs) {
    const c = recCache.get(rec), sh = c.r.shadow;
    if (!sh) continue;
    const kept = d3Scope ? sh.filter(x => x.why !== 'inherit' || !NOT_LIBRARY_NAME.test(x.name))
      : sh.filter(x => (x.why !== 'inherit' && x.why !== 'general') || !NON_ASCII.test(x.name));
    if (kept.length !== sh.length) c.r = { ...c.r, shadow: kept.length ? kept : null };
  }
  for (const rec of refs) {
    const r = recCache.get(rec).r;
    finalize(rec, r);
    if (r.reason === 'cycle') rec.cycle = true;
  }

  // ---- 逆引き
  const reverse = new Map();
  for (const rec of refs) {
    rec.segments.forEach((s, i) => {
      let t = s.target;
      if (!t) return;
      if (i === rec.segments.length - 1 && rec.portDefinition) t = rec.portDefinition;
      if (!reverse.has(t)) reverse.set(t, []);
      reverse.get(t).push({ ref: rec, segment: i, start: s.start, end: s.end });
    });
  }

  return {
    refs,
    iterations, // 解き直しの回数(0 なら仮の参照がなかった)
    // 道具だけが使う(opts.libraryAll): 索引の参照の節点 node の属性 prop の解決の結果 { status, target }
    libraryResultOf: (node, prop) => { const rec = recFor(node, prop); const c = rec ? recCache.get(rec) : null; return c ? c.r : null; },
    converged,  // 上限までに変わらなくなったか
    referencesTo: (elem) => reverse.get(elem) ?? [],
    // 図・図からの編集・意味エラーが使う実効の名前。名前を宣言しない利用者のモデルの特徴で、名前を受け継ぐ先(naming feature を
    // たどった先)が索引の要素のものは、索引を入れる前と同じく名前なしとする(GR17 の L。図の名前・候補を変えない)。名前解決の中では、
    // その名前を使う
    namesOf: (elem) => {
      const n = namesOf(elem) ?? { name: null, shortName: null };
      if (!L || !elem || elem.lib || pureB(elem) || elem.virtual || elem.name !== undefined || elem.shortName !== undefined) return n;
      for (let e = elem, k = 0; e && k < 50; k++) {
        if (e.lib) return { name: null, shortName: null };
        if (pureB(e) || e.virtual || e.name !== undefined || e.shortName !== undefined || !conforms(e.kind, 'Feature')) break;
        e = namingFeature(e);
      }
      return n;
    },
    // 名前(と短い名前)を宣言していない特徴が、再定義(所有する Redefinition か暗黙の再定義)で名前を受け継ぐ特徴(naming feature)。
    // それ以外(名前を宣言した要素、variant・perform・要求の制約・遷移の受け取りの引数の naming feature など)は null。
    // GR15 の E2(設計書 8 章の名前の変更の書き換える箇所)で足した。名前解決の結果は変えない
    redefinitionNamingOf: (e) => {
      if (!e || e.builtin || e.virtual || e.name !== undefined || e.shortName !== undefined || !conforms(e.kind, 'Feature')) return null;
      const nf = namingFeature(e);
      if (!nf) return null;
      const redef = ownedOfKind(e, 'Redefinition')[0];
      return (redef ? specTarget(redef) : (impliedRedefs(e) ?? [])[0]) === nf ? nf : null;
    },
    // 名前(と短い名前)を宣言していない利用者のモデルの特徴が、実効の名前(KerML 8.3.3.3.4 の effectiveName)を受け継ぐ特徴
    // (namingFeature。上の namesOf が使うものと同じ。再定義・暗黙の再定義のほか、variant・perform・要求の制約・遷移の受け取りの
    // 引数を含む)。それ以外は null。GR17 の E3(設計書 8 章 v17.2 の名前の変更の書き換える箇所)で足した。名前解決の結果は変えない
    namingFeatureOf: (e) => {
      if (!e || e.builtin || e.virtual || e.lib || e.name !== undefined || e.shortName !== undefined || !conforms(e.kind, 'Feature')) return null;
      return namingFeature(e) ?? null;
    },
    conforms,
    parentNamespaceOf: opts.forestTop ? (e) => { const p = parentNS(e); return p && ROOTSET.has(p) ? opts.forestTop : p; } : parentNS,
    // 型が受け継いだメンバー(KerML 8.3.3.1.10 inheritedMemberships。再定義された特徴を除く)。GR4 P2 の裁定 Q21 で足した。
    // 名前解決と同じ上位の型のたどり(特殊化・型付け・部分集合・再定義・共役)を使う。名前解決の結果は変えない。
    // → { members: [{ element, visibility }], unknown: [理由] }。element は利用者のモデルの要素か内蔵する表の項目
    inheritedMembersOf: (type) => {
      if (!type || type.builtin || type.virtual || !conforms(type.kind, 'Type')) return { members: [], unknown: [] };
      const h = inheritedEntries(type) ?? { entries: [], unknown: ['inherit'] };
      return { members: h.entries.map(en => ({ element: entryElem(en), visibility: en.vis })).filter(m => m.element && !m.element.lib), unknown: h.unknown };
    },
    // 名前空間の見える Membership(KerML 8.3.2.4.5 visibleMemberships。所有するもの・import で取り込んだもの・
    // 型なら受け継いだもの)。GR4 P2 の 2 回目の裁定 1 で足した。名前解決の結果は変えない。
    // opts.includeAll が true なら可視性によらず(expose と同じ。KerML 8.3.2.4.5 の isImportAll)、
    // opts.recursive が true なら所有する名前空間を再帰的にたどる(import の isRecursive と同じ)
    // → { members: [{ element, visibility }], unknown: [理由] }
    visibleMembershipsOf: (ns, opts = {}) => {
      if (!ns || ns.builtin || !isNS(ns)) return { members: [], unknown: [] };
      const r = visibleEntries(ns, new Set(), opts.recursive === true, opts.includeAll === true);
      return { members: r.entries.map(en => ({ element: entryElem(en), visibility: en.vis })).filter(m => m.element && !m.element.lib), unknown: r.unknown };
    },
    // 以下の 4 つは GR5(意味エラーの検査、src/model/semantic.js)で足した。どれも名前解決の結果は変えない。
    // 名前空間の所有の Membership と、型なら受け継いだ Membership(再定義された特徴を除く)。import で取り込んだものは
    // 含めない(GR5 P2 の裁定 Q3)。→ { members: [{ element, name, shortName, owned, membership }], unknown: [理由] }
    // membership は所有の Membership の構文木の要素(受け継いだものと暗黙の要素は null)
    ownedAndInheritedMembershipsOf: (ns) => {
      if (!ns || ns.builtin || ns.virtual || !isNS(ns)) return { members: [], unknown: [] };
      const out = [];
      const seen = new Set(); // 同じ Membership を 2 つの経路で受け継いだものは 1 つと数える
      const add = (en, owned) => {
        if (seen.has(en)) return;
        seen.add(en);
        const el = entryElem(en);
        if (!el || el.lib) return;
        const [name, shortName] = entryNames(en);
        out.push({ element: el, name: name ?? null, shortName: shortName ?? null, owned, membership: owned ? (en.mem ?? null) : null });
      };
      for (const en of ownedEntries(ns) ?? []) add(en, true);
      let unknown = [];
      if (conforms(ns.kind, 'Type')) {
        const h = inheritedEntries(ns) ?? { entries: [], unknown: ['inherit'] };
        for (const en of h.entries) add(en, false);
        unknown = h.unknown;
      }
      return { members: out, unknown };
    },
    // 型の直接の上位の型(名前解決と同じたどり)を、所有する特殊化・共役の順に並べる。所有する特殊化・共役のうち、
    // 上位の型が求まらないもの(未検査・曖昧)は null として並べる。そのあとに、暗黙の上位の型(特徴の連鎖・遷移の
    // 受け取りの引数・暗黙の再定義・呼び出しの型)を並べる。→ [型 | null]。共役ポート定義(暗黙の要素)は [元のポート定義]
    generalTypesOf: (t) => {
      if (!t) return [];
      const g = generalsOf(t) ?? { types: [] };
      if (t.builtin || t.virtual) return [...g.types];
      const out = [];
      for (const c of t.owned) {
        if (!(conforms(c.kind, 'Specialization') || conforms(c.kind, 'Conjugation'))) continue;
        out.push(specTarget(c) ?? null);
      }
      for (const x of g.types) if (!out.includes(x)) out.push(x);
      return out;
    },
    // 特徴の暗黙の再定義(KerML 8.4.2 の端・引数・結果の再定義のうち、利用者のモデルの特徴どうしのもの)が再定義する特徴
    impliedRedefinitionsOf: (f) => (f && !f.builtin && !f.virtual ? [...(impliedRedefs(f) ?? [])] : []),
    // 参照を解くときに通り越した、暗黙の特殊化・対象のわからない import・評価できないフィルター条件を持つ名前空間
    // [{ ns, why }]。解決できなかった参照についても返す(rec.shadow は解決済みの参照だけが持つ)。なければ null
    searchShadowOf: (rec) => {
      const c = recCache.get(rec);
      const s = c?.r?.shadow;
      return s && s.length ? s.map(x => ({ ns: x.ns, why: x.why })) : null;
    },
    // 名前空間 ns から、区切りの名前 names(書いた形でなく引用符を外した名前)の修飾名を、参照と同じ手順(最初の区切りは完全な解決、
    // 2 番目以降は前の区切りに対する見える解決。特徴の連鎖の端も同じ)で解く。D3 の印の後処理も参照と同じに行う。GR16 の A(図からの
    // 編集の段階 2)で、書き足す型の名前と接続の端の書き方を決めるのに足した。参照の一覧には入れず、名前解決の結果は変えない。
    // → { status, target, shadow, segTargets }
    resolveFrom: (ns, names) => {
      const r = basic({ segments: names.map(name => ({ name })), global: false }, ns, null);
      let shadow = r.status === 'resolved' && r.shadow?.length ? r.shadow : null;
      if (shadow && d3Ascii) {
        shadow = d3Scope ? shadow.filter(x => x.why !== 'inherit' || !NOT_LIBRARY_NAME.test(x.name))
          : shadow.filter(x => (x.why !== 'inherit' && x.why !== 'general') || !NON_ASCII.test(x.name));
        if (!shadow.length) shadow = null;
      }
      return { status: r.status, target: r.status === 'resolved' ? r.target : null, shadow: shadow ? shadow.map(x => ({ ns: x.ns, why: x.why })) : null, segTargets: r.segTargets ?? [] };
    },
  };
}
