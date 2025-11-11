#!/usr/bin/env python3
"""
Scan the Video Translation demo directory and produce a manifest JSON file.

The manifest is saved to assets/video_translation_demos.json and consumed
by the frontend to build the demo gallery dynamically.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
DEMOS_DIR = ROOT / "demos" / "Video_Translation"
OUTPUT_FILE = ROOT / "assets" / "video_translation_demos.json"

# Mapping between language codes and display labels (native, English)
LANGUAGE_LABELS: Dict[str, Tuple[str, str]] = {
    "zh": ("中文", "Chinese"),
    "en": ("英语", "English"),
    "de": ("德语", "German"),
    "ja": ("日语", "Japanese"),
    "ko": ("韩语", "Korean"),
    "fr": ("法语", "French"),
    "es": ("西班牙语", "Spanish"),
    "vi": ("越南语", "Vietnamese"),
    "pt": ("葡萄牙语", "Portuguese"),
    "th": ("泰语", "Thai"),
    "ru": ("俄语", "Russian"),
    "it": ("意大利语", "Italian"),
    "hi": ("印地语", "Hindi"),
    "id": ("印尼语", "Indonesian"),
}


@dataclass
class TranslationVariant:
    code: str
    label_native: str
    label_en: str
    video_path: str


@dataclass
class VideoDemo:
    demo_id: str
    title: str
    source_code: str
    source_native: str
    source_en: str
    thumbnail_path: str
    original_video_path: str
    translations: List[TranslationVariant]


def get_language_labels(code: str) -> Tuple[str, str]:
    code = code.lower()
    native, english = LANGUAGE_LABELS.get(code, (code.upper(), code.upper()))
    return native, english


def format_title_from_id(demo_id: str) -> str:
    """Convert folder id like `dahuaxiyou_cut_zh` to a readable title."""
    parts = demo_id.rsplit("_", 1)[0]
    formatted = parts.replace("_", " ").strip()
    return formatted.title()


def discover_demos(path: Path) -> Iterable[VideoDemo]:
    for folder in sorted(path.iterdir()):
        if not folder.is_dir():
            continue

        demo_id = folder.name
        if "_" not in demo_id:
            print(f"[warn] Skip `{demo_id}`: missing language suffix", file=sys.stderr)
            continue

        demo_prefix, source_code = demo_id.rsplit("_", 1)
        source_native, source_en = get_language_labels(source_code)

        thumbnail = folder / f"{demo_id}.jpg"
        original_video = folder / f"{demo_id}.mp4"

        if not thumbnail.exists():
            print(f"[warn] `{demo_id}` missing thumbnail {thumbnail.name}", file=sys.stderr)
        if not original_video.exists():
            print(f"[warn] `{demo_id}` missing original video {original_video.name}", file=sys.stderr)

        translations: List[TranslationVariant] = []
        prefix = f"{demo_id}_"
        for video_file in sorted(folder.glob(f"{prefix}*.mp4")):
            stem = video_file.stem
            target_code = stem.split("_")[-1]
            if target_code == source_code:
                continue
            native, english = get_language_labels(target_code)
            translations.append(
                TranslationVariant(
                    code=target_code,
                    label_native=native,
                    label_en=english,
                    video_path=f"{video_file.relative_to(ROOT).as_posix()}",
                )
            )

        yield VideoDemo(
            demo_id=demo_id,
            title=format_title_from_id(demo_id),
            source_code=source_code,
            source_native=source_native,
            source_en=source_en,
            thumbnail_path=f"{thumbnail.relative_to(ROOT).as_posix()}" if thumbnail.exists() else "",
            original_video_path=f"{original_video.relative_to(ROOT).as_posix()}" if original_video.exists() else "",
            translations=translations,
        )


def render_manifest(demos: Iterable[VideoDemo]) -> Dict:
    entries = []
    for demo in demos:
        entries.append(
            {
                "id": demo.demo_id,
                "title": demo.title,
                "sourceLanguage": {
                    "code": demo.source_code,
                    "labelNative": demo.source_native,
                    "labelEnglish": demo.source_en,
                },
                "thumbnail": demo.thumbnail_path,
                "originalVideo": demo.original_video_path,
                "translations": [
                    {
                        "code": t.code,
                        "labelNative": t.label_native,
                        "labelEnglish": t.label_en,
                        "video": t.video_path,
                    }
                    for t in demo.translations
                ],
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "demoCount": len(entries),
        "demos": entries,
    }


def main() -> int:
    if not DEMOS_DIR.exists():
        print(f"[error] Demo directory not found: {DEMOS_DIR}", file=sys.stderr)
        return 1

    demos = list(discover_demos(DEMOS_DIR))
    manifest = render_manifest(demos)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"[info] Generated manifest with {manifest['demoCount']} demos -> {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

