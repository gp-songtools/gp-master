/* Parallel stem separation.
   The song is cut into chunks that do not depend on each other, and a pool of workers
   (each running single-threaded WebAssembly, so no special server headers are needed)
   takes them from a shared queue. Chunks are queued stem by stem, slowest model first.
   Each worker keeps one model loaded and switches when the queue moves to the next stem.
   Models are downloaded once on the page and copied to a worker only when it needs one. */

function sepWorkerCount() {
  // leave one core for the page itself; four is plenty and keeps memory use sane
  return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
}

/* Turn the raw browser messages into something a person can act on. The original text is kept
   in brackets so it can still be reported. */
function sepExplain(err) {
  const raw = (err && err.message) || String(err || 'unknown error');
  let nice = null;
  if (/origin 'null'|file:\/\/|SecurityError/i.test(raw))
    nice = 'Stem separation cannot run when the page is opened as a file from a folder, because browsers block the background workers it uses. Use the hosted copy on GitHub Pages, or start a small local server in the project folder (for example, run "python3 -m http.server" there and open http://localhost:8000).';
  else if (/runtime-unavailable|importScripts|failed to load/i.test(raw))
    nice = 'The separation runtime could not be loaded, either from this site or from the backup copy on a CDN. Check your connection, and whether an ad blocker, firewall or school or work network is blocking it.';
  else if (/out of memory|allocation failed|array buffer allocation|memory access out of bounds|RangeError: Invalid typed array length/i.test(raw))
    nice = 'The browser ran out of memory. Each worker needs about 1 GB. Choose fewer workers in the Workers menu, close other tabs, or separate the 30-second section or fewer stems.';
  else if (/Failed to fetch|NetworkError|Load failed/i.test(raw))
    nice = 'A model file could not be downloaded. Check your connection and try again; the models are about 123 MB and are cached after the first download.';
  return nice ? (raw === 'file://' ? nice : nice + ' [' + raw + ']') : raw;
}

