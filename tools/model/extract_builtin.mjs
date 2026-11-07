// 内蔵する名前と種類の表の正本 grammar/builtin.json を、仕様書本文のテキストから作る(GR3 指示書 5 章)。
//
// 使い方:
//   node tools/model/extract_builtin.mjs   # → grammar/builtin.json
//
// 入力は GR1 の抜き出しで作ったテキスト out/text/kerml10.txt と out/text/sysml20.txt だけ。
// 標準ライブラリのファイル(vendor/ の sysml.library)は読まない(設計書 6 章・11 章)。
// 各項目に、本文の節番号と行番号(テキストの行。「kerml10 L7175」の形)を付ける。
//
// 表に入れるもの:
//   metaclasses   抽象構文のメタクラスと列挙型(KerML 8.3 節・SysML 8.3 節)と、直接の上位の種類(General Classes)
//   packages      上のメタクラスを持つライブラリのパッケージ(KerML 9.2.17、SysML 9.2.22)、標準のビュー定義の
//                 パッケージ(SysML 9.2.20)、アクションのパッケージ(SysML 9.2.10)
//   views         6 つの標準ビューの定義名と短い名前、上位の種類(SysML 9.2.20.2。グリッドは 9.2.20.2.5)
//   actionFeatures アクションの start・done(SysML 9.2.10.2.4)と、それを受け継ぐ種類(暗黙の特殊化の制約)
//   implicitLibrarySupertypes  ライブラリの型を暗黙に特殊化する種類(GR3 P1 の裁定 D3 で使う)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const TEXTS = {
  kerml10: fs.readFileSync('out/text/kerml10.txt', 'utf8').replace(/\f/g, '').split('\n'),
  sysml20: fs.readFileSync('out/text/sysml20.txt', 'utf8').replace(/\f/g, '').split('\n'),
};
const src = (tag, i) => `${tag} L${i + 1}`;
const isPageLine = (t) => /Modeling Language v|^\d+$/.test(t);

// 行 i を含む節の見出し(目次の行を除く)
function sectionOf(tag, i) {
  const L = TEXTS[tag];
  for (let k = i; k >= 0; k--) {
    const h = /^(\d+(?:\.\d+)+)\s+[A-Z]/.exec(L[k]);
    if (h && !/\.\.\.\./.test(L[k])) return h[1];
  }
  return null;
}

// re に合う行を探す。1 つだけあること(first なら、2 つ以上あるとき最初の行)
function findLine(tag, re, what, first = false) {
  const L = TEXTS[tag];
  const hits = [];
  for (let i = 0; i < L.length; i++) if (re.test(L[i])) hits.push(i);
  if (hits.length === 0 || (hits.length > 1 && !first)) throw new Error(`${tag}: ${what} の行が ${hits.length} 件(1 件のはず)`);
  return hits[0];
}

// ---- メタクラス(8.3 節の小節で、見出しの直後に Description が続くもの。tools/grammar/metaclasses.mjs と同じ読み方)
function extractMetaclasses(tag, lang) {
  const L = TEXTS[tag];
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const h = /^(8\.3\.\d+(?:\.\d+)*)\s+([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*)\s*$/.exec(L[i]);
    if (!h) continue;
    let j = i + 1;
    while (j < L.length && L[j].trim() === '') j++;
    if (L[j]?.trim() !== 'Description') continue;
    const name = h[2].replace(/ /g, '');
    const general = [];
    let isEnum = false, state = 0;
    for (let k = j + 1; k < L.length; k++) {
      const t = L[k].trim();
      if (/^8\.3\.\d/.test(t)) break;
      if (t === 'General Classes') { state = 1; continue; }
      if (state !== 1 || t === '' || t === 'None.') continue;
      if (t === 'Literal Values') { isEnum = true; break; }
      if (/^(Attributes|Operations|Constraints)$/.test(t)) break;
      if (/^[A-Z][A-Za-z]*$/.test(t)) { general.push({ name: t, src: src(tag, k) }); continue; }
      if (isPageLine(t)) continue;
      throw new Error(`${src(tag, k)}: ${name} の General Classes に読めない行「${t}」`);
    }
    const m = { name, lang, section: h[1], src: src(tag, i), general };
    if (isEnum) m.enum = true;
    if (lang === 'KerML') {
      // KerML 9.2.17 の 1: 下位のパッケージ Root・Core・Kernel。8.3.2 Root・8.3.3 Core・8.3.4 Kernel の抽象構文に対応する
      m.package = h[1].startsWith('8.3.2.') ? 'KerML::Root' : h[1].startsWith('8.3.3.') ? 'KerML::Core'
        : h[1].startsWith('8.3.4.') ? 'KerML::Kernel' : null;
      if (!m.package) throw new Error(`${m.src}: ${name} の節 ${h[1]} が KerML の下位のパッケージに当たらない`);
    } else {
      m.package = 'SysML';
    }
    out.push(m);
  }
  return out;
}

