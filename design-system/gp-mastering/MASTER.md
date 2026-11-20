# GP Mastering design system (MASTER)

The source of truth for how GP Mastering looks: `index.html`, `help.html` and
`changelog.html`. Page files in `pages/` override this one where they disagree.

Generated with the ui-ux-pro-max skill
(`search.py "audio mastering music production tool dark studio" --design-system --density 8 --variance 4 --motion 3`),
then fitted to this product. Two of the skill's picks were wrong for a precision tool and were replaced:

| Skill suggestion | Used instead | Why |
| --- | --- | --- |
| Pattern "Feature-Rich Showcase" (landing page) | Tool workspace: numbered work steps in cards | The app is a workbench, not a marketing page |
| Righteous / Poppins | Instrument Sans + JetBrains Mono | Display fonts hurt dense controls. A mono face keeps numbers aligned and readable |
| Indigo surfaces, green CTA | Graphite surfaces, teal signal accent | Keeps the brand's existing teal, and green would clash with the meters |
| GSAP scroll reveal | None, only 120–180 ms state transitions | No dependencies are allowed, and motion would distract while listening |

Kept from the skill: dark-first "studio" style (Dark Mode OLED), dense dashboard spacing,
4.5:1 text contrast, visible focus, reduced motion respected, "avoid cluttered layout and
poor audio player UX".

## 1. Principles

1. **Ears first.** The player, waveform and A/B switch are always the most prominent things on screen. Settings support them.
2. **Numbers are instruments.** Every reading (LUFS, dB, time, BPM, Hz) is set in the mono face with tabular figures, at 13 px or larger, at full ink contrast.
3. **One accent means "active".** Teal marks the selected option, the playing state, the primary action and the master signal. It is never decoration.
4. **Steps, not a wall.** The page reads as a sequence: Load → Listen & edit → Stems → Sound → Master & compare. Each card carries its step number.
5. **Quiet chrome.** Borders and surfaces separate; shadows are barely there. Content, not containers, carries the contrast.

## 2. Color tokens

Existing variable names are kept because the canvas drawing code reads them
(`--ac`, `--ink`, `--mut`, `--ln`, `--card`, `--warn`). Never use raw hex outside `:root`.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--bg` | Page background (slate) | `#eceff2` | `#141a21` |
| `--card` | Card / panel surface | `#ffffff` | `#1b232c` |
| `--raise` | Help bubbles, table heads, chips track | `#f3f5f7` | `#222b35` |
| `--sunk` | Wells: waveform, EQ, stem lanes, spectrum | `#e3e8ed` | `#0f141a` |
| `--ln` | Hairline borders, grid lines | `#d6dde3` | `#2c3742` |
| `--ln2` | Control borders (≥ 3:1 against card) | `#7a8793` | `#66788a` |
| `--ink` | Primary text and numbers | `#101820` | `#eaf0f5` |
| `--mut` | Secondary text | `#4b5864` | `#a3b1bd` |
| `--ac` | Teal signal: selected, playing, primary | `#00766a` | `#45d3c1` |
| `--acf` | Text on accent | `#ffffff` | `#04221e` |
| `--acw` | Accent wash for selected rows | `color-mix(--ac 11%)` | same |
| `--warn` | Errors, delete | `#b3261e` | `#ff8a7a` |
| `--vu` | VU amber: playheads, loudness target | `#a86400` | `#e9a83a` |
| `--mute` / `--solo` | Stem mute / solo on | `#c0392b` / `#c98a00` | `#ff6b5e` / `#f2b84b` |
| `--face`, `--faceink`, `--facemut` | VU meter face (same in both themes) | `#f3ecd6`, `#2b2418`, `#6b5d44` | `#efe6cc`, same inks |

Measured contrast (WCAG): `--ink`/`--card` 17.9:1 light, 13.8:1 dark; `--mut`/`--card` 7.3:1 / 7.2:1;
`--mut`/`--bg` 6.3:1 / 8.0:1; `--mut`/`--sunk` 5.9:1 / 8.4:1; `--ac`/`--card` 5.5:1 / 8.6:1; `--acf`/`--ac` 5.5:1 / 9.1:1;
`--warn`/`--card` 6.5:1 / 6.9:1; `--ln2`/`--card` 3.7:1 / 3.5:1 (non-text); meter ink on face 12.3:1, meter labels 5.1:1.
Every page sets `color-scheme` so native controls (selects, scrollbars, checkboxes) follow the theme.

Dark mode: `@media(prefers-color-scheme:dark){:root:not([data-theme="light"])…}` plus
`:root[data-theme="dark"]`, same values, as already used by all three pages.

## 3. Typography

| Family | Use | Weights |
| --- | --- | --- |
| Instrument Sans (`--sans`) | All UI and prose | 400, 500, 600, 700 |
| JetBrains Mono (`--mono`) | Readouts, times, values, code | 500, 600 |

Both come from the one Google Fonts request the page already makes (`display=swap`),
with system fallbacks. No other font sources.

| Step | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 28 / 1.1, -0.02em | 700 | App name |
| `h2` | 18 / 1.25, -0.01em | 650 | Card titles |
| `title` | 15 / 1.3 | 600 | Setting labels (`.lbl`) |
| `body` | 16 / 1.5 | 400 | Prose, inputs |
| `ui` | 14 / 1.4 | 500–600 | Buttons, chips, lists |
| `hint` | 14 / 1.5 | 400 | Help text under controls (`.hint`) |
| `readout-xl` | 26 / 1 mono | 600 | Target loudness |
| `readout` | 14 / 1.3 mono | 500 | Times, dB values, list numbers |
| `step` | 13 mono in a 24 px accent disc | 600 | Step numbers on card titles (only real sequence steps) |
| `tick` | 12 / 1 mono | 500 | Axis ticks only |

