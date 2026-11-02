# Loudness Master

A browser-based audio mastering tool. Everything runs locally in your browser —
no audio is uploaded anywhere, and there is no server, API key, or account.

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

**Volume automation** — play the song from the waveform to find the spot, then
drag across the waveform to select part of the song and
set a level change, extra dynamic taming, or no tone processing there. Level
rides the fader before the chain; region edges get 20 ms fades. Preview follows
the selected region.

**Transients** — brings percussive hits forward relative to sustained sounds,
or pushes them back, driven by the gap between a fast and a slow envelope
follower measured against its own running average.

**Noise reduction** — spectral subtraction against a measured noise floor,
learned from a marked quiet region or estimated from the quietest 5% of each
band. Runs before EQ and compression so noise is never amplified.

**Saved setups** — name a combination of reference measurements plus every
setting on the page, then reload it later. Export writes all setups to a JSON
file you can keep or move to another machine; import merges a file back,
renaming on collision rather than overwriting. The last-used settings are also
restored automatically on reload.

**Stem balance** — optionally split the song into vocals, drums, bass and other,
rebalance them, master each stem with its own EQ, compression and (for vocals)
de-essing, then recombine. The app measures each stem against the full mix and
suggests level moves for the chosen genre (rules of thumb, not reference-matched). The limiter always runs last on the summed mix, so
the balance you set is the balance you hear.

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

- [x] Stem separation in the browser — `stems.html` (see `docs/stem-separation.md`)
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

Nothing leaves the browser. Three keys in `localStorage`:

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


## Stem separation progress
Both pages share `eta.js`: a cost-weighted progress bar and a ticking countdown. Rates are measured per stem; stems that have not started are predicted from the most recently timed one using relative costs (vocals 64 : drums 20 : bass 20, measured in Chromium), so early estimates are approximate.
