"""GP Mastering stem separation on Modal (optional; the app separates in the browser by default).

Deploy from the gp-master folder (see server/README.md):
    modal secret create gpm-sep GPM_TOKEN=<a long random password>
    modal deploy server/modal_app.py

The web endpoint is a small CPU container. It starts a GPU job per song and the page polls
for the result, so a cold GPU start never runs into the web request time limit.

Wire format (all little-endian):
  POST /jobs?sr=44100&n=<frames>&stems=vocals,drums,bass&scale=<float>&model=mdx|demucs
       body: interleaved stereo int16; sample = round(x / scale * 32767)
       -> {"id": "<job id>"}
  GET  /jobs/<id>  -> 202 {"state": "running", "done": d, "total": t} while it runs
                   -> 200 binary: uint32 header length, JSON header ({"stems": [...], "model",
                      "provider", "secs"}), then one 16-bit stereo
                      FLAC per stem, in header order; float = decoded * scale * 32768 / 32767
  GET  /health     -> {"ok": true, "version": 2}
  GET  /check      -> the same plus "models": ["mdx", "demucs"], and checks the token
All except /health need "Authorization: Bearer <GPM_TOKEN>"."""
import os
import shlex
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
app = modal.App('gpm-sep')
secret = modal.Secret.from_name('gpm-sep')
progress = modal.Dict.from_name('gpm-sep-progress', create_if_missing=True)

# The three model files (see sep_core.MODELS) and their SHA-256. A local `models` folder is used
# when it holds all three (the repository has one; the server kit can be given one); otherwise
# Modal downloads them from the GP Mastering site while it builds the image. Either way the
# hashes are checked, so a wrong or damaged file stops the deploy instead of giving bad stems.
MODELS_URL = 'https://gp-songtools.github.io/gp-master/models/'
MODEL_SHA256 = {
    'Kim_Vocal_2.onnx': 'ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b',
    'kuielab_a_drums.onnx': '40f586b7091934dd6f5563f0cba8f14bad57ce88440da1098bf388ea716c2901',
    'kuielab_a_bass.onnx': '0c3e77b9963185b1ea6bb46a4b8924137d9370fc1ccdefec7b1b416ef550dcaa',
}


def local_models():
    """The local models folder if it holds all three files, else None; a wrong file is an error."""
    import hashlib
    for d in (HERE / 'models', HERE.parent / 'models'):
        if not all((d / f).is_file() for f in MODEL_SHA256):
            continue
        for f, h in MODEL_SHA256.items():
            if hashlib.sha256((d / f).read_bytes()).hexdigest() != h:
                raise SystemExit(f'{d / f} is not the expected model file. Download it again, or delete '
                                 f'the models folder to let Modal fetch the models itself.')
        return d
    return None


FETCH = ('import hashlib,os,urllib.request as u;os.makedirs("/models",exist_ok=True)\n'
         'for f,h in %r.items():\n'
         ' p="/models/"+f;u.urlretrieve(%r+f,p)\n'
         ' assert hashlib.sha256(open(p,"rb").read()).hexdigest()==h,"bad download: "+f' % (MODEL_SHA256, MODELS_URL))

gpu_image = modal.Image.debian_slim(python_version='3.12').pip_install(
    'onnxruntime-gpu[cuda,cudnn]==1.22.0', 'cupy-cuda12x[ctk]==14.2.0', 'numpy==2.2.6', 'soundfile==0.13.1')
if modal.is_local():
    _models = local_models()
    print('Models: ' + (f'uploading from {_models}' if _models else f'Modal downloads them from {MODELS_URL}'))
else:
    _models = None
if not _models:
    gpu_image = gpu_image.run_commands('python -c ' + shlex.quote(FETCH))
gpu_image = gpu_image.add_local_file(HERE / 'sep_core.py', '/root/sep_core.py')
if _models:
    gpu_image = gpu_image.add_local_dir(_models, '/models')
# Demucs (htdemucs_ft, MIT licence) runs in its own image: PyTorch brings its own CUDA libraries.
# torch stays below 2.6, whose torch.load defaults would refuse the Demucs checkpoints.
demucs_image = (
    modal.Image.debian_slim(python_version='3.12')
    .pip_install('torch==2.5.1', 'torchaudio==2.5.1', 'demucs==4.0.1', 'numpy==2.2.6', 'soundfile==0.13.1')
    .run_commands('python -c "from demucs.pretrained import get_model; get_model(\'htdemucs_ft\')"')
    .add_local_file(HERE / 'sep_core.py', '/root/sep_core.py')
    .add_local_file(HERE / 'demucs_core.py', '/root/demucs_core.py')
)
web_image = (
    modal.Image.debian_slim(python_version='3.12')
    .pip_install('fastapi[standard]==0.115.12', 'numpy==2.2.6')
    .add_local_file(HERE / 'api.py', '/root/api.py')
)

