---
name: compress-mp3-audio
description: Compress and re-encode local MP3 audio with FFmpeg using safe web-game presets, optional bitrate or target-size controls, batch directory processing, and before/after verification. Use when Codex needs to shrink .mp3 files, reduce audio bitrate or file size, optimize music, sound effects, or voice for web/mobile delivery, or batch-compress MP3 assets while preserving the source files.
---

# Compress MP3 audio

Use the bundled `scripts/compress_mp3.py` wrapper for deterministic local
compression. It calls FFmpeg/FFprobe, writes new files by default, verifies
duration and size, and does not consume RUN credits or use a remote service.

## Compress safely

1. Inspect the source count, sizes, durations, bitrates, channels, and intended
   use. Treat MP3 re-encoding as lossy; prefer a lossless master when one is
   available and avoid repeatedly compressing an already-compressed derivative.
2. Keep the originals unless the user explicitly authorizes replacement. The
   script defaults to `<name>.compressed.mp3` for one file and a `compressed/`
   subtree for a directory.
3. Select the least aggressive preset that meets the delivery budget:

   | Preset | Encoding | Typical use |
   | --- | --- | --- |
   | `music` | 128 kbps, 44.1 kHz | Background music and ambience |
   | `sfx` | 96 kbps, 44.1 kHz | General game sound effects |
   | `voice` | 64 kbps mono, 32 kHz | Dialogue and narration |
   | `tiny` | 48 kbps, 32 kHz | Severe size constraints after auditioning |

4. Run a dry run when paths or batch scope are uncertain, then encode.
5. Review the reported before/after sizes and compression percentage. Audition
   representative quiet, loud, transient, and loop-boundary sections before
   replacing game references or deleting any source.

Do not claim that a lower bitrate improves quality. If the output is not
smaller, the script discards it unless `--keep-larger` is explicitly supplied.

## Use the wrapper

Check the dependency first:

```bash
ffmpeg -version
ffprobe -version
```

FFmpeg includes FFprobe. If unavailable, use the platform package manager only
when dependency installation is within the current authorization; on macOS the
usual command is `brew install ffmpeg`. Otherwise report the missing dependency.

Compress one music file:

```bash
python3 scripts/compress_mp3.py assets/audio/theme.mp3 --preset music
```

Compress every MP3 in a directory tree while preserving its layout:

```bash
python3 scripts/compress_mp3.py assets/audio --recursive --preset sfx
```

Use an exact bitrate or an approximate maximum size instead of a preset:

```bash
python3 scripts/compress_mp3.py narration.mp3 --bitrate 56
python3 scripts/compress_mp3.py long-theme.mp3 --target-mb 1.5
```

Use `--output PATH` for an explicit destination file or directory. Use
`--overwrite` only when the user has authorized replacing existing *outputs*;
the script always refuses to overwrite an input file. Run `--help` for all
options.

## Verify the handoff

Confirm that each intended output exists, is smaller, has a nonzero duration,
and differs from the source duration by no more than normal MP3 encoder padding.
For game assets, also test first playback, loops, rapid SFX overlap, mute/volume,
pause/resume, and representative phone speakers. Route playback, lifecycle,
mixing, and release-quality work through `rundot-audio` and
`rundot-game-quality`.
