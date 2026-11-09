// 画面と Worker の受け渡しのうち、DOM を使わない部分(GR18 指示書 2.2 節の E5・E8・E9、2.5 節の B2・B5。設計書 2.6 節・9.2 節・9.3 節)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。画面(src/app/main.js)と検査(tests/view/app.mjs)が使う。
//
// makeRunner({ createWorker, deliver, internalResult })
//   createWorker()      Worker を作る(画面は Blob URL の Web Worker、検査は Node.js の worker_threads を包んだもの)。
//                       返すものは postMessage・terminate と、onmessage・onerror を代入できるもの
//   deliver(m)          Worker からの応答(と、下の失敗の応答)を画面に渡す
//   internalResult(run, message) 解析の要求 run に対する、内部エラーの結果({ type: 'result', … })を作る
// runner.run(msg)       解析と描画を頼む(msg は { type: 'run', id, text, view, candidateId, … })。実行中の解析と、テキスト・ビュー・
//                       範囲のどれかが違えば、実行中の Worker を止めて(terminate)作り直し、新しい要求で解析し直す(設計書 2.6 節。
//                       ビュー・範囲を替えたときに打ち切るのは、下の RUNNER18.B5 を入れたとき。切れば、テキストが変わったときだけ)
// runner.request(msg)   名前の変更・追加・削除など、解析の結果を使う要求。応答が来るまで「待っている要求」として覚える
// runner.running        実行中の解析の要求(なければ null)
// Worker のエラー(onerror)のときは、待っている要求と実行中の解析に失敗を返し(解析は内部エラーの結果)、Worker を作り直す。
// 作り直し(打ち切り)のときも、待っている要求に失敗を返す(GR18 の E9)。失敗の応答は、要求の種類に合う応答の形
// { type, id, ok: false, reason, details: [] } で deliver に渡す

// GR18 の項目の切り替え。B5: 描画中にビューか範囲を替えたときも、実行中の解析を打ち切る(切れば、テキストが変わったときだけ打ち切る)
export const RUNNER18 = { B5: true };

// 要求の種類 → 応答の種類(src/app/worker.js の self.onmessage と同じ対応)
export const REPLY_TYPE = { appendView: 'appendView', renameInfo: 'renameInfo', rename: 'rename', editInfo: 'editInfo', add: 'add', connect: 'add', connectInfo: 'connectInfo', deletePlan: 'deletePlan', delete: 'delete' };
const keyOf = (type, id) => `${type}:${id}`;

export function makeRunner({ createWorker, deliver, internalResult }) {
  let worker = null;
  let running = null;
  const pending = new Map(); // 応答の種類と id → 要求
  const failPending = (reason) => {
    const list = [...pending.values()];
    pending.clear();
    for (const m of list) deliver({ type: REPLY_TYPE[m.type], id: m.id, ok: false, reason, details: [] });
  };
  function start() {
    worker = createWorker();
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'result' && running && m.id === running.id) running = null;
      if (m.type !== 'result' && m.type !== 'progress' && m.type !== 'init') pending.delete(keyOf(m.type, m.id));
      deliver(m);
    };
    worker.onerror = (e) => crash(`Worker のエラー: ${e?.message ?? e}`);
    worker.postMessage({ type: 'init' });
  }
  function stop() {
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    worker = null;
  }
  // Worker のエラー: 待っている要求に失敗を返し、実行中の解析は内部エラーの結果にする。Worker は作り直す(次の要求から使う)
  function crash(message) {
    const r = running;
    running = null;
    stop();
    failPending(`内部エラー: ${message}`);
    if (r) deliver(internalResult(r, message));
    start();
  }
  return {
    get running() { return running; },
    start() { if (!worker) start(); },
    run(msg) {
      if (running && (running.text !== msg.text || (RUNNER18.B5 && (running.view !== msg.view || (running.candidateId ?? null) !== (msg.candidateId ?? null))))) {
        // 実行中の解析を打ち切る。待っている要求は、打ち切った Worker では答えられないので失敗にする
        stop();
        failPending('描き直しのために中断しました。もう一度操作してください');
        start();
      } else if (!worker) start();
      running = msg;
      worker.postMessage(msg);
    },
    request(msg) {
      if (!worker) start();
      pending.set(keyOf(REPLY_TYPE[msg.type], msg.id), msg);
      worker.postMessage(msg);
    },
    // 検査用: Worker のエラーを起こしたことにする
    crash,
  };
}

