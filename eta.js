/* Separation progress for the parallel worker pool: a cost-weighted bar and a ticking
   countdown of the total time remaining.

   Work is a queue of chunks. Each stem has a measured compute time per chunk (the median of
   what its finished chunks took, as timed inside the worker). Stems that have not produced a
   result yet are predicted from a measured one using REL, the relative compute cost per second
   of audio: in Chromium with the real models the vocal model cost about 6.4 s per second of
   audio against about 2 s for drums or bass. The remaining wall time is the remaining compute
   divided by the worker count, plus a model load for each stem not yet started, and never less
   than one chunk. */
const SEP_REL = { vocals: 64, drums: 20, bass: 20 };

function SepEta(onText, now) {
  now = now || (() => performance.now() / 1000);
  let P = null, W = 1, timer = null, snap = null, over = '', loadSecs = 4;
  const samples = {}, done = {}, started = {};
  let doneAll = 0, totalAll = 0, units = 0, unitsDone = 0;

  const med = a => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const chunkCost = s => {                       // seconds of compute for one chunk of stem s
    if (samples[s] && samples[s].length) return samples[s].length >= 3 ? med(samples[s]) : samples[s].reduce((a, b) => a + b, 0) / samples[s].length;
    let ref = null;                              // most-sampled stem to predict from
    for (const k in samples) if (samples[k].length && (!ref || samples[k].length > samples[ref].length)) ref = k;
    if (!ref) return null;
    const u = k => SEP_REL[k] * P[k].genSec;
    return chunkCost(ref) * u(s) / u(ref);
  };

  function plan(p, workers) {
    P = p; W = workers;
    for (const s in p) { samples[s] = []; done[s] = 0; started[s] = false; totalAll += p[s].total; units += p[s].total * SEP_REL[s] * p[s].genSec; }
    tick();
  }
  function setWorkers(w) { W = Math.max(1, w); recompute(); }

  function taskDone(stem, secs, load) {
    if (!P) return;
    samples[stem].push(secs); done[stem]++; doneAll++; started[stem] = true;
    unitsDone += SEP_REL[stem] * P[stem].genSec;
    if (load > 0) loadSecs = load;
    recompute();
  }

  function recompute() {
    over = '';
    let comp = 0, biggest = 0, loads = 0, unknown = false;
    for (const s in P) {
      const left = P[s].total - done[s];
      if (!left) continue;
      const c = chunkCost(s);
      if (c == null) { unknown = true; break; }
      comp += left * c; biggest = Math.max(biggest, c);
      if (!started[s]) loads++;
    }
    snap = unknown ? null : { rem: Math.max(comp / W + loads * loadSecs, biggest), at: now() };
    tick();
  }

  function frac() { return units ? Math.min(1, unitsDone / units) : 0; }

  function fmt(sec) {
    if (sec < 8) return 'a few seconds';
    if (sec < 60) return 'about ' + Math.round(sec / 5) * 5 + ' s';
    const m = Math.floor(sec / 60), s = Math.round((sec % 60) / 10) * 10;
    if (sec >= 600) return 'about ' + Math.round(sec / 60) + ' min';
    return 'about ' + (s === 60 ? (m + 1) + ' min' : m + ' min' + (s ? ' ' + s + ' s' : ''));
  }

  function text() {
    if (over && !P) return over;
    if (!P) return '';
    const base = over || (doneAll + ' of ' + totalAll + ' chunks · ' + W + ' worker' + (W > 1 ? 's' : ''));
    if (!snap) return base + (over ? '' : ' · timing…');
    const left = snap.rem - (now() - snap.at);
    return base + ' · ' + (left > 0 ? fmt(left) + ' total remaining' : 'finishing up…');
  }
  function note(t) { over = t; tick(); }
  function tick() { if (onText) onText(text()); }
  function start() { stop(); timer = setInterval(tick, 1000); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  return { plan, setWorkers, taskDone, frac, text, note, start, stop };
}
if (typeof module !== 'undefined') module.exports = { SepEta, SEP_REL };
