/* Stem separation on your own server (optional; see server/README.md).
   Same models and maths as sep-worker.js, run on a GPU or a bigger CPU. The page uploads the
   section as 16-bit stereo, the server returns one 16-bit FLAC per stem, and "other" is the mix
   minus the stems, exactly as in sep-pool.js. Resolves like separateParallel().
   The access token is sent only in the Authorization header, never in a URL or message. */

const SEP_OLD = 'Your separation server is older than this page and cannot run the models you picked. Update it: download a new Server kit and run its setup again (keep your access-token.txt), or pick Standard for every stem.';
/* per-stem models a server can run: 'mdx' = Standard (the browser's models), 'demucs', 'roformer' (vocals only) */
const SEP_MODELS = { vocals: ['mdx', 'roformer', 'demucs'], drums: ['mdx', 'demucs'], bass: ['mdx', 'demucs'] };
const SEP_MNAME = { mdx: 'Standard', demucs: 'Demucs', roformer: 'RoFormer' };
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
  const fail = x => { const d = json(x); return new Error((x.status >= 500 || x.status === 400) && typeof d.detail === 'string' ? d.detail : sepRemoteExplain(x.status, url)); };

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
    const want = {};
    for (const s of stems) want[s] = (SEP_MODELS[s] || ['mdx']).includes((o.models || {})[s]) ? o.models[s] : 'mdx';
    // `model` is for servers from before per-stem models: when every stem uses the same one it still works there
    const same = stems.every(s => want[s] === want[stems[0]]) ? want[stems[0]] : 'mdx';
    let x = await req('POST', '/jobs?sr=' + o.sampleRate + '&n=' + n + '&stems=' + stems.join(',') + '&scale=' + scale +
      '&model=' + same + '&models=' + stems.map(s => s + ':' + want[s]).join(','), pcm.buffer,
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
    // an older server ignores models it does not know and runs others; say so rather than mislabel the stems
    for (const s of head.stems) if (want[s.name] && (s.model || head.model || 'mdx') !== want[s.name]) throw new Error(SEP_OLD);
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
    return { result, sampleRate: o.sampleRate, workers: 0, remote: true, provider: head.provider || '', serverSecs: head.secs, models: want };
  }

  const promise = new Promise((res, rej) => { rejectFn = rej; run().then(v => { if (!dead) res(v); }, e => { if (!dead) { dead = true; rej(e); } }); });
  promise.abort = () => { if (dead) return; dead = true; clearTimeout(timer); if (xhr) xhr.abort(); rejectFn(new Error('Separation cancelled')); };
  return promise;
}

/* Quick check from the settings: reachable, token accepted, which models per stem. Resolves to {models, msg}. */
async function sepRemoteCheck(url, token) {
  url = url.replace(/\/+$/, '');
  let r;
  try { r = await fetch(url + '/check', { headers: { Authorization: 'Bearer ' + token } }); }
  catch (e) { throw new Error(sepRemoteExplain(0, url)); }
  if (!r.ok) throw new Error(sepRemoteExplain(r.status, url));
  let d = {};
  try { d = await r.json(); } catch (e) { /* older server */ }
  const all = Array.isArray(d.models) ? d.models : ['mdx'];
  const per = d.stem_models && typeof d.stem_models === 'object' ? d.stem_models : { vocals: all, drums: all, bass: all };
  const miss = Object.keys(SEP_MODELS).flatMap(s => SEP_MODELS[s].filter(m => !(per[s] || []).includes(m)).map(m => SEP_MNAME[m] + ' ' + s));
  return { models: per, msg: 'Connected. The server accepted the token' + (miss.length ? '. It cannot run ' + miss.join(', ') + '; for those, update it with a new Server kit.' : ' and runs every model.') };
}

/* The server kit: the server files from this site, zipped in the browser so the kit always
   matches the code (no build step, nothing committed). The models are not included; Modal
   fetches them from this site, or the user adds a models folder (see server/kit/README.txt). */
const SEP_KIT = [['server/modal_app.py', 'modal_app.py'], ['server/sep_core.py', 'sep_core.py'], ['server/demucs_core.py', 'demucs_core.py'], ['server/roformer_core.py', 'roformer_core.py'], ['server/torch_core.py', 'torch_core.py'], ['server/api.py', 'api.py'],
  ['server/kit/setup.ps1', 'setup.ps1'], ['server/kit/setup.sh', 'setup.sh', 0o755], ['server/kit/README.txt', 'README.txt']];
let sepCrcT = null;
function sepCrc(b) {
  if (!sepCrcT) { sepCrcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; sepCrcT[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = sepCrcT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// files: [{name, data: Uint8Array, mode?}] -> Blob (stored, no compression; Unix modes kept)
function sepZip(files) {
  const d = new Date(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), enc = new TextEncoder();
  const parts = [], cen = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = sepCrc(f.data), n = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [8, 0, 2], [10, tm, 2], [12, dt, 2], [14, crc, 4], [18, n, 4], [22, n, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([o, v, s]) => s === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 0x314, 2], [6, 20, 2], [8, 0x800, 2], [10, 0, 2], [12, tm, 2], [14, dt, 2], [16, crc, 4], [20, n, 4], [24, n, 4],
      [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, ((f.mode || 0o644) | 0o100000) * 65536, 4], [42, off, 4]]
      .forEach(([o, v, s]) => s === 4 ? c.setUint32(o, v >>> 0, true) : c.setUint16(o, v, true));
    parts.push(h, nm, f.data); cen.push(c, nm); off += 30 + nm.length + n;
  }
  const size = cen.reduce((t, x) => t + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, off, 4], [20, 0, 2]]
    .forEach(([o, v, s]) => s === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true));
  return new Blob([...parts, ...cen, e], { type: 'application/zip' });
}
async function sepKitZip(base) {
  const files = [];
  for (const [p, name, mode] of SEP_KIT) {
    const r = await fetch(base + p, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Could not fetch ' + p + ' (' + r.status + ')');
    let t = await r.text();
    if (/\.(ps1|txt)$/.test(name)) t = t.replace(/\r?\n/g, '\r\n');  // Windows line endings for Windows files
    files.push({ name: 'gpm-sep-server/' + name, data: new TextEncoder().encode(t), mode });
  }
  return sepZip(files);
}
