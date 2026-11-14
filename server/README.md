# Separation server (optional)

GP Mastering normally separates stems in your browser. This folder lets it use a
server instead: the same three models (vocals, drums, bass) and the same maths,
run on a GPU. A song takes seconds instead of minutes. "Other" is still the mix
minus the stems, worked out in the browser.

| File | What it is |
| --- | --- |
| `sep_core.py` | The separation itself, a NumPy port of `sep-worker.js` (keep `MODELS` in step) |
| `demucs_core.py` | The optional Demucs model (htdemucs_ft) |
| `roformer_core.py` | The optional BS-RoFormer vocal model (viperx ep_317; code from ZFTurbo, pinned) |
| `torch_core.py` | Runs a job's Demucs and RoFormer stems in the PyTorch image (Modal only) |
| `api.py` | The web front: access token, CORS, start a job, poll for the result |
| `modal_app.py` | Deploys both to [Modal](https://modal.com) (Standard on a T4 GPU, Demucs and RoFormer on an L4) |
| `local.py` | Runs the same server on your own computer or a Linux server |
| `kit/` | Setup scripts and README for the **Server kit** the app zips up for users |

Users who are not working from this repository should use the app's
**⬇ Server kit** button instead (Stem balance → Separate on: My server). The page
zips `modal_app.py`, `sep_core.py`, `api.py` and `kit/*` in the browser, so the kit
always matches this folder. Without a `models` folder next to `modal_app.py`, Modal
downloads the models from the site at build time; both paths check the SHA-256
in `MODEL_SHA256`.

## Deploy on Modal

Modal's free Starter plan includes monthly credits; one song uses about a cent
of GPU time, including the start-up. Containers shut down two minutes after the last song, so an
idle server costs nothing. The first song after a break waits about 30–60 s for
a GPU to start.

You need a Modal account and its command-line tool (`pip install modal`, then
`modal setup`). Then, in the `gp-master` folder:

1. Make up a long random access token and store it on Modal as a secret. On
   macOS or Linux, this makes one and prints it so you can copy it into the app
   (any long random password works too):

   ```bash
   TOKEN=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))"); echo $TOKEN
   ```

   ```bash
   modal secret create gpm-sep GPM_TOKEN=$TOKEN
   ```

   On Windows, in PowerShell (no Python needed):

   ```powershell
   $TOKEN = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'); $TOKEN
   ```

   ```powershell
   modal secret create gpm-sep GPM_TOKEN=$TOKEN
   ```

2. Deploy (uploads the code and the 123 MB of models in `models/`):

   ```bash
   modal deploy server/modal_app.py
   ```

   To find the web address, open the deployment link it prints and click the
   `web` function. It looks like `https://<you>--gpm-sep-web.<region>.modal.run`.
   Opening it with `/health` on the end should show `{"ok":true,"version":1}`.

3. In GP Mastering, under **Stem balance**, set **Separate on** to **My server**,
   paste the address and the token, and press **Test**.

To change the token later, run `modal secret create gpm-sep GPM_TOKEN=<new> --force`
and deploy again. To stop it altogether, run `modal app stop gpm-sep`.

## Deploy automatically

`.github/workflows/modal-deploy.yml` redeploys the server whenever `server/` or
`models/` changes on `main`, and can also be run by hand from the repository's
**Actions** tab (**Deploy separation server to Modal → Run workflow**). It needs
a Modal API token stored as two repository secrets:

1. In Modal, go to **Settings → API Tokens → New Token** and copy the token
   ID (`ak-…`) and secret (`as-…`).
2. On GitHub, open the repository's **Settings → Secrets and variables →
   Actions → New repository secret**, and add `MODAL_TOKEN_ID` and
   `MODAL_TOKEN_SECRET`.

Until both are set, the workflow only shows a warning. The app's access token
stays in the Modal secret `gpm-sep`; GitHub never needs it.

## Run it yourself

```bash
pip install onnxruntime numpy soundfile "fastapi[standard]"
```

```bash
GPM_TOKEN=<token> python3 server/local.py 8790
```

Use `http://localhost:8790` as the address when the app runs on the same
computer. Anywhere else, put it behind HTTPS, because the token and your audio
travel with every request. Install `onnxruntime-gpu` instead to use an NVIDIA GPU.

## Privacy

The section you separate is uploaded to your server as 16-bit audio, and the
stems come back as FLAC. The server stores nothing else; Modal keeps a
finished job's result for a limited time so the page can fetch it. The token is sent only in the
`Authorization` header.
