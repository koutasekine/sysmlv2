// 保存と読み込み(GR4 指示書 6.2 節、GR13 指示書 4 章、設計書 9.3 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// 正本は .sysml だけ。SVG には原文を埋め込まず、「開く」で受け付けるのも .sysml だけ(GR13 で、原文を埋め込む処理と、
// .svg から原文を取り出す処理を取り除いた)。
//
// readSysml(bytes) → { ok: true, text } か { ok: false, error }。UTF-8 として正しくなければエラー(設計書 2.4 節)。BOM は残す
// fileKind(name) → 'sysml' | null
// OPEN_ONLY_SYSML: .sysml 以外のファイルを開こうとしたときに出す文

// src/parser の decodeUtf8 と同じ読み方(正しくないバイト列は例外、BOM は残す)。画面のスクリプトにパーサーを入れないため、ここで書く
const decodeUtf8 = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

export const OPEN_ONLY_SYSML = '開けるのは .sysml のファイルだけです';

export function readSysml(bytes) {
  // 先頭の BOM は残す(解析は BOM を読み飛ばす。設計書 2.4 節)。原文をそのまま保存できるようにするため
  try { return { ok: true, text: decodeUtf8(bytes) }; }
  catch { return { ok: false, error: 'UTF-8 として正しくないバイト列があるので読み込めない' }; }
}

export function fileKind(name) {
  return /\.sysml$/i.test(name) ? 'sysml' : null;
}

// 印刷のための id の付け替え(GR18 の S3)。画面の図と id(矢じりの marker など)が重ならないよう、印刷する SVG の id と、それを指す
// url(#…) を付け替える。付け替えは要素の開始タグの中(属性)だけに当て、文字の内容(原文の名前など)には当てない。
// SVG の文字は escapeXml を通してあるので、文字の内容と属性の値に < と > は現れない
export function printIds(svg, pre) {
  return svg.replace(/<[^>]*>/g, (tag) => tag.replace(/ id="([^"]+)"/g, ` id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`));
}

// ---- フォルダ(GR20 の F。設計書 9.4 節)
// 相対パスの符号位置の順(src/model/files.js の comparePaths と同じ。画面のスクリプトに model を入れないため、ここで書く)
export function comparePaths(a, b) {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
// フォルダの中のファイルの相対パス(区切りは /)のうち、読み込むもの: 名前が . で始まるフォルダの中にない .sysml のファイル
export const inHiddenFolder = (rel) => rel.split('/').slice(0, -1).some((d) => d.startsWith('.'));
export const isFolderSysml = (rel) => !inHiddenFolder(rel) && fileKind(rel.split('/').pop()) === 'sysml';
export const NO_SYSML_IN_FOLDER = (name) => `フォルダ「${name}」には .sysml のファイルがないので、読み込みませんでした(名前が . で始まるフォルダの中と、.sysml でないファイルは読みません)`;
