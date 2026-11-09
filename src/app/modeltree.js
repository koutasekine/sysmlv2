// モデルツリーと参照箇所の、画面(src/app/main.js)と Worker の側(src/app/outline.js)の両方が使う部品(GR26 の T・R。設計書 9.5 節)。
// DOM・外部パッケージ・Node.js 固有の機能を使わず、ほかのファイルを読み込まない(画面のスクリプトに、名前解決などの部品をまとめないため)。
//
// ROLE        参照の役割の記号 → 日本語名(src/app/outline.js の roleOf が決める)
// ROLE_ORDER  参照箇所の欄に役割を出す順(日本語名の並び。最後は「その他の参照」)
// sectionSizes・textX は下の説明(GR26 の P5)
// SEC_MIN・SEC_SPLIT・sectionHeight(total, y)  木の欄の 2 つの区画(「ファイル」「モデル」)の境目の分割バー(GR26 の L。設計書 9.5 節の
//   「置き場所」)。sectionHeight は、「ファイル」の区画の高さ(区画の上端から y の位置へ引いたとき)。total は 2 つの区画と分割バーの高さの
//   合計。各区画に SEC_MIN を残す(src/app/layout.js の 4 章の配置の幅とは別のもの)
// visibleRows(outline, isOpen) → [{ id, depth }]  開いた項目の子だけをたどった、画面に出す行の並び(閉じた項目の子孫は出さない)。
//   outline は src/app/outline.js の buildOutline の結果(roots と items[].kids を使う)、isOpen(item) はその項目を開いているか
// packOutline・unpackOutline・packCandidates・unpackCandidates は、Worker と画面の受け渡しの形(GR27 の O。設計書 9.5 節の「作り直し」)。下の説明
// LABEL_MAX・candidateTexts は、範囲の欄の候補の文字(長い修飾名の前を「…::」で省く。GR27 P5 の S。設計書 5 章の終わり)。下の説明
// packStructure・unpackStructure は、図の構造の修飾名(info.qname)の受け渡しの形(GR27 の Q)。下の説明

export const ROLE = {
  typing: '型付け', specialization: '特殊化', subsetting: '部分集合', redefinition: '再定義', reference: '参照(::>)', conjugation: '共役',
  connectEnd: '接続の端', bindEnd: '結合の端', allocateEnd: '割り当ての端', flowSource: '流れの元', flowTarget: '流れの先',
  messageSource: 'メッセージの送り手', messageTarget: 'メッセージの受け手', successionSource: '継承の元', successionTarget: '継承の先',
  transitionSource: '遷移の元', transitionTarget: '遷移の先', perform: 'perform', exhibit: 'exhibit', include: 'include', satisfy: 'satisfy',
  satisfyBy: 'satisfy の by', assert: 'assert', verify: 'verify', event: '事象(event)', first: '開始(first)', import: 'import', expose: 'expose',
  alias: '別名(alias)', dependencyClient: '依存の元', dependencySupplier: '依存の先', annotation: '注釈の対象(about)', expression: '式の中の参照',
  assign: 'assign の対象', payload: '流れの運ぶもの(of)', accept: '受け取りの型', acceptVia: '受け取りの経由(via)', sendPayload: '送信の送るもの',
  sendVia: '送信の経由(via)', sendTo: '送信の宛先(to)', qualifier: '修飾名の区切り', other: 'その他の参照',
};
export const ROLE_ORDER = ['typing', 'specialization', 'subsetting', 'redefinition', 'reference', 'conjugation', 'connectEnd', 'bindEnd', 'allocateEnd',
  'flowSource', 'flowTarget', 'messageSource', 'messageTarget', 'successionSource', 'successionTarget', 'transitionSource', 'transitionTarget',
  'perform', 'exhibit', 'include', 'satisfy', 'satisfyBy', 'assert', 'verify', 'event', 'first', 'payload', 'accept', 'acceptVia', 'sendPayload',
  'sendVia', 'sendTo', 'assign', 'expression', 'import', 'expose', 'alias', 'dependencyClient', 'dependencySupplier', 'annotation', 'qualifier', 'other'].map((k) => ROLE[k]);

