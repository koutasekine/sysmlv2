// 内蔵する表の検査(GR3 指示書 5 章)。
//
// 使い方:
//   node tools/model/check_builtin.mjs [--out out/model/check_builtin.json]
//
// 検査:
//   1. 構文木が作りうる要素の種類(src/parser/grammar_table.js の規則の型のうち、要素を作るもの)が、すべて表にある
//   2. 上位の種類のたどりに循環がない(メタクラスとビュー)
//   3. 標準ライブラリの SysML.sysml・KerML.kerml の種類の定義と、名前と上位の種類が一致する(照合だけで、写さない)。
//      あわせて StandardViewDefinitions.sysml のビュー、Actions.sysml の start・done も照合する。
//      ライブラリのファイルはこのアプリのパーサーで読み、構文木から名前と特殊化の参照を取り出す。
// 1 と 2 が通らなければ終了コード 1。3 の食い違いは 1 件ずつ書き出す(指示書 9 章: 報告されていればよい)。

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '../../src/parser/index.js';
import grammar from '../../src/parser/grammar_table.js';
import builtin from '../../src/model/builtin_table.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const outPath = args[args.indexOf('--out') + 1] && args.includes('--out') ? args[args.indexOf('--out') + 1] : 'out/model/check_builtin.json';
const LIB = 'vendor/release-2026-03/sysml.library';

const meta = builtin.metaclasses;
const result = { check1: {}, check2: {}, check3: {} };
let failed = false;

// ---- 1. 構文木が作りうる要素の種類(src/parser/tree.js と同じ読み方)
{
  const rules = grammar.rules;
  const gmeta = grammar.metaclasses;
  const ruleType = (n) => rules[n][0];
  const assignCache = new Map();
  const hasAssign = (name) => {
    if (assignCache.has(name)) return assignCache.get(name);
    assignCache.set(name, false);
    const walk = (x) => {
      switch (x[0]) {
        case '=': case 'n': return true;
        case 'r': return !!rules[x[1]] && hasAssign(x[1]);
        case 'a': case 's': return x.slice(1).some(walk);
        case '*': case '+': case '?': return walk(x[1]);
        default: return false;
      }
    };
    const r = walk(rules[name][1]);
    assignCache.set(name, r);
    return r;
  };
  const isElementRule = (n) => ruleType(n) in gmeta || hasAssign(n);
  const isRefRule = (n) => rules[n][1][0] === 'q';
  const kinds = new Map(); // 種類 → それを作る規則
  const add = (k, why) => { if (!kinds.has(k)) kinds.set(k, why); };
  add(ruleType(grammar.start), `${grammar.start}(始点)`);
  // 代入の値として呼ぶ規則(括弧の中の選択も含む)
  const valueRules = (x, acc) => {
    if (x[0] === 'r') acc.push(x[1]);
    else if (['a', 's', '?', '*', '+'].includes(x[0])) x.slice(1).forEach(y => valueRules(y, acc));
    return acc;
  };
  const walk = (x, owner) => {
    if (!Array.isArray(x)) return;
    if (x[0] === '=') {
      for (const r of valueRules(x[3], [])) if (rules[r] && isElementRule(r) && !isRefRule(r)) add(ruleType(r), `${owner} の ${x[1]} ${x[2]} ${r}`);
      return;
    }
    if (x[0] === 'r') {
      // 代入なしで呼んだ規則の型がメタクラスなら、その種類に絞りうる
      if (rules[x[1]] && ruleType(x[1]) in gmeta && isElementRule(x[1])) add(ruleType(x[1]), `${owner} が代入なしで呼ぶ ${x[1]}(絞り込み)`);
      return;
    }
    if (['a', 's', '?', '*', '+'].includes(x[0])) x.slice(1).forEach(y => walk(y, owner));
  };
  for (const [n, [, body]] of Object.entries(rules)) walk(body, n);
  const missing = [...kinds].filter(([k]) => !(k in meta)).map(([k, why]) => ({ kind: k, rule: why }));
  result.check1 = { kinds: kinds.size, missing };
  console.log(`== 1. 構文木が作りうる要素の種類 ${kinds.size} 件が表にあるか`);
  if (missing.length) { failed = true; for (const m of missing) console.log(`  ない: ${m.kind}(${m.rule})`); console.log('  不合格'); }
  else console.log('  合格');
}

