// 画面の左右の配置の幅(GR25 の B。設計書 4 章・9.1 節)。DOM・外部パッケージ・Node.js 固有の機能を使わない
// (画面 src/app/main.js から使い、検査 tests/view からも直接呼ぶ)。
//
// 左の列(#left)は、木の欄(#tree)・木の分割バー(#treeSplit)・テキスト欄の列(#leftMain)と右の縁の線からなる。その右に真ん中の
// 分割バー(#splitter)と図の欄(#right)が並ぶ。
// - テキスト欄の初めの幅は、木の欄がないとき(GR22 の版。左の列が画面の幅の 38%、最小 260px、右の縁の線 1px を含む)と同じにする。
//   左の列は、木の欄と木の分割バーの幅の分だけ広げる(図の欄がその分狭くなる)。木の欄を畳んだときは、畳んだ帯の幅にする(テキスト欄の
//   幅は保つ)
// - 分割バーは、テキスト欄に TEXT_MIN、図の欄に VIEW_MIN の最小の幅を残す。両方を守れないほど画面が狭いときは、テキスト欄を優先する
//
// widths({ W, tree, folded, text }) → { tree, left, text, right }
//   W は画面の幅、tree は木の欄の幅(広げたとき)、folded は畳んだか、text はテキスト欄の望む幅(null なら初めの幅)。
//   返すのは、実際に置く木の欄の幅・左の列の幅・テキスト欄の幅・図の欄の幅
// initialText(W) → テキスト欄の初めの幅(GR22 の版と同じ)
// dragTree(W, s, x) → 木の分割バーを x(木の欄の左端からの位置)へ引いたときの { tree, text }(左の列の幅は変えない)
// dragMiddle(W, s, x) → 真ん中の分割バーを x(画面の左端からの位置)へ引いたときの { text }

export const TREE_SPLIT = 4, SPLIT = 6, BORDER = 1, FOLDED = 28, TEXT_MIN = 240, VIEW_MIN = 320, TREE_MIN = 120, TREE_INIT = 200;

export const initialText = (W) => Math.max(260, W * 0.38) - BORDER;
const treeOf = (s) => (s.folded ? FOLDED : s.tree);

export function widths(s) {
  const tree = treeOf(s);
  const fixed = tree + TREE_SPLIT + BORDER;
  let text = s.text ?? initialText(s.W);
  // 図の欄に VIEW_MIN を残す(テキスト欄は TEXT_MIN より狭くしない。テキスト欄を優先する)
  text = Math.min(text, s.W - SPLIT - VIEW_MIN - fixed);
  text = Math.max(text, TEXT_MIN);
  const left = fixed + text;
  return { tree, left, text, right: s.W - left - SPLIT };
}

export function dragTree(W, s, x) {
  const now = widths({ ...s, W });
  const tree = Math.max(TREE_MIN, Math.min(x, now.left - TREE_SPLIT - BORDER - TEXT_MIN));
  return { tree, text: Math.max(TEXT_MIN, now.left - tree - TREE_SPLIT - BORDER) };
}

export function dragMiddle(W, s, x) {
  const fixed = treeOf(s) + TREE_SPLIT + BORDER;
  const lo = fixed + TEXT_MIN, hi = W - SPLIT - VIEW_MIN;
  const left = Math.max(lo, Math.min(x, hi));
  return { text: left - fixed };
}
