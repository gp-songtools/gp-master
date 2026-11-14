"""Demucs separation for the server (optional "Demucs" model; needs torch and demucs).

Uses htdemucs_ft: four Hybrid Transformer Demucs models, one per stem (drums, bass, other,
vocals). Only the models for the requested stems run, so fewer stems finish sooner. "Other" is
still the mix minus the returned stems, worked out in the browser, as with the standard models."""
import time


from sep_core import decode_upload, encode_result

NAME = 'htdemucs_ft'


def load(device):
    from demucs.pretrained import get_model
    m = get_model(NAME)
    m.eval()
    return m


def run_demucs(body, sr, n, stems, scale, model, device, progress=None):
    import torch
    from demucs.apply import BagOfModels, apply_model
    from torchaudio.functional import resample
    t0 = time.time()
    mix = torch.from_numpy(decode_upload(body, n, scale)).to(device)
    fs = model.samplerate
    x = resample(mix, sr, fs) if sr != fs else mix
    # normalise like demucs.separate: the models expect roughly unit-variance input
    ref = x.mean(0)
    mu, sd = ref.mean(), ref.std() + 1e-8
    x = (x - mu) / sd
    subs = list(zip(model.models, model.weights)) if isinstance(model, BagOfModels) else [(model, [1.] * len(model.sources))]
    want = [model.sources.index(s) for s in stems]
    # skip the sub-models that carry no weight for any requested stem (htdemucs_ft has one per stem)
    subs = [(m, w) for m, w in subs if any(w[i] for i in want)]
    est = torch.zeros(len(model.sources), 2, x.shape[-1], device=device)
    tot = [0.] * len(model.sources)
    if progress:
        progress(0, len(subs))
    with torch.no_grad():
        for k, (m, w) in enumerate(subs):
            m.to(device)
            o = apply_model(m, x[None], shifts=1, split=True, overlap=0.25, device=device)[0]
            for i, wi in enumerate(w):
                est[i] += o[i] * wi
                tot[i] += wi
            del o
            if progress:
                progress(k + 1, len(subs))
    out = {}
    for s, i in zip(stems, want):
        y = est[i] / tot[i] * sd + mu
        if sr != fs:
            y = resample(y, fs, sr)
        y = y[:, :n]
        if y.shape[1] < n:
            y = torch.nn.functional.pad(y, (0, n - y.shape[1]))
        out[s] = y.float().cpu().numpy()
    return encode_result(out, sr, {'provider': 'CUDAExecutionProvider' if str(device).startswith('cuda') else 'CPU',
                                   'model': 'demucs', 'version': 2, 'secs': round(time.time() - t0, 2)})
