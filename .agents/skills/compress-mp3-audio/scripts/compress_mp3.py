#!/usr/bin/env python3
"""Safely compress one MP3 file or a directory of MP3 files with FFmpeg."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
from typing import Any


PRESETS: dict[str, dict[str, int | bool]] = {
    "music": {"bitrate": 128, "sample_rate": 44_100, "mono": False},
    "sfx": {"bitrate": 96, "sample_rate": 44_100, "mono": False},
    "voice": {"bitrate": 64, "sample_rate": 32_000, "mono": True},
    "tiny": {"bitrate": 48, "sample_rate": 32_000, "mono": False},
}


class CompressionError(RuntimeError):
    """Raised for an expected input, dependency, or encoding failure."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compress an MP3 file or directory while preserving source files. "
            "A file defaults to <stem>.compressed.mp3; a directory defaults "
            "to a compressed/ subtree."
        )
    )
    parser.add_argument("source", type=Path, help="MP3 file or directory")
    parser.add_argument(
        "--output",
        type=Path,
        help="Exact output MP3 for a file, or output root for a directory",
    )
    parser.add_argument(
        "--preset", choices=sorted(PRESETS), default="music", help="Encoding preset"
    )
    parser.add_argument(
        "--bitrate",
        type=int,
        metavar="KBPS",
        help="Override preset bitrate (32-320 kbps)",
    )
    parser.add_argument(
        "--target-mb",
        type=float,
        metavar="MB",
        help="Approximate maximum size per output; overrides bitrate",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        metavar="HZ",
        help="Override preset sample rate (8000-48000 Hz)",
    )
    channels = parser.add_mutually_exclusive_group()
    channels.add_argument("--mono", action="store_true", help="Force mono output")
    channels.add_argument(
        "--preserve-channels",
        action="store_true",
        help="Preserve source channel count, overriding a mono preset",
    )
    parser.add_argument(
        "--recursive", action="store_true", help="Search a source directory recursively"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing output files; input files are never overwritten",
    )
    parser.add_argument(
        "--keep-larger",
        action="store_true",
        help="Keep encoded files even when they are not smaller than the source",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print planned outputs without encoding"
    )
    parser.add_argument("--ffmpeg", help="FFmpeg binary name or path")
    parser.add_argument("--ffprobe", help="FFprobe binary name or path")
    return parser.parse_args()