// ---- 標準ビュー(SysML 9.2.20.2)
const VIEW_NAMES = ['GeneralView', 'InterconnectionView', 'ActionFlowView', 'StateTransitionView', 'SequenceView', 'GridView'];
function extractView(name) {
  const tag = 'sysml20';
  const L = TEXTS[tag];
  const i = findLine(tag, new RegExp(`^9\\.2\\.20\\.2\\.\\d+ ${name}$`), `9.2.20.2 の ${name} の見出し`);
  const section = /^(\S+)/.exec(L[i])[1];
  let kind = null, kindSrc = null, shortName = null, shortSrc = null;
  const general = [];
  let state = 0;
  for (let k = i + 1; k < L.length; k++) {
    const t = L[k].trim();
    if (/^9\.2\.\d/.test(t)) break;
    if (t === 'Element') { state = 1; continue; }
    if (state === 1 && t) { kind = t; kindSrc = src(tag, k); state = 0; continue; }
    const s = /^Short name: (\S+)$/.exec(t);
    if (s) { shortName = s[1]; shortSrc = src(tag, k); continue; }
    if (t === 'General Types') { state = 2; continue; }
    if (state === 2) {
      if (t === '' || isPageLine(t)) continue;
      if (t === 'Features') break;
      if (t !== 'None.') { if (!/^[A-Z][A-Za-z]*$/.test(t)) throw new Error(`${src(tag, k)}: ${name} の General Types に読めない行「${t}」`); general.push({ name: t, src: src(tag, k) }); }
    }
  }
  if (kind !== 'ViewDefinition' || !shortName) throw new Error(`${src(tag, i)}: ${name} の種類か短い名前が読めない`);
  return { name, shortName, kind, package: 'StandardViewDefinitions', section, src: src(tag, i), kindSrc, shortNameSrc: shortSrc, general };
}

// ---- アクションの start・done(SysML 9.2.10.2.4 Action の Features)
function extractActionFeatures() {
  const tag = 'sysml20';
  const L = TEXTS[tag];
  const i = findLine(tag, /^9\.2\.10\.2\.4 Action$/, '9.2.10.2.4 Action の見出し');
  const out = [];
  for (let k = i + 1; k < L.length; k++) {
    const t = L[k].trim();
    if (/^9\.2\.\d/.test(t)) break;
    const f = /^(start|done) : ([A-Z][A-Za-z]*) \{redefines ([a-zA-Z]+)\}$/.exec(t);
    if (f) out.push({ name: f[1], type: f[2], redefines: f[3], owner: 'Actions::Action', section: '9.2.10.2.4', src: src(tag, k) });
  }
  if (out.map(x => x.name).sort().join() !== 'done,start') throw new Error('9.2.10.2.4 に start と done が見つからない');
  return out;
}

// ---- 組み立て
const kerml = extractMetaclasses('kerml10', 'KerML');
const sysml = extractMetaclasses('sysml20', 'SysML');
const all = new Map();
for (const m of [...kerml, ...sysml]) {
  if (all.has(m.name)) throw new Error(`メタクラス ${m.name} が 2 回定義されている(${all.get(m.name).src}、${m.src})`);
  all.set(m.name, m);
}
for (const m of all.values()) for (const g of m.general) if (!all.has(g.name)) throw new Error(`${m.src}: ${m.name} の上位 ${g.name} がない`);

const line = (tag, re, what, first) => { const i = findLine(tag, re, what, first); return { section: sectionOf(tag, i), src: src(tag, i) }; };

