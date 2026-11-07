// Earley 法による解析(設計書 2.6 節、GR2 指示書 5.3 節)。
//
// 文法の表(grammar_table.js)の EBNF を BNF に展開して解釈する。
//   - 選択・並びの入れ子は補助の非終端記号にする。繰り返しは左再帰の補助規則(X → ε | X Y、X → Y | X Y)、
//     省略は X → ε | Y にする。
//   - 予測は先読みの字句と FIRST 集合で絞る。空になりうる規則は Aycock-Horspool の方法で扱う。
//   - 文法に引用符で書かれた語のうち予約語でないもの(KerML 側の 'typed' など)は、同じ綴りの引用符なしの名前の
//     字句にも一致させる(文脈によるキーワード)。
// 認識が成功したら、項目の集合から導出を右から左へたどって取り出す(derive)。
//   - 演算子の優先順位と結合性は、KerML 1.0 の 8.2.5.8.1 節の表 6 と注 2 に従い、導出を取り出すときに
//     合わない選択肢を除く(OPERATOR_LEVELS)。
//   - それでも選択肢が 2 つ以上残る箇所には、解消の規則(RESOLUTION_RULES。本文に定めがなく、GR2 P2 の
//     D4 の裁定による)を当てる。選択肢の構文木(tree.js の意味)がすべて同じなら、展開に由来する見かけの
//     曖昧さとして扱う。どちらでもないものは解消せず(最初の選択肢を仮に使う)、ambiguities に入れて返す。

const TOKEN_CLASSES = ['NAME', 'DECIMAL_VALUE', 'EXPONENTIAL_VALUE', 'STRING_VALUE', 'REGULAR_COMMENT'];

// 表 6(高い順)。数が大きいほど強く結び付く。注 2: 2 項演算子は ^ と ** だけ右結合、ほかは左結合。
export const OPERATOR_LEVELS = {
  unary: { all: 14, '+': 13, '-': 13, '~': 13, not: 13 },
  binary: {
    '^': 12, '**': 12,
    '*': 11, '/': 11, '%': 11,
    '+': 10, '-': 10,
    '..': 9,
    '<': 8, '>': 8, '<=': 8, '>=': 8,
    istype: 7, hastype: 7, '@': 7, '@@': 7, as: 7, meta: 7,
    '==': 6, '!=': 6, '===': 6, '!==': 6,
    '&': 5, and: 5,
    xor: 4,
    '|': 3, or: 3,
    implies: 2,
    '??': 1,
  },
  ternary: { if: 0 },
};
const RIGHT_ASSOC_LEVEL = 12;
// 演算子の式を作る規則(KerML 1.0 の 8.2.5.8.1 節)と、その種類
const OPERATOR_RULES = {
  ConditionalExpression: 'ternary',
  ConditionalBinaryOperatorExpression: 'binary',
  BinaryOperatorExpression: 'binary',
  UnaryOperatorExpression: 'unary',
  ClassificationExpression: 'binary',
  MetaclassificationExpression: 'binary',
  ExtentExpression: 'unary',
};
const OPERAND_RULES = new Set(['ArgumentMember', 'ArgumentExpressionMember']);

// 曖昧さの解消の規則(GR2 P2 の D4 の裁定。A1 は手当て E57 で文法から曖昧さがなくなった)。
//   A2  EndUsagePrefix の ( OwnedCrossFeatureMember )? が空の範囲に一致するときは、交差の特徴を作らない
//       (OwnedCrossFeature = BasicUsagePrefix UsageDeclaration が空の列にも一致するため)
//   A3  AssignmentNodeDeclaration で対象の束縛(AssignmentTargetMember)と FeatureChainMember の境目が
//       決まらないときは、束縛のある(AssignmentTargetMember が空でない)選択肢を採る
//   A4  名前だけの型付け(合成で SysML の OwnedFeatureTyping になった KerML の NonFeatureElement の選択肢
//       FeatureTyping)を要素として読む選択肢を採らない。NonFeatureElement には式の本体(FunctionBodyPart)を
//       通らないと届かないので、この規則が効くのは式の本体の中だけ
export const RESOLUTION_RULES = ['A2', 'A3', 'A4'];

