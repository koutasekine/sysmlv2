// 文字の幅の表(GR4 指示書 3 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// 図の文字の幅は、ブラウザで測らず、この表から決める(設計書 10 章の決定性)。字体は FONT_FAMILY。
// 幅は 1 em を 1 とした値。ASCII の印字可能な文字は 1 字ずつ、それ以外は文字の種類ごとに決める。
// 値は、FONT_FAMILY の先頭の字体(Segoe UI)の字形の幅を目安に、はみ出さないよう少し広めに丸めたもの
// (GR4 P2 で作りながら決めた。報告に書く)。
//
// textWidth(s, size) → 幅(px)。size は字の大きさ(px)。bold なら太字の幅(1 割増し)

export const FONT_FAMILY = "'Segoe UI','Hiragino Sans','Noto Sans JP','Yu Gothic UI',sans-serif";

// U+0020〜U+007E の 95 文字の幅
const ASCII = [
  0.28, 0.30, 0.42, 0.62, 0.56, 0.86, 0.80, 0.25, 0.32, 0.32, 0.44, 0.66, 0.26, 0.40, 0.26, 0.40, // ' ' 〜 '/'
  0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, // '0' 〜 '9'
  0.26, 0.26, 0.66, 0.66, 0.66, 0.46, 0.92, // ':' 〜 '@'
  0.66, 0.60, 0.64, 0.72, 0.54, 0.52, 0.72, 0.74, 0.28, 0.38, 0.60, 0.50, 0.92, 0.76, 0.78, // 'A' 〜 'O'
  0.58, 0.78, 0.62, 0.54, 0.56, 0.72, 0.64, 0.96, 0.62, 0.58, 0.58, // 'P' 〜 'Z'
  0.32, 0.40, 0.32, 0.66, 0.44, 0.30, // '[' 〜 '`'
  0.52, 0.58, 0.48, 0.58, 0.54, 0.34, 0.58, 0.56, 0.26, 0.26, 0.50, 0.26, 0.86, 0.56, 0.58, // 'a' 〜 'o'
  0.58, 0.58, 0.36, 0.44, 0.34, 0.56, 0.50, 0.76, 0.48, 0.50, 0.44, // 'p' 〜 'z'
  0.32, 0.26, 0.32, 0.66, // '{' 〜 '~'
];

export function charWidth(cp) {
  if (cp >= 0x20 && cp <= 0x7e) return ASCII[cp - 0x20];
  if (cp === 0xab || cp === 0xbb) return 0.48;                           // « »
  if (cp < 0x0300) return 0.62;                                          // ラテン文字の拡張など
  if (cp >= 0xff61 && cp <= 0xff9f) return 0.52;                         // 半角カナ
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd)) return 1.0; // 全角(CJK・かな・全角記号)
  if (cp >= 0x2190 && cp <= 0x21ff) return 1.0;                          // 矢印
  if (cp >= 0x2000 && cp <= 0x206f) return 0.6;                          // 一般の句読点
  if (cp >= 0x1f000) return 1.2;                                         // 絵文字など
  return 0.7;
}

// 表示に使われる字体は環境で変わる(FONT_FAMILY の後ろの字体になることがある)ので、1 割の余裕を持たせる
const MARGIN = 1.1;

export function textWidth(s, size, bold = false) {
  let w = 0;
  for (const ch of String(s)) w += charWidth(ch.codePointAt(0));
  return Math.ceil(w * size * (bold ? 1.1 : 1) * MARGIN * 100) / 100;
}
