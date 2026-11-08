# Changelog

All notable changes to GP Mastering, newest first. The version number is the small tag beside the app's title.
This file mirrors `changelog.html`, which is the version shown in the app; keep the two in step.

## v52 — Nov 8

### Added

- **Tempo markers** for songs whose timing changes partway, common in AI-generated songs at the joins between sections. Each marker starts a new section of the grid with a bar at that point and its own tempo; bar numbers run on. Edit, nudge a bar, play or remove each one. Click, bar lines, snapping, Arrangement, delays and the bar times given to Gemini all follow.
- **Find tempo changes** scans the song for places where the beat or the bar shifts and adds markers there. On a test song with an odd bar and a tempo change it found both; with one nudge on the odd bar every downbeat sat within 4 ms of a bar line.

## v51 — Nov 8

### Added

- **Click**: a metronome in the Listen player on the tempo grid, higher on beat 1, scheduled on the audio clock so it stays locked to the music through loops, Mastered and rearranged songs. The quickest way to check the grid by ear; the setting is remembered.

### Changed

- On wide screens the Listen card spans the full width above the two columns, with a waveform about 60% taller.

## v50 — Nov 8

### Added

- **Arrangement**: repeat, cut and move bars, and go back to the original. The file is never changed; the app plays an edit list of the original with 20 ms crossfades at each join, and regions, the beat grid, stems, the preview and the master all follow the new timeline. Every change is one undo step and is saved with the song.
- AI suggestions can repeat or cut bars. Waiting suggestions move to their new times when the arrangement changes, and suggestions pasted from Earprint are mapped from the original song onto the arrangement.

### Fixed

- Choosing the same file again did nothing; it now reloads it.

## v49 — Nov 8

### Added

- **Pitch shift** region effect: up or down by up to 12 semitones without changing the timing, on the whole mix or one stem, with a mix control for harmonies. Built as a phase-locked phase vocoder that time-stretches and then resamples on one time map; on test tones everything other than the shifted note stays more than 90 dB down.
- **Pitch riser**: the audio under the riser, from the mix or a stem, pitched up smoothly by 1 or 2 octaves with the timing kept, or one held moment frozen and rising.
- Gemini and Earprint can suggest pitch shifts and pitch risers.

## v48 — Nov 8

### Added

- **Risers** that build up to the end of a region: **noise** (filtered noise opening up), **synth** (a saw chord gliding up 1 to 3 octaves to the note you pick) and **tape** (a snippet of your own song or of one stem, looped faster and faster so it rises like tape speeding up; snippet lengths follow the beat grid).
- **Downlifters** that fall away from the start of a region: noise sweep, sub drop or both, with an optional impact hit.
- Gemini and Earprint can suggest risers and downlifters. Their level is relative to the song, and they are added before mastering so the limiter holds them.

## v47 — Nov 8

### Added

- **Effects in regions:** Filter sweep (low-pass or high-pass, from one frequency to another, with resonance), Reverb (four sizes, with a tail that rings on after the region: a reverb throw), Delay (timed to the tempo, with feedback, level and ping-pong) and Pan / width. Each works on the whole mix or on one stem.
- **Tempo and beat grid.** The tempo and bar start are detected when a song loads, bar and beat lines are drawn on the waveform, new regions snap to beats, and delays follow the tempo. ÷2, ×2 and Beat +1 fix the usual detection mistakes; the grid is saved with the song.
- AI suggestions can now use the effects, and Gemini gets the bar times so its edits land on bar lines. Accepted edits snap to the beat. Earprint’s Copy for GP Mastering carries the effects too.

## v46 — Nov 7

### Added

- **Separate once.** Stems are saved on this device after separating, with the song’s regions, stem levels and mutes. Loading the same file again, even after a refresh, restores them immediately instead of spending 15 to 30 minutes separating again. The 5 most recent songs are kept; **Forget saved stems** clears them.

## v45 — Nov 7

### Added