// 開いた項目の子だけをたどった、画面に出す行の並び(閉じた項目の子孫は出さない。大きなモデルでも開いた分だけを作る)
export function visibleRows(outline, isOpen) {
  const out = [];
  const stack = [];
  for (let i = outline.roots.length - 1; i >= 0; i--) stack.push({ id: outline.roots[i], depth: 0 });
  while (stack.length) {
    const r = stack.pop();
    out.push(r);
    const it = outline.items[r.id];
    if (it.kids.length && isOpen(it)) for (let i = it.kids.length - 1; i >= 0; i--) stack.push({ id: it.kids[i], depth: r.depth + 1 });
  }
  return out;
}

export const SEC_MIN = 60, SEC_SPLIT = 4;
export const sectionHeight = (total, y) => Math.max(SEC_MIN, Math.min(y, total - SEC_MIN - SEC_SPLIT));

// 区画と欄の高さ(GR26 の P5 の H。設計書 9.5 節の「区画の高さ」)。
// sectionSizes({ total, head, filesFolded, modelFolded, folder, filesNat, rFiles, rRefs }) → { files, model, refs }(px)
//   total    2 つの区画と、その間の分割バーの入れ物の高さ(木の欄の上の帯の下の残り)
//   head     区画の見出しの行の高さ(畳んだ区画の高さ)
//   folder   フォルダを開いているか。filesNat は、フォルダを開いていないときの「ファイル」の区画の中身の高さ(見出しを含む)
//   rFiles・rRefs  分割バーで変えた「ファイル」の区画・参照箇所の欄の高さの、total に対する割合(null なら初めの高さ)
// 初めの高さ: フォルダを開いていないときの「ファイル」の区画は中身の高さ、開いているときは 40%(残りの 60% が「モデル」の区画)。参照箇所の
// 欄は「モデル」の区画の 40%。どの区画と欄にも最小の高さを残す(区画 SEC_MIN、モデルツリー TREE_MIN、参照箇所の欄 REF_MIN)。total が
// 最小の高さの合計より小さいときは、最小の高さの比で分ける(区画・欄・分割バーが入れ物の外に出ない。足りない分は区画の中のスクロールで見せる)
export const TREE_MIN = 40, REF_MIN = 56;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function sectionSizes({ total, head, filesFolded, modelFolded, folder, filesNat = 0, rFiles = null, rRefs = null }) {
  total = Math.max(0, total);
  let files, model;
  if (filesFolded || modelFolded) {
    // 畳んだ区画は見出しの行だけ。もう一方が残りを使う(両方を畳んだときは、どちらも見出しの行だけ)
    files = filesFolded ? Math.min(head, total) : Math.max(0, total - (modelFolded ? head : 0));
    model = modelFolded ? Math.min(head, Math.max(0, total - files)) : Math.max(0, total - files);
  } else {
    const avail = Math.max(0, total - SEC_SPLIT);
    const modelMin = head + TREE_MIN + SEC_SPLIT + REF_MIN;
    const want = rFiles != null ? rFiles * total : folder ? 0.4 * avail : filesNat;
    files = avail >= SEC_MIN + modelMin ? clamp(want, SEC_MIN, avail - modelMin) : avail * SEC_MIN / (SEC_MIN + modelMin);
    files = Math.round(files);
    model = avail - files;
  }
  let refs = 0;
  if (!modelFolded) {
    const inner = Math.max(0, model - head - SEC_SPLIT);
    const want = rRefs != null ? rRefs * total : 0.4 * model;
    refs = Math.round(inner >= TREE_MIN + REF_MIN ? clamp(want, REF_MIN, inner - TREE_MIN) : inner * REF_MIN / (TREE_MIN + REF_MIN));
  }
  return { files, model, refs };
}

// 行の始まりから文字列 s の終わりまでの幅(GR26 の P5 の S。テキスト欄の横の送り)。measure(t) は t の幅、tabW はタブの間隔の幅。タブは次の
// タブの位置まで進める(CSS の tab-size と同じく、行の始まりからの位置で数える)
export function textX(s, measure, tabW) {
  let x = 0, seg = '';
  for (const ch of s) {
    if (ch !== '\t') { seg += ch; continue; }
    x += seg ? measure(seg) : 0;
    seg = '';
    x = tabW > 0 ? (Math.floor(x / tabW + 1e-9) + 1) * tabW : x;
  }
  return x + (seg ? measure(seg) : 0);
}

