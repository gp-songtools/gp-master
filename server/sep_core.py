"""MDX-Net stem separation, the same maths as sep-worker.js (see docs/stem-separation.md).

Each model's n_fft differs and cannot be inferred from the ONNX input shape; a wrong value
silently gives a weak, hollow stem. Keep MODELS in step with sep-worker.js."""
import numpy as np

HOP = 1024
MODELS = {
    'vocals': dict(file='Kim_Vocal_2.onnx', n_fft=7680, dim_f=3072, dim_t=256, comp=1.009),
    'drums': dict(file='kuielab_a_drums.onnx', n_fft=4096, dim_f=2048, dim_t=512, comp=1.035),
    'bass': dict(file='kuielab_a_bass.onnx', n_fft=16384, dim_f=2048, dim_t=512, comp=1.035),
}


def geometry(M):
    chunk = HOP * (M['dim_t'] - 1)
    trim = M['n_fft'] // 2
    return chunk, trim, chunk - 2 * trim


def _segments(mix, M):
    """mix: (2, n) float32 -> (K, 2, chunk) chunks laid out as sep-pool.js segFor()."""
    n = mix.shape[1]
    chunk, trim, gen = geometry(M)
    K = -(-n // gen)
    pad = np.zeros((2, trim + K * gen + chunk), np.float32)
    pad[:, trim:trim + n] = mix
    return np.stack([pad[:, k * gen:k * gen + chunk] for k in range(K)])


def _stft(seg, M, xp=np):
    """(B, 2, chunk) -> (B, 4, dim_f, dim_t) as [re_L, im_L, re_R, im_R].
    xp is numpy, or cupy to do the maths on the GPU (same float64 precision)."""
    N, F, T = M['n_fft'], M['dim_f'], M['dim_t']
    h = N // 2
    win = 0.5 - 0.5 * xp.cos(2 * xp.pi * xp.arange(N) / N)
    x = xp.pad(seg.astype(xp.float64), ((0, 0), (0, 0), (h, h)), mode='reflect')
    idx = xp.arange(T)[:, None] * HOP + xp.arange(N)[None, :]
    S = xp.fft.rfft(x[:, :, idx] * win, axis=-1)[..., :F]  # (B, 2, T, F)
    S = xp.transpose(S, (0, 1, 3, 2))  # (B, 2, F, T)
    out = xp.empty((seg.shape[0], 4, F, T), xp.float32)
    out[:, 0::2] = S.real
    out[:, 1::2] = S.imag
    return out


def _istft(spec, M, n, xp=np):
    """(B, 4, dim_f, dim_t) -> (B, 2, n), window-squared overlap-add normalisation."""
    N, F, T = M['n_fft'], M['dim_f'], M['dim_t']
    h = N // 2
    win = 0.5 - 0.5 * xp.cos(2 * xp.pi * xp.arange(N) / N)
    B = spec.shape[0]
    Z = xp.zeros((B, 2, T, N // 2 + 1), xp.complex128)
    Z[..., :F] = xp.transpose(spec[:, 0::2] + 1j * spec[:, 1::2].astype(xp.float64), (0, 1, 3, 2))
    fr = xp.fft.irfft(Z, n=N, axis=-1) * win  # (B, 2, T, N)
    L = (T - 1) * HOP + N
    acc = xp.zeros((B, 2, L))
    ws = xp.zeros(L)
    for t in range(T):
        acc[:, :, t * HOP:t * HOP + N] += fr[:, :, t]
        ws[t * HOP:t * HOP + N] += win * win
    ws = xp.maximum(ws, 1e-8)
    return (acc / ws)[:, :, h:h + n]


def separate(mix, stem, session, batch=4, progress=None, run_options=None, xp=np):
    """Run one model over the whole mix. mix: (2, n) float32. Returns (2, n) float32.
    Every batch has the same shape (the last one is padded with silence), so a GPU memory
    pool sized for the first batch is reused instead of growing."""
    M = MODELS[stem]
    n = mix.shape[1]
    chunk, trim, gen = geometry(M)
    segs = _segments(mix, M)
    name = session.get_inputs()[0].name
    out = np.zeros((2, segs.shape[0] * gen), np.float32)
    host = getattr(xp, 'asnumpy', np.asarray)  # cupy -> numpy; a no-op for numpy
    for a in range(0, segs.shape[0], batch):
        b = segs[a:a + batch]
        real = b.shape[0]
        if real < batch:
            b = np.concatenate([b, np.zeros((batch - real,) + b.shape[1:], b.dtype)])
        x = host(_stft(xp.asarray(b), M, xp))
        y = session.run(None, {name: x}, run_options)[0][:real]
        w = host(_istft(xp.asarray(y), M, chunk, xp)[:, :, trim:trim + gen] * M['comp'])
        for i in range(w.shape[0]):
            out[:, (a + i) * gen:(a + i + 1) * gen] = w[i]
        if progress:
            progress(stem, min(a + batch, segs.shape[0]), segs.shape[0])
    return out[:, :n]


def run_job(body, sr, n, stems, scale, sessions, provider='', progress=None, batch=4, run_options=None, xp=np):
    """Upload bytes -> result bytes, in the wire format described in modal_app.py."""
    import io
    import json
    import struct
    import time
    import soundfile as sf
    t0 = time.time()
    mix = np.frombuffer(body, '<i2', count=2 * n).reshape(n, 2).T.astype(np.float32) * (scale / 32767)
    total = sum(-(-n // geometry(MODELS[s])[2]) for s in stems)
    done = {s: 0 for s in stems}

    def tick(s, d, t):
        done[s] = d
        if progress:
            progress(sum(done.values()), total)
    head, parts = {'stems': [], 'provider': provider, 'version': 1}, []
    for s in stems:
        y = separate(mix, s, sessions[s], batch=batch, progress=tick, run_options=run_options, xp=xp)
        pk = float(np.max(np.abs(y))) or 1e-9
        q = np.round(y.T / pk * 32767).astype('<i2')
        b = io.BytesIO()
        sf.write(b, q, sr, format='FLAC', subtype='PCM_16')
        parts.append(b.getvalue())
        head['stems'].append({'name': s, 'scale': pk, 'bytes': len(parts[-1])})
    head['secs'] = round(time.time() - t0, 2)
    h = json.dumps(head).encode()
    return struct.pack('<I', len(h)) + h + b''.join(parts)
