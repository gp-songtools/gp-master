# GP Mastering

A browser-based audio mastering tool. Everything runs locally in your browser —
no audio is uploaded, and there is no server or account. The one exception is
the optional AI suggestions, which send a compressed copy of the song to
Google's Gemini with your own API key, only when you press Analyze.

## Use it

Open `index.html`, or visit the GitHub Pages URL for this repo.

`help.html` documents every control with its actual parameter values, how to
tweak it, and how to tell when it is working against you. Every control on the
main page also has a `?` button with a summary, and "Show all hints" expands
them all at once.

Load an audio file, choose a loudness target and output format, then preview or
master the whole song.

## What it does

**Processing modes**

- **Full master** — analyzes the track and corrects it: static tone correction
  toward a genre-aware target curve, dynamic EQ on four problem bands, Clarity
  (low-mid cleanup), stereo width, vocal enhancer, multiband compression,
  pumper, saturation, de-esser, and a true-peak limiter.
- **Light polish** — fixed EQ plus gentle glue compression.
- **Loudness only** — no tone changes, just level matching and limiting.

**Reference tracks** — load up to five songs whose balance you like. The app
measures their octave-band tone curve, stereo width and low-mid side energy,
averages them, and aims for those measurements instead of the built-in target.
Only the measurements are kept; the reference audio is analyzed and discarded.
Those measurements persist in browser storage (about 300 bytes per reference),
so references survive a reload. Storage is per-browser and per-device: it does
not sync between machines and is lost if site data is cleared.
The averaged reference curve is drawn as a dashed line on the spectrum view,
with each individual reference as a fainter line so outliers are visible.

The app also checks whether the references agree with each other, since
averaging references that disagree produces a target matching none of them. It
reports each reference's distance from their average, names the outlier, and
says which frequency range they disagree on most. Calibrated on real material:
two different but sanely mastered songs land near 0.9 dB apart, a reference
with a 9 dB tilt error lands above 2.4 dB, and the warning threshold sits at
1.5 dB.

**Arrangement** — repeat, cut or move bars on the beat grid. The file is never
changed: the app plays an edit list of the original with short crossfades, and
regions, stems, the preview and the master follow the new timeline.

**Volume automation** — play the song from the waveform to find the spot, then
drag across the waveform to select part of the song and
set a level change, EQ, extra dynamic taming, no tone processing, or an effect
there: filter sweep, reverb or delay (with tails that ring on after the region,
delays timed to the tempo) pan / width and pitch shift (timing kept), on the whole mix or one stem; or
add sound: noise, synth, tape (your own audio sped up) or pitch risers (your own
audio pitched up) and noise or
sub-drop downlifters with an optional impact. The
tempo and bar start are detected on load and drawn as a beat grid; new regions
snap to beats; tempo markers (added by hand or by Find tempo changes) handle
songs whose timing shifts partway, as AI-generated songs often do, and
Follow the beat tracks every beat for songs whose tempo wanders. Level rides the fader before the chain; region edges get 20 ms
fades. Preview follows the selected region.

**Transients** — brings percussive hits forward relative to sustained sounds,
or pushes them back, driven by the gap between a fast and a slow envelope
follower measured against its own running average.

**Noise reduction** — spectral subtraction against a measured noise floor,
learned from a marked quiet region or estimated from the quietest 5% of each
band. Runs before EQ and compression so noise is never amplified.

**AI suggestions (optional)** — paste a Gemini API key (optionally remembered
on this device), say what you want, and Gemini suggests level, EQ, taming or
no-processing edits for exact time ranges, each with a reason. Every edit is
reviewed before it becomes a region; things the app cannot do come back as
advice. Level, EQ and taming edits can target one stem (vocals, drums, bass,
other) instead of the whole mix; stem edits need the song separated into stems
under Stem balance first, and wait until then. Suggestions from other tools can be pasted in the same JSON format
(documented in `help.html`).

**Tone EQ** — a nine-band graphic EQ, one slider per octave from 63 Hz to
16 kHz, ±15 dB each, with the combined curve drawn behind the sliders, heard live as you move them in every player. In a render it runs after the
mastering chain but before loudness matching and the limiter. After a render,
"Apply EQ" re-runs only that final stage, so you don't need to master again.

**Top player preview** — the player under the waveform switches between the
original and a mastered preview, rendered with the real chain about five
seconds at a time ahead of the playhead. Click (a metronome on the beat grid) checks the tempo by ear; on wide screens
the player spans the full width above the settings. "Apply to preview" buttons next to each setting
apply a change from the current spot; Loop repeats the selected region.
Undo / Redo (Ctrl or Cmd + Z) cover settings, EQ, regions and stem levels, and
Reset settings returns to the defaults. On wide screens the page splits into two
columns with the player kept in view on the left; on narrow screens a small
player stays pinned to the bottom of the screen while you scroll the settings.

**Saved setups** — name a combination of reference measurements plus every
setting on the page, then reload it later. Export writes all setups to a JSON
file you can keep or move to another machine; import merges a file back,
renaming on collision rather than overwriting. The last-used settings are also
restored automatically on reload.