// ---- 2. 上位の種類のたどりに循環がない
{
  const cycles = [];
  const check = (name, generalOf, label) => {
    const state = new Map(); // 1 = たどり中, 2 = 済み
    const visit = (n, stack) => {
      if (state.get(n) === 2) return;
      if (state.get(n) === 1) { cycles.push(`${label}: ${[...stack, n].join(' → ')}`); return; }
      state.set(n, 1);
      for (const g of generalOf(n) ?? []) visit(g, [...stack, n]);
      state.set(n, 2);
    };
    for (const n of name) visit(n, []);
  };
  check(Object.keys(meta), n => meta[n]?.general, 'メタクラス');
  const views = Object.fromEntries(builtin.views.map(v => [v.name, v]));
  check(Object.keys(views), n => views[n]?.general, 'ビュー');
  const dangling = [];
  for (const [n, m] of Object.entries(meta)) for (const g of m.general) if (!(g in meta)) dangling.push(`${n} → ${g}`);
  for (const v of builtin.views) for (const g of v.general) if (!(g in views)) dangling.push(`${v.name} → ${g}`);
  result.check2 = { cycles, dangling };
  console.log('== 2. 上位の種類のたどりに循環がない');
  if (cycles.length || dangling.length) { failed = true; cycles.forEach(c => console.log(`  循環: ${c}`)); dangling.forEach(c => console.log(`  上位がない: ${c}`)); console.log('  不合格'); }
  else console.log(`  合格(メタクラス ${Object.keys(meta).length}、ビュー ${builtin.views.length})`);
}

