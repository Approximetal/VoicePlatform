#!/usr/bin/env python3
"""Generate manifest for speaker diarization demos."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any

ROOT = Path(__file__).resolve().parents[1]
DEMOS_DIR = ROOT / "demos" / "Speaker_Diarization"
OUTPUT = ROOT / "assets" / "speaker_diarization_demos.json"


def parse_timestamp(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return (
        int(hours) * 3600
        + int(minutes) * 60
        + int(seconds)
        + int(millis) / 1000.0
    )


def parse_srt(path: Path) -> List[Dict[str, Any]]:
    content = path.read_text(encoding="utf-8-sig").strip()
    if not content:
        return []

    blocks = []
    current: List[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(stripped)
    if current:
        blocks.append(current)

    entries: List[Dict[str, Any]] = []
    for block in blocks:
        if len(block) < 2:
            continue
        time_line = block[1]
        try:
            start_raw, end_raw = [part.strip() for part in time_line.split("-->")]
            start = parse_timestamp(start_raw)
            end = parse_timestamp(end_raw)
        except Exception:  # noqa: BLE001
            continue
        text_lines = block[2:]
        if not text_lines:
            continue
        text = " ".join(text_lines).strip()
        speaker = ""
        content_text = text
        for sep in ("：", ":"):
            if sep in text:
                maybe_speaker, maybe_text = text.split(sep, 1)
                if maybe_speaker.strip():
                    speaker = maybe_speaker.strip()
                    content_text = maybe_text.strip()
                break
        entries.append(
            {
                "start": round(start, 3),
                "end": round(end, 3),
                "speaker": speaker,
                "text": content_text,
            }
        )
    return entries


def main() -> None:
    demos: List[Dict[str, Any]] = []
    if DEMOS_DIR.exists():
        for folder in sorted(d for d in DEMOS_DIR.iterdir() if d.is_dir()):
            audio_files = list(folder.glob("*.wav")) + list(folder.glob("*.mp3"))
            subtitle_files = list(folder.glob("*.srt"))
            if not audio_files or not subtitle_files:
                continue
            audio_path = audio_files[0]
            subtitle_path = subtitle_files[0]
            subtitles = parse_srt(subtitle_path)
            demos.append(
                {
                    "id": folder.name,
                    "title": folder.name.replace("_", " ").title(),
                    "audio": str(audio_path.relative_to(ROOT).as_posix()),
                    "subtitles": subtitles,
                }
            )

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "demos": demos,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT} with {len(demos)} demos")


if __name__ == "__main__":
    main()