- **Stem edits.** Level, EQ and Tame regions can apply to one instrument (vocals, drums, bass or other) instead of the whole mix, set with **Applies to** in the region list. A stem level of −60 dB mutes that instrument for the region, so “drop the drums for four bars” now works.
- AI suggestions aimed at one instrument become stem edits. **They need the song separated into stems first** (Stem balance › Separate whole song, with Master the rebalanced mix on); until then the card, the region list, the waveform and the master’s notes all say they are waiting.

### Fixed

- The Remove button in region rows could be pushed outside the card at some widths.

## v44 — Nov 7

### Added

- **AI suggestions (Gemini).** Paste your own Gemini API key, optionally remembered on this device, say what you want, and Gemini listens to the song and suggests edits for exact time ranges, each with a reason. Review each one: Listen, Accept or Skip. Accepted edits become regions marked AI. Things the app cannot do come back as advice. Pressing Analyze uploads a compressed copy of the song to Google; nothing is sent otherwise.
- **EQ regions** in Volume automation: boost or cut one frequency inside a time range only, with bell, narrow, wide or shelf shapes.
- **Paste suggestions from another tool** in the same JSON format, without a key. The format is in the guide. Earprint’s **Copy for GP Mastering** button produces it, and a whole Earprint review can be pasted too.

### Changed

- The app is now called **GP Mastering**. Saved settings, setups and reference tracks carry over unchanged.

## v43 — Nov 6

### Added

- **Two columns on wide screens** (1080 px and up). The file, the Listen player and Volume automation sit on the left and stay in view; Stem balance, every setting, the Master buttons and the results scroll on the right. Phones and narrower windows keep the single column.

## v42 — Nov 6

### Added

- An **i** under each Tone EQ slider. Hover over it, or tap it on a phone, for a short note on what that band does and when to boost or cut it.
- The Tone EQ is now a **nine-band graphic EQ**: one slider per octave from 63 Hz to 16 kHz, ±15 dB each, with the combined EQ curve drawn behind the sliders. Saved five-band settings move to the nearest new bands.

### Changed

- The Preview buttons next to the settings now read **Apply to preview**, so it is clearer that they send your settings to the preview audio in the Listen card.

## v41 — Nov 6

### Added

- A five-band **Tone EQ** under the loudness target, with vertical sliders: 100 Hz shelf, 300 Hz, 1 kHz and 3 kHz bells, and an 8 kHz shelf, ±6 dB each, with Bypass and Reset. **You hear it while you move it**, in the waveform player, Play all stems, and on the master side of the A/B player.
- Once a result exists, changing the EQ shows **Apply EQ to the master**, which re-runs only loudness matching, the limiter and encoding, not the whole chain. The EQ sits before the limiter, so the target and true-peak ceiling still hold. Save waits until the EQ is applied, so the saved file matches what you heard.
- **Hear the master in the top player.** An **Original / Mastered** switch under the waveform. Mastered runs the real chain about five seconds at a time just ahead of the playhead, and the switch is instant because both play in step, with levels matched by default.
- **Preview** buttons next to every setting the preview can render. Change something, press Preview, and the top player continues from the same spot with the change, typically in under a second on a desktop.
- **Undo, Redo and Reset settings**, with Ctrl or Cmd + Z. Covers every setting, the Tone EQ, regions and stem levels; a slider drag is one step. Reset keeps your regions, stems and references and can be undone.
- **Loop** in the top player repeats the selected region, or the whole song. Later passes play from memory.

### Changed

- The player has its own **Listen** card at the top, separate from Volume automation, since it plays everything on the page. A small player stays pinned to the bottom of the screen once you scroll past it.

## v40 — Nov 2

### Fixed

- The note under the saved result said the file would be saved inside a .zip on the normal web page, where it is in fact saved directly as MP3, WAV or M4A. The zip note now appears only in the claude.ai preview view, whose save dialog needs it.

## v39 — Nov 2

### Added

