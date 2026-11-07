// GR24: 試しのフォルダを作る道具(GR24 指示書 5 章)。GR21 の 2 つの試しのフォルダ(tools/model/gr21_make_folders.mjs が書くもの)をもとに、
// フォルダの木とファイルの操作を確かめるためのものを足す。
//
// 使い方:
//   node tools/model/gr24_make_folders.mjs [--out out/GR24/folders]
//
// 書き出すもの:
//   <out>/懐中電灯_3ファイル/   GR21 のまま(「回路.sysml」は CR LF)に、空のフォルダ「下書き」、.sysml でないファイル「メモ.txt」(テキスト)と
//                              「図/ロゴ.png」(2×2 の小さな PNG)を足したもの
//   <out>/またがる編集の試し/   GR21 のまま(.git のフォルダ、readme.txt、下のフォルダ「メモ」を含む)に、readme.txt の文を GR24 に合わせ、
//                              空のフォルダ「空のフォルダ」と、画像「画像/点.png」(1×1 の PNG)を足したもの
//   <out>/sysmlなし/            .sysml が 1 つもないフォルダ(readme.txt と空のフォルダ「作業」。木から新しいファイルを作る確かめ)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = opt('--out', 'out/GR24/folders');
const tmp = path.join(path.dirname(out), 'folders_gr21');
fs.rmSync(tmp, { recursive: true, force: true });
execFileSync(process.execPath, ['tools/model/gr21_make_folders.mjs', '--out', tmp], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(tmp, out, { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });

// 小さな PNG(w×h、1 画素 RGB の色の並び)。zlib は Node.js の標準の部品(道具の中だけで使う。アプリには入らない)
function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < h; y++) { rows.push(0); for (let x = 0; x < w; x++) rows.push(...rgb[(y * w + x) % rgb.length]); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const A = path.join(out, '懐中電灯_3ファイル');
fs.mkdirSync(path.join(A, '下書き'));
fs.writeFileSync(path.join(A, 'メモ.txt'), '懐中電灯の試し(GR24)。.sysml でないファイルは、フォルダの木に薄く出て、開かない。名前の変更・移動・削除はできる。\n');
fs.mkdirSync(path.join(A, '図'));
fs.writeFileSync(path.join(A, '図', 'ロゴ.png'), png(2, 2, [[139, 26, 43], [255, 255, 255], [255, 255, 255], [139, 26, 43]]));
const X = path.join(out, 'またがる編集の試し');
fs.writeFileSync(path.join(X, 'readme.txt'), 'このフォルダは GR24 の試しのフォルダです。.sysml でないファイルはフォルダの木に薄く出て、開きません。.git のフォルダは木に出しません。\n');
fs.mkdirSync(path.join(X, '空のフォルダ'));
fs.mkdirSync(path.join(X, '画像'));
fs.writeFileSync(path.join(X, '画像', '点.png'), png(1, 1, [[0, 0, 0]]));
const N = path.join(out, 'sysmlなし');
fs.mkdirSync(path.join(N, '作業'), { recursive: true });
fs.writeFileSync(path.join(N, 'readme.txt'), '.sysml が 1 つもないフォルダ(GR24)。フォルダの木の「+ファイル」で、名前が .sysml で終わるファイルを作ると、モデルに入る。\n');
console.log(`書き出した: ${out}`);
