---
saved-at: 2026-11-20T06:43:02Z
saved-at-sha: ddf6adf
saved-at-branch: main
saved-from-cwd: /home/user/gp-master
---

- **Where things stand:** the optional GPU separation server is done and in use (v59–v67): Modal app `gpm-sep`, per-stem models (vocals Standard/RoFormer/Demucs; drums and bass Standard/Demucs; Other Standard/Demucs), the "Leftovers in Other" slider, the Server kit, and auto-deploy via `.github/workflows/modal-deploy.yml`. Nothing is pending. Wait for the owner's next request.
- **Read first:** the CLAUDE.md "Stem separation" and `server/` notes, then `server/README.md`. They describe the per-stem plan, `merge_results`, the model-mismatch check that detects outdated servers, Demucs Other with `orig.stems.raw`/`leftApply`, and the storage keys.
- **After any change under `server/`:** push to `main`, then check the "Deploy separation server to Modal" run in Actions (MCP `actions_list`). A push has once failed to trigger it; start it with `actions_run_trigger` on `modal-deploy.yml`. This sandbox has no GPU and no PyTorch, and modal.com is blocked. Test server logic with `server/local.py` (one at a time: it needs a lot of memory) or a fake server built on `api.build_api`, and leave the real model runs to the owner.
- **Decisions not to relitigate:** keep the Standard models on a T4 and the PyTorch models (RoFormer, Demucs) together on an L4, with GPU fallbacks; the owner tried an L4 for Standard and found it not worth it. torch stays at 2.5.1 (Demucs checkpoints), so RoFormer uses the `attend._HAS_SDPA_KERNEL = False` path. The owner declined 4-chunk RoFormer batches, the startup snapshot and Demucs shifts to keep costs low; offer them again only if asked. Build-time scripts must be single-line (`py_cmd`).
- **Owner's findings:** the best mix is usually RoFormer vocals, Demucs drums, Standard bass and Demucs Other. Some songs need Demucs vocals: RoFormer can miss a falsetto that Demucs Other then also leaves out, so it vanishes from the master. Offered but not built: Leftovers set per region, a solo that affects only the mastered preview, cancelling the server job when the page is left, and showing the GPU type in the finish message.
- **Open:** `server/kit/setup.ps1` (Windows) has never been run. If someone reports a problem with it, debug it from their output.
