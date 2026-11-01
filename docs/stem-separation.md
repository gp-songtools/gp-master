# Stem separation notes

Verified working settings for MDX-Net ONNX models, confirmed by testing.

## Models

Downloaded from the `TRvlvr/model_repo` GitHub release
`all_public_uvr_models`. Official parameters come from
`TRvlvr/application_data` → `mdx_model_data/model_data.json`.

| Stem | Model | Size | n_fft | dim_f | dim_t | compensate |
| --- | --- | --- | --- | --- | --- | --- |
| Vocals | `Kim_Vocal_2.onnx` | 67 MB | 7680 | 3072 | 256 | 1.009 |
| Drums | `kuielab_a_drums.onnx` | 29 MB | 4096 | 2048 | 512 | 1.035 |
| Bass | `kuielab_a_bass.onnx` | 29 MB | 16384 | 2048 | 512 | 1.035 |
| Other | *derived* — mix minus the three above | — | — | — | — | — |

**The n_fft value differs per model and is not inferable from the ONNX input
shape.** Running a model at the wrong n_fft does not error; it silently
produces a weak, hollow stem. Two separate bugs were traced to this: bass run
at 4096 output near-silence, and vocals run at 6144 sounded faded and muddy.

Deriving "other" by subtraction beats `kuielab_a_other.onnx` and makes the four
stems sum back to the original exactly.

## Inference

Hop is 1024 for all models. Chunking follows UVR:

```
chunk = hop * (dim_t - 1)
trim  = n_fft / 2
gen   = chunk - 2 * trim      # usable output per chunk
```

Pad the input by `trim` at the front, process each chunk, and keep samples
`[trim, trim + gen)` from each chunk's inverse STFT.

STFT: Hann window, centered (reflect-pad by `n_fft/2`), frames laid out as
`[real_L, imag_L, real_R, imag_R]`, truncated to `dim_f` bins. The model
returns the same layout; inverse STFT it with window-squared overlap-add
normalization. Discarding the Nyquist bin is expected and matches UVR.

## Performance

Measured on 2 CPU cores via ONNX Runtime (Python):

| Stems | Speed | 5-minute song |
| --- | --- | --- |
| Vocals only | ~1.3x realtime | ~7 min |
| Drums or bass | ~0.6x realtime each | ~3 min each |
| All four | ~1.5x realtime | ~8 min |

Browser WASM inference will be slower. Expect several times these figures on a
laptop, and the model downloads (125 MB for all four stems) should be cached
and fetched only for the stems actually requested.