// ---- Worker と画面の受け渡しの形(GR27 の O。設計書 9.5 節の「作り直し」)
// モデルツリーの項目の修飾名(q)・同一性の鍵(key)、型の q・k、参照箇所の所属(owner)と、範囲の候補の名前(id・label の中の修飾名)は、
// 入れ子の深さに比例して長くなり、受け渡しの大きさが深さの 2 乗になる。受け渡しでは、持ち主の項目(修飾名の表の節)を指す番号と、
// 自分の区切りだけを送り、画面の側で今と同じ文字を組み立てる(表示と鍵の値は変えない)。
//
// packOutline(outline) → 受け渡しの形。項目から q・key を除き、kn(同じ修飾名の中の記述の順。key の最後の区切り)を足す。型の q・k は、
//   型の要素の項目があれば ti(その項目の番号)にする。参照箇所の owner は、その文字を q に持つ項目があれば oi(最初のその項目の番号)にする
// unpackOutline(wire) → buildOutline の結果と同じ形(項目ごとに q・key を、親の q・鍵の区切りから組み立てる。親は子より前に並ぶ)
//   q: 親の q に「::」と自分の区切り(名前。名前のない要素は要約をかっこで囲み、要約がないときは「(名前なし)」)をつないだもの(根の子は自分の区切り)
//   key: ファイルの相対パス(1 つのテキストなら '')、U+0000、鍵の区切り(祖先は名前か「(名前なし)」、自分は名前か「#種類」)を「::」で
//   つないだもの、U+0000、kn
export function packOutline(o) {
  if (!o) return o;
  const byKey = new Map(), byQ = new Map();
  for (const it of o.items) { byKey.set(it.key, it.id); if (!byQ.has(it.q)) byQ.set(it.q, it.id); }
  const items = o.items.map((it) => {
    const { q, key, ...rest } = it;
    rest.kn = Number(key.slice(key.lastIndexOf('\u0000') + 1));
    rest.types = it.types.map((t) => {
      if (t.k == null || !byKey.has(t.k)) return t;
      const { q: tq, k, ...tr } = t;
      return { ...tr, ti: byKey.get(t.k) };
    });
    return rest;
  });
  const refs = {};
  for (const [id, list] of Object.entries(o.refs)) refs[id] = list.map((r) => { if (!byQ.has(r.owner)) return r; const { owner, ...rr } = r; return { ...rr, oi: byQ.get(r.owner) }; });
  return { ...o, items, refs, packed: true };
}
export function unpackOutline(w) {
  if (!w || !w.packed) return w;
  const { packed, ...o } = w;
  const ka = new Array(w.items.length); // 子に渡す鍵の区切り(祖先の名前か「(名前なし)」を「::」でつないだもの)
  const items = w.items.map((it) => ({ ...it }));
  for (const it of items) {
    const p = it.parent >= 0 ? items[it.parent] : null;
    const seg = it.named ? it.name : it.name === '(名前なし)' ? it.name : `(${it.name})`;
    it.q = p ? `${p.q}::${seg}` : seg;
    const own = it.named ? it.name : `#${it.kind}`;
    const anc = p ? ka[it.parent] : null;
    it.key = `${it.file ?? ''}\u0000${anc != null ? `${anc}::${own}` : own}\u0000${it.kn}`;
    ka[it.id] = anc != null ? `${anc}::${it.named ? it.name : '(名前なし)'}` : (it.named ? it.name : '(名前なし)');
    delete it.kn;
  }
  for (const it of items) it.types = it.types.map((t) => {
    if (t.ti == null) return t;
    const { ti, ...tr } = t;
    return { ...tr, q: items[ti].q, k: items[ti].key };
  });
  const refs = {};
  for (const [id, list] of Object.entries(w.refs)) refs[id] = list.map((r) => { if (r.oi == null) return r; const { oi, ...rr } = r; return { ...rr, owner: items[oi].q }; });
  return { ...o, items, refs };
}
// 範囲の候補: 修飾名の表(paths。[持ち主の節の番号(なければ -1), 区切り] の並び)の節 pn の修飾名 P を、id・label の中の P の前後の文字
// (ip・is、lp・ls)ではさむ形。P を含まない候補は、今の形({ id, kind, label })のまま送る。unpackCandidates は今の形に戻す
export function unpackCandidates(cands, paths) {
  if (!paths) return cands;
  const memo = new Map();
  const P = (n) => {
    if (memo.has(n)) return memo.get(n);
    // 持ち主の節を明示のスタックでたどる(入れ子の深さで呼び出しを深くしない)
    const chain = [];
    for (let x = n; x >= 0 && !memo.has(x); x = paths[x][0]) chain.push(x);
    for (let i = chain.length - 1; i >= 0; i--) { const x = chain[i], pa = paths[x][0]; memo.set(x, pa >= 0 ? `${memo.get(pa)}::${paths[x][1]}` : paths[x][1]); }
    return memo.get(n);
  };
  return cands.map((c) => (c.pn == null ? c : { id: c.ip + P(c.pn) + c.is, kind: c.kind, label: c.lp + P(c.pn) + c.ls }));
}
// ---- 範囲の欄の候補の文字(GR27 P5 の S。設計書 5 章の終わり)
// candidateTexts(cands, paths) → 候補ごとの範囲の欄の文字(unpackCandidates の前の、受け渡しの形の cands と paths を受け取る)。
//   候補の名前(修飾名 P。paths の節 pn)が LABEL_MAX 字を超えるときは、最後の区切りを必ず残し、後ろから LABEL_MAX 字に収まる区切りまでを
//   残して、前を「…::」で省く(残す区切りを「::」でつないだ文字が LABEL_MAX 字以下。「…::」は数えない)。最後の区切りだけで LABEL_MAX 字を
//   超えるときは、最後の区切りだけを省かずに出す(前に区切りがあれば「…::」を付ける。区切りが 1 つだけの名前は省くものがないので、そのまま)。
//   P の前後の文字(lp・ls。「part 」や、フォルダのときの相対パス)は今のまま付ける。LABEL_MAX 字以下の名前と、P を含まない候補
//   (pn がないもの)の文字は、今の label と同じ。字の数は、符号位置(サロゲートの対は 1 字。全角と半角を同じ 1 字)で数える。
//   省いた文字は、P の全部を組み立てずに、paths の後ろの区切りだけをたどって作る(入れ子の深さの 2 乗の文字数を作らない)
export const LABEL_MAX = 60;
const cpLen = (s) => { let n = 0; for (const _ of s) n++; return n; };
export function candidateTexts(cands, paths) {
  if (!paths) return cands.map((c) => c.label);
  // 節ごとの修飾名の字の数(持ち主の節は、それを使う節より前に並ぶ。packCandidates)
  const seg = paths.map((x) => cpLen(x[1]));
  const len = new Array(paths.length);
  for (let i = 0; i < paths.length; i++) { const pa = paths[i][0]; len[i] = (pa >= 0 ? len[pa] + 2 : 0) + seg[i]; }
  const short = (n) => {
    const out = [paths[n][1]];
    let total = seg[n], x = paths[n][0];
    if (len[n] <= LABEL_MAX) { for (; x >= 0; x = paths[x][0]) out.push(paths[x][1]); return out.reverse().join('::'); }
    for (; x >= 0 && total + 2 + seg[x] <= LABEL_MAX; x = paths[x][0]) { total += 2 + seg[x]; out.push(paths[x][1]); }
    const tail = out.reverse().join('::');
    return x >= 0 ? `…::${tail}` : tail;
  };
  return cands.map((c) => (c.pn == null ? c.label : c.lp + short(c.pn) + c.ls));
}
// packCandidates(list, ctx) → { candidates, paths }(Worker の側。ctx は src/view/common.js の makeContext の結果)。要素の修飾名(src/view/scope.js の pathOf と同じ: 根の名前空間の下の要素から、名前(なければ
// 「(種類)」)を「::」でつないだもの)を、持ち主の節の番号と自分の区切りの表 paths([[持ち主の節(なければ -1), 区切り]])の節で表し、
// id・label をその修飾名の前後の文字ではさむ形にする。修飾名がない(根の名前空間)か、id・label が修飾名を含まない候補は、今の形のまま
export function packCandidates(list, ctx) {
  const paths = [], memo = new Map(), str = [];
  const node = (e) => {
    const fresh = [];
    let top = -1;
    for (let x = e; x && ctx.parent.get(x); x = ctx.ownerOf(x)) { if (memo.has(x)) { top = memo.get(x); break; } fresh.push(x); }
    for (let i = fresh.length - 1; i >= 0; i--) {
      const seg = ctx.nameOf(fresh[i]) ?? `(${fresh[i].kind})`;
      const k = paths.length;
      paths.push([top, seg]);
      str.push(top >= 0 ? `${str[top]}::${seg}` : seg);
      memo.set(fresh[i], k);
      top = k;
    }
    return top;
  };
  const candidates = list.map((c) => {
    const n = c.el ? node(c.el) : -1;
    const p = n >= 0 ? str[n] : '';
    const i = p ? c.id.indexOf(p) : -1, j = p ? c.label.indexOf(p) : -1;
    if (i < 0 || j < 0) return { id: c.id, kind: c.kind, label: c.label };
    return { kind: c.kind, pn: n, ip: c.id.slice(0, i), is: c.id.slice(i + p.length), lp: c.label.slice(0, j), ls: c.label.slice(j + p.length) };
  });
  return { candidates, paths: paths.length ? paths : null };
}