// ---- 3. 標準ライブラリとの照合(写さない。名前と上位の種類を比べるだけ)
{
  const read = (rel) => {
    const r = parse(fs.readFileSync(path.join(LIB, rel), 'utf8').replace(/^﻿/, ''));
    if (!r.ok) throw new Error(`${rel} を解析できない: ${JSON.stringify(r.errors[0])}`);
    return r.tree;
  };
  // 構文木から、指定した種類の要素(名前・短い名前・特殊化の参照・入れ子のパッケージ名)を集める
  const collect = (tree, kinds) => {
    const out = [];
    const walk = (e, pkgs) => {
      const here = e.kind.endsWith('Package') && e.name ? [...pkgs, e.name] : pkgs;
      if (kinds.includes(e.kind) && e.name) {
        const general = [];
        for (const c of e.owned) {
          if (/Subclassification|Specialization|Subsetting|Redefinition|FeatureTyping/.test(c.kind)) {
            const v = Object.values(c.refs)[0];
            if (typeof v === 'string') general.push(v.replace(/ /g, ''));
          }
        }
        out.push({ kind: e.kind, name: e.name, shortName: e.shortName, general, package: pkgs.join('::'), line: e.start, owned: e.owned });
      }
      for (const c of [...e.owned, ...e.related]) walk(c, here);
    };
    walk(tree, []);
    return out;
  };
  const last = (qn) => qn.split('::').pop();
  const diffs = [];
  const compare = (lang, libFile, libItems, libKindFor) => {
    const ours = Object.entries(meta).filter(([, m]) => m.lang === lang);
    const L = new Map(libItems.map(x => [x.name, x]));
    for (const [name, m] of ours) {
      const x = L.get(name);
      if (!x) { diffs.push({ lang, name, what: '表にあってライブラリにない', ours: m.general, lib: null, file: libFile }); continue; }
      const expectKind = m.enum ? libKindFor.enum : libKindFor.metaclass;
      if (x.kind !== expectKind) diffs.push({ lang, name, what: `ライブラリでの種類が ${x.kind}(本文の対応づけでは ${expectKind})`, file: libFile });
      const og = [...m.general].sort().join(','), lg = x.general.map(last).sort().join(',');
      if (og !== lg) diffs.push({ lang, name, what: '上位の種類が違う', ours: m.general, lib: x.general, file: libFile });
      L.delete(name);
    }
    for (const [name, x] of L) diffs.push({ lang, name, what: 'ライブラリにあって表にない', ours: null, lib: x.general, kind: x.kind, package: x.package, file: libFile });
  };
  // KerML.kerml は KerML の構文で、このアプリのパーサー(SysML の文法)では読めない。照合のためだけに、
  // 宣言の行(「metaclass 名前 specializes 上位, …」「datatype 名前」、1 行に書かれている)と、
  // 1 段の字下げの「package 名前 {」を字句で拾う。
  const kItems = [];
  {
    const lines = fs.readFileSync(path.join(LIB, 'Kernel Libraries/Kernel Semantic Library/KerML.kerml'), 'utf8').split(/\r?\n/);
    let top = null, sub = null;
    lines.forEach((l, i) => {
      let m;
      if ((m = /^(?:standard\s+)?(?:library\s+)?package\s+(\w+)\s*\{/.exec(l))) { top = m[1]; sub = null; return; }
      if ((m = /^\tpackage\s+(\w+)\s*\{/.exec(l))) { sub = m[1]; return; }
      if ((m = /^\s*(?:abstract\s+)?(metaclass|datatype)\s+(\w+)(?:\s+specializes\s+([\w\s,:]+?))?\s*[{;]/.exec(l))) {
        kItems.push({ kind: m[1] === 'metaclass' ? 'Metaclass' : 'DataType', name: m[2], general: m[3] ? m[3].split(',').map(s => s.trim()) : [], package: [top, sub].filter(Boolean).join('::'), line: i + 1 });
      }
    });
  }
  compare('KerML', 'KerML.kerml', kItems, { metaclass: 'Metaclass', enum: 'DataType' });
  const sysml = read('Systems Library/SysML.sysml');
  const sItems = collect(sysml, ['MetadataDefinition', 'EnumerationDefinition']);
  compare('SysML', 'SysML.sysml', sItems, { metaclass: 'MetadataDefinition', enum: 'EnumerationDefinition' });
  // パッケージの構造(KerML の下位のパッケージ、SysML の下位のパッケージ)
  const pk = (items) => [...new Set(items.map(x => x.package))].sort();
  const structure = { 'KerML.kerml': pk(kItems), 'SysML.sysml': pk(sItems) };
  for (const [name, m] of Object.entries(meta)) {
    const x = (m.lang === 'KerML' ? kItems : sItems).find(y => y.name === name);
    if (x && x.package !== m.package) diffs.push({ lang: m.lang, name, what: `パッケージが違う(表 ${m.package}、ライブラリ ${x.package})`, file: m.lang === 'KerML' ? 'KerML.kerml' : 'SysML.sysml' });
  }
  // ビュー
  const views = collect(read('Systems Library/StandardViewDefinitions.sysml'), ['ViewDefinition']);
  for (const v of builtin.views) {
    const x = views.find(y => y.name === v.name);
    if (!x) { diffs.push({ lang: 'view', name: v.name, what: 'ライブラリにない', file: 'StandardViewDefinitions.sysml' }); continue; }
    if (x.shortName !== v.shortName) diffs.push({ lang: 'view', name: v.name, what: `短い名前が違う(表 ${v.shortName}、ライブラリ ${x.shortName})`, file: 'StandardViewDefinitions.sysml' });
    if ([...v.general].sort().join() !== x.general.map(last).sort().join()) diffs.push({ lang: 'view', name: v.name, what: '上位の種類が違う', ours: v.general, lib: x.general, file: 'StandardViewDefinitions.sysml' });
    if (x.package !== v.package) diffs.push({ lang: 'view', name: v.name, what: `パッケージが違う(表 ${v.package}、ライブラリ ${x.package})`, file: 'StandardViewDefinitions.sysml' });
  }
  // start・done
  const actions = read('Systems Library/Actions.sysml');
  const action = collect(actions, ['ActionDefinition']).find(x => x.name === 'Action' && x.package === 'Actions');
  if (!action) diffs.push({ lang: 'action', name: 'Action', what: 'Actions.sysml に Actions::Action がない', file: 'Actions.sysml' });
  else {
    for (const f of builtin.actionFeatures) {
      const fm = action.owned.flatMap(r => r.related).find(e => e.name === f.name);
      if (!fm) { diffs.push({ lang: 'action', name: f.name, what: 'Actions::Action の所有する特徴にない', file: 'Actions.sysml' }); continue; }
      const typ = fm.owned.filter(c => c.kind === 'FeatureTyping').map(c => c.refs.type);
      if (!typ.includes(f.type)) diffs.push({ lang: 'action', name: f.name, what: `型が違う(表 ${f.type}、ライブラリ ${typ.join(',')})`, file: 'Actions.sysml' });
      diffs.push({ lang: 'action', name: f.name, what: `参考: ライブラリでの種類は ${fm.kind}(表は本文に種類の記述がないので種類を持たない)`, info: true, file: 'Actions.sysml' });
    }
  }
  result.check3 = { libraryItems: { KerML: kItems.length, SysML: sItems.length, views: views.length }, structure, diffs: diffs.map(({ owned, ...d }) => d) };
  console.log('== 3. 標準ライブラリとの照合(名前と上位の種類)');
  console.log(`  ライブラリの種類の定義: KerML.kerml ${kItems.length} 件、SysML.sysml ${sItems.length} 件。表: KerML ${Object.values(meta).filter(m => m.lang === 'KerML').length} 件、SysML ${Object.values(meta).filter(m => m.lang === 'SysML').length} 件`);
  console.log(`  ライブラリのパッケージ: ${JSON.stringify(structure)}`);
  const real = diffs.filter(d => !d.info);
  console.log(`  食い違い ${real.length} 件(参考の行 ${diffs.length - real.length} 件)`);
  for (const d of diffs) console.log(`  ${d.info ? '(参考) ' : ''}[${d.lang}] ${d.name}: ${d.what}${d.ours !== undefined || d.lib !== undefined ? ` 表=${JSON.stringify(d.ours ?? null)} ライブラリ=${JSON.stringify(d.lib ?? null)}` : ''}(${d.file})`);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 1) + '\n');
console.log(`== まとめ: 検査 1・2 は${failed ? '不合格' : '合格'}。結果は ${outPath}`);
process.exit(failed ? 1 : 0);
