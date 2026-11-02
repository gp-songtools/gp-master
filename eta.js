/* Separation progress: a cost-weighted progress fraction and a ticking countdown.
   Stems run one after another, and they are not equally expensive: in a native run the
   vocal model took 76 s against 28 s each for drums and bass on the same audio. REL holds
   those ratios. They are used only to guess stems that have not started yet; as soon as a
   stem has been timed, the next one is predicted from the measured speed instead. */
const SEP_REL = { vocals: 76, drums: 28, bass: 28 };

function SepEta(stems, onText, now) {
  now = now || (() => performance.now() / 1000);
  const order = stems.filter(s => SEP_REL[s]);
  const S = {};                        // per stem: total, first/last arrival, chunks at first arrival
  let cur = null, loadGap = 5, timer = null, snap = null, over = '';
  const sumW = order.reduce((a, s) => a + SEP_REL[s], 0);

  // measured seconds per chunk for a stem, or null until one interval has been seen
  const rate = s => {
    const r = S[s];
    return r && r.done > r.c0 ? (r.tLast - r.t0) / (r.done - r.c0) : null;
  };
  // estimated total time for a stem (measured if possible)
  const cost = s => {
    const r = rate(s);
    return r == null ? null : r * S[s].total;
  };

  function progress(m) {
    const t = now(), s = m.stem;
    if (!S[s]) {
      const prev = order[order.indexOf(s) - 1];
      if (prev && S[prev]) loadGap = Math.max(1, t - S[prev].tLast - (rate(s) || 0));   // time between stems: model load
      S[s] = { total: m.total, t0: t, c0: m.done, done: m.done, tLast: t };
    } else { S[s].done = m.done; S[s].tLast = t; S[s].total = m.total; }
    cur = s; over = '';

    // weighted bar
    const i = order.indexOf(s);
    let w = 0; for (let k = 0; k < i; k++) w += SEP_REL[order[k]];
    w += SEP_REL[s] * (m.done / m.total);
    const frac = sumW ? Math.min(1, w / sumW) : 0;

    // remaining time: rest of this stem, plus later stems predicted from the best reference
    let rem = null, refS = null;
    for (let k = i; k >= 0; k--) if (cost(order[k]) != null) { refS = order[k]; break; }
    if (refS) {
      const ref = cost(refS), per = SEP_REL[s] / SEP_REL[refS];
      rem = rate(s) != null ? rate(s) * (S[s].total - S[s].done) : ref * per * (1 - S[s].done / S[s].total);
      for (let k = i + 1; k < order.length; k++) rem += loadGap + ref * (SEP_REL[order[k]] / SEP_REL[refS]);
    }
    snap = rem == null ? null : { rem, at: t };
    tick();
    return frac;
  }

  function fmt(sec) {
    if (sec < 8) return 'a few seconds';
    if (sec < 60) return 'about ' + Math.round(sec / 5) * 5 + ' s';
    const m = Math.floor(sec / 60), s = Math.round((sec % 60) / 10) * 10;
    if (sec >= 600) return 'about ' + Math.round(sec / 60) + ' min';
    return 'about ' + (s === 60 ? (m + 1) + ' min' : m + ' min' + (s ? ' ' + s + ' s' : ''));
  }

  // text for the current moment, counting down between worker messages
  function text() {
    if (!cur) return over;
    const r = S[cur], base = over || (cur + ': chunk ' + r.done + ' of ' + r.total);
    if (!snap) return base + (over ? '' : ' · timing…');
    const left = snap.rem - (now() - snap.at);
    return base + ' · ' + (left > 0 ? fmt(left) + ' left' : 'finishing up…');
  }
  function note(t) { over = t; tick(); }
  function tick() { if (onText) onText(text()); }
  function start() { stop(); timer = setInterval(tick, 1000); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  return { progress, text, note, start, stop };
}
if (typeof module !== 'undefined') module.exports = { SepEta, SEP_REL };
