/* Stem separation on your own server (optional; see server/README.md).
   Same models and maths as sep-worker.js, run on a GPU or a bigger CPU. The page uploads the
   section as 16-bit stereo, the server returns one 16-bit FLAC per stem, and "other" is the mix
   minus the stems, exactly as in sep-pool.js. Resolves like separateParallel().
   The access token is sent only in the Authorization header, never in a URL or message. */

function sepRemoteExplain(status, url) {
  if (status === 0) return 'Could not reach the separation server at ' + url + '. Check the address and your connection. A server that has been idle can take a minute to start.';
  if (status === 401) return 'The separation server refused the access token. Check the access token under Separate on: My server.';
  if (status === 404) return 'The separation server lost the job (it may have restarted). Try again.';
  if (status === 413) return 'The song is too large for the separation server. Separate the 30-second section, or a shorter file.';
  return 'The separation server returned an error (' + status + ').';
}

function separateRemote(o) {
  const url = o.url.replace(/\/+$/, ''), say = o.onStatus || (() => {}), prog = o.onProgress || (() => {});
  const stems = o.stems.filter(s => s !== 'other'), wantOther = o.stems.includes('other');
  const n = o.mix[0].length, L = o.mix[0], R = o.mix[1];
  let dead = false, xhr = null, timer = null, rejectFn;

  function req(method, path, body, onUp, onDown) {
    return new Promise((res, rej) => {
      const x = xhr = new XMLHttpRequest();
      x.open(method, url + path);
      x.setRequestHeader('Authorization', 'Bearer ' + o.token);
      x.responseType = 'arraybuffer';
      if (onUp) x.upload.onprogress = e => e.lengthComputable && onUp(e.loaded / e.total);
      if (onDown) x.onprogress = e => onDown(e.loaded, e.lengthComputable ? e.total : 0);
      x.onload = () => res(x);
      x.onerror = () => rej(new Error(sepRemoteExplain(0, url)));
      x.onabort = () => rej(new Error('Separation cancelled'));
      x.send(body || null);
    });
  }
  const json = x => { try { return JSON.parse(new TextDecoder().decode(x.response)); } catch (e) { return {}; } };
  const fail = x => { const d = json(x); return new Error(x.status >= 500 && d.detail ? d.detail : sepRemoteExplain(x.status, url)); };

  async function decode(buf, sr) {
    const ctx = new OfflineAudioContext(2, 1, sr);
    return await ctx.decodeAudioData(buf);
  }

  async function run() {
    let pk = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > pk) pk = a; if (b > pk) pk = b; }
    const scale = Math.max(1, pk), k = 32767 / scale, pcm = new Int16Array(2 * n);
    for (let i = 0; i < n; i++) { pcm[2 * i] = Math.round(L[i] * k); pcm[2 * i + 1] = Math.round(R[i] * k); }
    const mb = (pcm.byteLength / 1048576).toFixed(0);
    say('Uploading ' + mb + ' MB to the separation server…');
    let x = await req('POST', '/jobs?sr=' + o.sampleRate + '&n=' + n + '&stems=' + stems.join(',') + '&scale=' + scale, pcm.buffer,
      f => { say('Uploading ' + mb + ' MB to the separation server… ' + Math.round(f * 100) + '%'); prog(0.1 * f); });
    if (dead) return;
    if (x.status !== 200) throw fail(x);
    const id = json(x).id;
    if (!id) throw new Error('The separation server sent an unexpected answer.');
    const t0 = performance.now();
    for (;;) {
      await new Promise(r => { timer = setTimeout(r, 1500); });
      if (dead) return;
      x = await req('GET', '/jobs/' + encodeURIComponent(id), null, null, (got, tot) => {
        if (x && x.status === 202) return;
        say('Downloading the stems… ' + (tot ? Math.round(got / tot * 100) + '%' : (got / 1048576).toFixed(0) + ' MB'));
        if (tot) prog(0.9 + 0.08 * got / tot);
      });
      if (dead) return;
      if (x.status === 202) {
        const d = json(x), s = Math.round((performance.now() - t0) / 1000);
        if (d.total) { say('Separating on the server… ' + Math.round(d.done / d.total * 100) + '%'); prog(0.1 + 0.8 * d.done / d.total); }
        else say('Waiting for the server to start (' + s + ' s; the first song after a break takes longest)…');
        continue;
      }
      if (x.status !== 200) throw fail(x);
      break;
    }
    say('Unpacking the stems…');
    const buf = x.response, dv = new DataView(buf), hl = dv.getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
    const result = {};
    let at = 4 + hl;
    for (const s of head.stems) {
      const ab = await decode(buf.slice(at, at + s.bytes), o.sampleRate); at += s.bytes;
      if (dead) return;
      const g = s.scale * 32768 / 32767, out = [new Float32Array(n), new Float32Array(n)];
      for (let c = 0; c < 2; c++) {
        const y = ab.getChannelData(Math.min(c, ab.numberOfChannels - 1)), m = Math.min(n, y.length), z = out[c];
        for (let i = 0; i < m; i++) z[i] = y[i] * g;
      }
      result[s.name] = out;
    }
    for (const s of stems) if (!result[s]) throw new Error('The separation server did not return the ' + s + ' stem.');
    if (wantOther) {
      const oth = [new Float32Array(L), new Float32Array(R)];
      for (let c = 0; c < 2; c++) for (const s of stems) { const y = result[s][c], z = oth[c]; for (let i = 0; i < n; i++) z[i] -= y[i]; }
      result.other = oth;
    }
    prog(1);
    return { result, sampleRate: o.sampleRate, workers: 0, remote: true, provider: head.provider || '', serverSecs: head.secs };
  }

  const promise = new Promise((res, rej) => { rejectFn = rej; run().then(v => { if (!dead) res(v); }, e => { if (!dead) { dead = true; rej(e); } }); });
  promise.abort = () => { if (dead) return; dead = true; clearTimeout(timer); if (xhr) xhr.abort(); rejectFn(new Error('Separation cancelled')); };
  return promise;
}

/* Quick check from the settings: reachable, and the token accepted. Resolves to a message. */
async function sepRemoteCheck(url, token) {
  url = url.replace(/\/+$/, '');
  let r;
  try { r = await fetch(url + '/check', { headers: { Authorization: 'Bearer ' + token } }); }
  catch (e) { throw new Error(sepRemoteExplain(0, url)); }
  if (!r.ok) throw new Error(sepRemoteExplain(r.status, url));
  return 'Connected. The server accepted the token.';
}
