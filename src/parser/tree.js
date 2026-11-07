// 導出から構文木を作る(GR2 指示書 5.3 節)。
//
// 文法の代入の意味は KerML 1.0 の 8.2.1 節の表 3(SysML 2.0 の 8.2.2.1.1 節の表 28)による。
//   - 規則を代入の値として呼ぶと(p = R、p += R)、R が要素を作る規則なら新しい要素を作る。
//     要素を作る規則: 型(「: 型」、省略時は規則名)が抽象構文のメタクラスのもの。型がメタクラスにない規則でも、
//     本体に代入があれば要素を作る(型の名前はそのまま使う)。それ以外の規則(演算子・真偽値・名前など)は値の文字列になる。
//   - 規則を代入なしで呼ぶと、新しい要素を作らず、呼び出し元の要素への代入として読む。
//   - 要素の種類(本文に定めがなく、GR2 P2 の D1 案 K2 による): 要素を作った規則の型から始め、繰り返し(* と +)の
//     外で代入なしに呼んだ規則の型が、今の種類の下位のメタクラスのときだけ、その型に絞る。
//     例: DefinitionElement : Element = Package | … は Package に絞る。RootNamespace : Namespace = PackageBodyElement* は
//     繰り返しの中なので Namespace のまま。AnalysisCaseUsage が呼ぶ ConstraintUsageDeclaration : ConstraintUsage は
//     下位でないので絞らない。
//   - 子要素: 抽象構文で ownedRelationship の部分集合になる属性への代入は owned、ownedRelatedElement の部分集合に
//     なる属性への代入は related とする(OWNED・RELATED。出典は各属性の宣言)。{ ownedRelatedElement += p } は、
//     同じ要素の属性 p に入れた要素を related に加える。
//   - それ以外の属性に入った要素は子にしない(droppedElements に記録する)。
//   - 名前の参照([QualifiedName])は解決せず、書かれた字句のまま refs に持つ。
// 要素: { kind, name?, shortName?, owned: [], related: [], refs: {}, attrs: {}, start, end }
//   start と end は原文の範囲(文字列の位置。空の要素は start === end)。

import { unquote } from './lexer.js';

// 子要素になる属性(抽象構文の宣言)
//   ownedRelationship       KerML 8.3.2.1.2 Element(kerml10 L7244)
//   ownedTypeFeaturing      {subsets ownedRelationship}(kerml10 L10255)
//   ownedRelatedElement     KerML 8.3.2.1.4 Relationship(kerml10 L7473)
//   ownedMemberElement      {subsets ownedRelatedElement}(kerml10 L8558)
//   ownedMemberFeature      {redefines ownedMemberElement}(kerml10 L8983)
//   ownedMemberParameter    {redefines ownedMemberFeature}(kerml10 L12185)
//   value(FeatureValue)     {redefines ownedMemberElement}(kerml10 L14161)
//   ownedVariantUsage       {redefines ownedMemberElement}(sysml20 L17239)
export const OWNED = new Set(['ownedRelationship', 'ownedTypeFeaturing']);
export const RELATED = new Set(['ownedRelatedElement', 'ownedMemberElement', 'ownedMemberFeature',
  'ownedMemberParameter', 'value', 'ownedVariantUsage']);

