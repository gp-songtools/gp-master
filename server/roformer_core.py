"""BS-RoFormer vocals for the server (optional per-stem model "roformer"; needs torch).

Model: BS-RoFormer, viperx edition (model_bs_roformer_ep_317_sdr_12.9755), from the same
Ultimate Vocal Remover collection as the standard models; no licence of its own, so used with
credit, free, never in anything paid. Code: ZFTurbo's Music-Source-Separation-Training (MIT),
models/bs_roformer at a pinned commit, fetched while Modal builds the image. Settings below are
that repository's configs/viperx/model_bs_roformer_ep_317_sdr_12.9755.yaml; inference follows its
utils/model_utils.demix (8 s chunks, half overlap, linear 0.8 s fades, reflect-padded ends)."""
import sys

ZF_COMMIT = '1f700c386e0dd763fe0a57242bb9420dce987354'
ZF_FILES = ('models/bs_roformer/bs_roformer.py', 'models/bs_roformer/attend.py')
CKPT = 'model_bs_roformer_ep_317_sdr_12.9755.ckpt'
CKPT_URL = 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/' + CKPT
CKPT_SHA256 = '5b84f37e8d444c8cb30c79d77f613a41c05868ff9c9ac6c7049c00aefae115aa'
SR = 44100
CHUNK = 352800  # 8 s
OVERLAP = 2
BATCH = 2
CFG = dict(
    dim=512, depth=12, stereo=True, num_stems=1, time_transformer_depth=1, freq_transformer_depth=1,
    linear_transformer_depth=0,
    freqs_per_bands=(2,) * 24 + (4,) * 12 + (12,) * 8 + (24,) * 8 + (48,) * 8 + (128, 129),
    dim_head=64, heads=8, attn_dropout=0.1, ff_dropout=0.1, flash_attn=True, dim_freqs_in=1025,
    stft_n_fft=2048, stft_hop_length=441, stft_win_length=2048, stft_normalized=False,
    mask_estimator_depth=2, multi_stft_resolution_loss_weight=1.0,
    multi_stft_resolutions_window_sizes=(4096, 2048, 1024, 512, 256), multi_stft_hop_size=147,
    multi_stft_normalized=False)


def fetch_script(code_dir, ckpt_dir):
    """Python source that downloads the pinned code and the checked weights (run at image build)."""
    base = 'https://raw.githubusercontent.com/ZFTurbo/Music-Source-Separation-Training/' + ZF_COMMIT + '/'
    return '\n'.join([
        'import hashlib,os,urllib.request as u',
        f'd={code_dir!r}',
        'os.makedirs(d+"/models/bs_roformer",exist_ok=True)',
        'open(d+"/models/__init__.py","w").close();open(d+"/models/bs_roformer/__init__.py","w").close()',
        f'for f in {ZF_FILES!r}: u.urlretrieve({base!r}+f,d+"/"+f)',
        f'os.makedirs({ckpt_dir!r},exist_ok=True);p={ckpt_dir!r}+"/"+{CKPT!r};u.urlretrieve({CKPT_URL!r},p)',
        'h=hashlib.sha256()',
        'with open(p,"rb") as f:',
        ' for b in iter(lambda:f.read(1<<20),b""): h.update(b)',
        f'assert h.hexdigest()=={CKPT_SHA256!r},"bad download: "+p'])


def load(device, code_dir, ckpt_dir):
    import torch
    sys.path.insert(0, code_dir)
    import models.bs_roformer.attend as attend
    from models.bs_roformer.bs_roformer import BSRoformer
    # The pinned code's fast path calls sdpa_kernel(..., set_priority=True), which needs PyTorch 2.6;
    # this image stays on 2.5 for Demucs. Its other path (torch.backends.cuda.sdp_kernel) works on 2.5.
    attend._HAS_SDPA_KERNEL = False
    m = BSRoformer(**CFG)
    sd = torch.load(f'{ckpt_dir}/{CKPT}', map_location='cpu', weights_only=False)
    m.load_state_dict(sd.get('state_dict', sd) if isinstance(sd, dict) else sd)
    return m.to(device).eval()


def vocals(mix, sr, model, device, progress=None):
    """mix: (2, n) float32 torch tensor on device -> vocals (2, n) float32 tensor."""
    import torch
    from torch.nn import functional as F
    from torchaudio.functional import resample
    n = mix.shape[-1]
    x = resample(mix, sr, SR) if sr != SR else mix
    step, fade = CHUNK // OVERLAP, CHUNK // 10
    border = CHUNK - step
    L0 = x.shape[-1]
    padded = L0 > 2 * border
    if padded:
        x = F.pad(x[None], (border, border), mode='reflect')[0]
    L = x.shape[-1]
    win = torch.ones(CHUNK, device=device)
    win[:fade] = torch.linspace(0, 1, fade, device=device)
    win[-fade:] = torch.linspace(1, 0, fade, device=device)
    res = torch.zeros(2, L, device=device)
    cnt = torch.zeros(L, device=device)
    starts = list(range(0, L, step))
    use_amp = str(device).startswith('cuda')
    with torch.no_grad(), torch.autocast('cuda', enabled=use_amp):
        for b in range(0, len(starts), BATCH):
            parts, locs = [], []
            for s in starts[b:b + BATCH]:
                p = x[:, s:s + CHUNK]
                ln = p.shape[-1]
                p = F.pad(p[None], (0, CHUNK - ln), mode='reflect' if ln > CHUNK // 2 else 'constant')[0]
                parts.append(p)
                locs.append((s, ln))
            y = model(torch.stack(parts)).float()
            if y.ndim == 4:  # (batch, stems, channels, time)
                y = y[:, 0]
            for j, (s, ln) in enumerate(locs):
                w = win.clone()
                if s == 0:
                    w[:fade] = 1
                if s + step >= L:
                    w[-fade:] = 1
                res[:, s:s + ln] += y[j, :, :ln] * w[:ln]
                cnt[s:s + ln] += w[:ln]
            if progress:
                progress(min(b + BATCH, len(starts)), len(starts))
    v = torch.nan_to_num(res / cnt.clamp_min(1e-8))
    if padded:
        v = v[:, border:-border]
    if sr != SR:
        v = resample(v, SR, sr)
    v = v[:, :n]
    if v.shape[-1] < n:
        v = F.pad(v, (0, n - v.shape[-1]))
    return v
