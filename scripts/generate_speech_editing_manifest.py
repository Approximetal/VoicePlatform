#!/usr/bin/env python3
"""
Scan speech editing demo assets and build a manifest consumed by the frontend.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "demos" / "Speech_Editing" / "multilingual"
OUTPUT_FILE = ROOT / "assets" / "speech_editing_demos.json"

LANGUAGE_LABELS: Dict[str, Tuple[str, str]] = {
    "zh-CN": ("中文", "Chinese"),
    "de-DE": ("Deutsch", "German"),
    "pt-BR": ("Português (Brasil)", "Portuguese (Brazil)"),
    "es-ES": ("Español", "Spanish"),
    "en-IN": ("English (India)", "English"),
    "en-US": ("English", "English"),
    "fr-FR": ("Français", "French"),
    "it-IT": ("Italiano", "Italian"),
    "ru-RU": ("Русский", "Russian"),
    "ja-JP": ("日本語", "Japanese"),
    "ko-KR": ("한국어", "Korean"),
}

DIFF_PATTERN = re.compile(r"【([^】]+)】\s*/\s*【([^】]+)】")


@dataclass
class Segment:
    kind: str  # "text" or "diff"
    text: str | None = None
    before: str | None = None
    after: str | None = None


def get_language_labels(code: str) -> Tuple[str, str]:
    return LANGUAGE_LABELS.get(code, (code, code))


def parse_segments(text: str) -> Tuple[List[Segment], str, str]:
    segments: List[Segment] = []
    cursor = 0

    def add_text_segment(start: int, end: int) -> None:
        if end > start:
            segments.append(Segment("text", text=text[start:end]))

    for match in DIFF_PATTERN.finditer(text):
        start, end = match.span()
        add_text_segment(cursor, start)
        before, after = match.group(1).strip(), match.group(2).strip()
        segments.append(Segment("diff", before=before, after=after))
        cursor = end

    add_text_segment(cursor, len(text))

    def replace_with(index: int) -> str:
        return DIFF_PATTERN.sub(lambda m: m.group(index).strip(), text)

    return segments, replace_with(1), replace_with(2)


def collect_examples() -> Sequence[Dict]:
    if not DATA_DIR.exists():
        raise FileNotFoundError(f"Demo directory not found: {DATA_DIR}")

    entries = []
    for txt_file in sorted(DATA_DIR.glob("*.txt")):
        base = txt_file.stem  # e.g. V-0000_zh-CN
        if "_" not in base:
            print(f"[warn] Skip '{base}' – missing language suffix", file=sys.stderr)
            continue

        language_code = base.split("_", 1)[1]
        before_audio = txt_file.with_suffix(".mp3")
        after_audio = txt_file.with_name(f"{base}_edit.mp3")

        text_content = txt_file.read_text(encoding="utf-8").strip()
        segments, original_text, edited_text = parse_segments(text_content)

        entries.append(
            {
                "id": base,
                "language": {
                    "code": language_code,
                    "labelNative": get_language_labels(language_code)[0],
                    "labelEnglish": get_language_labels(language_code)[1],
                },
                "segments": [
                    (
                        {"type": "text", "text": seg.text}
                        if seg.kind == "text"
                        else {
                            "type": "diff",
                            "before": seg.before,
                            "after": seg.after,
                        }
                    )
                    for seg in segments
                ],
                "text": {
                    "original": original_text,
                    "edited": edited_text,
                },
                "audio": {
                    "before": before_audio.relative_to(ROOT).as_posix()
                    if before_audio.exists()
                    else "",
                    "after": after_audio.relative_to(ROOT).as_posix()
                    if after_audio.exists()
                    else "",
                },
            }
        )

    return entries


def main() -> int:
    try:
        examples = collect_examples()
    except FileNotFoundError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "exampleCount": len(examples),
        "examples": examples,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(
        f"[info] Generated speech editing manifest with {manifest['exampleCount']} entries -> {OUTPUT_FILE}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

