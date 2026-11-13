# Separation server (optional)

GP Mastering normally separates stems in your browser. This folder lets it use a
server instead: the same three models (vocals, drums, bass) and the same maths,
run on a GPU. A song takes seconds instead of minutes. "Other" is still the mix
minus the stems, worked out in the browser.

| File | What it is |
| --- | --- |
| `sep_core.py` | The separation itself, a NumPy port of `sep-worker.js` (keep `MODELS` in step) |
| `api.py` | The web front: access token, CORS, start a job, poll for the result |
| `modal_app.py` | Deploys both to [Modal](https://modal.com) (GPU T4) |
| `local.py` | Runs the same server on your own computer or a Linux server |

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

   The output lists the web address, ending in `-web.modal.run`.

3. In GP Mastering, under **Stem balance**, set **Separate on** to **My server**,
   paste the address and the token, and press **Test**.

To change the token later, run `modal secret create gpm-sep GPM_TOKEN=<new> --force`
and deploy again. To stop it altogether, run `modal app stop gpm-sep`.

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
