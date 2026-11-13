"""Run the separation server on this computer or your own Linux server (CPU or CUDA).
    pip install onnxruntime numpy soundfile "fastapi[standard]"
    GPM_TOKEN=<password> python3 server/local.py [port]
Then in GP Mastering choose Separate on: server, with http://<host>:<port> and the password.
Use HTTPS (for example behind a reverse proxy) for anything other than localhost."""
import os
import sys
import threading
from pathlib import Path

import onnxruntime as ort
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from api import Running, build_api, new_key  # noqa: E402
from sep_core import MODELS, run_job  # noqa: E402

MODELS_DIR = Path(__file__).resolve().parent.parent / 'models'
prov = [p for p in ('CUDAExecutionProvider', 'CPUExecutionProvider') if p in ort.get_available_providers()]
sess = {k: ort.InferenceSession(str(MODELS_DIR / M['file']), providers=prov) for k, M in MODELS.items()}
lock, jobs = threading.Lock(), {}


def worker(key, args):
    try:
        with lock:  # one song at a time
            jobs[key]['out'] = run_job(*args, sess, prov[0], lambda d, t: jobs[key].update(p=(d, t)))
    except Exception as e:
        jobs[key]['err'] = e


async def start(body, sr, n, stems, scale):
    key = new_key()
    jobs[key] = {'p': (0, 0)}
    threading.Thread(target=worker, args=(key, (body, sr, n, stems, scale)), daemon=True).start()
    return key


def poll(key):
    j = jobs[key]
    if 'err' in j:
        raise j.pop('err')
    if 'out' not in j:
        raise Running(*j['p'])
    return jobs.pop(key)['out']


if __name__ == '__main__':
    uvicorn.run(build_api(os.environ.get('GPM_TOKEN', ''), start, poll), host='0.0.0.0',
                port=int(sys.argv[1]) if len(sys.argv) > 1 else 8790, log_level='warning')
