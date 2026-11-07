// フォルダを開いているときの、ファイルごとの取り消しとやり直しの履歴(GR21 の H。設計書 9.4 節の「取り消しの履歴」)。
// DOM・外部パッケージ・Node.js 固有の機能を使わない(画面 src/app/main.js から使い、検査 tests/view からも直接呼ぶ)。
// 1 ファイルの扱いでは使わない(今のままブラウザのテキスト欄の取り消しを使う)。
//
// makeFolderHistory(paths, { limit, pathOf }) → 履歴(ファイルを鍵 k で指す。paths だけを渡せば、鍵はファイルの番号 0, 1, …)
//   GR24 の F・M: ファイルの名前の変更・移動で、書き換えと取り消しの履歴を新しい相対パスのファイルに引き継げるよう、鍵をファイルの番号で
//   なく、ファイルそのものの印(画面ではファイルごとの通し番号)にできるようにした。pathOf(k) は、理由の文に出すそのファイルの今の相対パス
//   add(k)                                     ファイル k の空の履歴を足す(新しいファイル・名前の変更で .sysml になったファイル)
//   remove(k)                                  ファイル k の履歴を捨てる(削除・モデルから外れたファイル)。k とつながった履歴は、
//                                             上限を超えて捨てたときと同じく、つながったほかのファイルの履歴からも消す
//   typed(k, before, after, caret, inputType)  手で打った書き換え(テキスト欄の input の出来事)。before・after はファイルのテキスト、
//                                             caret は書き換えた後のカーソルの位置(selectionEnd)、inputType は InputEvent の inputType
//   composed(k, before, after, caret)          日本語の入力の確定(compositionend)。変換中の書き換えは、確定するまで履歴にしない
//   edited(changes)                            図からの編集・view の書き足し([{ k, before, start, end, text }])。1 回の操作を 1 つの
//                                             履歴にし、2 つ以上のファイルにまたがるときは、つながった 1 つの履歴として各ファイルに入れる
//   cut(k)                                     まとまりを切る(カーソルの移動・ほかのファイルへの切り替えなど)
//   undo(k, texts) / redo(k, texts)            → { ok: true, changes: [{ k, text, caret }] } | { ok: false, reason }(texts は全ファイルの今のテキスト。
//                                             鍵 → テキストの関数でもよい)
//   size(k)                                    → { undo, redo }(検査用)
//   lost()                                     → つながった履歴が見つからなかった数(内部の食い違い。0 のはず。検査用。GR22 の A3)
//
// まとまり(自分で決めた細かい点。GR21 の完了報告に書く):
//   - 続けて打った文字('insertText')は 1 つにまとめる。前の文字のすぐ後ろに打ったときだけまとめる(カーソルを動かしたら切れる)
//   - Backspace('deleteContentBackward' など後ろ向きの削除)が続くものを 1 つ、Delete(前向きの削除)が続くものを 1 つにまとめる。
//     打つ・後ろ向きに消す・前向きに消すの種類が替わると切る
//   - 改行('insertLineBreak'・'insertParagraph'、または入れた文字に改行を含むもの)・貼り付け・切り取り・ドロップ・そのほかの種類
//     (Tab の字下げ、inputType のない書き換えを含む)は、それぞれ 1 回で 1 つの履歴にし、前後のまとまりを切る
//   - 日本語の入力の確定は、確定した文字を 1 つの履歴にする(変換中は履歴を作らない)
//   - ファイルごとに上限 limit(既定 200)の履歴を持ち、超えたら古いものから捨てる
//   - つながった履歴が 1 つのファイルの履歴から消えたとき(上限を超えて捨てたとき、新しく書き換えてやり直しの履歴を消したとき)は、
//     つながったほかのファイルの履歴からも、その操作と、それに続くものを消す(GR22 の A3。設計書 9.4 節)

export const HISTORY_LIMIT = 200;

