// フォルダの保存(GR21 の O・Z。設計書 9.4 節の段階 B)。DOM・外部パッケージ・Node.js 固有の機能を使わない
// (画面 src/app/main.js から使い、検査 tests/view からも直接呼ぶ)。
//
// makeZip(entries, date) → Uint8Array
//   entries は [{ path, data }](path はフォルダからの相対パス、区切りは /。data は Uint8Array)。圧縮しない形式(格納。方式 0)の zip を作る。
//   ファイル名は UTF-8 で書き、汎用の印のビット 11(言語の符号化の印。ファイル名が UTF-8 であること)を立てる。date は最終更新の日時
//   (Date。省けば 1980-01-01 00:00)。GR24 の Z: path が / で終わる項目は空のフォルダとし(data は空)、外部の属性に MS-DOS のフォルダの印
//   (0x10)を立てる
// overwriteFolder(root, items, { ask }) → { denied, reason, results: [{ path, ok, skipped, reason, stamp }] }
//   フォルダのハンドル root(File System Access API の FileSystemDirectoryHandle)の、同じ相対パスのファイルに書く。items は
//   [{ path, text(書く文字), expect: { lastModified, text }(読み込んだ・前に保存したときの最終更新の時刻と中身) }]。
//   書き込みの許可を queryPermission で調べ、なければ requestPermission({ mode: 'readwrite' }) で求める。許可されなければ何も書かない。
//   書く前に、ファイルが読み込んだ後にほかで変えられていないか(最終更新の時刻が違えば中身を読んで比べる)を確かめ、変えられていたら
//   ask(path) で上書きするかを尋ねる(false なら、そのファイルは書かない)。stamp は書いた後の { lastModified, text }。
//   GR24 の M: items の create が true のファイル(再読み込みで、ほかで消えていたファイル)は、下のフォルダとファイルを作って書く。
//   GR25 の A2: そのとき、同じ相対パスにファイルがあれば ask(path, 'exists') で上書きするかを尋ねる(ほかで変えられたときは
//   ask(path, 'changed'))。作ったファイルに書けなかったときは、そのファイルを消す(消せなければ結果の left が true)

// ---- zip
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const utf8 = (s) => new TextEncoder().encode(s);
export function makeZip(entries, date = null) {
  const d = date ?? new Date(1980, 0, 1, 0, 0, 0);
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const dosDate = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const FLAG_UTF8 = 0x0800;
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const isDir = e.path.endsWith('/');
    const name = utf8(e.path), data = isDir ? new Uint8Array(0) : e.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, FLAG_UTF8, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, FLAG_UTF8, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, isDir ? 0x10 : 0, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

// ---- 上書き保存
const decode = (b) => new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(b);
const errText = (e) => `${e?.name ? `${e.name}: ` : ''}${e?.message ?? e}`;
// 相対パスのファイルのハンドル(下のフォルダはハンドルをたどる。ファイルは作らない)
async function fileHandleAt(root, path, create = false) {
  const segs = path.split('/');
  let dir = root;
  for (const s of segs.slice(0, -1)) dir = create ? await dir.getDirectoryHandle(s, { create: true }) : await dir.getDirectoryHandle(s);
  return create ? dir.getFileHandle(segs.at(-1), { create: true }) : dir.getFileHandle(segs.at(-1));
}
export async function overwriteFolder(root, items, { ask = async () => false } = {}) {
  // 書き込みの許可(最初の上書き保存のとき、ブラウザの確認で求める)
  try {
    let p = typeof root.queryPermission === 'function' ? await root.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (p !== 'granted' && typeof root.requestPermission === 'function') p = await root.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return { denied: true, reason: `フォルダ「${root.name}」への書き込みが許可されなかったので、何も書きませんでした`, results: [] };
  } catch (e) {
    return { denied: true, reason: `フォルダ「${root.name}」への書き込みの許可を求められなかったので、何も書きませんでした(${errText(e)})`, results: [] };
  }
  const results = [];
  for (const it of items) {
    let made = null; // このときに作ったファイル(作り直すファイル。書けなかったら消す。GR25)
    try {
      let fh;
      if (it.create) {
        // GR25 の A2(設計書 9.4 節の段階 B): ほかで消えていて作り直すファイルは、書く前に同じ相対パスにファイルがないことを確かめ、あれば
        // ほかで変えられたときと同じく、上書きするかを尋ねる
        let had = null;
        try { had = await fileHandleAt(root, it.path, false); } catch { had = null; }
        if (had && !(await ask(it.path, 'exists'))) { results.push({ path: it.path, ok: false, skipped: true, reason: 'ほかで消えた後に、同じ相対パスにファイルがほかで作られていたので、書きませんでした' }); continue; }
        fh = had ?? await fileHandleAt(root, it.path, true);
        if (!had) made = fh;
      } else fh = await fileHandleAt(root, it.path, false);
      // ほかで変えられていないか: 最終更新の時刻が同じなら変わっていないとし、違えば中身を読んで比べる
      const now = await fh.getFile();
      let changed = false;
      if (it.expect && now.lastModified !== it.expect.lastModified) changed = decode(new Uint8Array(await now.arrayBuffer())) !== it.expect.text;
      if (changed && !(await ask(it.path, 'changed'))) { results.push({ path: it.path, ok: false, skipped: true, reason: '読み込んだ後にほかで変えられていたので、書きませんでした' }); continue; }
      const w = await fh.createWritable();
      try { await w.write(it.text); await w.close(); } catch (e) { try { await w.abort?.(); } catch { /* 書けなかったときの後始末の失敗は無視する */ } throw e; }
      const after = await fh.getFile();
      results.push({ path: it.path, ok: true, skipped: false, reason: null, stamp: { lastModified: after.lastModified, text: it.text } });
    } catch (e) {
      // 作り直すために作ったファイルは、書けなかったら消す(GR25 の A6 と同じ扱い。消せなければ、残ったことを理由に書く)
      let rest = '';
      if (made) {
        try { const segs = it.path.split('/'); let d = root; for (const x of segs.slice(0, -1)) d = await d.getDirectoryHandle(x); await d.removeEntry(segs.at(-1)); }
        catch (r) { rest = `。作りかけのファイルを消せず、ディスクに残っています(${errText(r)})`; }
      }
      results.push({ path: it.path, ok: false, skipped: false, reason: `書けませんでした(${errText(e)})${rest}`, left: !!rest });
    }
  }
  return { denied: false, reason: null, results };
}