// ---- 図の構造(src/view/index.js の structureOf の結果)の修飾名の受け渡しの形(GR27 の Q)
// 要素と線と枠の info.qname(選んだ要素の欄に出す修飾名)は、入れ子の深さに比例して長くなり、受け渡しの大きさが深さの 2 乗になる。
// 受け渡しでは、修飾名の表 qnames([前の部分の節の番号(なければ -1), 最後の「::」の後ろ] の並び。前の部分の節は、それを使う節より前に
// 並ぶ)の節の番号 qn を、info の qname の位置に置き、画面の側で今と同じ文字を組み立てる(表示と動きは変えない)。
// 修飾名は文字として「::」で切るだけなので(名前の中の「::」でも切る)、組み立てた文字は元の文字と同じになる
// packStructure(st) → 受け渡しの形(Worker の側)。qname が空でない文字の info だけを置き換え、それ以外はそのまま
// unpackStructure(wire) → structureOf の結果と同じ形(画面の側)。qnames を持たないものはそのまま返す
export function packStructure(st) {
  if (!st || !Array.isArray(st.nodes) || !Array.isArray(st.edges)) return st;
  const qnames = [], byQ = new Map();
  const node = (q) => {
    const k = byQ.get(q);
    if (k !== undefined) return k;
    // 表にない前の部分を、内側から集め、外側から足す(明示のスタック)
    const chain = [];
    for (let x = q; ; ) {
      chain.push(x);
      const p = x.lastIndexOf('::');
      if (p <= 0) break;
      x = x.slice(0, p);
      if (byQ.has(x)) break;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const x = chain[i], p = x.lastIndexOf('::');
      byQ.set(x, qnames.length);
      qnames.push(p > 0 ? [byQ.get(x.slice(0, p)), x.slice(p + 2)] : [-1, x]);
    }
    return byQ.get(q);
  };
  // info の鍵の並びを保ったまま、qname を qn にする
  const packInfo = (info) => {
    if (!info || typeof info.qname !== 'string' || !info.qname) return info;
    const o = {};
    for (const k of Object.keys(info)) { if (k === 'qname') o.qn = node(info.qname); else o[k] = info[k]; }
    return o;
  };
  const withInfo = (x) => (x && x.info && typeof x.info.qname === 'string' && x.info.qname ? { ...x, info: packInfo(x.info) } : x);
  return { ...st, frame: withInfo(st.frame), nodes: st.nodes.map(withInfo), edges: st.edges.map(withInfo), qnames };
}
export function unpackStructure(w) {
  if (!w || !w.qnames || !Array.isArray(w.nodes) || !Array.isArray(w.edges)) return w;
  const { qnames, ...st } = w;
  // 前の部分の節は先に並ぶので、前から順に組み立てる
  const q = new Array(qnames.length);
  for (let i = 0; i < qnames.length; i++) { const [pa, seg] = qnames[i]; q[i] = pa >= 0 ? `${q[pa]}::${seg}` : seg; }
  const unpackInfo = (info) => {
    const o = {};
    for (const k of Object.keys(info)) { if (k === 'qn') o.qname = q[info.qn]; else o[k] = info[k]; }
    return o;
  };
  const withInfo = (x) => (x && x.info && x.info.qn !== undefined ? { ...x, info: unpackInfo(x.info) } : x);
  return { ...st, frame: withInfo(st.frame), nodes: st.nodes.map(withInfo), edges: st.edges.map(withInfo) };
}