- **Zoom the region strip**: + / − buttons, Fit, Zoom to region, a scroll slider, Ctrl or Cmd with the wheel to zoom at the pointer, and a time ruler. Down to about one second across, with fine detail rather than a stretched picture. The view follows the playhead during playback.
- **Type exact times.** Each region's start and end are editable (`1:23.5` or `83.5`), and an **Add by time** form creates a region without dragging, with Now buttons that copy the playhead. A ▶ on each region plays from its start. Bad entries get a plain message instead of being applied.

### Changed

- Dragging a region while zoomed selects in the zoomed view, so edges can be placed precisely.

## v38 — Nov 2

### Added

- DAW-style **M** (mute) and **S** (solo) buttons on every stem row, replacing the on/off tick box. Solo any stem or several and the others go quiet in **Play all stems**, live while it plays. Muted and unsoloed waveforms dim.

### Changed

- Mute still removes the stem from the mastered result, as the old switch did. Solo is for listening only and does not change the master.

## v37 — Nov 2

### Changed

- Errors are now plain language. Opening the page as a file says that browsers block separation there and what to do instead. A blocked runtime, a failed model download and running out of memory each get their own message, with the original text kept in brackets.

### Fixed

- Stem separation failed for a tester who opened the project from a folder or had the CDN blocked. The separation runtime (ONNX Runtime, MIT licence) is now **bundled in the project** (`ort/`) and used first, with the CDN only as a backup.

## v36 — Nov 2

### Added

- A **Workers** menu for stem separation: Auto, or 1 to 8 (never more than your core count), remembered on this device. First real-world result: a 3:52 song took 15 minutes with 4 workers against about 43 minutes before.

### Fixed

- The help page said each worker needs 100 to 200 MB. Measured, it is about **1 to 1.2 GB** each, so four workers is roughly 4 to 5 GB. The app now shows the estimate beside the menu.

## v35 — Nov 2

### Added

- This **Changelog** page, linked from the app and the help page.

## v34 — Nov 2

### Fixed

- Splitting stems failed with **“offset is out of bounds”** on hosts that compress the model files, including GitHub Pages. The model download no longer assumes its size in advance.

## v33 — Nov 2

### Added

- Each separated stem has its own **waveform**, scaled to the stem’s own peak with the peak level printed on it. Click it to jump to that point.
- A **⬇ WAV** button per stem saves a 24-bit stereo WAV named after your song (with `_section` if you separated only the 30-second section).
- Choose which of vocals, drums and bass to separate. Anything skipped stays in Other, and fewer stems finish sooner.

### Changed

- The standalone Stem Splitter is now part of **Stem balance**. The old `stems.html` address redirects there.

## v32 — Nov 2

### Added

- **Play buttons for stems.** A round ▶ on each row plays that stem alone, lifted toward a common loudness so quiet stems are audible. **Play all stems** mixes them at your slider levels and follows the sliders and on/off switches as you listen. A shared seek bar keeps your place when you switch.

### Changed

- The stem player, the waveform player and the A/B player now stop each other, so only one thing plays at a time.

## v31 — Nov 2

### Added

- **Parallel stem separation.** The song is split into independent chunks shared between up to four background workers, chosen from your core count with one core left for the page. Output is identical to the old sequential run, sample for sample. In tests, two workers took about half the time.

### Changed

- Models are downloaded once on the page and handed to each worker as needed.
- The countdown now estimates the **total time remaining** across all workers.

## v30 — Nov 2

### Changed

- The separation countdown’s cost ratio now comes from timing the real models in a browser (vocals about 3.2 times the work of drums or bass) instead of an earlier native measurement.

## v29 — Nov 2

### Added

- A **countdown** on stem separation and a progress bar weighted by how much work each stem is, so it no longer stalls on the slow vocal model.

## v28 — Nov 2

### Added

- **Distortion** in three types: Overdrive, Fuzz and Crush (bit and sample-rate reduction). It is a parallel layer, level-matched by measuring your song, adding about −26, −19 and −13 dB at Light, Medium and Heavy. Use it on the whole mix or per stem.

## v27 — Nov 1

