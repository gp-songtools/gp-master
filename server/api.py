"""The web front of the separation server: auth, CORS, job start and polling.
modal_app.py plugs in Modal's job runner; the same code can be run locally for testing."""
import hmac
import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

VERSION = 3
STEMS = ('vocals', 'drums', 'bass', 'other')  # 'other' only from models that make it (Demucs)


class Running(Exception):
    def __init__(self, done=0, total=0, waiting=0):
        self.done, self.total, self.waiting = done, total, waiting


MDX_ONLY = {s: ['mdx'] for s in ('vocals', 'drums', 'bass')}  # Standard 'other' is the mix minus stems, made by the page


def build_api(token, start, poll, offers=MDX_ONLY):
    """start(body, sr, n, plan, scale) -> job id (awaitable), plan = {stem: model};
    poll(id) -> bytes, or raises Running.
    offers: {stem: [models]} this server can run ('mdx' = the browser's models, 'demucs', 'roformer')."""
    every = sorted({m for v in offers.values() for m in v})
    api = FastAPI()
    api.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['GET', 'POST'],
                       allow_headers=['Authorization', 'Content-Type'], max_age=86400)

    def auth(req: Request):
        got = req.headers.get('authorization', '')
        if not token or not hmac.compare_digest(got.encode(), ('Bearer ' + token).encode()):
            raise HTTPException(401, 'Wrong or missing access token')

    @api.get('/health')
    def health():
        return {'ok': True, 'version': VERSION}

    @api.get('/check')
    def check(req: Request):
        auth(req)
        return {'ok': True, 'version': VERSION, 'models': every, 'stem_models': offers}

    @api.post('/jobs')
    async def jobs(req: Request, sr: int, n: int, stems: str, scale: float = 1.0, model: str = 'mdx', models: str = ''):
        auth(req)
        st = [s for s in stems.split(',') if s in STEMS]
        per = dict(x.split(':', 1) for x in models.split(',') if ':' in x)
        plan = {s: per.get(s, model) for s in st}
        for s, m in plan.items():
            if m not in offers.get(s, ()):
                raise HTTPException(400, f'This server cannot separate {s} with {m}; choose another model for it.')
        if not st or n <= 0 or not 8000 <= sr <= 192000 or not 0 < scale < 100:
            raise HTTPException(400, 'Bad request')
        body = await req.body()
        if len(body) < 4 * n:
            raise HTTPException(400, 'The audio upload was cut short')
        return {'id': await start(body, sr, n, plan, scale)}

    @api.get('/jobs/{jid}')
    def job(jid: str, req: Request):
        auth(req)
        try:
            out = poll(jid)
        except Running as r:
            return JSONResponse({'state': 'running', 'done': r.done, 'total': r.total, 'waiting': r.waiting}, status_code=202)
        except KeyError:
            raise HTTPException(404, 'No such job')
        except Exception as e:
            m = ' '.join(str(e).split())
            m = m if len(m) <= 400 else m[:200] + ' … ' + m[-200:]
            raise HTTPException(500, 'Separation failed on the server: ' + type(e).__name__ + (': ' + m if m else ''))
        return Response(out, media_type='application/octet-stream')

    return api


def new_key():
    return os.urandom(12).hex()