export function compileGrammar(table) {
  const symId = new Map();
  const symName = [];
  const isTerm = [];
  const symKind = [];       // 'rule' | 'group' | 'rep' | 'term'
  const sym = (key, kind) => {
    if (!symId.has(key)) { symId.set(key, symName.length); symName.push(key); isTerm.push(kind === 'term'); symKind.push(kind); }
    return symId.get(key);
  };
  const tokenClass = new Set(TOKEN_CLASSES);
  const prods = [];         // { id, lhs, rhs, ann, acts }
  let aux = 0, curRule = '';
  const addProd = (lhs, rhs, ann, acts) => { const p = { id: prods.length, lhs, rhs, ann, acts }; prods.push(p); return p; };
  const words = new Set();

  // 1 つの要素を記号にする。{ sym, ann } か { act } か null(空)を返す。
  function item(x) {
    switch (x[0]) {
      case 't': {
        if (/^[A-Za-z_]\w*$/.test(x[1])) words.add(x[1]);
        return { sym: sym(`'${x[1]}'`, 'term'), ann: null };
      }
      case 'r':
        if (tokenClass.has(x[1])) return { sym: sym(x[1], 'term'), ann: null };
        if (!table.rules[x[1]]) throw new Error(`文法の表にない規則 ${x[1]}`);
        return { sym: sym(x[1], 'rule'), ann: null };
      case 'q':
        if (!table.rules[x[1]]) throw new Error(`文法の表にない規則 ${x[1]}`);
        return { sym: sym(x[1], 'rule'), ann: { ref: true } };
      case '=': {
        const v = item(x[3]);
        if (!v || !('sym' in v)) throw new Error(`代入 ${x[1]} の値が空`);
        return { sym: v.sym, ann: { prop: x[1], op: x[2], ref: v.ann?.ref ?? false } };
      }
      case 'n':
        return { act: { prop: x[1], op: x[2], value: x[3] } };
      case 'e':
        return null;
      case 'a': case 's': {
        const n = sym(`${curRule}#${aux++}`, 'group');
        rule(n, x);
        return { sym: n, ann: null };
      }
      case '*': case '+': case '?': {
        const n = sym(`${curRule}#${aux++}`, x[0] === '?' ? 'group' : 'rep');
        const y = item(x[1]);
        if (!y || !('sym' in y)) throw new Error('繰り返しの中身が空');
        if (x[0] === '?') { addProd(n, [], [], []); addProd(n, [y.sym], [y.ann], []); }
        else if (x[0] === '*') { addProd(n, [], [], []); addProd(n, [n, y.sym], [null, y.ann], []); }
        else { addProd(n, [y.sym], [y.ann], []); addProd(n, [n, y.sym], [null, y.ann], []); }
        return { sym: n, ann: null };
      }
      default:
        throw new Error(`知らない形 ${x[0]}`);
    }
  }
  function rule(lhs, x) {
    const alts = x[0] === 'a' ? x.slice(1) : [x];
    for (const a of alts) {
      const seq = a[0] === 's' ? a.slice(1) : [a];
      const rhs = [], ann = [], acts = [];
      for (const y of seq) {
        const v = item(y);
        if (!v) continue;
        if ('act' in v) acts.push({ at: rhs.length, ...v.act });
        else { rhs.push(v.sym); ann.push(v.ann); }
      }
      addProd(lhs, rhs, ann, acts);
    }
  }
  const ruleSym = new Map();
  for (const name of Object.keys(table.rules)) ruleSym.set(name, sym(name, 'rule'));
  for (const [name, [, body]] of Object.entries(table.rules)) { curRule = name; rule(ruleSym.get(name), body); }
  const start = ruleSym.get(table.start);

  const N = symName.length;
  const nullable = new Uint8Array(N);
  for (let ch = true; ch;) {
    ch = false;
    for (const p of prods) if (!nullable[p.lhs] && p.rhs.every(s => !isTerm[s] && nullable[s])) { nullable[p.lhs] = 1; ch = true; }
  }
  const first = Array.from({ length: N }, (_, s) => isTerm[s] ? new Set([s]) : new Set());
  for (let ch = true; ch;) {
    ch = false;
    for (const p of prods) {
      const f = first[p.lhs];
      for (const s of p.rhs) {
        for (const t of first[s]) if (!f.has(t)) { f.add(t); ch = true; }
        if (isTerm[s] || !nullable[s]) break;
      }
    }
  }
  const prodsOf = Array.from({ length: N }, () => []);
  for (const p of prods) {
    const f = new Set();
    let nul = true;
    for (const s of p.rhs) { for (const t of first[s]) f.add(t); if (isTerm[s] || !nullable[s]) { nul = false; break; } }
    p.first = f;
    p.nullable = nul;
    prodsOf[p.lhs].push(p);
  }
  // 演算子の規則の生成規則に印を付ける。演算子(operator への代入)と被演算子(ArgumentMember など)は、
  // ClassificationExpression のように括弧の中(補助の記号)にあることがあるので、補助の記号の中も探す。
  const holdsOperator = new Uint8Array(N), holdsOperand = new Uint8Array(N);
  for (const [name, id] of symId) if (OPERAND_RULES.has(name)) holdsOperand[id] = 1;
  for (let ch = true; ch;) {
    ch = false;
    for (const p of prods) {
      if (symKind[p.lhs] !== 'group') continue;
      p.rhs.forEach((s, k) => {
        if (!holdsOperator[p.lhs] && (p.ann[k]?.prop === 'operator' || holdsOperator[s])) { holdsOperator[p.lhs] = 1; ch = true; }
        if (!holdsOperand[p.lhs] && holdsOperand[s]) { holdsOperand[p.lhs] = 1; ch = true; }
      });
    }
  }
  for (const p of prods) {
    p.op = OPERATOR_RULES[symName[p.lhs]] ?? null;
    p.bareTyping = symName[p.lhs] === 'NonFeatureElement' && p.rhs.length === 1 && symName[p.rhs[0]] === 'FeatureTyping';
  }
  const kw = new Set(table.keywords);
  const contextual = new Set([...words].filter(w => !kw.has(w)));
  return { symId, symName, isTerm, symKind, prods, prodsOf, nullable, first, start, contextual, N, holdsOperator, holdsOperand };
}