function separateParallel(o) {
  const stems = o.stems.filter(s => s !== 'other'), wantOther = o.stems.includes('other');
  const n = o.mix[0].length, eta = o.eta, say = o.onStatus || (() => {});
  const W = Math.max(1, o.workers || sepWorkerCount());
  let workers = [], dead = false, G = null;
  const result = {}, doneCount = {}, modelBuf = {}, modelWait = {}, queue = [];
  let remaining = 0, resolveFn, rejectFn;

  const fail = err => { if (dead) return; dead = true; workers.forEach(w => w.w.terminate()); rejectFn(err instanceof Error ? new Error(sepExplain(err)) : err); };
  const abort = () => fail(new Error('Separation cancelled'));

  // ---- model download, one at a time in the order they are needed ----
  async function fetchModel(stem) {
    const url = o.baseUrl + 'models/' + G[stem].file;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Could not download the ' + stem + ' model (' + r.status + ')');
    if (!r.body) return await r.arrayBuffer();
    // Collect chunks and join at the end. Content-Length cannot size a buffer: when the host
    // compresses the file it is the compressed size, while the stream yields decompressed
    // bytes, so a preallocated buffer would overflow. It is only used for the progress figure.
    const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), parts = [];
    let got = 0, last = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value); got += value.length;
      const t = performance.now();
      if (total && t - last > 400) { last = t; say('Downloading the ' + stem + ' model… ' + Math.min(99, Math.round(got / total * 100)) + '%'); }
    }
    const buf = new Uint8Array(got);
    let at = 0;
    for (const v of parts) { buf.set(v, at); at += v.length; }
    return buf.buffer;
  }

  // ---- scheduling ----
  function segFor(stem, k) {
    const g = G[stem], s = k * g.gen - g.trim, seg = [new Float32Array(g.chunk), new Float32Array(g.chunk)];
    const a = Math.max(0, s), b = Math.min(n, s + g.chunk);
    if (b > a) for (let c = 0; c < 2; c++) seg[c].set(o.mix[c].subarray(a, b), a - s);
    return seg;
  }

  function pump() {
    if (dead) return;
    for (const w of workers) {
      if (w.busy || w.dead || !queue.length) continue;
      const t = queue[0];
      if (!modelBuf[t.stem]) continue;               // head of queue is still downloading
      queue.shift();
      const seg = segFor(t.stem, t.k), msg = { type: 'task', id: t.id, stem: t.stem, k: t.k, seg }, tr = [seg[0].buffer, seg[1].buffer];
      if (w.stem !== t.stem) { msg.model = modelBuf[t.stem].slice(0); tr.push(msg.model); w.stem = t.stem; say('Running the ' + t.stem + ' model…'); }
      w.busy = true; w.task = t; w.w.postMessage(msg, tr);
    }
  }

  function onResult(w, m) {
    const t = w.task; w.busy = false; w.task = null;
    const g = G[m.stem], at = m.k * g.gen, len = Math.min(g.gen, n - at);
    for (let c = 0; c < 2; c++) result[m.stem][c].set(m.out[c].subarray(0, len), at);
    doneCount[m.stem]++; remaining--;
    if (eta) eta.taskDone(m.stem, m.secs, m.loadSecs);
    if (o.onProgress) o.onProgress({ stem: m.stem, done: doneCount[m.stem], total: t.total });
    if (remaining === 0) return finish();
    pump();
  }

  function onWorkerFault(w, message) {
    if (dead || w.dead) return;
    w.dead = true; w.w.terminate();
    const t = w.task; w.task = null; w.busy = false;
    if (t) { t.tries = (t.tries || 0) + 1; if (t.tries > 2) return fail(new Error(message)); queue.unshift(t); }
    if (!workers.some(x => !x.dead)) return fail(new Error(message));
    if (eta) eta.setWorkers(workers.filter(x => !x.dead).length);
    pump();
  }

  function finish() {
    if (dead) return;
    dead = true; workers.forEach(w => w.w.terminate());
    if (wantOther) {
      const oth = [new Float32Array(n), new Float32Array(n)];
      for (let c = 0; c < 2; c++) { oth[c].set(o.mix[c]); for (const s of stems) { const x = result[s][c]; for (let i = 0; i < n; i++) oth[c][i] -= x[i]; } }
      result.other = oth;
    }
    resolveFn({ result, sampleRate: o.sampleRate, workers: W });
  }

  // ---- start ----
  const promise = new Promise((res, rej) => { resolveFn = res; rejectFn = rej; });
  say('Starting ' + W + ' worker' + (W > 1 ? 's' : '') + '…');
  let ready = 0;
  for (let i = 0; i < W; i++) {
    let w;
    try { w = new Worker('./sep-worker.js'); } catch (e) { fail(new Error(sepExplain(e))); break; }
    const rec = { w, busy: false, dead: false, stem: null, task: null, id: i };
    workers.push(rec);
    w.onerror = e => onWorkerFault(rec, 'A worker failed: ' + (e.message || 'could not start'));
    w.onmessage = ev => {
      const m = ev.data;
      if (m.type === 'ready') {
        if (!G) {
          G = m.geometry;
          let id = 0;
          const plan = {};
          for (const s of stems) {
            const g = G[s], total = Math.ceil(n / g.gen);
            result[s] = [new Float32Array(n), new Float32Array(n)]; doneCount[s] = 0; remaining += total;
            plan[s] = { total, genSec: g.gen / o.sampleRate };
            for (let k = 0; k < total; k++) queue.push({ id: id++, stem: s, k, total });
          }
          if (eta) eta.plan(plan, W);
          // download models in the order they are needed, in the background
          let chain = Promise.resolve();
          for (const s of stems) chain = chain.then(async () => { modelBuf[s] = await fetchModel(s); pump(); });
          chain.catch(fail);
        }
        if (++ready === 1) say('Preparing the first model…');
        pump();
      } else if (m.type === 'result') onResult(rec, m);
      else if (m.type === 'error') onWorkerFault(rec, m.message);
    };
    w.postMessage({ type: 'init' });
  }
  promise.abort = abort;
  return promise;
}
