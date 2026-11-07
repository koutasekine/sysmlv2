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
