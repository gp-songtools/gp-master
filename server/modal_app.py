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
import sys
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
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

def py_cmd(src):
    """A multi-line Python script as ONE shell line: Modal runs each build command as a single
    Dockerfile line, so newlines in `python -c` would cut the script short."""
    import base64
    return 'python -c "import base64;exec(base64.b64decode(\'%s\'))"' % base64.b64encode(src.encode()).decode()


gpu_image = modal.Image.debian_slim(python_version='3.12').pip_install(
    'onnxruntime-gpu[cuda,cudnn]==1.22.0', 'cupy-cuda12x[ctk]==14.2.0', 'numpy==2.2.6', 'soundfile==0.13.1')
if modal.is_local():
    _models = local_models()
    print('Models: ' + (f'uploading from {_models}' if _models else f'Modal downloads them from {MODELS_URL}'))
else:
    _models = None
if not _models:
    gpu_image = gpu_image.run_commands(py_cmd(FETCH))
gpu_image = gpu_image.add_local_file(HERE / 'sep_core.py', '/root/sep_core.py')
if _models:
    gpu_image = gpu_image.add_local_dir(_models, '/models')
# The PyTorch models (Demucs htdemucs_ft, MIT; BS-RoFormer vocals, see roformer_core.py) share an
# image: PyTorch brings its own CUDA libraries. torch stays below 2.6, whose torch.load defaults
# would refuse the Demucs checkpoints. Both models are downloaded and checked at image build.
if modal.is_local():  # only the deploy needs the download script; containers never build images
    import roformer_core
    _ro_fetch = roformer_core.fetch_script('/root/zf', '/torch-models')
else:
    _ro_fetch = 'pass'
torch_image = (
    modal.Image.debian_slim(python_version='3.12')
    .pip_install('torch==2.5.1', 'torchaudio==2.5.1', 'demucs==4.0.1', 'numpy==2.2.6', 'soundfile==0.13.1',
                 'rotary-embedding-torch==0.9.2', 'beartype==0.23.1', 'einops==0.8.2', 'packaging')
    .run_commands('python -c "from demucs.pretrained import get_model; get_model(\'htdemucs_ft\')"')
    .run_commands(py_cmd(_ro_fetch))
    .add_local_file(HERE / 'sep_core.py', '/root/sep_core.py')
    .add_local_file(HERE / 'demucs_core.py', '/root/demucs_core.py')
    .add_local_file(HERE / 'roformer_core.py', '/root/roformer_core.py')
    .add_local_file(HERE / 'torch_core.py', '/root/torch_core.py')
)
web_image = (
    modal.Image.debian_slim(python_version='3.12')
    .pip_install('fastapi[standard]==0.115.12', 'numpy==2.2.6', 'soundfile==0.13.1')
    .add_local_file(HERE / 'api.py', '/root/api.py')
    .add_local_file(HERE / 'sep_core.py', '/root/sep_core.py')
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
            progress[key] = (1, 1)  # finished; poll() removes it once the result is collected
        except Exception:
            pass
        return out


@app.cls(image=torch_image, gpu='T4', cpu=4.0, memory=16384, timeout=900, scaledown_window=120, max_containers=2)
class TorchSeparator:
    @modal.enter()
    def load(self):
        import torch
        self.dev = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.models = {}
        print('PyTorch models on', self.dev)

    def get_model(self, name):  # loaded on first use, then kept while the container lives
        if name not in self.models:
            if name == 'demucs':
                import demucs_core
                self.models[name] = demucs_core.load(self.dev)
            else:
                import roformer_core
                self.models[name] = roformer_core.load(self.dev, '/root/zf', '/torch-models')
        return self.models[name]

    @modal.method()
    def run(self, body: bytes, sr: int, n: int, plan: dict, scale: float, key: str) -> bytes:
        from torch_core import run_torch

        def tick(d, t):
            try:
                progress[key] = (d, t)
            except Exception:
                pass
        try:
            out = run_torch(body, sr, n, plan, scale, self.get_model, self.dev, tick)
        except Exception as e:
            print('PyTorch separation failed:', repr(e))
            raise RuntimeError(f'{type(e).__name__}: {e}'[:400]) from None
        finally:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        try:
            progress[key] = (1, 1)  # finished; poll() removes it once the result is collected
        except Exception:
            pass
        return out


@app.function(image=web_image, secrets=[secret], timeout=300)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    from api import Running, build_api, new_key
    from sep_core import merge_results

    async def start(body, sr, n, plan, scale):
        """Standard stems go to the ONNX GPU job, Demucs/RoFormer stems to the PyTorch one, in parallel."""
        ids = []
        mdx = [s for s, m in plan.items() if m == 'mdx']
        other = {s: m for s, m in plan.items() if m != 'mdx'}
        if mdx:
            key = new_key()
            call = await Separator().run.spawn.aio(body, sr, n, mdx, scale, key)
            ids.append(call.object_id + '.' + key)
        if other:
            key = new_key()
            call = await TorchSeparator().run.spawn.aio(body, sr, n, other, scale, key)
            ids.append(call.object_id + '.' + key)
        return '~'.join(ids)

    def poll(jid):
        outs, d, t, running = [], 0, 0, False
        for part in jid.split('~'):
            cid, _, key = part.partition('.')
            try:
                outs.append(modal.FunctionCall.from_id(cid).get(timeout=0))
                d, t = d + 100, t + 100
                try:
                    progress.pop(key)
                except Exception:
                    pass
            except (TimeoutError, modal.exception.TimeoutError):
                running = True
                pd, pt = progress.get(key, (0, 0))
                d, t = d + (100 * pd // pt if pt else 0), t + 100
        if running:
            raise Running(d, t)
        return outs[0] if len(outs) == 1 else merge_results(outs)

    offers = {'vocals': ['mdx', 'demucs', 'roformer'], 'drums': ['mdx', 'demucs'], 'bass': ['mdx', 'demucs']}
    return build_api(os.environ.get('GPM_TOKEN', ''), start, poll, offers)