@app.cls(image=gpu_image, gpu='T4', cpu=4.0, memory=8192, timeout=900, scaledown_window=120, max_containers=2)
class Separator:
    @modal.enter()
    def load(self):
        import onnxruntime as ort
        from sep_core import MODELS
        try:
            ort.preload_dlls()
        except Exception as e:  # falls back to the CPU below
            print('preload_dlls failed:', e)
        # The three models share one GPU: grow each memory pool only by what is asked for,
        # and give it back after every run, so no model starves the others.
        prov = [('CUDAExecutionProvider', {'arena_extend_strategy': 'kSameAsRequested'}), 'CPUExecutionProvider']
        self.sess = {k: ort.InferenceSession(f"/models/{M['file']}", providers=prov) for k, M in MODELS.items()}
        self.provider = self.sess['vocals'].get_providers()[0]
        self.ro = ort.RunOptions()
        if self.provider == 'CUDAExecutionProvider':
            self.ro.add_run_config_entry('memory.enable_memory_arena_shrinkage', 'gpu:0')
        # The spectrum maths (STFT and its inverse) runs on the GPU with CuPy when it can.
        self.xp = None
        try:
            import cupy as cp
            cp.fft.irfft(cp.fft.rfft(cp.ones(7680))).get()  # proves cuFFT and the kernels load
            self.xp = cp
        except Exception as e:
            print('CuPy unavailable, spectrum maths on the CPU:', repr(e))
        print('models on', self.provider, '- spectrum maths on', 'GPU' if self.xp else 'CPU')

    @modal.method()
    def run(self, body: bytes, sr: int, n: int, stems: list, scale: float, key: str) -> bytes:
        from sep_core import run_job

        def tick(d, t):
            try:
                progress[key] = (d, t)
            except Exception:
                pass
        try:
            try:
                out = run_job(body, sr, n, stems, scale, self.sess, self.provider, tick, batch=2, run_options=self.ro,
                              **({'xp': self.xp} if self.xp else {}))
            except Exception as e:
                if not self.xp:
                    raise
                # GPU spectrum maths failed: say so in the log, and redo this song with NumPy
                print('CuPy failed, retrying on the CPU:', repr(e))
                self.xp.get_default_memory_pool().free_all_blocks()
                self.xp = None
                out = run_job(body, sr, n, stems, scale, self.sess, self.provider, tick, batch=2, run_options=self.ro)
        except Exception as e:
            # a plain RuntimeError so the web container can read it without numpy or onnxruntime
            print('separation failed:', repr(e))
            raise RuntimeError(f'{type(e).__name__}: {e}'[:400]) from None
        finally:
            if self.xp:
                self.xp.get_default_memory_pool().free_all_blocks()  # leave the GPU to the models
        try:
            progress.pop(key)
        except Exception:
            pass
        return out


@app.cls(image=demucs_image, gpu='T4', cpu=4.0, memory=16384, timeout=900, scaledown_window=120, max_containers=2)
class DemucsSeparator:
    @modal.enter()
    def load(self):
        import torch
        from demucs_core import load
        self.dev = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model = load(self.dev)
        print('Demucs on', self.dev)

    @modal.method()
    def run(self, body: bytes, sr: int, n: int, stems: list, scale: float, key: str) -> bytes:
        from demucs_core import run_demucs

        def tick(d, t):
            try:
                progress[key] = (d, t)
            except Exception:
                pass
        try:
            out = run_demucs(body, sr, n, stems, scale, self.model, self.dev, tick)
        except Exception as e:
            print('Demucs failed:', repr(e))
            raise RuntimeError(f'{type(e).__name__}: {e}'[:400]) from None
        finally:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        try:
            progress.pop(key)
        except Exception:
            pass
        return out


@app.function(image=web_image, secrets=[secret], timeout=300)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    from api import Running, build_api, new_key

    async def start(body, sr, n, stems, scale, model):
        key = new_key()
        worker = DemucsSeparator() if model == 'demucs' else Separator()
        call = await worker.run.spawn.aio(body, sr, n, stems, scale, key)
        return call.object_id + '.' + key

    def poll(jid):
        cid, _, key = jid.partition('.')
        try:
            return modal.FunctionCall.from_id(cid).get(timeout=0)
        except (TimeoutError, modal.exception.TimeoutError):
            raise Running(*progress.get(key, (0, 0)))

    return build_api(os.environ.get('GPM_TOKEN', ''), start, poll, models=('mdx', 'demucs'))
