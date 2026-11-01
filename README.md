# Loudness Master

A browser-based audio mastering tool. Everything runs locally in your browser —
no audio is uploaded anywhere, and there is no server, API key, or account.

## Use it

Open `index.html`, or visit the GitHub Pages URL for this repo.

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
- [ ] Reference-track matching — replace the heuristic tone target with
      measurements from songs you choose
- [ ] Manual tone/compression sliders
- [ ] Background (worker thread) processing
- [ ] 48 kHz and FLAC output

## Limitations

- **The tone target is a heuristic.** The target curve is a set of hand-chosen
  values, not a balance measured from reference recordings, and it takes no
  account of arrangement. The same applies to the suggested stem levels. Treat
  both as starting points. Reference matching is the planned fix.
- Automatic processing improves some material and worsens other material. Use
  Gentle, the 30-second preview, and the A/B player rather than trusting the
  output unheard.
- Check the mono fold before releasing anything. Stereo width above 1.0x
  amplifies the side signal, which cancels on mono playback.
- Source quality limits results; a low-bitrate MP3 cannot be restored.
- Processing is single-threaded and can be slow on phones.
- Not a replacement for fixing problems in the mix.