Floor: nothing below 12 px; prose and hints never below 14 px; numbers never below 12 px and
never in `--mut` when they are the value the user is reading.

## 4. Spacing, shape, elevation

- Spacing scale (4-pt, dense): `4 8 12 16 20 24 32 40`. Card padding 20 (16 under 480 px). Gap between setting groups 24.
- Radius: `--r1: 6px` small controls, `--r2: 10px` buttons and inputs, `--r3: 14px` cards, `999px` pills.
- Elevation: cards use a 1 px `--ln` border, plus in light mode only `0 1px 2px rgb(15 22 28 / .04), 0 4px 16px rgb(15 22 28 / .04)`. Floating things (mini player, tooltips) use `--shadow-pop`.
- Z-index: content 0, sticky column 1, EQ tooltip 15, mini player 20, skip link 30.

## 5. Components

- **App bar**: brand mark + name + version on the left, nav links (Guide, Changelog, Credits, Privacy) and Show all hints on the right; wraps under 560 px.
- **Card** (`.card`): title is `h2.lbl`; a `data-n` attribute draws the step disc. Optional tools say "(optional)" in `.opt`. No all-caps labels anywhere. Sub-groups inside a card are separated by `.grp` (24 px gap, hairline).
- **Buttons**: primary `.go` (accent fill, 48 px tall), secondary `.go.alt` / `.btn` (1 px `--ln2` outline, accent text on hover), toolbar `.tb` (32–36 px, ghost). Disabled = 0.4 opacity + `not-allowed`.
- **Segmented / chips**: `.chips`, `.seg`, `.om` share one look: `--raise` track, the selected item filled with accent. Minimum target 36 px desktop, 40 px under 560 px.
- **Inputs / selects**: 40 px tall, `--card` fill, `--ln2` border, accent focus ring.
- **Range**: accent thumb, `--ln` track. Full-width sliders keep 28 px height for touch.
- **VU meter** (`.meter`, results): cream face in both themes, -24 to -6 LUFS scale, red zone above -9, hollow "before" marker, teal "after", amber target needle. The page's one bold element.
- **Result list** (`dl`): label left in `--mut`, value right in `--ink` 600 with tabular figures.
- **Wells**: waveform, stem lanes, meters, spectrum sit on `--sunk` with a hairline.
- **Hint** (`.hint`): 14 px `--mut`, max 70ch.
- **Help bubble** (`.hx`): accent left rule on `--raise`.
- **Focus**: 2 px `--ac` outline, 2 px offset, on every interactive element (`:focus-visible`).

### Rules added after the impeccable critique (v68)

- **Solid teal fill only for the primary actions** (`#go` Master full song, `#save` Save file, `#mGo` Master song). Selected chips, segments and toggles use `--sel` (teal 18% over the card), a teal border and ink text. Play buttons are ink-filled (`--ink` on `--card`) so they never read as a selected option.
- **Optional cards fold** (`.card.folded`): Arrangement, Volume automation, AI suggestions, Reference tracks start as their title plus a one-line state summary (`.fsum`) and a Show/Hide pill (`.fold`). They open themselves when they gain content (a region, AI suggestions).
- **One Apply to preview per settings card**, in the card title.
- **No one-sided accent bars** on rounded boxes (`.hx`, `.aic`, `.note`): use a full tinted border and a 5–6% accent wash.
- **Icons are authored SVG** (`ICO` in the script, 16 px box, 1.6 px stroke, `currentColor`), never Unicode glyphs.
- **Measure**: hints `min(68ch,38em)`, guide prose `min(66ch,36em)`, `text-wrap:pretty` on prose and `balance` on headings.
- **Targets**: at least 24 px for every control (help `?` and EQ `i` buttons are 24 px); inputs are 16 px on phones.

## 6. Layout and breakpoints

- Mobile first, single column, 16 px gutters, max 560 px reading width. Inputs are 16 px under 560 px so iOS does not zoom.
- `≥1080 px`: `#topRow` holds Song (300–360 px) and Listen side by side (Song spans the row until a file is loaded); below, two columns `minmax(0,1fr) minmax(0,1.08fr)`, the left one sticky; max width 1280 px.
- Breakpoints: 480 (compact controls), 560 (row reflow), 1080 (two columns).
- No horizontal page scroll at any width (`scrollWidth === innerWidth`); wide tables scroll inside `.tw`.

## 7. Motion

- 140 ms ease-out for color, border and background changes; 200 ms for progress bars.
- No movement animations. All transitions off under `prefers-reduced-motion: reduce`.

## 8. Content and sample data

- A **demo song** (synthesized in the page, 4/4 at 120 BPM, about 32 s) fills every screen without a file: waveform, tempo grid, stems, results. It is labelled as a demo everywhere it appears.
- Copy is plain and specific; numbers carry units (LUFS, dBTP, dB, Hz, s).

## 9. Anti-patterns

- Emoji as structural icons (the favicon is the only exception).
- Accent used for decoration, or two accents competing.
- Numbers in proportional figures, in `--mut`, or under 12 px.
- Walls of settings without grouping; hints wider than 70ch.
- New CDN dependencies, frameworks or build steps.
