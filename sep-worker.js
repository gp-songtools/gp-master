/* Stem separation worker: MDX-Net ONNX inference in the browser.
   Parameters verified against UVR's model_data.json — see docs/stem-separation.md.
   The n_fft differs per model and cannot be inferred from the ONNX input shape;
   running a model at the wrong n_fft silently produces a weak, hollow stem. */

const ORT_VERSION = '1.20.1';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

const HOP = 1024;
const MODELS = {
  vocals: { file: 'Kim_Vocal_2.onnx',      n_fft: 7680,  dim_f: 3072, dim_t: 256, comp: 1.009 },
  drums:  { file: 'kuielab_a_drums.onnx',  n_fft: 4096,  dim_f: 2048, dim_t: 512, comp: 1.035 },
  bass:   { file: 'kuielab_a_bass.onnx',   n_fft: 16384, dim_f: 2048, dim_t: 512, comp: 1.035 },
};

/* ---------- FFT: iterative radix-2, with Bluestein for non-power-of-2 sizes ---------- */
const isPow2 = n => (n & (n - 1)) === 0;
const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

class Pow2FFT {
  constructor(n) {
    this.n = n;
    this.rev = new Uint32Array(n);
    for (let i = 1, j = 0; i < n; i++) {
      let b = n >> 1;
      for (; j & b; b >>= 1) j ^= b;
      j ^= b;
      this.rev[i] = j;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos(-2 * Math.PI * i / n);
      this.sin[i] = Math.sin(-2 * Math.PI * i / n);
    }
  }
  // in-place forward transform of re/im (length n)
  run(re, im) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0, tw = 0; k < half; k++, tw += step) {
          const wr = this.cos[tw], wi = this.sin[tw];
          const u = i + k, v = u + half;
          const tr = re[v] * wr - im[v] * wi;
          const ti = re[v] * wi + im[v] * wr;
          re[v] = re[u] - tr; im[v] = im[u] - ti;
          re[u] += tr;        im[u] += ti;
        }
      }
    }
  }
}

class FFT {
  constructor(n) {
    this.n = n;
    if (isPow2(n)) { this.core = new Pow2FFT(n); return; }
    // Bluestein: convolution of length m >= 2n-1
    const m = nextPow2(2 * n - 1);
    this.m = m;
    this.core = new Pow2FFT(m);
    this.wr = new Float64Array(n); this.wi = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      // exp(-i*pi*j^2/n), using j^2 mod 2n for numerical stability
      const a = -Math.PI * ((j * j) % (2 * n)) / n;
      this.wr[j] = Math.cos(a); this.wi[j] = Math.sin(a);
    }
    const br = new Float64Array(m), bi = new Float64Array(m);
    br[0] = this.wr[0]; bi[0] = -this.wi[0];
    for (let j = 1; j < n; j++) {
      br[j] = br[m - j] = this.wr[j];
      bi[j] = bi[m - j] = -this.wi[j];
    }
    this.core.run(br, bi);
    this.br = br; this.bi = bi;
    this.ar = new Float64Array(m); this.ai = new Float64Array(m);
  }
  run(re, im) {
    if (this.n === this.core.n) { this.core.run(re, im); return; }
    const n = this.n, m = this.m, ar = this.ar, ai = this.ai;
    ar.fill(0); ai.fill(0);
    for (let j = 0; j < n; j++) {
      ar[j] = re[j] * this.wr[j] - im[j] * this.wi[j];
      ai[j] = re[j] * this.wi[j] + im[j] * this.wr[j];
    }
    this.core.run(ar, ai);
    for (let k = 0; k < m; k++) {
      const r = ar[k] * this.br[k] - ai[k] * this.bi[k];
      const i2 = ar[k] * this.bi[k] + ai[k] * this.br[k];
      ar[k] = r; ai[k] = i2;
    }
    // inverse transform of the product: conj -> fft -> conj / m
    for (let k = 0; k < m; k++) ai[k] = -ai[k];
    this.core.run(ar, ai);
    for (let k = 0; k < n; k++) {
      const cr = ar[k] / m, ci = -ai[k] / m;
      re[k] = cr * this.wr[k] - ci * this.wi[k];
      im[k] = cr * this.wi[k] + ci * this.wr[k];
    }
  }
}

/* ---------- STFT / ISTFT matching the Python reference ---------- */
function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  return w;
}