// before → after の 1 か所の書き換え { start, del, ins }。caret(書き換えた後のカーソルの位置)があれば、同じ文字が続くところでの
// 位置の曖昧さを、カーソルの位置で決める(打った文字・消した文字はカーソルの直前・直後にある)
export function diffText(before, after, caret = null) {
  if (before === after) return null;
  const n = before.length, m = after.length;
  let suffixCap = Math.min(n, m);
  if (caret != null && caret >= 0 && caret <= m) suffixCap = Math.min(suffixCap, m - caret);
  let s = 0;
  while (s < suffixCap && before.charCodeAt(n - 1 - s) === after.charCodeAt(m - 1 - s)) s++;
  let p = 0;
  const prefixCap = Math.min(n - s, m - s);
  while (p < prefixCap && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  return { start: p, del: before.slice(p, n - s), ins: after.slice(p, m - s) };
}

const kindOf = (inputType, d) => {
  if (/\n|\r/.test(d.ins)) return 'other';
  if (inputType === 'insertText') return 'type';
  if (/^delete(Content|Word|SoftLine|HardLine)Backward$/.test(inputType ?? '')) return 'back';
  if (/^delete(Content|Word|SoftLine|HardLine)Forward$/.test(inputType ?? '')) return 'fwd';
  return 'other';
};

export function makeFolderHistory(paths, { limit = HISTORY_LIMIT, pathOf = null } = {}) {
  const hs = new Map(paths.map((_, i) => [i, { undo: [], redo: [] }]));
  const where = pathOf ?? ((k) => paths[k]);
  let linkSeq = 0;
  let lostCount = 0; // つながった履歴が見つからなかった数(内部の食い違い。検査用)
  // つながった履歴が 1 つのファイルの履歴から消えたとき(GR22 の A3。設計書 9.4 節)、つながったほかのファイルの同じ側の履歴からも、
  // その操作と、それに続くものを消す。取り消しの履歴(which = 'undo')では、それより古いもの、やり直しの履歴(which = 'redo')では、
  // それより後の操作。どちらも配列の前の方(配列の末尾が、次に取り消す・やり直すもの)。消したものがほかの操作とつながっていれば、
  // そのつながりも同じく消す。理由は表示しない(1 つのファイルで新しく書き換えるとやり直しの履歴が消えるのと同じ扱い)
  const unlink = (removed, which) => {
    const queue = removed.filter((e) => e.link);
    const done = new Set();
    while (queue.length) {
      const e = queue.shift();
      if (done.has(e.link)) continue;
      done.add(e.link);
      for (const j of e.link.files) {
        if (!hs.has(j)) continue;
        const st = hs.get(j)[which];
        const i = st.findIndex((x) => x.link === e.link);
        if (i < 0) continue;
        for (const x of st.splice(0, i + 1)) if (x.link && !done.has(x.link)) queue.push(x);
      }
    }
  };
  const clearRedo = (k) => { const h = hs.get(k); if (h.redo.length) unlink(h.redo.splice(0), 'redo'); };
  const push = (k, e) => {
    const h = hs.get(k);
    const top = h.undo.at(-1);
    if (top) top.open = false;
    h.undo.push(e);
    if (h.undo.length > limit) unlink(h.undo.splice(0, h.undo.length - limit), 'undo');
    clearRedo(k);
  };
  const top = (k) => hs.get(k)?.undo.at(-1) ?? null;
  function typed(k, before, after, caret, inputType) {
    if (!hs.has(k)) return;
    const d = diffText(before, after, caret);
    if (!d) return;
    const kind = kindOf(inputType, d);
    const t = top(k);
    if (t && t.open && t.kind === kind && !t.link) {
      if (kind === 'type' && d.del === '' && d.start === t.start + t.ins.length) { t.ins += d.ins; clearRedo(k); return; }
      if (kind === 'back' && d.ins === '' && t.ins === '' && d.start + d.del.length === t.start) { t.start = d.start; t.del = d.del + t.del; clearRedo(k); return; }
      if (kind === 'fwd' && d.ins === '' && t.ins === '' && d.start === t.start) { t.del += d.del; clearRedo(k); return; }
    }
    push(k, { ...d, kind, open: kind !== 'other', link: null });
  }
  function composed(k, before, after, caret) {
    if (!hs.has(k)) return;
    const d = diffText(before, after, caret);
    if (!d) return;
    push(k, { ...d, kind: 'compose', open: false, link: null });
  }
  function edited(changes) {
    const cs = changes.filter((c) => hs.has(c.k) && (c.end > c.start || c.text !== ''));
    if (!cs.length) return;
    const link = cs.length > 1 ? { id: ++linkSeq, files: cs.map((c) => c.k) } : null;
    for (const c of cs) push(c.k, { start: c.start, del: c.before.slice(c.start, c.end), ins: c.text, kind: 'edit', open: false, link });
  }
  function cut(k) { const t = top(k); if (t) t.open = false; }
  const undoText = (t, e) => (t.slice(e.start, e.start + e.ins.length) === e.ins ? t.slice(0, e.start) + e.del + t.slice(e.start + e.ins.length) : null);
  const redoText = (t, e) => (t.slice(e.start, e.start + e.del.length) === e.del ? t.slice(0, e.start) + e.ins + t.slice(e.start + e.del.length) : null);
  // cant は「戻せません」か「やり直せません」
  function step(k, texts, from, to, apply, cant) {
    const h = hs.get(k);
    const e = h?.[from].at(-1);
    const T = typeof texts === 'function' ? texts : (j) => texts[j];
    if (!e) return { ok: false, reason: null }; // 履歴がない(何もしない)
    const group = e.link ? e.link.files : [k];
    // つながった履歴: どのファイルでも、その履歴が一番上にあるときだけ戻す(設計書 9.4 節)
    for (const j of group) {
      if (j === k) continue;
      const x = hs.get(j)?.[from].at(-1);
      if (x && x.link === e.link) continue;
      if (!hs.get(j)?.[from].some((y) => y.link === e.link)) {
        // つながった履歴が見つからない(上の unlink で起きないはずの、内部の食い違い。GR22 の A3)。理由を出さずに、その操作を
        // つながったすべてのファイルの履歴から消して何もしない。検査で見つかるよう、数を数える
        lostCount++;
        for (const i of group) { if (!hs.has(i)) continue; const st = hs.get(i)[from]; const at = st.findIndex((y) => y.link === e.link); if (at >= 0) st.splice(at, 1); }
        return { ok: false, reason: null };
      }
      return { ok: false, reason: `ほかのファイル(${where(j)})で後から書き換えたので、この操作は${cant}。先にそのファイルで${from === 'undo' ? '取り消して' : 'やり直して'}ください` };
    }
    const changes = [];
    for (const j of group) {
      const x = j === k ? e : hs.get(j)[from].at(-1);
      const nt = apply(T(j), x);
      if (nt === null) return { ok: false, reason: `ファイル(${where(j)})のテキストが履歴と合わないので、${cant}` };
      changes.push({ k: j, text: nt, caret: x.start + (from === 'undo' ? x.del.length : x.ins.length) });
    }
    for (const j of group) { const x = hs.get(j)[from].pop(); x.open = false; hs.get(j)[to].push(x); }
    return { ok: true, changes };
  }
  const add = (k) => { if (!hs.has(k)) hs.set(k, { undo: [], redo: [] }); };
  const remove = (k) => {
    const h = hs.get(k);
    if (!h) return;
    hs.delete(k);
    unlink(h.undo, 'undo');
    unlink(h.redo, 'redo');
  };
  return {
    typed, composed, edited, cut, add, remove,
    undo: (k, texts) => step(k, texts, 'undo', 'redo', undoText, '戻せません'),
    redo: (k, texts) => step(k, texts, 'redo', 'undo', redoText, 'やり直せません'),
    size: (k) => ({ undo: hs.get(k)?.undo.length ?? 0, redo: hs.get(k)?.redo.length ?? 0 }),
    lost: () => lostCount,
    limit,
  };
}
