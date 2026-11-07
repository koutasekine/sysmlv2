// フォルダのハンドルの上のファイルの操作(GR24 の F・M。設計書 9.4 節の段階 C)。DOM・外部パッケージ・Node.js 固有の機能を使わない
// (画面 src/app/main.js から使い、検査 tests/view からも直接呼ぶ)。root は File System Access API の FileSystemDirectoryHandle
// (と同じ形の偽物)。相対パスの区切りは /。
//
// askWrite(root) → { ok, reason }  書き込みの許可を queryPermission で調べ、なければ requestPermission({ mode: 'readwrite' }) で求める
// listDisk(root, { hidden }) → { files: [{ path, handle }], dirs: [path] }  ディスクのファイルとフォルダ。hidden が false なら、名前が
//   . で始まるフォルダとその中を入れない
// listIn(root, path, { hidden }) → listDisk と同じ形(相対パスはフォルダ path から)。GR25 の A5
// readAt(root, path) → { bytes, lastModified }
// writeNew(root, path, data) → { lastModified }  新しいファイルを作って書き、読み直して同じことを確かめる(同じ名前があれば作らない)
// makeDir(root, path)  新しいフォルダを作る(同じ名前があれば作らない)
// removeAt(root, path, isDir)  ファイルかフォルダ(中ごと)を消す
// moveFile(root, src, dst) → { via: 'move' | 'copy', removeError }  ファイルの名前の変更・移動。ハンドルが move() を持てばそれを使い、
//   持たなければ、新しい場所に写して中身が同じことを確かめてから元を消す(元を消せなかったときは removeError に理由)
// copyFile(root, src, dst) → { lastModified }  写して確かめる
// copyDir(root, src, dst) → { ok, done: [写した dst の相対パス], error, remain: [消せずにディスクに残った dst の相対パス], remainError }
//   フォルダの中のすべて(名前が . で始まるフォルダを含む)を新しい場所に写し、すべての中身が同じことを確かめる。途中で失敗したら止める。
//   GR25 の F(設計書 9.4 節の段階 C): 途中で失敗したときは、この操作で写す先に作ったもの(写し終えたファイル・フォルダと、作りかけの
//   ファイル)をすべて消してから返す(done は空)。消せなかったものを remain に(/ で終わるものはフォルダ)、その理由を remainError に入れる
// moveDir(root, src, dst) → copyDir の結果に removeError を足したもの。すべて写して確かめてから、元を消す(失敗したら元を消さない)
// errText(e)  例外の理由の文
// GR25 の A6: writeNew・copyFile・moveFile(写す経路)は、書き込みが途中で失敗したとき、作ったファイルを消してから例外を投げる。消せなければ
//   例外の left に、残ったものの相対パスを入れる

import { parentOf, baseOf } from './tree.js';

export const errText = (e) => `${e?.name ? `${e.name}: ` : ''}${e?.message ?? e}`;
const toBytes = (d) => (typeof d === 'string' ? new TextEncoder().encode(d) : d);
const sameBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

export async function askWrite(root) {
  try {
    let p = typeof root.queryPermission === 'function' ? await root.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (p !== 'granted' && typeof root.requestPermission === 'function') p = await root.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return { ok: false, reason: `フォルダ「${root.name}」への書き込みが許可されなかったので、何もしませんでした` };
    return { ok: true, reason: null };
  } catch (e) {
    return { ok: false, reason: `フォルダ「${root.name}」への書き込みの許可を求められなかったので、何もしませんでした(${errText(e)})` };
  }
}

async function dirAt(root, path) {
  let d = root;
  for (const s of path ? path.split('/') : []) d = await d.getDirectoryHandle(s);
  return d;
}
async function fileAt(root, path) { return (await dirAt(root, parentOf(path))).getFileHandle(baseOf(path)); }
// 同じ名前のファイルかフォルダが、ディスクにあるか(大文字・小文字を区別しないファイルシステムでは、区別せずに当たる)
async function exists(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch { /* ない */ }
  try { await dir.getDirectoryHandle(name); return true; } catch { /* ない */ }
  return false;
}
const already = (path) => Object.assign(new Error(`ディスクに同じ名前の「${path}」があります(読み込んだ後に、ほかで作られた)`), { name: 'Exists' });

export async function listDisk(root, { hidden = false } = {}) {
  const files = [], dirs = [];
  const walk = async (dir, prefix) => {
    for await (const h of dir.values()) {
      const rel = prefix ? `${prefix}/${h.name}` : h.name;
      if (h.kind === 'directory') { if (hidden || !h.name.startsWith('.')) { dirs.push(rel); await walk(h, rel); } }
      else files.push({ path: rel, handle: h });
    }
  };
  await walk(root, '');
  return { files, dirs };
}

// GR25 の A5: フォルダ path の中のファイルとフォルダ(path からの相対パス)。listDisk と同じ形
export async function listIn(root, path, opts = {}) { return listDisk(await dirAt(root, path), opts); }

export async function readAt(root, path) {
  const f = await (await fileAt(root, path)).getFile();
  return { bytes: new Uint8Array(await f.arrayBuffer()), lastModified: f.lastModified ?? null };
}