class Spec {
  constructor(n_fft, dim_f, dim_t) {
    this.N = n_fft; this.dim_f = dim_f; this.dim_t = dim_t;
    this.fft = new FFT(n_fft);
    this.win = hann(n_fft);
    this.re = new Float64Array(n_fft);
    this.im = new Float64Array(n_fft);
  }
  // seg: [Float32Array L, Float32Array R] of length chunk -> Float32Array(4*dim_f*dim_t)
  forward(seg) {
    const N = this.N, half = N >> 1, F = this.dim_f, T = this.dim_t;
    const n = seg[0].length, frames = (n / HOP | 0) + 1;
    const out = new Float32Array(4 * F * T);
    const padLen = n + N;
    const pad = new Float64Array(padLen);
    for (let c = 0; c < 2; c++) {
      const x = seg[c];
      // reflect pad by half on both sides
      for (let i = 0; i < half; i++) pad[i] = x[Math.min(n - 1, half - i)];
      for (let i = 0; i < n; i++) pad[half + i] = x[i];
      for (let i = 0; i < half; i++) pad[half + n + i] = x[Math.max(0, n - 2 - i)];
      for (let t = 0; t < Math.min(frames, T); t++) {
        const off = t * HOP;
        for (let i = 0; i < N; i++) { this.re[i] = pad[off + i] * this.win[i]; this.im[i] = 0; }
        this.fft.run(this.re, this.im);
        const baseR = (2 * c) * F * T, baseI = (2 * c + 1) * F * T;
        for (let f = 0; f < F; f++) {
          out[baseR + f * T + t] = this.re[f];
          out[baseI + f * T + t] = this.im[f];
        }
      }
    }
    return out;
  }
  // spec: Float32Array(4*dim_f*dim_t) -> [Float64Array L, Float64Array R] of length n
  inverse(spec, n) {
    const N = this.N, half = N >> 1, F = this.dim_f, T = this.dim_t;
    const L = (T - 1) * HOP + N;
    const out = [new Float64Array(n), new Float64Array(n)];
    const acc = new Float64Array(L), wsum = new Float64Array(L);
    for (let t = 0; t < T; t++) {
      const off = t * HOP;
      for (let i = 0; i < N; i++) wsum[off + i] += this.win[i] * this.win[i];
    }
    for (let i = 0; i < L; i++) if (wsum[i] < 1e-8) wsum[i] = 1e-8;
    for (let c = 0; c < 2; c++) {
      acc.fill(0);
      const baseR = (2 * c) * F * T, baseI = (2 * c + 1) * F * T;
      for (let t = 0; t < T; t++) {
        this.re.fill(0); this.im.fill(0);
        for (let f = 0; f < F; f++) {
          const r = spec[baseR + f * T + t], im = spec[baseI + f * T + t];
          this.re[f] = r; this.im[f] = im;
          if (f > 0 && f < half) { this.re[N - f] = r; this.im[N - f] = -im; }
        }
        // inverse FFT via conjugation
        for (let i = 0; i < N; i++) this.im[i] = -this.im[i];
        this.fft.run(this.re, this.im);
        const off = t * HOP;
        for (let i = 0; i < N; i++) acc[off + i] += (this.re[i] / N) * this.win[i];
      }
      for (let i = 0; i < n; i++) out[c][i] = acc[half + i] / wsum[half + i];
    }
    return out;
  }
}

/* ---------- inference ---------- */
let ortReady = false;
async function initOrt() {
  if (ortReady) return;
  importScripts(ORT_BASE + 'ort.min.js');
  self.ort.env.wasm.wasmPaths = ORT_BASE;
  self.ort.env.wasm.numThreads = 1;   // no SharedArrayBuffer without COOP/COEP headers
  self.ort.env.wasm.simd = true;
  self.ort.env.logLevel = 'error';
  ortReady = true;
}

const post = (type, data) => self.postMessage(Object.assign({ type }, data));

async function separateStem(name, mix, baseUrl) {
  const M = MODELS[name];
  const chunk = HOP * (M.dim_t - 1), trim = M.n_fft >> 1, gen = chunk - 2 * trim;
  post('status', { stem: name, text: `Loading ${name} model…` });
  const session = await self.ort.InferenceSession.create(baseUrl + 'models/' + M.file,
    { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const inName = session.inputNames[0];

  const n = mix[0].length;
  const padLen = trim + n + gen + chunk;
  const padded = [new Float32Array(padLen), new Float32Array(padLen)];
  for (let c = 0; c < 2; c++) padded[c].set(mix[c], trim);

  const out = [new Float32Array(padLen), new Float32Array(padLen)];
  const spec = new Spec(M.n_fft, M.dim_f, M.dim_t);
  const nchunks = Math.ceil(n / gen);

  for (let k = 0; k < nchunks; k++) {
    const s = k * gen;
    const seg = [padded[0].subarray(s, s + chunk), padded[1].subarray(s, s + chunk)];
    const input = spec.forward(seg);
    const tensor = new self.ort.Tensor('float32', input, [1, 4, M.dim_f, M.dim_t]);
    const res = await session.run({ [inName]: tensor });
    const y = res[session.outputNames[0]].data;
    const wav = spec.inverse(y, chunk);
    for (let c = 0; c < 2; c++) {
      const dst = out[c], src = wav[c];
      for (let i = 0; i < gen; i++) dst[s + trim + i] += src[trim + i] * M.comp;
    }
    post('progress', { stem: name, done: k + 1, total: nchunks });
  }
  await session.release();
  return [out[0].slice(trim, trim + n), out[1].slice(trim, trim + n)];
}

self.onmessage = async (e) => {
  const { mix, stems, baseUrl, sampleRate } = e.data;
  try {
    await initOrt();
    const n = mix[0].length;
    const result = {};
    const wanted = stems.filter(s => s !== 'other');
    for (const name of wanted) {
      const t0 = performance.now();
      result[name] = await separateStem(name, mix, baseUrl);
      post('status', { stem: name, text: `${name} done in ${((performance.now() - t0) / 1000).toFixed(0)}s` });
    }
    if (stems.includes('other')) {
      const o = [new Float32Array(n), new Float32Array(n)];
      for (let c = 0; c < 2; c++) {
        o[c].set(mix[c]);
        for (const name of wanted) {
          const s = result[name][c];
          for (let i = 0; i < n; i++) o[c][i] -= s[i];
        }
      }
      result.other = o;
    }
    const transfer = [];
    for (const k in result) for (const ch of result[k]) transfer.push(ch.buffer);
    self.postMessage({ type: 'done', result, sampleRate }, transfer);
  } catch (err) {
    post('error', { message: (err && err.message) || String(err) });
  }
};
