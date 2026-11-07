// GR18 P0: 指示書 2.1 節の指摘(M1〜M8)を、最小の入力で再現する道具。
// 使い方: node tools/model/gr18_repro_m.mjs
import { resolveText, resolveNames } from '../../src/model/index.js';
import { parse } from '../../src/parser/index.js';
const desc = (m, t) => !t ? null : t.builtin ? `B:${t.qname}` : t.virtual ? `~${m.namesOf(t.of).name}` : `${t.kind}:${m.namesOf(t).qname ?? m.namesOf(t).name}`;
const show = (label, text, pick, opts) => {
  const r = opts ? { ok: true, model: resolveNames(parse(text).tree, text, opts) } : resolveText(text);
  if (!r.ok) { console.log(`${label}: 構文エラー`, r.errors[0]); return; }
  for (const x of r.model.refs.filter(pick)) console.log(`${label}: 「${x.text}」[${x.start},${x.end}] ${x.status} ${desc(r.model, x.target) ?? ''}${x.shadow ? ' 印:' + x.shadow.map(s => `${s.why}(${s.ns.kind})`).join(',') : ''} 区切り=${JSON.stringify(x.segments.map(s => [s.name, s.start, s.end]))}`);
};
console.log('== M1');
show('M1a', 'package A { public import B::*; part def X; } package B { part def X; } part z : A::X;', x => x.text.replace(/\s/g, '') === 'A::X');
show('M1b', 'package A { public import B::*; part def X; } package B { part def X; } package C { private import A::*; part z : X; }', x => x.text === 'X');
console.log('== M4');
show('M4 as', 'package P { part def T; part x; attribute a = x as T; }', x => x.text === 'T');
show('M4 istype', 'package P { part def T; part x; attribute a = x istype T; }', x => x.text === 'T');
show('M4 @', 'package P { part def T; part x; attribute a = x @ T; }', x => x.text === 'T');
show('M4 filter', 'package P { metadata def M; package Q { part y; } package R { private import Q::*[@M]; part z : y; } }', x => x.text === 'M');
console.log('== M5');
show('M5', 'package P; package P; part x : $::P;', x => x.text.includes('P'));
console.log('== M6');
show('M6', 'package P { part def B; package S { alias <B> C for B; } }', x => x.text === 'B');
console.log('== M7(大域で 2 つの根に当たる。検査用の口 opts.testGlobal で、同じ名前の根のパッケージを 2 つ足す)');
const fake = (n) => ({ elem: { kind: 'Package', name: 'Zed', qname: 'Zed', builtin: true, lib: true, owned: [], related: [], refs: {}, attrs: {}, start: 0, end: 0, libId: -n }, names: ['Zed', null], vis: 'public' });
show('M7', 'part x : Zed;', x => x.text === 'Zed', { testGlobal: [fake(1), fake(2)] });
show('M7(1 つ)', 'part x : Zed;', x => x.text === 'Zed', { testGlobal: [fake(1)] });