const packages = [
  {
    name: 'KerML', kind: 'LibraryPackage',
    note: '抽象構文の KerML のメタクラスを持つ。下位のパッケージ Root・Core・Kernel を持ち、すべての要素を最上位にも import する',
    members: 'KerML のメタクラス(下位のパッケージと最上位の両方から見える)',
    metaclassKind: { ...line('kerml10', /A metaclass from the MOF model is mapped into a Metaclass in the KerML package/, 'KerML 9.2.17 の 2'), kind: 'Metaclass' },
    enumKind: { ...line('kerml10', /^\s*4\. An enumeration from the MOF model is mapped into a DataType\./, 'KerML 9.2.17 の 4'), kind: 'DataType' },
    structure: line('kerml10', /The KerML model contains subpackages for Root, Core, and Kernel, but all elements are also imported/, 'KerML 9.2.17 の 1'),
    subpackages: [
      { name: 'Root', abstractSyntax: line('kerml10', /^8\.3\.2 Root Abstract Syntax$/, '8.3.2 の見出し') },
      { name: 'Core', abstractSyntax: line('kerml10', /^8\.3\.3 Core Abstract Syntax$/, '8.3.3 の見出し') },
      { name: 'Kernel', abstractSyntax: line('kerml10', /^8\.3\.4 Kernel Abstract Syntax$/, '8.3.4 の見出し') },
    ],
    ...line('kerml10', /^9\.2\.17 KerML$/, 'KerML 9.2.17 の見出し'),
  },
  {
    name: 'SysML', kind: 'LibraryPackage',
    note: '抽象構文の SysML のメタクラスを、下位のパッケージなしで直接持つ。KerML のすべての要素を import する',
    members: 'SysML のメタクラスと、import した KerML のメタクラス',
    metaclassKind: { ...line('sysml20', /2\. A metaclass from the MOF model is mapped into a MetadataDefinition/, 'SysML 9.2.22 の 2'), kind: 'MetadataDefinition' },
    enumKind: { ...line('sysml20', /^\s*4\. An enumeration from the MOF model is mapped into an EnumerationDefinition\./, 'SysML 9.2.22 の 4'), kind: 'EnumerationDefinition' },
    structure: line('sysml20', /The SysML model imports all elements from the reflective KerML package/, 'SysML 9.2.22 の 1'),
    imports: ['KerML'],
    ...line('sysml20', /^9\.2\.22 SysML$/, 'SysML 9.2.22 の見出し'),
  },
  {
    name: 'StandardViewDefinitions', kind: 'LibraryPackage',
    note: '標準のビュー定義を持つ。この表には設計書 3.1 節の 5 つと、表に使うグリッド(設計書 3.2 節)の 6 つだけを入れる(幾何・ブラウザのビューは入れない。設計書 6 章により未検査)',
    members: 'views',
    name_src: line('sysml20', /^The StandardViewDefinitions package in the Systems Model Library \(see 9\.2\.20 \) provides a set of standard$/, 'StandardViewDefinitions の名前(SysML 8.2.2.26 と 8.2.3.26 に同じ文がある。最初の行)', true).src,
    ...line('sysml20', /^9\.2\.20 Standard View Definitions$/, 'SysML 9.2.20 の見出し'),
  },
  {
    name: 'Actions', kind: 'LibraryPackage',
    note: 'アクションの基底の型を持つ。この表には Action とその start・done だけを入れる',
    members: 'Action(ActionDefinition)と actionFeatures',
    name_src: line('sysml20', /^This package defines the base types for actions and related behavioral elements in the SysML language\.$/, 'Actions の説明').src,
    ...line('sysml20', /^9\.2\.10 Actions$/, 'SysML 9.2.10 の見出し'),
  },
];

const actionDef = {
  name: 'Action', kind: 'ActionDefinition', package: 'Actions',
  ...line('sysml20', /^9\.2\.10\.2\.4 Action$/, 'Action の見出し'),
};

// start・done を受け継ぐ種類: ActionDefinition は Actions::Action を、ActionUsage は Actions::actions(型 Action)を
// 特殊化しなければならない(暗黙の特殊化。SysML 8.3.17 の制約)
const inheritedBy = [
  { metaclass: 'ActionDefinition', libraryType: 'Actions::Action', constraint: 'checkActionDefinitionSpecialization',
    ...line('sysml20', /^An ActionDefinition must directly or indirectly specialize the ActionDefinition Actions::Action from$/, 'checkActionDefinitionSpecialization') },
  { metaclass: 'ActionUsage', libraryType: 'Actions::actions', constraint: 'checkActionUsageSpecialization',
    ...line('sysml20', /^An ActionUsage must directly or indirectly specialize the ActionUsage Actions::actions from the Systems$/, 'checkActionUsageSpecialization') },
];
const actionsUsage = { name: 'actions', generalType: 'Action',
  ...line('sysml20', /^9\.2\.10\.2\.5 actions$/, 'actions の見出し') };

const implicitLibrarySupertypes = {
  metaclass: 'Type', constraint: 'checkTypeSpecialization', libraryType: 'Base::Anything',
  note: 'Type はすべて Base::Anything を直接か間接に特殊化する。利用者のモデルのどの型も、ライブラリの型からメンバーを受け継ぎうる(GR3 P1 の裁定 D3)',
  ...line('kerml10', /^A Type must directly or indirectly specialize Base::Anything from the Kernel Semantic Library\.$/, 'checkTypeSpecialization'),
};

const doc = {
  _説明: [
    '内蔵する名前と種類の表の正本(GR3 指示書 5 章)。node tools/model/extract_builtin.mjs で out/text/kerml10.txt と out/text/sysml20.txt から作った(手で編集しない)。',
    '出典は仕様書本文だけで、標準ライブラリのファイルは読んでいない。src は本文のテキストの行(kerml10 = KerML 1.0、sysml20 = SysML 2.0)、section は節番号。',
    'src/model/builtin_table.js は、この表から node tools/model/build_table.mjs で作る。',
  ],
  metaclasses: [...all.values()],
  packages,
  views: VIEW_NAMES.map(extractView),
  actionDefinition: actionDef,
  actionFeatures: extractActionFeatures(),
  actionFeaturesInheritedBy: inheritedBy,
  actionsUsage,
  implicitLibrarySupertypes,
};
fs.writeFileSync('grammar/builtin.json', JSON.stringify(doc, null, 1) + '\n');
const n = (lang) => doc.metaclasses.filter(m => m.lang === lang).length;
console.log(`grammar/builtin.json: メタクラス ${doc.metaclasses.length} 件(KerML ${n('KerML')}、SysML ${n('SysML')}。うち列挙型 ${doc.metaclasses.filter(m => m.enum).length})、ビュー ${doc.views.length}、アクションの特徴 ${doc.actionFeatures.length}`);