// 字句が一致する終端記号の番号の配列
function makeTermsOf(g) {
  const { symId, contextual } = g;
  const cache = new Map();
  return (tok) => {
    const key = tok.kind === 'NAME' || tok.kind === 'KEYWORD' || tok.kind === 'SYMBOL' ? `${tok.kind}:${tok.text}` : tok.kind;
    let r = cache.get(key);
    if (r) return r;
    r = [];
    if (tok.kind === 'NAME') {
      r.push(symId.get('NAME'));
      if (contextual.has(tok.text) && symId.has(`'${tok.text}'`)) r.push(symId.get(`'${tok.text}'`));
    } else if (tok.kind === 'KEYWORD' || tok.kind === 'SYMBOL') {
      if (symId.has(`'${tok.text}'`)) r.push(symId.get(`'${tok.text}'`));
    } else if (symId.has(tok.kind)) r.push(symId.get(tok.kind));
    r = r.filter(x => x !== undefined);
    cache.set(key, r);
    return r;
  };
}

// 進み具合を知らせる間隔(字句の数)。GR4 P3 の裁定 Q25
export const PROGRESS_STEP = 256;

export function makeRecognizer(g) {
  const { isTerm, prodsOf, nullable, start } = g;
  const termsOf = makeTermsOf(g);
  const DOT = 64, ORIG = 1 << 20;

  // onToken(i, n) は任意(GR4 P3 の裁定 Q25)。字句 PROGRESS_STEP 個ごとに、処理した字句の数と全体の字句の数を知らせる
  return function recognize(toks, onToken) {
    const n = toks.length;
    const tokTerms = toks.map(t => termsOf(t));
    const sets = [];
    const newSet = () => ({ items: [], keys: new Set(), waiting: new Map(), done: new Map() });
    const add = (set, p, dot, origin) => {
      const key = (p.id * DOT + dot) * ORIG + origin;
      if (set.keys.has(key)) return;
      set.keys.add(key);
      set.items.push(p, dot, origin);
    };
    const okFirst = (p, i) => {
      if (p.nullable) return true;
      if (i >= n) return false;
      const ts = tokTerms[i];
      for (let k = 0; k < ts.length; k++) if (p.first.has(ts[k])) return true;
      return false;
    };
    sets.push(newSet());
    for (const p of prodsOf[start]) if (okFirst(p, 0)) add(sets[0], p, 0, 0);
    let failAt = -1;
    for (let i = 0; i <= n; i++) {
      if (onToken !== undefined && i % PROGRESS_STEP === 0) onToken(i, n);
      const set = sets[i];
      const next = i < n ? newSet() : null;
      if (next) sets.push(next);
      const predicted = new Set();
      const its = set.items;
      for (let k = 0; k < its.length; k += 3) {
        const p = its[k], dot = its[k + 1], origin = its[k + 2];
        if (dot < p.rhs.length) {
          const s = p.rhs[dot];
          if (isTerm[s]) {
            if (next && tokTerms[i].includes(s)) add(next, p, dot + 1, origin);
          } else {
            let w = set.waiting.get(s);
            if (!w) { w = []; set.waiting.set(s, w); }
            w.push(p, dot, origin);
            if (!predicted.has(s)) {
              predicted.add(s);
              for (const q of prodsOf[s]) if (okFirst(q, i)) add(set, q, 0, i);
            }
            if (nullable[s]) add(set, p, dot + 1, origin);
            else if (set.done.get(s)?.has(i)) add(set, p, dot + 1, origin);
          }
        } else {
          const lhs = p.lhs;
          let d = set.done.get(lhs);
          if (!d) { d = new Set(); set.done.set(lhs, d); }
          if (d.has(origin)) continue;
          d.add(origin);
          const w = sets[origin].waiting.get(lhs);
          if (w) for (let m = 0; m < w.length; m += 3) add(set, w[m], w[m + 1] + 1, w[m + 2]);
        }
      }
      if (next && next.items.length === 0) { failAt = i; break; }
    }
    const accepted = failAt < 0 && sets[n].done.get(start)?.has(0) === true;
    return { sets, tokTerms, accepted, failAt: failAt >= 0 ? failAt : (accepted ? -1 : n) };
  };
}