### Added

- **Saturation** now has a setting and a character. Auto keeps the old gentle peak soft-clip; Light, Medium and Heavy add real harmonic saturation in Tape, Tube or Crunch, calibrated to about −36, −28 and −21 dB of added nonlinear content. Aliasing is controlled with anti-aliased waveshaping.

## v26 — Nov 1

### Added

- **Vocal doubler** for the separated vocal: two detuned, delayed copies, one leaning left and one right, at −14, −10 or −7 dB. It needs the vocal stem.

## v25 — Nov 1

### Added

- **Transient shaping** (Soften, Off, Punchy, Very punchy). Measured honestly: it lifts attacks by about 5.5 dB against 1.6 dB on steady material, but on already-limited audio the net change is small, and the help page says so.
- A **Play button on the waveform** with a moving playhead and click-to-seek, so you can hear where to place region boundaries.

## v24 — Nov 1

### Added

- **Noise reduction** (Light, Medium, Strong: up to 6, 12 or 20 dB) by spectral subtraction. Mark a quiet passage with a Noise profile region for the most reliable result.

## v23 — Nov 1

### Added

- **Volume automation by region.** Drag across the waveform to mark a part of the song and choose Level (±12 dB), Tame dynamics, or No tone processing. Region edges get short smooth ramps.

## v22 — Nov 1

### Added

- A **Help page** covering every control with its real values, plus a **?** hint on each control group and a Show all hints button (versions 20 to 22).

### Fixed

- A missing comma stopped the results panel from rendering at all, which meant the mono checks from v15 never appeared. Found the first time the page was run in a real browser.
- The preview note overwrote the mono warning instead of adding to it.
- Saving failed on GitHub Pages because it assumed the Claude app’s download dialog. A normal page now uses a plain download.
- The spectrum difference view let near-silent bands distort its scale; bands more than 40 dB below the loudest are now excluded and drawn faded.

## v19 — Nov 1

### Added

- **Named setups** that bundle reference measurements with every page setting, last-used settings restored on reload, and JSON import and export.

## v18 — Nov 1

### Added

- Reference measurements are kept in your browser between visits. Only the measurements (about 320 bytes each) are stored, never audio.

## v17 — Nov 1

### Added

- **Reference agreement check.** It names a reference that disagrees with the others and the band where they diverge, warning above 1.5 dB.

## v16 — Nov 1

### Added

- **Reference-track matching.** Up to five reference songs replace the built-in tone target, matching tone curve, stereo width and low-mid side energy. Only the analysis is kept.

## v15 — Nov 1

### Added

- **Processing amount** (Gentle, Standard, Strong), with Gentle as the default, scaling every automatic move.
- **Mono compatibility check** with a warning above 1.2 dB of loss, and a mono audition button in the A/B player.

## v14 — Nov 1

### Added

- Suggested stem levels, measured against typical ranges for the chosen genre, with one-click apply. The ranges are rules of thumb and are labelled that way.

## v13 — Nov 1

### Added

- **Stem balance inside the app:** split the song, rebalance with level and mute, optionally master each stem with its own EQ and compression, sum them, and master the result.

## v11 — Oct 31

Everything below was built earlier, inside the Claude app, before the move to GitHub.

### Added

- First release on GitHub Pages, together with the in-browser **stem splitter** (vocals, drums and bass models, other derived by subtraction).

## Before v11

Built in the Claude app.

### Added

- The first version loudness-matched a track to a target and exported WAV, M4A or MP3.
- A **full mastering chain**: tone correction, multiband compression, a true-peak look-ahead limiter, A/B preview, de-esser, genre presets and a dynamic EQ.
- **Clarity** to reduce low-mid muddiness, a **pumper**, **stereo width**, a **vocal enhancer**, and a before and after **spectrum view**. A gater was tried and removed.

## Still on the list

- Manual compression sliders. (Manual tone is covered by the Tone EQ, since v41.)
- Running the mastering itself in a background worker.
- FLAC and 48 kHz output.