def find_tool(explicit: str | None, name: str) -> str:
    candidates = [explicit] if explicit else []
    candidates.extend([name, f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}"])
    for candidate in candidates:
        if not candidate:
            continue
        found = shutil.which(candidate)
        if found:
            return found
        path = Path(candidate).expanduser()
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    raise CompressionError(
        f"{name} was not found. Install FFmpeg (for example, `brew install ffmpeg`) "
        f"or pass --{name} PATH."
    )


def probe(ffprobe: str, path: Path) -> dict[str, Any]:
    command = [
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "format=duration,size,bit_rate:stream=codec_name,channels,sample_rate,bit_rate",
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        detail = result.stderr.strip() or "unknown ffprobe error"
        raise CompressionError(f"Could not inspect {path}: {detail}")
    try:
        data = json.loads(result.stdout)
        duration = float(data["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise CompressionError(f"Could not read an audio duration from {path}") from exc
    if not math.isfinite(duration) or duration <= 0:
        raise CompressionError(f"Audio duration must be positive: {path}")
    data["duration_seconds"] = duration
    return data


def source_files(source: Path, recursive: bool, excluded_root: Path | None) -> list[Path]:
    if source.is_file():
        if source.suffix.lower() != ".mp3":
            raise CompressionError(f"Input must be an .mp3 file: {source}")
        if recursive:
            raise CompressionError("--recursive is only valid for a directory")
        return [source]
    if not source.is_dir():
        raise CompressionError(f"Input does not exist: {source}")

    pattern = "**/*" if recursive else "*"
    files: list[Path] = []
    excluded = excluded_root.resolve() if excluded_root else None
    for path in sorted(source.glob(pattern)):
        if not path.is_file() or path.suffix.lower() != ".mp3":
            continue
        resolved = path.resolve()
        if excluded and (resolved == excluded or excluded in resolved.parents):
            continue
        files.append(path)
    if not files:
        scope = "recursively" if recursive else "at the directory root"
        raise CompressionError(f"No MP3 files found {scope}: {source}")
    return files


def output_path(source_root: Path, input_path: Path, output: Path | None) -> Path:
    if source_root.is_file():
        if output:
            destination = output
        else:
            destination = input_path.with_name(f"{input_path.stem}.compressed.mp3")
    else:
        output_root = output if output else source_root / "compressed"
        destination = output_root / input_path.relative_to(source_root)
    if destination.suffix.lower() != ".mp3":
        raise CompressionError(f"Output must use the .mp3 extension: {destination}")
    if destination.resolve() == input_path.resolve():
        raise CompressionError(f"Refusing to overwrite input file: {input_path}")
    return destination


def desired_bitrate(args: argparse.Namespace, duration: float) -> int:
    if args.target_mb is not None:
        if not math.isfinite(args.target_mb) or args.target_mb <= 0:
            raise CompressionError("--target-mb must be a positive number")
        # Reserve 10% for MP3 frames, padding, and metadata, then verify below.
        bitrate = math.floor((args.target_mb * 1_000_000 * 8 * 0.90) / duration / 1_000)
        if bitrate < 32:
            raise CompressionError(
                f"Target {args.target_mb:g} MB requires about {bitrate} kbps for this "
                "duration, below the supported 32 kbps minimum"
            )
        return min(bitrate, 320)
    bitrate = (
        args.bitrate
        if args.bitrate is not None
        else int(PRESETS[args.preset]["bitrate"])
    )
    if not 32 <= bitrate <= 320:
        raise CompressionError("--bitrate must be between 32 and 320 kbps")
    return bitrate


def format_bytes(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1000 or unit == "GB":
            return f"{value:.1f} {unit}"
        value /= 1000
    return f"{size} B"


def encode_one(
    ffmpeg: str,
    ffprobe: str,
    input_path: Path,
    destination: Path,
    args: argparse.Namespace,
) -> tuple[str, int, int]:
    if destination.exists() and not args.overwrite:
        raise CompressionError(f"Output exists (use --overwrite only if authorized): {destination}")

    source_info = probe(ffprobe, input_path)
    bitrate = desired_bitrate(args, source_info["duration_seconds"])
    sample_rate = (
        args.sample_rate
        if args.sample_rate is not None
        else int(PRESETS[args.preset]["sample_rate"])
    )
    if not 8_000 <= sample_rate <= 48_000:
        raise CompressionError("--sample-rate must be between 8000 and 48000 Hz")
    mono = args.mono or (bool(PRESETS[args.preset]["mono"]) and not args.preserve_channels)

    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(input_path),
        "-map",
        "0:a:0",
        "-map_metadata",
        "0",
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        f"{bitrate}k",
        "-ar",
        str(sample_rate),
    ]
    if mono:
        command.extend(["-ac", "1"])
    command.extend(["-id3v2_version", "3"])

    if args.dry_run:
        print(f"[plan] {input_path} -> {destination}")
        print(f"       {shlex.join(command + [str(destination)])}")
        return "planned", input_path.stat().st_size, 0

    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.stem}.", suffix=".mp3", dir=destination.parent
    )
    os.close(fd)
    temporary = Path(temporary_name)
    command.append(str(temporary))

    try:
        target_bytes = int(args.target_mb * 1_000_000) if args.target_mb else None
        bitrate_index = command.index("-b:a") + 1
        output_info: dict[str, Any] | None = None
        output_size = 0
        for _attempt in range(4):
            command[bitrate_index] = f"{bitrate}k"
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                detail = result.stderr.strip() or "unknown ffmpeg error"
                raise CompressionError(f"FFmpeg failed for {input_path}: {detail}")

            output_info = probe(ffprobe, temporary)
            output_size = temporary.stat().st_size
            if target_bytes is None or output_size <= target_bytes:
                break
            next_bitrate = math.floor(bitrate * target_bytes / output_size * 0.96)
            if next_bitrate < 32 or next_bitrate >= bitrate:
                raise CompressionError(
                    f"Target size cannot be reached at the 32 kbps minimum: {input_path}"
                )
            bitrate = next_bitrate
        else:
            raise CompressionError(
                f"Target-size verification did not converge for {input_path}"
            )

        assert output_info is not None
        duration_delta = abs(
            output_info["duration_seconds"] - source_info["duration_seconds"]
        )
        duration_tolerance = max(0.25, source_info["duration_seconds"] * 0.02)
        if duration_delta > duration_tolerance:
            raise CompressionError(
                f"Duration verification failed for {input_path}: "
                f"{source_info['duration_seconds']:.3f}s -> "
                f"{output_info['duration_seconds']:.3f}s"
            )

        source_size = input_path.stat().st_size
        if output_size >= source_size and not args.keep_larger:
            temporary.unlink(missing_ok=True)
            print(
                f"[skip] {input_path}: encoded file was not smaller "
                f"({format_bytes(source_size)} -> {format_bytes(output_size)})"
            )
            return "skipped", source_size, output_size

        os.replace(temporary, destination)
        reduction = (1 - output_size / source_size) * 100
        print(
            f"[ok]   {input_path} -> {destination} | "
            f"{format_bytes(source_size)} -> {format_bytes(output_size)} "
            f"({reduction:.1f}% smaller, {bitrate} kbps)"
        )
        return "encoded", source_size, output_size
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()
    try:
        source = args.source.expanduser()
        output = args.output.expanduser() if args.output else None
        if source.is_dir() and output and output.suffix.lower() == ".mp3":
            raise CompressionError("A directory source requires an output directory")
        excluded_root = output if source.is_dir() and output else (
            source / "compressed" if source.is_dir() else None
        )
        inputs = source_files(source, args.recursive, excluded_root)

        ffmpeg = find_tool(args.ffmpeg, "ffmpeg")
        ffprobe = find_tool(args.ffprobe, "ffprobe")
        encoded = skipped = planned = failures = 0
        source_total = output_total = 0
        for input_path in inputs:
            try:
                destination = output_path(source, input_path, output)
                status, before, after = encode_one(
                    ffmpeg, ffprobe, input_path, destination, args
                )
                encoded += status == "encoded"
                skipped += status == "skipped"
                planned += status == "planned"
                if status == "encoded":
                    source_total += before
                    output_total += after
            except CompressionError as exc:
                failures += 1
                print(f"[error] {exc}", file=sys.stderr)

        summary = f"encoded={encoded}, skipped={skipped}, planned={planned}, failed={failures}"
        if encoded:
            reduction = (1 - output_total / source_total) * 100 if source_total else 0
            summary += f", written={format_bytes(output_total)}, reduction={reduction:.1f}%"
        print(f"Summary: {summary}")
        return 1 if failures else 0
    except CompressionError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
