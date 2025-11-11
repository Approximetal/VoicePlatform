#!/usr/bin/env python3
"""
Build manifest for Audio Processing demos (denoise, upsampling, separation).
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "demos" / "Audio_Processing"
DENOISE_DIR = AUDIO_DIR / "Denoise"
UPSAMPLING_DIR = AUDIO_DIR / "Upsampling"
SEPARATION_DIR = AUDIO_DIR / "Separation"

OUTPUT_FILE = ROOT / "assets" / "audio_processing_demos.json"

LANGUAGE_LABELS: Dict[str, Tuple[str, str]] = {
    "zh-CN": ("中文", "Chinese"),
    "en-US": ("English", "English"),
    "en-GB": ("English (UK)", "English"),
    "en-IN": ("English (India)", "English"),
    "de-DE": ("Deutsch", "German"),
    "es-ES": ("Español", "Spanish"),
    "pt-BR": ("Português (Brasil)", "Portuguese (Brazil)"),
    "fr-FR": ("Français", "French"),
    "ja-JP": ("日本語", "Japanese"),
    "ko-KR": ("한국어", "Korean"),
}

LANGUAGE_CODE_PATTERN = re.compile(r"_([a-z]{2}-[A-Z]{2})")


@dataclass
class ComparisonEntry:
    id: str
    language_code: Optional[str]
    before_image: Path
    after_image: Path
    before_audio: Path
    after_audio: Path


def detect_language(code_source: str) -> Optional[str]:
    match = LANGUAGE_CODE_PATTERN.search(code_source)
    if match:
        return match.group(1)
    return None


def language_labels(code: Optional[str]) -> Tuple[str, str]:
    if not code:
        return ("多语言", "Multilingual")
    return LANGUAGE_LABELS.get(code, (code, code))


def collect_comparison_entries(folder: Path, suffix: str) -> List[ComparisonEntry]:
    entries: List[ComparisonEntry] = []
    if not folder.exists():
        return entries

    suffix_pattern = f"_{suffix}"
    for after_image in sorted(folder.glob(f"*{suffix_pattern}.jpg")):
        base = after_image.stem.replace(suffix_pattern, "")
        before_image = folder / f"{base}.jpg"
        before_audio = folder / f"{base}.mp3"
        after_audio = folder / f"{base}{suffix_pattern}.mp3"

        if not before_image.exists() or not before_audio.exists() or not after_audio.exists():
            print(f"[warn] Missing assets for base '{base}' in {folder.name}", file=sys.stderr)
            continue

        entries.append(
            ComparisonEntry(
                id=base,
                language_code=detect_language(base),
                before_image=before_image,
                after_image=after_image,
                before_audio=before_audio,
                after_audio=after_audio,
            )
        )
    return entries


def render_manifest() -> Dict:
    denoise_entries = collect_comparison_entries(DENOISE_DIR, "denoise")
    upsampling_entries = collect_comparison_entries(UPSAMPLING_DIR, "upsampling")

    def serialize(entries: List[ComparisonEntry]) -> List[Dict]:
        return [
            {
                "id": entry.id,
                "language": {
                    "code": entry.language_code or "",
                    "labelNative": language_labels(entry.language_code)[0],
                    "labelEnglish": language_labels(entry.language_code)[1],
                },
                "spectrogram": {
                    "before": entry.before_image.relative_to(ROOT).as_posix(),
                    "after": entry.after_image.relative_to(ROOT).as_posix(),
                },
                "audio": {
                    "before": entry.before_audio.relative_to(ROOT).as_posix(),
                    "after": entry.after_audio.relative_to(ROOT).as_posix(),
                },
            }
            for entry in entries
        ]

    try:
        separation_tracks = [
            {
                "labelNative": "原音频",
                "labelEnglish": "Original",
                "file": (SEPARATION_DIR / "A_thousand_years_raw.mp3").relative_to(ROOT).as_posix(),
            },
            {
                "labelNative": "分离后的人声",
                "labelEnglish": "Vocal",
                "file": (SEPARATION_DIR / "A_thousand_years_vocal.mp3").relative_to(ROOT).as_posix(),
            },
            {
                "labelNative": "分离后的背景音",
                "labelEnglish": "Instrumental",
                "file": (SEPARATION_DIR / "A_thousand_years_instrumental.mp3").relative_to(ROOT).as_posix(),
            },
        ]
    except FileNotFoundError:
        separation_tracks = []

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "denoise": serialize(denoise_entries),
        "upsampling": serialize(upsampling_entries),
        "separation": {"tracks": separation_tracks},
    }


def main() -> int:
    manifest = render_manifest()
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(
        f"[info] Generated audio processing manifest "
        f"(denoise={len(manifest['denoise'])}, upsampling={len(manifest['upsampling'])}) "
        f"-> {OUTPUT_FILE}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