// 失敗した位置 i で期待されていた終端記号の名前
export function expectedAt(g, sets, i) {
  const { isTerm, first, symName } = g;
  const out = new Set();
  const its = sets[i].items;
  for (let k = 0; k < its.length; k += 3) {
    const p = its[k], dot = its[k + 1];
    if (dot >= p.rhs.length) continue;
    const s = p.rhs[dot];
    if (isTerm[s]) out.add(symName[s]);
    else for (const t of first[s]) out.add(symName[t]);
  }
  return [...out].sort();
}

// ---- 導出の取り出し ----
// 結果の節: { sym, i, j, prod, kids } kids の要素は節か { tok: 字句の番号 }。
//            繰り返しの補助記号は { sym, i, j, rep: true, kids: [中身の節...] }(左から順に平らにしたもの)。
export function makeDeriver(g, opts) {
  const { isTerm, symKind, prodsOf, symName, nullable, holdsOperator, holdsOperand } = g;
  const DOT = 64, ORIG = 1 << 20;
  const signatureOf = opts.signatureOf;   // (node, toks) → 文字列。曖昧さが意味に効くかを調べる

  return function derive(rec, toks) {
    const { sets, tokTerms } = rec;
    const n = toks.length;
    const has = (p, dot, origin, k) => sets[k].keys.has((p.id * DOT + dot) * ORIG + origin);
    const doneFrom = (s, j) => sets[j].done.get(s);
    const memo = new Map();
    const ambiguities = [];
    const W = n + 1;
    const consIndex = (c) => c === null ? 0 : 1 + c.level * 3 + (c.side === 'L' ? 0 : c.side === 'R' ? 1 : 2);

    // 子の区切りの列挙: 生成規則 p が [i, j] を覆う区切りを返す。各区切りは [{sym, i, j} か {tok}] の配列
    // 2 項演算子の生成規則で、演算子が 1 字句の記号(BinaryOperator など)のもの: 右の被演算子の始まり k の手前の字句が演算子なので、
    // その優先順位が制約 cons で許されない区切りは、ここで除く(build が operatorOf と allowed で除くものと同じ。区切りの列挙と、
    // 被演算子の導出を省くだけで、結果は変えない。長い式の導出の時間を詰める。GR18 の B1)
    const opTokPos = new Map();
    const singleTok = (sym) => !isTerm[sym] && prodsOf[sym].length > 0 && prodsOf[sym].every(q => q.rhs.length === 1 && isTerm[q.rhs[0]]);
    const opTokOf = (p) => {
      let v = opTokPos.get(p);
      if (v !== undefined) return v;
      v = -1;
      if (p.op === 'binary') {
        const k = p.ann.findIndex(a => a && a.prop === 'operator');
        if (k > 0 && k + 1 < p.rhs.length && singleTok(p.rhs[k]) && !p.rhs.slice(0, k).some(x => isTerm[x] || holdsOperator[x])) v = k;
      }
      opTokPos.set(p, v);
      return v;
    };
    // 2 項演算子の優先順位(OPERATOR_LEVELS.binary の値)ごとの、その演算子の字句の数の累計(字句の位置ごと)。区切り [i, end) の中に、
    // 制約 cons で許される優先順位の演算子の字句が 1 つもなければ、上の除き方で区切りが 1 つも残らないので、列挙そのものを省く
    const LEVELS = [...new Set(Object.values(OPERATOR_LEVELS.binary))];
    let levelCount = null;
    const noAllowedOperator = (c, i, end) => {
      if (!levelCount) {
        levelCount = new Map(LEVELS.map(lv => [lv, new Int32Array(n + 1)]));
        for (const [lv, a] of levelCount) for (let t = 0; t < n; t++) a[t + 1] = a[t] + (OPERATOR_LEVELS.binary[toks[t].text] === lv ? 1 : 0);
      }
      for (const lv of LEVELS) if (allowed(c, lv)) { const a = levelCount.get(lv); if (a[end] - a[i] > 0) return false; }
      return true;
    };
    function splits(p, i, j, cons = null) {
      const out = [];
      const rhs = p.rhs;
      const acc = new Array(rhs.length);
      const opk = cons !== null ? opTokOf(p) : -1;
      const walk = (dot, end) => {
        if (dot === 0) { if (end === i) out.push(acc.slice()); return; }
        const s = rhs[dot - 1];
        if (isTerm[s]) {
          if (end > i && tokTerms[end - 1].includes(s) && has(p, dot - 1, i, end - 1)) {
            acc[dot - 1] = { tok: end - 1 };
            walk(dot - 1, end - 1);
          }
          return;
        }
        const d = doneFrom(s, end);
        if (!d) return;
        // 最初の記号は i から始まるものだけが区切りになる(下の walk(0, k) は k === i のときだけ区切りを足す)ので、d を全部見ない
        // (結果は同じ。単位の生成規則の列挙を詰める。GR18 の B1)
        if (dot === 1) {
          if (d.has(i) && has(p, 0, i, i)) { acc[0] = { sym: s, i, j: end }; walk(0, i); }
          return;
        }
        if (opk >= 0 && dot - 1 === opk + 1 && noAllowedOperator(cons, i, end)) return;
        for (const k of d) {
          if (k < i) continue;
          if (opk >= 0 && dot - 1 === opk + 1 && k > i) {
            const lv = OPERATOR_LEVELS.binary[toks[k - 1].text];
            if (lv !== undefined && !allowed(cons, lv)) continue;
          }
          if (!has(p, dot - 1, i, k)) continue;
          acc[dot - 1] = { sym: s, i: k, j: end };
          walk(dot - 1, k);
        }
      };
      walk(rhs.length, j);
      return out;
    }

    // 演算子の生成規則の区切り sp から、演算子の字句と、それを含む子の位置を探す。
    // 補助の記号の中にあるときは、その記号の導出をたどる(制約なしの導出で十分。演算子の字句は導出によらない)。
    // 導出の子(node)を求めるところは、呼び出しを深くしないよう、生成関数の yield で求める(下の node の説明。GR18 の B1)
    function* operatorOf(p, sp) {
      for (let k = 0; k < p.rhs.length; k++) {
        const a = p.ann[k], c = sp[k];
        if (a && a.prop === 'operator') return { text: 'tok' in c ? toks[c.tok].text : spanText(c), pos: k };
        if (!('tok' in c) && holdsOperator[c.sym]) {
          const key = keyOf(c.sym, c.i, c.j, null);
          const d = memo.has(key) ? memo.get(key) : yield [c.sym, c.i, c.j, null, key];
          const t = operatorIn(d);
          if (t !== null) return { text: t, pos: k };
        }
      }
      return null;
    }
    // 導出 d の中の演算子の字句(子を前から順に、深さ優先で探す)。明示のスタックでたどる(GR18 の B1)
    function operatorIn(d0) {
      if (!d0 || d0.rep) return null;
      const stack = [[d0, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const d = top[0];
        if (top[1] >= d.kids.length) { stack.pop(); continue; }
        const k = top[1]++;
        const a = d.prod.ann[k], c = d.kids[k];
        if (a && a.prop === 'operator') return 'tok' in c ? toks[c.tok].text : spanText(c);
        if (!('tok' in c) && holdsOperator[c.sym] && c && !c.rep) stack.push([c, 0]);
      }
      return null;
    }
    const spanText = (c) => toks.slice(c.i, c.j).map(t => t.text).join(' ');
    function levelOf(kind, op) {
      if (kind === 'ternary') return 0;
      if (kind === 'unary') return OPERATOR_LEVELS.unary[op];
      return OPERATOR_LEVELS.binary[op];
    }
    const allowed = (c, level) => {
      if (c === null) return true;
      if (c.side === 'U') return level >= c.level;
      if (level > c.level) return true;
      if (level < c.level) return false;
      return c.side === 'L' ? c.level !== RIGHT_ASSOC_LEVEL : c.level === RIGHT_ASSOC_LEVEL;
    };

    // 1 つの区切りを、制約 cons のもとで子の導出に変える。合わなければ null
    function* build(p, i, j, sp, cons) {
      let childCons = null;
      let opInfo = null;
      if (p.op) {
        const o = yield* operatorOf(p, sp);
        const level = o === null ? undefined : levelOf(p.op, o.text);
        if (level === undefined) {
          opInfo = { level: -1 };
        } else {
          if (!allowed(cons, level)) return null;
          opInfo = { level, opPos: o.pos };
        }
      }
      // 単位の生成規則(空でない子が 1 つだけで、それが全体を覆い、終端記号の子がない)なら制約をそのまま渡す
      let unitPos = -1;
      if (!p.op && cons !== null) {
        let nonEmpty = 0, pos = -1, term = false;
        for (let k = 0; k < sp.length; k++) {
          if ('tok' in sp[k]) { term = true; break; }
          if (sp[k].i !== sp[k].j) { nonEmpty++; pos = k; }
        }
        if (!term && nonEmpty === 1 && sp[pos].i === i && sp[pos].j === j) unitPos = pos;
      }
      const kids = new Array(sp.length);
      for (let k = 0; k < sp.length; k++) {
        const c = sp[k];
        if ('tok' in c) { kids[k] = c; continue; }
        let cc = null;
        if (k === unitPos) cc = cons;
        else if (opInfo && opInfo.level >= 0 && p.op !== 'ternary' && k !== opInfo.opPos && holdsOperand[c.sym]) {
          if (p.op === 'unary') cc = { level: opInfo.level, side: 'U' };
          else cc = { level: opInfo.level, side: k < opInfo.opPos ? 'L' : 'R' };
        }
        const key = keyOf(c.sym, c.i, c.j, cc);
        const d = memo.has(key) ? memo.get(key) : yield [c.sym, c.i, c.j, cc, key];
        if (!d) return null;
        kids[k] = d;
      }
      const bare = p.bareTyping || kids.some(k => k.bare);
      return { sym: p.lhs, i, j, prod: p, kids, ...(bare ? { bare: true } : {}) };
    }

    // 繰り返しの補助記号を平らにたどる(深い再帰を避ける)。
    // [i, j] の中で X が i から完了している位置 e を前から順に見て、e までの区切りの候補(最後の項目と、その前の位置 k)を
    // 求める(動的計画法)。そのあと j から後ろへ、候補を選びながらたどる。候補が 2 つ以上あるところで A4 を当て、
    // なお残れば曖昧さとして記録する。A4 は最後の項目だけでなく、その前の部分も見て判定する(bare)。
    function* repNode(s, i, j, cons) {
      const opts = new Map();      // e → 候補 [{ base, k, d, bare }]
      const bareAt = new Map();    // e → e までの区切りで、名前だけの型付けを避けられないか
      function* candsAt(end) {
        const cands = [];
        for (const p of prodsOf[s]) {
          if (p.rhs.length === 0) { if (end === i) cands.push({ base: true }); continue; }
          const y = p.rhs[p.rhs.length - 1];
          if (p.rhs.length === 1) {
            // X → Y(+ の始まり)
            if (isTerm[y]) { if (end === i + 1 && tokTerms[i].includes(y)) cands.push({ base: true, last: { tok: i } }); continue; }
            if (doneFrom(y, end)?.has(i)) cands.push({ base: true, last: { sym: y, i, j: end } });
            continue;
          }
          // X → X Y
          if (isTerm[y]) {
            if (end > i && tokTerms[end - 1].includes(y) && has(p, 1, i, end - 1)) cands.push({ k: end - 1, last: { tok: end - 1 } });
            continue;
          }
          const d = doneFrom(y, end);
          if (!d) continue;
          for (const k of d) if (k >= i && k < end && has(p, 1, i, k)) cands.push({ k, last: { sym: y, i: k, j: end } });
        }
        const ok = [];
        for (const c of cands) {
          if (!c.base && !opts.has(c.k)) continue;          // その前の部分が導出できない
          let d = null;
          if (c.last && 'tok' in c.last) d = c.last;
          else if (c.last) { const key = keyOf(c.last.sym, c.last.i, c.last.j, null); d = memo.has(key) ? memo.get(key) : yield [c.last.sym, c.last.i, c.last.j, null, key]; }
          if (c.last && !d) continue;
          ok.push({ base: !!c.base, k: c.k, d, bare: !!d?.bare || (!c.base && bareAt.get(c.k)) });
        }
        return ok;
      }
      for (let e = i; e <= j; e++) {
        if (e !== j && !doneFrom(s, e)?.has(i)) continue;
        const ok = yield* candsAt(e);
        if (!ok.length) continue;
        opts.set(e, ok);
        bareAt.set(e, ok.every(o => o.bare));
      }
      if (!opts.has(j)) return null;
      const items = [];
      let end = j;
      for (;;) {
        let pick = opts.get(end);
        if (pick.length > 1) {
          const nb = pick.filter(o => !o.bare);
          if (nb.length && nb.length < pick.length) { resolved('A4', end - 1); pick = nb; }
          if (pick.length > 1) noteAmbiguity(s, i, end, pick.map(o => ({ rep: true, last: o.d, base: o.base, k: o.k })));
        }
        const o = pick[0];
        if (o.d) items.push(o.d);
        if (o.base) break;
        end = o.k;
      }
      items.reverse();
      const bare = items.some(k => k.bare);
      return { sym: s, i, j, rep: true, kids: items, ...(bare ? { bare: true } : {}) };
    }

    const resolutions = {};
    function resolved(rule, at) { (resolutions[rule] ??= []).push(at); }
    // 解消の規則を当て、残った選択肢を返す
    function resolve(s, i, j, alts) {
      const name = symName[s];
      let r = alts;
      if (name.startsWith('EndUsagePrefix#') && i === j) {
        const x = r.filter(d => d.prod.rhs.length === 0);
        if (x.length && x.length < r.length) { resolved('A2', i); r = x; }
      }
      if (name === 'AssignmentNodeDeclaration') {
        const pos = (d) => d.prod.rhs.findIndex(t => symName[t] === 'AssignmentTargetMember');
        const x = r.filter(d => { const k = d.kids[pos(d)]; return k && k.i < k.j; });
        if (x.length && x.length < r.length) { resolved('A3', i); r = x; }
      }
      const nb = r.filter(d => !d.bare);
      if (nb.length && nb.length < r.length) { resolved('A4', i); r = nb; }
      return r;
    }

    function noteAmbiguity(s, i, j, alts) {
      // 意味の署名が全部同じなら記録しない
      const sigs = alts.map(a => signatureOf(a.rep ? { sym: s, i, j, rep: true, kids: a.last ? [a.last] : [] } : a, toks));
      if (sigs.every(x => x === sigs[0])) return;
      ambiguities.push({ sym: symName[s], i, j, alts, sigs });
    }

    // 導出の節 (s, i, j, cons)。子の節を求めるところ(build・repNode・operatorOf)は生成関数で、求める節を
    // [s, i, j, cons, key] として yield し、結果を受け取る。node はそれを明示のスタックで回すので、入れ子の深さや式の長さに比例して
    // 呼び出しが深くならない(設計書 2.6 節 v18.1。GR18 の B1)。節を求める順序と、覚える値(循環する導出を断つ null を含む)は、
    // 再帰で呼んでいたときと同じ
    const keyOf = (s, i, j, cons) => ((s * W + i) * W + j) * 64 + consIndex(cons);
    function* nodeGen(s, i, j, cons, key) {
      memo.set(key, null);   // 循環する導出を断つ
      let result = null;
      if (symKind[s] === 'rep') {
        result = yield* repNode(s, i, j, cons);
      } else {
        const found = [];
        for (const p of prodsOf[s]) {
          if (!has(p, p.rhs.length, i, j)) continue;
          for (const sp of splits(p, i, j, cons)) {
            const d = yield* build(p, i, j, sp, cons);
            if (d) found.push(d);
          }
        }
        const pick = found.length > 1 ? resolve(s, i, j, found) : found;
        if (pick.length > 1) noteAmbiguity(s, i, j, pick);
        result = pick[0] ?? null;
      }
      memo.set(key, result);
      return result;
    }
    function node(s, i, j, cons) {
      const key0 = keyOf(s, i, j, cons);
      if (memo.has(key0)) return memo.get(key0);
      const stack = [nodeGen(s, i, j, cons, key0)];
      let input;
      for (;;) {
        const r = stack[stack.length - 1].next(input);
        input = undefined;
        if (r.done) { stack.pop(); if (!stack.length) return r.value; input = r.value; continue; }
        const [s2, i2, j2, c2, k2] = r.value;
        if (memo.has(k2)) { input = memo.get(k2); continue; }
        stack.push(nodeGen(s2, i2, j2, c2, k2));
      }
    }

    const root = node(g.start, 0, n, null);
    return { root, ambiguities, resolutions };
  };
}
