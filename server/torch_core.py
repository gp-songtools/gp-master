"""The PyTorch models on the server: Demucs (drums, bass, vocals) and BS-RoFormer (vocals).
One job runs every stem that asked for one of them, then returns them in the usual format."""
import time

from sep_core import decode_upload, encode_result


def run_torch(body, sr, n, plan, scale, get_model, device, progress=None):
    """plan: {stem: 'demucs' | 'roformer'}; get_model(name) loads a model once and keeps it."""
    import torch
    import demucs_core
    import roformer_core
    t0 = time.time()
    mix = torch.from_numpy(decode_upload(body, n, scale)).to(device)
    ro = [s for s, m in plan.items() if m == 'roformer']
    de = [s for s, m in plan.items() if m == 'demucs']
    steps = [x for x in (ro, de) if x]
    done = [0]

    def tick(d, t):  # each part counts for an equal share of the bar
        if progress and t:
            progress(round(100 * (done[0] + d / t) / len(steps)), 100)
    out = {}
    if ro:
        out['vocals'] = roformer_core.vocals(mix, sr, get_model('roformer'), device, tick)
        done[0] += 1
    if de:
        out.update(demucs_core.stems(mix, sr, de, get_model('demucs'), device, tick))
    gpu = str(device).startswith('cuda')
    return encode_result({s: out[s].float().cpu().numpy() for s in plan}, sr,
                         {'provider': 'CUDAExecutionProvider' if gpu else 'CPU', 'version': 3,
                          'secs': round(time.time() - t0, 2)}, models=plan)
