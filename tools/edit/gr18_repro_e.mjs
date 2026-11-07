// GR18 P0: 指示書 2.2 節の指摘のうち、src/edit で再現できるもの(E1・E2・E3・E6・E7)を最小の入力で再現する道具。
// 使い方: node tools/edit/gr18_repro_e.mjs
import { analyze, renameElement } from '../../src/edit/index.js';
import { deleteElement, deletePlan } from '../../src/edit/remove.js';
import { appendView } from '../../src/edit/view.js';
import { typeCandidates } from '../../src/edit/add.js';
const find = (tree, pred) => { const out = []; (function w(e) { if (pred(e)) out.push(e); e.owned.forEach(w); e.related.forEach(w); })(tree); return out; };
{
  const text = 'part a; part a; part b;';
  const a = analyze(text);
  const el = find(a.tree, e => e.name === 'a')[0];
  const r = renameElement({ text, analysis: a, element: el, newName: 'b' });
  console.log('E1:', r.ok ? `書き換わる → ${r.text}` : `拒否 ${r.code} ${r.reason}`);
}
{
  const text = 'port def T; part sys { connect a.x to b.y; part a { port x : T; } part b { port y : T; } }';
  const a = analyze(text);
  const el = find(a.tree, e => e.name === 'x' && e.kind === 'PortUsage')[0];
  const r = deleteElement({ text, analysis: a, element: el });
  console.log('E2:', r.ok ? `持ち主 ${JSON.stringify(r.owner)} = 「${r.text.slice(r.owner.start, r.owner.end)}」` : `拒否 ${r.reason}`);
}
{
  const text = 'package P {\n    part def A;\n    part a : A; //* note\n continues */\n}\n';
  const a = analyze(text);
  const el = find(a.tree, e => e.name === 'a')[0];
  const r = appendView({ text, analysis: a, scope: el, view: 'interconnection' });
  console.log('E3:', r.ok ? JSON.stringify(r.text) : `拒否 ${r.reason} ${JSON.stringify(r.details)}`);
}
{
  const text = "interface def 'Bus'; port def T; part sys { part a { port x : T; } part b { port y : T; } }";
  const a = analyze(text);
  const owner = find(a.tree, e => e.name === 'sys')[0];
  const w0 = typeCandidates({ analysis: a, owner, kind: 'InterfaceDefinition' }), w1 = typeCandidates({ analysis: a, owner, kind: 'InterfaceDefinition', text });
  console.log('E6: text なし', JSON.stringify(w0.map(x => x.writing ?? x)), ' text あり', JSON.stringify(w1.map(x => x.writing ?? x)));
}
{
  const text = 'package P { part def A; part a : A; view v { expose a; } }';
  const a = analyze(text);
  const el = find(a.tree, e => e.name === 'a' && e.kind === 'PartUsage')[0];
  const r = deletePlan({ analysis: a, element: el, text });
  console.log('E7:', r.ok ? '消せる' : `${r.reason} ${JSON.stringify(r.details)}`);
}
