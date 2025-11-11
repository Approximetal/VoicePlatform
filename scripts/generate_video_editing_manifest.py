#!/usr/bin/env python3
"""
Generate manifest for Video Editing demos (lip sync & motion transfer).
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "demos" / "Video_Editing"
LIP_SYNC_DIR = DEMO_DIR / "lip_sync"
MOTION_DIR = DEMO_DIR / "motion_transfer"
OUTPUT = ROOT / "assets" / "video_editing_demos.json"


@dataclass
class LipSyncEntry:
  id: str
  display_name: str
  original: str
  translated: str
  duration: str


@dataclass
class MotionEntry:
  id: str
  file: str
  duration: str


def humanize(name: str) -> str:
  parts = name.replace("_", " ").replace("-", " ").split()
  if not parts:
    return name
  return " ".join(part.capitalize() for part in parts)


def format_duration(seconds: Optional[float]) -> str:
  if seconds is None or seconds <= 0:
    return ""
  total_seconds = int(round(seconds))
  minutes, sec = divmod(total_seconds, 60)
  hours, minutes = divmod(minutes, 60)
  if hours:
    return f"{hours:d}:{minutes:02d}:{sec:02d}"
  return f"{minutes:d}:{sec:02d}"


def probe_duration(video_path: Path) -> Optional[float]:
  try:
    result = subprocess.run(
      [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
      ],
      capture_output=True,
      text=True,
      check=True,
    )
    return float(result.stdout.strip())
  except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
    print(f"[warn] Failed to probe duration for {video_path}")
    return None


def collect_lip_sync() -> List[LipSyncEntry]:
  entries: List[LipSyncEntry] = []
  if not LIP_SYNC_DIR.exists():
    return entries

  for case_dir in sorted(p for p in LIP_SYNC_DIR.iterdir() if p.is_dir()):
    base_name = case_dir.name
    original_path = case_dir / f"{base_name}.mp4"
    if not original_path.exists():
      print(f"[warn] Skipping '{base_name}' – missing original video {original_path.name}")
      continue

    translated_candidates = sorted(
      video
      for video in case_dir.glob("*.mp4")
      if video.name.startswith(f"{base_name}_")
    )
    if not translated_candidates:
      print(f"[warn] Skipping '{base_name}' – missing translated video with suffix (e.g. {base_name}_en.mp4)")
      continue

    translated_path = translated_candidates[0]
    duration = format_duration(probe_duration(original_path))

    entries.append(
      LipSyncEntry(
        id=case_dir.name,
        display_name=humanize(case_dir.name),
        original=original_path.relative_to(ROOT).as_posix(),
        translated=translated_path.relative_to(ROOT).as_posix(),
        duration=duration,
      )
    )
  return entries


def collect_motion() -> List[MotionEntry]:
  entries: List[MotionEntry] = []
  if not MOTION_DIR.exists():
    return entries
  for video in sorted(MOTION_DIR.glob("*.mp4")):
    duration = format_duration(probe_duration(video))
    entries.append(
      MotionEntry(
        id=video.stem,
        file=video.relative_to(ROOT).as_posix(),
        duration=duration,
      )
    )
  return entries


def render_manifest() -> Dict:
  lip_sync = collect_lip_sync()
  motion = collect_motion()
  return {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "lipSync": [
      {
        "id": entry.id,
        "title": humanize(entry.id),
        "videos": {
          "original": entry.original,
          "translated": entry.translated,
        },
        "duration": entry.duration,
      }
      for entry in lip_sync
    ],
    "motionTransfer": [
      {
        "id": entry.id,
        "title": humanize(entry.id),
        "video": entry.file,
        "duration": entry.duration,
      }
      for entry in motion
    ],
  }


def main() -> int:
  manifest = render_manifest()
  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
  print(
    f"[info] Generated video editing manifest "
    f"(lip_sync={len(manifest['lipSync'])}, motion={len(manifest['motionTransfer'])}) "
    f"-> {OUTPUT}"
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
