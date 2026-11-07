// 図・表を 1 つずつ保存するための部品(GR13 指示書 5 章、設計書 9.1 節・9.3 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
// 手本は S Apps のプロジェクト計画(reference/plan/core.js の firstText・anchorsOf、ui.js の withPage・safeName。同じ作者の MIT のコード)。
//
// figureTitle(svg) → { label, x, y, size } | null
//   図の題(左上の名前のタブの文字)の位置。描いた SVG の最初の <text>(図の枠があれば «view» の行、一般ビューのパッケージなら
//   タブの名前、枠のない箱なら箱の名前の区画の最初の行)。y は文字の基準線、size は文字の大きさ(px)。画面で題の右にボタンを置くのに使う
// pieceSvg(svg) → 保存する SVG の文字列。画面の操作のための印(data-* の属性と、当たり判定の層 <g data-sym="hit-areas">)を除き、
//   紙の大きさの指定(<style>@page{size:幅px 高さpx;margin:0}</style>)を入れ、XML 宣言を付ける。原文は入れない
// safeName(s) → ファイル名に使えない文字(\ / : * ? " < > |)と空白を「_」にしたもの
// pieceBase({ file, view, scope }) → 図のファイル名(拡張子なし)「元の名前_ビュー_範囲の名前」
// tableBase({ file, title }) → 表のファイル名(拡張子なし)「元の名前_grid_表の題」(grid はグリッドビューの選択欄の値)

const unesc = (s) => s.replace(/&(lt|gt|quot|#39|amp);/g, (_, k) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' }[k]));

export function figureTitle(svg) {
  const m = /<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(svg ?? '');
  return m ? { label: unesc(m[4]), x: +m[1], y: +m[2], size: +m[3] } : null;
}

export function pieceSvg(svg) {
  let s = svg.replace(/<g data-sym="hit-areas">[\s\S]*?<\/g>\n?/, '');
  s = s.replace(/ data-[a-z-]+="[^"]*"/g, '');
  const m = /<svg [^>]*?width="([\d.]+)" height="([\d.]+)"/.exec(s);
  if (!m) throw new Error('SVG の開始タグに幅と高さがない');
  const i = s.indexOf('>', s.indexOf('<svg'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${s.slice(0, i + 1)}<style>@page{size:${m[1]}px ${m[2]}px;margin:0}</style>${s.slice(i + 1)}`;
}

export const safeName = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '_');

export const pieceBase = ({ file, view, scope }) => `${safeName(file || 'sysmlv2')}_${safeName(view)}_${safeName(scope)}`;
export const tableBase = ({ file, title }) => `${safeName(file || 'sysmlv2')}_grid_${safeName(title)}`;
