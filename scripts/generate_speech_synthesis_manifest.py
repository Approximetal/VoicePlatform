#!/usr/bin/env python3
"""Generate manifest for speech synthesis pairing demos."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
DEMOS_DIR = ROOT / "demos" / "Speech_Synthesis"
OUTPUT = ROOT / "assets" / "speech_synthesis_demos.json"
AUDIO_EXTS = (".wav", ".mp3", ".flac", ".m4a")


def find_audio(path_stub: Path) -> Optional[Path]:
    for ext in AUDIO_EXTS:
        candidate = path_stub.with_suffix(ext)
        if candidate.exists():
            return candidate
    return None


def main() -> None:
    entries: List[Dict[str, Any]] = []

    if not DEMOS_DIR.exists():
        payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "demos": entries}
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"Wrote {OUTPUT} with {len(entries)} demos")
        return

    for folder in sorted(d for d in DEMOS_DIR.iterdir() if d.is_dir()):
        base_name = folder.name
        # Determine source language from folder suffix (after last underscore)
        source_lang = ""
        if "_" in base_name:
            source_lang = base_name.rsplit("_", 1)[-1]

        source_audio = find_audio(folder / base_name)
        if not source_audio:
            continue

        text_files = sorted(folder.glob(f"{base_name}_*.txt"))
        if not text_files:
            continue

        for text_file in text_files:
            target_code = text_file.stem.rsplit("_", 1)[-1]
            target_audio = find_audio(folder / text_file.stem)
            if not target_audio:
                continue

            lines = text_file.read_text(encoding="utf-8").strip().splitlines()
            if not lines:
                continue
            source_text = lines[0].strip()
            target_text = lines[1].strip() if len(lines) > 1 else ""

            entries.append(
                {
                    "id": f"{base_name}__{target_code}",
                    "title": base_name.replace("_", " ").title(),
                    "sourceLanguage": source_lang,
                    "targetLanguage": target_code,
                    "sourceText": source_text,
                    "targetText": target_text,
                    "sourceAudio": str(source_audio.relative_to(ROOT).as_posix()),
                    "targetAudio": str(target_audio.relative_to(ROOT).as_posix()),
                }
            )

    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "demos": entries}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT} with {len(entries)} demos")


if __name__ == "__main__":
    main()
