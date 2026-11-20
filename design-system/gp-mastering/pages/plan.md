# Design plan (frontend-design pass) — applies to all three pages

Overrides MASTER.md where they differ.

## Subject, audience, job

- **Subject:** finishing a song: making it loud, balanced and ready to release, with stems split out when needed.
- **Audience:** home producers and songwriters (often AI-assisted songs), on a laptop or a phone, wearing headphones.
- **Primary job:** load a song, hear the master next to the original, adjust, save.

## First plan and what the review changed

| First plan | Why it read as generic | Revised |
| --- | --- | --- |
| Near-black `#0b0f12` page with one bright teal accent | Default trait: near-black plus one acid accent | Dark mode keeps teal (it is the brand) but sits on **anodized slate** `#141a21`, panels `#1b232c`, with a second, rare colour drawn from the subject: **VU amber** `#e9a83a`, used only for meter needles and the loudness target |
| Every block a rounded card, same radius and shadow | The SaaS card kit | Three kinds of surface by role: **transport** (Listen: sunk well, full width, no card chrome around the waveform), **cards** for steps, **groups** inside a card divided by hairlines, not more cards |
| Caps eyebrows over every heading, mono for every small label | Template chrome | No all-caps labels. Step numbers only where the content is a real sequence (Song → Listen → Stems → Sound → Master). Mono only for values that change while you watch (times, LUFS, dB) so digits do not jitter |
| A stat-tile row for results | Default "big number, small label" treatment | Results open with a **VU-style loudness scale**: a cream meter face in both themes, with the original, the master and the target marked on one scale. This is the single bold element |

## Tokens

### Colour (dark / light)

| Name | Dark | Light | Role |
| --- | --- | --- | --- |
| Slate (`--bg`) | `#141a21` | `#eceff2` | Page |
| Panel (`--card`) | `#1b232c` | `#ffffff` | Cards |
| Well (`--sunk`) | `#0f141a` | `#e3e8ed` | Waveform, lanes, wells |
| Ink (`--ink`) | `#eaf0f5` | `#101820` | Text, numbers |
| Teal (`--ac`) | `#45d3c1` | `#00766a` | Selected, playing, primary |
| VU amber (`--vu`) | `#e9a83a` | `#a86400` | Needles, loudness target only |
| Meter face (`--face`) | `#efe6cc` | `#f3ecd6` | VU scale background (both themes) |

### Type

- Instrument Sans: everything a person reads.
- JetBrains Mono, tabular: live values only (playhead time, LUFS, dB, BPM, region times, EQ gains).
- Scale (≈ 1.2 ratio from 16): 12 · 14 · 16 · 18 · 22 · 28. Card titles 18/600, setting labels 15/600, hints 14/400 at 1.5, max 70ch.

### Layout

Phone (single column, 16 px gutters):

```
GP Mastering v68                     [Guide]
[Show hints] [Changelog] [Credits] [Privacy]
① Song   [ drop zone / Try the demo song ]
② Listen [ waveform well            ]
         [▶ Play][Original|Mastered]  0:12 / 0:32
   Arrangement · Volume automation · AI suggestions (optional tools)
③ Stems
④ Sound  references / genre / loudness / EQ / character
⑤ Master format / mode / [Preview 30 s][Master full song]
   Results: VU scale, numbers, spectrum, A/B, Save
```

Desktop ≥1080 px:

```
┌ app bar ────────────────────────────────────────────────────────┐
├ ② Listen: full-width transport, 180 px waveform ─────────────────┤
├ left, sticky ───────────────┬ right, scrolls ───────────────────┤
│ ① Song                      │ ③ Stems                           │
│ Arrangement                 │ ④ Sound                           │
│ Volume automation           │ ⑤ Master                          │
│ AI suggestions              │ Results                           │
└─────────────────────────────┴───────────────────────────────────┘
```

Alignment: everything left-aligned; numbers right-aligned in lists; the transport row reads left to right in the order you use it.

## Principles

1. The waveform and the loudness meter are the only "loud" visuals. Everything else is quiet.
2. A number is never grey when it is the answer.
3. Grouping by hairline and spacing beats grouping by box.
4. Help text stays, but is shorter in line length and set at 14 px so it is read, not skipped.
5. The demo song makes every state visible without a file, and says it is a demo.