// 新しいファイル name を dir に作って書き、読み直して同じことを確かめる(呼ぶ側が、同じ名前がないことを確かめてから呼ぶ)。
// GR25 の A6(設計書 9.4 節の段階 C): 作った後の書き込み・読み直しが失敗したら、作ったファイルを消してから例外を投げる。消せなければ、
// 例外の left に残ったもの(相対パス path)を入れる
async function writeTo(dir, name, data, path = name) {
  const fh = await dir.getFileHandle(name, { create: true });
  try {
    const w = await fh.createWritable();
    try { await w.write(data); await w.close(); } catch (e) { try { await w.abort?.(); } catch { /* 後始末の失敗は無視する */ } throw e; }
    const f = await fh.getFile();
    const back = new Uint8Array(await f.arrayBuffer());
    if (!sameBytes(back, toBytes(data))) throw Object.assign(new Error('書いた後に読み直した中身が、書いたものと違います'), { name: 'Verify' });
    return { lastModified: f.lastModified ?? null };
  } catch (e) {
    try { await dir.removeEntry(name); } catch (r) { e.left = [path]; e.leftError = errText(r); }
    throw e;
  }
}

export async function writeNew(root, path, data) {
  const dir = await dirAt(root, parentOf(path));
  if (await exists(dir, baseOf(path))) throw already(path);
  return writeTo(dir, baseOf(path), data, path);
}

export async function makeDir(root, path) {
  const dir = await dirAt(root, parentOf(path));
  if (await exists(dir, baseOf(path))) throw already(path);
  await dir.getDirectoryHandle(baseOf(path), { create: true });
}

export async function removeAt(root, path, isDir = false) {
  const dir = await dirAt(root, parentOf(path));
  await dir.removeEntry(baseOf(path), isDir ? { recursive: true } : undefined);
}

export async function copyFile(root, src, dst) {
  const { bytes } = await readAt(root, src);
  return writeNew(root, dst, bytes);
}

export async function moveFile(root, src, dst) {
  const sdir = await dirAt(root, parentOf(src));
  const fh = await sdir.getFileHandle(baseOf(src));
  const caseOnly = src !== dst && src.toLowerCase() === dst.toLowerCase();
  if (typeof fh.move === 'function') {
    const ddir = parentOf(src) === parentOf(dst) ? sdir : await dirAt(root, parentOf(dst));
    if (!caseOnly && await exists(ddir, baseOf(dst))) throw already(dst);
    if (ddir === sdir) await fh.move(baseOf(dst)); else await fh.move(ddir, baseOf(dst));
    return { via: 'move', removeError: null };
  }
  // 写して確かめてから元を消す。大文字・小文字だけの名前の変更は、大文字・小文字を区別しないファイルシステムでは、写す先が元と同じ
  // ファイルになり、元を消すと中身が消えるので、行わない
  if (caseOnly) throw Object.assign(new Error('このブラウザはファイルの移動(move)を持たないので、大文字・小文字だけの名前の変更はできません(写して元を消すと、元と同じファイルを消すおそれがあるため)'), { name: 'CaseOnly' });
  await copyFile(root, src, dst);
  try { await sdir.removeEntry(baseOf(src)); } catch (e) { return { via: 'copy', removeError: errText(e) }; }
  return { via: 'copy', removeError: null };
}

// GR25 の F: 写す先に作ったもの made(相対パス。/ で終わるものはフォルダ。親が子より先に並ぶ)を、後ろから(ファイル、深いフォルダの順に)
// 1 つずつ消す。フォルダは中ごとには消さない(ほかで足されたものを消さないため)。→ { remain: [消せなかったもの], remainError }
async function undoMade(root, made) {
  const remain = [];
  let remainError = null;
  for (const m of [...made].reverse()) {
    const p = m.endsWith('/') ? m.slice(0, -1) : m;
    try { await (await dirAt(root, parentOf(p))).removeEntry(baseOf(p)); } catch (e) { remain.unshift(m); remainError ??= errText(e); }
  }
  return { remain, remainError };
}

export async function copyDir(root, src, dst) {
  const none = (error) => ({ ok: false, done: [], error, remain: [], remainError: null });
  if (src.toLowerCase() === dst.toLowerCase() || dst.toLowerCase().startsWith(`${src.toLowerCase()}/`)) return none('写す先が、元のフォルダかその中なので、写しませんでした');
  const done = [];
  let list;
  try { list = await listDisk(await dirAt(root, src), { hidden: true }); } catch (e) { return none(`元のフォルダ「${src}」を読めませんでした(${errText(e)})`); }
  const at = (rel) => (rel ? `${dst}/${rel}` : dst);
  try {
    await makeDir(root, dst);
    done.push(`${dst}/`);
    for (const d of list.dirs) { await (await dirAt(root, parentOf(at(d)))).getDirectoryHandle(baseOf(d), { create: true }); done.push(`${at(d)}/`); }
    const copied = [];
    for (const f of list.files) {
      const b = new Uint8Array(await (await f.handle.getFile()).arrayBuffer());
      await writeTo(await dirAt(root, parentOf(at(f.path))), baseOf(f.path), b, at(f.path));
      copied.push({ path: at(f.path), bytes: b });
      done.push(at(f.path));
    }
    // すべての中身が同じことを確かめる(写し終えた後に、もう一度すべてを読み直す)
    for (const c of copied) {
      const { bytes } = await readAt(root, c.path);
      if (!sameBytes(bytes, c.bytes)) throw Object.assign(new Error(`写した「${c.path}」の中身が、元と違います`), { name: 'Verify' });
    }
  } catch (e) {
    // 元は消さずに止め、写す先に作ったもの(写し終えたもの、作りかけで writeTo が消せなかったもの)をすべて消す
    return { ok: false, done: [], error: errText(e), ...(await undoMade(root, [...done, ...(e.left ?? [])])) };
  }
  return { ok: true, done, error: null, remain: [], remainError: null };
}

export async function moveDir(root, src, dst) {
  const r = await copyDir(root, src, dst);
  if (!r.ok) return { ...r, removeError: null };
  try { await removeAt(root, src, true); } catch (e) { return { ...r, removeError: errText(e) }; }
  return { ...r, removeError: null };
}
