#!/usr/bin/env python3
"""Generate manifest for speech recognition demos with word-level timing."""
from __future__ import annotations

import ast
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
DEMOS_DIR = ROOT / "demos" / "Speech_Recognition"
OUTPUT = ROOT / "assets" / "speech_recognition_demos.json"
TRAILING_PUNCT_RE = re.compile(r"\s+([,.;!?])")
TIME_PATTERN = re.compile(r"(?P<h>\d+):(?P<m>\d+):(?P<s>\d+),(?P<ms>\d+)")
LANG_MAP = {
    "zh": "中文 / Chinese",
    "en": "英语 / English",
    "ja": "日语 / Japanese",
    "ko": "韩语 / Korean",
    "fr": "法语 / French",
    "es": "西班牙语 / Spanish",
    "de": "德语 / German",
    "it": "意大利语 / Italian",
    "ru": "俄语 / Russian",
    "pt": "葡萄牙语 / Portuguese",
}


def load_data(path: Path) -> Dict[str, Any]:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return ast.literal_eval(raw)


def normalize_words(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for word in words:
        try:
            text = str(word["word"]).strip()
            start = float(word["start"])
            end = float(word["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if not text:
            continue
        entry: Dict[str, Any] = {
            "text": text,
            "start": round(start, 3),
            "end": round(end, 3),
        }
        score = word.get("score")
        if score is not None:
            try:
                entry["score"] = round(float(score), 3)
            except (TypeError, ValueError):
                pass
        normalized.append(entry)
    return normalized


def parse_timecode(value: str) -> float:
    match = TIME_PATTERN.search(value.strip())
    if not match:
        return 0.0
    h = int(match.group("h"))
    m = int(match.group("m"))
    s = int(match.group("s"))
    ms = int(match.group("ms"))
    return round(h * 3600 + m * 60 + s + ms / 1000, 3)


def extract_speaker_and_text(raw: str) -> Tuple[str | None, str]:
    text = raw.strip()
    for sep in ("：", ":", "﹕"):
        if sep in text:
            maybe_speaker, remainder = text.split(sep, 1)
            label = maybe_speaker.strip()
            remainder = remainder.strip()
            if label and remainder:
                return label, remainder
    return None, text


def parse_srt_segments(path: Path) -> List[Dict[str, Any]]:
    content = path.read_text(encoding="utf-8-sig").strip()
    if not content:
        return []
    blocks = re.split(r"\r?\n\r?\n+", content)
    segments: List[Dict[str, Any]] = []
    for block in blocks:
        lines = [line.strip("\ufeff").strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        ts_line_idx = 0
        if "-->" not in lines[0] and len(lines) > 1 and "-->" in lines[1]:
            ts_line_idx = 1
        if "-->" not in lines[ts_line_idx]:
            continue
        ts_line = lines[ts_line_idx]
        try:
            start_part, end_part = [part.strip() for part in ts_line.split("-->")]
        except ValueError:
            continue
        start = parse_timecode(start_part)
        end_str = end_part.split()[0]
        end = parse_timecode(end_str)
        text_lines = lines[ts_line_idx + 1 :]
        if not text_lines:
            continue
        raw_text = " ".join(text_lines)
        speaker, sentence_text = extract_speaker_and_text(raw_text)
        sentence_text = TRAILING_PUNCT_RE.sub(r"\1", sentence_text)
        segments.append(
            {
                "start": start,
                "end": end,
                "text": sentence_text.strip(),
                "speaker": speaker,
            }
        )
    return segments


def attach_words_to_segments(
    segments: List[Dict[str, Any]], words: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not segments:
        return []
    tolerance = 0.05
    idx = 0
    total = len(words)
    for s in range(len(segments)):
        segment = segments[s]
        next_start = segments[s+1]["start"] if s + 1 < len(segments) else segments[-1]["end"]
        collected: List[Dict[str, Any]] = []
        for j in range(idx, total):
            if words[j]["end"] < segment["start"] + tolerance:
                continue
            if words[j]["start"] > segment["end"] - tolerance:
                break
            if words[j]["text"] in segment["text"] and words[j]["end"] <= next_start + tolerance:
                collected.append(words[j])
        idx = j
        segment["words"] = collected
    return segments


def main() -> None:
    demos: List[Dict[str, Any]] = []
    if DEMOS_DIR.exists():
        for folder in sorted(d for d in DEMOS_DIR.iterdir() if d.is_dir()):
            audio_files = list(folder.glob("*.wav")) + list(folder.glob("*.mp3"))
            transcript_files = list(folder.glob("*.json")) + list(folder.glob("*.txt"))
            srt_files = list(folder.glob("*.srt"))
            if not audio_files or not transcript_files:
                continue
            data = load_data(transcript_files[0])
            words_raw = data.get("words") or []
            words = normalize_words(words_raw)
            if not words:
                continue
            segments = parse_srt_segments(srt_files[0]) if srt_files else []
            if segments:
                sentences = attach_words_to_segments(segments, words)
            else:
                sentences = [
                    {
                        "start": words[0]["start"],
                        "end": words[-1]["end"],
                        "text": " ".join(w["text"] for w in words),
                        "speaker": None,
                        "words": words,
                    }
                ]
            demos.append(
                {
                    "id": folder.name,
                    "title": folder.name.replace("_", " ").title(),
                    "language": (data.get("lang") or folder.name.split("_")[-1]).lower(),
                    "audio": str(audio_files[0].relative_to(ROOT).as_posix()),
                    "duration": round(float(data.get("end", words[-1]["end"])), 3),
                    "sentences": sentences,
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
