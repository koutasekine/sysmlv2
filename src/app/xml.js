// 小さな XML の解析(GR4 指示書 6.2 節、設計書 9.3 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// GR4〜GR12 では .svg から埋め込んだ原文を取り出すのに使った。GR13 で .svg を開くのをやめたので、今は検査(tests/view の
// 安全性の検査で、描いた SVG・保存する SVG が正しい XML として読めること)だけが使う。画面のスクリプトには入らない。
// DOMParser は使わない(ブラウザと Node.js の検査で同じ結果にするため、また外部実体などを読ませないため)。
//
// parseXml(text) → 根の要素 { name, attrs: { 名前: 値 }, children: [要素 | { text }] }。
//   正しい形でない XML、DOCTYPE(外部実体や実体の宣言を含みうる)、定義されていない実体の参照は、例外 XmlError にする。
//   処理命令(<?xml … ?> など)と注釈は読み飛ばす。CDATA は文字として読む。

export class XmlError extends Error {}

const NAME = /^[A-Za-z_:][-A-Za-z0-9_:.]*/;
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s, where) {
  return s.replace(/&([^;&\s]*);?/g, (m, body) => {
    if (!m.endsWith(';')) throw new XmlError(`${where}: 実体の参照が ; で終わっていない`);
    if (body in ENT) return ENT[body];
    let cp = NaN;
    if (/^#x[0-9A-Fa-f]+$/.test(body)) cp = parseInt(body.slice(2), 16);
    else if (/^#[0-9]+$/.test(body)) cp = parseInt(body.slice(1), 10);
    if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0) throw new XmlError(`${where}: 定義されていない実体の参照 &${body};`);
    return String.fromCodePoint(cp);
  });
}

export function parseXml(text) {
  let i = 0;
  const n = text.length;
  const stack = [];
  let root = null;
  let rootSeen = false;
  const fail = (msg) => { throw new XmlError(`${msg}(位置 ${i})`); };
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    if (text.startsWith('<?', i)) { const j = text.indexOf('?>', i + 2); if (j < 0) fail('処理命令が閉じていない'); i = j + 2; continue; }
    if (text.startsWith('<!--', i)) { const j = text.indexOf('-->', i + 4); if (j < 0) fail('注釈が閉じていない'); i = j + 3; continue; }
    if (text.startsWith('<!DOCTYPE', i) || text.startsWith('<!doctype', i)) fail('DOCTYPE は受け付けない(外部実体などを読まないため)');
    if (text.startsWith('<![CDATA[', i)) {
      if (!stack.length) fail('要素の外に CDATA がある');
      const j = text.indexOf(']]>', i + 9); if (j < 0) fail('CDATA が閉じていない');
      stack[stack.length - 1].children.push({ text: text.slice(i + 9, j) });
      i = j + 3; continue;
    }
    if (text.startsWith('<!', i)) fail('受け付けない宣言');
    if (text.startsWith('</', i)) {
      const m = NAME.exec(text.slice(i + 2)); if (!m) fail('終了タグの名前がない');
      const name = m[0];
      let j = i + 2 + name.length;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] !== '>') fail('終了タグが閉じていない');
      const top = stack.pop();
      if (!top || top.name !== name) fail(`終了タグ </${name}> が開始タグと合わない`);
      if (!stack.length) root = top;
      i = j + 1; continue;
    }
    if (text[i] === '<') {
      const m = NAME.exec(text.slice(i + 1)); if (!m) fail('開始タグの名前がない');
      const el = { name: m[0], attrs: Object.create(null), children: [] };
      const parent = stack.length ? stack[stack.length - 1] : null;
      if (parent) parent.children.push(el);
      else { if (rootSeen) fail('根の要素が 2 つある'); rootSeen = true; }
      let j = i + 1 + m[0].length;
      let selfClosing = false;
      for (;;) {
        const ws = j;
        while (j < n && /\s/.test(text[j])) j++;
        if (text.startsWith('/>', j)) { j += 2; selfClosing = true; break; }
        if (text[j] === '>') { j += 1; break; }
        if (j >= n) fail('開始タグが閉じていない');
        if (j === ws) fail('属性の前に空白がない');
        const am = NAME.exec(text.slice(j)); if (!am) fail('属性の名前がない');
        j += am[0].length;
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] !== '=') fail('属性に = がない');
        j++;
        while (j < n && /\s/.test(text[j])) j++;
        const q = text[j];
        if (q !== '"' && q !== "'") fail('属性の値が引用符で囲まれていない');
        const k = text.indexOf(q, j + 1); if (k < 0) fail('属性の値が閉じていない');
        const raw = text.slice(j + 1, k);
        if (raw.includes('<')) fail('属性の値に < がある');
        if (Object.prototype.hasOwnProperty.call(el.attrs, am[0])) fail(`属性 ${am[0]} が 2 回ある`);
        el.attrs[am[0]] = decodeEntities(raw, `属性 ${am[0]}`);
        j = k + 1;
      }
      if (selfClosing) { if (!parent) root = el; }
      else stack.push(el);
      i = j; continue;
    }
    // 文字
    const j = text.indexOf('<', i);
    const end = j < 0 ? n : j;
    const s = text.slice(i, end);
    if (!stack.length) { if (s.trim()) fail('要素の外に文字がある'); }
    else stack[stack.length - 1].children.push({ text: decodeEntities(s, '文字') });
    i = end;
  }
  if (stack.length) fail(`要素 <${stack[stack.length - 1].name}> が閉じていない`);
  if (!root) fail('根の要素がない');
  return root;
}

// 要素の木を深さ優先でたどり、条件に合う最初の要素を返す
export function findElement(el, pred) {
  if (pred(el)) return el;
  for (const c of el.children) if (c.name) { const r = findElement(c, pred); if (r) return r; }
  return null;
}