**Stem balance** — optionally split the song into vocals, drums, bass and other
(separate once: the stems, regions and stem levels are saved on this device and
restored when the same file is loaded again),
rebalance them, master each stem with its own EQ, compression and (for vocals)
de-essing, then recombine. The app measures each stem against the full mix and
suggests level moves for the chosen genre (rules of thumb, not reference-matched). The limiter always runs last on the summed mix, so
the balance you set is the balance you hear. Separation runs in the browser, or
on your own server with **Separate on: My server** (for example a free Modal GPU;
the section is uploaded there). **⬇ Server kit** in the app downloads a zip that sets one up; a server
can run Demucs (Meta's htdemucs_ft) or, for vocals, BS-RoFormer instead of the browser's models, chosen per stem;
developers can deploy from [`server/README.md`](server/README.md).

**Controls**

| Control | Options |
| --- | --- |
| Genre preset | Auto, Rock, Pop, Hip-hop, Electronic, Acoustic, Voice |
| Processing amount | Gentle (default), Standard, Strong |
| Target loudness | -24 to -6 LUFS |
| Clarity | Auto, Off, Light, Medium, Strong |
| Stereo width | Auto, Narrow, Normal, Wide, Extra wide |
| Vocal enhancer | Off, Light, Medium, Strong |
| Pumper | Off, Light, Medium, Heavy |
| Output | WAV (24-bit), MP3 (320 kbps), M4A (AAC 256 kbps) |

**Feedback**

- Level-matched A/B player to compare original against master, with a mono
  audition button.
- Mono-fold measurement: reports how much level is lost when the master is
  summed to mono, and warns when stereo processing would thin out elements on a
  phone speaker or other mono output.
- Before/after spectrum view, with a difference mode.
- A results panel reporting every move the processing made.

## How it works

Loudness is measured per ITU-R BS.1770 (K-weighting, gated integration). The
limiter detects inter-sample peaks with 4x sinc oversampling and uses a
program-dependent release. Output ceilings are -1.0 dBTP for WAV and -1.5 dBTP
for the lossy formats, leaving headroom for encoder overshoot.

## Roadmap

- [x] Stem separation in the browser, built into the Stem balance section: waveform, playback and WAV download per stem (see `docs/stem-separation.md`). `stems.html` is now a redirect.
- [x] Stem balance and per-stem mastering inside the main app
- [x] Reference-track matching — measured targets instead of the heuristic curve
- [x] Region-based volume automation
- [x] Noise reduction (spectral subtraction, noise profile from a region)
- [x] Transient shaping (attack/sustain envelope)
- [ ] Manual tone/compression sliders
- [x] Help page and per-control hints
- [ ] Background (worker thread) processing
- [ ] 48 kHz and FLAC output

## Stored data

Audio never leaves the browser, except the compressed copy sent to Gemini when you press Analyze. Pages load Cloudflare Web Analytics, shared by all GP Song Tools, for anonymous visit counts (no cookies; it never sees audio, settings or keys); see [Privacy & credits](https://gp-songtools.github.io/toolsmenu/privacy.html). Three keys in `localStorage`:

| Key | Holds |
| --- | --- |
| `gpmaster.refs.v1` | the currently loaded reference measurements |
| `gpmaster.cfg.v1` | last-used settings |
| `gpmaster.setups.v1` | named setups |

Reference entries store only analysis results — octave-band curve, spectrum,
stereo width, low-mid side energy, loudness — never audio. Stored and imported
data is validated and silently dropped if malformed, so an old or corrupt entry
cannot produce a wrong target. Use Export for anything you want to keep, since
browser storage is per-device and is lost when site data is cleared.

## Limitations

- **Without references, the tone target is a heuristic.** The built-in curve is
  a set of hand-chosen values, not a balance measured from recordings, and it
  takes no account of arrangement. Load reference tracks to replace it with
  measurements. The suggested stem levels are still heuristics either way.
- Reference matching copies tone and width, not arrangement, performance or
  mix decisions. A reference whose instrumentation differs from yours will pull
  the tone somewhere unhelpful.
- Automatic processing improves some material and worsens other material. Use
  Gentle, the 30-second preview, and the A/B player rather than trusting the
  output unheard.
- Check the mono fold before releasing anything. Stereo width above 1.0x
  amplifies the side signal, which cancels on mono playback.
- Source quality limits results; a low-bitrate MP3 cannot be restored.
- Processing is single-threaded and can be slow on phones.
- Not a replacement for fixing problems in the mix.


## Running locally
Stem separation needs the page to be served over http, not opened as a file (browsers block workers on file://). From the project folder run `python3 -m http.server` and open http://localhost:8000. The ONNX Runtime files it needs are bundled in `ort/` (onnxruntime-web 1.20.1, MIT); the jsDelivr CDN is only a fallback.

## Stem separation speed and progress
Separation runs in parallel. `sep-pool.js` cuts the song into independent chunks and a pool of up to four workers by default (one per core, leaving one free; choosable from 1 to 8; roughly 1 to 1.2 GB of memory each, measured) takes them from a shared queue, slowest model first. Each worker is single-threaded WebAssembly, so no special server headers are needed. The page downloads each model once and copies it to a worker only when that worker needs it. Output is identical to the old sequential worker, sample for sample. `eta.js` turns finished-chunk timings into a cost-weighted bar and a countdown of total time remaining.

## Credits
- **Stem separation models:** `Kim_Vocal_2` by [Kimberley Jensen](https://github.com/KimberleyJensen); `kuielab_a_drums` and `kuielab_a_bass` from [KUIELab-MDX-Net](https://github.com/kuielab/mdx-net) by KUIELab, trained on the MUSDB18-HQ research dataset. Distributed by [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) (Anjok07 and aufr33). The model files carry no licence of their own; GP Mastering uses them with credit, free of charge, and never in anything paid.
- **Libraries:** [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.20.1 (MIT, bundled in `ort/`), [lamejs](https://github.com/zhuker/lamejs) 1.2.1 (LGPL-3.0, from cdnjs), [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.1.3 (MIT, from jsDelivr).
- **Font:** [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans) (SIL Open Font License) via Google Fonts.

The full list is in the help page under "Credits and licences".

## Changelog
See `changelog.html` (linked from the app) for what changed in each version.