// 解析の結果 r の、範囲の欄に出す文(候補がないとき)。内部エラーと構文エラーを分ける(GR18 の B2。設計書 9.2 節)
export function scopePlaceholder(r) {
  if (r.ok) return '(候補なし)';
  if (r.diagnostics?.syntax?.length) return '(構文エラー)';
  return '(内部エラー)';
}

// テキストを old から now に書き換えたときの、原文の範囲 [s, e] の行き先(GR18 の E5)。先頭と末尾の共通の部分を除いた、書き換えた
// 区間より前の範囲はそのまま、後ろの範囲は長さの差だけずらす。書き換えた区間に重なる範囲は null
export function mapRange(old, now, [s, e]) {
  if (old === now) return [s, e];
  let p = 0;
  const max = Math.min(old.length, now.length);
  while (p < max && old.charCodeAt(p) === now.charCodeAt(p)) p++;
  let q = 0;
  while (q < max - p && old.charCodeAt(old.length - 1 - q) === now.charCodeAt(now.length - 1 - q)) q++;
  const oldEnd = old.length - q, d = now.length - old.length;
  if (e <= p) return [s, e];
  if (s >= oldEnd) return [s + d, e + d];
  return null;
}

// 図の構造 st の中で、原文の範囲 src と種類 kind の要素(箱・線・枠)を探す(GR18 の E5)。→ id か null
export function findBySource(st, src, kind) {
  if (!st || !src) return null;
  const hit = (n) => n.src && n.src[0] === src[0] && n.src[1] === src[1] && (n.info?.kind ?? null) === kind;
  if (st.frame && hit(st.frame)) return 'frame';
  const x = st.nodes.find(hit) ?? st.edges.find(hit);
  return x ? x.id : null;
}

// テキストの改行の形(GR18 の E8。設計書 9.3 節)。最初の行末の形(LF・CR LF・CR)。行末がなければ LF
export function eolOf(text) {
  const m = /\r\n|\r|\n/.exec(text);
  return m ? m[0] : '\n';
}
// テキスト欄の文字(行末は LF)を、改行の形 eol で書く
export function withEol(text, eol) {
  const t = text.replace(/\r\n|\r/g, '\n');
  return eol === '\n' ? t : t.replace(/\n/g, eol);
}

// フォルダのファイルの並び [{ path, text }] を、解析の要求と結果の突き合わせに使う 1 つの文字列にする(GR20 の F)。画面と Worker が
// 同じものを作る。ファイルの相対パスとテキストが同じなら同じ文字列
export function folderKey(files) {
  return `\u0000folder\u0000${files.map((f) => `${f.path.length}:${f.path}${f.text.length}:`).join('')}\u0000${files.map((f) => f.text).join('\u0001')}`;
}

// 大きいファイルの知らせ(GR27 の L。設計書 5 章): 開いたテキスト(フォルダのときは .sysml の合計)が BIG_TEXT バイトを超えるときに出す。
// utf8Bytes(s) は文字列 s を UTF-8 で書いたときのバイト数(対になっていないサロゲートは U+FFFD の 3 バイトとして数える。TextEncoder と同じ)
export const BIG_TEXT = 1000000;
export function utf8Bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
// 知らせの文(bytes はバイト数、folder はフォルダか)
export function bigTextNote(bytes, folder) {
  const b = bytes.toLocaleString('ja-JP');
  return folder ? `大きいフォルダ(.sysml の合計 ${b} バイト)なので、解析に時間がかかります` : `大きいファイル(${b} バイト)なので、解析に時間がかかります`;
}
