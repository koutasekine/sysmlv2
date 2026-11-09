// 画面のスクリプト(src/app/main.js)を、Worker との実際の受け渡しの経路で動かす検査(GR18 指示書 2.6 節の W3。設計書 4 章の「画面の確かめ」)。
//
// 使い方:
//   node tests/view/app_main.mjs     # 単独で動かす(1 行に 1 件、「ok<TAB>検査」か「ng<TAB>検査<TAB>詳しく」を出す)
//   tests/view/app.mjs の検査 14 が、別のプロセスでこれを動かす(大域に置く DOM の作り物を、ほかの検査に持ち込まないため)
//
// 仕組み: DOM の要る部分だけを最小の作り物で置き、src/app/main.js をそのまま読み込む。Worker は、ブラウザの Web Worker の代わりに
// worker_threads で src/app/worker.js を動かし(tests/view/worker_thread.mjs)、応答はブラウザの MessageEvent と同じ形 { data } で
// main.js が作った runner(src/app/runner.js)の onmessage に渡す。main.js の応答の処理(onWorkerMessage など)の例外は記録する
// (ブラウザでは、コンソールに出て、その応答の処理が止まるもの)。
//
// 検査すること:
//   W1: 起動と「例を読み込む」で、応答の処理に例外が出ず、図(SVG)が描ける
//   W2: 一般ビュー「構成の図」で「Arduino Uno」を「Arduino Uno R4」に、相互接続ビューで「温度計」を「温度計2」に名前を変えた後も、
//       その要素が選ばれたまま。続けて前に宣言を 1 行足しても、同じ要素が選ばれたまま(GR18 の E5)
// node tests/view/app_main.mjs --gr19 は、上の代わりに GR19 の検査(GR19 指示書 4 章)をする:
//   警告: W1 の警告が診断欄の「警告」の段に出て、クリックで該当箇所を選び、修正依頼のコピーに入る
//   U1: 「開く」とドロップで、書き換えていたら置き換えの確認が出る(やめたら今のテキストのまま)。開いた・保存した・例の後に
//       書き換えていなければ出ない
//   U2: 「新規」で空のパッケージの骨組みが入り、一般ビューで外枠を選ぶと「部品を足す」が出る
//   U3: 「例を読み込む」で入門用の例と機能紹介用の例を選べ、どちらも図が描ける(入門用は一般ビューと相互接続ビュー)
// node tests/view/app_main.mjs --gr19p5 は、上の代わりに GR19 の P5 の検査(GR19 指示書 v19.1 の 4 章の R1・R2)をする:
//   R1: 診断欄の警告の段の見出しが「警告(N 件。書き間違いのおそれがあるため、意図を確かめてほしい箇所)」で、「規則には反しない」がない
//   R2: 修正依頼のコピーの依頼文が、エラーと警告があるとき・警告だけのとき・エラーだけのときで食い違わない(エラーは直し、警告は
//       意図の確認事項。段のないものには触れない)。「## 警告」の段の頭に、同じ扱いの 1 行がある
// node tests/view/app_main.mjs --gr22 は、上の代わりに GR22 の検査(GR22 指示書 4 章の A1〜A4・B1〜B5)をする:
//   A1: 3 つのファイルのフォルダで、どのファイルの診断(構文エラー・意味エラー・警告・曖昧・未検査・図の診断)をクリックしても、そのファイルに
//       切り替えて、そのファイルの中の行(字句・範囲)を選ぶ。図の要素のクリックの行き先は変わらない
//   A2: 変換中の historyUndo・historyRedo は何もしない。compositionend なしの blur・ファイルの切り替えで変換中の印を解く
//   A3: またがる操作の取り消しの後に、もう一方のファイルで書き換えても、やり直しで理由の文が出ず、履歴が詰まらない
//   A4: 保存の途中(上書き保存・zip の保存)に「保存」を押すと、何もせずに「保存の途中です」を出す
//   B1: 「範囲」の欄の同じ表示に相対パスを付ける。B2: 2 つ以上のドロップは読まずに理由を出す。B3: 診断 0 件で「修正依頼をコピー」を押せない。
//   B5: 構文エラーのクリックで行と列の位置の字句を選ぶ(1 ファイルとフォルダ、4 通り)
// node tests/view/app_main.mjs --gr22p4 [--first new|sample|open] [--only-first] は、上の代わりに GR22 の P4 の検査(GR22 指示書 v22.2 の
// 4 章の B3b・D1)をする:
//   D1: 1 ファイルで、ページを開いた直後(--first の操作)・「開く」・保存・「新規」・「例を読み込む」の直後から、書き換えずに「新規」「例を
//       読み込む」「開く」を行うと確認が出ない。手で打つ・貼り付け・図からの編集・view の書き足しの後は、どの操作でも確認が出て、やめると
//       今のテキストのまま。フォルダのときは今までどおり
//   B3b: info の図の診断だけのとき(1 ファイルとフォルダ)は「修正依頼をコピー」を押せない。構文エラーだけ・意味エラーだけ・警告だけ・
//        未検査だけ・曖昧だけ・warn の図の診断だけのときは押せて、依頼文は toPrompt のまま。診断 0 件では押せない
// (書き込みのできる偽のハンドル fakeRwHandle は、ctl.gate(Promise)があれば、書き込みをそれが解けるまで待たせる。GR22 の A4)
// node tests/view/app_main.mjs --gr24 は、上の代わりに GR24 の検査(GR24 指示書 4 章の T・F・M・Z・モデル)をする。書き込みを記録する偽のフォルダの
// ハンドル fakeFs(ファイル・フォルダを作る・消す・写す・move()。失敗させる相対パス、許可、大文字・小文字を区別しないディスクの真似を持つ)を使う
// node tests/view/app_main.mjs --gr25a は、上の代わりに GR25 の検査(GR25 指示書 4 章の A1〜A6。データを失う経路)をする。fakeFs に、ファイルは
// 作れるが書き込みが失敗する相対パス(ctl.failData)を足した
// node tests/view/app_main.mjs --gr25bc は、上の代わりに GR25 の検査(GR25 指示書 4 章の B・C1〜C12)をする。偽の DOM の focus() が焦点のある
// 要素(document.activeElement)を覚えるようにし、fakeFs に、ファイルの中身を読む(getFile)のを待たせる ctl.readGate を足した
// node tests/view/app_main.mjs --gr25k [--html <パス>] は、上の代わりに GR25 の P4 の検査(GR25 指示書 v25.2 の K・B)をする。src/app/main.js の代わりに、
// ビルドした HTML(その場で buildHtml で作る。--html なら、そのファイル)の中のスクリプトを動かし、配置の幅が数値の px で layout.js の widths と同じことを確かめる
// node tests/view/app_main.mjs --gr25f は、上の代わりに GR25 の P4 の検査(GR25 指示書 v25.2 の F)をする。フォルダの名前の変更・移動・コピーが途中で
// 失敗したとき、写す先に作ったものを消すこと
// node tests/view/app_main.mjs --gr27 [--built] は、上の代わりに GR27 の検査(GR27 指示書 4 章の O・L。モデルツリーと範囲の候補の受け渡しと、
// 大きいファイルの知らせ)をする。説明は gr27 の前
// node tests/view/app_main.mjs --gr27p5 [--built] は、上の代わりに GR27 の P5 の検査(GR27 指示書 v27.4 の S・M。範囲の欄の候補の文字と、
// モデルツリーの行を見えている分だけ並べること)をする。--dump <ファイル> [--mfile <.sysml>] なら、検査の代わりに行と範囲の欄を書き出す。説明は gr27p5 の前
// node tests/view/app_main.mjs --gr20 は、上の代わりに GR20 の検査(GR20 指示書 4 章の F。フォルダの段階 A)をする:
//   フォルダの読み込み(選ぶ画面の偽物・webkitdirectory の欄の偽物・ドロップの偽物の 3 通り。. で始まるフォルダと .sysml でないファイルを
//   読まない、.sysml がないときの理由)、「ファイル」の選択欄と書き換えの印、ファイルを切り替えてもテキスト欄(取り消しの履歴)が残る、
//   診断と図の要素のクリックでファイルが切り替わる、1 つのファイルに収まる名前の変更・追加・削除、ほかのファイルも書き換える名前の変更・
//   削除は理由を出して行わない、view の書き足しが範囲の要素のファイルに入る、保存のファイル名と改行の形、置き換えの確認、「開く」「新規」
//   「例を読み込む」で 1 つのテキストの扱いに戻る、修正依頼のコピーの相対パス、構文エラーのファイルがある間の図と編集

import fs from 'node:fs';
import path from 'node:path';
import { Worker as ThreadWorker } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const lines = [];
const check = (ok, what, detail = '') => { lines.push(ok ? `ok\t${what}` : `ng\t${what}\t${String(detail).replace(/\s+/g, ' ').slice(0, 400)}`); };

// ---- DOM の最小の作り物
const registry = new Map(); // id → 要素
class FakeEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parentNode = null; this._ls = {}; this._cls = new Set(); this.style = {}; this.dataset = {};
    this._attrs = {}; this._value = ''; this._text = ''; this._html = null; this._sel = null; this._id = '';
    this.disabled = false; this.hidden = false; this.scrollTop = 0; this.scrollLeft = 0; this.clientHeight = 600; this.selectionStart = 0; this.selectionEnd = 0;
    this.type = ''; this.placeholder = ''; this.title = ''; this.checked = false;
    const self = this;
    this.classList = { add: (...c) => c.forEach((x) => self._cls.add(x)), remove: (...c) => c.forEach((x) => self._cls.delete(x)), contains: (c) => self._cls.has(c), toggle: (c) => (self._cls.has(c) ? (self._cls.delete(c), false) : (self._cls.add(c), true)) };
  }
  get id() { return this._id; }
  set id(v) { this._id = v; registry.set(v, this); }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get options() { return this.children.filter((c) => c.tagName === 'option'); }
  get value() {
    if (this.tagName !== 'select') return this._value;
    const o = this.options;
    if (this._sel === -1 || !o.length) return '';
    return (o[this._sel ?? 0] ?? o[0]).value;
  }
  set value(v) {
    if (this.tagName !== 'select') { this._value = String(v); return; }
    const i = this.options.findIndex((o) => o.value === v);
    this._sel = i;
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._html = null; this._text = String(v ?? ''); if (this.tagName === 'select') this._sel = null; }
  get innerHTML() { return this._html ?? ''; }
  set innerHTML(v) {
    this.textContent = '';
    this._html = String(v);
    // SVG の文字列なら、svg の要素と、data-id ごとの g の要素を子に作る(querySelector で図の要素を探せるように)
    if (this._html.includes('<svg')) {
      const svg = new FakeEl('svg');
      const m = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(this._html);
      if (m) { svg.setAttribute('width', m[1]); svg.setAttribute('height', m[2]); }
      for (const id of new Set([...this._html.matchAll(/data-id="([^"]*)"/g)].map((x) => x[1]))) { const g = new FakeEl('g'); g.setAttribute('data-id', id); svg.appendChild(g); }
      this.appendChild(svg);
    }
  }
  appendChild(n) {
    if (typeof n === 'string') { const t = new FakeEl('#text'); t._text = n; n = t; }
    if (n.parentNode) n._detach();
    n.parentNode = this; this.children.push(n);
    if (this.tagName === 'select' && this._sel === -1) this._sel = null;
    return n;
  }
  append(...ns) { ns.forEach((n) => this.appendChild(n)); }
  prepend(...ns) { for (const n of ns.reverse()) { this.appendChild(n); this.children.unshift(this.children.pop()); } }
  insertBefore(n, ref) { this.appendChild(n); const i = this.children.indexOf(ref); if (i >= 0) { this.children.pop(); this.children.splice(i, 0, n); } return n; }
  _detach() { if (this.parentNode) { const p = this.parentNode; p.children = p.children.filter((c) => c !== this); this.parentNode = null; } }
  remove() { this._detach(); if (this._id && registry.get(this._id) === this) registry.delete(this._id); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  hasAttribute(k) { return k in this._attrs; }
  matches(sel) { return sel.split(',').some((s) => matchChain(this, s.trim().split(/\s+/))); }
  closest(sel) { for (let x = this; x; x = x.parentNode) if (x.matches?.(sel)) return x; return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  addEventListener(t, f) { (this._ls[t] ??= []).push(f); }
  removeEventListener(t, f) { this._ls[t] = (this._ls[t] ?? []).filter((x) => x !== f); }
  dispatchEvent(ev) { for (const f of [...(this._ls[ev.type] ?? [])]) f(ev); return true; }
  click() { this.dispatchEvent({ type: 'click', target: this, stopPropagation() {}, preventDefault() {} }); }
  focus() { globalThis.document.activeElement = this; } // GR25 の C8: 焦点のある要素を覚える(前は何もしなかった)
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; }
  setRangeText(text, s, e) { this._value = this._value.slice(0, s) + text + this._value.slice(e); this.selectionStart = this.selectionEnd = s + text.length; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  getBBox() { return { x: 0, y: 0, width: 0, height: 0 }; }
  showModal() {} close() {} select() {}
}
// 単純な選択子だけ: tag、.class、tag.class、[attr]、[attr="v"](CSS.escape の \ を外す)。空白で区切ると子孫
function matchOne(el, s) {
  if (el.tagName === '#text') return false;
  const m = /^([a-zA-Z#][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(s);
  if (!m) return false;
  if (m[1] && (m[1].startsWith('#') ? el.id !== m[1].slice(1) : el.tagName !== m[1])) return false;
  for (const c of (m[2] || '').split('.').filter(Boolean)) if (!el._cls.has(c)) return false;
  for (const a of (m[3] || '').match(/\[[^\]]+\]/g) ?? []) {
    const am = /^\[([\w-]+)(?:="(.*)")?\]$/.exec(a);
    if (!am) return false;
    if (!el.hasAttribute(am[1])) return false;
    if (am[2] !== undefined && el.getAttribute(am[1]) !== am[2].replace(/\\(.)/g, '$1')) return false;
  }
  return true;
}
function matchChain(el, parts) {
  if (!matchOne(el, parts.at(-1))) return false;
  let i = parts.length - 2;
  for (let x = el.parentNode; x && i >= 0; x = x.parentNode) if (matchOne(x, parts[i])) i--;
  return i < 0;
}
function makeOption(label, value) { const o = new FakeEl('option'); o._text = String(label); o.value = value ?? String(label); return o; }

// テンプレート(src/app/template.html)の要素のうち、main.js が使うもの
const byId = (id, tag = 'div') => { const e = new FakeEl(tag); e.id = id; return e; };
const body = new FakeEl('body'), head = new FakeEl('head');
for (const [id, tag] of [['src', 'textarea'], ['hl', 'pre'], ['msg'], ['view'], ['canvas'], ['edit'], ['scope', 'select'], ['progress'], ['progressText', 'span'], ['progressFill'],
  ['viewKind', 'select'], ['btnAppendView', 'button'], ['printArea'], ['btnSave', 'button'], ['fileOpen', 'input'], ['drop'], ['btnNew', 'button'], ['btnSample', 'button'], ['btnHelp', 'button'],
  ['dlgHelp', 'dialog'], ['dlgSample', 'dialog'], ['splitter'], ['left'],
  ['fileBar'], ['fileSel', 'select'], ['btnFolder', 'button'], ['dirOpen', 'input'], // この 4 つは GR20 の F
  ['tree'], ['treeName', 'span'], ['treeBody'], ['treeMsg'], ['treeSplit'], ['filePath', 'span'], ['fileDirty', 'span'], // ここから GR24 の T(フォルダの木)
  ['btnNewFile', 'button'], ['btnNewDir', 'button'], ['btnReload', 'button'], ['btnCollapse', 'button'], ['btnFold', 'button']]) body.appendChild(byId(id, tag));
registry.get('fileBar').hidden = true; // テンプレートでは hidden(GR20 の F)
// GR24 の P5 で置き換えた(予定の red の 3): 木の欄はいつも置くので、テンプレートでは hidden でない(GR24 の P4 までは hidden)
registry.get('right') ?? body.appendChild(byId('right'));
registry.get('right').appendChild(registry.get('view'));
registry.get('view').append(registry.get('progress'), registry.get('canvas'), registry.get('drop'));
registry.get('scope').append(makeOption('(処理中)', ''));
// GR26 の P6 の B(--gr26p6): 木の欄の上の帯 #treeHead を置き(ほかの検査では置かない。main.js は無ければ高さ 0 として扱う)、--ro なら偽の
// ResizeObserver を置く(observe した要素を覚え、roFire() で受け手を呼ぶ。置かなければ、ResizeObserver のないブラウザの形)
const GR26P6_ARG = process.argv.includes('--gr26p6');
if (GR26P6_ARG) body.appendChild(byId('treeHead'));
const roList = [];
if (GR26P6_ARG && process.argv.includes('--ro')) globalThis.ResizeObserver = class { constructor(f) { this.f = f; this.els = []; roList.push(this); } observe(e) { this.els.push(e); } unobserve() {} disconnect() { this.els = []; } };
const roFire = () => { for (const o of roList) if (o.els.length) o.f(o.els.map((target) => ({ target })), o); };
const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
for (const m of tpl.slice(tpl.indexOf('<select id="viewKind">'), tpl.indexOf('</select>', tpl.indexOf('<select id="viewKind">'))).matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)) registry.get('viewKind').append(makeOption(m[2], m[1]));
const alerts = [];
globalThis.document = {
  title: 'SysML v2', head, body,
  querySelector: (s) => (s.startsWith('#') ? registry.get(s.slice(1)) ?? null : body.querySelector(s)),
  querySelectorAll: (s) => body.querySelectorAll(s),
  createElement: (tag) => new FakeEl(tag),
  execCommand: () => false, // 入れられないブラウザと同じく、setRangeText と input の出来事で入れる
};
const winLs = {}; // window の出来事の受け手(GR19 の U1 でドロップを起こすのに使う)
// ブラウザの中の覚え(localStorage)の偽物(GR24 の P5 の P)。--ls <JSON> で前のページの中身を入れて始め、--lsthrow なら読み書きで例外を出す
// (ブラウザの設定で使えないときの真似)。入れなければ空で始める(GR24 の P4 までと同じく、木の欄は開いた状態で始まる)
const lsArg = process.argv.indexOf('--ls');
const lsStore = new Map(Object.entries(lsArg > 0 ? JSON.parse(process.argv[lsArg + 1]) : {}));
const LS_THROW = process.argv.includes('--lsthrow');
const lsDenied = () => Object.assign(new Error('localStorage を使えない(偽物)'), { name: 'SecurityError' });
const fakeLs = { getItem: (k) => { if (LS_THROW) throw lsDenied(); return lsStore.has(k) ? lsStore.get(k) : null; }, setItem: (k, v) => { if (LS_THROW) throw lsDenied(); lsStore.set(k, String(v)); } };
globalThis.window = { addEventListener(t, f) { (winLs[t] ??= []).push(f); }, print() {}, innerWidth: 1600, get localStorage() { if (LS_THROW) throw lsDenied(); return fakeLs; } };
globalThis.Option = function Option(label, value) { return makeOption(label, value); };
globalThis.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => `\\${c}`) };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.alert = (m) => alerts.push(m);
const confirms = []; // 出した確認の文(GR19 の U1)
let confirmAnswer = true;
globalThis.confirm = (m) => { confirms.push(m); return confirmAnswer; };
// ファイルの読み込み(「開く」とドロップ。GR19 の U1)。file は { name, bytes }
globalThis.FileReader = class { readAsArrayBuffer(f) { setTimeout(() => { this.result = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength); this.onload?.(); }, 0); } };
const copied = []; // 修正依頼のコピー(GR19 の警告)
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { copied.push(t); } } }, configurable: true });
globalThis.getComputedStyle = () => ({ fontSize: '13px' });
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/build/config.json'), 'utf8'));
// GR23 の予定の red の 1: 1 つにまとめた HTML の出力を index.html にした(前は 'dist/sysmlv2.html')
globalThis.ENABLED_VIEWS = cfg.outputs.find((o) => o.file === 'index.html').views;
globalThis.WORKER_SOURCE = '';
globalThis.SAMPLE_TEXT = fs.readFileSync(path.join(ROOT, 'src/app/sample.sysml'), 'utf8');
globalThis.SAMPLE_INTRO_TEXT = fs.readFileSync(path.join(ROOT, 'src/app/sample_intro.sysml'), 'utf8');
globalThis.HELP_HTML = '';

// ---- Worker: worker_threads で src/app/worker.js を動かし、応答をブラウザの MessageEvent と同じ形 { data } で渡す
const errors = [];   // main.js の応答の処理で出た例外
const results = [];  // 画面に渡した解析の結果 { m, text }(main.js が処理した後に記録する)
const runText = new Map(); // 解析の要求の id → テキスト(作り直した Worker でも id は通し番号)
const threads = [];
// GR26 の P5 の A: hold.on の間は、解析の結果を画面に渡さずに止めておき、hold.release() で渡す(前のテキストの解析の結果が、書き換えの後に
// 届く形を作るため。ほかの検査では使わない)
const hold = { on: false, queue: [], release() { const q = this.queue.splice(0); for (const f of q) f(); } };
let runHook = null; // GR27 P5: 解析を頼んだ直後(analyze が終わった後の microtask)に一度だけ呼ぶ(処理中の画面の状態を見る)
globalThis.Worker = class {
  constructor() {
    const w = new ThreadWorker(path.join(ROOT, 'tests/view/worker_thread.mjs'));
    threads.push(w);
    this.onmessage = null; this.onerror = null; this._w = w;
    w.on('message', (d) => {
      const deliver = () => {
        try { this.onmessage?.({ data: d }); } catch (e) { errors.push(`${d?.type}: ${e?.message ?? e}`); }
        if (d?.type === 'result') results.push({ m: d, text: runText.get(d.id) });
      };
      if (hold.on && d?.type === 'result') hold.queue.push(deliver); else deliver();
    });
    w.on('error', (e) => { try { this.onerror?.(e); } catch (x) { errors.push(`onerror: ${x?.message ?? x}`); } });
  }
  postMessage(m) { if (m?.type === 'run') { runText.set(m.id, m.text); if (runHook) { const h = runHook; runHook = null; queueMicrotask(h); } } this._w.postMessage(m); }
  terminate() { this._w.terminate(); }
};

const $ = (id) => registry.get(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f, ms = 60000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sleep(20); } return null; }
// 今のテキストの解析の結果(画面が処理した後)を待つ
const resultFor = (text, from = 0) => waitFor(() => results.slice(from).find((x) => x.text === text) && results.findLast((x) => x.text === text));
const selectedName = () => ($('edit').classList.contains('on') ? ($('edit').children.find((c) => c.textContent.startsWith('名前'))?.textContent ?? '') : '(選択なし)');
const editText = () => $('edit').textContent.slice(0, 300);

// 図の要素をクリックし、名前の欄が出たら名前を変えて「変更」を押す。→ 書き換えた後のテキストの解析の結果
async function renameByClick(r, name, kind, newName) {
  const node = r.m.structure?.nodes.find((n) => n.info?.name === name && (!kind || n.info.kind === kind));
  if (!node) return { error: `図に「${name}」の箱がない` };
  const g = $('canvas').querySelector(`[data-id="${CSS.escape(node.id)}"]`);
  if (!g) return { error: `SVG に「${name}」(${node.id})がない` };
  $('canvas').dispatchEvent({ type: 'click', target: g });
  if (selectedName() !== `名前: ${name}`) return { error: `クリックで選べない: ${selectedName()}` };
  const inp = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.dataset.which === 'name'), 20000);
  if (!inp) return { error: `名前の欄が出ない: ${editText()}` };
  inp.value = newName;
  const before = $('src').value, n0 = results.length;
  $('edit').querySelectorAll('button').find((b) => b.textContent === '変更').click();
  const changed = await waitFor(() => $('src').value !== before, 30000);
  if (!changed) return { error: `テキストが書き換わらない: ${editText()}` };
  const r2 = await resultFor($('src').value, n0);
  return r2 ? { r: r2 } : { error: '書き換えた後の解析の結果が来ない' };
}

// ---- GR19 の検査(--gr19。GR19 指示書 4 章)
const GR19 = process.argv.includes('--gr19');
const GR19P5 = process.argv.includes('--gr19p5');
// テキストを置いて(入力の出来事で)解析の結果を待つ
async function typeText(t) { const n0 = results.length; $('src').value = t; $('src').dispatchEvent(new Event('input')); return resultFor(t, n0); }
// 「開く」(ファイルの選択)とドロップ。読み込んだら、そのテキストの解析の結果を待つ。置き換えなければ null
const fileOf = (name, text) => ({ name, bytes: new TextEncoder().encode(text) });
async function openBy(how, name, text) {
  const n0 = results.length, before = $('src').value;
  const f = fileOf(name, text);
  if (how === 'open') $('fileOpen').dispatchEvent({ type: 'change', target: { files: [f], value: 'x' } });
  else for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { files: [f] } });
  const replaced = await waitFor(() => $('src').value !== before || $('src').value === text && results.length > n0, 3000);
  if (!replaced || $('src').value !== text) return null;
  return resultFor(text, n0);
}
// 「例を読み込む」のダイアログの、ラベルに word を含むボタンを押す
async function pickSample(word) {
  $('btnSample').click();
  const b = await waitFor(() => $('dlgSample').querySelectorAll('button').find((x) => x.textContent.includes(word)), 3000);
  if (!b) return { error: `ダイアログに「${word}」のボタンがない: ${$('dlgSample').textContent.slice(0, 200)}` };
  const n0 = results.length;
  b.click();
  return { labels: $('dlgSample').querySelectorAll('button').map((x) => x.textContent) , r: await waitFor(() => results.slice(n0).find((x) => x.text === $('src').value), 60000) };
}
// ---- GR19 の P5 の検査(--gr19p5。GR19 指示書 v19.1 の 4 章の R1・R2)
async function gr19p5() {
  const TITLE = '書き間違いのおそれがあるため、意図を確かめてほしい箇所';
  const LEAD = '次の SysML v2 のテキスト表記(SysML 2.0 正式版)について、';
  const RULE = '警告は意図の確認事項です。書き間違いと判断できるものだけ直し、判断できないものは変えずに、確かめたいことを質問として挙げてください。';
  // テキストを置き、診断欄の「修正依頼をコピー」を押して、コピーした文を返す
  const copyFor = async (t) => {
    const r = await typeText(t);
    const n = copied.length;
    $('msg').querySelectorAll('button').find((x) => x.textContent === '修正依頼をコピー')?.click();
    return { r, c: await waitFor(() => copied.length > n && copied.at(-1), 3000), msg: $('msg').textContent };
  };
  const sectionAfter = (c, head) => { const ls = (c ?? '').split('\n'); const i = ls.findIndex((l) => l.startsWith(head)); return i < 0 ? null : ls[i + 1]; };
  // エラー(意味エラー S4)と警告(W1)があるとき
  {
    const { r, c, msg } = await copyFor('package A { }\npublic import A::*;\naction def B;\npart p : B;\n');
    const head = $('msg').children.find((x) => x.textContent.startsWith('警告('))?.textContent ?? '';
    check(!!r && head === `警告(1 件。${TITLE})` && !/規則には反しない/.test(msg), 'GR19 P5 R1: 診断欄の警告の段の見出しが「警告(1 件。書き間違いのおそれがあるため、意図を確かめてほしい箇所)」', head || msg.slice(0, 300));
    const first = (c ?? '').split('\n')[0];
    check(first === `${LEAD}下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。${RULE}`, 'GR19 P5 R2: エラーと警告があるとき、依頼文の頭がエラーを直すことと警告の扱いを分けて書く', first);
    check(/\n## 意味エラー/.test(c ?? '') && /\n## 警告\(/.test(c ?? '') && sectionAfter(c, '## 警告') === RULE && (c ?? '').includes(`## 警告(${TITLE})`), 'GR19 P5 R2: エラーと警告があるとき、「## 警告」の段の見出しと、頭の 1 行(意図の確認事項)がある', (c ?? '').slice(0, 600));
  }
  // 警告だけのとき
  {
    const { c } = await copyFor('action def A;\npart p : A;\n');
    const first = (c ?? '').split('\n')[0];
    check(first.startsWith(LEAD) && first.includes(RULE) && !/構文エラー|意味エラー/.test(first) && !/\n## (構文|意味)エラー/.test(c ?? '') && sectionAfter(c, '## 警告') === RULE, 'GR19 P5 R2: 警告だけのとき、依頼文の頭が警告の扱いだけを書き、エラーに触れない', first);
  }
  // エラーだけのとき
  {
    const { c } = await copyFor('package A { }\npublic import A::*;\n');
    const first = (c ?? '').split('\n')[0];
    check(first === `${LEAD}下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。` && !/警告/.test(c ?? ''), 'GR19 P5 R2: エラーだけのとき、依頼文の頭がエラーを直すことだけを書き、警告に触れない', first);
  }
  // 構文エラーだけのとき(警告は構文エラーがあると検査しない)
  {
    const { c } = await copyFor('part def A\n');
    const first = (c ?? '').split('\n')[0];
    check(first === `${LEAD}下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。` && /\n## 構文エラー/.test(c ?? '') && !/警告/.test(c ?? ''), 'GR19 P5 R2: 構文エラーだけのときも、依頼文の頭がエラーを直すことだけを書く', first);
  }
  // エラーも警告もないとき(未検査だけ)は、今までの依頼文のまま
  {
    const { c } = await copyFor('part p : Missing;\n');
    const first = (c ?? '').split('\n')[0];
    check(first === `${LEAD}下の診断の内容を直したテキストを書いてください。` && /## 未検査の名前/.test(c ?? ''), 'GR19 P5 R2: エラーも警告もないとき(未検査だけ)は、今までの依頼文のまま', first);
  }
  check(errors.length === 0 && alerts.length === 0, 'GR19 P5: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}
// ---- GR20 の検査(--gr20。GR20 指示書 4 章の F): フォルダの段階 A の画面
const GR20 = process.argv.includes('--gr20');
const { folderKey } = await import('../../src/app/runner.js');
// 試しのフォルダ(相対パス → テキスト)。circuit.sysml は CR LF。.git の中と .sysml でないファイルは読まない
const DEMO = {
  'lib.sysml': 'package Lib {\n    part def Lamp;\n    part def Board {\n        port p;\n        port q;\n    }\n}\n',
  'circuit.sysml': 'package Circuit {\r\n    private import Lib::*;\r\n    part sys {\r\n        part bulb : Lamp;\r\n        part x : Board;\r\n        part y : Board;\r\n        connect x.p to y.q;\r\n    }\r\n}\r\n',
  'extra.sysml': 'part solo {\n    part inner;\n}\npart bad : Lib::Missing;\n',
  'sub/more.sysml': 'package More {\n    part def Extra;\n}\n',
  '.git/HEAD.sysml': 'this is not read',
  'notes.txt': 'not read',
};
const ORDER = ['circuit.sysml', 'extra.sysml', 'lib.sysml', 'sub/more.sysml'];
const readLog = []; // 中身を読んだファイルの相対パス
const enc = (t) => new TextEncoder().encode(t);
// フォルダを選ぶ画面のハンドルの偽物(File System Access API の values・getFile の形)
function fakeHandle(name, files) {
  const dirs = new Map();
  const mk = (n, prefix) => ({ kind: 'directory', name: n, async *values() {
    const seen = new Set();
    for (const p of Object.keys(files)) {
      if (prefix && !p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length), i = rest.indexOf('/');
      if (i < 0) yield { kind: 'file', name: rest, getFile: async () => { readLog.push(p); const b = enc(files[p]); return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; } };
      else { const d = rest.slice(0, i); if (!seen.has(d)) { seen.add(d); if (!dirs.has(prefix + d)) dirs.set(prefix + d, mk(d, `${prefix}${d}/`)); yield dirs.get(prefix + d); } }
    }
  } });
  return mk(name, '');
}
// ドロップのフォルダの項目の偽物(webkitGetAsEntry の形)
function fakeEntry(name, files, prefix = '') {
  const kids = [];
  const seen = new Set();
  for (const p of Object.keys(files)) {
    if (prefix && !p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length), i = rest.indexOf('/');
    // GR24 で置き換えた(予定の red の 2): ドロップでは、.sysml でないファイルも File を持っておく(中身は読まない)ので、読んだ記録は File を
    // 得たとき(前は file() を呼んだとき)でなく、中身を読んだとき(arrayBuffer)に付ける
    if (i < 0) kids.push({ isFile: true, isDirectory: false, name: rest, file: (cb) => { const b = enc(files[p]); cb({ arrayBuffer: async () => { readLog.push(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } }); } });
    else { const d = rest.slice(0, i); if (!seen.has(d)) { seen.add(d); kids.push(fakeEntry(d, files, `${prefix}${d}/`)); } }
  }
  return { isDirectory: true, isFile: false, name, createReader() { let done = false; return { readEntries(res) { if (done) res([]); else { done = true; res(kids); } } }; } };
}
// 今のフォルダのテキスト欄の並び(画面が作ったもの)と、解析の要求の文字列
const areas = () => body.children.filter((c) => c.tagName === 'textarea' && c.className === 'fsrc');
// GR24 で置き換えた(予定の red の 1): 「ファイル」の選択欄(#fileSel)をフォルダの木に置き換えたので、選択欄を見ていた検査は、同じことを
// 木で確かめる(前は const fsel = () => $('fileSel');)。options は、木のモデルに入るファイル(薄く出していないファイル)の相対パスを解析の並び
// (符号位置の順)にし、書き換えの印のあるものに ' *' を付けたもの。value は木で強調した今のファイルの番号。value を入れて change を起こすと、
// その番号のファイルの木の項目をクリックする(木の関数 modelPaths・rowOf・curRow・clickRow は、下の GR24 の検査の部品)
let fselPick = null;
const fsel = () => ({
  get options() { return modelPaths().map((p, i) => ({ value: String(i), textContent: `${p}${rowOf(p)?.cls.includes('dirty') ? ' *' : ''}` })); },
  get value() { return String(modelPaths().indexOf(curRow())); },
  set value(v) { fselPick = v; },
  dispatchEvent() { const ps = modelPaths(); if (fselPick != null) clickRow(ps[Number(fselPick)]); fselPick = null; },
});
const curFolderKey = () => folderKey(fsel().options.map((o, i) => ({ path: o.value === String(i) ? o.textContent.replace(/ \*$/, '') : '?', text: areas()[i]?.value ?? '' })));
const shownArea = () => areas().find((a) => !a.hidden) ?? null;
async function loadBy(how, name, files) {
  const n0 = results.length;
  readLog.length = 0;
  if (how === 'picker') { window.showDirectoryPicker = async () => fakeHandle(name, files); $('btnFolder').click(); }
  else if (how === 'input') {
    delete window.showDirectoryPicker;
    $('btnFolder').click();
    const list = Object.keys(files).map((p) => ({ name: p.split('/').pop(), webkitRelativePath: `${name}/${p}`, get bytes() { readLog.push(p); return enc(files[p]); } }));
    $('dirOpen').dispatchEvent({ type: 'change', target: { files: list, value: 'x' } });
  } else for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { items: [{ webkitGetAsEntry: () => fakeEntry(name, files) }], files: [] } });
  const ok = await waitFor(() => fsel().options.length && !$('fileBar').hidden && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
  return ok ? results.slice(n0).findLast((x) => x.text === curFolderKey()) : null;
}
// 図の要素(名前と種類)をクリックする。→ 選べたか
function clickNode(r, name, kind = null) {
  const node = r?.m.structure?.nodes.find((n) => n.info?.name === name && (!kind || n.info.kind === kind));
  const g = node && $('canvas').querySelector(`[data-id="${CSS.escape(node.id)}"]`);
  if (!g) return false;
  const t = { closest: (sel) => (sel === '[data-id]' ? g : sel === '[data-start]' ? { getAttribute: (k) => (k === 'data-start' ? String(node.src[0]) : String(node.src[1])), hasAttribute: () => true } : null) };
  $('canvas').dispatchEvent({ type: 'click', target: t });
  return selectedName() === `名前: ${name}`;
}
async function chooseScope(word, view) {
  if (view && $('viewKind').value !== view) { const n0 = results.length; $('viewKind').value = view; $('viewKind').dispatchEvent({ type: 'change' }); await waitFor(() => results.slice(n0).some((x) => x.text === curFolderKey())); }
  const o = $('scope').options.find((x) => x.textContent.includes(word));
  if (!o) return null;
  const n0 = results.length;
  $('scope').value = o.value;
  $('scope').dispatchEvent({ type: 'change' });
  return waitFor(() => results.slice(n0).findLast((x) => x.text === curFolderKey()));
}
async function editButton(label) { return waitFor(() => $('edit').querySelectorAll('button').find((b) => b.textContent === label), 20000); }
async function gr20() {
  // ---- 読み込み(フォルダを選ぶ画面の偽物)。. で始まるフォルダと .sysml でないファイルを読まない
  const r1 = await loadBy('picker', 'demo', DEMO);
  const labels = fsel().options.map((o) => o.textContent);
  check(!!r1 && JSON.stringify(labels) === JSON.stringify(ORDER) && areas().length === 4, 'GR20 F: 「フォルダを開く」(選ぶ画面)で、.sysml を相対パスの符号位置の順に読み込み、「ファイル」の選択欄に並べる', `${labels.join(',')} / 読んだ ${readLog.join(',')}`);
  check(!readLog.some((p) => p.startsWith('.git/') || p.endsWith('.txt')), 'GR20 F: 名前が . で始まるフォルダの中と .sysml でないファイルは読まない(選ぶ画面)', readLog.join(','));
  check(!!r1 && r1.m.ok && r1.m.folder?.files.length === 4 && $('src').hidden && shownArea()?.value === DEMO['circuit.sysml'], 'GR20 F: 1 つのテキスト欄を隠し、最初のファイルのテキスト欄を出す', JSON.stringify(r1?.m.folder));
  // 診断: 相対パスを付け、クリックでそのファイルに切り替える
  const li = $('msg').querySelectorAll('li').find((x) => x.textContent.includes('(S1)'));
  check(!!li && li.textContent.startsWith('extra.sysml 4 行 12 列: '), 'GR20 F: 診断に相対パス・行・列が付く', li?.textContent ?? $('msg').textContent.slice(0, 300));
  li?.click();
  const missingAt = DEMO['extra.sysml'].indexOf('Lib::Missing'); // S1 の範囲は修飾名の全体(1 つのテキストのときと同じ)
  check(fsel().value === '1' && shownArea() === areas()[1] && shownArea().selectionStart === missingAt && shownArea().selectionEnd === missingAt + 'Lib::Missing'.length, 'GR20 F: 診断をクリックすると、そのファイルに切り替えて該当箇所を選ぶ', `${fsel().value} ${shownArea()?.selectionStart}-${shownArea()?.selectionEnd}`);
  // 修正依頼のコピー: 診断ごとに相対パス、テキストは診断のあるファイルだけを相対パスの見出し付きで
  $('msg').querySelectorAll('button').find((x) => x.textContent === '修正依頼をコピー')?.click();
  const c = await waitFor(() => copied.at(-1), 3000);
  check(!!c && /\n- extra\.sysml 4 行 12 列: /.test(c) && c.includes('\n### extra.sysml\n```sysml\n') && !c.includes('### lib.sysml') && !c.includes('### circuit.sysml'), 'GR20 F: 修正依頼のコピーで、診断に相対パスが付き、テキストは診断のあるファイルだけを相対パスの見出しを付けて入れる', (c ?? '').slice(0, 500));
  // 図の要素のクリックで、その要素のあるファイルに切り替える(一般ビューのパッケージ Lib の図の Lamp)
  const gLib = await chooseScope('Lib', 'general');
  const clicked = clickNode(gLib, 'Lamp', 'PartDefinition');
  check(clicked && fsel().value === '2' && shownArea() === areas()[2], 'GR20 F: 図の要素をクリックすると、その要素のあるファイル(lib.sysml)に切り替える', `${clicked} ${fsel().value}`);
  // ほかのファイルも書き換える名前の変更(GR21 で置き換えた。予定の red の 1): GR21 の X で行うようになった。lib.sysml の宣言と circuit.sysml の
  // 参照(import で取り込んだ Lamp)を書き換え、名前を変えた要素のファイル(lib.sysml)を表示する
  // (GR20 の期待: 「この操作は、ほかのファイル(circuit.sysml)も書き換えるので、今はできません」を出して行わない)
  const before = areas().map((a) => a.value);
  const inp = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.dataset.which === 'name'), 20000);
  if (inp) { inp.value = 'Lamp2'; $('edit').querySelectorAll('button').find((b) => b.textContent === '変更')?.click(); }
  const why = await waitFor(() => areas()[2].value.includes('part def Lamp2;') && areas()[0].value.includes('part bulb : Lamp2;') && results.some((x) => x.text === curFolderKey()), 30000);
  check(!!why && !/今はできません/.test($('edit').textContent) && fsel().value === '2' && areas()[1].value === before[1] && areas()[3].value === before[3], 'GR20 F(GR21 で置き換え): ほかのファイルも書き換える名前の変更を行い(lib.sysml と circuit.sysml を書き換え、ほかは変えない)、名前を変えた要素のファイルを表示する', `${editText()} / ${fsel().value}`);
  // 1 つのファイルに収まる名前の変更(extra.sysml の solo → solo2)。書き換えたファイルに印が付き、そのファイルを表示する
  const gRoot = await chooseScope('根の名前空間', 'general') ?? await chooseScope('(根', 'general');
  let ren = false;
  if (clickNode(gRoot, 'solo')) {
    const i2 = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.dataset.which === 'name'), 20000);
    if (i2) {
      i2.value = 'solo2';
      const n0 = results.length;
      $('edit').querySelectorAll('button').find((b) => b.textContent === '変更')?.click();
      ren = await waitFor(() => areas()[1].value.startsWith('part solo2 {') && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
    }
  }
  // GR21 で置き換えた(予定の red の 1 に含める。オーナーの裁定の問 2): 前の名前の変更(Lamp → Lamp2)が行われるようになったので、書き換えた
  // すべてのファイル(circuit.sysml・lib.sysml と、この操作の extra.sysml)に印が付く(GR20 の期待: extra.sysml だけに印、circuit.sysml には印なし)
  check(!!ren && fsel().value === '1' && JSON.stringify(fsel().options.map((o) => o.textContent)) === JSON.stringify(['circuit.sysml *', 'extra.sysml *', 'lib.sysml *', 'sub/more.sysml']), 'GR20 F(GR21 で置き換え): 1 つのファイルに収まる名前の変更を行い、そのファイルを表示し、書き換えたすべてのファイル(前の名前の変更のものを含む)に印(*)を付ける', `${areas()[1]?.value.slice(0, 30)} / ${fsel().options.map((o) => o.textContent).join(',')} / ${editText()}`);
  // 追加(solo2 に部品を足す)
  const gRoot2 = results.findLast((x) => x.text === curFolderKey());
  let added = false;
  if (clickNode(gRoot2, 'solo2')) {
    const b = await editButton('部品を足す');
    b?.click();
    const nm = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.placeholder === '名前(必須)'), 5000);
    if (nm) {
      nm.value = 'added20';
      const n0 = results.length;
      $('edit').querySelectorAll('button').find((x) => x.textContent === '足す')?.click();
      added = await waitFor(() => areas()[1].value.includes('part added20;') && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
    }
  }
  check(!!added && fsel().value === '1', 'GR20 F: 1 つのファイルに収まる追加(部品を足す)を行い、そのファイルに書き足す', `${areas()[1]?.value} / ${editText()}`);
  // ほかのファイルも書き換える削除(lib.sysml の Board のポート p。circuit.sysml の connect を一緒に消すことになる)。GR21 で置き換えた
  // (予定の red の 1): GR21 の X で行うようになったので、理由を出さずに、消す前の一覧に circuit.sysml の connect を出す(「消す」は押さない)
  // (GR20 の期待: 「この操作は、ほかのファイル(circuit.sysml)も書き換えるので、今はできません」を出して行わない)
  const icBoard = await chooseScope('Board', 'interconnection');
  let delOther = null;
  const beforeDel = areas().map((a) => a.value);
  if (clickNode(icBoard, 'p', 'PortUsage')) {
    (await editButton('削除'))?.click();
    delOther = await waitFor(() => $('edit').querySelectorAll('button').some((x) => x.textContent === '消す') && $('edit').textContent, 20000);
  }
  check(!!delOther && !/今はできません/.test(delOther) && /一緒に消す: circuit\.sysml 7 行 connect x\.p to y\.q;/.test(delOther) && areas().every((a, i) => a.value === beforeDel[i]), 'GR20 F(GR21 で置き換え): ほかのファイルも書き換える削除は、理由を出さずに、消す前の一覧に一緒に消すほかのファイルの接続(相対パス付き)を出す(「消す」を押すまで書き換えない)', (delOther || editText()).slice(0, 300));
  // 1 つのファイルに収まる削除(extra.sysml の inner)
  const gRoot3 = await chooseScope('根の名前空間', 'general') ?? await chooseScope('(根', 'general');
  let del = false;
  if (clickNode(gRoot3, 'inner')) {
    (await editButton('削除'))?.click();
    const ok = await waitFor(() => $('edit').querySelectorAll('button').find((x) => x.textContent === '消す'), 20000);
    const n0 = results.length;
    ok?.click();
    del = await waitFor(() => !areas()[1].value.includes('part inner;') && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
  }
  check(!!del && fsel().value === '1', 'GR20 F: 1 つのファイルに収まる削除を行う', `${areas()[1]?.value} / ${editText()}`);
  // view の書き足し: 相互接続ビューの範囲 sys(circuit.sysml の Circuit の中)→ circuit.sysml に書き足す
  const icSys = await chooseScope('sys', 'interconnection');
  let appended = false;
  if (icSys && !$('btnAppendView').disabled) {
    const n0 = results.length;
    $('btnAppendView').click();
    appended = await waitFor(() => areas()[0].value.includes("view 'sysの相互接続ビュー' : StandardViewDefinitions::InterconnectionView { expose sys::**; }") && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
  }
  check(!!appended && fsel().value === '0' && !areas()[2].value.includes('view ') && !areas()[1].value.includes('view '), 'GR20 F: 「view を書き足す」は、範囲の要素のファイル(circuit.sysml)に書き足す', `${areas()[0]?.value.slice(-200)} / ${$('btnAppendView').disabled}`);
  // ファイルを切り替えても、テキスト欄(取り消しの履歴を持つもの)は同じものが残る
  const els = areas().slice();
  fsel().value = '2'; fsel().dispatchEvent({ type: 'change' });
  fsel().value = '0'; fsel().dispatchEvent({ type: 'change' });
  check(areas().length === 4 && areas().every((a, i) => a === els[i]) && shownArea() === els[0] && areas().filter((a) => !a.hidden).length === 1 && els[1].value.includes('solo2'), 'GR20 F: ファイルを切り替えても、ファイルごとのテキスト欄(取り消しの履歴)は作り直さずに残り、表示するのは 1 つ', areas().map((a) => a.hidden).join(','));
  // 保存(GR21 で置き換えた。予定の red の 2): 選ぶ画面で読み込んだフォルダ(ハンドルあり)なので、「保存」は上書き保存になる(GR21 の O)。
  // この検査の偽のハンドル(fakeHandle)は書き込みの機能を持たないので、書けず、指示書 3.3 節の失敗の理由の窓が 1 件出て、印が残る
  // (GR20 の期待: 今表示しているファイルを、そのファイル名で、読み込んだときの改行の形(CR LF)でダウンロードし、印を消す)
  const saved = [];
  globalThis.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; };
  const made = [];
  const ce = document.createElement;
  document.createElement = (t) => { const e = ce(t); if (t === 'a') made.push(e); return e; };
  const marks0 = fsel().options.map((o) => o.textContent);
  const na0 = alerts.length;
  $('btnSave').click();
  const saveAlert = await waitFor(() => alerts.length > na0 && alerts.at(-1), 5000);
  document.createElement = ce;
  const dirtyPaths = marks0.filter((x) => x.endsWith(' *')).map((x) => x.slice(0, -2));
  check(!!saveAlert && made.length === 0 && saved.length === 0 && saveAlert.startsWith('書かなかったファイルがあります(印はそのまま残します):\n') && dirtyPaths.length > 0 && dirtyPaths.every((p) => saveAlert.includes(`\n${p}: 書けませんでした(`)) && JSON.stringify(fsel().options.map((o) => o.textContent)) === JSON.stringify(marks0),
    'GR20 F(GR21 で置き換え): 選ぶ画面で読み込んだフォルダの「保存」は上書き保存になり、書き込みの機能のない偽のハンドルには書けず、失敗の理由の窓を 1 件出して印を残す(ダウンロードしない)', `${JSON.stringify(saveAlert)} / ${made.length} / ${marks0.join(',')} → ${fsel().options.map((o) => o.textContent).join(',')}`);
  console.error(`GR21: 保存の失敗の窓の文: ${JSON.stringify(saveAlert)}`);
  // 構文エラーのファイルがある間は、ほかのファイルの図を薄く出し、図から編集しない
  {
    const a = areas()[2], n0 = results.length;
    fsel().value = '2'; fsel().dispatchEvent({ type: 'change' });
    a.value = a.value + 'part def Broken\n';
    a.dispatchEvent(new Event('input'));
    const r = await waitFor(() => results.slice(n0).findLast((x) => x.text === curFolderKey()), 30000);
    check(!!r && r.m.ok && r.m.blocked === true && $('view').classList.contains('stale') && r.m.diagnostics.syntax.length === 1 && r.m.diagnostics.syntax[0].path === 'lib.sysml' && $('msg').textContent.includes('lib.sysml '), 'GR20 F: どれかのファイルに構文エラーがある間は、ほかのファイルを解析して図を薄く出し、構文エラーに相対パスを付ける', JSON.stringify(r?.m.diagnostics.syntax));
    const n1 = results.length;
    a.value = a.value.replace('part def Broken\n', '');
    a.dispatchEvent(new Event('input'));
    await waitFor(() => results.slice(n1).some((x) => x.text === curFolderKey()), 30000);
  }
  // 置き換えの確認(書き換えたファイルがあるとき)。やめたらフォルダのまま
  {
    const k = confirms.length;
    confirmAnswer = false;
    $('btnNew').click();
    check(confirms.length === k + 1 && /フォルダ「demo」/.test(confirms.at(-1)) && !$('fileBar').hidden, 'GR20 F: 書き換えたファイルがあれば「新規」で置き換えの確認を出し、やめたらフォルダのまま', confirms.at(-1));
    await loadBy('input', 'demo2', DEMO);
    check(confirms.length === k + 2 && fsel().options[1].textContent === 'extra.sysml *', 'GR20 F: 書き換えたファイルがあれば「フォルダを開く」でも確認を出し、やめたら今のまま', `${confirms.at(-1)} / ${fsel().options.map((o) => o.textContent).join(',')}`);
    confirmAnswer = true;
  }
  // webkitdirectory の欄の偽物で読み込む(確認で OK)
  const r2 = await loadBy('input', 'demo2', DEMO);
  check(!!r2 && JSON.stringify(fsel().options.map((o) => o.textContent)) === JSON.stringify(ORDER) && !readLog.some((p) => p.startsWith('.git/') || p.endsWith('.txt')), 'GR20 F: webkitdirectory の欄で読み込む(. で始まるフォルダと .sysml でないファイルは読まない)', `${fsel().options.map((o) => o.textContent).join(',')} / ${readLog.join(',')}`);
  // ドロップの偽物で読み込む(書き換えていないので確認なし)
  const k3 = confirms.length;
  const r3 = await loadBy('drop', 'demo3', DEMO);
  check(!!r3 && confirms.length === k3 && fsel().options.length === 4 && !readLog.some((p) => p.startsWith('.git/') || p.endsWith('.txt')), 'GR20 F: フォルダのドロップで読み込む(書き換えていなければ確認を出さない。. で始まるフォルダと .sysml でないファイルは読まない)', `${confirms.length - k3} ${readLog.join(',')}`);
  // .sysml のないフォルダ(GR24 で置き換えた。予定の red の 2): 理由を出さずに開き、木に .sysml でないファイルを出す(GR20 の期待: 読み込まずに
  // 「フォルダ「empty」には .sysml のファイルがないので、読み込みませんでした」の理由を出し、前のフォルダのまま)
  const na = alerts.length;
  window.showDirectoryPicker = async () => fakeHandle('empty', { 'a.txt': 'x', '.git/b.sysml': 'part def X;' });
  $('btnFolder').click();
  const opened = await waitFor(() => $('treeName').textContent === 'empty', 5000);
  check(!!opened && alerts.length === na && fsel().options.length === 0 && JSON.stringify(treeRows().map((r) => r.path)) === JSON.stringify(['a.txt']), 'GR20 F(GR24 で置き換え): .sysml がないフォルダも、理由を出さずに開き、木に .sysml でないファイルを出す(. で始まるフォルダは出さない)', `${alerts.slice(na).join('/')} / ${treeRows().map((r) => r.path).join(',')}`);
  alerts.splice(na);
  // 「開く」「新規」「例を読み込む」で 1 つのテキストの扱いに戻る
  const back = {};
  {
    const r = await openBy('open', 'single.sysml', 'part def One;\n');
    back.open = !!r && $('fileBar').hidden && !$('src').hidden && areas().length === 0 && $('src').value === 'part def One;\n';
    await loadBy('picker', 'demo', DEMO);
    const n0 = results.length;
    $('btnNew').click();
    back.new = !!(await resultFor("package '新しいシステム' {\n}\n", n0)) && $('fileBar').hidden && areas().length === 0;
    await loadBy('picker', 'demo', DEMO);
    const p = await pickSample('入門');
    back.sample = !!p.r && $('fileBar').hidden && areas().length === 0 && $('src').value === SAMPLE_INTRO_TEXT;
  }
  check(back.open && back.new && back.sample, 'GR20 F: 「開く」「新規」「例を読み込む」で、フォルダを閉じて 1 つのテキストの扱いに戻る', JSON.stringify(back));
  // GR21 で置き換えた(予定の red の 2): 上の「保存」の失敗の理由の窓 1 件だけが出る(GR20 の期待: 窓が 0 件)。窓が 0 件の形は、書き込みのできる
  // 偽のハンドルで --gr21 が確かめる
  check(errors.length === 0 && alerts.length === 1 && alerts[0] === saveAlert, 'GR20(GR21 で置き換え): 画面の処理を通して、応答の処理の例外が 0 件で、警告の窓は「保存」の失敗の理由の 1 件だけ', [...errors, ...alerts].join(' / '));
}

// ---- GR21 の検査(--gr21。GR21 指示書 4 章の H・O・Z・X): ファイルごとの取り消しの履歴、上書き保存、zip の保存、複数のファイルにまたがる編集
const GR21 = process.argv.includes('--gr21');
// 書き込みのできるフォルダのハンドルの偽物(File System Access API の values・getDirectoryHandle・getFileHandle・getFile・createWritable・
// queryPermission・requestPermission の形)。files は相対パス → { text, lastModified }。書き込みは writes に記録し、files を書き換える
function fakeRwHandle(name, files, ctl) {
  const fileH = (p) => ({ kind: 'file', name: p.split('/').pop(),
    getFile: async () => { readLog.push(p); const f = files[p]; const b = enc(f.text); return { lastModified: f.lastModified, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; },
    createWritable: async () => { let buf = ''; return { write: async (x) => { if (ctl.gate) await ctl.gate; if (ctl.failWrite?.includes(p)) throw Object.assign(new Error('書き込みに失敗(偽物)'), { name: 'NotAllowedError' }); buf += x; }, close: async () => { files[p] = { text: buf, lastModified: ++ctl.clock }; ctl.writes.push({ path: p, text: buf }); }, abort: async () => {} }; } });
  const dirH = (n, prefix) => ({ kind: 'directory', name: n,
    async *values() {
      const seen = new Set();
      for (const p of Object.keys(files)) {
        if (prefix && !p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length), i = rest.indexOf('/');
        if (i < 0) yield fileH(p);
        else { const d = rest.slice(0, i); if (!seen.has(d)) { seen.add(d); yield dirH(d, `${prefix}${d}/`); } }
      }
    },
    getDirectoryHandle: async (d) => { if (!Object.keys(files).some((p) => p.startsWith(`${prefix}${d}/`))) throw new Error(`フォルダ ${d} がない`); ctl.walk.push(`dir:${prefix}${d}`); return dirH(d, `${prefix}${d}/`); },
    getFileHandle: async (f) => { if (!files[prefix + f]) throw new Error(`ファイル ${f} がない`); return fileH(prefix + f); },
    queryPermission: async () => { ctl.asked.push('query'); return ctl.perm; },
    requestPermission: async (o) => { ctl.asked.push(`request:${o?.mode}`); if (ctl.grant) ctl.perm = 'granted'; return ctl.perm; },
  });
  return dirH(name, '');
}
// テキスト欄に、手で打ったときと同じ出来事を起こす(beforeinput と input。inputType を付ける)
function typeIn(a, str, inputType = 'insertText') {
  const s = a.selectionStart, t = a.selectionEnd;
  a.dispatchEvent({ type: 'beforeinput', inputType, preventDefault() {} });
  a._value = a._value.slice(0, s) + str + a._value.slice(t);
  a.selectionStart = a.selectionEnd = s + str.length;
  a.dispatchEvent({ type: 'input', inputType });
}
function typeChars(a, str) { for (const c of str) typeIn(a, c); }
function caretAt(a, at) { a.dispatchEvent({ type: 'mousedown' }); a.selectionStart = a.selectionEnd = at; }
// キーの出来事(→ preventDefault を呼んだか)
function key(a, k, mods = {}) { let prevented = false; a.dispatchEvent({ type: 'keydown', key: k, ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: !!mods.shift, altKey: false, isComposing: !!mods.composing, preventDefault() { prevented = true; } }); return prevented; }
function histInput(a, which) { let prevented = false; a.dispatchEvent({ type: 'beforeinput', inputType: which, preventDefault() { prevented = true; } }); return prevented; }
const pick = (k) => { fsel().value = String(k); fsel().dispatchEvent({ type: 'change' }); };
const fileMsgText = () => $('fileBar').children.find((c) => c.className.includes('fmsg'))?.textContent ?? '';
// zip を読む(格納の形だけ)。→ [{ path, flags, method, data(文字) }]
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  const n = v.getUint16(e + 10, true), off = v.getUint32(e + 16, true);
  const out = [];
  for (let i = 0, p = off; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const path = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl));
    const lnl = v.getUint16(lo + 26, true), lel = v.getUint16(lo + 28, true);
    out.push({ path, flags, method, localFlags: v.getUint16(lo + 6, true), data: new TextDecoder().decode(bytes.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + size)) });
    p += 46 + nl + el + cl;
  }
  return out;
}
async function gr21() {
  const D21 = { ...DEMO, 'sub/more.sysml': 'package More {\n    part def Extra;\n    part useLamp : Lib::Lamp;\n}\n' };
  const ctl = { writes: [], walk: [], asked: [], perm: 'prompt', grant: true, clock: 1000, failWrite: [] };
  const store = Object.fromEntries(Object.entries(D21).map(([p, t]) => [p, { text: t, lastModified: 500 }]));
  const loadRw = async () => {
    const n0 = results.length;
    readLog.length = 0;
    window.showDirectoryPicker = async () => fakeRwHandle('demo', store, ctl);
    $('btnFolder').click();
    const ok = await waitFor(() => fsel().options.length && !$('fileBar').hidden && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
    return ok ? results.slice(n0).findLast((x) => x.text === curFolderKey()) : null;
  };
  const waitKey = async (n0) => waitFor(() => results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
  const r0 = await loadRw();
  check(!!r0 && fsel().options.length === 4, 'GR21: 書き込みのできるフォルダのハンドルの偽物で読み込む', fsel().options.map((o) => o.textContent).join(','));
  const [A, B] = [areas()[0], areas()[1]];
  const A0 = A.value, B0 = B.value;
  // ---- H: A を書き換え、B に切り替えて書き換え、A に戻って取り消すと A だけが戻り、B はそのまま。やり直しで A が戻る
  {
    pick(0); caretAt(A, 0); typeChars(A, '// abc\n'.slice(0, 6));
    pick(1); caretAt(B, 0); typeChars(B, '//xyz');
    pick(0);
    const prevented = key(A, 'z', { ctrl: true });
    const afterUndo = [A.value, B.value];
    const redoPrevented = key(A, 'y', { ctrl: true });
    const afterRedo = A.value;
    key(A, 'z', { ctrl: true });
    const shiftRedo = key(A, 'Z', { ctrl: true, shift: true });
    check(prevented && afterUndo[0] === A0 && afterUndo[1] === '//xyz' + B0, 'GR21 H: A を書き換え、B に切り替えて書き換え、A に戻って Ctrl+Z を押すと、A だけが戻り(続けて打った文字が 1 回で戻る)、B はそのまま。ブラウザの取り消しを止める(preventDefault)', JSON.stringify(afterUndo.map((x) => x.slice(0, 20))));
    check(redoPrevented && afterRedo === '// abc' + A0 && shiftRedo && A.value === '// abc' + A0, 'GR21 H: Ctrl+Y と Ctrl+Shift+Z でやり直すと A が戻る', JSON.stringify([afterRedo.slice(0, 10), A.value.slice(0, 10)]));
    // B の取り消しは B だけ
    pick(1);
    key(B, 'z', { ctrl: true });
    check(B.value === B0 && A.value === '// abc' + A0, 'GR21 H: B で取り消すと B だけが戻る', JSON.stringify([A.value.slice(0, 10), B.value.slice(0, 10)]));
  }
  // ---- H: 改行・貼り付けでまとまりが切れる
  {
    pick(1);
    const base = B.value;
    caretAt(B, 0);
    typeChars(B, 'ab'); typeIn(B, '\n', 'insertLineBreak'); typeChars(B, 'cd');
    const steps = [];
    for (let i = 0; i < 3; i++) { key(B, 'z', { ctrl: true }); steps.push(B.value.slice(0, 5)); }
    check(JSON.stringify(steps) === JSON.stringify(['ab\n' + base.slice(0, 2), 'ab' + base.slice(0, 3), base.slice(0, 5)]), 'GR21 H: 改行でまとまりが切れる(「ab」改行「cd」を 3 回の取り消しで戻す)', JSON.stringify(steps));
    caretAt(B, 0);
    typeChars(B, 'ab'); typeIn(B, 'XY', 'insertFromPaste'); typeChars(B, 'cd');
    const s2 = [];
    for (let i = 0; i < 3; i++) { key(B, 'z', { ctrl: true }); s2.push(B.value.slice(0, 4)); }
    check(JSON.stringify(s2) === JSON.stringify(['abXY', 'ab' + base.slice(0, 2), base.slice(0, 4)]), 'GR21 H: 貼り付けでまとまりが切れる(「ab」貼り付け「XY」「cd」を 3 回の取り消しで戻す)', JSON.stringify(s2));
    // カーソルを動かすとまとまりが切れる
    caretAt(B, 0); typeChars(B, 'ab'); key(B, 'ArrowRight'); B.selectionStart = B.selectionEnd = 2; typeChars(B, 'cd');
    key(B, 'z', { ctrl: true });
    const s3 = B.value.slice(0, 2);
    key(B, 'z', { ctrl: true });
    check(s3 === 'ab' && B.value === base, 'GR21 H: カーソルの移動でまとまりが切れる', JSON.stringify([s3, B.value.slice(0, 4)]));
  }
  // ---- H: 変換中の文字は確定するまで履歴を作らない
  {
    pick(1);
    const base = B.value;
    caretAt(B, 0);
    B.dispatchEvent({ type: 'compositionstart' });
    typeIn(B, 'か', 'insertCompositionText');
    B._value = B._value.replace(/^か/, '漢'); B.dispatchEvent({ type: 'input', inputType: 'insertCompositionText' });
    const ignored = key(B, 'z', { ctrl: true, composing: true });
    const during = B.value.slice(0, 1);
    B.dispatchEvent({ type: 'compositionend' });
    typeChars(B, 'x');
    key(B, 'z', { ctrl: true });
    const s1 = B.value.slice(0, 2);
    key(B, 'z', { ctrl: true });
    check(!ignored && during === '漢' && s1 === '漢' + base[0] && B.value === base, 'GR21 H: 変換中の文字は確定するまで履歴を作らず(変換中の Ctrl+Z はアプリで扱わない)、確定した文字を 1 つのまとまりにする', JSON.stringify([ignored, during, s1, B.value.slice(0, 3)]));
  }
  // ---- H: 取り消して保存したときの形に戻ると印が消える。右クリックの「元に戻す」(beforeinput の historyUndo)も止めてアプリの履歴で戻す
  {
    pick(2);
    const C = areas()[2], base = C.value;
    caretAt(C, 0); typeChars(C, '// q');
    const marked = fsel().options[2].textContent === 'lib.sysml *';
    const prevented = histInput(C, 'historyUndo');
    const unmarked = fsel().options[2].textContent === 'lib.sysml';
    const redoPrevented = histInput(C, 'historyRedo');
    const back = C.value.startsWith('// q');
    key(C, 'z', { ctrl: true });
    check(marked && prevented && unmarked && C.value === base && redoPrevented && back && fsel().options[2].textContent === 'lib.sysml', 'GR21 H: beforeinput の historyUndo・historyRedo(右クリックの「元に戻す」「やり直し」)を止めてアプリの履歴で戻し、保存したときの形に戻ると印が消える', JSON.stringify([marked, prevented, unmarked, redoPrevented, back]));
  }
  // B(extra.sysml)を読み込んだときの形に戻す
  pick(1);
  for (let i = 0; i < 20 && B.value !== B0; i++) key(B, 'z', { ctrl: true });
  check(B.value === B0 && A.value === '// abc' + A0, 'GR21 H: 取り消しを重ねて、読み込んだときの形に戻せる', JSON.stringify(B.value.slice(0, 10)));
  pick(0); key(A, 'z', { ctrl: true });
  {
    const n0 = results.length;
    await waitKey(n0);
  }
  // ---- X: lib.sysml の Lamp を Lamp2 に(circuit.sysml・sub/more.sysml の参照も書き換える)。名前を変えた要素のファイルを表示する
  let xOk = false;
  {
    const gLib = await chooseScope('Lib', 'general');
    if (clickNode(gLib, 'Lamp', 'PartDefinition')) {
      const inp = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.dataset.which === 'name'), 20000);
      if (inp) {
        inp.value = 'Lamp2';
        const n0 = results.length;
        $('edit').querySelectorAll('button').find((b) => b.textContent === '変更')?.click();
        xOk = await waitFor(() => areas()[2].value.includes('part def Lamp2;') && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
      }
    }
    const labels = fsel().options.map((o) => o.textContent);
    check(!!xOk && fsel().value === '2' && areas()[0].value.includes('part bulb : Lamp2;\r\n') && areas()[3].value.includes('part useLamp : Lib::Lamp2;') && JSON.stringify(labels) === JSON.stringify(['circuit.sysml *', 'extra.sysml', 'lib.sysml *', 'sub/more.sysml *']) && selectedName() === '名前: Lamp2',
      'GR21 X: ほかのファイルも書き換える名前の変更を行い、書き換えたすべてのファイルに印を付け、名前を変えた要素のファイルを表示し、その要素を選んだままにする', `${labels.join(',')} / ${fsel().value} / ${selectedName()} / ${editText()}`);
  }
  // ---- X: つながった取り消し(どのファイルで取り消しても、すべてのファイルで戻す)とやり直し
  {
    pick(0);
    key(areas()[0], 'z', { ctrl: true });
    const undone = areas()[0].value === A0 && areas()[2].value === D21['lib.sysml'] && areas()[3].value === D21['sub/more.sysml'];
    const labels = fsel().options.map((o) => o.textContent);
    pick(3);
    key(areas()[3], 'y', { ctrl: true });
    const redone = areas()[0].value.includes('Lamp2;') && areas()[2].value.includes('part def Lamp2;') && areas()[3].value.includes('Lib::Lamp2;');
    check(undone && JSON.stringify(labels) === JSON.stringify(['circuit.sysml', 'extra.sysml', 'lib.sysml', 'sub/more.sysml']) && redone, 'GR21 X: またがる名前の変更を、circuit.sysml の Ctrl+Z の 1 回で 3 つのファイルとも戻し(印も消える)、sub/more.sysml の Ctrl+Y の 1 回で 3 つともやり直す', JSON.stringify({ undone, labels, redone }));
    // 後から書き換えたファイルがあるときは、取り消さずに理由を出す
    pick(0);
    caretAt(areas()[0], areas()[0].value.length);
    typeChars(areas()[0], '//z');
    pick(2);
    const before = areas().map((a) => a.value);
    key(areas()[2], 'z', { ctrl: true });
    const msg = fileMsgText();
    check(areas().every((a, i) => a.value === before[i]) && msg === 'ほかのファイル(circuit.sysml)で後から書き換えたので、この操作は戻せません。先にそのファイルで取り消してください', 'GR21 X: またがる操作の後に、ほかのファイルで後から書き換えていれば、取り消さずに「ほかのファイル(…)で後から書き換えたので、この操作は戻せません。先にそのファイルで取り消してください」を出す', msg);
    pick(0);
    key(areas()[0], 'z', { ctrl: true });
    pick(2);
    key(areas()[2], 'z', { ctrl: true });
    check(areas()[0].value === A0 && areas()[2].value === D21['lib.sysml'] && areas()[3].value === D21['sub/more.sysml'] && fileMsgText() === '', 'GR21 X: そのファイルで先に取り消せば、またがる操作を戻せる', fileMsgText());
    const n0 = results.length;
    await waitKey(n0);
  }
  // ---- X: lib.sysml の Board の p を消す(circuit.sysml の connect も一緒に消す)。1 回の取り消しで両方戻す
  {
    const icBoard = await chooseScope('Board', 'interconnection');
    let del = false;
    if (clickNode(icBoard, 'p', 'PortUsage')) {
      (await editButton('削除'))?.click();
      const ok = await waitFor(() => $('edit').querySelectorAll('button').find((x) => x.textContent === '消す'), 20000);
      const plan = $('edit').textContent;
      const n0 = results.length;
      ok?.click();
      del = await waitFor(() => !areas()[0].value.includes('connect x.p') && !areas()[2].value.includes('port p;') && results.slice(n0).some((x) => x.text === curFolderKey()), 30000) && /一緒に消す: circuit\.sysml /.test(plan);
    }
    check(!!del && fsel().value === '2' && areas()[0].value.includes('part y : Board;\r\n    }\r\n'), 'GR21 X: ほかのファイルの connect も一緒に消す削除を行い(消す前の一覧に相対パス)、消した要素のファイルを表示する', `${editText()} / ${fsel().value}`);
    key(areas()[2], 'z', { ctrl: true });
    check(areas()[0].value === A0 && areas()[2].value === D21['lib.sysml'], 'GR21 X: またがる削除を 1 回の取り消しで両方のファイルとも戻す', JSON.stringify(areas()[0].value.slice(-60)));
    const n0 = results.length;
    await waitKey(n0);
  }
  // ---- O: 書き換えたファイル(CR LF の circuit.sysml と、下のフォルダの sub/more.sysml)だけを同じ相対パスに書く
  {
    pick(0); caretAt(areas()[0], 0); typeChars(areas()[0], '// o1\n'.slice(0, 5));
    pick(3); caretAt(areas()[3], 0); typeChars(areas()[3], '// o2');
    ctl.writes.length = 0; ctl.asked.length = 0; ctl.walk.length = 0;
    $('btnSave').click();
    await waitFor(() => ctl.writes.length >= 2 && /上書き保存/.test(fileMsgText()), 10000);
    const w = Object.fromEntries(ctl.writes.map((x) => [x.path, x.text]));
    check(JSON.stringify(Object.keys(w).sort()) === JSON.stringify(['circuit.sysml', 'sub/more.sysml']) && w['circuit.sysml'] === '// o1' + D21['circuit.sysml'] && w['sub/more.sysml'] === '// o2' + D21['sub/more.sysml'] && ctl.walk.includes('dir:sub'),
      'GR21 O: 「保存」で、書き換えたファイルだけを、同じ相対パス(下のフォルダはハンドルをたどる)に、読み込んだときの改行の形(CR LF)で書く', JSON.stringify(ctl.writes).slice(0, 300));
    check(JSON.stringify(ctl.asked) === JSON.stringify(['query', 'request:readwrite']) && fsel().options.every((o) => !o.textContent.endsWith(' *')) && fileMsgText() === '2 ファイルを上書き保存しました' && !alerts.length,
      'GR21 O: 最初の上書き保存で書き込みの許可を求め(queryPermission → requestPermission({ mode: readwrite }))、書いたファイルの印を消す', `${JSON.stringify(ctl.asked)} / ${fsel().options.map((o) => o.textContent).join(',')} / ${fileMsgText()}`);
    // 2 回目は許可を求めない(許可済み)。書き換えていなければ何も書かない
    ctl.asked.length = 0; ctl.writes.length = 0;
    $('btnSave').click();
    await waitFor(() => /何も書きませんでした/.test(fileMsgText()), 5000);
    check(ctl.writes.length === 0 && /書き換えたファイルがないので、何も書きませんでした/.test(fileMsgText()), 'GR21 O: 書き換えたファイルがなければ何も書かない', fileMsgText());
  }
  // ---- O: 許可されないとき、1 つのファイルの書き込みが失敗したとき、ほかで変えられていたとき
  {
    pick(1); caretAt(areas()[1], 0); typeChars(areas()[1], '//d');
    ctl.perm = 'prompt'; ctl.grant = false; ctl.writes.length = 0;
    const na = alerts.length;
    $('btnSave').click();
    const al = await waitFor(() => alerts.length > na && alerts.at(-1), 5000);
    check(!!al && al === 'フォルダ「demo」への書き込みが許可されなかったので、何も書きませんでした' && ctl.writes.length === 0 && fsel().options[1].textContent === 'extra.sysml *', 'GR21 O: 書き込みが許可されなければ、何も書かずに理由を出す(印はそのまま)', al);
    alerts.splice(na);
    ctl.grant = true;
    pick(2); caretAt(areas()[2], 0); typeChars(areas()[2], '//f');
    ctl.failWrite = ['extra.sysml']; ctl.writes.length = 0;
    $('btnSave').click();
    const al2 = await waitFor(() => alerts.length > na && alerts.at(-1), 5000);
    check(!!al2 && al2.startsWith('書かなかったファイルがあります') && al2.includes('extra.sysml: 書けませんでした(NotAllowedError: 書き込みに失敗(偽物))') && ctl.writes.length === 1 && ctl.writes[0].path === 'lib.sysml'
      && fsel().options[1].textContent === 'extra.sysml *' && fsel().options[2].textContent === 'lib.sysml', 'GR21 O: 1 つのファイルの書き込みが失敗したら、ファイルごとの理由を出し、書けたファイルの印だけを消す', `${al2} / ${fsel().options.map((o) => o.textContent).join(',')}`);
    alerts.splice(na);
    ctl.failWrite = [];
    // extra.sysml を、読み込んだ後にほかで変えたことにする(最終更新の時刻と中身)
    store['extra.sysml'] = { text: 'part changed;\n', lastModified: 9999 };
    const nc = confirms.length;
    confirmAnswer = false; ctl.writes.length = 0;
    $('btnSave').click();
    await waitFor(() => confirms.length > nc && alerts.length > na, 5000);
    const askedText = confirms.at(-1);
    check(askedText === 'ファイル「extra.sysml」は、読み込んだ後にほかで変えられています。上書きしますか?(キャンセルを押すと、このファイルは書きません)' && ctl.writes.length === 0 && store['extra.sysml'].text === 'part changed;\n' && fsel().options[1].textContent === 'extra.sysml *',
      'GR21 O: ほかで変えられていたファイルは、上書きするかを確かめ、やめたら書かない(印はそのまま)', `${askedText} / ${alerts.at(-1)}`);
    alerts.splice(na);
    confirmAnswer = true;
    $('btnSave').click();
    await waitFor(() => ctl.writes.length === 1, 5000);
    check(ctl.writes.length === 1 && store['extra.sysml'].text === '//d' + D21['extra.sysml'] && fsel().options[1].textContent === 'extra.sysml', 'GR21 O: 上書きすると答えれば書き、印を消す', JSON.stringify(ctl.writes));
    // 同じものは、時刻が同じなら中身を比べずに変わっていないとする(2 回目の保存は確認なし)
    pick(1); caretAt(areas()[1], 0); typeChars(areas()[1], '//e');
    const nc2 = confirms.length; ctl.writes.length = 0;
    $('btnSave').click();
    await waitFor(() => ctl.writes.length === 1, 5000);
    check(confirms.length === nc2 && ctl.writes.length === 1, 'GR21 O: 自分で保存した後の最終更新の時刻を覚え、次の保存では確認を出さない', `${confirms.length - nc2}`);
  }
  // ---- Z: ハンドルのないとき(webkitdirectory の欄)は、フォルダの木のすべてのファイルを相対パスのまま入れた zip を保存する
  // (GR24 で置き換えた。予定の red の 3。GR21 の期待: すべての .sysml だけを入れ、.git の中と .sysml でないファイルは入れない。
  // .sysml でないファイルの中身は保存のときに読むので、zip を作り終えるのを待つ)
  {
    await loadBy('input', 'demo2', D21);
    pick(2); caretAt(areas()[2], 0); typeChars(areas()[2], '// z');
    const saved = [], made = [];
    globalThis.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; };
    const ce = document.createElement;
    document.createElement = (t) => { const e = ce(t); if (t === 'a') made.push(e); return e; };
    $('btnSave').click();
    await waitFor(() => saved.length, 5000);
    document.createElement = ce;
    const blob = saved.at(-1);
    const z = blob ? readZip(new Uint8Array(await blob.arrayBuffer())) : null;
    const want = { 'circuit.sysml': D21['circuit.sysml'], 'extra.sysml': D21['extra.sysml'], 'lib.sysml': '// z' + D21['lib.sysml'], 'notes.txt': D21['notes.txt'], 'sub/more.sysml': D21['sub/more.sysml'] };
    check(made.at(-1)?.download === 'demo2.zip' && !!z && JSON.stringify(z.map((x) => x.path)) === JSON.stringify(Object.keys(want)) && z.every((x) => x.data === want[x.path]) && z.every((x) => (x.flags & 0x0800) && (x.localFlags & 0x0800) && x.method === 0),
      'GR21 Z(GR24 で置き換え): 「保存」で、フォルダの木のすべてのファイル(.sysml でない notes.txt を含む)を相対パスのまま(下のフォルダを含む)、中身と改行の形(CR LF)を保って、ファイル名を UTF-8 の印付きで入れた、圧縮しない zip をフォルダの名前で保存する', JSON.stringify(z?.map((x) => [x.path, x.flags, x.method, x.data.slice(0, 12)])));
    check(!!z && !z.some((x) => x.path.startsWith('.git/')) && z.some((x) => x.path === 'notes.txt') && fsel().options.every((o) => !o.textContent.endsWith(' *')) && /demo2\.zip に保存しました/.test(fileMsgText()), 'GR21 Z(GR24 で置き換え): .git の中は入れず、.sysml でないファイルは入れ、保存したらすべての印を消す', `${fsel().options.map((o) => o.textContent).join(',')} / ${fileMsgText()}`);
  }
  // ---- 1 ファイルの扱いではアプリの履歴を使わない(Ctrl+Z も historyUndo も止めず、ブラウザの取り消しに任せる)
  {
    const r = await openBy('open', 'single.sysml', 'part def One;\n');
    const src = $('src');
    src.selectionStart = src.selectionEnd = src.value.length;
    typeChars(src, 'x');
    const p1 = key(src, 'z', { ctrl: true });
    const p2 = histInput(src, 'historyUndo');
    check(!!r && !p1 && !p2 && src.value === 'part def One;\nx' && $('fileBar').hidden, 'GR21 H: 1 ファイルの扱いではアプリの履歴を使わない(Ctrl+Z と historyUndo を止めず、テキストを変えない)', JSON.stringify([p1, p2, src.value]));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR21: 画面の処理を通して、応答の処理の例外と(確かめたもののほかの)警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

async function gr19() {
  // ---- 警告: 診断欄の「警告」の段・クリック・修正依頼のコピー
  {
    const t = 'action def A;\npart p : A;\n';
    const r = await typeText(t);
    const msg = $('msg');
    const head = msg.children.find((c) => c.textContent.startsWith('警告('));
    const li = msg.querySelectorAll('li').find((x) => x.textContent.includes('(W1)'));
    check(!!r && /警告 1 件/.test(msg.textContent) && !/意味エラー/.test(msg.textContent) && !!head && !!li && li.textContent.startsWith('2 行 10 列: 部品 p の型に指定した A は、行動の定義です'), 'GR19 警告: W1 が診断欄の「警告」の段に、行と列を付けて出る(意味エラーと混ぜない)', msg.textContent.slice(0, 300));
    li?.click();
    check($('src').selectionStart === t.indexOf('A;\n', 14) && $('src').selectionEnd === t.indexOf('A;\n', 14) + 1, 'GR19 警告: 警告をクリックすると、テキストの該当箇所(型の名前)を選ぶ', `${$('src').selectionStart}-${$('src').selectionEnd}`);
    const btn = msg.querySelectorAll('button').find((x) => x.textContent === '修正依頼をコピー');
    btn?.click();
    const c = await waitFor(() => copied.at(-1), 3000);
    check(!!c && /## 警告/.test(c) && /2 行 10 列: 部品 p の型に指定した A は、行動の定義です。SysML 2\.0 の 7\.11\.2 節では、部品の型は項目の定義\(部品の定義を含む\)か KerML の構造とされています。意図した型の指定か確かめてください\(W1。出典: SysML 2\.0 7\.11\.2\)/.test(c), 'GR19 警告: 修正依頼のコピーに警告が入る', (c ?? '').slice(0, 400));
  }
  // ---- U1: 「開く」とドロップの置き換えの確認
  const A = 'part def A1;\n', B = 'part def B1;\n', C = 'part def C1;\n', D = 'part def D1;\n';
  {
    // 例を読み込んだ後、書き換えていなければ確認を出さない
    await pickSample('入門');
    let k = confirms.length;
    const r1 = await openBy('open', 'a.sysml', A);
    check(!!r1 && confirms.length === k, 'GR19 U1: 例を読み込んだ後に書き換えていなければ、「開く」で確認を出さずに開く', `確認 ${confirms.length - k} 回、${$('src').value.slice(0, 40)}`);
    // 開いた後、書き換えていなければ、ドロップでも確認を出さない
    k = confirms.length;
    const r2 = await openBy('drop', 'b.sysml', B);
    check(!!r2 && confirms.length === k, 'GR19 U1: 開いた後に書き換えていなければ、ドロップで確認を出さずに開く', `確認 ${confirms.length - k} 回`);
    // 書き換えたら、「開く」で確認を出す。やめたら今のテキストのまま
    const edited = B + 'part def E1;\n';
    await typeText(edited);
    k = confirms.length; confirmAnswer = false;
    const r3 = await openBy('open', 'c.sysml', C);
    check(r3 === null && confirms.length === k + 1 && $('src').value === edited, 'GR19 U1: 書き換えた後の「開く」で置き換えの確認を出し、やめたら今のテキストのまま', `確認 ${confirms.length - k} 回、${JSON.stringify($('src').value)}`);
    // ドロップでも確認を出す。やめたら今のテキストのまま
    k = confirms.length;
    const r4 = await openBy('drop', 'c.sysml', C);
    check(r4 === null && confirms.length === k + 1 && $('src').value === edited, 'GR19 U1: 書き換えた後のドロップで置き換えの確認を出し、やめたら今のテキストのまま', `確認 ${confirms.length - k} 回、${JSON.stringify($('src').value)}`);
    // 確認で「OK」なら置き換える
    k = confirms.length; confirmAnswer = true;
    const r5 = await openBy('drop', 'c.sysml', C);
    check(!!r5 && confirms.length === k + 1, 'GR19 U1: 確認で OK なら、ドロップしたファイルで置き換える', `確認 ${confirms.length - k} 回、${JSON.stringify($('src').value)}`);
    // 書き換えて保存した後は、書き換えていない扱い(確認を出さない)
    await typeText(C + 'part def F1;\n');
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    $('btnSave').click();
    k = confirms.length;
    const r6 = await openBy('open', 'd.sysml', D);
    check(!!r6 && confirms.length === k, 'GR19 U1: 書き換えて保存した後は、「開く」で確認を出さずに開く', `確認 ${confirms.length - k} 回`);
  }
  // ---- U2: 「新規」の骨組み。一般ビューで外枠を選ぶと「部品を足す」が出る
  {
    const n0 = results.length;
    $('btnNew').click();
    const skeleton = "package '新しいシステム' {\n}\n";
    const r = await resultFor(skeleton, n0);
    check(!!r && $('src').value === skeleton && $('viewKind').value === 'general', 'GR19 U2: 「新規」で空のパッケージの骨組みの 2 行が入り、一般ビューで開く', JSON.stringify($('src').value));
    const node = r?.m.structure?.nodes.find((n) => n.info?.name === '新しいシステム');
    const g = node && $('canvas').querySelector(`[data-id="${CSS.escape(node.id)}"]`);
    if (g) $('canvas').dispatchEvent({ type: 'click', target: g });
    const add = g ? await waitFor(() => $('edit').querySelectorAll('button').find((b) => b.textContent === '部品を足す'), 20000) : null;
    check(!!add, 'GR19 U2: 一般ビューで外枠(パッケージ)を選ぶと「部品を足す」が出る', node ? editText() : `図に外枠の箱がない(${(r?.m.structure?.nodes ?? []).map((n) => n.info?.name).join(',')})`);
  }
  // ---- U3: 「例を読み込む」で 2 つの例を選べる
  {
    const p1 = await pickSample('入門');
    const intro = p1.r;
    check(!p1.error && p1.labels.length >= 2 && !!intro && $('src').value === SAMPLE_INTRO_TEXT && intro.m.ok && !!$('canvas').querySelector('svg'), 'GR19 U3: 「例を読み込む」で入門用の例を選ぶと、そのテキストが入り図が描ける', p1.error ?? `${p1.labels.join(' / ')}、${$('src').value.slice(0, 40)}`);
    const d = intro?.m.diagnostics;
    check(!!d && d.semantic.length === 0 && d.warning.length === 0 && d.unchecked.count === 0 && d.ambiguous.count === 0 && d.syntax.length === 0, 'GR19 U3: 入門用の例の意味エラー・警告・未検査・曖昧が 0 件', JSON.stringify(d && { s: d.semantic.length, w: d.warning.length, u: d.unchecked.count }));
    const views = {};
    for (const v of ['interconnection', 'general']) {
      const n0 = results.length;
      $('viewKind').value = v;
      $('viewKind').dispatchEvent({ type: 'change' });
      const r = await resultFor(SAMPLE_INTRO_TEXT, n0);
      views[v] = !!r && r.m.ok && r.m.view === v && !!r.m.svg && (r.m.structure?.nodes ?? []).some((n) => n.info?.name === '豆電球');
    }
    check(views.interconnection && views.general, 'GR19 U3: 入門用の例は、相互接続ビューと一般ビューで図が描ける(「豆電球」の箱がある)', JSON.stringify(views));
    const p2 = await pickSample('機能紹介');
    check(!p2.error && !!p2.r && $('src').value === SAMPLE_TEXT && p2.r.m.ok && !!$('canvas').querySelector('svg'), 'GR19 U3: 「例を読み込む」で機能紹介用の例を選ぶと、そのテキストが入り図が描ける', p2.error ?? $('src').value.slice(0, 40));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR19: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR22 の検査(--gr22。GR22 指示書 4 章の A1〜A4・B1〜B5): デプロイ前の確認で見つかった不具合の直し
const GR22 = process.argv.includes('--gr22');
// A1 の 3 つのファイルのフォルダ。ファイル k に、警告 W2(3 行)・意味エラー S1(4 行)・未検査 Z<k>(5 行)・曖昧 N<k>(12 行)と、
// 相互接続ビューの範囲 U<k>::H<k> で図の診断(描いていない接続。13 行)を置く(曖昧・未検査は、クリックの行き先がそのファイルになるよう、
// ファイルごとに名前を分ける)
const A1_TEXT = (k) => `package D${k} { part def E${k}; }\npackage P${k} {\n    part E${k} : D${k}::E${k};\n    part b${k} : P${k}::Missing;\n    part u${k} : Z${k};\n}\npackage X${k}a { part def N${k}; }\npackage X${k}b { part def N${k}; }\npackage U${k} {\n    private import X${k}a::*;\n    private import X${k}b::*;\n    part a${k} : N${k};\n    part def H${k} { part w; part v; connect w to P${k}::E${k}; connect w to v; }\n}\n`;
const A1_FILES = Object.fromEntries([0, 1, 2].map((k) => [`f${k}.sysml`, A1_TEXT(k)]));
const lineText = (t, n) => t.split('\n')[n - 1];
const selText = () => { const a = shownArea() ?? $('src'); return a.value.slice(a.selectionStart, a.selectionEnd); };
const selRange = () => { const a = shownArea() ?? $('src'); return [a.selectionStart, a.selectionEnd]; };
const diagLi = (pred) => $('msg').querySelectorAll('li').find((x) => pred(x.textContent));
// 構文エラーの B5 の 4 通り(行の先頭・中ほど・行の終わり・空白の位置)。→ [テキスト, 選ぶ字句(空ならカーソルだけ), カーソルの位置]
const B5_CASES = [
  ['行の先頭', 'part def A\nfoo b;\n', 'foo', 11],
  ['中ほど', 'part def A;\nfoo bar;\n', 'bar', 16],
  ['行の終わり', 'part def A {', '', 12],
  ['空白の位置', "part def A {\n    part 'a\tb';\n}\n", '', 24],
];
async function gr22() {
  // ---- A1: 3 つのファイルのフォルダで、行だけを持つ診断(曖昧・未検査・図の診断)と、範囲を持つ診断(意味エラー・警告)を、どのファイルでも
  // クリックすると、そのファイルに切り替えて、そのファイルの中の該当の行(範囲)を選ぶ
  {
    await loadBy('picker', 'a1', A1_FILES);
    for (const k of [0, 1, 2]) {
      const p = `f${k}.sysml`, t = A1_FILES[p];
      const r = await chooseScope(`part def U${k}::H${k}`, 'interconnection');
      const got = {};
      const go = (name, pred, want) => {
        pick((k + 1) % 3); // 別のファイルを表示してからクリックする
        const li = diagLi(pred);
        if (!li) { got[name] = 'なし'; return; }
        li.click();
        got[name] = fsel().value === String(k) && selText() === want ? 'ok' : `${fsel().value}:${JSON.stringify(selText())}`;
      };
      // 範囲を持つ診断は、今までどおり、その範囲(つないだテキストの位置からファイルの中の位置にしたもの)を選ぶ
      const base = r?.m.folder?.files[k]?.base ?? 0;
      const rng = (e) => (e ? t.slice(e.start - base, e.end - base) : '(診断なし)');
      go('意味エラー', (x) => x.startsWith(`${p} 4 行 `) && x.includes('(S1)'), rng(r?.m.diagnostics.semantic.find((e) => e.path === p)));
      go('警告', (x) => x.startsWith(`${p} 3 行 `) && x.includes('(W2)'), rng(r?.m.diagnostics.warning.find((e) => e.path === p)));
      go('未検査', (x) => x.startsWith(`Z${k}: `), lineText(t, 5));
      go('曖昧', (x) => x.startsWith(`N${k}: `), lineText(t, 12));
      go('図の診断', (x) => x.startsWith(`${p} 13 行: `), lineText(t, 13));
      check(!!r && Object.values(got).every((x) => x === 'ok') && Object.keys(got).length === 5, `GR22 A1: 3 つのファイルのフォルダの ${k + 1} つ目のファイル(${p})の意味エラー・警告・未検査・曖昧・図の診断をクリックすると、そのファイルに切り替えて、その行(範囲)を選ぶ`, JSON.stringify(got));
    }
    // 図の要素のクリックの行き先は変わらない(3 つ目のファイルの要素)
    const g = await chooseScope('package P2', 'general');
    pick(0);
    const node = g?.m.structure?.nodes.find((n) => n.info?.name === 'b2');
    const ok = clickNode(g, 'b2');
    const base = g?.m.folder?.files[2]?.base ?? 0;
    check(ok && fsel().value === '2' && node && JSON.stringify(selRange()) === JSON.stringify([node.src[0] - base, node.src[1] - base]), 'GR22 A1: 図の要素のクリックは、今までどおり、その要素のファイル(3 つ目)に切り替えて、その要素の原文の範囲を選ぶ', `${ok} ${fsel().value} ${JSON.stringify(selRange())} ${JSON.stringify(node?.src)} ${base}`);
    // 構文エラー: 1 つ目・2 つ目・3 つ目のファイルにそれぞれ置き、クリックで、そのファイルの行と列の字句を選ぶ(B5 の後の形)
    // (P2 で置き換えた。予定の red の 2。P1 の期待: そのファイルの該当の行の全体 'foo b;'(位置 11〜17))
    const got = [];
    for (const k of [0, 1, 2]) {
      const files = { ...A1_FILES, [`f${k}.sysml`]: 'part def A\nfoo b;\n' };
      await loadBy('picker', `a1s${k}`, files);
      pick((k + 1) % 3);
      const li = diagLi((x) => x.startsWith(`f${k}.sysml 2 行 1 列: `));
      li?.click();
      got.push(!!li && fsel().value === String(k) && selText() === 'foo' && JSON.stringify(selRange()) === '[11,14]' ? 'ok' : `${!!li} ${fsel().value} ${JSON.stringify(selText())}`);
    }
    check(got.every((x) => x === 'ok'), 'GR22 A1・B5: 構文エラーを 1 つ目・2 つ目・3 つ目のファイルに置き、クリックすると、そのファイルに切り替えて、そのファイルの行と列の字句を選ぶ', JSON.stringify(got));
  }
  // ---- B5: 1 ファイルとフォルダ(2 つ目のファイル)で、構文エラーのクリックが行と列の位置の字句を選ぶ(4 通り)
  {
    await openBy('open', 'b5.sysml', 'part def Z;\n');
    const single = [];
    for (const [what, text, tok, at] of B5_CASES) {
      await typeText(text);
      const li = diagLi((x) => /^\d+ 行 \d+ 列: /.test(x));
      $('src').selectionStart = $('src').selectionEnd = 0;
      li?.click();
      single.push(!!li && selText() === tok && $('src').selectionStart === at ? 'ok' : `${what}: ${JSON.stringify(selText())} ${$('src').selectionStart}`);
    }
    check(single.every((x) => x === 'ok'), 'GR22 B5: 1 ファイルの扱いで、構文エラーのクリックが行と列の位置の字句を選ぶ(行の先頭 foo・中ほど bar・行の終わりと空白の位置はカーソルだけ)', JSON.stringify(single));
    await loadBy('picker', 'b5', { 'a.sysml': 'part def Q;\n', 'b.sysml': 'part def R;\n' });
    const folderRes = [];
    for (const [what, text, tok, at] of B5_CASES) {
      pick(1);
      const a = areas()[1], n0 = results.length;
      a.value = text; a.dispatchEvent({ type: 'input', inputType: 'insertFromPaste' });
      await waitFor(() => results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
      pick(0);
      const li = diagLi((x) => x.startsWith('b.sysml '));
      li?.click();
      folderRes.push(!!li && fsel().value === '1' && selText() === tok && a.selectionStart === at ? 'ok' : `${what}: ${fsel().value} ${JSON.stringify(selText())} ${a.selectionStart}`);
    }
    check(folderRes.every((x) => x === 'ok'), 'GR22 B5: フォルダの扱い(2 つ目のファイル)で、構文エラーのクリックが、そのファイルに切り替えて、行と列の位置の字句を選ぶ(4 通り)', JSON.stringify(folderRes));
  }
  // ---- A2: 変換中の取り消し・やり直しは何もしない。compositionend なしの blur・ファイルの切り替えで、変換中の印を解く
  {
    await loadBy('picker', 'a2', DEMO);
    pick(1);
    const B = areas()[1], base = B.value;
    caretAt(B, 0); typeChars(B, 'ab');
    B.dispatchEvent({ type: 'compositionstart' });
    typeIn(B, 'か', 'insertCompositionText');
    const v1 = B.value;
    const pu = histInput(B, 'historyUndo');
    const afterUndo = B.value;
    const pr = histInput(B, 'historyRedo');
    const afterRedo = B.value;
    const pk = key(B, 'z', { ctrl: true });
    const same = afterUndo === v1 && afterRedo === v1 && B.value === v1;
    check(pu && pr && same && v1 === 'abか' + base, 'GR22 A2: 変換中に beforeinput の historyUndo・historyRedo が来ても、テキストを変えず、ブラウザの取り消しを止める(preventDefault)', JSON.stringify([pu, pr, pk, afterUndo.slice(0, 4), afterRedo.slice(0, 4), B.value.slice(0, 4)]));
    // compositionend を送らずに blur → 手で打った文字が履歴に入り、Ctrl+Z で戻る(変換中の文字も 1 つの履歴になっている)
    B.dispatchEvent({ type: 'blur' });
    typeChars(B, 'x');
    const steps = [];
    for (let i = 0; i < 3; i++) { key(B, 'z', { ctrl: true }); steps.push(B.value.slice(0, 4)); }
    check(JSON.stringify(steps) === JSON.stringify(['abか' + base[0], 'ab' + base.slice(0, 2), base.slice(0, 4)]), 'GR22 A2: compositionend を送らずに blur した後、手で打った文字が履歴に入り、Ctrl+Z で x → 変換中の文字 → 前の打った文字の順に戻る(変換中の取り消しで履歴は変わっていない)', JSON.stringify(steps));
    // ほかのファイルへの切り替えでも解く
    caretAt(B, 0);
    B.dispatchEvent({ type: 'compositionstart' });
    typeIn(B, 'き', 'insertCompositionText');
    pick(2); pick(1);
    typeChars(B, 'y');
    const s2 = [];
    for (let i = 0; i < 2; i++) { key(B, 'z', { ctrl: true }); s2.push(B.value.slice(0, 3)); }
    check(JSON.stringify(s2) === JSON.stringify(['き' + base.slice(0, 2), base.slice(0, 3)]), 'GR22 A2: compositionend を送らずにほかのファイルに切り替えた後も、手で打った文字が履歴に入り、Ctrl+Z で y → 変換中の文字の順に戻る', JSON.stringify(s2));
  }
  // ---- A3: またがる名前の変更 → 取り消し → もう一方のファイルで 1 字打つ → 最初のファイルでやり直し。理由の文が出ず、やり直しの履歴が詰まらない
  {
    const D = { ...DEMO, 'sub/more.sysml': 'package More {\n    part def Extra;\n    part useLamp : Lib::Lamp;\n}\n' };
    await loadBy('picker', 'a3', D);
    const L = areas()[2];
    pick(2); caretAt(L, 0); typeChars(L, '/*L*/');
    await waitFor(() => results.some((x) => x.text === curFolderKey()), 30000);
    let renamed = false;
    const gLib = await chooseScope('Lib', 'general');
    if (clickNode(gLib, 'Lamp', 'PartDefinition')) {
      const inp = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.dataset.which === 'name'), 20000);
      if (inp) {
        inp.value = 'Lamp2';
        const n0 = results.length;
        $('edit').querySelectorAll('button').find((b) => b.textContent === '変更')?.click();
        renamed = await waitFor(() => L.value.includes('part def Lamp2;') && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
      }
    }
    pick(0); key(areas()[0], 'z', { ctrl: true });
    const undone = !L.value.includes('Lamp2') && !areas()[0].value.includes('Lamp2') && L.value.startsWith('/*L*/');
    pick(3); caretAt(areas()[3], areas()[3].value.length); typeChars(areas()[3], 'q');
    pick(2);
    const before = areas().map((a) => a.value);
    key(L, 'y', { ctrl: true });
    const msg = fileMsgText();
    const unchanged = areas().every((a, i) => a.value === before[i]);
    key(L, 'z', { ctrl: true });
    const u2 = L.value === D['lib.sysml'];
    key(L, 'y', { ctrl: true });
    const r2 = L.value === '/*L*/' + D['lib.sysml'];
    check(!!renamed && undone && msg === '' && unchanged && u2 && r2 && fileMsgText() === '', 'GR22 A3: またがる名前の変更 → 取り消し → もう一方のファイル(sub/more.sysml)で 1 字打つ → 最初のファイル(lib.sysml)でやり直し、の順で、理由の文が出ず、何も変えず、そのファイルで続けて取り消し・やり直しができる', JSON.stringify({ renamed, undone, msg, unchanged, u2, r2 }));
  }
  // ---- A4: 保存の途中に「保存」を押すと、何もせずに理由を出す(上書き保存・zip の保存)
  {
    const SAVING = '保存の途中です。今の保存が終わってから、もう一度押してください';
    const ctl = { writes: [], walk: [], asked: [], perm: 'granted', grant: true, clock: 1000, failWrite: [], gate: null };
    const store = Object.fromEntries(Object.entries(DEMO).map(([p, t]) => [p, { text: t, lastModified: 500 }]));
    window.showDirectoryPicker = async () => fakeRwHandle('a4', store, ctl);
    const n0 = results.length;
    $('btnFolder').click();
    await waitFor(() => !$('fileBar').hidden && results.slice(n0).some((x) => x.text === curFolderKey()), 30000);
    pick(2); caretAt(areas()[2], 0); typeChars(areas()[2], '//s');
    let release;
    ctl.gate = new Promise((res) => { release = res; });
    $('btnSave').click();
    await waitFor(() => ctl.asked.length > 0, 3000);
    await sleep(50);
    $('btnSave').click();
    const during = fileMsgText();
    const writesDuring = ctl.writes.length;
    release();
    await waitFor(() => /上書き保存しました/.test(fileMsgText()), 5000);
    await sleep(100);
    check(during === SAVING && writesDuring === 0 && ctl.writes.length === 1 && ctl.writes[0].path === 'lib.sysml' && fileMsgText() === '1 ファイルを上書き保存しました' && !alerts.length, 'GR22 A4: 上書き保存の途中(書き込みを待たせた偽のハンドル)に「保存」を押すと、書き込みは 1 回だけで、「保存の途中です」の理由を保存の知らせの場所に出す', JSON.stringify({ during, writesDuring, writes: ctl.writes.map((x) => x.path), msg: fileMsgText() }));
    // zip の保存: 保存の処理の中(ダウンロードの準備)で「保存」を押したことにする
    await loadBy('input', 'a4z', DEMO);
    pick(2); caretAt(areas()[2], 0); typeChars(areas()[2], '//z');
    const saved = [];
    let inner = null;
    globalThis.URL.createObjectURL = (b) => { saved.push(b); if (inner === null) { $('btnSave').click(); inner = fileMsgText(); } return 'blob:x'; };
    $('btnSave').click();
    // GR24 P3 の裁定で足した: .sysml でないファイル(notes.txt)の中身を読んでから zip を作るので、2 回目の「保存」(zip を作る処理の中で
    // 押したもの)の後に、zip を作り終えるのを待つ(期待値は変えない)
    await waitFor(() => inner !== null && saved.length > 0, 5000); await sleep(100);
    check(saved.length === 1 && inner === SAVING && /a4z\.zip に保存しました/.test(fileMsgText()), 'GR22 A4: zip の保存の途中に「保存」を押すと、zip は 1 回だけ作り、「保存の途中です」の理由を保存の知らせの場所に出す', JSON.stringify({ n: saved.length, inner, msg: fileMsgText() }));
  }
  // ---- B1: 2 つのファイルに同じ名前のパッケージがあるフォルダで、「範囲」の欄の表示が相対パスで見分けられる
  {
    const F = { 'a.sysml': 'package P { part def A; }\npackage R { part def C; }\npackage Q { }\npackage Q { part def Q2; }\n', 'b/b.sysml': 'package P { part def B; }\n' };
    const r = await loadBy('picker', 'b1', F);
    await chooseScope('package R', 'general');
    const opts = $('scope').options.map((o) => [o.value, o.textContent]);
    const want = [['package:P', 'package P(a.sysml)'], ['package:R', 'package R'], ['package:Q', 'package Q(a.sysml 3)'], ['package:Q#2', 'package Q(a.sysml 4)'], ['package:P#2', 'package P(b/b.sysml)']];
    check(!!r && JSON.stringify(opts) === JSON.stringify(want), 'GR22 B1: フォルダで、表示が同じ候補に「(相対パス)」(相対パスでも同じなら「(相対パス 行)」)を付け、ほかの候補の表示と、候補の並び・id は変えない', JSON.stringify(opts));
    const g = await chooseScope('package P(b/b.sysml)', 'general');
    check(!!g && g.m.candidate?.id === 'package:P#2' && (g.m.structure?.nodes ?? []).some((n) => n.info?.name === 'B'), 'GR22 B1: 付けた表示の候補を選ぶと、その候補(b/b.sysml の P)を描く', JSON.stringify(g?.m.candidate));
    const r1 = await openBy('open', 'b1.sysml', 'package P { part def A; }\npackage P2 { }\npackage P { part def B; }\n');
    const so = $('scope').options.map((o) => [o.value, o.textContent]);
    check(!!r1 && JSON.stringify(so) === JSON.stringify([['package:P', 'package P'], ['package:P2', 'package P2'], ['package:P#2', 'package P']]), 'GR22 B1: 1 ファイルの扱いの「範囲」の欄の表示は変えない', JSON.stringify(so));
  }
  // ---- B2: 2 つ以上を一度にドロップすると、何も読まずに理由を出し、今のテキストを保つ
  {
    const r0 = await openBy('open', 'b2.sysml', 'part def Keep;\n');
    const fileItem = () => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false, isFile: true }) });
    const dirItem = (n) => ({ kind: 'file', webkitGetAsEntry: () => fakeEntry(n, DEMO) });
    const f1 = fileOf('x.sysml', 'part def X;\n'), f2 = fileOf('y.sysml', 'part def Y;\n');
    const cases = [['2 つのファイル', [fileItem(), fileItem()], [f1, f2]], ['ファイルとフォルダ', [dirItem('d1'), fileItem()], [{ name: 'd1' }, f1]], ['2 つのフォルダ', [dirItem('d1'), dirItem('d2')], [{ name: 'd1' }, { name: 'd2' }]]];
    const got = [];
    for (const [what, items, files] of cases) {
      const na = alerts.length, n0 = results.length;
      for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { items, files } });
      await sleep(300);
      const al = alerts.slice(na);
      got.push(al.length === 1 && al[0] === '一度にドロップできるのは、1 つのファイルか、フォルダ 1 つだけです。2 個をドロップしたので、どれも読み込みませんでした(複数のファイルは、フォルダにまとめて「フォルダを開く」かドロップで読み込めます)' && $('src').value === 'part def Keep;\n' && $('fileBar').hidden && results.slice(n0).every((x) => x.text === 'part def Keep;\n') ? 'ok' : `${what}: ${JSON.stringify(al)} ${$('src').value.slice(0, 20)} ${results.slice(n0).map((x) => x.text.slice(0, 20)).join(',')}`);
      alerts.splice(na);
    }
    check(!!r0 && got.every((x) => x === 'ok'), 'GR22 B2: 2 つのファイル・ファイルとフォルダ・2 つのフォルダを一度にドロップすると、どれも読み込まずに理由を出し、今のテキストを保つ', JSON.stringify(got));
    // 1 つのときは今までどおり(ファイルなら「開く」と同じ、フォルダならフォルダとして読む)
    const n0 = results.length;
    for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { items: [fileItem()], files: [f1] } });
    const one = await waitFor(() => $('src').value === 'part def X;\n' && results.slice(n0).some((x) => x.text === 'part def X;\n'), 5000);
    const n1 = results.length;
    for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { items: [dirItem('d3')], files: [{ name: 'd3' }] } });
    const dir = await waitFor(() => !$('fileBar').hidden && fsel().options.length === 4 && results.slice(n1).some((x) => x.text === curFolderKey()), 30000);
    check(!!one && !!dir, 'GR22 B2: 1 つのファイル・1 つのフォルダのドロップは、今までどおり読み込む', JSON.stringify({ one: !!one, dir: !!dir }));
  }
  // ---- B3: 診断が 0 件なら「修正依頼をコピー」を押せない。構文エラーだけ・警告だけ・未検査だけのときは押せて、依頼文は今までと同じ
  {
    const { toPrompt } = await import('../../src/app/diag.js');
    const btn = () => $('msg').querySelectorAll('button').find((x) => x.textContent === '修正依頼をコピー');
    await loadBy('picker', 'b3', { 'a.sysml': 'package A { part def X; }\n', 'b.sysml': 'package B { part def Y; }\n' });
    const fb = btn();
    check(!!fb && fb.disabled && fb.title.startsWith('診断がありません') && /未検査 0 件/.test($('msg').textContent), 'GR22 B3: フォルダで診断が 0 件のとき、「修正依頼をコピー」を押せない(理由を title に書く)', `${fb?.disabled} ${fb?.title} / ${$('msg').textContent.slice(0, 120)}`);
    await openBy('open', 'b3.sysml', 'part def Z;\n');
    const r0 = await typeText('package A { part def X; }\n');
    const b0 = btn();
    check(!!r0 && !!b0 && b0.disabled && b0.title.startsWith('診断がありません'), 'GR22 B3: 1 ファイルの扱いで診断が 0 件のとき、「修正依頼をコピー」を押せない', `${b0?.disabled} ${b0?.title} / ${$('msg').textContent.slice(0, 120)}`);
    const heads = [];
    for (const [what, t, head] of [['構文エラーだけ', 'part def A\n', '下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。'], ['警告だけ', 'action def A;\npart p : A;\n', '下の診断の警告を確かめてください。'], ['未検査だけ', 'part p : Missing;\n', '下の診断の内容を直したテキストを書いてください。']]) {
      const r = await typeText(t);
      const b = btn();
      const n = copied.length;
      b?.click();
      const c = await waitFor(() => copied.length > n && copied.at(-1), 3000);
      heads.push(!!r && !!b && !b.disabled && c === toPrompt(r.m.diagnostics, t) && c.split('\n')[0].startsWith(`次の SysML v2 のテキスト表記(SysML 2.0 正式版)について、${head}`) ? 'ok' : `${what}: ${b?.disabled} ${(c || '').split('\n')[0]}`);
    }
    check(heads.every((x) => x === 'ok'), 'GR22 B3: 構文エラーだけ・警告だけ・未検査だけのときは押せて、依頼文は診断の組み立て(toPrompt)のまま', JSON.stringify(heads));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR22: 画面の処理を通して、応答の処理の例外と(確かめたもののほかの)警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR22 の P4 の検査(--gr22p4。GR22 指示書 v22.2 の 4 章の B3b・D1)
// --first new|sample|open は、ページを開いた直後に行う最初の操作(既定は new)。--only-first なら、その 1 行だけを出して終わる
// (ページを開いた直後からの 3 つの操作を、それぞれ別のプロセスで確かめるため。tests/view/app.mjs の検査 20)
const GR22P4 = process.argv.includes('--gr22p4');
const P4_FIRST = (() => { const i = process.argv.indexOf('--first'); return i >= 0 ? process.argv[i + 1] : 'new'; })();
const P4_ONLY_FIRST = process.argv.includes('--only-first');
const P4_SKELETON = "package '新しいシステム' {\n}\n";
// 1 ファイルの扱いで、ビューと範囲を選び、その解析の結果を待つ
async function chooseScopeSingle(word, view) {
  if (view && $('viewKind').value !== view) { const n0 = results.length; $('viewKind').value = view; $('viewKind').dispatchEvent({ type: 'change' }); await waitFor(() => results.slice(n0).some((x) => x.text === $('src').value)); }
  const o = $('scope').options.find((x) => x.textContent.includes(word));
  if (!o) return null;
  const n0 = results.length;
  $('scope').value = o.value;
  $('scope').dispatchEvent({ type: 'change' });
  return waitFor(() => results.slice(n0).findLast((x) => x.text === $('src').value));
}
// 1 ファイルの扱いの「新規」に戻す(書き換えていれば、確認で「OK」と答える)
async function resetSingle() { confirmAnswer = true; const n0 = results.length; $('btnNew').click(); return resultFor(P4_SKELETON, n0); }
// 置き換える操作を、書き換えていない前提で行う(確認が出れば「やめる」で答える)。→ 確認の数と、置き換わったか
async function p4Replace(action) {
  const k = confirms.length;
  confirmAnswer = false;
  let ok = false;
  if (action === 'new') {
    const n0 = results.length;
    $('btnNew').click();
    ok = confirms.length === k && !!(await resultFor(P4_SKELETON, n0)) && $('src').value === P4_SKELETON;
  } else if (action === 'sample') {
    const p = await pickSample('入門');
    ok = confirms.length === k && !p.error && !!p.r && $('src').value === SAMPLE_INTRO_TEXT;
  } else {
    const t = `part def Opened${confirms.length}_${results.length};\n`;
    ok = confirms.length === k && !!(await openBy('open', 'p4.sysml', t)) && $('src').value === t;
  }
  confirmAnswer = true;
  return { asked: confirms.length - k, ok };
}
// 書き換えた後に、置き換える 5 つの操作(「新規」「例を読み込む」「開く」・ドロップ・「フォルダを開く」)を行い、確認で「やめる」と答える。
// → 操作ごとに、確認が 1 回出て、今のテキストのまま(フォルダを開いていない)なら 'ok'
async function p4Cancelled() {
  const got = {};
  const keep = $('src').value;
  confirmAnswer = false;
  const after = (k) => (confirms.length === k + 1 && $('src').value === keep && $('fileBar').hidden ? 'ok' : `確認 ${confirms.length - k} 回、${JSON.stringify($('src').value.slice(0, 60))}`);
  let k = confirms.length; $('btnNew').click(); got.new = after(k);
  k = confirms.length;
  $('btnSample').click();
  const b = await waitFor(() => $('dlgSample').querySelectorAll('button').find((x) => x.textContent.includes('入門')), 3000);
  b?.click(); got.sample = b ? after(k) : 'ダイアログがない';
  k = confirms.length; $('fileOpen').dispatchEvent({ type: 'change', target: { files: [fileOf('x.sysml', 'part def X;\n')], value: 'x' } }); got.open = after(k);
  k = confirms.length; for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { files: [fileOf('y.sysml', 'part def Y;\n')] } }); got.drop = after(k);
  k = confirms.length;
  window.showDirectoryPicker = async () => fakeHandle('p4', { 'a.sysml': 'part def A;\n' });
  $('btnFolder').click();
  await waitFor(() => confirms.length > k, 5000);
  await sleep(50);
  got.folder = after(k);
  confirmAnswer = true;
  return got;
}
async function gr22p4() {
  // ---- D1: ページを開いた直後(書き換えていない)から、最初の操作で確認が出ない
  {
    const r = await p4Replace(P4_FIRST);
    check(r.ok && r.asked === 0, `GR22 D1: ページを開いた直後から、書き換えずに「${{ new: '新規', sample: '例を読み込む', open: '開く' }[P4_FIRST]}」を行うと、確認を出さずに置き換える`, JSON.stringify(r));
    if (P4_ONLY_FIRST) return;
  }
  // ---- D1: 「開く」・保存・「新規」・「例を読み込む」の直後から、書き換えずに「新規」「例を読み込む」「開く」を行うと、確認が出ない
  // (どの状態もテキストは空でない。直す前は「新規」「例を読み込む」で確認が出た)
  globalThis.URL.createObjectURL ??= () => 'blob:x';
  globalThis.URL.revokeObjectURL ??= () => {};
  const starts = {
    open: async () => !!(await openBy('open', 's.sysml', 'part def S;\n')),
    save: async () => { const r = await typeText('part def V;\n'); $('btnSave').click(); return !!r; },
    new: async () => (await p4Replace('new')).ok,
    sample: async () => (await p4Replace('sample')).ok,
  };
  const names = { open: '「開く」', save: '保存', new: '「新規」', sample: '「例を読み込む」' };
  for (const [s, setup] of Object.entries(starts)) {
    const got = {};
    for (const a of ['new', 'sample', 'open']) {
      const ready = await setup();
      const nonEmpty = $('src').value.trim() !== '';
      const r = await p4Replace(a);
      got[a] = ready && nonEmpty && r.ok && r.asked === 0 ? 'ok' : JSON.stringify({ ready, nonEmpty, ...r });
    }
    check(Object.values(got).every((x) => x === 'ok'), `GR22 D1: 1 ファイルで${names[s]}の直後から、書き換えずに「新規」「例を読み込む」「開く」を行うと、確認を出さずに置き換える`, JSON.stringify(got));
  }
  // ---- D1: 手で打つ・貼り付け・図からの編集・view の書き足しの後は、どの操作でも確認が出て、やめると今のテキストが保たれる
  const D1_TEXT = 'package P {\n    part def A;\n    part a : A;\n}\n';
  {
    await openBy('open', 'd1.sysml', D1_TEXT);
    const a = $('src');
    const n0 = results.length;
    a.value = D1_TEXT + 'part def T;\n'; a.dispatchEvent({ type: 'input', inputType: 'insertText' });
    const r = await resultFor(a.value, n0);
    const got = await p4Cancelled();
    check(!!r && Object.values(got).every((x) => x === 'ok'), 'GR22 D1: 1 ファイルで手で打った後は、「新規」「例を読み込む」「開く」・ドロップ・「フォルダを開く」で確認を出し、やめると今のテキストのまま', JSON.stringify(got));
  }
  {
    await openBy('open', 'd1.sysml', D1_TEXT);
    const a = $('src');
    const n0 = results.length;
    a.value = D1_TEXT + 'part def Pasted;\n'; a.dispatchEvent({ type: 'input', inputType: 'insertFromPaste' });
    const r = await resultFor(a.value, n0);
    const got = await p4Cancelled();
    check(!!r && Object.values(got).every((x) => x === 'ok'), 'GR22 D1: 1 ファイルで貼り付けた後は、どの操作でも確認を出し、やめると今のテキストのまま', JSON.stringify(got));
  }
  {
    const o = await openBy('open', 'd1.sysml', D1_TEXT);
    const g = o ? await chooseScopeSingle('package P', 'general') : null;
    const ren = g ? await renameByClick(g, 'A', 'PartDefinition', 'A2') : { error: '一般ビューで P を描けない' };
    const got = ren.error ? {} : await p4Cancelled();
    check(!ren.error && $('src').value.includes('part a : A2;') && Object.values(got).length === 5 && Object.values(got).every((x) => x === 'ok'), 'GR22 D1: 1 ファイルで図からの編集(名前の変更)の後は、どの操作でも確認を出し、やめると今のテキストのまま', ren.error ?? JSON.stringify(got));
  }
  {
    const o = await openBy('open', 'd1.sysml', D1_TEXT);
    const g = o ? await chooseScopeSingle('package P', 'general') : null;
    let appended = false;
    if (g && !$('btnAppendView').disabled) {
      const n0 = results.length;
      $('btnAppendView').click();
      appended = await waitFor(() => $('src').value.includes("view 'Pの一般ビュー'") && results.slice(n0).some((x) => x.text === $('src').value), 30000);
    }
    const got = appended ? await p4Cancelled() : {};
    check(!!appended && Object.values(got).length === 5 && Object.values(got).every((x) => x === 'ok'), 'GR22 D1: 1 ファイルで view を書き足した後は、どの操作でも確認を出し、やめると今のテキストのまま', appended ? JSON.stringify(got) : `書き足せない: ${$('src').value.slice(-120)}`);
  }
  // ---- D1: フォルダのときの確認は今までどおり(書き換えたファイルがなければ出さず、あれば出す)
  {
    const files = { 'a.sysml': 'part def A;\n', 'b.sysml': 'part def B;\n' };
    const got = {};
    confirmAnswer = true; // 前の段で書き換えたテキストを、確認で「OK」と答えてフォルダで置き換える
    await loadBy('picker', 'p4f', files);
    confirmAnswer = false;
    let k = confirms.length;
    const n0 = results.length;
    $('btnNew').click();
    got.clean = confirms.length === k && !!(await resultFor(P4_SKELETON, n0)) && $('fileBar').hidden ? 'ok' : `確認 ${confirms.length - k} 回`;
    await loadBy('picker', 'p4f', files);
    typeIn(shownArea(), 'x');
    const keep = shownArea().value;
    const msgs = [];
    for (const a of ['new', 'sample', 'open', 'drop']) {
      k = confirms.length;
      if (a === 'new') $('btnNew').click();
      else if (a === 'sample') { $('btnSample').click(); (await waitFor(() => $('dlgSample').querySelectorAll('button').find((x) => x.textContent.includes('入門')), 3000))?.click(); }
      else if (a === 'open') $('fileOpen').dispatchEvent({ type: 'change', target: { files: [fileOf('x.sysml', 'part def X;\n')], value: 'x' } });
      else for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { files: [fileOf('y.sysml', 'part def Y;\n')] } });
      msgs.push(confirms.length === k + 1 && /フォルダ「p4f」/.test(confirms.at(-1)) && !$('fileBar').hidden && shownArea()?.value === keep ? 'ok' : `${a}: 確認 ${confirms.length - k} 回`);
    }
    got.dirty = msgs.every((x) => x === 'ok') ? 'ok' : msgs.join(' / ');
    confirmAnswer = true;
    check(Object.values(got).every((x) => x === 'ok'), 'GR22 D1: フォルダのときは今までどおり、書き換えたファイルがなければ確認を出さず、あれば「新規」「例を読み込む」「開く」・ドロップで確認を出す(やめるとフォルダのまま)', JSON.stringify(got));
  }
  // ---- B3b: 修正依頼の文に入る診断の段がないときは押せない(info の図の診断だけのとき)。ほかは押せて、依頼文は toPrompt のまま
  {
    const { toPrompt, promptSections } = await import('../../src/app/diag.js');
    const btn = () => $('msg').querySelectorAll('button').find((x) => x.textContent === '修正依頼をコピー');
    await resetSingle();
    const r0 = await typeText('');
    const b0 = btn();
    const info = r0?.m.diagnostics.view ?? [];
    check(!!r0 && !!b0 && b0.disabled && b0.title.startsWith('診断がありません') && info.length > 0 && info.every((v) => v.level === 'info') && /図の診断 \d+ 件/.test($('msg').textContent),
      'GR22 B3b: 空のテキスト(info の図の診断だけ)では、診断欄に図の診断の段が出ても、「修正依頼をコピー」を押せない', `${b0?.disabled} ${b0?.title} / ${JSON.stringify(info)} / ${$('msg').textContent.slice(0, 120)}`);
    const fr = await loadBy('picker', 'b3b', { 'a.sysml': '// 注だけ\n', 'b.sysml': '' });
    const fv = fr?.m.diagnostics.view ?? [];
    const fb = btn();
    check(!!fr && !!fb && fb.disabled && fv.length > 0 && fv.every((v) => v.level === 'info'), 'GR22 B3b: フォルダで info の図の診断だけのときも、「修正依頼をコピー」を押せない', `${fb?.disabled} / ${JSON.stringify(fv)}`);
    await resetSingle();
    const UHEAD = '下の診断の内容を直したテキストを書いてください。';
    const cases = [
      ['構文エラーだけ', 'part def A\n', ['syntax'], '下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。'],
      ['意味エラーだけ', 'package P {\n    part b : P::Missing;\n}\n', ['semantic'], '下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。'],
      ['警告だけ', 'action def A;\npart p : A;\n', ['warning'], '下の診断の警告を確かめてください。'],
      ['未検査だけ', 'part p : Missing;\n', ['unchecked'], UHEAD],
      ['曖昧だけ', 'package Xa { part def N; }\npackage Xb { part def N; }\npackage U {\n    private import Xa::*;\n    private import Xb::*;\n    part a : N;\n}\n', ['ambiguous'], UHEAD],
      // warn の水準の図の診断は、反映していない render・filter と、解決できない expose(設計書 9.2 節)。ここでは render を使う
      ['warn の図の診断だけ', 'package P {\n    part def A;\n    rendering r;\n    view v { expose A::**; render r; }\n}\n', ['view'], UHEAD],
    ];
    const heads = [];
    for (const [what, t, keys, head] of cases) {
      let r = await typeText(t);
      if (keys[0] === 'view') r = await chooseScopeSingle('view P::v', 'general');
      const d = r?.m.diagnostics;
      const b = btn();
      const n = copied.length;
      b?.click();
      const c = await waitFor(() => copied.length > n && copied.at(-1), 3000);
      const got = d ? promptSections(d).keys : null;
      heads.push(!!r && JSON.stringify(got) === JSON.stringify(keys) && !!b && !b.disabled && c === toPrompt(d, t) && c.split('\n')[0].startsWith(`次の SysML v2 のテキスト表記(SysML 2.0 正式版)について、${head}`) ? 'ok' : `${what}: ${JSON.stringify(got)} ${b?.disabled} ${(c || '').split('\n')[0]}`);
    }
    check(heads.every((x) => x === 'ok'), 'GR22 B3b: 構文エラーだけ・意味エラーだけ・警告だけ・未検査だけ・曖昧だけ・warn の図の診断だけのときは押せて、依頼文は診断の組み立て(toPrompt)のまま', JSON.stringify(heads));
    const z = await typeText('package A { part def X; }\n');
    const bz = btn();
    check(!!z && !!bz && bz.disabled && bz.title.startsWith('診断がありません'), 'GR22 B3b: 診断 0 件では、今までどおり押せない', `${bz?.disabled} ${bz?.title}`);
  }
  check(errors.length === 0 && alerts.length === 0, 'GR22 P4: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR24 の検査(--gr24。GR24 指示書 4 章の T・F・M・Z・モデル): フォルダの木とファイルの操作
const GR24 = process.argv.includes('--gr24');
const { comparePaths: cmpPaths } = await import('../../src/app/io.js');
// フォルダの木の行(画面が作ったもの)。→ [{ path, kind, cls, depth, name }]
const treeRows = () => $('treeBody').children.filter((c) => c._cls.has('trow')).map((r) => ({ path: r.dataset.path, kind: r.dataset.kind, cls: [...r._cls], depth: Math.round((parseFloat(r.style.paddingLeft) - 4) / 12), name: r.children.find((x) => x._cls.has('nm'))?.textContent ?? '', el: r }));
const rowOf = (p) => treeRows().find((r) => r.path === p) ?? null;
// 木の項目のクリック(偽の DOM は出来事を親に伝えないので、木の本体に、項目を target にして起こす)
function clickRow(p) { const r = rowOf(p); if (!r) return false; $('treeBody').dispatchEvent({ type: 'click', target: r.el, preventDefault() {}, stopPropagation() {} }); return true; }
// 閉じたフォルダをすべて開く
function expandAll() { for (let i = 0; i < 200; i++) { const r = treeRows().find((x) => x.kind === 'dir' && !x.cls.includes('open')); if (!r) return; clickRow(r.path); } }
const curRow = () => treeRows().find((r) => r.cls.includes('cur'))?.path ?? null;
const pathBar = () => $('filePath').textContent;
// 木の、モデルに入るファイル(薄く出していないファイル)の相対パスを、解析の並び(符号位置の順)で
const modelPaths = () => { expandAll(); return treeRows().filter((r) => r.kind === 'file' && !r.cls.includes('dim')).map((r) => r.path).sort(cmpPaths); };
// 偽のフォルダ(書き込みを記録するハンドル)。init は 相対パス → 中身(文字か Uint8Array。/ で終わる相対パスは空のフォルダ)
function fakeFs(name, init, ctl = {}) {
  Object.assign(ctl, { files: new Map(), dirs: new Set(), log: [], reads: [], clock: 1000, perm: ctl.perm ?? 'granted', grant: ctl.grant ?? true, asked: [], failWrite: ctl.failWrite ?? [], failRemove: ctl.failRemove ?? [], failMkdir: ctl.failMkdir ?? [], hasMove: ctl.hasMove ?? false, ci: ctl.ci ?? false, ...ctl });
  const B = (x) => (typeof x === 'string' ? enc(x) : x);
  const pOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const bOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  const J = (d, n) => (d ? `${d}/${n}` : n);
  for (const [p, v] of Object.entries(init)) {
    if (p.endsWith('/')) { const d = p.slice(0, -1); for (let x = d; x; x = pOf(x)) ctl.dirs.add(x); continue; }
    for (let x = pOf(p); x; x = pOf(x)) ctl.dirs.add(x);
    ctl.files.set(p, { bytes: B(v), lastModified: 500 });
  }
  // 大文字・小文字を区別しないディスクの真似(ctl.ci)
  const findFile = (p) => (ctl.files.has(p) ? p : ctl.ci ? [...ctl.files.keys()].find((k) => k.toLowerCase() === p.toLowerCase()) ?? null : null);
  const findDir = (p) => (p === '' || ctl.dirs.has(p) ? p : ctl.ci ? [...ctl.dirs].find((k) => k.toLowerCase() === p.toLowerCase()) ?? null : null);
  const err = (n, m) => Object.assign(new Error(m), { name: n });
  const fileH = (p0) => {
    const h = { kind: 'file', _p: p0, get name() { return bOf(h._p); },
      getFile: async () => { if (ctl.readGate) await ctl.readGate; const f = ctl.files.get(h._p); if (!f) throw err('NotFoundError', `ファイル ${h._p} がない(偽物)`); ctl.reads.push(h._p); const b = f.bytes.slice(); return { lastModified: f.lastModified, size: b.length, arrayBuffer: async () => b.buffer } },
      createWritable: async () => { const parts = []; return {
        write: async (x) => { if (ctl.gate) await ctl.gate; if (ctl.failWrite.includes(h._p) || ctl.failData?.includes(h._p)) throw err('NotAllowedError', `書き込みに失敗(偽物): ${h._p}`); parts.push(B(x)); },
        close: async () => { const n = parts.reduce((s, x) => s + x.length, 0), b = new Uint8Array(n); let o = 0; for (const x of parts) { b.set(x, o); o += x.length; } ctl.files.set(h._p, { bytes: b, lastModified: ++ctl.clock }); ctl.log.push(`write:${h._p}`); },
        abort: async () => {} }; } };
    if (ctl.hasMove) h.move = async (a, b) => {
      const [d, n] = typeof a === 'string' ? [pOf(h._p), a] : [a._p, b];
      const dst = J(d, n);
      if (ctl.failMove?.includes(h._p)) throw err('NotAllowedError', `移動に失敗(偽物): ${h._p}`);
      const f = ctl.files.get(h._p);
      ctl.files.delete(h._p);
      ctl.files.set(dst, { bytes: f.bytes, lastModified: ++ctl.clock }); // move() で名前を変えると最終更新の時刻が変わる、という報告に合わせる
      ctl.log.push(`move:${h._p}>${dst}`);
      h._p = dst;
    };
    return h;
  };
  const dirH = (p) => ({ kind: 'directory', _p: p, name: p ? bOf(p) : name,
    async *values() {
      if (ctl.failList) throw err('NotAllowedError', `フォルダ ${p} を読めない(偽物)`);
      for (const d of [...ctl.dirs]) if (pOf(d) === p) yield dirH(d);
      for (const f of [...ctl.files.keys()]) if (pOf(f) === p) yield fileH(f);
    },
    getDirectoryHandle: async (n, o) => {
      const q = J(p, n), d = findDir(q);
      if (d != null && d !== '') return dirH(d);
      if (findFile(q)) throw err('TypeMismatchError', `${q} はファイル(偽物)`);
      if (!o?.create) throw err('NotFoundError', `フォルダ ${q} がない(偽物)`);
      if (ctl.failMkdir.includes(q)) throw err('NotAllowedError', `フォルダを作れない(偽物): ${q}`);
      ctl.dirs.add(q); ctl.log.push(`mkdir:${q}`);
      return dirH(q);
    },
    getFileHandle: async (n, o) => {
      const q = J(p, n), f = findFile(q);
      if (f) return fileH(f);
      if (findDir(q)) throw err('TypeMismatchError', `${q} はフォルダ(偽物)`);
      if (!o?.create) throw err('NotFoundError', `ファイル ${q} がない(偽物)`);
      if (ctl.failWrite.includes(q)) throw err('NotAllowedError', `ファイルを作れない(偽物): ${q}`);
      ctl.files.set(q, { bytes: new Uint8Array(0), lastModified: ++ctl.clock }); ctl.log.push(`create:${q}`);
      return fileH(q);
    },
    removeEntry: async (n, o) => {
      const q = J(p, n);
      const f = findFile(q), d = findDir(q);
      if (ctl.failRemove.includes(q)) throw err('NotAllowedError', `消せない(偽物): ${q}`);
      if (f) { ctl.files.delete(f); ctl.log.push(`rm:${f}`); return; }
      if (d == null) throw err('NotFoundError', `${q} がない(偽物)`);
      const inside = (x) => x.startsWith(`${d}/`);
      if (!o?.recursive && ([...ctl.files.keys()].some(inside) || [...ctl.dirs].some(inside))) throw err('InvalidModificationError', `${q} は空でない(偽物)`);
      for (const k of [...ctl.files.keys()]) if (inside(k)) ctl.files.delete(k);
      for (const k of [...ctl.dirs]) if (inside(k)) ctl.dirs.delete(k);
      ctl.dirs.delete(d); ctl.log.push(`rmdir:${d}`);
    },
    queryPermission: async () => { ctl.asked.push('query'); return ctl.perm; },
    requestPermission: async (o) => { ctl.asked.push(`request:${o?.mode}`); if (ctl.grant) ctl.perm = 'granted'; return ctl.perm; },
  });
  return dirH('');
}
const diskText = (ctl, p) => (ctl.files.has(p) ? new TextDecoder().decode(ctl.files.get(p).bytes) : null);
// 今の木のフォルダの解析の要求の文字列(モデルに入るファイルの相対パスと、そのテキスト欄の中身)
const treeKey = () => { const ps = modelPaths(); return folderKey(ps.map((p) => ({ path: p, text: areaOf(p)?.value ?? '' }))); };
// 相対パスのファイルのテキスト欄(画面の folder を見ずに、木の並びとテキスト欄の作られた順から求められないので、テキスト欄に付けた印を使う)
const areaOf = (p) => areas().find((a) => a.dataset.path === p) ?? null;
async function openFs(name, init, ctl = {}) {
  const n0 = results.length;
  window.showDirectoryPicker = async () => fakeFs(name, init, ctl);
  $('btnFolder').click();
  const ok = await waitFor(() => !$('tree').hidden && $('treeName').textContent === name && (results.slice(n0).some((x) => x.text === treeKey()) || modelPaths().length === 0), 30000);
  return ok ? { r: results.slice(n0).findLast((x) => x.text === treeKey()) ?? null, ctl } : null;
}
const T_FILES = {
  'b.sysml': 'package B { part def Y; }\n',
  'a.sysml': 'package A { part def X; part x : X; }\n',
  'sub/z.sysml': 'package Z { part def W; part w : W; }\n',
  'sub/deep/y.sysml': 'package Yp { part bad : A::Missing; }\n',
  'notes.txt': 'memo\n',
  'B.txt': 'upper\n',
  'img.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0x0d]),
  '.git/HEAD': 'ref: refs/heads/main\n',
  '.git/objects/x.sysml': 'package G;\n',
  'Zeta/q.md': '# q\n',
  'empty/': null,
};
const T_ORDER = ['Zeta', 'Zeta/q.md', 'empty', 'sub', 'sub/deep', 'sub/deep/y.sysml', 'sub/z.sysml', 'B.txt', 'a.sysml', 'b.sysml', 'img.png', 'notes.txt'];
async function gr24t() {
  // ---- T: 下のフォルダ・.sysml でないファイル・.git を含むフォルダ(選ぶ画面)
  const o = await openFs('tdemo', T_FILES);
  $('btnCollapse').click(); // 待つ処理(treeKey)が木を開くので、開いた直後の形に戻す
  const top = treeRows().map((r) => r.path);
  check(!!o && JSON.stringify(top) === JSON.stringify(['Zeta', 'empty', 'sub', 'B.txt', 'a.sysml', 'b.sysml', 'img.png', 'notes.txt']), 'GR24 T: 開いた直後の木の一番上の階層は、フォルダが先(Zeta・empty・sub)、次にファイル、どちらも名前の符号位置の順(B.txt が a.sysml より先)で、空のフォルダも出す', top.join(','));
  expandAll();
  const all = treeRows();
  check(JSON.stringify(all.map((r) => r.path)) === JSON.stringify(T_ORDER) && JSON.stringify(all.map((r) => r.depth)) === JSON.stringify([0, 1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0]), 'GR24 T: すべて開いた木の並びと字下げ(各階層でフォルダが先、名前の符号位置の順)', all.map((r) => `${r.path}:${r.depth}`).join(','));
  check(!all.some((r) => r.path.startsWith('.git')) && !o.ctl.reads.some((p) => p.startsWith('.git')), 'GR24 T: 名前が . で始まるフォルダ(.git)とその中は、木に出さず、読みもしない', `${all.map((r) => r.path).join(',')} / 読んだ ${o.ctl.reads.join(',')}`);
  check(JSON.stringify(o.ctl.reads.slice().sort()) === JSON.stringify(['a.sysml', 'b.sysml', 'sub/deep/y.sysml', 'sub/z.sysml']), 'GR24 T: 読み込みで中身を読むのは .sysml だけ(.sysml でないファイルは、名前と相対パスだけを持つ)', o.ctl.reads.join(','));
  const dims = all.filter((r) => r.cls.includes('dim')).map((r) => r.path);
  check(JSON.stringify(dims) === JSON.stringify(['Zeta/q.md', 'B.txt', 'img.png', 'notes.txt']), 'GR24 T: .sysml でないファイルは薄く出す(.sysml のファイルとフォルダは薄くしない)', dims.join(','));
  check(curRow() === 'a.sysml' && pathBar() === 'a.sysml' && shownArea()?.value === T_FILES['a.sysml'] && !$('fileBar').hidden, 'GR24 T: 今のファイル(解析の並びの最初の a.sysml)を木の中で強調し、テキスト欄の上の相対パスと一致させる', `${curRow()} / ${pathBar()}`);
  // .sysml でないファイルのクリックでは、今のファイルを変えない
  clickRow('notes.txt');
  check(curRow() === 'a.sysml' && pathBar() === 'a.sysml' && shownArea()?.value === T_FILES['a.sysml'] && rowOf('notes.txt')?.cls.includes('sel'), 'GR24 T: .sysml でないファイルをクリックしても開かず、今のファイルを変えない(選ぶだけ)', `${curRow()} / ${pathBar()} / ${rowOf('notes.txt')?.cls}`);
  // .sysml のファイルのクリックで、そのファイルをテキスト欄に出す
  clickRow('sub/z.sysml');
  check(curRow() === 'sub/z.sysml' && pathBar() === 'sub/z.sysml' && shownArea()?.value === T_FILES['sub/z.sysml'], 'GR24 T: .sysml のファイルをクリックすると、テキスト欄に出し、木の強調と相対パスが移る', `${curRow()} / ${pathBar()}`);
  // 書き換えの印: ファイルと、それを含むフォルダ(閉じても)
  {
    const a = shownArea(), n0 = results.length;
    caretAt(a, 0); typeChars(a, '/*t*/');
    await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000);
    const marks = treeRows().filter((r) => r.cls.includes('dirty')).map((r) => r.path);
    $('btnCollapse').click();
    const closed = treeRows().map((r) => [r.path, r.cls.includes('dirty')]);
    check(JSON.stringify(marks) === JSON.stringify(['sub', 'sub/z.sysml']) && $('fileDirty').textContent === '●' && JSON.stringify(closed) === JSON.stringify([['Zeta', false], ['empty', false], ['sub', true], ['B.txt', false], ['a.sysml', false], ['b.sysml', false], ['img.png', false], ['notes.txt', false]]),
      'GR24 T: 書き換えたまま保存していないファイルに印を付け、その印を持ち主のフォルダにも伝える(「すべて折りたたむ」で閉じたフォルダにも出る)', `${marks.join(',')} / ${JSON.stringify(closed)}`);
  }
  // 診断のクリックで、木の中でもそのファイルを強調し、見えるところまで木を開いて送る(閉じた sub/deep の中の y.sysml)
  {
    const li = $('msg').querySelectorAll('li').find((x) => x.textContent.includes('(S1)'));
    li?.click();
    const vis = treeRows().map((r) => r.path);
    check(!!li && li.textContent.startsWith('sub/deep/y.sysml ') && curRow() === 'sub/deep/y.sysml' && pathBar() === 'sub/deep/y.sysml' && vis.includes('sub/deep/y.sysml') && rowOf('sub')?.cls.includes('open') && rowOf('sub/deep')?.cls.includes('open'), 'GR24 T: 診断のクリックで別のファイルに移ると、木の中でもそのファイルを強調し、閉じたフォルダを開いて見せる', `${li?.textContent} / ${curRow()} / ${vis.join(',')}`);
  }
  // 図の要素のクリックでも同じ(一般ビューのパッケージ Z の W は sub/z.sysml)
  {
    $('btnCollapse').click();
    clickRow('a.sysml');
    if ($('viewKind').value !== 'general') { const n0 = results.length; $('viewKind').value = 'general'; $('viewKind').dispatchEvent({ type: 'change' }); await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000); }
    const opt = $('scope').options.find((x) => x.textContent === 'package Z');
    let r = null;
    if (opt) { const n0 = results.length; $('scope').value = opt.value; $('scope').dispatchEvent({ type: 'change' }); r = await waitFor(() => results.slice(n0).findLast((x) => x.text === treeKey()), 30000); }
    const ok = clickNode(r, 'W', 'PartDefinition');
    check(ok && curRow() === 'sub/z.sysml' && pathBar() === 'sub/z.sysml' && rowOf('sub')?.cls.includes('open'), 'GR24 T: 図の要素のクリックで別のファイルに移ると、木の中でもそのファイルを強調し、閉じたフォルダを開いて見せる', `${ok} / ${curRow()}`);
  }
  // .sysml が 1 つもないフォルダも開く(理由の窓を出さない)
  {
    const na = alerts.length;
    const o2 = await openFs('nosys', { 'readme.txt': 'x', 'docs/a.md': '# a', 'empty/': null, '.git/b.sysml': 'part def X;' });
    $('btnCollapse').click();
    const rows = treeRows().map((r) => r.path);
    const note = body.children.find((c) => c._cls.has('nosysml'));
    check(!!o2 && alerts.length === na && JSON.stringify(rows) === JSON.stringify(['docs', 'empty', 'readme.txt']) && note && !note.hidden && pathBar() === '' && /\.sysml のファイルがありません/.test($('canvas').textContent) && $('scope').options[0]?.textContent === '(.sysml のファイルがない)', 'GR24 T: .sysml が 1 つもないフォルダも開き(理由の窓を出さない)、木を出して、新しいファイルの作り方を案内する', `${rows.join(',')} / ${alerts.slice(na).join('/')} / ${$('canvas').textContent.slice(0, 80)}`);
  }
  // webkitdirectory の欄: File を持っておき、.sysml でないファイルの中身は読まない(空のフォルダは、この欄では分からない)
  {
    const n0 = results.length;
    readLog.length = 0;
    delete window.showDirectoryPicker;
    $('btnFolder').click();
    const list = Object.entries(T_FILES).filter(([p]) => !p.endsWith('/')).map(([p, v]) => ({ name: p.split('/').pop(), webkitRelativePath: `wk/${p}`, get bytes() { readLog.push(p); return typeof v === 'string' ? enc(v) : v; } }));
    $('dirOpen').dispatchEvent({ type: 'change', target: { files: list, value: 'x' } });
    await waitFor(() => $('treeName').textContent === 'wk' && results.slice(n0).some((x) => x.text === treeKey()), 30000);
    expandAll();
    const rows = treeRows().map((r) => r.path);
    check(JSON.stringify(rows) === JSON.stringify(T_ORDER.filter((p) => p !== 'empty')) && JSON.stringify([...new Set(readLog)].sort()) === JSON.stringify(['a.sysml', 'b.sysml', 'sub/deep/y.sysml', 'sub/z.sysml']), 'GR24 T: webkitdirectory の欄で開いたフォルダも、すべてのファイル(.git を除く)を木に出し、中身を読むのは .sysml だけ', `${rows.join(',')} / ${readLog.join(',')}`);
  }
  // ドロップ: File を持っておき、.sysml でないファイルの中身は読まない。空のフォルダも出す
  {
    const n0 = results.length;
    readLog.length = 0;
    const entry = (nm, prefix) => {
      const kids = [], seen = new Set();
      for (const [p, v] of Object.entries(T_FILES)) {
        if (prefix && !p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length), i = rest.indexOf('/');
        if (i < 0) kids.push({ isFile: true, isDirectory: false, name: rest, file: (cb) => cb({ arrayBuffer: async () => { readLog.push(p); const b = typeof v === 'string' ? enc(v) : v; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } }) });
        else { const d = rest.slice(0, i); if (!seen.has(d)) { seen.add(d); kids.push(entry(d, `${prefix}${d}/`)); } }
      }
      return { isDirectory: true, isFile: false, name: nm, createReader() { let done = false; return { readEntries(res) { if (done) res([]); else { done = true; res(kids.filter((k) => k.name !== '')); } } }; } };
    };
    for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { items: [{ kind: 'file', webkitGetAsEntry: () => entry('dr', '') }], files: [] } });
    await waitFor(() => $('treeName').textContent === 'dr' && results.slice(n0).some((x) => x.text === treeKey()), 30000);
    expandAll();
    const rows = treeRows().map((r) => r.path);
    check(JSON.stringify(rows) === JSON.stringify(T_ORDER) && JSON.stringify(readLog.slice().sort()) === JSON.stringify(['a.sysml', 'b.sysml', 'sub/deep/y.sysml', 'sub/z.sysml']), 'GR24 T: ドロップで開いたフォルダも、すべてのファイルと空のフォルダ(.git を除く)を木に出し、中身を読むのは .sysml だけ', `${rows.join(',')} / ${readLog.join(',')}`);
  }
  // 1 ファイルの扱いでは、フォルダの木を出さない
  {
    const r = await openBy('open', 'one.sysml', 'part def One;\n');
    // GR24 の P5 で置き換えた(予定の red の 3。P4 までの期待: $('tree').hidden && $('treeSplit').hidden。木の欄を出さない)
    check(!!r && !$('tree').hidden && !$('treeSplit').hidden && $('tree')._cls.has('nofolder') && $('treeEmpty') && !$('treeEmpty').hidden && $('treeName').textContent === '' && $('fileBar').hidden && !$('src').hidden, 'GR24 T(GR24 の P5 で置き換え): 「開く」で 1 ファイルの扱いに戻ると、フォルダの木の代わりに、フォルダを開いていないときの木の欄を出す', `${$('tree').hidden} ${[...$('tree')._cls]} ${$('fileBar').hidden}`);
  }
}

// 木に焦点があるときのキー(偽の DOM は出来事を親に伝えないので、木そのものに起こす)
function treeKeyDown(k, mods = {}) { let prevented = false; $('tree').dispatchEvent({ type: 'keydown', key: k, ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: !!mods.shift, altKey: false, target: $('tree'), preventDefault() { prevented = true; }, stopPropagation() {} }); return prevented; }
// 名前の入力欄(木の中)と、その下の理由
const nameInput = () => $('treeBody').querySelectorAll('input')[0] ?? null;
const nameWhy = () => $('treeBody').querySelectorAll('.twhy')[0]?.textContent ?? '';
// 名前の入力欄に書いて Enter を押す
function enterName(v, k = 'Enter') { const i = nameInput(); if (!i) return false; i.value = v; i.dispatchEvent({ type: 'keydown', key: k, preventDefault() {}, stopPropagation() {} }); return true; }
// 操作が終わる(木の知らせが変わる)のを待ち、その後の解析の結果を待つ
async function opDone(n0, ms = 30000) { await waitFor(() => !$('treeBody').querySelectorAll('input').length && (modelPaths().length === 0 || results.slice(n0).some((x) => x.text === treeKey())), ms); await sleep(30); return results.slice(n0).findLast((x) => x.text === treeKey()) ?? null; }
const rowsNow = () => { expandAll(); return treeRows().map((r) => r.path); };
const diskList = (ctl) => [...[...ctl.dirs].map((d) => `${d}/`), ...ctl.files.keys()].sort(cmpPaths);
const F_FILES = {
  'a.sysml': 'package A { part def X; }\n',
  'b.sysml': 'package B { private import A::*; part y : X; part bad : A::Missing; }\n',
  'sub/c.sysml': 'package C { part def Q; }\n',
  'sub/note.txt': 'n\n',
  'keep.txt': 'k\n',
};
async function gr24f() {
  // ---- ハンドルあり(書き込みを記録する偽のフォルダ。move() を持たない)
  const o = await openFs('fdemo', F_FILES, { hasMove: false });
  const ctl = o.ctl;
  // 新しいファイル(sub の中に .sysml): その場でディスクに入り、木とモデルに入り、テキスト欄に出す
  {
    clickRow('sub');
    $('btnNewFile').click();
    const shownInput = !!nameInput();
    const n0 = results.length, l0 = ctl.log.length;
    enterName('n.sysml');
    const r = await opDone(n0);
    check(shownInput && diskText(ctl, 'sub/n.sysml') === '' && ctl.log.slice(l0).includes('create:sub/n.sysml') && rowsNow().includes('sub/n.sysml') && pathBar() === 'sub/n.sysml' && curRow() === 'sub/n.sysml' && !!r && r.m.folder?.files.map((f) => f.path).includes('sub/n.sysml'),
      'GR24 F: 「新しいファイル」で、木の中に名前の入力欄を出し、Enter で決めると、選んだフォルダ(sub)の中に空のファイルをその場でディスクに作り、木とモデルに入れてテキスト欄に出す', `${shownInput} / ${ctl.log.slice(l0).join(',')} / ${rowsNow().join(',')} / ${pathBar()} / ${r?.m.folder?.files.map((f) => f.path)}`);
  }
  // 新しいファイル(根に .sysml でないもの)は、モデルに入らず、薄く出し、今のファイルを変えない。拡張子は付け足さない
  {
    clickRow('keep.txt');
    $('btnNewFile').click();
    const n0 = results.length;
    enterName('memo');
    await opDone(n0);
    check(diskText(ctl, 'memo') === '' && rowOf('memo')?.cls.includes('dim') && pathBar() === 'sub/n.sysml', 'GR24 F: .sysml でない名前の新しいファイル(拡張子なしの memo)は、拡張子を付け足さずに作り、薄く出し、テキスト欄は今のファイルのまま', `${diskList(ctl).join(',')} / ${rowOf('memo')?.cls}`);
  }
  // 新しいフォルダ(右クリックのメニューから。根)
  {
    $('treeBody').dispatchEvent({ type: 'contextmenu', target: $('treeBody'), clientX: 10, clientY: 10, preventDefault() {} });
    const menu = registry.get('treeMenu') ?? body.children.find((c) => c.id === 'treeMenu');
    const labels = menu ? menu.children.map((b) => b.textContent) : [];
    menu?.children.find((b) => b.textContent === '新しいフォルダ')?.click();
    const n0 = results.length;
    enterName('nd');
    await opDone(n0);
    check(labels.includes('新しいファイル') && labels.includes('新しいフォルダ') && ctl.dirs.has('nd') && rowOf('nd')?.kind === 'dir', 'GR24 F: 右クリックのメニューの「新しいフォルダ」で、フォルダをその場でディスクに作り、木に出す', `${labels.join(',')} / ${[...ctl.dirs].join(',')}`);
  }
  // 名前の規則に反する名前は、実行せずに理由を出す(ディスクも木も変えない)
  {
    const bad = [['', '名前が空です'], ['x/y', '「/」は使えません'], ['p:q', '「:」は使えません'], ['w*', '「*」は使えません'], ['c\u0007', '制御文字 U+0007'], ['.hidden', '. で始める'], ['A.SYSML', '同じフォルダに同じ名前の「a.sysml」があります']];
    const got = [];
    const l0 = ctl.log.length, rows0 = rowsNow().join(',');
    for (const [nm, want] of bad) {
      clickRow('keep.txt');
      $('btnNewFile').click();
      enterName(nm);
      await sleep(20);
      got.push([nm, nameWhy(), nameWhy().includes(want)]);
      enterName('', 'Escape');
    }
    check(got.every((g) => g[2]) && ctl.log.length === l0 && rowsNow().join(',') === rows0, 'GR24 F: 名前の規則(空、/ \\ : * ? " < > | と制御文字、. で始まる、同じフォルダに大文字・小文字を区別せずに同じ名前)に反する名前は、実行せずに理由を出す', JSON.stringify(got));
  }  // 焦点が外れたとき(GR24 P3 の裁定): 入力した名前で決める。名前の規則に反するときは決めずに、理由を出して入力欄に戻す
  {
    clickRow('keep.txt');
    $('btnNewFile').click();
    const i1 = nameInput(); const l0 = ctl.log.length;
    i1.value = 'bad:name'; i1.dispatchEvent({ type: 'input' }); i1.dispatchEvent({ type: 'blur' });
    await sleep(30);
    const stay = !!nameInput() && nameWhy().includes('「:」は使えません') && nameInput().value === 'bad:name' && ctl.log.length === l0;
    const i2 = nameInput(); i2.value = 'blur.sysml'; i2.dispatchEvent({ type: 'input' });
    const n0 = results.length;
    i2.dispatchEvent({ type: 'blur' });
    await opDone(n0);
    check(stay && diskText(ctl, 'blur.sysml') === '' && rowsNow().includes('blur.sysml') && !nameInput(), 'GR24 F: 名前の入力欄から焦点が外れたときは、入力した名前で決める(規則に反する名前なら決めずに、理由を出して入力欄に戻す)', JSON.stringify({ stay, why: nameWhy(), disk: diskList(ctl) }));
  }

  // 名前の変更(F2。move() を持たない偽物なので、写して確かめてから元を消す)。モデルは変わらず、診断の相対パスだけが変わる
  {
    const before = results.findLast((x) => x.text === treeKey());
    clickRow('b.sysml');
    treeKeyDown('F2');
    const n0 = results.length, l0 = ctl.log.length;
    enterName('b2.sysml');
    const r = await opDone(n0);
    const d0 = before?.m.diagnostics.semantic.map((e) => `${e.path} ${e.line}:${e.col} ${e.message}`) ?? [];
    const d1 = r?.m.diagnostics.semantic.map((e) => `${e.path} ${e.line}:${e.col} ${e.message}`) ?? [];
    check(diskText(ctl, 'b2.sysml') === F_FILES['b.sysml'] && diskText(ctl, 'b.sysml') === null && $('tree').dataset.via === 'copy' && JSON.stringify(ctl.log.slice(l0)) === JSON.stringify(['create:b2.sysml', 'write:b2.sysml', 'rm:b.sysml']) && rowsNow().includes('b2.sysml') && !rowsNow().includes('b.sysml'),
      'GR24 F: F2 の名前の変更は、move() のないハンドルでは、新しい名前に写して中身が同じことを確かめてから元を消す(経路 copy)', `${ctl.log.slice(l0).join(',')} / ${$('tree').dataset.via}`);
    check(d0.length === 1 && d1.length === 1 && d1[0] === d0[0].replace(/^b\.sysml /, 'b2.sysml '), 'GR24 F: .sysml の名前を変えただけでは、意味エラーは変わらず、診断の相対パスだけが変わる', `${d0} → ${d1}`);
  }
  // 書き換えたまま保存していないファイルの名前の変更: 書き換えと取り消しの履歴を引き継ぎ、ディスクには保存した中身を写す
  {
    clickRow('a.sysml');
    const A = shownArea();
    caretAt(A, 0); typeChars(A, '//e');
    const n0 = results.length;
    treeKeyDown('F2');
    enterName('a2.sysml');
    await opDone(n0);
    const kept = shownArea() === A && A.value === '//e' + F_FILES['a.sysml'] && pathBar() === 'a2.sysml' && rowOf('a2.sysml')?.cls.includes('dirty') && diskText(ctl, 'a2.sysml') === F_FILES['a.sysml'];
    const p = key(A, 'z', { ctrl: true });
    const undone = A.value === F_FILES['a.sysml'] && !rowOf('a2.sysml')?.cls.includes('dirty');
    check(kept && p && undone, 'GR24 F: 書き換えたまま保存していないファイルの名前を変えても、書き換えと取り消しの履歴が残り(Ctrl+Z で戻せ、戻すと印が消える)、ディスクには保存した中身を写す', JSON.stringify({ kept, p, undone, v: A.value.slice(0, 20), disk: diskText(ctl, 'a2.sysml') }));
  }
  // 削除: 確認を出し、「いいえ」では何も消さない。「はい」で、その場でディスクから消す。フォルダは中のファイルの数を書く
  {
    const k0 = confirms.length, l0 = ctl.log.length, rows0 = rowsNow().join(',');
    confirmAnswer = false;
    clickRow('keep.txt');
    treeKeyDown('Delete');
    await sleep(50);
    const q = confirms.at(-1) ?? '';
    check(confirms.length === k0 + 1 && q.startsWith('ファイル「keep.txt」を削除しますか?') && q.includes('ブラウザから消したファイルは、ごみ箱に入らず、元に戻せません') && ctl.log.length === l0 && rowsNow().join(',') === rows0 && diskText(ctl, 'keep.txt') === 'k\n', 'GR24 F: Delete で削除の確認を出し(ごみ箱に入らず元に戻せないことを書く)、「いいえ」では何も消さない', q);
    confirmAnswer = true;
    const n0 = results.length;
    treeKeyDown('Delete');
    await opDone(n0);
    check(diskText(ctl, 'keep.txt') === null && !rowsNow().includes('keep.txt'), 'GR24 F: 「はい」なら、その場でディスクから消し、木からも除く', ctl.log.slice(l0).join(','));
    // フォルダ(中に書き換えたファイル)の削除の確認
    clickRow('sub/c.sysml');
    const C = shownArea(); caretAt(C, 0); typeChars(C, '//d');
    confirmAnswer = false;
    clickRow('sub');
    treeKeyDown('Delete');
    await sleep(50);
    const q2 = confirms.at(-1) ?? '';
    check(/^フォルダ「sub」\(中のファイル 3\)を削除しますか\?/.test(q2) && q2.includes('書き換えたまま保存していないファイル(sub/c.sysml)が含まれます') && ctl.dirs.has('sub') && rowsNow().includes('sub/c.sysml'), 'GR24 F: フォルダの削除の確認に、中のファイルの数と、書き換えたまま保存していないファイルが含まれることを書く(「いいえ」で何も消さない)', q2);
    confirmAnswer = true;
    const n1 = results.length;
    treeKeyDown('Delete');
    const r = await opDone(n1);
    check(!ctl.dirs.has('sub') && ![...ctl.files.keys()].some((p) => p.startsWith('sub/')) && !rowsNow().some((p) => p.startsWith('sub')) && pathBar() !== 'sub/c.sysml' && !!r && !r.m.folder.files.some((f) => f.path.startsWith('sub/')), 'GR24 F: フォルダの削除で、中のファイルごとディスクから消し、木とモデルからも除く(今のファイルだったものは、ほかのファイルに替える)', `${diskList(ctl).join(',')} / ${pathBar()}`);
  }
  // 許可されないとき: 何もせずに理由を出す。ディスクと木が食い違わない
  {
    const o2 = await openFs('deny', F_FILES, { perm: 'prompt', grant: false });
    const c2 = o2.ctl, na = alerts.length, rows0 = rowsNow().join(',');
    clickRow('a.sysml');
    $('btnNewFile').click();
    enterName('x.sysml');
    await waitFor(() => alerts.length > na, 5000);
    check(c2.asked.includes('request:readwrite') && /書き込みが許可されなかったので、何もしませんでした/.test(alerts.at(-1) ?? '') && !c2.files.has('x.sysml') && rowsNow().join(',') === rows0, 'GR24 F: 書き込みの許可を最初の操作で求め、許可されなければ何もせずに理由を出す(ディスクにも木にも入れない)', `${c2.asked.join(',')} / ${alerts.at(-1)}`);
    alerts.splice(na);
  }
  // 書き込みが失敗したとき: 木も変えず、理由を出す
  {
    const o3 = await openFs('wfail', F_FILES, { failWrite: ['bad.sysml', 'a3.sysml'] });
    const c3 = o3.ctl, na = alerts.length, rows0 = rowsNow().join(',');
    clickRow('a.sysml');
    $('btnNewFile').click();
    enterName('bad.sysml');
    await waitFor(() => alerts.length > na, 5000);
    const a1 = alerts.at(-1) ?? '';
    treeKeyDown('F2');
    enterName('a3.sysml');
    await waitFor(() => alerts.length > na + 1, 5000);
    const a2 = alerts.at(-1) ?? '';
    check(/ファイル「bad\.sysml」を作れませんでした/.test(a1) && /a\.sysml」を「a3\.sysml」に名前を変えられませんでした/.test(a2) && rowsNow().join(',') === rows0 && diskText(c3, 'a.sysml') === F_FILES['a.sysml'] && pathBar() === 'a.sysml', 'GR24 F: ディスクへの書き込みが失敗したときは、木も変えず(新しいファイル・名前の変更とも)、理由を出す。元のファイルは残る', `${a1} / ${a2} / ${diskList(c3).join(',')}`);
    alerts.splice(na);
  }
  // move() を持つハンドルでは、名前の変更に move() を使う
  {
    const o4 = await openFs('mv', F_FILES, { hasMove: true });
    const c4 = o4.ctl, l0 = c4.log.length;
    clickRow('a.sysml');
    treeKeyDown('F2');
    const n0 = results.length;
    enterName('am.sysml');
    await opDone(n0);
    check($('tree').dataset.via === 'move' && JSON.stringify(c4.log.slice(l0)) === JSON.stringify(['move:a.sysml>am.sysml']) && diskText(c4, 'am.sysml') === F_FILES['a.sysml'] && pathBar() === 'am.sysml', 'GR24 F: move() を持つハンドルでは、ファイルの名前の変更に move() を使う(経路 move)', `${c4.log.slice(l0).join(',')} / ${$('tree').dataset.via}`);
  }
  // ---- ハンドルなし(webkitdirectory の欄): 同じ操作をアプリの中だけで行い、「保存」の zip に入れる
  {
    const n0 = results.length;
    delete window.showDirectoryPicker;
    $('btnFolder').click();
    const list = Object.entries(F_FILES).map(([p, v]) => ({ name: p.split('/').pop(), webkitRelativePath: `nh/${p}`, bytes: enc(v) }));
    $('dirOpen').dispatchEvent({ type: 'change', target: { files: list, value: 'x' } });
    await waitFor(() => $('treeName').textContent === 'nh' && results.slice(n0).some((x) => x.text === treeKey()), 30000);
    clickRow('a.sysml');
    $('btnNewFile').click(); let n1 = results.length; enterName('new.sysml'); await opDone(n1);
    clickRow('b.sysml'); treeKeyDown('F2'); n1 = results.length; enterName('bn.sysml'); await opDone(n1);
    confirmAnswer = true;
    clickRow('sub/c.sysml'); treeKeyDown('Delete'); n1 = results.length; await sleep(20); await opDone(n1);
    const saved = [];
    globalThis.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; };
    $('btnSave').click();
    await waitFor(() => saved.length, 5000);
    const z = saved.length ? readZip(new Uint8Array(await saved.at(-1).arrayBuffer())) : null;
    const sys = z?.filter((x) => x.path.endsWith('.sysml')).map((x) => x.path) ?? [];
    check(!!z && JSON.stringify(sys) === JSON.stringify(['a.sysml', 'bn.sysml', 'new.sysml']) && z.find((x) => x.path === 'bn.sysml')?.data === F_FILES['b.sysml'] && z.find((x) => x.path === 'new.sysml')?.data === '' && rowsNow().includes('new.sysml') && !rowsNow().includes('sub/c.sysml'),
      'GR24 F: ハンドルがないときは、新しいファイル・名前の変更・削除をアプリの中だけで行い、「保存」の zip に反映する', `${z?.map((x) => x.path).join(',')} / ${rowsNow().join(',')}`);
  }
}

// 木の中のドラッグ(dragstart → dragover → drop)。to が null なら木の空いたところ(根)に落とす
function dragRow(from, to) {
  const s = rowOf(from)?.el, t = to == null ? $('treeBody') : rowOf(to)?.el;
  if (!s || !t) return false;
  const ev = (type, target) => ({ type, target, dataTransfer: { setData() {}, effectAllowed: '' }, preventDefault() {}, stopPropagation() {} });
  $('treeBody').dispatchEvent(ev('dragstart', s));
  $('treeBody').dispatchEvent(ev('dragover', t));
  $('treeBody').dispatchEvent(ev('drop', t));
  $('treeBody').dispatchEvent(ev('dragend', s));
  return true;
}
const M_FILES = {
  'a.sysml': 'package A { part def X; }\n',
  'b.sysml': 'package B { private import A::*; part y : X; }\n',
  'sub/c.sysml': 'package C { part def Q; }\n',
  'sub/deep/d.sysml': 'package D { part def R; }\n',
  'sub/pic.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 0xff]),
  'sub/.git/HEAD': 'ref\n',
  'other/': null,
};
const bytesEq = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
async function gr24m() {
  const o = await openFs('mdemo', M_FILES);
  const ctl = o.ctl;
  // ドラッグ: ファイルをほかのフォルダへ、フォルダをほかのフォルダへ、根へ。自分の下のフォルダには移せない
  {
    let n0 = results.length;
    dragRow('a.sysml', 'other');
    await opDone(n0);
    const f1 = diskText(ctl, 'other/a.sysml') === M_FILES['a.sysml'] && diskText(ctl, 'a.sysml') === null && rowsNow().includes('other/a.sysml');
    n0 = results.length;
    const na = alerts.length;
    dragRow('sub', 'sub/deep');
    await sleep(50);
    const self = /自分自身かその中には移せません/.test(alerts.at(-1) ?? '') && ctl.dirs.has('sub') && rowsNow().includes('sub/deep/d.sysml');
    alerts.splice(na);
    n0 = results.length;
    dragRow('sub/deep', 'other');
    await opDone(n0);
    const f2 = diskText(ctl, 'other/deep/d.sysml') === M_FILES['sub/deep/d.sysml'] && !ctl.dirs.has('sub/deep') && rowsNow().includes('other/deep/d.sysml');
    n0 = results.length;
    dragRow('other/a.sysml', null);
    await opDone(n0);
    const f3 = diskText(ctl, 'a.sysml') === M_FILES['a.sysml'] && rowsNow().includes('a.sysml') && !rowsNow().includes('other/a.sysml');
    check(f1 && self && f2 && f3, 'GR24 M: ドラッグで、ファイル・フォルダをほかのフォルダ(根を含む)に移す(その場でディスクに入る)。自分自身の下のフォルダには移せない', JSON.stringify({ f1, self, f2, f3, disk: diskList(ctl) }));
  }
  // 切り取り・コピー・貼り付け(キー)。同じ名前があれば「 のコピー」「 のコピー 2」
  {
    clickRow('b.sysml');
    treeKeyDown('c', { ctrl: true });
    let n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0);
    n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0);
    const c1 = diskText(ctl, 'b のコピー.sysml') === M_FILES['b.sysml'] && diskText(ctl, 'b のコピー 2.sysml') === M_FILES['b.sysml'] && diskText(ctl, 'b.sysml') === M_FILES['b.sysml'];
    // フォルダのコピー(中の .git も写す)を同じ場所に
    clickRow('sub');
    treeKeyDown('c', { ctrl: true });
    n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0);
    const c2 = diskText(ctl, 'sub のコピー/c.sysml') === M_FILES['sub/c.sysml'] && bytesEq(ctl.files.get('sub のコピー/pic.png')?.bytes, M_FILES['sub/pic.png']) && diskText(ctl, 'sub のコピー/.git/HEAD') === 'ref\n' && rowsNow().includes('sub のコピー/pic.png') && !rowsNow().some((p) => p.includes('.git'));
    // 切り取り(右クリック)と貼り付け(other の中へ)
    $('treeBody').dispatchEvent({ type: 'contextmenu', target: rowOf('a.sysml').el, clientX: 5, clientY: 5, preventDefault() {} });
    registry.get('treeMenu')?.children.find((b) => b.textContent === '切り取り')?.click();
    $('treeBody').dispatchEvent({ type: 'contextmenu', target: rowOf('other').el, clientX: 5, clientY: 5, preventDefault() {} });
    n0 = results.length;
    registry.get('treeMenu')?.children.find((b) => b.textContent === '貼り付け')?.click();
    await opDone(n0);
    const c3 = diskText(ctl, 'other/a.sysml') === M_FILES['a.sysml'] && diskText(ctl, 'a.sysml') === null && rowsNow().includes('other/a.sysml');
    check(c1 && c2 && c3, 'GR24 M: Ctrl+C・Ctrl+V で写し、同じ名前があれば拡張子の前に「 のコピー」(重なれば「 のコピー 2」)を付ける。フォルダも中ごと写す(.git も写すが木には出さない)。右クリックの切り取りと貼り付けで移す', JSON.stringify({ c1, c2, c3, disk: diskList(ctl) }));
  }
  // 書き換えたまま保存していないファイルの、切り取りと貼り付け: 書き換えと取り消しの履歴を引き継ぎ、ディスクには保存した中身を写す
  {
    clickRow('b.sysml');
    const B = shownArea(); caretAt(B, 0); typeChars(B, '//m');
    treeKeyDown('x', { ctrl: true });
    clickRow('other');
    const n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0);
    const ok = shownArea() === B && pathBar() === 'other/b.sysml' && B.value === '//m' + M_FILES['b.sysml'] && diskText(ctl, 'other/b.sysml') === M_FILES['b.sysml'] && rowOf('other/b.sysml')?.cls.includes('dirty');
    const p = key(B, 'z', { ctrl: true });
    check(ok && p && B.value === M_FILES['b.sysml'], 'GR24 M: 書き換えたまま保存していないファイルを切り取りと貼り付けで動かしても、書き換えと取り消しの履歴を引き継ぎ、ディスクには保存した中身を写す', JSON.stringify({ ok, p, v: B.value.slice(0, 10) }));
  }
  // フォルダの名前の変更で、途中の 1 つのファイルの書き込みを失敗させたとき: 元のフォルダはすべて残り、写す先に作ったものを消して、
  // 何も変えていないことを出す(GR25 の P4 の予定の red の 1 で置き換えた。前は、写し終えたものと残っているものを出し、木にも出した)
  {
    const before = new Map([...ctl.files].filter(([p]) => p.startsWith('sub/')).map(([p, f]) => [p, f.bytes.slice()]));
    ctl.failWrite.push('sub2/pic.png');
    clickRow('sub');
    const na = alerts.length;
    treeKeyDown('F2');
    enterName('sub2');
    await waitFor(() => alerts.length > na, 10000);
    const a = alerts.at(-1) ?? '';
    const intact = [...before].every(([p, b]) => bytesEq(ctl.files.get(p)?.bytes, b)) && [...ctl.files.keys()].filter((p) => p.startsWith('sub/')).length === before.size;
    const shownSrc = rowsNow().includes('sub/c.sysml') && rowsNow().includes('sub/pic.png');
    const noDst = !ctl.dirs.has('sub2') && ![...ctl.files.keys()].some((p) => p.startsWith('sub2/')) && !rowsNow().some((p) => p === 'sub2' || p.startsWith('sub2/'));
    check(intact && shownSrc && noDst && /フォルダ「sub」を「sub2」に名前を変えられませんでした/.test(a) && /何も変えていません\(写す先に作ったものは消しました\)/.test(a),
      'GR24 M: フォルダの名前の変更で、途中の 1 つのファイルの書き込みを失敗させると、元のフォルダのすべてのファイルが同じ中身で残り、写す先に作ったものを消して、何も変えていないことを出す(木はディスクと食い違わない。GR25 の P4 で置き換えた)', `${a} / ${diskList(ctl).join(',')}`);
    alerts.splice(na);
    ctl.failWrite.length = 0;
  }
  // 大文字・小文字だけのフォルダの名前の変更は行わない(大文字・小文字を区別しないディスクで、元を消すおそれがあるため)
  {
    const o2 = await openFs('ci', { 'Sub/x.sysml': 'package X;\n' }, { ci: true });
    const na = alerts.length;
    clickRow('Sub'); treeKeyDown('F2'); enterName('sub');
    await waitFor(() => alerts.length > na, 5000);
    check(/大文字・小文字だけ変えることはできません/.test(alerts.at(-1) ?? '') && diskText(o2.ctl, 'Sub/x.sysml') === 'package X;\n', 'GR24 M: 大文字・小文字だけのフォルダの名前の変更は、元を消すおそれがあるので行わず、理由を出す', alerts.at(-1));
    alerts.splice(na);
  }
  // 再読み込み: ほかで足された・変えられた・消されたファイル
  {
    const o3 = await openFs('rl', { 'a.sysml': 'package A;\n', 'b.sysml': 'package B;\n', 'c.sysml': 'package C;\n', 'd.sysml': 'package Dd;\n', 'x.txt': 'x' });
    const c3 = o3.ctl;
    clickRow('b.sysml'); const B = shownArea(); caretAt(B, 0); typeChars(B, '//b');
    clickRow('d.sysml'); const Dd = shownArea(); caretAt(Dd, 0); typeChars(Dd, '//d');
    // ほかで: 足す(n.sysml)、書き換えていない a を変える、書き換えた b を変える、書き換えていない c を消す、書き換えた d を消す、x.txt を消す
    c3.files.set('n.sysml', { bytes: enc('package N;\n'), lastModified: 900 });
    c3.files.set('a.sysml', { bytes: enc('package A2;\n'), lastModified: 901 });
    c3.files.set('b.sysml', { bytes: enc('package Bx;\n'), lastModified: 902 });
    c3.files.delete('c.sysml'); c3.files.delete('d.sysml'); c3.files.delete('x.txt');
    c3.dirs.add('newdir');
    const n0 = results.length;
    $('btnReload').click();
    const r = await opDone(n0);
    const rows = rowsNow();
    const A = areaOf('a.sysml');
    const r1 = rows.includes('n.sysml') && A?.value === 'package A2;\n' && !rowOf('a.sysml')?.cls.includes('dirty') && B.value === '//bpackage B;\n' && rowOf('b.sysml')?.cls.includes('dirty') && !rows.includes('c.sysml') && !rows.includes('x.txt') && rows.includes('d.sysml') && rowOf('d.sysml')?.cls.includes('missing') && rows.includes('newdir') && !!r && r.m.folder.files.map((f) => f.path).join(',') === 'a.sysml,b.sysml,d.sysml,n.sysml';
    check(r1, 'GR24 M: 再読み込みで、ほかで足されたファイル(n.sysml)とフォルダを足し、書き換えていないファイル(a)は読み直し、書き換えたファイル(b)は今のテキストを保ち、書き換えていないファイルがほかで消えていたら(c・x.txt)木から除き、書き換えたファイルがほかで消えていたら(d)木に残して印を付ける', `${rows.join(',')} / ${A?.value} / ${rowOf('d.sysml')?.cls}`);
    // 保存: b はほかで変えられているので段階 B の確認を出し、d は作り直す
    const k0 = confirms.length;
    confirmAnswer = true;
    $('btnSave').click();
    await waitFor(() => /上書き保存しました/.test(fileMsgText()), 5000);
    check(confirms.slice(k0).some((q) => q.startsWith('ファイル「b.sysml」は、読み込んだ後にほかで変えられています')) && diskText(c3, 'b.sysml') === '//bpackage B;\n' && diskText(c3, 'd.sysml') === '//dpackage Dd;\n' && !rowOf('d.sysml')?.cls.includes('missing') && !rowOf('d.sysml')?.cls.includes('dirty'), 'GR24 M: 再読み込みの後の保存で、ほかで変えられていた書き換えたファイルには段階 B の確認を出し、ほかで消えていたファイルは作り直す', `${confirms.slice(k0).join(' / ')} / ${diskList(c3).join(',')}`);
  }
}
// ---- Z: zip に、.sysml でないファイル(画像のようなバイト列を含む)と空のフォルダを、相対パスのまま入れる
async function gr24z() {
  const n0 = results.length;
  delete window.showDirectoryPicker;
  $('btnFolder').click();
  const list = Object.entries(T_FILES).filter(([p]) => !p.endsWith('/')).map(([p, v]) => ({ name: p.split('/').pop(), webkitRelativePath: `zz/${p}`, bytes: typeof v === 'string' ? enc(v) : v }));
  $('dirOpen').dispatchEvent({ type: 'change', target: { files: list, value: 'x' } });
  await waitFor(() => $('treeName').textContent === 'zz' && results.slice(n0).some((x) => x.text === treeKey()), 30000);
  // アプリの中で空のフォルダを作る(webkitdirectory の欄では、空のフォルダは分からないため)
  $('btnNewDir').click(); let n1 = results.length; enterName('void'); await opDone(n1);
  const saved = [];
  globalThis.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; };
  $('btnSave').click();
  await waitFor(() => saved.length, 5000);
  const raw = saved.length ? new Uint8Array(await saved.at(-1).arrayBuffer()) : null;
  const z = raw ? readZipBytes(raw) : null;
  const paths = z?.map((x) => x.path) ?? [];
  const want = ['B.txt', 'Zeta/q.md', 'a.sysml', 'b.sysml', 'img.png', 'notes.txt', 'sub/deep/y.sysml', 'sub/z.sysml', 'void/'];
  const png = z?.find((x) => x.path === 'img.png');
  check(JSON.stringify(paths) === JSON.stringify(want) && bytesEq(png?.data, T_FILES['img.png']) && z.find((x) => x.path === 'notes.txt') && new TextDecoder().decode(z.find((x) => x.path === 'notes.txt').data) === 'memo\n' && z.find((x) => x.path === 'void/')?.data.length === 0 && (z.find((x) => x.path === 'void/')?.ext & 0x10) && !paths.some((p) => p.startsWith('.git')),
    'GR24 Z: 「保存」の zip に、.sysml でないファイル(画像のようなバイト列を含む)と空のフォルダを、相対パスのまま入れ、中身がバイト単位で同じ。.git は入れない', `${paths.join(',')} / ${png ? [...png.data].join(' ') : ''}`);
}
// zip を読む(バイト列のまま。外部の属性も)
function readZipBytes(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  const n = v.getUint16(e + 10, true), off = v.getUint32(e + 16, true);
  const out = [];
  for (let i = 0, p = off; i < n; i++) {
    const size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), ext = v.getUint32(p + 38, true), lo = v.getUint32(p + 42, true);
    const path = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl));
    const lnl = v.getUint16(lo + 26, true), lel = v.getUint16(lo + 28, true);
    out.push({ path, ext, data: bytes.slice(lo + 30 + lnl + lel, lo + 30 + lnl + lel + size) });
    p += 46 + nl + el + cl;
  }
  return out;
}
const G27MT = await import('../../src/app/modeltree.js'); // GR27 の P2: 結果の受け渡しの形を戻す(予定の red の 1 の置き換え)
// ---- モデル: .sysml の名前を変えた・移しただけでは名前解決・意味エラー・警告が変わらない。拡張子の変更で入る・外れる
async function gr24model() {
  const FILES = { 'lib.sysml': 'package Lib { part def Lamp; }\n', 'use.sysml': 'package Use { private import Lib::*; part l : Lamp; part m : Lib::Nope; action def A; part p : A; }\n', 'more.txt': 'package More { part def Extra; }\n' };
  const o = await openFs('mo', FILES);
  const summary = (r) => r ? JSON.stringify({ sem: r.m.diagnostics.semantic.map((e) => [e.line, e.col, e.message]), warn: (r.m.diagnostics.warning ?? []).map((e) => [e.line, e.col, e.message]), un: r.m.diagnostics.unchecked.count, amb: r.m.diagnostics.ambiguous.count, cands: r.m.candidates.map((c) => c.id).sort() }) : null; // 候補の並びはファイルの並び(相対パスの順)に従うので、集合で比べる
  const paths = (r) => r?.m.diagnostics.semantic.map((e) => e.path).concat((r.m.diagnostics.warning ?? []).map((e) => e.path)) ?? [];
  const r0 = o.r;
  clickRow('use.sysml'); treeKeyDown('F2'); let n0 = results.length; enterName('use2.sysml'); const r1 = await opDone(n0);
  clickRow('use2.sysml'); n0 = results.length; $('btnNewDir').click(); enterName('dir'); await opDone(n0);
  n0 = results.length; dragRow('use2.sysml', 'dir'); const r2 = await opDone(n0);
  check(!!r0 && summary(r0) === summary(r1) && summary(r1) === summary(r2) && paths(r0).every((p) => p === 'use.sysml') && paths(r1).every((p) => p === 'use2.sysml') && paths(r2).every((p) => p === 'dir/use2.sysml') && paths(r0).length === 2,
    'GR24 モデル: .sysml の名前を変えた・移しただけでは、意味エラー・警告・未検査・曖昧・描く範囲の候補が変わらず、診断の相対パスだけが変わる', `${summary(r0)} / ${summary(r2)} / ${paths(r0)} → ${paths(r2)}`);
  clickRow('more.txt'); treeKeyDown('F2'); n0 = results.length; enterName('more.sysml'); const r3 = await opDone(n0);
  // GR27 の P2 で置き換えた(予定の red の 1。O): 結果の候補は受け渡しの形(修飾名の表を指す形)なので、画面の戻し方(src/app/modeltree.js の
  // unpackCandidates)で戻してから表示の文字を確かめる(前は r3.m.candidates.some((c) => /More/.test(c.label)))
  const inModel = !!r3 && r3.m.folder.files.map((f) => f.path).includes('more.sysml') && !rowOf('more.sysml')?.cls.includes('dim') && G27MT.unpackCandidates(r3.m.candidates, r3.m.paths ?? null).some((c) => /More/.test(c.label));
  clickRow('lib.sysml'); treeKeyDown('F2'); n0 = results.length; enterName('lib.txt'); const r4 = await opDone(n0);
  const outModel = !!r4 && !r4.m.folder.files.map((f) => f.path).includes('lib.txt') && rowOf('lib.txt')?.cls.includes('dim') && r4.m.diagnostics.unchecked.count > r3.m.diagnostics.unchecked.count; // Lib が大域にないので、Lib を指す名前は未検査になる(設計書 9.2 節の S1 の条件)
  check(inModel && outModel, 'GR24 モデル: 拡張子を .sysml に変えたファイルはモデルに入り(テキストを読む)、.sysml から変えたファイルはモデルから外れる(薄く出す)', JSON.stringify({ inModel, outModel, f3: r3?.m.folder.files.map((f) => f.path), f4: r4?.m.folder.files.map((f) => f.path), u3: r3?.m.diagnostics.unchecked.count, u4: r4?.m.diagnostics.unchecked.count }));
}

// ---- GR24 の P5 の検査(--gr24p5。GR24 指示書 v24.2 の 4 章の D・E・I・N・P): ドラッグの直しと木の欄
// --gr24p5start は、ページを開いた直後の木の欄だけを確かめる(--ls・--lsthrow と組み合わせて、畳んだ状態を覚えることを確かめる。P)
const GR24P5 = process.argv.includes('--gr24p5'), GR24P5START = process.argv.includes('--gr24p5start');
const dropOn = () => $('drop')._cls.has('on');
const winFire = (type, ev) => { for (const h of winLs[type] ?? []) h({ type, preventDefault() {}, ...ev }); };
// 木の欄の知らせ(文と、「×」があるか)
const tmText = () => $('treeMsg').children.find((c) => c._cls.has('tmtext'))?.textContent ?? '';
const tmClose = () => $('treeMsg').children.find((c) => c._cls.has('tmclose')) ?? null;
// 開いたフォルダの開閉(expandAll を呼ばずに、今の木の行から読む)
const openState = () => treeRows().filter((r) => r.kind === 'dir').map((r) => `${r.path}:${r.cls.includes('open') ? '開' : '閉'}`).join(',');
// 項目を右クリックで選ぶ(クリックはフォルダの開閉を変えるので使わない)。出たメニューは閉じる
function pickRow(p) { $('treeBody').dispatchEvent({ type: 'contextmenu', target: rowOf(p).el, clientX: 1, clientY: 1, preventDefault() {}, stopPropagation() {} }); body.children.filter((c) => c.id === 'treeMenu').forEach((m) => m.remove()); }
// 開閉を変えずに、操作の知らせを待つ
async function msgDone(re, ms = 30000) { const ok = await waitFor(() => re.test(tmText()), ms); await sleep(50); return !!ok; }
function gr24p5start() {
  // P: ページを開いた直後(フォルダを開いていない)の木の欄。畳んだかどうかは、前のページが覚えたもの(--ls)で始まる。読めなければ開いた状態
  const t = $('tree');
  const want = !LS_THROW && lsStore.get('sysmlv2.treeFolded') === '1';
  check(!t.hidden && !$('treeSplit').hidden && t._cls.has('nofolder') && !!$('treeEmpty') && !$('treeEmpty').hidden && /フォルダを開いていません/.test($('treeEmpty').textContent) && !!$('btnTreeOpen') && t._cls.has('folded') === want && errors.length === 0,
    `GR24 P5 P: ページを開いた直後も木の欄を置き、「フォルダを開いていません」と「フォルダを開く」を出す。${LS_THROW ? 'localStorage が例外を出すときは、開いた状態で始まる' : want ? '前のページで畳んだので、畳んだまま始まる' : '覚えがなければ、開いた状態で始まる'}`,
    `${t.hidden} ${[...t._cls]} ${$('treeEmpty')?.textContent} ${errors.join('/')}`);
  // 畳む・広げるのボタンは、フォルダを開いていなくても効く。読み書きできないときも例外を出さない
  $('btnFold').click();
  // GR26 の P5 で置き換えた(予定の red の 6。W): ボタンの名前は「木の欄を畳む」「木の欄を広げる」(前は「フォルダの木を畳む」「フォルダの木を広げる」)
  const f1 = t._cls.has('folded') === !want && $('btnFold').getAttribute('aria-label') === (want ? '木の欄を畳む' : '木の欄を広げる');
  $('btnFold').click();
  const f2 = t._cls.has('folded') === want && (LS_THROW || lsStore.get('sysmlv2.treeFolded') === (want ? '1' : '0'));
  check(f1 && f2 && errors.length === 0, `GR24 P5 P: 畳む・広げるのボタンで、木の欄が畳まれ・広がり、${LS_THROW ? 'localStorage が使えなくても例外を出さない' : 'そのたびに localStorage に覚える'}`, `${f1} ${f2} ${[...lsStore].join(';')} ${errors.join('/')}`);
}
async function gr24p5() {
  // ---- P: ページを開いた直後の木の欄と、そこの「フォルダを開く」
  {
    const t = $('tree'), em = $('treeEmpty');
    check(!t.hidden && t._cls.has('nofolder') && !!em && !em.hidden && /フォルダを開いていません/.test(em.textContent) && /フォルダを開くと、ファイルを分けて書けます。ファイルやフォルダを足す・名前を変える・消すこともできます/.test(em.textContent) && /フォルダをここに置いても開けます/.test(em.textContent) && $('btnTreeOpen')?.textContent === 'フォルダを開く',
      'GR24 P5 P: ページを開いた直後(フォルダを開いていない)も木の欄を置き、「フォルダを開いていません」、「フォルダを開く」のボタン、短い説明、ここに置いても開けることを出す', em?.textContent);
    const n0 = results.length;
    window.showDirectoryPicker = async () => fakeFs('pdemo', { 'a.sysml': 'package A;\n' });
    $('btnTreeOpen').click();
    const ok = await waitFor(() => $('treeName').textContent === 'pdemo' && results.slice(n0).some((x) => x.text === treeKey()), 30000);
    check(!!ok && !t._cls.has('nofolder') && em.hidden && pathBar() === 'a.sysml' && treeRows().map((r) => r.path).join(',') === 'a.sysml',
      'GR24 P5 P: 木の欄の「フォルダを開く」で、上の帯の「フォルダを開く」と同じくフォルダを開き、案内の代わりに木を出す', `${[...t._cls]} ${em.hidden} ${pathBar()}`);
    const r = await openBy('open', 'one.sysml', 'part def One;\n');
    check(!!r && !t.hidden && t._cls.has('nofolder') && !em.hidden && $('treeName').textContent === '' && $('treeBody').children.length === 0 && $('fileBar').hidden,
      'GR24 P5 P: 1 ファイルを開いたときも、木の欄に「フォルダを開いていません」と「フォルダを開く」を出す(1 ファイルの扱いは変えない)', `${[...t._cls]} ${em.hidden}`);
    // ここ(木の欄)に置いたフォルダでも開く: 木は外からのドロップの出来事を止めないので、画面全体のドロップと同じ扱いになる
    let stopped = false;
    const ev = { type: 'drop', target: em, preventDefault() {}, stopPropagation() { stopped = true; }, dataTransfer: { types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => fakeEntry('pdrop', { 'x.sysml': 'package X;\n' }) }], files: [] } };
    $('treeBody').dispatchEvent(ev);
    const n1 = results.length;
    if (!stopped) winFire('drop', ev);
    const ok2 = await waitFor(() => $('treeName').textContent === 'pdrop' && results.slice(n1).some((x) => x.text === treeKey()), 30000);
    check(!stopped && !!ok2 && !t._cls.has('nofolder'), 'GR24 P5 P: フォルダを開いていないときの木の欄にフォルダを置いても、画面全体のドロップと同じくフォルダを開く', `${stopped} ${$('treeName').textContent}`);
  }
  // ---- D: ドラッグ
  const o = await openFs('ddemo', M_FILES);
  {
    expandAll();
    const rows = treeRows();
    const allDrag = rows.length > 0 && rows.every((r) => r.el.draggable === true);
    pickRow('b.sysml');
    treeKeyDown('F2');
    const ed = $('treeBody').querySelectorAll('.tedit')[0];
    const edNo = !!ed && ed.draggable !== true;
    enterName('b.sysml', 'Escape');
    check(allDrag && edNo, 'GR24 P5 D: 木のすべての項目(フォルダとファイル)に draggable が付き、名前の入力欄の行には付かない', `${rows.filter((r) => r.el.draggable !== true).map((r) => r.path).join(',')} / 入力欄 ${edNo}`);
  }
  {
    // 木の中のドラッグ(dataTransfer.types に Files がない): 画面全体のドロップの表示を出さずに、ほかのフォルダに移す
    const ctl = o.ctl;
    const dt = { types: ['text/plain'], setData() {}, effectAllowed: '' };
    const s = rowOf('a.sysml').el, t = rowOf('other').el;
    $('treeBody').dispatchEvent({ type: 'dragstart', target: s, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
    winFire('dragenter', { target: t, dataTransfer: dt });
    const on1 = dropOn();
    let stopped = false;
    const over = { type: 'dragover', target: t, dataTransfer: dt, preventDefault() {}, stopPropagation() { stopped = true; } };
    $('treeBody').dispatchEvent(over);
    if (!stopped) winFire('dragover', over);
    const on2 = dropOn();
    $('treeBody').dispatchEvent({ type: 'drop', target: t, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
    $('treeBody').dispatchEvent({ type: 'dragend', target: s, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
    const moved = await msgDone(/「a\.sysml」を「other\/a\.sysml」に移しました/);
    check(!on1 && !on2 && moved && diskText(ctl, 'other/a.sysml') === M_FILES['a.sysml'] && !dropOn(), 'GR24 P5 D: 木の中のドラッグ(Files がない)では、画面全体のファイルのドロップの表示(#drop)を出さず、落とすと移す', JSON.stringify({ on1, on2, moved, disk: diskList(ctl) }));
  }
  {
    // 外からのファイルのドラッグ(Files がある): #drop を出し、落としたときと、ウィンドウの外に出たときに消す
    const dt = { types: ['Files'], items: [], files: [] };
    winFire('dragenter', { target: $('view'), dataTransfer: dt });
    const a = dropOn();
    winFire('dragover', { target: $('view'), dataTransfer: dt });
    const b = dropOn();
    winFire('drop', { target: $('view'), dataTransfer: dt });
    const c = !dropOn();
    winFire('dragenter', { target: $('view'), dataTransfer: dt });
    const d = dropOn();
    winFire('dragleave', { target: $('view'), relatedTarget: null, dataTransfer: dt });
    const e = !dropOn();
    check(a && b && c && d && e, 'GR24 P5 D: 外からファイル・フォルダを持ち込んだとき(Files がある)は #drop を出し、落としたときと、ウィンドウの外に出たときに消す', JSON.stringify({ a, b, c, d, e }));
  }
  {
    // 外から木の欄(フォルダを開いているとき)に落としたときは、画面全体のドロップと同じ扱い: 2 つ以上は理由を出し、ファイルは開き、
    // フォルダはフォルダとして開く。木はこの出来事を止めない
    const viaTree = (dataTransfer) => { let stopped = false; const ev = { type: 'drop', target: rowOf('b.sysml')?.el ?? $('treeBody'), preventDefault() {}, stopPropagation() { stopped = true; }, dataTransfer: { types: ['Files'], ...dataTransfer } }; $('treeBody').dispatchEvent(ev); if (!stopped) winFire('drop', ev); return stopped; };
    const na = alerts.length;
    const s1 = viaTree({ items: [{ kind: 'file' }, { kind: 'file' }], files: [fileOf('p.sysml', 'x'), fileOf('q.sysml', 'y')] });
    const two = alerts.length === na + 1 && /一度にドロップできるのは、1 つのファイルか、フォルダ 1 つだけです。2 個をドロップしたので/.test(alerts.at(-1) ?? '') && $('treeName').textContent === 'ddemo';
    confirmAnswer = true;
    const n0 = results.length;
    const s2 = viaTree({ items: [{ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false }) }], files: [fileOf('one.sysml', 'part def Dropped;\n')] });
    const one = !!(await waitFor(() => $('src').value === 'part def Dropped;\n' && $('tree')._cls.has('nofolder'), 5000));
    const s3 = viaTree({ items: [{ kind: 'file', webkitGetAsEntry: () => fakeEntry('ddir', { 'k.sysml': 'package K;\n' }) }], files: [] });
    const dir = !!(await waitFor(() => $('treeName').textContent === 'ddir' && results.slice(n0).some((x) => x.text === treeKey()), 30000));
    check(!s1 && !s2 && !s3 && two && one && dir, 'GR24 P5 D: 外から木の欄に落としたときの扱いは、画面全体のドロップと同じ(2 つ以上は理由を出す、.sysml を開く、フォルダを開く)', JSON.stringify({ s1, s2, s3, two, one, dir, a: alerts.slice(na) }));
  }
  // ---- E: 名前を変えた・移したフォルダの開閉を保つ
  {
    const o2 = await openFs('edemo', { 'p/q/r.sysml': 'package R;\n', 'p/s/t.sysml': 'package T;\n', 'p/u.sysml': 'package U;\n', 'other/': null });
    // openFs の待ちが木をすべて開くので、p/s だけを閉じる(p・p/q は開いたまま)
    clickRow('p/s');
    const s0 = openState();
    pickRow('p');
    treeKeyDown('F2');
    enterName('p2');
    const r1 = await msgDone(/「p」を「p2」に名前を変えました/);
    const s1 = openState();
    pickRow('p2');
    treeKeyDown('x', { ctrl: true });
    pickRow('other');
    treeKeyDown('v', { ctrl: true });
    const r2 = await msgDone(/「p2」を「other\/p2」に移しました/);
    const s2 = openState();
    // ドラッグで根に戻す
    const dt = { types: ['text/plain'], setData() {}, effectAllowed: '' };
    $('treeBody').dispatchEvent({ type: 'dragstart', target: rowOf('other/p2').el, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
    $('treeBody').dispatchEvent({ type: 'dragover', target: $('treeBody'), dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
    $('treeBody').dispatchEvent({ type: 'drop', target: $('treeBody'), dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
    const r3 = await msgDone(/「other\/p2」を「p2」に移しました/);
    const s3 = openState();
    check(s0 === 'other:開,p:開,p/q:開,p/s:閉' && r1 && s1 === 'other:開,p2:開,p2/q:開,p2/s:閉' && r2 && s2 === 'other:開,other/p2:開,other/p2/q:開,other/p2/s:閉' && r3 && s3 === 'other:開,p2:開,p2/q:開,p2/s:閉' && !!o2,
      'GR24 P5 E: 開いた下のフォルダを持つフォルダの名前を変え・(切り取りと貼り付け、ドラッグで)移した後も、そのフォルダとその下のフォルダの開閉が元と同じ', [s0, s1, s2, s3].join(' → '));
  }
  // ---- N: 木の欄の知らせ(うまくいった知らせは 5 秒ほどで消す。失敗の理由は、次の操作か「×」まで残す)。時間は、5 秒の待ちを捕まえて進める
  {
    const realST = globalThis.setTimeout;
    const pending = [];
    globalThis.setTimeout = (f, ms, ...a) => (ms === 5000 ? (pending.push(f), { fake: true }) : realST(f, ms, ...a));
    try {
      pickRow('other');
      $('btnNewDir').click();
      enterName('n1');
      const made = await msgDone(/フォルダ「other\/n1」を作りました/);
      const k = pending.length;
      const noX = !tmClose() && !$('treeMsg')._cls.has('fail');
      for (const f of pending.splice(0)) f();
      const gone = tmText() === '' && $('treeMsg').textContent === '';
      check(made && k >= 1 && noX && gone, 'GR24 P5 N: うまくいった知らせ(作った)は「×」なしで出し、5 秒たつと消える', JSON.stringify({ made, k, noX, gone }));
      // 失敗の理由: 貼り付けるものがないときの Ctrl+V
      treeKeyDown('v', { ctrl: true });
      const f1 = await msgDone(/貼り付けるものがありません/);
      const k2 = pending.length;
      for (const f of pending.splice(0)) f();
      await sleep(50);
      const stays = /貼り付けるものがありません/.test(tmText()) && !!tmClose() && $('treeMsg')._cls.has('fail');
      tmClose().click();
      const closed = tmText() === '' && !tmClose();
      treeKeyDown('v', { ctrl: true });
      const f2 = await msgDone(/貼り付けるものがありません/);
      pickRow('other');
      treeKeyDown('F2');
      const next = tmText() === '' && !tmClose();
      enterName('other', 'Escape');
      treeKeyDown('v', { ctrl: true });
      const f3 = await msgDone(/貼り付けるものがありません/);
      const dt = { types: ['text/plain'], setData() {}, effectAllowed: '' };
      $('treeBody').dispatchEvent({ type: 'dragstart', target: rowOf('p2').el, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
      const next2 = tmText() === '';
      $('treeBody').dispatchEvent({ type: 'dragend', target: rowOf('p2').el, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
      check(f1 && k2 === 0 && stays && closed && f2 && next && f3 && next2, 'GR24 P5 N: 失敗の理由は「×」付きで出し、時間がたっても残り、「×」と次の操作(名前の変更・ドラッグ)で消える', JSON.stringify({ f1, k2, stays, closed, f2, next, f3, next2 }));
    } finally { globalThis.setTimeout = realST; }
  }
  // ---- P: 畳んだ状態を localStorage に覚える(開き直したときは --gr24p5start --ls で確かめる)
  {
    $('btnFold').click();
    // GR26 の P5 で置き換えた(予定の red の 6。W): 「フォルダの木を広げる」→「木の欄を広げる」
    const folded = $('tree')._cls.has('folded') && lsStore.get('sysmlv2.treeFolded') === '1' && $('btnFold').getAttribute('aria-label') === '木の欄を広げる' && $('btnFold').getAttribute('aria-expanded') === 'false';
    check(folded, 'GR24 P5 P: 「木の欄を畳む」で木の欄を畳み、畳んだことを localStorage に覚える(畳んだ欄には、広げるボタンが残る)', `${[...$('tree')._cls]} ${[...lsStore].join(';')}`);
    console.log(`LS\t${JSON.stringify(Object.fromEntries(lsStore))}`);
  }
}

// ---- GR25 の検査(--gr25a。GR25 指示書 4 章の A1〜A6): データを失う経路。書き込みを記録する偽のフォルダのハンドル fakeFs を使う
// (GR25 で fakeFs に足したもの: failData は、ファイルは作れるが書き込みが失敗する相対パス。A6 の作りかけのファイルの真似)
const GR25A = process.argv.includes('--gr25a');
// ほかのアプリでファイルを変えた・作った真似(最終更新の時刻を進める)
const extWrite = (ctl, p, t) => { ctl.files.set(p, { bytes: enc(t), lastModified: ++ctl.clock }); };
// 「保存」を押し、保存の知らせを待つ。→ そのときに出た確認の文
async function saveNow(answer) {
  const k = confirms.length, na = alerts.length;
  confirmAnswer = answer;
  const fm = $('fileBar').children.find((c) => c.className.includes('fmsg'));
  if (fm) fm.textContent = '';
  $('btnSave').click();
  await waitFor(() => /上書き保存しました|何も書きませんでした/.test(fileMsgText()), 10000);
  await sleep(30);
  confirmAnswer = true;
  // 「やめる」と答えたファイルの知らせ(書かなかったファイルがあります)は、期待どおりのものなので数えない
  if (!answer) for (let i = alerts.length - 1; i >= na; i--) if (alerts[i].startsWith('書かなかったファイルがあります')) alerts.splice(i, 1);
  return confirms.slice(k);
}
// テキスト欄の先頭に文字を打つ(書き換え)
async function editFile(p, s) { clickRow(p); const A = areaOf(p); const n0 = results.length; caretAt(A, 0); typeChars(A, s); await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000); return A; }
// 名前の変更(F2)
async function renameRow(p, name) { clickRow(p); treeKeyDown('F2'); const n0 = results.length; enterName(name); return opDone(n0); }
// 再読み込み
async function reloadNow() { const m = await (async () => { $('btnReload').click(); return waitFor(() => /ディスクから読み直しました/.test($('treeMsg').textContent), 10000); })(); await sleep(30); return !!m; }
// ハンドルなし(webkitdirectory の欄)で開く
async function openNoHandle(name, files) {
  confirmAnswer = true;
  const n0 = results.length;
  delete window.showDirectoryPicker;
  $('btnFolder').click();
  const list = Object.entries(files).map(([p, v]) => ({ name: p.split('/').pop(), webkitRelativePath: `${name}/${p}`, bytes: enc(v) }));
  $('dirOpen').dispatchEvent({ type: 'change', target: { files: list, value: 'x' } });
  return waitFor(() => $('treeName').textContent === name && results.slice(n0).some((x) => x.text === treeKey()), 30000);
}
// beforeunload の出来事を起こす。→ 既定の動きを止めたか(preventDefault か returnValue)
function unloadBlocked() {
  let prevented = false;
  const ev = { type: 'beforeunload', returnValue: undefined, preventDefault() { prevented = true; } };
  for (const h of winLs.beforeunload ?? []) h(ev);
  return prevented || (ev.returnValue !== undefined && ev.returnValue !== null);
}
const A_FILES = {
  'a.sysml': 'package A { part def X; }\n',
  'c.sysml': 'package C { part def Q; }\n',
  'd.sysml': 'package D;\n',
  'e.sysml': 'package E;\n',
  'sub/b.sysml': 'package B { part def Y; }\n',
  'dst/': null,
};
async function gr25a1(hasMove) {
  const tag = hasMove ? 'move() あり' : 'move() なし';
  const o = await openFs(`a1${hasMove ? 'm' : 'c'}`, A_FILES, { hasMove });
  const ctl = o.ctl;
  // ほかで変える → アプリで書き換える → 名前の変更(ファイル)・名前の変更(フォルダ)・移動(ドラッグ)
  extWrite(ctl, 'a.sysml', 'package A { part def Ext; }\n');
  extWrite(ctl, 'sub/b.sysml', 'package B { part def ExtB; }\n');
  extWrite(ctl, 'c.sysml', 'package C { part def ExtC; }\n');
  await editFile('a.sysml', '//1');
  await editFile('sub/b.sysml', '//2');
  await editFile('c.sysml', '//3');
  await renameRow('a.sysml', 'a2.sysml');
  await renameRow('sub', 'sub2');
  { const n0 = results.length; dragRow('c.sysml', 'dst'); await opDone(n0); }
  const moved = rowsNow().includes('a2.sysml') && rowsNow().includes('sub2/b.sysml') && rowsNow().includes('dst/c.sysml');
  const qs = await saveNow(false);
  const asked = ['a2.sysml', 'sub2/b.sysml', 'dst/c.sysml'].map((p) => qs.some((q) => q.startsWith(`ファイル「${p}」は、読み込んだ後にほかで変えられています`)));
  const kept = diskText(ctl, 'a2.sysml') === 'package A { part def Ext; }\n' && diskText(ctl, 'sub2/b.sysml') === 'package B { part def ExtB; }\n' && diskText(ctl, 'dst/c.sysml') === 'package C { part def ExtC; }\n';
  check(moved && asked.every(Boolean) && qs.length === 3 && kept && rowOf('a2.sysml')?.cls.includes('dirty'),
    `GR25 A1(${tag}): ほかで変えた後に、書き換えて名前の変更(ファイル・フォルダ)・移動をしたファイルを保存すると、確認が出て、「やめる」でほかでの変更がディスクに残る`, JSON.stringify({ moved, asked, n: qs.length, qs, a2: diskText(ctl, 'a2.sysml'), b: diskText(ctl, 'sub2/b.sysml'), c: diskText(ctl, 'dst/c.sysml') }));
  // ほかで変えていなければ、名前を変えた後の保存で確認が出ない
  await editFile('d.sysml', '//4');
  await renameRow('d.sysml', 'd2.sysml');
  const before = ctl.log.length;
  const qs2 = await saveNow(true);
  check(!qs2.some((q) => q.includes('d2.sysml')) && diskText(ctl, 'd2.sysml') === '//4package D;\n' && ctl.log.slice(before).includes('write:d2.sysml'),
    `GR25 A1(${tag}): ほかで変えていなければ、書き換えて名前を変えたファイルの保存で確認が出ない`, JSON.stringify({ qs2, d2: diskText(ctl, 'd2.sysml') }));
  // コピー: ほかで変えたファイルを写すと、アプリの中身とディスクの中身が同じ
  extWrite(ctl, 'e.sysml', 'package E { part def ExtE; }\n');
  clickRow('e.sysml'); treeKeyDown('c', { ctrl: true });
  { const n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0); }
  const cp = 'e のコピー.sysml';
  const same = diskText(ctl, cp) === 'package E { part def ExtE; }\n' && areaOf(cp)?.value === diskText(ctl, cp);
  // フォルダのコピー
  extWrite(ctl, 'sub2/b.sysml', 'package B { part def ExtB2; }\n');
  clickRow('sub2'); treeKeyDown('c', { ctrl: true });
  clickRow('e.sysml');
  { const n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0); }
  const fcp = 'sub2 のコピー/b.sysml';
  const sameDir = diskText(ctl, fcp) === 'package B { part def ExtB2; }\n' && areaOf(fcp)?.value === diskText(ctl, fcp);
  // 写したものをほかで変えずに書き換えて保存しても、確認が出ない(比較の元が写した中身)
  await editFile(cp, '//5');
  const qs3 = await saveNow(true);
  check(same && sameDir && !qs3.some((q) => q.includes(cp)) && diskText(ctl, cp) === '//5package E { part def ExtE; }\n',
    `GR25 A1(${tag}): コピー(ファイル・フォルダ)の後、アプリの中身とディスクの中身が同じで、それを書き換えた保存で確認が出ない`, JSON.stringify({ disk: diskText(ctl, cp), app: areaOf(cp)?.value, dDisk: diskText(ctl, fcp), dApp: areaOf(fcp)?.value, qs3 }));
}
async function gr25a() {
  // ---- A1
  await gr25a1(false);
  await gr25a1(true);
  // ---- A2: 書き換えたまま、ディスクで消す → 再読み込み → ほかで同じ名前のファイルを作る → 保存
  {
    const o = await openFs('a2', { 'x.sysml': 'package X;\n', 'y.sysml': 'package Y;\n', 'k.sysml': 'package K;\n' });
    const ctl = o.ctl;
    await editFile('x.sysml', '//x');
    await editFile('y.sysml', '//y');
    ctl.files.delete('x.sysml'); ctl.files.delete('y.sysml');
    const rl = await reloadNow();
    const marked = rowOf('x.sysml')?.cls.includes('missing') && rowOf('y.sysml')?.cls.includes('missing');
    extWrite(ctl, 'x.sysml', 'other\n');
    // 印付きのファイル y の名前を、ディスクにだけある名前 w.sysml に変える
    extWrite(ctl, 'w.sysml', 'disk only\n');
    await renameRow('y.sysml', 'w.sysml');
    const qs = await saveNow(false);
    check(rl && marked && qs.some((q) => q.startsWith('ファイル「x.sysml」は、ほかで消えた後に、同じ名前のファイルがほかで作られています')) && qs.some((q) => q.startsWith('ファイル「w.sysml」は、ほかで消えた後に')) && diskText(ctl, 'x.sysml') === 'other\n' && diskText(ctl, 'w.sysml') === 'disk only\n' && rowOf('x.sysml')?.cls.includes('missing'),
      'GR25 A2: ほかで消えて作り直すファイル(と、その名前をディスクにだけある名前に変えたもの)の保存で、同じ相対パスにほかで作られたファイルがあれば確認が出て、「やめる」でそのファイルが残る', JSON.stringify({ rl, marked, qs, x: diskText(ctl, 'x.sysml'), w: diskText(ctl, 'w.sysml') }));
    const qs2 = await saveNow(true);
    check(qs2.length === 2 && diskText(ctl, 'x.sysml') === '//xpackage X;\n' && diskText(ctl, 'w.sysml') === '//ypackage Y;\n' && !rowOf('x.sysml')?.cls.includes('missing'),
      'GR25 A2: 確認で「OK」なら上書きして作り直し、印を消す', JSON.stringify({ qs2, x: diskText(ctl, 'x.sysml'), w: diskText(ctl, 'w.sysml') }));
    // ほかで作られていなければ、確認なしに作り直す(GR24 の M のまま)
    await editFile('k.sysml', '//k');
    ctl.files.delete('k.sysml');
    await reloadNow();
    const qs3 = await saveNow(false);
    check(qs3.length === 0 && diskText(ctl, 'k.sysml') === '//kpackage K;\n', 'GR25 A2: 同じ相対パスにファイルがなければ、確認を出さずに作り直す', JSON.stringify({ qs3, k: diskText(ctl, 'k.sysml') }));
  }
  // ---- P1 の裁定の問 1: ほかで消えた書き換えたファイルを、取り消しで書き換える前に戻しても、「ディスクにない」の印が残る間は確認を出す
  {
    const o = await openFs('q1', { 'x.sysml': 'package X;\n', 'y.sysml': 'package Y;\n' });
    const A = await editFile('x.sysml', '//x');
    o.ctl.files.delete('x.sysml');
    const rl = await reloadNow();
    key(A, 'z', { ctrl: true });
    await sleep(50);
    const undone = A.value === 'package X;\n' && !rowOf('x.sysml')?.cls.includes('dirty') && rowOf('x.sysml')?.cls.includes('missing');
    const blocked = unloadBlocked();
    confirmAnswer = false;
    const k = confirms.length;
    $('btnNew').click();
    await sleep(50);
    const q = confirms.at(-1) ?? '';
    const kept = confirms.length === k + 1 && $('treeName').textContent === 'q1' && rowsNow().includes('x.sysml');
    confirmAnswer = true;
    check(rl && undone && blocked && kept && q.startsWith('ほかで消えていて、保存で作り直すファイル(ディスクにない)があります'),
      'GR25 A3・A4(P1 の裁定の問 1): 書き換え → ディスクで消す → 再読み込み → Ctrl+Z で元に戻した後も、「ディスクにない」の印が残る間は、「新規」で置き換えの確認が出て(「やめる」でフォルダを保つ)、beforeunload も止める', JSON.stringify({ rl, undone, blocked, kept, q }));
  }
  // ---- A3: ハンドルなしの木の操作の後の、置き換えの確認
  {
    const F = { 'a.sysml': 'package A;\n', 'b.sysml': 'package B;\n', 'sub/c.sysml': 'package C;\n' };
    const ops = {
      新しいファイル: async () => { clickRow('a.sysml'); $('btnNewFile').click(); const n0 = results.length; enterName('n.sysml'); await opDone(n0); },
      名前の変更: async () => { await renameRow('b.sysml', 'b2.sysml'); },
      削除: async () => { confirmAnswer = true; clickRow('b.sysml'); const n0 = results.length; treeKeyDown('Delete'); await sleep(30); await opDone(n0); },
      移動: async () => { const n0 = results.length; dragRow('a.sysml', 'sub'); await opDone(n0); },
      コピー: async () => { clickRow('a.sysml'); treeKeyDown('c', { ctrl: true }); const n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0); },
    };
    const got = {};
    for (const [what, op] of Object.entries(ops)) {
      await openNoHandle('a3', F);
      const clean = !unloadBlocked();
      await op();
      const rows = rowsNow().join(',');
      const res = [];
      const still = () => $('treeName').textContent === 'a3' && rowsNow().join(',') === rows;
      confirmAnswer = false;
      let k = confirms.length; $('btnNew').click(); res.push(confirms.length === k + 1 && still());
      k = confirms.length; $('btnSample').click();
      const b = await waitFor(() => $('dlgSample').querySelectorAll('button').find((x) => x.textContent.includes('入門')), 3000);
      b?.click(); res.push(confirms.length === k + 1 && still());
      k = confirms.length; $('fileOpen').dispatchEvent({ type: 'change', target: { files: [fileOf('x.sysml', 'part def X;\n')], value: 'x' } }); res.push(confirms.length === k + 1 && still());
      k = confirms.length; for (const h of winLs.drop ?? []) h({ type: 'drop', preventDefault() {}, dataTransfer: { files: [fileOf('y.sysml', 'part def Y;\n')] } }); res.push(confirms.length === k + 1 && still());
      k = confirms.length; window.showDirectoryPicker = async () => fakeHandle('other', { 'z.sysml': 'part def Z;\n' }); $('btnFolder').click(); await waitFor(() => confirms.length > k, 5000); await sleep(30); res.push(confirms.length === k + 1 && still());
      const q = confirms.at(-1) ?? '';
      const blocked = unloadBlocked();
      confirmAnswer = true;
      // zip を保存した後は出ない
      const saved = [];
      globalThis.URL.createObjectURL = (bl) => { saved.push(bl); return 'blob:x'; };
      $('btnSave').click();
      await waitFor(() => saved.length, 5000);
      const freed = !unloadBlocked();
      confirmAnswer = false;
      k = confirms.length; const n0 = results.length; $('btnNew').click(); await resultFor(P4_SKELETON, n0);
      const noAsk = confirms.length === k && $('fileBar').hidden;
      confirmAnswer = true;
      got[what] = clean && res.every(Boolean) && q.startsWith('保存していないフォルダの木の操作') && blocked && saved.length === 1 && freed && noAsk ? 'ok' : JSON.stringify({ clean, res, q, blocked, saved: saved.length, freed, noAsk });
    }
    check(Object.values(got).every((x) => x === 'ok'), 'GR25 A3: ハンドルなしで、新しいファイル・名前の変更・削除・移動・コピーのそれぞれの後に、「新規」「例を読み込む」「開く」・ドロップ・「フォルダを開く」で確認が出て、「やめる」でフォルダを保つ。zip を保存した後は出ない', JSON.stringify(got));
  }
  // ---- A4: beforeunload(要る 3 通りと、要らない 3 通り)
  {
    const r = {};
    await resetSingle();
    r.single0 = !unloadBlocked();
    { const n0 = results.length; $('src').value = P4_SKELETON + '// x\n'; $('src').dispatchEvent(new Event('input')); await resultFor($('src').value, n0); }
    r.single1 = unloadBlocked();
    $('btnSave').click(); // 1 ファイルの保存(ダウンロード)の後は要らない
    r.single2 = !unloadBlocked();
    const o = await openFs('a4', { 'a.sysml': 'package A;\n' });
    r.folder0 = !!o && !unloadBlocked();
    await editFile('a.sysml', '//a');
    r.folder1 = unloadBlocked();
    await openNoHandle('a4n', { 'a.sysml': 'package A;\n' });
    r.nohandle0 = !unloadBlocked();
    await renameRow('a.sysml', 'a2.sysml');
    r.nohandle1 = unloadBlocked();
    confirmAnswer = true;
    await resetSingle();
    check(Object.values(r).every(Boolean), 'GR25 A4: beforeunload で既定の動きを止めるのは、置き換えの確認が要るとき(1 ファイルの書き換え・フォルダの書き換え・ハンドルなしの木の操作)だけで、要らないとき(書き換えていない 1 ファイル・保存した後・書き換えていないフォルダ・操作していないハンドルなしのフォルダ)は止めない', JSON.stringify(r));
  }
  // ---- A5: 木に出ない . で始まるフォルダの中のものも消えることを、削除の確認に書く
  {
    const o = await openFs('a5', { 'sub/a.sysml': 'package A;\n', 'sub/.git/HEAD': 'ref\n', 'sub/.git/objects/x': 'o\n', 'b.sysml': 'package B;\n', 'plain/c.sysml': 'package C;\n' });
    const ctl = o.ctl;
    confirmAnswer = false;
    clickRow('sub'); treeKeyDown('Delete');
    await waitFor(() => confirms.length && confirms.at(-1).includes('「sub」'), 5000);
    const q = confirms.at(-1) ?? '';
    clickRow('plain'); treeKeyDown('Delete');
    await waitFor(() => confirms.at(-1)?.includes('「plain」'), 5000);
    const q2 = confirms.at(-1) ?? '';
    confirmAnswer = true;
    // P1 の裁定の問 2 で、文を「木にないもの N 個(.git など)も消えます」の形にした(P1 の期待: 「木に出ない」「ファイル 2 個も消えます」)
    check(/フォルダ「sub」\(中のファイル 1\)/.test(q) && q.includes('「sub」の中の、木にないもの 2 個(.git など)も消えます') && ctl.files.has('sub/.git/HEAD') && !q2.includes('木にないもの'),
      'GR25 A5: フォルダの削除の確認に、木に出ない、名前が . で始まるフォルダ(.git)の中のものも消えることと数(2)を書く(ないフォルダでは書かない)', `${q} / ${q2}`);
    // P1 の裁定の問 2: 読み込んだ後にほかで足したファイル・空のフォルダも、木にないものとしてまとめて数える。読めなければ、消えることがあると書く
    extWrite(ctl, 'sub/new.txt', 'important\n');
    ctl.dirs.add('sub/later');
    confirmAnswer = false;
    clickRow('sub'); treeKeyDown('Delete');
    await waitFor(() => confirms.at(-1) !== q && confirms.at(-1)?.includes('「sub」'), 5000);
    const q3 = confirms.at(-1) ?? '';
    ctl.failList = true;
    clickRow('plain'); treeKeyDown('Delete');
    await waitFor(() => confirms.at(-1) !== q2 && confirms.at(-1)?.includes('「plain」'), 5000);
    const q4 = confirms.at(-1) ?? '';
    ctl.failList = false;
    confirmAnswer = true;
    check(q3.includes('「sub」の中の、木にないもの 4 個(.git・later・new.txt など)も消えます') && q4.includes('「plain」の中を読めなかったので、木にないものも消えることがあります') && ctl.files.has('sub/new.txt'),
      'GR25 A5(P1 の裁定の問 2): 読み込んだ後にほかで足したファイルと空のフォルダも、木にないものとして数に入れる(.git の中の 2 つと合わせて 4 個)。ディスクを読めなければ、消えることがあると書く', `${q3} / ${q4}`);
  }
  // ---- A6: 書き込みが途中で失敗したとき、作りかけのファイルを残さない。同じ名前のやり直しが正しく動く
  {
    const r = {};
    const files = { 'a.sysml': 'package A;\n', 'b.sysml': 'package B;\n', 'sub/c.sysml': 'package C;\n', 'sub/d.txt': 'd\n', 'dst/': null };
    const o = await openFs('a6', files, { hasMove: false, failData: ['n.sysml', 'a のコピー.sysml', 'b2.sysml', 'sub のコピー/d.txt', 'dst/sub/d.txt'] });
    const ctl = o.ctl;
    const na = alerts.length;
    const noZero = () => ![...ctl.files.entries()].some(([, f]) => f.bytes.length === 0);
    // 新しいファイル
    clickRow('a.sysml'); $('btnNewFile').click(); enterName('n.sysml');
    await waitFor(() => alerts.length > na, 5000); await sleep(30);
    r.newFile = !ctl.files.has('n.sysml') && !rowsNow().includes('n.sysml') && /何も変えていません/.test(alerts.at(-1) ?? '');
    // ファイルのコピー
    clickRow('a.sysml'); treeKeyDown('c', { ctrl: true }); treeKeyDown('v', { ctrl: true });
    await waitFor(() => alerts.length > na + 1, 5000); await sleep(30);
    r.copy = !ctl.files.has('a のコピー.sysml') && !rowsNow().includes('a のコピー.sysml');
    // move() のないときの名前の変更
    clickRow('b.sysml'); treeKeyDown('F2'); enterName('b2.sysml');
    await waitFor(() => alerts.length > na + 2, 5000); await sleep(30);
    r.rename = !ctl.files.has('b2.sysml') && ctl.files.has('b.sysml') && rowsNow().includes('b.sysml');
    // フォルダのコピー(途中で失敗。GR25 の P4 の予定の red の 1 で置き換えた: 写す先に作ったものを消し、何も変えていないことを出す。前は、
    // 写し終えたものと残っているものを出し、写し終えたものを木に出した)
    clickRow('sub'); treeKeyDown('c', { ctrl: true }); clickRow('a.sysml'); treeKeyDown('v', { ctrl: true });
    await waitFor(() => alerts.length > na + 3, 5000); await sleep(30);
    r.copyDir = !ctl.dirs.has('sub のコピー') && ![...ctl.files.keys()].some((p) => p.startsWith('sub のコピー/')) && /何も変えていません/.test(alerts.at(-1) ?? '') && !rowsNow().some((p) => p.startsWith('sub のコピー'));
    // フォルダの移動(ドラッグ。途中で失敗し、元を消さない。GR25 の P4 の予定の red の 1 で置き換えた: 写す先のフォルダも消し、何も変えていない
    // ことを出す。前は「元のフォルダは消していません」と、写し終えたもの)
    dragRow('sub', 'dst');
    await waitFor(() => alerts.length > na + 4, 5000); await sleep(30);
    r.moveDir = !ctl.dirs.has('dst/sub') && ctl.files.has('sub/d.txt') && /何も変えていません/.test(alerts.at(-1) ?? '');
    r.noZero = noZero();
    // やり直し(失敗させない)
    ctl.failData = [];
    clickRow('a.sysml'); $('btnNewFile').click(); { const n0 = results.length; enterName('n.sysml'); await opDone(n0); }
    r.retryNew = diskText(ctl, 'n.sysml') === '' && rowsNow().includes('n.sysml');
    await renameRow('b.sysml', 'b2.sysml');
    r.retryRename = diskText(ctl, 'b2.sysml') === 'package B;\n' && !ctl.files.has('b.sysml');
    clickRow('a.sysml'); treeKeyDown('c', { ctrl: true }); { const n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0); }
    r.retryCopy = diskText(ctl, 'a のコピー.sysml') === 'package A;\n';
    check(Object.values(r).every(Boolean), 'GR25 A6: 新しいファイル・ファイルのコピー・move() のないときの名前の変更・フォルダのコピー・移動で書き込みを失敗させても、ディスクに 0 バイトのファイルが残らず、同じ名前でのやり直しが正しく動く', JSON.stringify({ r, disk: diskList(ctl), alerts: alerts.slice(na).map((x) => x.slice(0, 120)) }));
    alerts.splice(na);
  }
  // A6: 作りかけのファイルを消せないとき、残ったものを理由と木に出す
  {
    const o = await openFs('a6r', { 'a.sysml': 'package A;\n' }, { failData: ['n.sysml'], failRemove: ['n.sysml'] });
    const ctl = o.ctl, na = alerts.length;
    clickRow('a.sysml'); $('btnNewFile').click(); enterName('n.sysml');
    await waitFor(() => alerts.length > na, 5000); await sleep(50);
    const m = alerts.at(-1) ?? '';
    check(ctl.files.has('n.sysml') && /作りかけのファイル\(n\.sysml\)を消せず、ディスクに残っています/.test(m) && rowsNow().includes('n.sysml'), 'GR25 A6: 作りかけのファイルを消せなかったときは、残ったもの(相対パス)を理由に書き、木にも出す', `${m} / ${rowsNow().join(',')}`);
    alerts.splice(na);
  }
  check(errors.length === 0 && alerts.length === 0, 'GR25 A: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR25 の検査(--gr25bc。GR25 指示書 4 章の B・C1〜C12): 画面の配置と細かい不具合。配置は、画面のスクリプトが置いた幅(style.width)
// を、src/app/layout.js の決め方と GR22 の版の幅(画面の幅の 38%、最小 260px、右の縁の線 1px を含む)で確かめる(偽の DOM は配置を計算しない)
const GR25BC = process.argv.includes('--gr25bc');
const px = (v) => parseFloat(v ?? 'NaN');
// 今の配置: 木の欄・左の列・テキスト欄・図の欄の幅(木の分割バー 4px・左の列の右の縁の線 1px・真ん中の分割バー 6px)
function layoutNow() {
  const W = window.innerWidth, left = px($('left').style.width);
  const tree = $('tree')._cls.has('folded') ? 28 : px($('tree').style.width);
  return { W, left, tree, text: left - tree - 4 - 1, right: W - left - 6 };
}
const gr22Text = (W) => Math.max(260, W * 0.38) - 1;
function resizeTo(W, H = 700) { window.innerWidth = W; window.innerHeight = H; for (const h of winLs.resize ?? []) h({ type: 'resize' }); }
function dragBar(id, x) {
  $(id).dispatchEvent({ type: 'mousedown', target: $(id), preventDefault() {} });
  for (const h of winLs.mousemove ?? []) h({ type: 'mousemove', clientX: x, clientY: 100 });
  for (const h of winLs.mouseup ?? []) h({ type: 'mouseup' });
}
const tmText2 = () => $('treeMsg').children.find((c) => c._cls.has('tmtext'))?.textContent ?? '';
async function gr25b() {
  // ---- B: 初めの幅(木の欄があるときのテキスト欄が、GR22 の版と同じ)
  const r = {};
  for (const W of [1024, 1280]) {
    resizeTo(W);
    const l = layoutNow();
    r[`init${W}`] = Math.abs(l.text - gr22Text(W)) <= 2 && l.tree === 200 && Math.abs(l.right - (W - 6 - gr22Text(W) - 1 - 205 + 1)) <= 2 ? 'ok' : JSON.stringify({ l, want: gr22Text(W) });
  }
  // 畳むと左の列をその分狭め、テキスト欄の幅を保つ
  {
    resizeTo(1024);
    const a = layoutNow();
    $('btnFold').click();
    const b = layoutNow();
    $('btnFold').click();
    const c = layoutNow();
    r.fold = Math.abs(b.text - a.text) < 0.01 && Math.abs(a.left - b.left - (200 - 28)) < 0.01 && Math.abs(c.text - a.text) < 0.01 ? 'ok' : JSON.stringify({ a, b, c });
  }
  check(Object.values(r).every((x) => x === 'ok'), 'GR25 B1: 画面の幅 1024・1280 で、木の欄があるときのテキスト欄の初めの幅が GR22 の版と同じ(差 2px 以内)。木の欄を畳むと、左の列をその分狭め、テキスト欄の幅を保つ', JSON.stringify(r));
  // ---- B2: 分割バーを端まで引いても、テキスト欄 240px・図の欄 320px が残り、真ん中の分割バーを掴める
  const g = {};
  for (const W of [1024, 1280]) {
    resizeTo(W);
    dragBar('treeSplit', W + 50);
    const a = layoutNow();
    dragBar('splitter', W + 50);
    const b = layoutNow();
    dragBar('splitter', -50);
    const c = layoutNow();
    dragBar('treeSplit', -50);
    const d = layoutNow();
    // 引いた後も、真ん中の分割バーが画面の中にある(左端が 0 以上、右端が画面の幅以下)
    const grab = (l) => l.left >= 0 && l.left + 6 <= W;
    g[W] = a.text >= 240 - 0.01 && a.right >= 320 - 0.01 && b.right >= 320 - 0.01 && b.text >= 240 - 0.01 && c.text >= 240 - 0.01 && d.tree >= 120 && d.text >= 240 - 0.01 && [a, b, c, d].every(grab) ? 'ok' : JSON.stringify({ a, b, c, d });
  }
  // 画面が狭くて両方を守れないときは、テキスト欄を優先する。広げ直すと、望んだ幅に戻る
  {
    resizeTo(1280);
    dragBar('splitter', 900);
    const a = layoutNow();
    resizeTo(600);
    const b = layoutNow();
    resizeTo(1280);
    const c = layoutNow();
    resizeTo(1024);
    g.narrow = b.text >= 240 - 0.01 && b.text < a.text && Math.abs(c.text - a.text) < 0.01 && b.left + 6 <= 600 + 0.01 ? 'ok' : JSON.stringify({ a, b, c });
  }
  check(Object.values(g).every((x) => x === 'ok'), 'GR25 B2: 木の分割バーと真ん中の分割バーを左右の端まで引いても、テキスト欄 240px・図の欄 320px が残り、真ん中の分割バーが画面の中にある(1024・1280)。画面が狭いときはテキスト欄を優先し、広げ直すと引いた幅に戻る', JSON.stringify(g));
}
async function gr25c() {
  // ---- C1: 再読み込みで中身を読む待ちの間に打った文字を、読み直しで消さない
  {
    const o = await openFs('c1', { 'a.sysml': 'package A;\n', 'b.sysml': 'package B;\n' });
    const ctl = o.ctl;
    extWrite(ctl, 'a.sysml', 'package A2;\n');
    let open; ctl.readGate = new Promise((res) => { open = res; });
    $('btnReload').click();
    await sleep(30);
    clickRow('a.sysml');
    const A = areaOf('a.sysml');
    caretAt(A, 0); typeChars(A, '//c');
    ctl.readGate = null; open();
    await waitFor(() => /ディスクから読み直しました/.test($('treeMsg').textContent), 5000);
    await sleep(30);
    const kept = A.value === '//cpackage A;\n' && rowOf('a.sysml')?.cls.includes('dirty');
    const qs = await saveNow(false);
    check(kept && qs.some((q) => q.startsWith('ファイル「a.sysml」は、読み込んだ後にほかで変えられています')) && diskText(ctl, 'a.sysml') === 'package A2;\n',
      'GR25 C1: 再読み込みで中身を読む待ちの間に書き換えたファイルは読み直さず、書き換えたまま保存していないファイルとして扱う(保存でほかでの変更の確認が出る)', JSON.stringify({ v: A.value, qs }));
  }
  // ---- C2・C12: 読み込んだ .gitignore などは、名前の規則をかけずに、ドラッグ・コピー・削除できる。移す先の名前の重なりだけを確かめる
  {
    const o = await openFs('c2', { '.gitignore': 'out/\n', 'x.txt': 'x\n', 'sub/x.txt': 'y\n', 'a.sysml': 'package A;\n' });
    const ctl = o.ctl, na = alerts.length;
    { const n0 = results.length; dragRow('.gitignore', 'sub'); await opDone(n0); }
    const movedOk = diskText(ctl, 'sub/.gitignore') === 'out/\n' && !ctl.files.has('.gitignore') && rowsNow().includes('sub/.gitignore');
    dragRow('x.txt', 'sub');
    await waitFor(() => alerts.length > na, 3000);
    const clash = /移す先に同じ名前の「x\.txt」があります/.test(alerts.at(-1) ?? '') && ctl.files.has('x.txt');
    alerts.splice(na);
    clickRow('sub/.gitignore'); treeKeyDown('c', { ctrl: true });
    { const n0 = results.length; treeKeyDown('v', { ctrl: true }); await opDone(n0); }
    const copied = diskText(ctl, 'sub/.gitignore のコピー') === 'out/\n';
    confirmAnswer = true;
    clickRow('sub/.gitignore');
    { const n0 = results.length; treeKeyDown('Delete'); await sleep(30); await opDone(n0); }
    const removed = !ctl.files.has('sub/.gitignore');
    check(movedOk && clash && copied && removed, 'GR25 C2・C12: 名前が . で始まる読み込んだファイル(.gitignore)を、名前の規則をかけずにドラッグで移せ、コピー・削除もできる。ドラッグでは移す先の名前の重なりだけを確かめる', JSON.stringify({ movedOk, clash, copied, removed, disk: diskList(ctl) }));
    // C12: 予約名・末尾の . ・空白の名前は、理由を出して断る(新しいファイルと名前の変更)
    const bad = [['CON.sysml', '予約名'], ['nul', '予約名'], ['Com1.txt', '予約名'], ['lpt9.tar.gz', '予約名'], ['a.', '末尾を「.」'], ['b ', '末尾を「空白」']];
    const got = [];
    const l0 = ctl.log.length;
    for (const [nm, want] of bad) {
      clickRow('a.sysml'); $('btnNewFile').click(); await sleep(10);
      enterName(nm); await sleep(10);
      got.push([nm, nameWhy().includes(want)]);
      enterName('', 'Escape');
    }
    clickRow('a.sysml'); treeKeyDown('F2'); await sleep(10); enterName('aux.sysml'); await sleep(10);
    got.push(['aux.sysml(名前の変更)', nameWhy().includes('予約名')]);
    enterName('', 'Escape');
    check(got.every((x) => x[1]) && ctl.log.length === l0, 'GR25 C12: Windows の予約名(CON・NUL・COM1・LPT9。大文字・小文字を区別せず、拡張子を除いた部分)と、末尾が . か空白の名前は、新しいファイル・名前の変更で理由を出して断る', JSON.stringify(got));
  }
  // ---- C3: ファイルの操作・保存の途中で Enter を押すと、入力欄を閉じずに理由を出す(入力した名前を保つ)
  {
    const o = await openFs('c3', { 'a.sysml': 'package A;\n', 'b.sysml': 'package B;\n' });
    const ctl = o.ctl;
    clickRow('b.sysml'); treeKeyDown('F2'); await sleep(10);
    let open; ctl.readGate = new Promise((res) => { open = res; });
    $('btnReload').click();
    await sleep(20);
    enterName('b9.sysml');
    await sleep(20);
    const busyKept = !!nameInput() && nameInput().value === 'b9.sysml' && /ファイルの操作の途中です/.test(nameWhy());
    ctl.readGate = null; open();
    await waitFor(() => /ディスクから読み直しました/.test($('treeMsg').textContent), 5000);
    await sleep(30);
    const n0 = results.length;
    enterName(nameInput()?.value ?? 'b9.sysml');
    await opDone(n0);
    const done1 = diskText(ctl, 'b9.sysml') === 'package B;\n';
    // 保存の途中
    await editFile('a.sysml', '//s');
    let open2; ctl.gate = new Promise((res) => { open2 = res; });
    $('btnSave').click();
    await sleep(20);
    clickRow('b9.sysml'); treeKeyDown('F2'); await sleep(10);
    enterName('b8.sysml');
    await sleep(20);
    const saveKept = !!nameInput() && nameInput().value === 'b8.sysml' && /保存の途中です/.test(nameWhy());
    ctl.gate = null; open2();
    await waitFor(() => /上書き保存しました/.test(fileMsgText()), 5000);
    const n1 = results.length;
    enterName('b8.sysml');
    await opDone(n1);
    check(busyKept && done1 && saveKept && diskText(ctl, 'b8.sysml') === 'package B;\n', 'GR25 C3: ファイルの操作(再読み込み)・保存の途中に名前の入力欄で Enter を押すと、入力欄を閉じずに理由を出し、入力した名前を保つ(終わってから Enter で決められる)', JSON.stringify({ busyKept, done1, saveKept, why: nameWhy(), disk: diskList(ctl) }));
  }
  // ---- C4: UTF-8 として読めなかった .sysml を、ディスクで直してから再読み込みすると読み直す
  {
    const o = await openFs('c4', { 'a.sysml': 'package A;\n' });
    const ctl = o.ctl;
    ctl.files.set('bad.sysml', { bytes: new Uint8Array([0x70, 0xff, 0x0a]), lastModified: ++ctl.clock });
    await reloadNow();
    const dim = rowOf('bad.sysml')?.cls.includes('dim');
    extWrite(ctl, 'bad.sysml', 'package Bad;\n');
    const n0 = results.length;
    await reloadNow();
    const r = await waitFor(() => results.slice(n0).findLast((x) => x.text === treeKey()), 30000);
    check(dim && !rowOf('bad.sysml')?.cls.includes('dim') && areaOf('bad.sysml')?.value === 'package Bad;\n' && !!r && r.m.folder.files.map((f) => f.path).includes('bad.sysml'), 'GR25 C4: UTF-8 として読めなかった .sysml を、ディスクで直してから再読み込みすると、読み直して .sysml として扱う(モデルに入る)', JSON.stringify({ dim, cls: rowOf('bad.sysml')?.cls, files: r?.m.folder.files.map((f) => f.path) }));
  }
  // ---- C6: 名前の入力欄の行の上でのドラッグは何もしない(エラーを出さない)
  {
    await openFs('c6', { 'a.sysml': 'package A;\n', 'sub/b.sysml': 'package B;\n' });
    clickRow('sub'); $('btnNewFile').click(); await sleep(10);
    const inp = nameInput();
    const e0 = errors.length, rows0 = rowsNow().join(',');
    let thrown = null;
    try {
      const dt = { types: ['text/plain'], setData() {}, effectAllowed: '' };
      const ev = (type, target) => ({ type, target, dataTransfer: dt, preventDefault() {}, stopPropagation() {} });
      $('treeBody').dispatchEvent(ev('dragstart', rowOf('a.sysml').el));
      $('treeBody').dispatchEvent(ev('dragover', inp));
      $('treeBody').dispatchEvent(ev('drop', inp));
      $('treeBody').dispatchEvent(ev('dragend', rowOf('a.sysml').el));
    } catch (e) { thrown = e?.message ?? String(e); }
    await sleep(30);
    const same = rowsNow().join(',') === rows0;
    enterName('', 'Escape');
    check(thrown === null && errors.length === e0 && same, 'GR25 C6: 名前の入力欄の行の上にドラッグしても、エラーを出さず何もしない', JSON.stringify({ thrown, errs: errors.slice(e0), same }));
  }
  // ---- C7: 右クリックのメニューを画面の中に収める(偽の DOM のメニューの大きさは 160 × 項目の数 × 24px とする)
  {
    await openFs('c7', { 'a.sysml': 'package A;\n', 'sub/b.sysml': 'package B;\n' });
    const realRect = FakeEl.prototype.getBoundingClientRect;
    FakeEl.prototype.getBoundingClientRect = function () { return this.id === 'treeMenu' ? { left: 0, top: 0, right: 160, bottom: this.children.length * 24, width: 160, height: this.children.length * 24 } : realRect.call(this); };
    resizeTo(1024, 700);
    const at = (x, y) => {
      $('treeBody').dispatchEvent({ type: 'contextmenu', target: rowOf('sub').el, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
      const m = body.children.find((c) => c.id === 'treeMenu');
      const v = m ? { x: px(m.style.left), y: px(m.style.top), w: 160, h: m.children.length * 24 } : null;
      m?.remove();
      return v;
    };
    const inside = (v) => v && v.x >= 0 && v.y >= 0 && v.x + v.w <= 1024 && v.y + v.h <= 700;
    const a = at(1010, 690), b = at(10, 10), c = at(500, 650);
    FakeEl.prototype.getBoundingClientRect = realRect;
    check(inside(a) && inside(b) && inside(c) && b.x === 10 && b.y === 10 && a.x < 1010 && a.y < 690, 'GR25 C7: 右クリックのメニューは画面の中に収まる(右下の隅では左上に開き、収まるところではクリックした位置に開く)', JSON.stringify({ a, b, c }));
  }
  // ---- C8・C10・C11: 名前の入力欄の焦点・空の名前・選ぶ範囲
  {
    const o = await openFs('c8', { 'a.sysml': 'package A;\n', 'noext': 'n\n', '.gitignore': 'x\n', 'sub/b.sysml': 'package B;\n' });
    const ctl = o.ctl;
    // C11: 選ぶ範囲
    const selOf = async (p, how = 'F2') => { clickRow(p); if (how === 'F2') treeKeyDown('F2'); else $('btnNewFile').click(); await sleep(20); const i = nameInput(); const v = i ? [i.value, i.selectionStart, i.selectionEnd] : null; enterName('', 'Escape'); return v; };
    const s1 = await selOf('a.sysml'), s2 = await selOf('sub'), s3 = await selOf('.gitignore'), s4 = await selOf('noext'), s5 = await selOf('a.sysml', 'new');
    check(JSON.stringify([s1, s2, s3, s4, s5]) === JSON.stringify([['a.sysml', 0, 1], ['sub', 0, 3], ['.gitignore', 0, 10], ['noext', 0, 5], ['', 0, 0]]),
      'GR25 C11: 名前の変更の入力欄は、ファイルは最後の . の前まで(. がない・先頭だけなら全体)、フォルダは全体を選ぶ。新しいファイルの入力欄は空', JSON.stringify([s1, s2, s3, s4, s5]));
    // C8: Enter で決めたら焦点を木に戻し、決めた項目を選ぶ。続けて F2・Delete が効く
    clickRow('a.sysml'); treeKeyDown('F2'); await sleep(20);
    // (opDone は木を開くために項目をクリックして選ぶ項目を変えるので、ここでは知らせを待つ)
    enterName('a1.sysml');
    await waitFor(() => /名前を変えました/.test(tmText2()), 5000); await sleep(30);
    const f1 = document.activeElement === $('tree') && rowOf('a1.sysml')?.cls.includes('sel');
    treeKeyDown('F2'); await sleep(20);
    const f2 = nameInput()?.value === 'a1.sysml';
    enterName('', 'Escape');
    const f3 = document.activeElement === $('tree') && rowOf('a1.sysml')?.cls.includes('sel') && !nameInput();
    confirmAnswer = false;
    const k = confirms.length;
    treeKeyDown('Delete');
    await waitFor(() => confirms.length > k, 3000);
    const f4 = (confirms.at(-1) ?? '').startsWith('ファイル「a1.sysml」を削除しますか?');
    confirmAnswer = true;
    // 焦点が外れて閉じたとき(木の外へのクリック): 焦点をそこに残す
    clickRow('noext'); treeKeyDown('F2'); await sleep(20);
    const i = nameInput(); i.value = 'noext2';
    $('src').focus();
    { const n0 = results.length; i.dispatchEvent({ type: 'blur' }); await opDone(n0); }
    const f5 = document.activeElement === $('src') && ctl.files.has('noext2');
    check(f1 && f2 && f3 && f4 && f5, 'GR25 C8: 名前の入力欄を Enter・Esc で閉じたら焦点を木に戻し、決めた項目(やめたときは元の項目)を選び、続けて F2・Delete が効く。焦点が木の外へ外れて閉じたときは、焦点をそこに残す', JSON.stringify({ f1, f2, f3, f4, f5, act: document.activeElement?.id ?? document.activeElement?.tagName }));
    // C10: 名前が空のまま焦点が外れたら、やめる(理由を出さない)。Enter で空なら理由を出して入力欄に戻す
    clickRow('sub'); $('btnNewFile').click(); await sleep(20);
    const l0 = ctl.log.length;
    const j = nameInput(); j.value = ''; j.dispatchEvent({ type: 'blur' }); await sleep(30);
    const c10a = !nameInput() && tmText2() === '' && ctl.log.length === l0;
    clickRow('sub'); $('btnNewFile').click(); await sleep(20);
    enterName(''); await sleep(30);
    const c10b = !!nameInput() && nameWhy() === '名前が空です';
    enterName('', 'Escape');
    check(c10a && c10b, 'GR25 C10: 名前が空のまま焦点が外れたら、理由を出さずにやめる。Enter で空なら、今までどおり理由を出して入力欄に戻す', JSON.stringify({ c10a, c10b, msg: tmText2(), why: nameWhy() }));
  }
  // ---- C9: フォルダをコピーした後にそのフォルダを消して貼り付けると、ファイルのときと同じく理由を出す
  {
    await openFs('c9', { 'a.sysml': 'package A;\n', 'sub/b.sysml': 'package B;\n' });
    const res = {};
    for (const p of ['sub', 'a.sysml']) {
      clickRow(p); treeKeyDown('c', { ctrl: true });
      confirmAnswer = true;
      { const n0 = results.length; treeKeyDown('Delete'); await sleep(30); await opDone(n0); }
      clickRow(rowsNow()[0]);
      const na = alerts.length;
      treeKeyDown('v', { ctrl: true });
      await sleep(50);
      res[p] = /貼り付けるものがありません/.test(tmText2()) && $('treeMsg')._cls.has('fail');
      alerts.splice(na);
    }
    check(res.sub && res['a.sysml'], 'GR25 C9: コピーしたフォルダを消してから貼り付けると、ファイルのときと同じく理由(貼り付けるものがありません)を出す', JSON.stringify({ res, msg: tmText2() }));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR25 B・C: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR25 の P4 の検査(--gr25k。GR25 指示書 v25.2 の 3.1 節・3.2 節の K・B): src/app/main.js の代わりに、ビルドした HTML の中のスクリプト
// (tools/build/build.mjs の buildHtml で、1 つにまとめた HTML をその場で作ったもの。--html <パス> なら、そのファイル)を動かし、ページを
// 開いた直後・畳んだ後・開き直した後・resize の後に、#left と #tree の style.width が数値の px(NaN・undefined でない)で、
// src/app/layout.js の widths の値と同じことを確かめる。続けて、--gr25bc の B1・B2 を同じスクリプトで流す
// ---- GR25 の P4 の検査(--gr25f。GR25 指示書 v25.2 の 3.3 節の F): フォルダの名前の変更・移動・コピーで、2 つ目のファイルの書き込みを失敗
// させたとき、ディスクが操作の前と同じ(写す先のフォルダもない)こと。写す先のフォルダを消せないようにしたときは、それが理由と木に出ること
const GR25K = process.argv.includes('--gr25k'), GR25F = process.argv.includes('--gr25f');
const widthWrites = []; // #left・#tree の style.width に書いた値(--gr25k)
if (GR25K) for (const id of ['left', 'tree']) $(id).style = new Proxy({}, { set(t, k, v) { if (k === 'width') widthWrites.push(`${id}=${v}`); t[k] = v; return true; } });
async function loadBuilt() {
  const vm = await import('node:vm');
  const i = process.argv.indexOf('--html');
  let html;
  if (i > 0) html = fs.readFileSync(process.argv[i + 1], 'utf8');
  else { const { buildHtml } = await import('../../tools/build/build.mjs'); html = buildHtml(cfg.outputs.find((o) => o.publish)); }
  const a = html.lastIndexOf('<script>\n'), b = html.indexOf('\n</script>', a);
  if (a < 0 || b < 0) throw new Error('ビルドした HTML にスクリプトがない');
  // ビルドした HTML のスクリプトは、WORKER_SOURCE などを自分で const で決める(大域に置いた偽物の値は使わない)。Worker は偽物のまま
  vm.runInThisContext(html.slice(a + '<script>\n'.length, b), { filename: i > 0 ? process.argv[i + 1] : 'index.html(その場でビルド)' });
}
async function gr25k() {
  const { widths } = await import('../../src/app/layout.js');
  const pxOk = (v) => /^\d+(\.\d+)?px$/.test(v ?? '');
  const want = (W, folded) => widths({ W, tree: 200, folded, text: null });
  const now = () => ({ left: $('left').style.width, tree: $('tree').style.width, folded: $('tree')._cls.has('folded') });
  const same = (n, w) => pxOk(n.left) && pxOk(n.tree) && Math.abs(parseFloat(n.left) - w.left) < 0.01 && n.tree === '200px';
  const r = {};
  // ページを開いた直後(偽の window の幅 1600)
  { const n = now(); r.open = same(n, want(1600, false)) && !n.folded ? 'ok' : JSON.stringify({ n, want: want(1600, false) }); }
  // 畳んだ後・開き直した後(1600)
  { $('btnFold').click(); const n = now(); r.fold = same(n, want(1600, true)) && n.folded ? 'ok' : JSON.stringify({ n, want: want(1600, true) }); }
  { $('btnFold').click(); const n = now(); r.unfold = same(n, want(1600, false)) && !n.folded ? 'ok' : JSON.stringify({ n, want: want(1600, false) }); }
  // resize の後(1024。指示書 2 章のアシスタントの実測の値: 左の列 593.12px、畳むと 421.12px)、畳む・開き直す
  for (const W of [1024, 800, 1280, 1920]) {
    resizeTo(W);
    const a = now();
    $('btnFold').click(); const b = now();
    $('btnFold').click(); const c = now();
    r[`resize${W}`] = same(a, want(W, false)) && same(b, want(W, true)) && b.folded && same(c, want(W, false)) ? 'ok' : JSON.stringify({ a, b, c, want: [want(W, false).left, want(W, true).left] });
  }
  resizeTo(1024);
  r.at1024 = $('left').style.width === '593.12px' ? 'ok' : $('left').style.width;
  { $('btnFold').click(); r.fold1024 = $('left').style.width === '421.12px' ? 'ok' : $('left').style.width; $('btnFold').click(); }
  const bad = widthWrites.filter((x) => !pxOk(x.split('=')[1]));
  r.writes = widthWrites.length > 0 && bad.length === 0 ? 'ok' : `書いた ${widthWrites.length} 回、数値の px でないもの: ${bad.slice(0, 5).join(', ')}`;
  check(Object.values(r).every((x) => x === 'ok'), 'GR25 K・B: ビルドした HTML のスクリプトで、ページを開いた直後・畳んだ後・開き直した後・resize の後(800・1024・1280・1920)に、#left と #tree の style.width が数値の px で、layout.js の widths の値と同じ(1024 で左の列 593.12px、畳むと 421.12px)', JSON.stringify(r));
  await gr25b();
  check(errors.length === 0 && alerts.length === 0, 'GR25 K・B: ビルドした HTML のスクリプトを動かして、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}
// フォルダ「sub」(中に inner/c.sysml・a.sysml・b.txt。写す順は inner/、inner/c.sysml、a.sysml、b.txt)と、移す先のフォルダ「dst」
const F25_FILES = { 'sub/inner/c.sysml': 'package C;\n', 'sub/a.sysml': 'package A;\n', 'sub/b.txt': 'b\n', 'top.sysml': 'package T;\n', 'dst/': null };
async function gr25f() {
  const ops = {
    名前の変更: { dst: 'sub2', run: () => { clickRow('sub'); treeKeyDown('F2'); enterName('sub2'); }, head: 'フォルダ「sub」を「sub2」に名前を変えられませんでした' },
    移動: { dst: 'dst/sub', run: () => dragRow('sub', 'dst'), head: 'フォルダ「sub」を「dst/sub」に移せませんでした' },
    コピー: { dst: 'sub のコピー', run: () => { clickRow('sub'); treeKeyDown('c', { ctrl: true }); clickRow('top.sysml'); treeKeyDown('v', { ctrl: true }); }, head: 'フォルダ「sub」を「sub のコピー」に写せませんでした' },
  };
  for (const [what, op] of Object.entries(ops)) {
    // 2 つ目のファイル(a.sysml)の書き込みを失敗させる: ディスクは操作の前と同じ。木も前と同じ
    {
      const o = await openFs(`f-${what}`, F25_FILES, { failData: [`${op.dst}/a.sysml`] });
      const ctl = o.ctl;
      const disk0 = diskList(ctl), bytes0 = new Map([...ctl.files].map(([p, f]) => [p, f.bytes.slice()]));
      const rows0 = rowsNow();
      const na = alerts.length;
      op.run();
      await waitFor(() => alerts.length > na, 10000); await sleep(30);
      const a = alerts.at(-1) ?? '';
      const disk1 = diskList(ctl);
      const sameDisk = JSON.stringify(disk1) === JSON.stringify(disk0) && [...bytes0].every(([p, b]) => bytesEq(ctl.files.get(p)?.bytes, b));
      const wrote = ctl.log.some((x) => x.startsWith(`create:${op.dst}/`)); // 写す先に作ってから消した
      check(sameDisk && wrote && !ctl.dirs.has(op.dst) && JSON.stringify(rowsNow()) === JSON.stringify(rows0) && a.startsWith(op.head) && /何も変えていません\(写す先に作ったものは消しました\)$/.test(a) && !/写し終えたもの/.test(a) && $('treeMsg')._cls.has('fail'),
        `GR25 F: フォルダの${what}で 2 つ目のファイルの書き込みを失敗させると、写す先に作ったもの(フォルダを含む)を消し、ディスクと木が操作の前と同じで、「何も変えていません」を出す`, JSON.stringify({ a, disk1, rows: rowsNow(), log: ctl.log.slice(-12) }));
      alerts.splice(na);
    }
    // 写す先のフォルダも消せないようにする: 消せなかったフォルダを理由と木に出す(中に写したファイルは消す)
    {
      const o = await openFs(`fr-${what}`, F25_FILES, { failData: [`${op.dst}/a.sysml`], failRemove: [op.dst] });
      const ctl = o.ctl;
      const disk0 = diskList(ctl);
      const na = alerts.length;
      op.run();
      await waitFor(() => alerts.length > na, 10000); await sleep(30);
      const a = alerts.at(-1) ?? '';
      const disk1 = diskList(ctl);
      const onlyDst = JSON.stringify(disk1) === JSON.stringify([...disk0, `${op.dst}/`].sort(cmpPaths));
      const rows = rowsNow();
      const shown = rows.includes(op.dst) && !rows.some((p) => p.startsWith(`${op.dst}/`)) && rows.includes('sub/a.sysml');
      check(onlyDst && shown && a.startsWith(op.head) && a.includes(`写す先に作ったもののうち、消せずにディスクに残っているもの(1): ${op.dst}/(`) && /木にも出しました$/.test(a) && a.includes('元のフォルダは消していません') === (what !== 'コピー'),
        `GR25 F: フォルダの${what}で、写す先のフォルダを消せないときは、そのフォルダだけがディスクに残り、それを理由と木に出す(中に写したファイルは消す)`, JSON.stringify({ a, disk1, rows }));
      alerts.splice(na);
    }
  }
  // 入れ子のファイルも消せないとき: 残ったもの(そのファイルと、空でないので消せない親のフォルダ)をすべて理由と木に出す
  {
    const o = await openFs('fr-deep', F25_FILES, { failData: ['sub2/a.sysml'], failRemove: ['sub2/inner/c.sysml'] });
    const ctl = o.ctl;
    const na = alerts.length;
    clickRow('sub'); treeKeyDown('F2'); enterName('sub2');
    await waitFor(() => alerts.length > na, 10000); await sleep(30);
    const a = alerts.at(-1) ?? '';
    const rows = rowsNow();
    const left = ['sub2/', 'sub2/inner/', 'sub2/inner/c.sysml'];
    check(left.every((p) => (p.endsWith('/') ? ctl.dirs.has(p.slice(0, -1)) : ctl.files.has(p))) && !ctl.files.has('sub2/a.sysml') && a.includes(`消せずにディスクに残っているもの(3): ${left.join('、')}(`) && ['sub2', 'sub2/inner', 'sub2/inner/c.sysml'].every((p) => rows.includes(p)),
      'GR25 F: 写したファイルを消せないときは、そのファイルと、空でないので消せない親のフォルダを、理由と木に出す', JSON.stringify({ a, disk: diskList(ctl), rows }));
    alerts.splice(na);
  }
  // 失敗の後に、同じ名前でのやり直しが正しく動く(写す先が残っていないので、同じ名前で作れる)
  {
    const o = await openFs('f-retry', F25_FILES, { failData: ['sub2/a.sysml'] });
    const ctl = o.ctl;
    const na = alerts.length;
    clickRow('sub'); treeKeyDown('F2'); enterName('sub2');
    await waitFor(() => alerts.length > na, 10000); await sleep(30);
    alerts.splice(na);
    ctl.failData = [];
    await renameRow('sub', 'sub2');
    check(diskText(ctl, 'sub2/a.sysml') === 'package A;\n' && diskText(ctl, 'sub2/inner/c.sysml') === 'package C;\n' && !ctl.dirs.has('sub') && rowsNow().includes('sub2/a.sysml') && alerts.length === na,
      'GR25 F: 失敗の後に、同じ名前でのやり直しの名前の変更が正しく動く', JSON.stringify({ disk: diskList(ctl), alerts: alerts.slice(na) }));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR25 F: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR26 の検査(GR26 指示書 4 章の L・T。設計書 9.5 節)。試しのフォルダ「懐中電灯_モデル」(tools/model/gr26_folder.mjs の FILES)を、
// 書き込みを記録する偽のフォルダのハンドル fakeFs で開いて確かめる
//   --gr26lt  L(区画の開閉・localStorage・分割バー・1 ファイルのときの 2 つの区画・配置の幅)と T(木の形・並べる要素・項目の表示・名前の
//             ない要素の要約・同じ名前の別の要素・標準ライブラリを並べない・解析し直した後の開閉と選択・大きなモデルの開閉の時間)
//   --gr26ls  ページを開いた直後の区画の開閉(--ls の覚え・覚えなし・--lsthrow の例外)
const GR26LT = process.argv.includes('--gr26lt'), GR26LS = process.argv.includes('--gr26ls');
const { FILES: G26_FILES, NAME: G26_NAME } = await import('../../tools/model/gr26_folder.mjs');
const { widths: g26widths } = await import('../../src/app/layout.js');
// モデルツリーの行(画面が作ったもの)。→ [{ id, depth, name, du, kind, types, mult, title, cls, el }]
const mrows = () => ($('modelBody')?.children ?? []).filter((c) => c._cls.has('mrow')).map((r) => {
  const t = (cls) => r.children.find((x) => x._cls.has(cls));
  return { id: r.dataset.id, depth: Math.round((parseFloat(r.style.paddingLeft) - 4) / 12), name: t('nm')?.textContent ?? '', du: t('mdu')?.textContent ?? '', duCls: t('mdu') ? [...t('mdu')._cls] : [], kind: t('mkd')?.textContent ?? '',
    types: t('mty')?.textContent ?? '', mult: t('mmu')?.textContent ?? '', twisty: t('tw')?.textContent ?? '', title: r.title, cls: [...r._cls], el: r };
});
// 行の名前と、マウスを載せたときの修飾名で行を探す(q を省けば名前だけ)
const mrow = (name, q = null) => mrows().find((r) => r.name === name && (!q || r.title.split('\n')[0] === q)) ?? null;
// GR26 T の大きなモデル(要素 3,302。GR27 P5 で --gr27p5 --dump でも使う)。g26Click は、名前の行が並んでいなければ、全部の行(p5Full)での位置まで
// スクロールしてから押す(GR27 P5 の M。直す前のコードは全部の行を並べるので、すぐに見つかる)
const G26BIG_N = 300, G26BIG_P = 10;
function g26Big() {
  const big = [`package Big {\n    port def Pin;`];
  for (let i = 0; i < G26BIG_N; i++) { big.push(`    part def D${i} {`); for (let j = 0; j < G26BIG_P; j++) big.push(`        port p${j} : Pin;`); big.push('    }'); }
  big.push('}');
  return big.join('\n') + '\n';
}
const g26Row = (r) => `${r.depth}|${r.name}|${r.twisty}`;
function g26Want(openAll) {
  const w = ['0|Big|▾', '1|Pin|'];
  for (let i = 0; i < G26BIG_N; i++) { w.push(`1|D${i}|${openAll ? '▾' : '▸'}`); if (openAll) for (let j = 0; j < G26BIG_P; j++) w.push(`2|p${j}|`); }
  return w;
}
function g26Click(name) {
  let r = mrow(name);
  if (!r) { const k = p5Full().findIndex((x) => x.name === name); if (k >= 0) { p5Scroll(k * MH); r = mrow(name); } }
  mclick(r, 'tw');
}
// 行の一部をクリックする(偽の DOM は出来事を親に伝えないので、モデルの本体に、行の中の要素を target にして起こす)
function mclick(r, part = null) {
  if (!r) return false;
  const target = part ? r.el.children.find((x) => x._cls.has(part)) ?? r.el : r.el.children.find((x) => x._cls.has('nm')) ?? r.el;
  $('modelBody').dispatchEvent({ type: 'click', target, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {} });
  return true;
}
// 閉じた項目を開く(名前と修飾名で)
function mopen(name, q = null) { const r = mrow(name, q); if (r && r.twisty === '▸') mclick(r, 'tw'); return !!mrow(name, q); }
const secFolded = (id) => $(id)?._cls.has('sfold');
const lastResult = () => results.at(-1)?.m ?? null;
const g26Open = async (extra = {}) => openFs(G26_NAME, { ...G26_FILES, ...extra });
async function gr26lt() {
  // ---- L: 1 ファイル(ページを開いた直後)のときも 2 つの区画が出る。「ファイル」の区画はフォルダを開いていない形、「モデル」の区画の下に参照箇所の欄
  {
    const kids = $('tree').children.map((c) => c.id || c.className);
    const files = $('secFiles'), model = $('secModel');
    const inFiles = (id) => files?.contains($(id));
    const r = {
      order: JSON.stringify(kids.slice(-3)) === JSON.stringify(['secFiles', 'secSplit', 'secModel']) ? 'ok' : kids.join(','),
      heads: $('btnSecFiles')?.textContent === '▾ファイル' && $('btnSecModel')?.textContent === '▾モデル' ? 'ok' : `${$('btnSecFiles')?.textContent} / ${$('btnSecModel')?.textContent}`,
      files: inFiles('treeEmpty') && inFiles('treeBody') && inFiles('treeMsg') && /フォルダを開いていません/.test($('treeEmpty').textContent) && !$('treeEmpty').hidden ? 'ok' : 'ファイルの区画の中身が違う',
      model: model?.contains($('modelBody')) && model.contains($('refPane')) && model.contains($('btnModelCollapse')) ? 'ok' : 'モデルの区画の中身が違う',
      guide: $('refBody')?.textContent === 'モデルで要素を選ぶと、参照している箇所を出します' ? 'ok' : $('refBody')?.textContent,
      band: $('tree').children.indexOf($('treeName')) < $('tree').children.indexOf(files) || !$('tree').contains($('treeName')) ? 'ok' : 'フォルダの名前が区画の下にある',
    };
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 L: 1 つのファイルのときも、木の欄に「ファイル」「モデル」の 2 つの区画(見出しの行に開閉の印)と境目の分割バーが出る。「ファイル」は「フォルダを開いていません」の形、「モデル」の下に参照箇所の欄と案内、上の帯に「すべて折りたたむ」', JSON.stringify(r));
  }
  // 1 つのファイル(例を読み込む)のときのモデルツリー
  {
    const r1 = (await pickSample('機能紹介')).r;
    const top = mrows().filter((x) => x.depth === 0).map((x) => x.name);
    check(!!r1 && JSON.stringify(top) === JSON.stringify(['見守りシステムの例']) && mrows().some((x) => x.depth === 1 && x.name === '見守りシステム') && /フォルダを開いていません/.test($('treeEmpty').textContent),
      'GR26 L・T: 1 つのファイル(例)のときも、「ファイル」の区画は「フォルダを開いていません」のまま、「モデル」の区画にモデルツリー(根の要素を開いた形)を出す', top.join(','));
  }
  // ---- L: 区画の開閉と localStorage(覚えなしで始め、押すと覚える)
  {
    const r = {};
    r.start = !secFolded('secFiles') && !secFolded('secModel') && lsStore.get('sysmlv2.filesFolded') === undefined ? 'ok' : `${secFolded('secFiles')} ${secFolded('secModel')}`;
    $('btnSecFiles').click();
    r.fold = secFolded('secFiles') && !secFolded('secModel') && lsStore.get('sysmlv2.filesFolded') === '1' && $('btnSecFiles').textContent.startsWith('▸') && $('secSplit').hidden ? 'ok' : `${secFolded('secFiles')} ${lsStore.get('sysmlv2.filesFolded')} ${$('secSplit').hidden}`;
    $('btnSecModel').click();
    r.both = secFolded('secFiles') && secFolded('secModel') && lsStore.get('sysmlv2.modelFolded') === '1' ? 'ok' : 'x';
    $('btnSecFiles').click(); $('btnSecModel').click();
    r.open = !secFolded('secFiles') && !secFolded('secModel') && lsStore.get('sysmlv2.filesFolded') === '0' && lsStore.get('sysmlv2.modelFolded') === '0' && !$('secSplit').hidden ? 'ok' : 'x';
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 L: 区画は見出しの行で畳め(▸)、区画ごとに localStorage(sysmlv2.filesFolded・sysmlv2.modelFolded に 1 か 0)に覚える。片方を畳むと境目の分割バーを隠す', JSON.stringify(r));
  }
  // ---- L: 境目の分割バーで高さが変わり、各区画に最小の高さ(60px)が残る
  {
    // GR26 の P5 で置き換えた(予定の red の 4。H): 区画の高さは、木の欄の高さ(上の帯の下の残り。ここでは 600px)から決める(前は 2 つの区画の
    // 高さの和から)。下へ引き切ったときは、「モデル」の区画に見出し・モデルツリー・分割バー・参照箇所の欄の最小の高さ(22 + 40 + 4 + 56 = 122px)を残す
    // (前は 60px で 536px)。片方を畳んだ間は、開いた区画が残り(見出しの行 22px を除いた 578px)を使う(前は高さの指定を外して '')
    const f = $('secFiles'), m = $('secModel');
    f.getBoundingClientRect = () => ({ left: 0, top: 50, width: 200, height: 300, right: 200, bottom: 350 });
    m.getBoundingClientRect = () => ({ left: 0, top: 354, width: 200, height: 296, right: 200, bottom: 650 });
    $('tree').getBoundingClientRect = () => ({ left: 0, top: 50, width: 200, height: 600, right: 200, bottom: 650 });
    const drag = (y) => { $('secSplit').dispatchEvent({ type: 'mousedown', target: $('secSplit'), preventDefault() {} }); for (const h of winLs.mousemove ?? []) h({ type: 'mousemove', clientX: 100, clientY: y }); for (const h of winLs.mouseup ?? []) h({ type: 'mouseup' }); return f.style.height; };
    const r = { mid: drag(50 + 200), top: drag(50 + 10), bottom: drag(50 + 5000) };
    check(r.mid === '200px' && r.top === '60px' && r.bottom === '474px', 'GR26 L: 区画の境目の分割バーで「ファイル」の区画の高さが変わり、最小の高さが残る(木の欄 600px で、上へ引くと 60px、下へ引くと 474px)', JSON.stringify(r));
    $('btnSecModel').click();
    const fh = f.style.height;
    $('btnSecModel').click();
    check(fh === '578px' && f.style.height === '474px', 'GR26 L: 片方を畳んだ間は、開いた区画が残り(見出しの行を除いた 578px)を使い、開き直すと引いた高さに戻る', `${fh} / ${f.style.height}`);
    delete $('tree').getBoundingClientRect;
  }
  // ---- L: 木の欄そのものを畳むと、両方の区画をまとめて畳む(#tree.folded)。4 章の配置の幅は GR25 の終わりと同じ
  {
    const r = {};
    for (const W of [800, 1024, 1280, 1920]) {
      resizeTo(W);
      const w = g26widths({ W, tree: 200, folded: false, text: null }), wf = g26widths({ W, tree: 200, folded: true, text: null });
      const a = $('left').style.width;
      $('btnFold').click(); const b = $('left').style.width, folded = $('tree')._cls.has('folded');
      $('btnFold').click();
      r[W] = a === `${w.left}px` && b === `${wf.left}px` && folded && $('tree').style.width === '200px' ? 'ok' : JSON.stringify({ a, b, want: [w.left, wf.left] });
    }
    resizeTo(1600);
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 L: 木の欄の幅・左の列の幅(畳む前と後)は、src/app/layout.js の widths(GR25 の終わりと同じ)のまま。木の欄を畳むと両方の区画をまとめて畳む', JSON.stringify(r));
  }
  // ---- T: 試しのフォルダ
  const o = await g26Open();
  const roots = mrows().filter((x) => x.depth === 0).map((x) => x.name);
  check(!!o && JSON.stringify(roots) === JSON.stringify(['懐中電灯のシステム', '予備のねじ', '予備のねじ', '共通の定義', '振る舞い', '予備の部品', '懐中電灯の部品']),
    'GR26 T: 根は大域の名前空間で、各ファイルの根の要素を、ファイルの並びの順(相対パスの符号位置の順)、ファイルの中は記述の順に並べる', roots.join(','));
  {
    const fileNames = Object.keys(G26_FILES);
    const all = mrows();
    const depth1 = all.filter((x) => x.depth === 1).length, deeper = all.filter((x) => x.depth > 1).length;
    check(all.every((x) => !fileNames.includes(x.name) && !/\.sysml$/.test(x.name)) && depth1 > 0 && deeper === 0 && all.filter((x) => x.depth === 0 && x.twisty === '▾').length === 5,
      'GR26 T: ファイルの境目を木の形に出さない(ファイル・フォルダの項目がない)。根の要素は開き(▾)、それより下は閉じた状態で始める', `${depth1} ${deeper} ${all.slice(0, 5).map((x) => x.name).join(',')}`);
  }
  // 項目の表示: 名前・種類・定義か使用かの印・型と多重度、マウスを載せたときの修飾名とファイルと行
  {
    mopen('Flashlight', '懐中電灯の部品::Flashlight');
    const fl = mrow('Flashlight', '懐中電灯の部品::Flashlight'), den = mrow('電池', '懐中電灯の部品::Flashlight::電池'), pkg = mrow('懐中電灯の部品');
    const r = {
      def: fl && fl.du === '定' && fl.duCls.includes('def') && fl.kind === '部品の定義' && fl.title === '懐中電灯の部品::Flashlight\n部品/部品の定義.sysml 25 行\n種類: 部品の定義(定義)' ? 'ok' : JSON.stringify(fl && { ...fl, el: null }),
      use: den && den.du === '使' && den.duCls.includes('use') && den.kind === '部品の使用' && den.types === ': Battery' && den.mult === ' [2]' ? 'ok' : JSON.stringify(den && { ...den, el: null }),
      pkg: pkg && pkg.du === '' && pkg.kind === 'パッケージ' ? 'ok' : JSON.stringify(pkg && { ...pkg, el: null }),
    };
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 T: 項目に名前・種類の日本語名・定義か使用かの印(定義は角の四角の「定」、使用は丸の「使」。形の違うクラス)・使用に明示した型と多重度(: Battery [2])を出し、マウスを載せると修飾名とファイルの相対パスと行を出す', JSON.stringify(r));
  }
  // 名前のない要素の要約(接続・継承・流れ・entry の行動)と、並べる要素の種類
  {
    const names = mrows().map((x) => x.name);
    mopen('懐中電灯の状態'); mopen('点灯の手順');
    const names2 = mrows().map((x) => x.name);
    // GR26 の P5 で置き換えた(予定の red の 2。T): 流れの要約は、端の連鎖を全部出す(前は「フロー 電池 → ランプ」)
    const want = ['接続 電池.正極 – スイッチ.入口', '接続 スイッチ.出口 – ランプ.入口', '接続 ランプ.出口 – 電池.負極', 'フロー 電池.正極 → ランプ.入口'];
    const want2 = ['entry の行動', '継承 entry → オフ', 'つける', '消す', '継承 電池を入れる → スイッチを押す', '継承 スイッチを押す → 光を確かめる'];
    check(want.every((x) => names.includes(x)) && want2.every((x) => names2.includes(x)) && mrows().filter((x) => want.includes(x.name)).every((x) => x.el.children.find((c) => c._cls.has('nm'))._cls.has('unnamed')),
      'GR26 T: 名前のない要素は、種類とたどる相手の名前の要約(接続 電池.正極 – スイッチ.入口、継承 entry → オフ、フロー 電池 → ランプ など)で出し、名前のある要素と見た目を分ける', names2.filter((x) => !/^[^ ]+$/.test(x)).join(' / '));
    const kinds = new Set((lastResult()?.outline?.items ?? []).map((x) => x.kindJa));
    const wantKinds = ['パッケージ', '部品の定義', '部品の使用', 'ポートの定義', 'ポートの使用', '属性の定義', '属性の使用', '項目の定義', '状態の定義', '状態の使用', '遷移の使用', '行動の定義', '行動の使用', '継承の使用', '継承', '接続の使用', 'フローの使用', 'ビューの使用', 'exhibit の状態の使用', 'perform の行動の使用', '参照の使用'];
    check(wantKinds.every((k) => kinds.has(k)) && kinds.size === wantKinds.length, 'GR26 T: 並べる要素の種類(試しのフォルダ): パッケージ・定義と使用(部品・ポート・属性・項目・状態・行動・ビュー・exhibit・perform・参照)・遷移・継承・接続・フロー。import・doc・式・値は並べない', [...kinds].join(','));
    const items = lastResult()?.outline?.items ?? [];
    check(!items.some((x) => /import|doc|Comment|Documentation|Expression|Literal/.test(x.kind)) && items.every((x) => Object.keys(G26_FILES).includes(x.file)), 'GR26 T: import・注釈(doc)・式・値の中身の要素は並べず、すべての項目が試しのフォルダのファイルの要素(標準ライブラリ・内蔵する表の要素を並べない)', items.filter((x) => !Object.keys(G26_FILES).includes(x.file)).map((x) => x.q).join(','));
  }
  // 同じ名前の別の要素(2 つのパッケージの Lamp)は、持ち主の違いと、マウスを載せたときの修飾名・ファイルで見分けられる
  {
    const lamps = mrows().filter((x) => x.name === 'Lamp');
    const t = lamps.map((x) => x.title.split('\n').slice(0, 2).join(' | '));
    check(lamps.length === 2 && t.includes('予備の部品::Lamp | 部品/予備の部品.sysml 5 行') && t.includes('懐中電灯の部品::Lamp | 部品/部品の定義.sysml 10 行'), 'GR26 T: 同じ名前の別の要素(Lamp)は、持ち主の違い(木の中の位置)と、マウスを載せたときの修飾名・ファイルで見分けられる', t.join(' / '));
  }
  // 型の表示: 型を 2 つ持つ使用、標準ライブラリの型、未検査・曖昧の型の印
  {
    const two = mrow('予備の電池'), lib = mrow('構成の図'), amb = mrow('手元の部品');
    mopen('懐中電灯', '懐中電灯のシステム::懐中電灯');
    const unc = mrow('使用時間');
    const r = {
      two: two?.types === ': 懐中電灯の部品::Battery, 充電池' ? 'ok' : two?.types,
      lib: lib?.types === ': StandardViewDefinitions::GeneralView(標準ライブラリ)' ? 'ok' : lib?.types,
      unc: unc?.types === ': 時間の単位::時(未検査)' && unc.el.children.find((c) => c._cls.has('mty'))._cls.has('bad') ? 'ok' : unc?.types,
      amb: amb?.types === ': 予備のねじ(曖昧)' && amb.el.children.find((c) => c._cls.has('mty'))._cls.has('bad') ? 'ok' : amb?.types,
    };
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 T: 使用の型は、2 つ以上なら並べ、標準ライブラリ・内蔵する表の要素に「(標準ライブラリ)」、未検査・曖昧の型にその状態の印を付ける', JSON.stringify(r));
  }
  // 解析し直した後も、同じ要素の開閉と選択を保つ(前に 1 行足して位置がずれても)。書き換えた直後は古い解析の印を付けて薄く出す
  {
    mopen('ランプ', '懐中電灯の部品::Flashlight::ランプ');
    mclick(mrow('ランプ', '懐中電灯の部品::Flashlight::ランプ'));
    const selBefore = mrows().filter((x) => x.cls.includes('sel')).map((x) => x.title.split('\n')[0]);
    clickRow('部品/部品の定義.sysml');
    const A = areaOf('部品/部品の定義.sysml');
    const n0 = results.length;
    caretAt(A, 0);
    typeChars(A, '// 前に 1 行\n');
    const stale = $('modelBody')._cls.has('stale') && $('refPane')._cls.has('stale') && /解析し直しています/.test($('modelNote').textContent) && !$('modelNote').hidden;
    await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000);
    await sleep(30);
    const fl = mrow('Flashlight', '懐中電灯の部品::Flashlight');
    const sel = mrows().filter((x) => x.cls.includes('sel')).map((x) => x.title.split('\n')[0]);
    check(stale, 'GR26 T・N: テキストを書き換えてから解析が終わるまで、モデルツリーと参照箇所を「解析し直しています」の印を付けて薄く出す', `${$('modelBody').className} / ${$('modelNote').textContent}`);
    check(JSON.stringify(selBefore) === JSON.stringify(['懐中電灯の部品::Flashlight::ランプ']) && JSON.stringify(sel) === JSON.stringify(selBefore) && fl?.twisty === '▾' && fl.title.includes('部品/部品の定義.sysml 26 行') && !$('modelBody')._cls.has('stale') && $('modelNote').hidden,
      'GR26 T: 解析し直した後(前に 1 行足して位置がずれた後)も、同じ要素の開閉(Flashlight を開いたまま)と選択(ランプ)を保ち、行の位置は新しい記述に合う', JSON.stringify({ sel, fl: fl?.title }));
  }
  // 構文エラーのあるファイルの要素は出さず、区画の上に出す(ほかのファイルの要素は出す)
  {
    const A = areaOf('振る舞い/状態と手順.sysml');
    clickRow('振る舞い/状態と手順.sysml');
    const n0 = results.length;
    caretAt(A, A.value.length);
    typeChars(A, 'part def ');
    await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000);
    await sleep(30);
    const note = $('modelNote').textContent;
    const roots2 = mrows().filter((x) => x.depth === 0).map((x) => x.name);
    check(/構文エラーのあるファイル/.test(note) && note.includes('振る舞い/状態と手順.sysml') && !roots2.includes('振る舞い') && roots2.includes('懐中電灯の部品'), 'GR26 T: 構文エラーのあるファイルの要素は出さず、そのファイルに構文エラーがあることを区画の上に出す(ほかのファイルの要素は出す)', `${note} / ${roots2.join(',')}`);
    const n1 = results.length;
    for (let i = 0; i < 'part def '.length; i++) key(A, 'z', { ctrl: true });
    await waitFor(() => results.slice(n1).some((x) => x.text === treeKey()) && !A.value.endsWith('part def '), 30000);
    await sleep(30);
    check(mrows().some((x) => x.depth === 0 && x.name === '振る舞い') && $('modelNote').hidden, 'GR26 T: 構文エラーを取り消すと、そのファイルの要素を出し直し、区画の上の知らせを消す', `${$('modelNote').textContent} ${A.value.slice(-20)}`);
  }
  // 「すべて折りたたむ」
  {
    $('btnModelCollapse').click();
    check(mrows().every((x) => x.depth === 0 && x.twisty !== '▾'), 'GR26 T: 「モデル」の区画の上の帯の「すべて折りたたむ」で、すべての項目を閉じる', mrows().slice(0, 4).map((x) => `${x.name}${x.twisty}`).join(','));
  }
  // 大きなモデル(要素が数千)での開閉の時間(合否に使わない。開いた項目の分だけを画面に出す)
  // GR27 P5 の M(予定の red の 4): モデルツリーは見えている範囲の行だけを並べるので、行の数(mrows().length)を前提にしない。開閉は、項目の行が
  // 並ぶ位置までスクロールしてから押し(g26Click)、開閉の後の全部の行(p5Full。本体を高くして並べ直したもの)の並びを確かめる。直す前の全部の行との
  // 比べは、tools/perf/gr27_p5cmp.mjs で、--gr27p5 --dump の「GR26 T 大きなモデル」の書き出しを使って行う
  {
    const N = G26BIG_N, P = G26BIG_P;
    const text = g26Big();
    const n0 = results.length;
    $('btnNew').click();
    await waitFor(() => results.slice(n0).length > 0, 30000);
    const r = await typeText(text);
    const items = r?.m?.outline?.items.length ?? 0;
    const want0 = g26Want(false), wantAll = g26Want(true);
    const start = p5Full().map(g26Row);
    const t0 = performance.now();
    g26Click('Big'); // 閉じる(根は開いて始まる)
    const tClose = performance.now() - t0;
    const closed = p5Full().map(g26Row);
    const t1 = performance.now();
    g26Click('Big'); // 開く(302 行)
    const tOpen = performance.now() - t1;
    const reopened = p5Full().map(g26Row);
    const t2 = performance.now();
    for (let i = 0; i < N; i++) g26Click(`D${i}`); // すべての定義を開く(1 回ずつ。最後は 3,302 行)
    const tAll = performance.now() - t2;
    const all = p5Full().map(g26Row);
    const rows = all.length;
    const t3 = performance.now();
    $('btnModelCollapse').click();
    const tCollapse = performance.now() - t3;
    const collapsed = p5Full().map(g26Row);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const ok = items === 1 + 1 + N * (1 + P) && same(start, want0) && same(closed, ['0|Big|▸']) && same(reopened, want0) && same(all, wantAll) && same(collapsed, ['0|Big|▸']);
    check(ok, `GR26 T: 大きなモデル(要素 ${items})の開閉(偽の DOM での時間。合否に使わない): 根を閉じる ${tClose.toFixed(1)} ms・開く ${tOpen.toFixed(1)} ms・定義 ${N} 個を 1 つずつ開く合計 ${tAll.toFixed(0)} ms(1 回あたり ${(tAll / N).toFixed(1)} ms、最後は全部で ${rows} 行)・すべて折りたたむ ${tCollapse.toFixed(1)} ms。開閉のたびに、全部の行の並び(字下げ・名前・開閉の印)が木の形のとおり`,
      `${items} 始め ${start.length}/${want0.length} 閉じた ${closed.join(',')} 開いた ${reopened.length} 全部 ${rows}/${wantAll.length} 折りたたみ ${collapsed.join(',')}`);
    console.error(`GR26_TIMING items=${items} close=${tClose.toFixed(2)} open=${tOpen.toFixed(2)} allOpen=${tAll.toFixed(1)} perOpen=${(tAll / N).toFixed(2)} rows=${rows} collapse=${tCollapse.toFixed(2)}`);
  }
  check(errors.length === 0 && alerts.length === 0, 'GR26 L・T: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}
// ページを開いた直後の区画の開閉(--ls で前のページの覚え、--lsthrow で例外を出す localStorage)
function gr26ls() {
  const want = LS_THROW ? [false, false] : [lsStore.get('sysmlv2.filesFolded') === '1', lsStore.get('sysmlv2.modelFolded') === '1'];
  const now = [secFolded('secFiles'), secFolded('secModel')];
  check(JSON.stringify(now) === JSON.stringify(want) && errors.length === 0, `GR26 L: ページを開いた直後の区画の開閉が、localStorage の覚え(${LS_THROW ? '読み書きで例外 → 開いた状態' : lsArg > 0 ? process.argv[lsArg + 1] : '覚えなし → 開いた状態'})のとおり`, JSON.stringify({ now, want }));
  // 例外を出す localStorage でも、開閉の操作はでき、このページの間だけ覚える
  $('btnSecFiles').click();
  check(secFolded('secFiles') === !want[0] && errors.length === 0, 'GR26 L: 区画の見出しの行を押すと、その区画を開閉する(localStorage の読み書きで例外が出るときも)', `${secFolded('secFiles')}`);
}

// ---- GR26 の検査 R(--gr26r。GR26 指示書 4 章の R。設計書 9.5 節の「参照箇所」)。試しのフォルダで、モデルツリーで選んだ要素の参照箇所を
// 役割ごとに、所属とファイルと行つきで出すこと、未検査・曖昧の参照がどの要素の参照箇所にも入らないこと、選んだ要素がなくなったら欄を空にすること
const GR26R = process.argv.includes('--gr26r');
// 参照箇所の欄。→ { head, groups: [{ role, n, rows: [{ owner, loc }] }], empty }
function refPane() {
  const out = { head: $('refHead').textContent, groups: [], empty: $('refBody').children.find((c) => c._cls.has('rempty'))?.textContent ?? null };
  for (const c of $('refBody').children) {
    if (c._cls.has('rrole')) { const m = /^(.*)\((\d+)\)$/.exec(c.textContent); out.groups.push({ role: m?.[1] ?? c.textContent, n: Number(m?.[2] ?? -1), rows: [] }); }
    // GR26 の P5 で置き換えた(予定の red の 4。H): 参照箇所の行は 2 段(上の段 .rtop に .rar・.rown、下の段 .rloc)なので、行の中から探す(前は行の子)
    if (c._cls.has('rrow')) out.groups.at(-1)?.rows.push({ owner: c.querySelector('.rown')?.textContent ?? '', loc: c.querySelector('.rloc')?.textContent ?? '', arrow: c.querySelector('.rar')?.textContent ?? '' });
  }
  return out;
}
const groupsOf = (p) => p.groups.map((g) => `${g.role}(${g.n}): ${g.rows.map((r) => `${r.owner} @ ${r.loc}`).join(' | ')}`);
// 修飾名で項目を選ぶ(持ち主を開いてから)
function mselect(q) {
  const parts = q.split('::');
  for (let i = 1; i < parts.length; i++) mopen(parts[i - 1], parts.slice(0, i).join('::'));
  const r = mrow(parts.at(-1), q);
  if (!r) return false;
  mclick(r);
  return true;
}
async function gr26r() {
  const o = await g26Open();
  // GR26 の P5 で置き換えた(予定の red の 2。T): 名前のない要素の修飾名の区切りは「(名前なし)」(前は「(接続 電池.正極 – スイッチ.入口)」「(フロー 電池 → ランプ)」
  // 「(継承 entry → オフ)」「(accept 押す)」などの要約をかっこに入れていた)
  // GR26 の P6 で置き換えた(予定の red の 1。Q): 名前のない要素の修飾名の区切りは、その要素の要約をかっこで囲む(P5 の「(名前なし)」から、
  // 「(接続 電池.正極 – スイッチ.入口)」「(フロー 電池.正極 → ランプ.入口)」「(継承 entry → オフ)」「(受信 押す)」などに)
  const want = {
    '懐中電灯の部品::Battery': { head: '参照箇所: Battery(2 件)', groups: ['型付け(2): 予備の部品::予備の電池 @ 部品/予備の部品.sysml 10 行 | 懐中電灯の部品::Flashlight::電池 @ 部品/部品の定義.sysml 26 行'] },
    '懐中電灯の部品::Lamp': { head: '参照箇所: Lamp(4 件)', groups: ['型付け(2): 懐中電灯の部品::Flashlight::ランプ @ 部品/部品の定義.sysml 27 行 | 懐中電灯の部品::Flashlight::補助灯 @ 部品/部品の定義.sysml 29 行', '特殊化(1): 懐中電灯の部品::強力なランプ @ 部品/部品の定義.sysml 20 行', '別名(alias)(1): 懐中電灯の部品 @ 部品/部品の定義.sysml 23 行'] },
    '予備の部品::Lamp': { head: '参照箇所: Lamp(1 件)', groups: ['型付け(1): 予備の部品::予備のランプ @ 部品/予備の部品.sysml 11 行'] },
    '懐中電灯の部品::Flashlight': { head: '参照箇所: Flashlight(1 件)', groups: ['型付け(1): 懐中電灯のシステム::懐中電灯 @ システム.sysml 5 行'] },
    '懐中電灯の部品::Battery::正極': { head: '参照箇所: 正極(2 件)', groups: ['接続の端(1): 懐中電灯の部品::Flashlight::(接続 電池.正極 – スイッチ.入口) @ 部品/部品の定義.sysml 30 行', '流れの元(1): 懐中電灯の部品::Flashlight::(フロー 電池.正極 → ランプ.入口) @ 部品/部品の定義.sysml 33 行'] },
    '懐中電灯の部品::Lamp::光量': { head: '参照箇所: 光量(1 件)', groups: ['再定義(1): 懐中電灯の部品::強力なランプ::光量 @ 部品/部品の定義.sysml 21 行'] },
    '振る舞い::懐中電灯の状態::オフ': { head: '参照箇所: オフ(3 件)', groups: ['継承の先(1): 振る舞い::懐中電灯の状態::(継承 entry → オフ) @ 振る舞い/状態と手順.sysml 6 行', '遷移の元(1): 振る舞い::懐中電灯の状態::つける @ 振る舞い/状態と手順.sysml 9 行', '遷移の先(1): 振る舞い::懐中電灯の状態::消す @ 振る舞い/状態と手順.sysml 10 行'] },
    '振る舞い::点灯の手順::スイッチを押す': { head: '参照箇所: スイッチを押す(2 件)', groups: ['継承の元(1): 振る舞い::点灯の手順::(継承 スイッチを押す → 光を確かめる) @ 振る舞い/状態と手順.sysml 17 行', '継承の先(1): 振る舞い::点灯の手順::(継承 電池を入れる → スイッチを押す) @ 振る舞い/状態と手順.sysml 16 行'] },
    '共通の定義::電圧値': { head: '参照箇所: 電圧値(3 件)', groups: ['型付け(2): 共通の定義::端子::電圧 @ 定義の共通.sysml 6 行 | 懐中電灯の部品::Battery::定格電圧 @ 部品/部品の定義.sysml 6 行', '流れの運ぶもの(of)(1): 懐中電灯の部品::Flashlight::(フロー 電池.正極 → ランプ.入口) @ 部品/部品の定義.sysml 33 行'] },
    '共通の定義::ボタン操作': { head: '参照箇所: ボタン操作(2 件)', groups: ['受け取りの型(2): 振る舞い::懐中電灯の状態::つける::(受信 押す)::押す @ 振る舞い/状態と手順.sysml 9 行 | 振る舞い::懐中電灯の状態::消す::(受信 押す)::押す @ 振る舞い/状態と手順.sysml 10 行'] },
    '振る舞い::懐中電灯の状態': { head: '参照箇所: 懐中電灯の状態(1 件)', groups: ['型付け(1): 懐中電灯の部品::Flashlight::動き @ 部品/部品の定義.sysml 34 行'] },
  };
  for (const [q, w] of Object.entries(want)) {
    const ok = mselect(q);
    const p = refPane();
    const g = groupsOf(p);
    check(ok && p.head === w.head && JSON.stringify(g) === JSON.stringify(w.groups) && p.groups.every((x) => x.n === x.rows.length && x.rows.every((r) => r.arrow === '←')),
      `GR26 R: ${q} の参照箇所を、役割ごと(件数を見出しに)に、参照している要素の修飾名(所属)とファイルの相対パスと行つきで出す`, `${ok} ${p.head} / ${g.join(' // ')}`);
  }
  // 参照箇所は、モデルツリーの子要素とは別の欄(#refPane。#modelBody の外)に、別の見た目(.rrow、左の矢印)で出す
  check(!$('modelBody').contains($('refPane')) && $('secModel').contains($('refPane')) && $('refBody').children.some((c) => c._cls.has('rrow')) && !$('modelBody').children.some((c) => c._cls.has('rrow')),
    'GR26 R: 参照箇所は、モデルツリーの子要素とは別の欄に、別の見た目(行の形と左の矢印)で出す', '');
  // 未検査・曖昧の参照は、どの要素の参照箇所にも入れない(試しのフォルダの「時間の単位::時」「予備のねじ」)
  {
    const out = lastResult()?.outline;
    const all = Object.values(out?.refs ?? {}).flat();
    const bad = all.filter((x) => /時間の単位|^'時'$|予備のねじ/.test(x.text));
    mselect('予備のねじ');
    const p = refPane();
    check(!!out && all.length > 0 && bad.length === 0 && p.empty === 'この要素を参照している箇所はありません' && p.head === '参照箇所: 予備のねじ(0 件)', 'GR26 R: 未検査・曖昧の参照(時間の単位::時・予備のねじ)は、どの要素の参照箇所にも入れない(曖昧の相手の「予備のねじ」の参照箇所は 0 件)', `${bad.map((x) => x.text).join(',')} / ${p.head} / ${p.empty}`);
    check(out?.other === 0, 'GR26 R: 試しのフォルダの参照で、役割を決められず「その他の参照」にしたものは 0 件', String(out?.other));
  }
  // 選んだ要素がなくなったときは、欄を空にする(システム.sysml の「手元の部品」を消す)
  {
    mselect('懐中電灯のシステム::手元の部品');
    const before = refPane().head;
    const A = areaOf('システム.sysml');
    const at = A.value.indexOf("    part '手元の部品'");
    const end = A.value.indexOf('\n', at) + 1;
    const n0 = results.length;
    A.selectionStart = at; A.selectionEnd = end;
    typeIn(A, '', 'deleteContentBackward');
    await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000);
    await sleep(30);
    const p = refPane();
    check(before === '参照箇所: 手元の部品(0 件)' && p.head === '参照箇所' && p.empty === 'モデルで要素を選ぶと、参照している箇所を出します' && !mrow('手元の部品'), 'GR26 R: 参照箇所の欄で選んだ要素が、解析し直した後になくなったときは、欄を空にする(案内に戻す)', `${before} / ${p.head} / ${p.empty}`);
  }
  // 名前の変更で書き換える参照の数との照合(tools/model/gr26_refs_check.mjs の checkFiles。試しのフォルダ)
  {
    const { checkFiles } = await import('../../tools/model/gr26_refs_check.mjs');
    const r = checkFiles(Object.entries(G26_FILES).filter(([p]) => p.endsWith('.sysml')).map(([path, text]) => ({ path, text })).sort((a, b) => cmpPaths(a.path, b.path)), { rename: true });
    check(r.unexplained === 0 && r.renameMismatch.length === 0 && r.refs === r.same + r.alias && r.renamed === r.same + r.inherit + r.unresolved && r.refs > 0,
      `GR26 R: 試しのフォルダで、名前を宣言した要素 ${r.elements} 個の参照箇所の数(合計 ${r.refs})が、名前の変更で書き換える参照の数(合計 ${r.renamed})と、説明できる違い(別名で書いた参照 ${r.alias}・名前を受け継ぐ要素の参照 ${r.inherit}・未検査と曖昧 ${r.unresolved})を除いて一致し、名前の変更を実際に行ったもの(${r.renameOk} 件)の書き換えの数とも一致する`,
      JSON.stringify({ ...r, unexplainedList: r.unexplainedList.slice(0, 3), roles: undefined }));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR26 R: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR26 の検査 N(--gr26n。GR26 指示書 4 章の N。設計書 9.5 節の「移動」「型の表示と移動」「古い解析」)。試しのフォルダで、項目・参照箇所の
// 行・型(1 つ・2 つ以上・標準ライブラリ・未検査・曖昧)からの移動で、正しいファイルと行・字句が選ばれること、移る前の書き換えと取り消しの
// 履歴が残ること、解析の前に押すと移らないこと、名前の変更・追加・削除・ファイルの名前の変更・再読み込みの後の移動先
const GR26N = process.argv.includes('--gr26n');
// 今表示しているファイルと、選んでいる字句と行
const shownSel = () => { const a = shownArea(); if (!a) return null; return { path: pathBar(), text: a.value.slice(a.selectionStart, a.selectionEnd), line: a.value.slice(0, a.selectionStart).split('\n').length, cur: curRow() }; };
const selStr = (s) => (s ? `${s.path} ${s.line} 行「${s.text}」(木の強調 ${s.cur})` : '(なし)');
const modelMsgText = () => $('modelMsg')?.textContent ?? '';
// 参照箇所の行をクリックする(k 番目)
function refClick(k) { const r = $('refBody').children.filter((c) => c._cls.has('rrow'))[k]; if (!r) return false; $('refBody').dispatchEvent({ type: 'click', target: r.children[1] ?? r, preventDefault() {} }); return true; }
async function chooseScope26(word, view) {
  if (view && $('viewKind').value !== view) { const n0 = results.length; $('viewKind').value = view; $('viewKind').dispatchEvent({ type: 'change' }); await waitFor(() => results.slice(n0).some((x) => x.text === treeKey())); }
  const o = $('scope').options.find((x) => x.textContent.includes(word));
  if (!o) return null;
  const n0 = results.length;
  $('scope').value = o.value;
  $('scope').dispatchEvent({ type: 'change' });
  return waitFor(() => results.slice(n0).findLast((x) => x.text === treeKey()));
}
const settle = async (n0) => { await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()), 30000); await sleep(30); };
async function gr26n() {
  const o = await g26Open();
  clickRow('システム.sysml');
  // ---- 項目からの移動(別のファイルへ)
  {
    mselect('懐中電灯の部品::Battery');
    const s = shownSel();
    check(s?.path === '部品/部品の定義.sysml' && s.text === 'Battery' && s.line === 5 && s.cur === '部品/部品の定義.sysml', 'GR26 N: 項目を押すと、その要素のファイル(別のファイル)に切り替え、名前の字句を選ぶ。木の欄の「ファイル」の区画でもそのファイルを強調する', selStr(s));
  }
  // 参照箇所の行からの移動(別のファイルの参照の名前)
  {
    refClick(0);
    const s = shownSel();
    check(s?.path === '部品/予備の部品.sysml' && s.text === 'Battery' && s.line === 10, 'GR26 N: 参照箇所の行を押すと、その参照が書かれているファイルに切り替え、参照の名前の字句を選ぶ', selStr(s));
  }
  // 名前のない要素は、宣言の始まりの字句
  {
    mselect('懐中電灯の部品::Flashlight');
    mopen('Flashlight', '懐中電灯の部品::Flashlight');
    mclick(mrow('接続 電池.正極 – スイッチ.入口'));
    const s = shownSel();
    check(s?.path === '部品/部品の定義.sysml' && s.text === 'connect' && s.line === 30, 'GR26 N: 名前のない要素(接続)を押すと、宣言の始まりの字句(connect)を選ぶ', selStr(s));
  }
  // ---- 型からの移動: 1 つ(Flashlight::電池 : Battery)
  {
    clickRow('システム.sysml');
    mopen('Flashlight', '懐中電灯の部品::Flashlight');
    mclick(mrow('電池', '懐中電灯の部品::Flashlight::電池'), 'mty');
    const s = shownSel();
    check(s?.path === '部品/部品の定義.sysml' && s.text === 'Battery' && s.line === 5, 'GR26 N: 使用の型(1 つ)を押すと、型の定義のファイルに切り替え、定義の名前の字句を選ぶ', selStr(s));
  }
  // 2 つ以上: 型の一覧(右クリックのメニューと同じ見た目)を出して選ばせる
  {
    clickRow('システム.sysml');
    mclick(mrow('予備の電池'), 'mty');
    const menu = $('typeMenu');
    const labels = menu?.children.map((b) => `${b.textContent}${b.disabled ? '(押せない)' : ''}`) ?? [];
    const s0 = shownSel();
    menu?.children[1]?.click();
    const s = shownSel();
    check(!!menu && menu._cls.has('tmenu') && JSON.stringify(labels) === JSON.stringify(['懐中電灯の部品::Battery', '充電池']) && s0?.path === 'システム.sysml' && s?.path === '部品/予備の部品.sysml' && s.text === "'充電池'" && s.line === 9 && !$('typeMenu'),
      'GR26 N: 型が 2 つ以上の使用の型を押すと、型の一覧(.tmenu)を出し(まだ移らない)、選んだ型の定義へ移って一覧を閉じる', `${labels.join(',')} / ${selStr(s0)} → ${selStr(s)}`);
    mclick(mrow('予備の電池'), 'mty');
    const m2 = $('typeMenu');
    m2.children[0].click();
    const s2 = shownSel();
    check(s2?.path === '部品/部品の定義.sysml' && s2.text === 'Battery', 'GR26 N: 型の一覧の 1 つ目(懐中電灯の部品::Battery)を選ぶと、そのファイルの定義へ移る', selStr(s2));
  }
  // 標準ライブラリ・未検査・曖昧の型は、押しても移らず、理由を出す
  {
    clickRow('システム.sysml');
    const A = areaOf('システム.sysml');
    A.selectionStart = A.selectionEnd = 3;
    const r = {};
    for (const [name, word] of [['構成の図', '標準ライブラリ'], ['手元の部品', '曖昧'], ['使用時間', '未検査']]) {
      if (name === '使用時間') mopen('懐中電灯', '懐中電灯のシステム::懐中電灯');
      mclick(mrow(name), 'mty');
      const s = shownSel();
      r[name] = s?.path === 'システム.sysml' && A.selectionStart === 3 && A.selectionEnd === 3 && modelMsgText().includes(word) && modelMsgText().includes('移りません') ? 'ok' : `${selStr(s)} ${modelMsgText()}`;
    }
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 N: 型が標準ライブラリ・曖昧・未検査のときは、押しても移らず(今のファイルと選択のまま)、移らない理由を出す(推測した移動先へ飛ばさない)', JSON.stringify(r));
  }
  // ---- 移る前に書き換えていたファイルの書き換えと取り消しの履歴が、移った後も残る(Ctrl+Z で戻る)
  {
    clickRow('システム.sysml');
    const A = areaOf('システム.sysml');
    const orig = A.value;
    const n0 = results.length;
    caretAt(A, 0);
    typeChars(A, '// 書き換え\n');
    await settle(n0);
    mselect('懐中電灯の部品::Battery'); // 別のファイルへ移る
    const away = shownSel();
    mselect('懐中電灯のシステム::懐中電灯'); // 戻る(項目から)
    const back = shownSel();
    const kept = A.value === `// 書き換え\n${orig}` && rowOf('システム.sysml')?.cls.includes('dirty');
    const n1 = results.length;
    key(A, 'z', { ctrl: true }); key(A, 'z', { ctrl: true }); // 改行でまとまりが切れるので 2 回(「// 書き換え」と改行)
    await settle(n1);
    check(away?.path === '部品/部品の定義.sysml' && back?.path === 'システム.sysml' && back.text === "'懐中電灯'" && back.line === 6 && kept && A.value === orig,
      'GR26 N: 移る前に書き換えていたファイル(システム.sysml)の書き換えと書き換えの印が、別のファイルへ移って戻った後も残り、Ctrl+Z で書き換える前に戻る', `${selStr(away)} / ${selStr(back)} / ${kept} / ${JSON.stringify(A.value.slice(0, 20))}`);
  }
  // ---- 書き換えた直後(解析の前)に押すと移らず、知らせが出る(項目・参照箇所の行・型)
  {
    clickRow('システム.sysml');
    mselect('懐中電灯の部品::Flashlight');
    clickRow('システム.sysml');
    const A = areaOf('システム.sysml');
    const n0 = results.length;
    caretAt(A, 0);
    typeChars(A, ' ');
    const r = {};
    mclick(mrow('Battery', '懐中電灯の部品::Battery'));
    r.item = shownSel()?.path === 'システム.sysml' && modelMsgText().includes('解析し直しています') ? 'ok' : `${selStr(shownSel())} ${modelMsgText()}`;
    $('modelMsg').textContent = '';
    refClick(0);
    r.ref = shownSel()?.path === 'システム.sysml' && modelMsgText().includes('解析し直しています') ? 'ok' : `${selStr(shownSel())} ${modelMsgText()}`;
    $('modelMsg').textContent = '';
    mopen('Flashlight', '懐中電灯の部品::Flashlight');
    mclick(mrow('電池', '懐中電灯の部品::Flashlight::電池'), 'mty');
    r.type = shownSel()?.path === 'システム.sysml' && modelMsgText().includes('解析し直しています') ? 'ok' : `${selStr(shownSel())} ${modelMsgText()}`;
    await settle(n0);
    mclick(mrow('Battery', '懐中電灯の部品::Battery'));
    r.after = shownSel()?.path === '部品/部品の定義.sysml' && shownSel().text === 'Battery' ? 'ok' : selStr(shownSel());
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 N: 書き換えた直後(解析の前)は、項目・参照箇所の行・型を押しても移らず、「解析し直しています」の知らせを出す。解析が終わった後は移る', JSON.stringify(r));
    const n1 = results.length;
    key(A, 'z', { ctrl: true });
    await settle(n1);
  }
  // ---- 名前の変更(図から。2 つのファイルにまたがる)の後の移動先
  {
    const g = await chooseScope26('部品の図', 'general');
    const ren = g ? await (async () => {
      if (!clickNode(g, 'Battery', 'PartDefinition')) return 'Battery を選べない';
      const inp = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.dataset.which === 'name'), 20000);
      if (!inp) return '名前の欄が出ない';
      inp.value = 'Battery2';
      const n0 = results.length;
      $('edit').querySelectorAll('button').find((b) => b.textContent === '変更').click();
      await waitFor(() => areaOf('部品/予備の部品.sysml').value.includes('懐中電灯の部品::Battery2') && results.slice(n0).some((x) => x.text === treeKey()), 30000);
      await sleep(30);
      return 'ok';
    })() : '一般ビューで「懐中電灯の部品」を描けない';
    mselect('懐中電灯の部品::Battery2');
    const s1 = shownSel();
    refClick(0);
    const s2 = shownSel();
    check(ren === 'ok' && s1?.path === '部品/部品の定義.sysml' && s1.text === 'Battery2' && s1.line === 5 && s2?.path === '部品/予備の部品.sysml' && s2.text === 'Battery2' && s2.line === 10,
      'GR26 N: 名前の変更(図から。2 つのファイルにまたがる)の後、作り直した木の項目と参照箇所の行の移動先が、新しい記述(Battery2)に合う', `${ren} / ${selStr(s1)} / ${selStr(s2)}`);
  }
  // ---- 追加(図から部品を足す)の後
  {
    const g = await chooseScope26('部品の図', 'general');
    let added = 'x';
    if (g && clickNode(g, 'Flashlight', 'PartDefinition')) {
      (await editButton('部品を足す'))?.click();
      const nm = await waitFor(() => $('edit').querySelectorAll('input').find((x) => x.placeholder === '名前(必須)'), 5000);
      if (nm) {
        nm.value = '追加した部品';
        const n0 = results.length;
        $('edit').querySelectorAll('button').find((x) => x.textContent === '足す')?.click();
        await waitFor(() => areaOf('部品/部品の定義.sysml').value.includes("part '追加した部品';") && results.slice(n0).some((x) => x.text === treeKey()), 30000);
        await sleep(30);
        added = 'ok';
      }
    }
    mselect('懐中電灯の部品::Flashlight::追加した部品');
    const s = shownSel();
    const line = areaOf('部品/部品の定義.sysml').value.split('\n').findIndex((l) => l.includes("part '追加した部品';")) + 1;
    check(added === 'ok' && s?.text === "'追加した部品'" && s.line === line && s.path === '部品/部品の定義.sysml', 'GR26 N: 追加(図から部品を足す)の後、足した要素が木に入り、その移動先が新しい記述に合う', `${added} / ${selStr(s)} / ${line}`);
  }
  // ---- 削除(図から)の後
  {
    const g = await chooseScope26('部品の図', 'general');
    let del = 'x';
    if (g && clickNode(g, '追加した部品')) {
      (await editButton('削除'))?.click();
      const ok = await waitFor(() => $('edit').querySelectorAll('button').find((x) => x.textContent === '消す'), 20000);
      const n0 = results.length;
      ok?.click();
      await waitFor(() => !areaOf('部品/部品の定義.sysml').value.includes('追加した部品') && results.slice(n0).some((x) => x.text === treeKey()), 30000);
      await sleep(30);
      del = 'ok';
    }
    mselect('懐中電灯の部品::Flashlight::補助灯');
    const s = shownSel();
    check(del === 'ok' && !mrow('追加した部品') && s?.text === "'補助灯'" && s.line === 29, 'GR26 N: 削除(図から)の後、消した要素が木から消え、ほかの項目の移動先が新しい記述に合う', `${del} / ${selStr(s)}`);
  }
  // ---- ファイルの名前の変更の後(移動先のファイルが新しい相対パスになる)
  {
    await renameRow('部品/予備の部品.sysml', '予備.sysml');
    mselect('予備の部品::Lamp');
    const s = shownSel();
    check(s?.path === '部品/予備.sysml' && s.text === 'Lamp' && s.line === 5 && mrow('Lamp', '予備の部品::Lamp')?.title.includes('部品/予備.sysml 5 行'), 'GR26 N: ファイルの名前の変更の後、項目のファイルと移動先が新しい相対パス(部品/予備.sysml)に合う', selStr(s));
  }
  // ---- 再読み込みの後(ほかで書き換えられたファイルを読み直す)
  {
    o.ctl.files.set('定義の共通.sysml', { bytes: enc(`// ほかで足した行\n${G26_FILES['定義の共通.sysml']}`), lastModified: 9000 });
    const n0 = results.length;
    const reloaded = await reloadNow();
    await settle(n0);
    mselect('共通の定義::電圧値');
    const s = shownSel();
    check(reloaded && s?.path === '定義の共通.sysml' && s.text === "'電圧値'" && s.line === 4, 'GR26 N: 再読み込み(ほかで書き換えられたファイルを読み直した)の後、移動先が新しい記述(1 行下)に合う', selStr(s));
  }
  // ---- H: ファイルの名前の変更・移動が失敗したときの理由の文(前は「…に移しられませんでした」になっていた)
  {
    o.ctl.failWrite.push('部品/メモ.txt', 'メモ2.txt');
    const na = alerts.length;
    dragRow('メモ.txt', '部品');
    await waitFor(() => alerts.length > na, 10000); await sleep(30);
    const mv = alerts.slice(na).join(' / ');
    const nb = alerts.length;
    clickRow('メモ.txt'); treeKeyDown('F2'); enterName('メモ2.txt');
    await waitFor(() => alerts.length > nb, 10000); await sleep(30);
    const rn = alerts.slice(nb).join(' / ');
    check(mv.startsWith('ファイル「メモ.txt」を「部品/メモ.txt」に移せませんでした(') && rn.startsWith('ファイル「メモ.txt」を「メモ2.txt」に名前を変えられませんでした(') && !/移しられ/.test(mv + rn) && o.ctl.files.has('メモ.txt'),
      'GR26 H: ファイルの移動・名前の変更が失敗したときの理由の文が「…に移せませんでした」「…に名前を変えられませんでした」(「…に移しられませんでした」でない)で、元のファイルが残る', `${mv} / ${rn}`);
    alerts.splice(na);
  }
  check(errors.length === 0 && alerts.length === 0, 'GR26 N: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}

// ---- GR26 の P5 の検査(--gr26p5 [--built]。GR26 指示書 v26.2 の 4 章の K・M・S・J・A・P・W・H と T の画面の部分。設計書 9.4 節・9.5 節・9.2 節)。
// 試しのフォルダ(tools/model/gr26_folder.mjs)を fakeFs で開いて確かめ、J・P・A は 1 つのテキストで確かめる。--built なら、src/app/main.js の
// 代わりに、ビルドした HTML(tools/build/build.mjs の buildHtml でその場で作る。--html <パス> なら、そのファイル)の中のスクリプトを動かす(GR25 の形)
const GR26P5 = process.argv.includes('--gr26p5'), GR26P5_BUILT = GR26P5 && process.argv.includes('--built');
// 木の欄のキーを、target を指定して送る(偽の DOM は出来事を親に伝えないので、木の欄に送り、target を焦点のある要素にする)
function treeKeyAt(target, k, mods = {}) { let prevented = false; $('tree').dispatchEvent({ type: 'keydown', key: k, ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: false, altKey: false, target, preventDefault() { prevented = true; }, stopPropagation() {} }); return prevented; }
const STALE = '解析し直しています。解析が終わってから、もう一度押してください';
// 文字の幅を測る関数を決まった値にする(1 文字 7px。テキスト欄の左の余白 10px、tab-size 4、見える幅 569px)
const CH = 7, PADL = 10, VIEW_W = 569;
function fixMeasure() {
  window.getComputedStyle = () => ({ font: '13px Consolas', fontSize: '13px', fontFamily: 'Consolas', tabSize: '4', paddingLeft: `${PADL}px` });
  const ce = document.createElement;
  document.createElement = (t) => (t === 'canvas' ? { getContext: (k) => (k === '2d' ? { font: '', measureText: (x) => ({ width: [...x].length * CH }) } : null) } : ce(t));
}
// 行の始まりから位置 p までの幅(タブは 4 文字の幅の倍数の位置まで進める)
function xAt(text, p) {
  const ls = text.lastIndexOf('\n', p - 1) + 1;
  let x = 0;
  for (const c of text.slice(ls, p)) x = c === '\t' ? (Math.floor(x / (4 * CH)) + 1) * 4 * CH : x + CH;
  return x;
}
// 選んだ字句が見える範囲に入っているか、と、送った量が「字句の始まりが見える幅の左から 4 分の 1」か(sl0 は送る前の scrollLeft)
function hscroll(a, sl0) {
  const left = PADL + xAt(a.value, a.selectionStart), right = PADL + xAt(a.value, a.selectionEnd);
  const vis0 = left >= sl0 && right <= sl0 + VIEW_W;
  const want = vis0 ? sl0 : Math.max(0, Math.round(left - VIEW_W / 4));
  return { ok: a.scrollLeft === want && left >= a.scrollLeft && right <= a.scrollLeft + VIEW_W && $('hl').scrollLeft === a.scrollLeft, left, want, got: a.scrollLeft, hl: $('hl').scrollLeft, vis0 };
}
const rowKids = (r) => r.el.children.map((x) => [...x._cls][0] ?? x.tagName);
async function typeAt26(a, t = " ") { a.value += t; a.dispatchEvent({ type: "input" }); }
const J_TEXT = `package J {
  item def Sig;
  port def PD;
  part def Q { port pp : PD; action drive2; }
  state def SD { entry; then s1; state s1; state s2; transition first s1 then s2; }
  use case def UC { objective; }
  attribute def L;
  part def Base { attribute '光量' : L; }
  part def A :> Base {
    part p : Q;
    attribute v;
    attribute :>> '光量';
    state st : SD;
    use case uc : UC;
    action drive;
    perform drive;
    exhibit st;
    include uc;
    perform p.drive2;
    action a1; action a2;
    first a1 then a2;
    action snd { send Sig() via p.pp to p; }
    action acc { accept Sig via p.pp; }
    action asg { assign v := 5; }
    connect p.pp to p.pp;
    flow p.pp to p.pp;
  }
}
`;
async function gr26p5() {
  // ---- H: 区画と欄の高さ(木の欄の高さ 600px を偽の getBoundingClientRect で与える。フォルダを開く前から)
  let TH = 600;
  const fh = () => parseFloat($('secFiles').style.height), mh = () => parseFloat($('secModel').style.height), rh = () => parseFloat($('refPane').style.height);
  const hnow = () => ({ f: fh(), m: mh(), r: rh() });
  const fits = (z, T) => z.f + 4 + z.m <= T + 0.5 && z.r <= z.m && z.m - 22 - 4 - z.r >= 0;
  const resize = () => { for (const h of winLs.resize ?? []) h({ type: 'resize' }); };
  const drag = (id, y) => { $(id).dispatchEvent({ type: 'mousedown', target: $(id), preventDefault() {} }); for (const h of winLs.mousemove ?? []) h({ type: 'mousemove', clientX: 100, clientY: y }); for (const h of winLs.mouseup ?? []) h({ type: 'mouseup' }); };
  $('tree').getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: TH, width: 200, height: TH });
  $('secFiles').getBoundingClientRect = () => ({ top: 0, bottom: fh(), height: fh() });
  $('secModel').getBoundingClientRect = () => ({ top: TH - mh(), bottom: TH, height: mh() });
  // フォルダを開いていないとき: 「ファイル」の区画を中身の高さ(案内 #treeEmpty の高さ 150px を偽の getBoundingClientRect で与え、見出し 22px を
  // 足す)にし、残りを「モデル」の区画に使う
  $('treeEmpty').getBoundingClientRect = () => ({ top: 22, bottom: 172, height: 150 });
  resize();
  const h0 = hnow();
  check(h0.f === 172 && h0.m === 596 - 172 && h0.r === Math.round(0.4 * h0.m) && fits(h0, 600), 'GR26 P5 H: フォルダを開いていないときは、「ファイル」の区画を中身の高さ(見出しを含めて 172px)にし、残りを「モデル」の区画に使う。参照箇所の欄は「モデル」の区画の 40%', JSON.stringify(h0));
  const o = await g26Open();
  const ctl = o?.ctl;
  check(!!o, 'GR26 P5: 試しのフォルダを開ける', '');
  if (!o) return;
  {
    const r = {};
    r.folder = hnow(); // フォルダを開いたとき(付け直す): 40% と 60%、参照箇所の欄は「モデル」の区画の 40%
    const okFolder = r.folder.f === Math.round(0.4 * 596) && r.folder.m === 596 - r.folder.f && r.folder.r === Math.round(0.4 * r.folder.m);
    drag('secSplit', 500);
    r.drag = hnow();
    TH = 300; resize();
    r.small = hnow();
    TH = 150; resize();
    r.tiny = hnow();
    TH = 600; resize();
    r.back = hnow();
    $('btnSecFiles').click(); r.foldFiles = hnow(); $('btnSecFiles').click(); r.unfoldFiles = hnow();
    const okDrag = r.drag.f === 474 && r.drag.m === 122 && r.drag.r === 56 && fits(r.drag, 600);
    const okSmall = r.small.f === 174 && r.small.m === 122 && r.small.r === 56 && fits(r.small, 300);
    const okTiny = r.tiny.f + 4 + r.tiny.m <= 150.5 && r.tiny.r <= r.tiny.m && r.tiny.f > 0 && r.tiny.m > 0 && r.tiny.r > 0;
    const okBack = r.back.f === 474 && fits(r.back, 600);
    const okFold = r.foldFiles.f === 22 && r.foldFiles.m === 578 && r.unfoldFiles.f === r.back.f && r.unfoldFiles.m === r.back.m;
    check(okFolder && okDrag && okSmall && okTiny && okBack && okFold, 'GR26 P5 H: フォルダを開いたときの高さが「ファイル」40%・「モデル」60%・参照箇所の欄は「モデル」の 40%。分割バーで変えた高さは割合で持ち、木の欄を縮めても区画・欄・分割バーが木の欄の中に収まり、最小の高さ(区画 60px、モデルツリー 40px、参照箇所 56px)が残り、足りないときは最小の高さの比で分ける。区画を畳む・開くで割合から付け直す', JSON.stringify(r));
    // モデルツリーと参照箇所の欄の境目の分割バー
    drag('secSplit', 240);
    const z0 = hnow();
    drag('refSplit', 450);
    const z1 = hnow();
    drag('refSplit', 0);
    const z2 = hnow();
    TH = 400; resize();
    const z3 = hnow();
    check(z0.f === 240 && z1.r === 600 - 450 - 2 && fits(z1, 600) && z2.m - 22 - 4 - z2.r === 40 && fits(z2, 600) && fits(z3, 400) && z3.m - 22 - 4 - z3.r >= 40 && z3.r >= 56,
      'GR26 P5 H: モデルツリーと参照箇所の欄の境目の分割バーで参照箇所の欄の高さを変えられ、上へ引き切ってもモデルツリーに最小の高さ(40px)が残り、木の欄を縮めても欄が区画の中に収まる', JSON.stringify({ z0, z1, z2, z3 }));
    TH = 600; resize();
  }
  // ---- W: 木の欄を畳むボタンの名前(title と読み上げの名前)
  {
    const t0 = $('btnFold').title, a0 = $('btnFold').getAttribute('aria-label');
    $('btnFold').click();
    const t1 = $('btnFold').title, a1 = $('btnFold').getAttribute('aria-label');
    $('btnFold').click();
    check(t0 === '木の欄を畳む' && a0 === t0 && t1 === '木の欄を広げる' && a1 === t1 && $('btnFold').title === t0, 'GR26 P5 W: 木の欄を畳むボタンの名前(title と aria-label)が「木の欄を畳む」、畳んだ後は「木の欄を広げる」', `${t0} / ${a0} / ${t1} / ${a1}`);
  }
  // ---- K: 「モデル」の区画・参照箇所の欄・モデルツリーの本体に焦点があるとき、フォルダの木のキーでファイルを操作しない
  {
    clickRow('システム.sysml');
    mclick(mrow('懐中電灯の部品'));
    await sleep(30);
    const disk0 = diskList(ctl).join(','), nc = confirms.length, msg0 = $('treeMsg').textContent, na = alerts.length;
    const bad = [];
    for (const id of ['modelBody', 'secModel', 'refBody', 'refPane', 'btnSecModel', 'modelNote']) {
      for (const [k, m] of [['F2', {}], ['Delete', {}], ['x', { ctrl: true }], ['c', { ctrl: true }], ['v', { ctrl: true }]]) {
        const prevented = treeKeyAt($(id), k, m);
        await sleep(20);
        if (prevented || nameInput() || confirms.length > nc || $('treeMsg').textContent !== msg0 || diskList(ctl).join(',') !== disk0 || alerts.length > na) bad.push(`${id}:${m.ctrl ? 'Ctrl+' : ''}${k}`);
      }
    }
    check(bad.length === 0, 'GR26 P5 K: 「モデル」の区画・参照箇所の欄・モデルツリーの本体・「モデル」の見出しに焦点があるときは、F2・Delete・Ctrl+X・Ctrl+C・Ctrl+V でファイルを操作しない(書き込み・削除の確認・名前の入力欄・知らせがなく、ブラウザの文字のコピーを止めない)', bad.join(','));
    // 「ファイル」の区画(木の欄そのもの・区画の中)に焦点があるときは、今のとおり動く
    const p1 = treeKeyAt($('tree'), 'c', { ctrl: true });
    const m1 = $('treeMsg').textContent;
    const p2 = treeKeyAt($('treeBody'), 'F2');
    const inp = nameInput();
    if (inp) enterName('', 'Escape');
    await sleep(30);
    check(p1 && /」をコピーしました/.test(m1) && p2 && !!inp, 'GR26 P5 K: 「ファイル」の区画に焦点があるとき(木の欄そのもの・区画の中の要素)は、今のとおり Ctrl+C でコピーし、F2 で名前の入力欄を出す', `${p1} ${m1} / ${p2} ${!!inp}`);
    check($('secModel').tabIndex === -1 && $('modelBody').tabIndex === 0, 'GR26 P5 K: 「モデル」の区画は焦点を受ける要素(tabIndex -1)で、区画の中を押しても焦点が木の欄そのものに行かない(モデルツリーの本体は前から tabIndex 0)', `${$('secModel').tabIndex} ${$('modelBody').tabIndex}`);
  }
  // ---- M: 型の一覧を開いたまま解析し直す・古い解析にする・ファイルを足すと、一覧が閉じ、古い移動先へ移らない
  {
    const openMenu = () => { $('typeMenu')?.remove?.(); mclick(mrow('予備の電池'), 'mty'); return $('typeMenu') ?? null; };
    const btnOf = (m) => m?.children.find((b) => b.textContent.startsWith('懐中電灯の部品::Battery')) ?? null;
    const r = {};
    // (a) 解析の結果を受け取る(ビューの切り替え。テキストは同じ)
    let m = openMenu();
    const opened = !!m && !!btnOf(m);
    { const n0 = results.length; $('viewKind').value = 'interconnection'; $('viewKind').dispatchEvent({ type: 'change' }); await waitFor(() => results.slice(n0).some((x) => x.text === treeKey())); }
    r.result = opened && !$('typeMenu') ? 'ok' : `${opened} ${!!$('typeMenu')}`;
    // (b) 古い解析にする(書き換え)。閉じる前の項目を押しても移らず、知らせを出す
    m = openMenu();
    const old1 = btnOf(m);
    const a = shownArea();
    const sel0 = JSON.stringify(shownSel());
    await typeAt26(a, '\n');
    r.stale = m && !$('typeMenu') ? 'ok' : 'x';
    old1?.click();
    r.staleClick = JSON.stringify(shownSel()) === sel0 && modelMsgText() === STALE ? 'ok' : `${JSON.stringify(shownSel())} ${modelMsgText()}`;
    await waitFor(() => results.some((x) => x.text === treeKey()) && !$('modelBody')._cls.has('stale'));
    // (c) ファイルを足す(「システム.sysml」を写す。「システム のコピー.sysml」がファイルの並びの先頭に入り、ファイルの番号が 1 つずれる)
    clickRow('システム.sysml');
    treeKeyAt($('tree'), 'c', { ctrl: true });
    m = openMenu();
    const old2 = btnOf(m);
    { const n0 = results.length; treeKeyAt($('tree'), 'v', { ctrl: true }); await waitFor(() => ctl.files.has('システム のコピー.sysml') && results.slice(n0).some((x) => x.text === treeKey()), 30000); }
    r.add = m && !$('typeMenu') && modelPaths()[0] === 'システム のコピー.sysml' ? 'ok' : `${!!$('typeMenu')} ${modelPaths()[0]}`;
    // 閉じる前の項目を、解析し直した後に押す(古い移動先 = 前の解析のファイルの番号では、別のファイルの誤った位置へ移っていた)
    old2?.click();
    const s1 = shownSel();
    r.oldClick = s1?.path === '部品/部品の定義.sysml' && s1.text === 'Battery' && s1.line === 5 ? 'ok' : selStr(s1);
    // ファイルの並びが変わった後に開き直した一覧から
    m = openMenu();
    btnOf(m)?.click();
    const s2 = shownSel();
    r.reopen = s2?.path === '部品/部品の定義.sysml' && s2.text === 'Battery' && s2.line === 5 && !$('typeMenu') ? 'ok' : selStr(s2);
    // ファイルを切り替えたときも閉じる
    m = openMenu();
    clickRow('定義の共通.sysml');
    r.file = m && !$('typeMenu') ? 'ok' : 'x';
    check(Object.values(r).every((x) => x === 'ok'), 'GR26 P5 M: 型の一覧は、解析の結果を受け取ったとき・古い解析になったとき・ファイルを足したとき(並びが変わる)・ファイルを切り替えたときに閉じ、閉じる前の項目を押しても古い移動先へ移らず(古い解析の間は知らせ、解析し直した後はそのときの結果から引き直して正しいファイルと字句へ)、開き直した一覧からも正しいファイルと字句(部品/部品の定義.sysml 5 行の Battery)へ移る', JSON.stringify(r));
  }
  // ---- S: 横の送り(項目・型・参照箇所の行・診断のクリック)
  {
    fixMeasure();
    for (const x of areas()) x.clientWidth = VIEW_W;
    const a = areaOf('システム.sysml');
    clickRow('システム.sysml');
    const far = `package '横の送り' {\n  part def Near;\n  part def Base2;\n${' '.repeat(380)}part def Far :> Base2;\n\t${' '.repeat(300)}\tpart def Tabbed;\n${' '.repeat(420)}part bad : '横の送り'::Nope;\n}\n`;
    { const n0 = results.length; a.value += far; a.dispatchEvent({ type: 'input' }); await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()) && !$('modelBody')._cls.has('stale'), 30000); }
    const r = {};
    a.scrollLeft = 0;
    mclick(mrow('Far'));
    r.far = { ...hscroll(a, 0), text: a.value.slice(a.selectionStart, a.selectionEnd) };
    // すでに見えていれば変えない
    const sl = a.scrollLeft;
    mclick(mrow('Far'));
    r.keep = { ...hscroll(a, sl), same: a.scrollLeft === sl };
    // タブを含む行
    a.scrollLeft = 0;
    mclick(mrow('Tabbed'));
    r.tab = { ...hscroll(a, 0), text: a.value.slice(a.selectionStart, a.selectionEnd) };
    // 行の始まりの近くの字句へ戻ると、左へ送る
    const sl2 = a.scrollLeft;
    mclick(mrow('Near'));
    r.back = hscroll(a, sl2);
    // 参照箇所の行(Base2 の特殊化の参照。Far の行の右のほう)
    a.scrollLeft = 0;
    mclick(mrow('Base2'));
    a.scrollLeft = 0;
    refClick(0);
    r.ref = { ...hscroll(a, 0), text: a.value.slice(a.selectionStart, a.selectionEnd) };
    // 診断のクリック(意味エラー S1 の 'Nope')
    a.scrollLeft = 0;
    const li = $('msg').querySelectorAll('li').find((x) => x.textContent.includes('(S1)') && x.textContent.includes('Nope'));
    li?.dispatchEvent({ type: 'click', target: li });
    r.diag = { ...hscroll(a, 0), li: !!li, text: a.value.slice(a.selectionStart, a.selectionEnd) };
    const ok = r.far.ok && r.far.text === 'Far' && !r.far.vis0 && r.keep.ok && r.keep.same && r.tab.ok && r.tab.text === 'Tabbed' && !r.tab.vis0 && r.back.ok && r.back.got === 0 && r.ref.ok && r.ref.text === 'Base2' && !r.ref.vis0 && r.diag.ok && r.diag.li && r.diag.text === "'横の送り'::Nope" && !r.diag.vis0;
    check(ok, 'GR26 P5 S: 長い行の右のほうの字句へ移ると(項目・参照箇所の行・診断のクリック)、scrollLeft が字句の始まりを見える幅の左から 4 分の 1 に置く値になり(色付けの層も同じ)、すでに見えていれば変えず、タブを含む行(tab-size 4)でも合い、行の始まりの近くへ戻ると左へ送る', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v.ok}/${v.text ?? ''}/${v.got}/${v.want}/${v.vis0}${v.li === false ? '/診断なし' : ''}`]))));
    // 書き足した分を戻す(後の検査に持ち込まない)
    { const n0 = results.length; a.value = a.value.slice(0, a.value.length - far.length); a.dispatchEvent({ type: 'input' }); await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()) && !$('modelBody')._cls.has('stale'), 30000); }
  }
  {
    // 参照箇所の行は 2 段(上の段に印と所属、下の段にファイルと行)。所属は bdi(左から右)に入れる
    mclick(mrow('懐中電灯の部品'));
    await sleep(10);
    const rows = $('refBody').children.filter((c) => c._cls.has('rrow'));
    const shape = rows.map((x) => `${x.children.map((c) => [...c._cls][0]).join('+')}:${x.children[0]?.children.map((c) => [...c._cls][0]).join('+')}:${x.children[0]?.children[1]?.children[0]?.tagName}/${x.children[0]?.children[1]?.children[0]?.getAttribute('dir')}`);
    check(rows.length > 0 && shape.every((x) => x === 'rtop+rloc:rar+rown:bdi/ltr'), 'GR26 P5 H: 参照箇所の行は 2 段(上の段 .rtop に役割の印と所属 .rown、下の段 .rloc にファイルの相対パスと行)で、所属は左から右の向きの bdi に入れる', shape.join(' / '));
  }
  for (const id of ['tree', 'secFiles', 'secModel', 'treeEmpty']) delete $(id).getBoundingClientRect;
  // ---- J: 移動で選ぶ字句(1 つのテキスト)
  {
    confirmAnswer = true;
    { const n1 = results.length; $('btnNew').click(); await waitFor(() => results.length > n1 && $('tree')._cls.has('nofolder'), 20000); }
    const n0 = results.length;
    $('src').value = J_TEXT;
    $('src').dispatchEvent({ type: 'input' });
    await waitFor(() => results.slice(n0).some((x) => x.text === J_TEXT) && !$('modelBody')._cls.has('stale'), 30000);
    for (const q of ['J::Q', 'J::SD', 'J::UC', 'J::A', 'J::A::snd', 'J::A::acc', 'J::A::asg']) { const [n, ...rest] = q.split('::').reverse(); mopen(n, q); }
    // [項目の名前, 修飾名(同じ名前を見分ける), 選ぶ字句, その字句のある行の中身の一部]
    const want = [
      ['Sig', 'J::Sig', 'Sig', 'item def Sig'], ['entry の行動', null, 'entry', 'entry; then s1'], ['継承 entry → s1', null, 'then', 'entry; then s1'],
      ['遷移 s1 → s2', null, 'transition', 'transition first s1'], ['要求の使用', null, 'objective', 'objective;'], ['光量', 'J::A::光量', "'光量'", "attribute :>> '光量'"],
      ['drive', null, 'drive', 'perform drive;', 'PerformActionUsage'], ['st', null, 'st', 'exhibit st;', 'ExhibitStateUsage'], ['uc', null, 'uc', 'include uc;', 'IncludeUseCaseUsage'],
      ['perform p.drive2', null, 'drive2', 'perform p.drive2'], ['継承 a1 → a2', null, 'first', 'first a1 then a2'], ['送信 Sig() → p', null, 'send', 'send Sig()'],
      ['受信 Sig', null, 'accept', 'accept Sig via'], ['代入 v', null, 'assign', 'assign v := 5'], ['接続 p.pp – p.pp', null, 'connect', 'connect p.pp'], ['フロー p.pp → p.pp', null, 'flow', 'flow p.pp'],
    ];
    const bad = [];
    for (const [name, q, tok, line, kind] of want) {
      const row = mrows().find((x) => x.name === name && (!q || x.title.split('\n')[0] === q) && (!kind || x.el.title.includes(kind) || true) && (!kind || kindOfRow(x) === kind));
      if (!row) { bad.push(`${name}: 項目がない`); continue; }
      mclick(row);
      const s = $('src'), t = s.value.slice(s.selectionStart, s.selectionEnd);
      const ln = s.value.split('\n')[s.value.slice(0, s.selectionStart).split('\n').length - 1];
      if (t !== tok || !ln.includes(line)) bad.push(`${name}: 「${t}」 ${ln.trim()}`);
    }
    check(bad.length === 0, `GR26 P5 J: 移動で選ぶ字句が、指示書 3.4 節の一覧のとおり(名前を宣言した要素は名前、名前を宣言せずに参照する名前を出す要素はその参照の名前(連鎖は最後の区切り)、それ以外は宣言の始まりの字句。${want.length} 種類)`, bad.join(' / '));
    // T: 項目の並び(印・名前・型と多重度・種類の順)と、マウスを載せたときの文(修飾名・ファイルと行・種類・型と多重度)
    const p = mrows().find((x) => x.name === 'p' && x.title.split('\n')[0] === 'J::A::p');
    check(!!p && JSON.stringify(rowKids(p)) === JSON.stringify(['tw', 'mdu', 'nm', 'mty', 'mkd']) && p.title.split('\n')[0] === 'J::A::p' && /^\d+ 行$/.test(p.title.split('\n')[1]) && p.title.includes('種類: 部品の使用') && p.title.includes('型と多重度: Q'),
      'GR26 P5 T: 項目の並びが印・名前・型と多重度・種類の順で、マウスを載せると修飾名・行・種類・型と多重度を出す', JSON.stringify({ kids: p && rowKids(p), title: p?.title }));
    // GR26 の P6 で置き換えた(予定の red の 1。Q): 前は「修飾名に「(名前なし)」の区切りがある項目が 1 つ以上ある」ことを確かめていた。名前のない
    // 要素の区切りは、要約をかっこで囲む(要約がないときだけ「(名前なし)」)ので、名前のない項目の修飾名の最後の区切りが「(項目の名前)」であることを確かめる
    const un = mrows().filter((x) => x.el.children.some((c) => c._cls.has('unnamed')));
    check(un.length > 0 && un.every((x) => x.title.split('\n')[0].split('::').at(-1) === (x.name === '(名前なし)' ? x.name : `(${x.name})`)) && mrows().every((x) => !x.title.includes('((')), 'GR26 P5 T: 名前のない要素の修飾名の区切りは、要約をかっこで囲み(要約がなければ「(名前なし)」)、かっこを重ねない', un.slice(0, 3).map((x) => x.title.split('\n')[0]).join(' / '));
  }
  // ---- P: テキストが変わらない解析の結果(ビュー・範囲の切り替え)では、モデルツリーと参照箇所を作り直さない
  {
    mclick(mrows().find((x) => x.name === 'Sig'));
    const before = [...$('modelBody').children], refs0 = [...$('refBody').children];
    const n0 = results.length;
    $('viewKind').value = 'interconnection'; $('viewKind').dispatchEvent({ type: 'change' });
    await waitFor(() => results.slice(n0).some((x) => x.text === J_TEXT), 30000);
    const n1 = results.length;
    const sc = $('scope').options.find((x) => x.value !== $('scope').value);
    if (sc) { $('scope').value = sc.value; $('scope').dispatchEvent({ type: 'change' }); await waitFor(() => results.length > n1, 30000); }
    const same = $('modelBody').children.length === before.length && $('modelBody').children.every((x, i) => x === before[i]) && $('refBody').children.every((x, i) => x === refs0[i]);
    const n2 = results.length;
    $('src').value = J_TEXT.replace('item def Sig;', 'item def Sig; item def Sig2;');
    $('src').dispatchEvent({ type: 'input' });
    await waitFor(() => results.slice(n2).some((x) => x.text === $('src').value) && !$('modelBody')._cls.has('stale'), 30000);
    const rebuilt = $('modelBody').children.some((x) => !before.includes(x)) && mrows().some((x) => x.name === 'Sig2');
    check(same && rebuilt && !!sc, 'GR26 P5 P: ビュー・範囲の切り替えだけの解析の結果では、モデルツリーと参照箇所の行の要素が同じもののまま(作り直さない)。テキストを変えたときは作り直す', `${same} ${rebuilt} ${!!sc} ${$('scope').options.map((x) => `${x.value}=${x.textContent}`).join(',')}`);
  }
  // ---- A: 書き換えの後に、前のテキストの解析の結果が届いても、古い解析の印を外さない。今のテキストの結果で、印と知らせが消える
  {
    const t0 = $('src').value;
    hold.on = true;
    const n0 = results.length;
    $('viewKind').value = 'interconnection'; $('viewKind').dispatchEvent({ type: 'change' });
    await waitFor(() => hold.queue.length > 0, 30000);
    $('src').value = `${t0}\n`;
    $('src').dispatchEvent({ type: 'input' });
    hold.release();
    await waitFor(() => results.slice(n0).some((x) => x.text === t0), 10000);
    const keep = $('modelBody')._cls.has('stale') && $('refPane')._cls.has('stale') && $('modelNote').textContent.includes('解析し直しています');
    const s0 = $('src').selectionStart;
    mclick(mrows().find((x) => x.name === 'Sig'));
    const msg = modelMsgText();
    const noMove = $('src').selectionStart === s0;
    hold.on = false;
    hold.release();
    const t1 = $('src').value;
    const t = Date.now();
    await waitFor(() => results.some((x) => x.text === t1) && !$('modelBody')._cls.has('stale'), 30000);
    const cleared = !$('modelBody')._cls.has('stale') && !$('refPane')._cls.has('stale') && !$('modelNote').textContent.includes('解析し直しています') && modelMsgText() === '' && Date.now() - t < 4500;
    check(keep && msg === STALE && noMove && cleared, 'GR26 P5 A: 書き換えの後に前のテキストの解析の結果が届いても、古い解析の印(薄く出すことと「解析し直しています」)を外さず、押しても移らない。今のテキストの解析の結果が届くと、印と、押したときの知らせが(5 秒を待たずに)消える', JSON.stringify({ keep, msg, noMove, cleared }));
  }
  check(errors.length === 0 && alerts.length === 0, 'GR26 P5: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}
// ---- GR26 の P6 の検査(--gr26p6 [--ro] [--built]。GR26 指示書 v26.3 の 4 章の B・Y・Q の画面の部分。設計書 9.5 節の「区画の高さ」「項目の表示」
// 「開閉と選択」)。B は、木の欄の上の帯(#treeHead)の高さを偽の getBoundingClientRect で与える: フォルダを開いていない(.nofolder)か、フォルダの
// 名前の行が空なら 33px、名前の行があれば 51px(名前の 1 行 18px。指示書 2 章のアシスタントの実測のはみ出しと同じ値)。--ro なら偽の ResizeObserver
// で帯の高さの変化を知らせ、なければ(ResizeObserver のないブラウザの形)窓の大きさの変化で付け直すことを確かめる
const GR26P6 = GR26P6_ARG, GR26P6_BUILT = GR26P6 && process.argv.includes('--built'), GR26P6_RO = GR26P6 && process.argv.includes('--ro');
async function gr26p6() {
  // ---- B: フォルダを開いた・閉じた後と、帯の高さが変わった後の区画と欄の高さ
  let TH = 600, extra = 0;
  const fh = () => parseFloat($('secFiles').style.height), mh = () => parseFloat($('secModel').style.height), rh = () => parseFloat($('refPane').style.height);
  const headH = () => ($('tree')._cls.has('nofolder') || !$('treeName').textContent ? 33 : 51) + extra;
  $('tree').getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: TH, width: 200, height: TH });
  $('treeHead').getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: headH(), width: 200, height: headH() });
  $('secFiles').getBoundingClientRect = () => ({ top: headH(), bottom: headH() + fh(), height: fh() });
  $('secModel').getBoundingClientRect = () => ({ top: TH - mh(), bottom: TH, height: mh() });
  $('treeEmpty').getBoundingClientRect = () => ({ top: 22, bottom: 172, height: 150 });
  const resize = () => { for (const h of winLs.resize ?? []) h({ type: 'resize' }); };
  const drag = (id, y) => { $(id).dispatchEvent({ type: 'mousedown', target: $(id), preventDefault() {} }); for (const h of winLs.mousemove ?? []) h({ type: 'mousemove', clientX: 100, clientY: y }); for (const h of winLs.mouseup ?? []) h({ type: 'mouseup' }); };
  const now = () => ({ head: headH(), f: fh(), m: mh(), r: rh(), sum: fh() + 4 + mh() });
  // 区画と欄の高さの和が、木の欄の高さから帯の高さを引いたものを超えず(ちょうど使い切り)、参照箇所の欄が「モデル」の区画の中に収まる
  const fits = (z) => z.sum <= TH - z.head + 0.5 && Math.abs(z.sum - (TH - z.head)) < 0.5 && z.r <= z.m && z.f > 0 && z.m > 0 && z.r > 0;
  resize();
  const b = { start: now() };
  let o = await g26Open();
  check(!!o, 'GR26 P6: 試しのフォルダを開ける', '');
  if (!o) return;
  b.open = now();
  drag('secSplit', 300);
  b.drag = now();
  check(fits(b.start) && b.start.head === 33 && fits(b.open) && b.open.head === 51 && fits(b.drag),
    'GR26 P6 B: フォルダを開いた後(帯にフォルダの名前の行が入り、帯が 33px から 51px になった後)の区画と欄の高さの和が、木の欄の高さから帯の高さを引いたものを超えない(開く前と、分割バーを引いた後も)', JSON.stringify(b));
  if (GR26P6_RO) {
    const observed = roList.some((x) => x.els.includes($('treeHead')));
    extra = 20; roFire(); b.taller = now();
    extra = 0; roFire(); b.back = now();
    check(observed && fits(b.taller) && b.taller.head === 71 && fits(b.back) && b.back.head === 51,
      'GR26 P6 B: 帯の高さが変わったとき(ボタンの折り返しなど)は、ResizeObserver で帯の大きさの変化を見て、区画と欄の高さを割合から付け直す', JSON.stringify({ observed, taller: b.taller, back: b.back }));
  } else {
    extra = 20; resize(); b.taller = now();
    extra = 0; resize(); b.back = now();
    check(roList.length === 0 && fits(b.taller) && fits(b.back),
      'GR26 P6 B: ResizeObserver のないブラウザでも、窓の大きさが変わったときに、そのときの帯の高さで区画と欄の高さを付け直す', JSON.stringify({ taller: b.taller, back: b.back }));
  }
  {
    confirmAnswer = true;
    const n1 = results.length;
    $('btnNew').click();
    await waitFor(() => results.length > n1 && $('tree')._cls.has('nofolder'), 20000);
    b.closed = now();
    o = await g26Open();
    b.reopen = now();
    check(fits(b.closed) && b.closed.head === 33 && !!o && fits(b.reopen) && b.reopen.head === 51,
      'GR26 P6 B: フォルダを閉じた後(「新規」。帯が 33px に戻る)と、開き直した後も、区画と欄の高さの和が木の欄の高さから帯の高さを引いたものを超えない', JSON.stringify({ closed: b.closed, reopen: b.reopen }));
  }
  if (!o) return;
  // ---- Y: 型か多重度を出す項目は、行に typed の印を付ける(style.css で名前を縮め、型と多重度に最小の幅を残す)。型も多重度もない項目には付けない
  {
    mselect('懐中電灯の部品::Flashlight');
    mopen('Flashlight', '懐中電灯の部品::Flashlight');
    const den =mrow('電池', '懐中電灯の部品::Flashlight::電池'), lamp = mrow('ランプ', '懐中電灯の部品::Flashlight::ランプ'), fl = mrow('Flashlight', '懐中電灯の部品::Flashlight');
    const con = mrow('接続 電池.正極 – スイッチ.入口');
    check(den?.cls.includes('typed') && den.types && den.mult && lamp?.cls.includes('typed') && fl && !fl.cls.includes('typed') && con && !con.cls.includes('typed'),
      'GR26 P6 Y: 型か多重度を出す項目(電池 : Battery [2]・ランプ : Lamp)の行には typed の印を付け、型も多重度もない項目(Flashlight・接続)には付けない', JSON.stringify({ den: den?.cls, lamp: lamp?.cls, fl: fl?.cls, con: con?.cls }));
  }
  // ---- Q: 名前のない要素の修飾名の区切りは、要約をかっこで囲む(参照箇所の所属・マウスを載せたときの修飾名)
  {
    const want = {
      '懐中電灯の部品::Battery::正極': ['接続の端(1): 懐中電灯の部品::Flashlight::(接続 電池.正極 – スイッチ.入口) @ 部品/部品の定義.sysml 30 行', '流れの元(1): 懐中電灯の部品::Flashlight::(フロー 電池.正極 → ランプ.入口) @ 部品/部品の定義.sysml 33 行'],
      '振る舞い::懐中電灯の状態::オフ': ['継承の先(1): 振る舞い::懐中電灯の状態::(継承 entry → オフ) @ 振る舞い/状態と手順.sysml 6 行', '遷移の元(1): 振る舞い::懐中電灯の状態::つける @ 振る舞い/状態と手順.sysml 9 行', '遷移の先(1): 振る舞い::懐中電灯の状態::消す @ 振る舞い/状態と手順.sysml 10 行'],
      '振る舞い::点灯の手順::スイッチを押す': ['継承の元(1): 振る舞い::点灯の手順::(継承 スイッチを押す → 光を確かめる) @ 振る舞い/状態と手順.sysml 17 行', '継承の先(1): 振る舞い::点灯の手順::(継承 電池を入れる → スイッチを押す) @ 振る舞い/状態と手順.sysml 16 行'],
      '共通の定義::電圧値': ['型付け(2): 共通の定義::端子::電圧 @ 定義の共通.sysml 6 行 | 懐中電灯の部品::Battery::定格電圧 @ 部品/部品の定義.sysml 6 行', '流れの運ぶもの(of)(1): 懐中電灯の部品::Flashlight::(フロー 電池.正極 → ランプ.入口) @ 部品/部品の定義.sysml 33 行'],
      '共通の定義::ボタン操作': ['受け取りの型(2): 振る舞い::懐中電灯の状態::つける::(受信 押す)::押す @ 振る舞い/状態と手順.sysml 9 行 | 振る舞い::懐中電灯の状態::消す::(受信 押す)::押す @ 振る舞い/状態と手順.sysml 10 行'],
    };
    const bad = [];
    for (const [q, w] of Object.entries(want)) {
      if (!mselect(q)) { bad.push(`${q}: 項目がない`); continue; }
      await sleep(10);
      const g = groupsOf(refPane());
      if (JSON.stringify(g) !== JSON.stringify(w)) bad.push(`${q}: ${g.join(' / ')}`);
    }
    check(bad.length === 0, 'GR26 P6 Q: 名前のない要素(接続・流れ・継承・受信)を持ち主に持つ参照箇所の所属が、その要素の要約をかっこで囲んだ形(「…::Flashlight::(接続 電池.正極 – スイッチ.入口)」「…::つける::(受信 押す)::押す」など)になる', bad.join(' || '));
    // マウスを載せたときの修飾名(1 行目)
    mselect('振る舞い::懐中電灯の状態::つける');
    mopen('つける', '振る舞い::懐中電灯の状態::つける');
    mopen('受信 押す', '振る舞い::懐中電灯の状態::つける::(受信 押す)');
    mselect('懐中電灯の部品::Flashlight');
    const t1 = mrow('接続 電池.正極 – スイッチ.入口')?.title.split('\n')[0], t2 = mrow('受信 押す', '振る舞い::懐中電灯の状態::つける::(受信 押す)')?.title.split('\n')[0];
    const t3 = mrow('押す', '振る舞い::懐中電灯の状態::つける::(受信 押す)::押す')?.title.split('\n')[0];
    const unnamed = mrows().filter((r) => r.el.children.some((c) => c._cls.has('unnamed')));
    const badT = unnamed.filter((r) => r.title.split('\n')[0].split('::').at(-1) !== (r.name === '(名前なし)' ? r.name : `(${r.name})`) || r.title.includes('((')).map((r) => r.title.split('\n')[0]);
    check(t1 === '懐中電灯の部品::Flashlight::(接続 電池.正極 – スイッチ.入口)' && t2 === '振る舞い::懐中電灯の状態::つける::(受信 押す)' && t3 === '振る舞い::懐中電灯の状態::つける::(受信 押す)::押す' && unnamed.length >= 5 && badT.length === 0,
      'GR26 P6 Q: マウスを載せたときの修飾名も、名前のない要素の区切りを要約をかっこで囲んで書き(かっこを重ねない)、名前のない項目の修飾名の最後の区切りは「(項目の名前)」', JSON.stringify({ t1, t2, t3, n: unnamed.length, badT }));
    // 解析し直した後(前に 1 行足して位置がずれた後)も、名前のない要素(受信 押す)の開閉と、その中の要素(押す)の選択を保つ(同一性の鍵は P5 と同じ)
    mclick(mrow('押す', '振る舞い::懐中電灯の状態::つける::(受信 押す)::押す'));
    const selBefore = mrows().filter((x) => x.cls.includes('sel')).map((x) => x.title.split('\n')[0]);
    clickRow('振る舞い/状態と手順.sysml');
    const A = areaOf('振る舞い/状態と手順.sysml');
    const n0 = results.length;
    caretAt(A, 0);
    typeChars(A, '// 前に 1 行\n');
    await waitFor(() => results.slice(n0).some((x) => x.text === treeKey()) && !$('modelBody')._cls.has('stale'), 30000);
    await sleep(30);
    const sel = mrows().filter((x) => x.cls.includes('sel')).map((x) => x.title.split('\n')[0]);
    const acc = mrow('受信 押す', '振る舞い::懐中電灯の状態::つける::(受信 押す)'), osu = mrow('押す', '振る舞い::懐中電灯の状態::つける::(受信 押す)::押す');
    check(JSON.stringify(selBefore) === JSON.stringify(['振る舞い::懐中電灯の状態::つける::(受信 押す)::押す']) && JSON.stringify(sel) === JSON.stringify(selBefore) && acc?.twisty === '▾' && osu?.title.includes('振る舞い/状態と手順.sysml 10 行'),
      'GR26 P6 Q: 解析し直した後も、名前のない要素(受信 押す)の開閉と、その中の要素(押す)の選択を保ち、行の位置は新しい記述に合う', JSON.stringify({ selBefore, sel, acc: acc?.twisty, osu: osu?.title }));
  }
  for (const id of ['tree', 'treeHead', 'secFiles', 'secModel', 'treeEmpty']) delete $(id).getBoundingClientRect;
  check(errors.length === 0 && alerts.length === 0, 'GR26 P6: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
}
// 項目の種類(マウスを載せたときの文の「種類: …」でなく、Worker の木の種類。偽の DOM の行には出ないので、行の番号から最後の結果の木を引く)
function kindOfRow(x) { const o = results.at(-1)?.m.outline; return o?.items[+x.id]?.kind ?? null; }

// ---- GR27 の検査(--gr27。GR27 指示書 4 章の O・L。設計書 9.5 節の「作り直し」と 5 章の大きいファイルの知らせ)。--built なら、src/app/main.js の
// 代わりにビルドした HTML のスクリプトで(GR25 の形)
//   O: 例を開いた結果にはモデルツリーがあり、ビューを替えた結果にはない(画面は前のモデルツリーをそのまま出す)。同じテキストを「開く」で
//      開き直すと(画面がモデルツリーを忘れる)、結果にモデルツリーが入り、木を出す。範囲の欄の候補(値と文字)が、受け渡しの形から
//      組み立てた後も今と同じ(例の 2 つのビューと、部品の入れ子 300 段)。木の行のマウスを載せたときの修飾名が今と同じ
//   L: 1,000,000 バイトちょうどのファイルを開いても知らせは出ず、1 バイト超えると出る。フォルダの .sysml の合計でも出る(ちょうどなら出ない)。
//      書き換え・貼り付けで 1,000,000 バイトを超えたときに 1 回だけ出し、超えたまま書き換えても出し直さない
//   Q(GR27 P4): 図の要素・線を選んだときの編集欄の「修飾名:」が、描画の関数の構造の info.qname と同じ(例を開いた一般ビューと、部品の入れ子
//      300 段の相互接続ビューの全要素)。Worker の結果の構造は受け渡しの形(info に qname を持たない)
const GR27 = process.argv.includes('--gr27'), GR27_BUILT = GR27 && process.argv.includes('--built');
async function gr27() {
  const V = await import('../../src/view/index.js');
  const scopeRows = () => $('scope').options.map((o) => `${o.value}|${o.textContent}`);
  const wantScope = (text, key) => V.prepareView(text)[key].map((c) => `${c.id}|${c.label}`);
  const treeRows = () => mrows().map((r) => `${r.depth}|${r.name}|${r.title}`);
  // O: 例を開く(一般ビュー)→ 相互接続ビューに替える
  const r1 = (await pickSample('機能紹介')).r;
  const t1 = $('src').value;
  const rows1 = treeRows();
  // Q(GR27 P4): 例を開いた図(一般ビュー)の全要素・線で、選んだときの「修飾名:」が描画の関数の構造の info.qname と同じ
  {
    const p1 = V.prepareView(t1);
    const st1 = V.renderGeneral(p1, r1.m.candidate.id).structure;
    let n = 0, bad = null;
    for (const x of [...(st1.frame ? [] : []), ...st1.nodes, ...st1.edges]) {
      if (!x.info) continue;
      const g = $('canvas').querySelector(`[data-id="${CSS.escape(x.id)}"]`);
      if (!g) continue;
      $('canvas').dispatchEvent({ type: 'click', target: g });
      n++;
      const got = $('edit').children.find((c) => c.textContent.startsWith('修飾名: '))?.textContent.slice(5) ?? null;
      if (got !== (x.info.qname || null)) bad ??= `${x.id}: ${got} / ${x.info.qname}`;
    }
    check(r1.m.view === 'general' && n > 10 && !bad && errors.length === 0, 'GR27 Q: 例を開いた一般ビューで、図の要素と線を選んだときの「修飾名:」が今と同じ(受け渡しの形から画面で組み立てたもの)', bad ?? `${n} 件`);
    $('canvas').dispatchEvent({ type: 'click', target: $('canvas') });
  }
  let n0 = results.length;
  $('viewKind').value = 'interconnection'; $('viewKind').dispatchEvent({ type: 'change' });
  const r2 = await resultFor(t1, n0);
  const rows2 = treeRows();
  check(!!r1 && 'outline' in r1.m && !!r2 && !('outline' in r2.m) && rows1.length > 3 && JSON.stringify(rows1) === JSON.stringify(rows2) && errors.length === 0,
    'GR27 O: 例を開いた結果にはモデルツリーがあり、ビューを替えた結果にはない。画面は前のモデルツリーをそのまま出す', `開いたとき ${r1 && 'outline' in r1.m}、替えたとき ${r2 && 'outline' in r2.m}、行 ${rows1.length} → ${rows2.length} ${errors.join(' / ')}`);
  check(JSON.stringify(scopeRows()) === JSON.stringify(wantScope(t1, 'candidates')), 'GR27 O: 相互接続ビューの範囲の欄の候補(値と文字)が、受け渡しの形から組み立てた後も今と同じ', `${scopeRows().slice(0, 2)} / ${wantScope(t1, 'candidates').slice(0, 2)}`);
  // 同じテキストを「開く」で開き直す(画面はモデルツリーを忘れる)→ 結果にモデルツリーが入り、木を出す(開閉は始めの状態)
  const r3 = await openBy('open', 'again.sysml', t1);
  check(!!r3 && 'outline' in r3.m && JSON.stringify(treeRows()) === JSON.stringify(rows1) && errors.length === 0, 'GR27 O: 同じテキストを「開く」で開き直すと、Worker の前の解析と同じテキストでも結果にモデルツリーが入り(needOutline)、木を始めの開閉で出す',
    `結果 ${r3 ? 'outline' in r3.m : '来ない'}、行 ${treeRows().length}`);
  check(JSON.stringify(scopeRows()) === JSON.stringify(wantScope(t1, 'generalCandidates')) || JSON.stringify(scopeRows()) === JSON.stringify(wantScope(t1, 'candidates')), 'GR27 O: 開き直した後の範囲の欄の候補が今と同じ', scopeRows().slice(0, 2).join(' '));
  // 部品の入れ子 300 段: 範囲の欄(相互接続ビュー)と木の行の修飾名
  const deep = (() => { const L = []; for (let i = 0; i < 299; i++) L.push(`part n${i} {`); L.push('part n299;'); for (let i = 0; i < 299; i++) L.push('}'); return L.join('\n') + '\n'; })();
  const r4 = await openBy('open', 'deep.sysml', deep);
  n0 = results.length;
  if ($('viewKind').value !== 'interconnection') { $('viewKind').value = 'interconnection'; $('viewKind').dispatchEvent({ type: 'change' }); await resultFor(deep, n0); }
  for (let i = 0; i < 3; i++) { const r = mrows().find((x) => x.twisty === '▸'); if (r) mclick(r, 'tw'); }
  const titles = mrows().map((r) => r.title.split('\n')[0]);
  // GR27 P5 の S(予定の red の 3): 候補の文字は、修飾名が 60 字を超えるとき前を「…::」で省く(sRule。設計書 5 章の終わり)。値と、60 字以下の文字は今と同じ
  const wantScopeS = (text, key) => V.prepareView(text)[key].map((c) => `${c.id}|${sRule(c.label)}`);
  check(!!r4 && JSON.stringify(scopeRows()) === JSON.stringify(wantScopeS(deep, 'candidates')) && scopeRows().length === 299, 'GR27 O: 部品の入れ子 300 段の範囲の欄の候補(299 件。値と文字。文字は 60 字を超える修飾名の前を「…::」で省いたもの)が、受け渡しの形から組み立てた後も今と同じ', `${scopeRows().length} 件 ${scopeRows().at(-1)?.slice(0, 80)}`);
  check(JSON.stringify(titles.slice(0, 4)) === JSON.stringify(['n0', 'n0::n1', 'n0::n1::n2', 'n0::n1::n2::n3']) && errors.length === 0, 'GR27 O: 部品の入れ子の木の行の、マウスを載せたときの修飾名が今と同じ(親の修飾名に自分の名前をつないだもの)', titles.slice(0, 4).join(' / '));
  // Q(GR27 P4): 図の要素を選んだときの編集欄の「修飾名:」が、描画の関数の構造の info.qname と同じ(部品の入れ子 300 段の相互接続ビューの全要素と、
  // 例の一般ビューの全要素・線)。Worker の結果の構造は受け渡しの形(info に qname がない)
  const qOf = () => $('edit').children.find((c) => c.textContent.startsWith('修飾名: '))?.textContent.slice(5) ?? null;
  const clickAll = (st) => {
    let n = 0, bad = null;
    for (const x of [...st.nodes, ...st.edges]) {
      if (!x.info) continue;
      const g = $('canvas').querySelector(`[data-id="${CSS.escape(x.id)}"]`);
      if (!g) continue;
      $('canvas').dispatchEvent({ type: 'click', target: g });
      n++;
      const want = x.info.qname ? x.info.qname : null;
      if (qOf() !== want) bad ??= `${x.id}: ${qOf()} / ${want}`;
    }
    return { n, bad };
  };
  const rq = results.at(-1);
  const pq = V.prepareView(deep);
  const sq = V.renderInterconnection(pq, rq.m.candidate.id).structure;
  const q1 = clickAll(sq);
  check(q1.n >= 299 && !q1.bad && !JSON.stringify(rq.m.structure).includes('"qname"') && errors.length === 0, 'GR27 Q: 部品の入れ子 300 段の相互接続ビューで、図の要素を選んだときの「修飾名:」が今と同じ(Worker の結果の構造は qname を持たない受け渡しの形)', q1.bad ?? `${q1.n} 件`);
  // L: 大きいファイルの知らせ
  const note = () => $('msg').children.find((c) => c._cls.has('bignote'))?.textContent ?? null;
  const big = (n) => { const head = 'package P { part def A; }\n// '; return head + 'x'.repeat(n - head.length - 1) + '\n'; };
  const b0 = big(1000000), b1 = big(1000001);
  const rb0 = await openBy('open', 'b0.sysml', b0);
  const n0a = note();
  const rb1 = await openBy('open', 'b1.sysml', b1);
  const n1a = note();
  check(!!rb0 && !!rb1 && n0a === null && n1a === '大きいファイル(1,000,001 バイト)なので、解析に時間がかかります', 'GR27 L: 1,000,000 バイトちょうどのファイルを開いても知らせは出ず、1 バイト超えると診断の欄の上に出る(解析の結果を出した後も残す)', `${n0a} / ${n1a}`);
  // 書き換え・貼り付け: 小さいテキストから 1,000,000 バイトを超えたときに出し、超えたまま書き換えても出し直さない
  await typeText('package Q;\n');
  const s0 = note();
  const p1 = big(1000005);
  await typeText(p1);
  const s1 = note();
  await typeText(p1.replace('part def A;', 'part def B;'));
  const s2 = note();
  check(s0 === null && s1 === '大きいファイル(1,000,005 バイト)なので、解析に時間がかかります' && s2 === null, 'GR27 L: 書き換え・貼り付けで 1,000,000 バイトを超えたときに 1 回だけ出し、超えたまま書き換えても出し直さない', `${s0} / ${s1} / ${s2}`);
  // フォルダ: .sysml の合計(ちょうどなら出ない、超えると出る)。.sysml でないファイルは数えない
  const half = (n, nm) => { const head = `package ${nm} { part def A; }\n// `; return head + 'y'.repeat(n - head.length - 1) + '\n'; };
  const f0 = await loadBy('picker', 'big0', { 'a.sysml': half(500000, 'A0'), 'b.sysml': half(500000, 'B0'), 'c.txt': 'z'.repeat(10) });
  const fn0 = note();
  const f1 = await loadBy('picker', 'big1', { 'a.sysml': half(500000, 'A1'), 'b.sysml': half(500001, 'B1') });
  const fn1 = note();
  check(!!f0 && !!f1 && fn0 === null && fn1 === '大きいフォルダ(.sysml の合計 1,000,001 バイト)なので、解析に時間がかかります' && errors.length === 0, 'GR27 L: フォルダの .sysml の合計が 1,000,000 バイトちょうどなら出ず、超えると出る', `${fn0} / ${fn1} ${errors.join(' / ')}`);
}

// ---- GR27 P5 の検査(--gr27p5 [--built]。GR27 指示書 v27.4 の 3.2 節・3.3 節・4 章の S・M。設計書 5 章の終わり・9.5 節)。--built なら、
// src/app/main.js の代わりにビルドした HTML のスクリプトで(GR25 の形)
//   S: 範囲の欄の候補の文字が、修飾名が 60 字以下なら今の文字(label)と同じで、60 字を超えるなら前を「…::」で省いた文字(規則はこの検査の中で
//      別に書いたもの sRule)。値(value)は候補の id のまま。範囲の欄の title は、選んでいる候補の文字の全部(label)だけで、選び直すと入れ直す。
//      option には title を付けない。入力は 2 つの例・試しのフォルダ・部品の入れ子 300 段(C4_part_D300 と同じ形)・パッケージの入れ子 2000 段
//      (C4_pkg_D2000 と同じ形)
//   M: 行が 6,000 を超える木(C3_1MB に当たるもの。この検査の中で作る)で、並べる行の数が、見えている範囲で決まる値(画面 3 枚分。偽の DOM の
//      本体の高さ 600px、行の高さ 20px なら 90 行)以下。スクロールの位置ごとに並ぶ行が、全部を並べたときの同じ位置の行と同じ(文字・印・型・
//      種類・data-id・字下げ・開閉の印・マウスを載せたときの文・選択の印)。上と下の空きの高さが、並べていない行の数 × 行の高さ。
//      スクロールした位置での開閉・選択・移動、選んだ項目が並べる範囲の外に出ても選択と参照箇所の欄を保つこと、解析し直した後の開閉と選択、
//      本体の高さが変わったときの入れ直し、すべて折りたたむ
// node tests/view/app_main.mjs --gr27p5 --dump <ファイル> [--mfile <.sysml>] は、検査の代わりに、モデルツリーの全部の行と範囲の欄の中身
//   (と「view を書き足す」の書いた文字)を JSON に書き出す(直す前と後のコードで同じ形に書き、tools/perf/gr27_p5cmp.mjs で比べる)。
//   直す前のコード(行をすべて並べる)でも動くよう、全部の行は、本体の高さを大きくして並べ直してから読む
const GR27P5 = process.argv.includes('--gr27p5'), GR27P5_BUILT = GR27P5 && process.argv.includes('--built');
const p5arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
// 行が 6,000 を超える木: パッケージ k 個(根の要素なので開いて始まる)の中に、10 個ずつ定義と使用(型と多重度を持つものを含む)
const p5Big = (k) => {
  const L = [];
  for (let i = 0; i < k; i++) {
    const s = String(i).padStart(4, '0');
    L.push(`package P${s} {`, `    part def A${s} { part x : B${s} [1..*]; port p; }`, `    part def B${s};`, `    part a${s} : A${s} [2];`, `    part b${s} : B${s};`,
      `    port def Q${s};`, `    attribute def V${s};`, `    action def Act${s} { action s1; }`, `    state def St${s};`, `    item def It${s};`, `    attribute v${s} : V${s};`, '}');
  }
  return L.join('\n') + '\n';
};
const p5PkgNest = (D) => { const L = []; for (let i = 0; i < D; i++) L.push(`package n${i} {`); L.push('part def X;'); for (let i = 0; i < D; i++) L.push('}'); return L.join('\n') + '\n'; };
const p5PartNest = (D) => { const L = []; for (let i = 0; i + 1 < D; i++) L.push(`part n${i} {`); L.push(`part n${D - 1};`); for (let i = 0; i + 1 < D; i++) L.push('}'); return L.join('\n') + '\n'; };
// 範囲の欄の文字の規則(設計書 5 章の終わり。画面の src/app/modeltree.js の candidateTexts とは別に書いたもの)。label は「種類の語 修飾名」と、
// フォルダのときの後ろの「(相対パス …)」。.sysml を含む半角のかっこ。修飾名の区切りは、label の中の「::」で切る(この検査の入力の名前は「::」を含まない)
const P5_MAX = 60;
const cps = (s) => [...s].length;
function sRule(label) {
  const m = /^(part def |part |package |view )(.*?)((?:\([^()]*\.sysml(?: \d+)?\))?)$/u.exec(label);
  if (!m) return label;
  const [, lp, P, ls] = m;
  if (cps(P) <= P5_MAX) return label;
  const seg = P.split('::');
  const keep = [seg.pop()];
  while (seg.length && cps([seg.at(-1), ...keep].join('::')) <= P5_MAX) keep.unshift(seg.pop());
  return lp + (seg.length ? `…::${keep.join('::')}` : keep.join('::')) + ls;
}
const MB = () => $('modelBody');
const MH = 20; // 偽の DOM では行の高さを測れない(getBoundingClientRect が 0)ので、画面は 20px として計算する(src/app/main.js の MROW_H0)
// 並べている行と、上の空きの高さから求めた最初の行の位置
function p5Win() {
  const ch = MB().children;
  const pads = ch.filter((c) => c._cls.has('mpad'));
  const top = ch[0]?._cls.has('mpad') ? parseFloat(ch[0].style.height) : 0;
  const bottom = pads.length === 2 ? parseFloat(pads[1].style.height) : 0;
  return { from: Math.round(top / MH), top, bottom, pads: pads.length, rows: mrows() };
}
const p5Key = (r) => JSON.stringify([r.id, r.depth, r.name, r.du, r.duCls, r.kind, r.types, r.mult, r.twisty, r.title, r.cls]);
const p5Resize = () => { for (const h of winLs.resize ?? []) h({ type: 'resize' }); };
// 全部の行: 本体の高さを大きくして並べ直し、読んだら元の高さに戻して並べ直す(直す前のコードは、いつも全部を並べる)
function p5Full() {
  const b = MB(), h = b.clientHeight, st = b.scrollTop;
  b.clientHeight = 1e9; b.scrollTop = 0; p5Resize();
  const all = mrows();
  b.clientHeight = h; b.scrollTop = st; p5Resize();
  return all;
}
const p5Scroll = (y) => { MB().scrollTop = y; MB().dispatchEvent({ type: 'scroll' }); };
const nextResult = (n0, ms = 600000) => waitFor(() => (results.length > n0 ? results.at(-1) : null), ms);
async function p5View(v) { if ($('viewKind').value === v) return results.at(-1); const n0 = results.length; $('viewKind').value = v; $('viewKind').dispatchEvent({ type: 'change' }); return nextResult(n0); }
const P5_VIEWS = ['general', 'interconnection', 'action-flow', 'state-transition', 'sequence', 'grid'];
const scopeNow = () => ({ options: $('scope').options.map((o) => ({ value: o.value, text: o.textContent, title: o.title ?? '' })), value: $('scope').value, title: $('scope').title ?? '' });
async function p5Open(name, text) { const n0 = results.length; const r = await openBy('open', name, text); return r ?? (await waitFor(() => results.slice(n0).find((x) => x.text === text), 600000)); }

async function gr27p5Dump(file) {
  const out = { rows: {}, scope: {}, append: {} };
  const rowCases = [['大きい木', p5Big(560)], ...(p5arg('--mfile') ? [['C3_1MB', fs.readFileSync(p5arg('--mfile'), 'utf8')]] : [])];
  for (const [name, text] of rowCases) {
    await p5Open(`${name}.sysml`, text);
    const a = p5Full();
    // 閉じた項目のうち、子のある最初の 3 つを開く(並べた行の先頭の近く)
    for (let i = 0; i < 3; i++) { const r = mrows().find((x) => x.twisty === '▸'); if (r) mclick(r, 'tw'); }
    out.rows[name] = { open: a.map(p5Key), opened3: p5Full().map(p5Key) };
  }
  // GR26 T の大きなモデル: 始め・根を閉じた後・開き直した後・定義をすべて開いた後・すべて折りたたんだ後の全部の行
  {
    await p5Open('g26big.sysml', g26Big());
    const st = { start: p5Full().map(p5Key) };
    g26Click('Big'); st.closed = p5Full().map(p5Key);
    g26Click('Big'); st.reopened = p5Full().map(p5Key);
    for (let i = 0; i < G26BIG_N; i++) g26Click(`D${i}`);
    st.allOpen = p5Full().map(p5Key);
    $('btnModelCollapse').click(); st.collapsed = p5Full().map(p5Key);
    out.rows['GR26 T 大きなモデル'] = st;
  }
  const sCases = [['例', null, '機能紹介'], ['入門用の例', null, '入門'], ['部品の入れ子 300 段', p5PartNest(300)], ['パッケージの入れ子 2000 段', p5PkgNest(2000)]];
  for (const [name, text, word] of sCases) {
    if (word) await pickSample(word); else await p5Open(`${name}.sysml`, text);
    out.scope[name] = {};
    for (const v of P5_VIEWS) { await p5View(v); out.scope[name][v] = scopeNow(); }
  }
  // 「view を書き足す」: 部品の入れ子 300 段の相互接続ビューで、修飾名が 60 字を超える候補(n0::…::n150)を選んで押した後のテキスト
  {
    const t = p5PartNest(300);
    await p5Open('append.sysml', t);
    await p5View('interconnection');
    const want = $('scope').options.find((o) => o.value === `part:${Array.from({ length: 151 }, (_, i) => `n${i}`).join('::')}`);
    let n0 = results.length;
    $('scope').value = want?.value ?? ''; $('scope').dispatchEvent({ type: 'change' });
    await nextResult(n0);
    n0 = results.length;
    const before = $('src').value;
    if (!$('btnAppendView').disabled) $('btnAppendView').click();
    await waitFor(() => $('src').value !== before, 60000);
    await waitFor(() => results.slice(n0).find((x) => x.text === $('src').value), 60000);
    out.append['部品の入れ子 300 段 n150'] = { found: !!want, text: $('src').value === before ? null : $('src').value.slice(-400) };
  }
  // 試しのフォルダ(最後に。行と範囲の欄)
  {
    await loadBy('picker', G26_NAME, G26_FILES);
    out.rows['試しのフォルダ'] = { open: p5Full().map(p5Key) };
    out.scope['試しのフォルダ'] = {};
    for (const v of P5_VIEWS) { await p5View(v); out.scope['試しのフォルダ'][v] = scopeNow(); }
  }
  fs.writeFileSync(file, JSON.stringify(out));
  check(errors.length === 0, `GR27 P5 dump: 書き出した(${file})`, errors.join(' / '));
}

async function gr27p5() {
  if (p5arg('--dump')) { await gr27p5Dump(p5arg('--dump')); return; }
  const V = await import('../../src/view/index.js');
  // ---- S
  const sRows = [];
  const sCheck = async (name, text, word, views) => {
    if (word) await pickSample(word); else await p5Open(`${name}.sysml`, text);
    let bad = null, n = 0, long = 0, sum = 0, sumFull = 0;
    for (const v of views) {
      const r = await p5View(v);
      const p = word || text ? V.prepareView($('src').value) : null;
      const KEY = { general: 'generalCandidates', interconnection: 'candidates', 'action-flow': 'actionCandidates', 'state-transition': 'stateCandidates', sequence: 'sequenceCandidates', grid: 'tableCandidates' };
      const want = p[KEY[v]];
      const s = scopeNow();
      if (!want.length) continue;
      if (s.options.length !== want.length) { bad ??= `${v}: 候補の数 ${s.options.length} / ${want.length}`; continue; }
      want.forEach((c, i) => {
        const o = s.options[i];
        n++; sum += o.text.length; sumFull += c.label.length;
        const P = c.label.replace(/^(part def |part |package |view )/, '');
        if (cps(P) > P5_MAX) long++;
        if (o.value !== c.id) bad ??= `${v} ${i}: 値 ${o.value.slice(0, 80)} / ${c.id.slice(0, 80)}`;
        if (o.text !== sRule(c.label)) bad ??= `${v} ${i}: 文字 ${o.text.slice(0, 80)} / ${sRule(c.label).slice(0, 80)}`;
        if (cps(P) <= P5_MAX && o.text !== c.label) bad ??= `${v} ${i}: 60 字以下の文字が今と違う ${o.text.slice(0, 80)}`;
        if (o.title) bad ??= `${v} ${i}: option に title がある`;
      });
      const sel = want.find((c) => c.id === s.value);
      if (s.title !== (sel ? sel.label : '')) bad ??= `${v}: 範囲の欄の title ${s.title.slice(0, 80)} / ${(sel?.label ?? '').slice(0, 80)}`;
      if (r?.m?.candidate && s.value !== r.m.candidate.id) bad ??= `${v}: 選んでいる値 ${s.value.slice(0, 60)} / ${r.m.candidate.id.slice(0, 60)}`;
    }
    sRows.push(`${name}: 候補 ${n}、60 字を超える ${long}、option の文字の合計 ${sum}(省く前 ${sumFull})`);
    check(!bad && n > 0 && errors.length === 0, `GR27 S: ${name}の範囲の欄の候補の文字(60 字以下は今と同じ・60 字を超えるものは前を「…::」で省く)・値・title(${views.length} つのビュー、候補 ${n}、60 字を超える ${long})`, bad ?? sRows.at(-1));
    return { n, long, sum, sumFull };
  };
  await sCheck('例', null, '機能紹介', P5_VIEWS);
  await sCheck('入門用の例', null, '入門', P5_VIEWS);
  const s300 = await sCheck('部品の入れ子 300 段', p5PartNest(300), null, ['interconnection', 'general']);
  const s2000 = await sCheck('パッケージの入れ子 2000 段', p5PkgNest(2000), null, ['general']);
  check(s300.long > 200 && s2000.long > 1900 && s2000.sum < 200000 && s2000.sumFull > 10000000, 'GR27 S: 入れ子の深い入力で、60 字を超える候補を省き、option の文字の合計が減る(パッケージの入れ子 2000 段で 20 万字未満)', sRows.join(' / '));
  // 選び直すと title を入れ直す(パッケージの入れ子 2000 段の一般ビュー。省いた候補と省かない候補)
  {
    const titles = [];
    for (const k of [1999, 3, 40]) {
      const o = $('scope').options[k];
      const n0 = results.length;
      $('scope').value = o.value; $('scope').dispatchEvent({ type: 'change' });
      const after = $('scope').title;
      await nextResult(n0);
      titles.push([o.value.replace(/^package:/, ''), after, $('scope').title, o.textContent]);
    }
    const ok = titles.every(([q, a, b, t]) => a === `package ${q}` && b === a) && titles[0][3].startsWith('package …::') && titles[1][3] === `package ${titles[1][0]}`;
    check(ok && errors.length === 0, 'GR27 S: 範囲を選び直すと、範囲の欄の title を選んだ候補の文字の全部に入れ直す(省いた候補と省かない候補)', titles.map(([q, a, , t]) => `${t.slice(0, 40)} → ${a.length} 字`).join(' / '));
  }
  // 処理中の表示(GR18 B6 の clearNoResult。S で範囲の欄の title を空にする処理を足した): 候補のないテキストの結果(図を描けていない)の後に
  // 解析を頼むと、その直後(結果を受け取る前)に、範囲の欄が「(処理中)」だけで title が空、図の文と診断が消えている
  {
    await typeText('// 注だけ\n');
    const noCand = scopeNow().options.map((o) => o.text).join('|') + ' / ' + ($('canvas').querySelector('.empty')?.textContent ?? '').slice(0, 20);
    $('scope').title = '前の title'; $('msg').textContent = '前の診断';
    let mid = null;
    runHook = () => { const s = scopeNow(); mid = { opts: s.options.map((o) => `${o.value}=${o.text}`), title: s.title, msg: $('msg').textContent, empty: $('canvas').querySelectorAll('.empty').length }; };
    await typeText('// 注だけ\n// もう 1 行\n');
    runHook = null;
    const ok = !!mid && JSON.stringify(mid.opts) === JSON.stringify(['=(処理中)']) && mid.title === '' && mid.msg === '' && mid.empty === 0;
    check(ok && errors.length === 0, 'GR27 S: 図を描けていない間に解析を頼むと、結果を受け取る前に、範囲の欄を「(処理中)」にして title を空にし、図の文と診断を消す(GR18 B6 と同じ動き)', `${noCand} → ${JSON.stringify(mid)}`);
  }
  // フォルダ(試しのフォルダ)は最後に M の後で
  // ---- M
  const big = p5Big(560);
  await p5Open('big.sysml', big);
  const full = p5Full();
  const n = full.length;
  const per = Math.ceil(MB().clientHeight / MH), limit = 3 * per;
  const posCheck = (label, all) => {
    const bad = [], counts = [];
    let maxRows = 0;
    const rowsN = all.length;
    for (const y of [0, 5 * MH, 1000.5 * MH, 3000 * MH, (rowsN - 10) * MH, 1e7]) {
      p5Scroll(y);
      const w = p5Win();
      maxRows = Math.max(maxRows, w.rows.length);
      counts.push(`${Math.floor(y / MH) >= 1e5 ? '末尾の先' : `${Math.floor(y / MH)} 行目`} ${w.from}〜${w.from + w.rows.length - 1} の ${w.rows.length} 行`);
      const vis = Math.min(Math.floor(y / MH), Math.max(0, rowsN - per));
      if (w.rows.length > limit) bad.push(`${y}: ${w.rows.length} 行`);
      if (!(w.from <= vis && vis + Math.min(per, rowsN) <= w.from + w.rows.length)) bad.push(`${y}: 見える範囲 ${vis} が並べた ${w.from}〜${w.from + w.rows.length} の外`);
      if (w.pads !== 2 || w.top !== w.from * MH || w.bottom !== (rowsN - w.from - w.rows.length) * MH) bad.push(`${y}: 空き ${w.top}・${w.bottom}`);
      w.rows.forEach((r, k) => { if (p5Key(r) !== p5Key(all[w.from + k])) bad.push(`${y}: ${w.from + k} 行目 ${p5Key(r).slice(0, 80)} / ${p5Key(all[w.from + k] ?? {}).slice(0, 80)}`); });
    }
    return { bad, maxRows, counts };
  };
  const pc = posCheck('開いたとき', full);
  check(n > 6000 && pc.bad.length === 0 && errors.length === 0, `GR27 M: 行が ${n} の木で、スクロールの位置ごと(6 か所)に並ぶ行が ${limit} 行以下(最大 ${pc.maxRows} 行)で、全部を並べたときの同じ位置の行と同じ(文字・印・型・種類・data-id・マウスを載せたときの文)。上と下の空きの高さが並べていない行の数 × ${MH}px。スクロールの位置ごと: ${pc.counts.join('、')}`, pc.bad.slice(0, 3).join(' / '));
  // スクロールした位置での開閉: 3000 行目のあたりの閉じた項目を開き、閉じる
  p5Scroll(3000 * MH);
  const closed = mrows().find((r, k) => k > per && r.twisty === '▸');
  mclick(closed, 'tw');
  const opened = p5Full();
  const pc2 = posCheck('開いた後', opened);
  const isOpen = opened.find((r) => r.id === closed?.id)?.twisty === '▾';
  p5Scroll(3000 * MH);
  mclick(mrows().find((r) => r.id === closed?.id), 'tw');
  const back = p5Full();
  check(!!closed && isOpen && opened.length > n && pc2.bad.length === 0 && back.length === n && back.every((r, k) => p5Key(r) === p5Key(full[k])) && errors.length === 0,
    'GR27 M: スクロールした位置で項目を開くと、並ぶ行が開いた木の同じ位置の行と同じになり、閉じると元の行に戻る', `${closed?.name} ${isOpen} ${opened.length} ${pc2.bad.slice(0, 2).join(' / ')}`);
  // 選択と移動: 5000 行目のあたりの項目を押す → 選び、参照箇所の欄に出し、テキスト欄のその名前の字句を選ぶ。範囲の外にスクロールしても選択と
  // 参照箇所の欄を保ち、戻ると選択の印がある
  p5Scroll(5000 * MH);
  const target = mrows().find((r) => /^B\d{4}$/.test(r.name));
  mclick(target);
  const src = $('src');
  const picked = src.value.slice(src.selectionStart, src.selectionEnd);
  const head1 = $('refHead').textContent, refs1 = $('refBody').textContent;
  const sel1 = mrows().filter((r) => r.cls.includes('sel')).map((r) => r.id);
  p5Scroll(0);
  const away = !mrows().some((r) => r.id === target?.id) && $('refHead').textContent === head1 && $('refBody').textContent === refs1;
  p5Scroll(5000 * MH);
  const sel2 = mrows().filter((r) => r.cls.includes('sel')).map((r) => r.id);
  check(!!target && picked === target.name && JSON.stringify(sel1) === JSON.stringify([target.id]) && JSON.stringify(sel2) === JSON.stringify(sel1) && away && /参照箇所: B\d{4}\(\d+ 件\)/.test(head1) && errors.length === 0,
    'GR27 M: スクロールした位置で項目を押すと、選んで参照箇所を出し、テキスト欄のその名前を選ぶ。並べる範囲の外にスクロールしても、選択と参照箇所の欄を保つ', `${target?.name} 選んだ字句「${picked}」 ${head1} ${away} ${sel1} ${sel2}`);
  // 型を押して移る(スクロールした位置の項目)
  {
    p5Scroll(5000 * MH);
    const t = mrows().find((r) => /^a\d{4}$/.test(r.name));
    mclick(t, 'mty');
    const got = src.value.slice(src.selectionStart, src.selectionEnd);
    check(!!t && got === t.types.replace(/^: /, '').replace(/ \[.*$/, '').trim() && errors.length === 0, 'GR27 M: スクロールした位置の項目の型を押すと、型の定義へ移る', `${t?.name} ${t?.types} → ${got}`);
  }
  // 解析し直した後も、開閉と選択を保つ(スクロールの位置で項目を開いてから、テキストの末尾に注を足す)
  {
    p5Scroll(4000 * MH);
    const c = mrows().find((r, k) => k > per && r.twisty === '▸');
    mclick(c, 'tw');
    const before = p5Full();
    const r = await typeText(big + '// 足した注\n');
    await waitFor(() => !MB()._cls.has('stale'), 60000);
    const after = p5Full();
    p5Scroll(5000 * MH);
    const sel3 = mrows().filter((x) => x.cls.includes('sel')).map((x) => x.title.split('\n')[0]);
    check(!!r && !!c && after.length === before.length && after.every((x, k) => p5Key(x) === p5Key(before[k])) && sel3.length === 1 && sel3[0] === target?.title.split('\n')[0] && $('refHead').textContent === head1 && errors.length === 0,
      'GR27 M: 解析し直した後も、並べる範囲の外の項目を含めて開閉と選択(参照箇所の欄)を保つ', `${after.length}/${before.length} ${sel3}`);
  }
  // 本体の高さが変わったとき(区画の高さの付け直しと窓の大きさの変化): 並べる行を入れ直し、見えている範囲を含む
  {
    p5Scroll(2000 * MH);
    MB().clientHeight = 1500;
    p5Resize();
    const w = p5Win();
    const vis = 2000, per2 = Math.ceil(1500 / MH);
    const ok = w.rows.length > limit && w.rows.length <= 3 * per2 && w.from <= vis && vis + per2 <= w.from + w.rows.length;
    MB().clientHeight = 600;
    p5Resize();
    const w2 = p5Win();
    check(ok && w2.rows.length <= limit && errors.length === 0, 'GR27 M: 本体の高さが変わると、並べる行を見えている範囲に合わせて入れ直す(高さ 1500px で 225 行以下、600px に戻すと 90 行以下)', `${w.from} ${w.rows.length} / ${w2.rows.length}`);
  }
  // すべて折りたたむ(スクロールの位置が木の高さより下でも、行を並べる)
  {
    p5Scroll(6000 * MH);
    $('btnModelCollapse').click();
    const w = p5Win();
    const all = p5Full();
    // スクロールの位置が木の高さより下なので、最後の画面(と前の画面 1 枚分)を並べる
    const lastScreen = Math.max(0, all.length - per);
    check(all.length === 560 && w.rows.length > 0 && w.rows.length <= limit && w.from <= lastScreen && w.from + w.rows.length === all.length && w.rows.every((r, k) => r.depth === 0 && r.twisty === '▸' && p5Key(r) === p5Key(all[w.from + k])) && errors.length === 0,
      'GR27 M: スクロールした後に「すべて折りたたむ」と、根の項目だけになり、木の末尾の画面の行を並べる', `${w.from} ${w.rows.length} ${all.length}`);
  }
  // フォルダ: 試しのフォルダの範囲の欄(6 つのビュー)と、モデルツリーの行(全部を並べたときと同じ)
  {
    await loadBy('picker', G26_NAME, G26_FILES);
    let bad = null, nn = 0;
    for (const v of P5_VIEWS) {
      const r = await p5View(v);
      const want = G27MT.unpackCandidates(r.m.candidates, r.m.paths ?? null);
      const s = $('scope');
      if (want.length && s.options.length !== want.length) { bad ??= `${v}: 候補の数 ${s.options.length} / ${want.length}`; continue; }
      want.forEach((c, i) => { nn++; const o = s.options[i]; if (o.value !== c.id || o.textContent !== c.label || o.textContent !== sRule(c.label) || o.title) bad ??= `${v} ${i}: ${o.textContent} / ${c.label}`; });
      const sel = want.find((c) => c.id === s.value);
      if (s.title !== (sel ? sel.label : '')) bad ??= `${v}: title ${s.title} / ${sel?.label}`;
    }
    const all = p5Full(), w = p5Win();
    check(!bad && nn > 0 && w.rows.length === all.length && w.rows.every((r, k) => p5Key(r) === p5Key(all[k])) && errors.length === 0, `GR27 S・M: 試しのフォルダで、範囲の欄の候補の文字が今と同じ(どれも 60 字以下)で title が選んだ候補の文字。モデルツリーの行(${all.length} 行)が全部を並べたときと同じ`, bad ?? '');
  }
}

try {
  if (GR25K || GR26P5_BUILT || GR26P6_BUILT || GR27_BUILT || GR27P5_BUILT) await loadBuilt(); else await import('../../src/app/main.js');
  // W1: 起動の解析(空のテキスト)
  const r0 = await resultFor('');
  check(!!r0 && errors.length === 0 && /未検査 0 件/.test($('msg').textContent), 'GR18 W1: 起動の解析の応答を、例外なしに画面が処理する(診断欄が出る)', errors.join(' / ') || $('msg').textContent);
  if (GR25K) await gr25k();
  else if (GR27) await gr27();
  else if (GR27P5) await gr27p5();
  else if (GR26LT) await gr26lt();
  else if (GR26LS) gr26ls();
  else if (GR26R) await gr26r();
  else if (GR26N) await gr26n();
  else if (GR26P5) await gr26p5();
  else if (GR26P6) await gr26p6();
  else if (GR25F) await gr25f();
  else if (GR24P5START) gr24p5start();
  else if (GR24P5) await gr24p5();
  else if (GR25BC) { await gr25b(); await gr25c(); }
  else if (GR25A) await gr25a();
  else if (GR24) { await gr24t(); await gr24f(); await gr24m(); await gr24z(); await gr24model(); }
  else if (GR22P4) await gr22p4();
  else if (GR22) await gr22();
  else if (GR21) await gr21();
  else if (GR20) await gr20();
  else if (GR19P5) await gr19p5();
  else if (GR19) await gr19();
  else {
    // W1: 「例を読み込む」で図が描ける
    // GR19 の U3: 「例を読み込む」はダイアログで例を選ぶ。ここでは機能紹介用の例を選ぶ(前は押すとすぐ読み込んだ)
    const r1 = (await pickSample('機能紹介')).r;
    const drawn = !!r1 && errors.length === 0 && !!$('canvas').querySelector('svg');
    check(drawn, 'GR18 W1: 「例を読み込む」で、応答の処理に例外が出ず、図(SVG)が描ける', errors.join(' / ') || `結果 ${r1 ? 'あり' : 'なし'}、図 ${$('canvas').innerHTML.slice(0, 80)}`);
    // W2: 一般ビュー「構成の図」で「Arduino Uno」を「Arduino Uno R4」に
    let g1 = null;
    if (drawn) {
      const opt = $('scope').options.find((o) => o.textContent.includes('構成の図'));
      if (opt) {
        const n0 = results.length;
        $('scope').value = opt.value;
        $('scope').dispatchEvent({ type: 'change' });
        g1 = await resultFor($('src').value, n0);
      }
    }
    const ren1 = g1 ? await renameByClick(g1, 'Arduino Uno', 'PartDefinition', 'Arduino Uno R4') : { error: '「構成の図」を描けない' };
    check(!ren1.error && selectedName() === '名前: Arduino Uno R4' && errors.length === 0, 'GR18 W2: 一般ビュー「構成の図」で「Arduino Uno」を「Arduino Uno R4」に変えた後も、その要素が選ばれたまま', ren1.error ?? `${selectedName()} / ${errors.join(' / ')}`);
    // E5 を保つ: 続けて、前に宣言を 1 行足しても、同じ要素が選ばれたまま
    let e5 = '(前の検査が落ちたので行わない)';
    if (!ren1.error) {
      const t = $('src').value, i = t.indexOf('\n', t.indexOf('{')) + 1, n0 = results.length;
      $('src').setRangeText('    part def Extra18;\n', i, i);
      $('src').dispatchEvent(new Event('input'));
      const r = await resultFor($('src').value, n0);
      e5 = r ? selectedName() : '解析の結果が来ない';
    }
    check(e5 === '名前: Arduino Uno R4', 'GR18 W2: 名前を変えた後に前に宣言を 1 行足しても、同じ要素が選ばれたまま(E5)', e5);
    // W2: 相互接続ビューで「温度計」を「温度計2」に
    let ic = null;
    if (drawn) {
      const n0 = results.length;
      $('viewKind').value = 'interconnection';
      $('viewKind').dispatchEvent({ type: 'change' });
      ic = await resultFor($('src').value, n0);
      // 「温度計」の箱がある範囲を選ぶ
      for (const o of $('scope').options) {
        if (ic?.m.structure?.nodes.some((n) => n.info?.name === '温度計')) break;
        const k = results.length;
        $('scope').value = o.value;
        $('scope').dispatchEvent({ type: 'change' });
        ic = await resultFor($('src').value, k);
      }
    }
    const ren2 = ic ? await renameByClick(ic, '温度計', null, '温度計2') : { error: '相互接続ビューを描けない' };
    check(!ren2.error && selectedName() === '名前: 温度計2' && errors.length === 0, 'GR18 W2: 相互接続ビューで「温度計」を「温度計2」に変えた後も、その要素が選ばれたまま', ren2.error ?? `${selectedName()} / ${errors.join(' / ')}`);
    check(errors.length === 0 && alerts.length === 0, 'GR18 W1: 画面の処理を通して、応答の処理の例外と警告の窓が 0 件', [...errors, ...alerts].join(' / '));
  }
} catch (e) {
  check(false, 'GR18 W3: 画面のスクリプトを動かす検査が、途中で例外にならない', e?.stack ?? e);
}
console.log(lines.join('\n'));
await Promise.all(threads.map((w) => w.terminate()));
process.exit(0);
