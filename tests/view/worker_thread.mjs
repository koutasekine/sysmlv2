// 検査用: src/app/worker.js を Node.js の worker_threads で動かすための口(GR18 の B5 の検査。tests/view/app.mjs が使う)。
// 画面の Web Worker と同じく、self.onmessage に { data } を渡し、postMessage で応答を返す
import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = (m) => parentPort.postMessage(m);
await import('../../src/app/worker.js');
parentPort.on('message', (m) => self.onmessage({ data: m }));