export function makeTreeBuilder(g, table) {
  const { symName, symKind, prods } = g;
  const meta = table.metaclasses;
  const ruleType = (name) => table.rules[name][0];

  // 一般化をたどった祖先の集合
  const ancestorsCache = new Map();
  const ancestors = (t) => {
    let a = ancestorsCache.get(t);
    if (a) return a;
    a = new Set([t]);
    for (const s of meta[t] ?? []) for (const x of ancestors(s)) a.add(x);
    ancestorsCache.set(t, a);
    return a;
  };

  // 本体に代入があるか(代入なしで呼ぶ規則の中も含む)
  const assignCache = new Map();
  const hasAssign = (name) => {
    if (assignCache.has(name)) return assignCache.get(name);
    assignCache.set(name, false);
    const walk = (x) => {
      switch (x[0]) {
        case '=': case 'n': return true;
        case 'r': return !!table.rules[x[1]] && hasAssign(x[1]);
        case 'a': case 's': return x.slice(1).some(walk);
        case '*': case '+': case '?': return walk(x[1]);
        default: return false;
      }
    };
    const r = walk(table.rules[name][1]);
    assignCache.set(name, r);
    return r;
  };
  const isElementRule = (name) => {
    const t = ruleType(name);
    return t in meta || hasAssign(name);
  };
  // 本体が代入のない [QualifiedName] だけの規則(FeatureReference・InstantiatedTypeReference、kerml10 L6639・L6671)。
  // memberElement = FeatureReference のように呼ぶと、要素を作らず、名前の参照として refs に持つ(GR3 P1 の裁定 D0)。
  const isRefRule = (name) => table.rules[name][1][0] === 'q';

  // 繰り返しの補助記号の中身の代入(どの生成規則でも同じ)
  const repAnn = new Map();
  for (const p of prods) if (symKind[p.lhs] === 'rep') repAnn.set(p.lhs, p.ann[p.ann.length - 1] ?? null);

  // 字句の列 toks について、導出を読む関数の組を作る
  // onElement は任意(GR4 P3 の裁定 Q25)。要素を 1 つ作るごとに呼ぶ
  function session(toks, onElement) {
    const n = toks.length;
    const droppedElements = [];
    const posOf = (i) => i < n ? toks[i].start : (n ? toks[n - 1].end : 0);
    const rangeOf = (d) => d.i === d.j ? [posOf(d.i), posOf(d.i)] : [toks[d.i].start, toks[d.j - 1].end];
    const textOf = (d) => toks.slice(d.i, d.j).map(t => t.text).join(d.j - d.i > 1 ? ' ' : '');

    // 要素を作るところ(valueOf の create)と、子の導出を同じ要素に読むところ(apply の fill)は、呼び出しを深くしないよう、生成関数の
    // yield で [導出, 規則名]・['fill', 導出, 要素] を頼み、run が明示のスタックで回す(設計書 2.6 節 v18.1。GR18 の B1)。
    // 要素を作る順序と中身は、再帰で呼んでいたときと同じ
    function* createGen(d, ruleName) {
      const E = newElement(d, ruleType(ruleName));
      yield* fillGen(d, E);
      return finish(E);
    }
    function run(gen) {
      const stack = [gen];
      let input;
      for (;;) {
        const r = stack[stack.length - 1].next(input);
        input = undefined;
        if (r.done) { stack.pop(); if (!stack.length) return r.value; input = r.value; continue; }
        const q = r.value;
        stack.push(q[0] === 'fill' ? fillGen(q[1], q[2]) : createGen(q[0], q[1]));
      }
    }
    const create = (d, ruleName) => run(createGen(d, ruleName));
    const fill = (d, E) => run(fillGen(d, E));
    function newElement(d, declared) {
      const [start, end] = rangeOf(d);
      if (onElement !== undefined) onElement();
      return { kind: declared, narrowed: [], owned: [], related: [], refs: {}, attrs: {}, props: {}, start, end, inRep: 0 };
    }
    function finish(E) {
      const kind = E.kind;
      for (const [prop, v] of Object.entries(E.props)) {
        if (v && typeof v === 'object' && v.kind && !v.consumed) droppedElements.push({ prop, kind: v.kind, owner: kind, start: v.start });
      }
      const out = { kind };
      if (E.name !== undefined) out.name = E.name;
      if (E.shortName !== undefined) out.shortName = E.shortName;
      out.owned = E.owned;
      out.related = E.related;
      out.refs = E.refs;
      out.attrs = E.attrs;
      out.start = E.start;
      out.end = E.end;
      return out;
    }
    function* fillGen(d, E) {
      if (d.rep) {
        const ann = repAnn.get(d.sym) ?? null;
        E.inRep++;
        for (const k of d.kids) yield* applyGen(k, ann, E);
        E.inRep--;
        return;
      }
      const p = d.prod;
      let a = 0;
      for (let k = 0; k <= d.kids.length; k++) {
        while (a < p.acts.length && p.acts[a].at === k) act(p.acts[a++], E);
        if (k < d.kids.length) yield* applyGen(d.kids[k], p.ann[k], E);
      }
    }
    function* applyGen(c, ann, E) {
      if ('tok' in c) {
        if (ann && ann.prop) assign(E, ann, toks[c.tok].text, false);
        return;
      }
      const kind = symKind[c.sym];
      if (!ann) {
        if (kind !== 'rule') { yield ['fill', c, E]; return; }
        const name = symName[c.sym];
        if (!isElementRule(name)) return;
        const t = ruleType(name);
        if (!E.inRep && t in meta && t !== E.kind && ancestors(t).has(E.kind)) { E.kind = t; E.narrowed.push(t); }
        yield ['fill', c, E];
        return;
      }
      if (ann.ref || (kind === 'rule' && isRefRule(symName[c.sym]))) { assign(E, ann, textOf(c), true); return; }
      assign(E, ann, yield* valueOfGen(c), false);
    }
    function* valueOfGen(c) {
      // 括弧の中の選択(kind = ( 'at' | 'after' )、ownedRelatedElement += ( A | B ))は、中身が 1 つならその値(繰り返しでたどる)
      for (;;) {
        if ('tok' in c) return toks[c.tok].text;
        const kind = symKind[c.sym];
        if (kind === 'rule') {
          const name = symName[c.sym];
          return isElementRule(name) ? yield [c, name] : textOf(c);
        }
        const sig = c.kids.filter(k => 'tok' in k || k.i !== k.j || symKind[k.sym] === 'rule');
        if (sig.length !== 1) return textOf(c);
        c = sig[0];
      }
    }
    function assign(E, ann, v, isRef) {
      const prop = ann.prop;
      if (isRef) {
        if (ann.op === '+=') (E.refs[prop] ??= []).push(v);
        else E.refs[prop] = v;
        return;
      }
      if (v && typeof v === 'object') {
        if (OWNED.has(prop)) E.owned.push(v);
        else if (RELATED.has(prop)) E.related.push(v);
        else E.props[prop] = v;
        return;
      }
      if (ann.op === '?=') { E.attrs[prop] = true; return; }
      if (prop === 'declaredName') { E.name = unquote(v); return; }
      if (prop === 'declaredShortName') { E.shortName = unquote(v); return; }
      if (ann.op === '+=') (E.attrs[prop] ??= []).push(v);
      else E.attrs[prop] = v;
    }
    function act(a, E) {
      if (a.value[0] === 'p' && a.value[1] !== 'this') {
        const v = E.props[a.value[1]];
        if (v && typeof v === 'object' && (OWNED.has(a.prop) || RELATED.has(a.prop))) {
          v.consumed = true;
          (OWNED.has(a.prop) ? E.owned : E.related).push(v);
        }
        return;
      }
      if (a.value[0] === 't' || a.value[0] === 'b') {
        if (!a.prop.includes('.')) E.attrs[a.prop] = a.value[1];
      }
    }

    return { create, fill, finish, newElement, droppedElements };
  }

  // 明示のスタックでたどる(GR18 の B1)
  const clean = (e0) => { const st = [e0]; while (st.length) { const e = st.pop(); delete e.consumed; for (const c of e.owned) st.push(c); for (const c of e.related) st.push(c); } };

  // 始点の導出 root から構文木を作る
  function build(root, toks, onElement) {
    const s = session(toks, onElement);
    const tree = s.create(root, table.start);
    clean(tree);
    return { tree, droppedElements: s.droppedElements };
  }

  // 曖昧さの判定に使う署名: 導出 d が作るもの(範囲を除く)を文字列にする。
  // 要素を作る規則の節ならその要素、それ以外(補助の記号など)は、仮の要素に代入なしで読んだ中身。
  function signature(d, toks) {
    const s = session(toks);
    let v;
    if (symKind[d.sym] === 'rule' && isElementRule(symName[d.sym])) {
      v = s.create(d, symName[d.sym]);
    } else {
      // 補助の記号の中身は呼び出し元の要素に入る。仮の要素(種類 Element)に読み、中身が絞った種類の列を署名に入れる。
      // ただし空の範囲の中身(省略できる MemberPrefix など)は要素を作らない限り木を変えないので、種類の列を入れない。
      const E = s.newElement(d, 'Element');
      s.fill(d, E);
      v = s.finish(E);
      delete v.kind;
      if (d.i !== d.j) v.narrowed = E.narrowed;
    }
    return JSON.stringify(v, (k, x) => (k === 'start' || k === 'end' || k === 'consumed') ? undefined : x);
  }

  return { build, signature };
}

// 構文木の要素を、前順(要素、owned の子を順に、related の子を順に)でたどり、visit(要素, 親) を呼ぶ。再帰でたどるのと同じ順序で、
// 明示のスタックを使う(入れ子の深さに比例して呼び出しを深くしない。設計書 2.6 節 v18.1。GR18 の B1)
export function walkTree(root, visit) {
  const stack = [[root, null]];
  while (stack.length) {
    const [e, p] = stack.pop();
    visit(e, p);
    for (let k = e.related.length - 1; k >= 0; k--) stack.push([e.related[k], e]);
    for (let k = e.owned.length - 1; k >= 0; k--) stack.push([e.owned[k], e]);
  }
}
