"""Demucs separation for the server (optional per-stem model "demucs"; needs torch and demucs).

Uses htdemucs_ft: four Hybrid Transformer Demucs models, one per stem (drums, bass, other,
vocals). Only the models for the requested stems run, so fewer stems finish sooner. "Other" is
still the mix minus the returned stems, worked out in the browser, as with the standard models."""
NAME = 'htdemucs_ft'


class SectionProgress:
    """Stands in for the tqdm module inside demucs.apply. With progress=True, apply_model wraps its
    list of ~8 s sections in tqdm.tqdm(...) and computes each section as the loop reaches it, so
    counting the items as they are taken reports real progress through the song."""

    def __init__(self):
        self.report = None  # called with the fraction of the current model done

    def tqdm(self, items, **_):
        items = list(items)
        for i, x in enumerate(items):
            if self.report:
                self.report(i / len(items))
            yield x


SECTIONS = SectionProgress()


def load(device):
    from demucs.pretrained import get_model
    m = get_model(NAME)
    m.eval()
    return m


def stems(mix, sr, want, model, device, progress=None):
    """mix: (2, n) float32 tensor on device -> {stem: (2, n) tensor} for the stems in want."""
    import torch
    import demucs.apply
    from demucs.apply import BagOfModels, apply_model
    demucs.apply.tqdm = SECTIONS  # see SectionProgress
    from torchaudio.functional import resample
    n = mix.shape[-1]
    fs = model.samplerate
    x = resample(mix, sr, fs) if sr != fs else mix
    # normalise like demucs.separate: the models expect roughly unit-variance input
    ref = x.mean(0)
    mu, sd = ref.mean(), ref.std() + 1e-8
    x = (x - mu) / sd
    subs = list(zip(model.models, model.weights)) if isinstance(model, BagOfModels) else [(model, [1.] * len(model.sources))]
    idx = [model.sources.index(s) for s in want]
    # skip the sub-models that carry no weight for any requested stem (htdemucs_ft has one per stem)
    subs = [(m, w) for m, w in subs if any(w[i] for i in idx)]
    est = torch.zeros(len(model.sources), 2, x.shape[-1], device=device)
    tot = [0.] * len(model.sources)
    if progress:
        progress(0, len(subs))
    with torch.no_grad():
        for k, (m, w) in enumerate(subs):
            m.to(device)
            SECTIONS.report = (lambda f, k=k: progress(round(1000 * (k + f)), 1000 * len(subs))) if progress else None
            try:
                o = apply_model(m, x[None], shifts=1, split=True, overlap=0.25, device=device, progress=True)[0]
            finally:
                SECTIONS.report = None
            for i, wi in enumerate(w):
                est[i] += o[i] * wi
                tot[i] += wi
            del o
            if progress:
                progress(k + 1, len(subs))
    out = {}
    for s, i in zip(want, idx):
        y = est[i] / tot[i] * sd + mu
        if sr != fs:
            y = resample(y, fs, sr)
        y = y[:, :n]
        if y.shape[1] < n:
            y = torch.nn.functional.pad(y, (0, n - y.shape[1]))
        out[s] = y
    return out
