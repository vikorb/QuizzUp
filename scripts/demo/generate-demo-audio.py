#!/usr/bin/env python3
"""
Génère les extraits audio du thème de démonstration « Mélodies du domaine public ».

Pourquoi un générateur plutôt que des fichiers téléchargés ?
- Les mélodies choisies sont des œuvres du domaine public (compositeurs morts depuis plus de
  70 ans ou airs traditionnels) ;
- l'interprétation est synthétisée ici, note par note : aucun enregistrement tiers, donc aucun
  droit voisin (interprète, producteur). Les fichiers produits sont libres de droits.

Chaque extrait dure ~26 s (la mélodie est rejouée en boucle) pour couvrir les trois paliers du
blind test éclair (1 s, 5 s puis 20 s).

Usage (depuis la racine du dépôt, nécessite numpy et ffmpeg) :
    python3 scripts/demo/generate-demo-audio.py
Les MP3 sont écrits dans backoffice/backend/db/seeds/demo-media/.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 44100
TARGET_SECONDS = 26.0
OUT_DIR = Path(__file__).resolve().parents[2] / "backoffice/backend/db/seeds/demo-media"

NOTE_INDEX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note_freq(name: str) -> float:
    """'C4', 'F#4', 'Bb3' → fréquence en Hz (A4 = 440)."""
    letter, rest = name[0], name[1:]
    semitone = NOTE_INDEX[letter]
    while rest and rest[0] in "#b":
        semitone += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    midi = 12 * (int(rest) + 1) + semitone
    return 440.0 * 2 ** ((midi - 69) / 12)


def tone(freq: float, seconds: float, volume: float = 0.5) -> np.ndarray:
    """Son de type « piano électrique » : quelques harmoniques et une décroissance douce."""
    n = int(SAMPLE_RATE * seconds)
    t = np.arange(n) / SAMPLE_RATE
    wave_ = (
        np.sin(2 * np.pi * freq * t)
        + 0.45 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 3)
        + 0.2 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 5)
    )
    attack = np.minimum(1.0, t / 0.008)
    decay = np.exp(-t * 2.2)
    release = np.minimum(1.0, (seconds - t) / 0.04).clip(0, 1)
    return volume * wave_ * attack * decay * release


def render(score: list[tuple[str, float]], bpm: float, bass: list[tuple[str, float]] | None) -> np.ndarray:
    """score : [(note | 'R', durée en temps)], rejoué jusqu'à TARGET_SECONDS."""
    beat = 60.0 / bpm

    def render_line(line: list[tuple[str, float]], volume: float) -> np.ndarray:
        chunks = []
        for name, beats in line:
            seconds = beats * beat
            if name == "R":
                chunks.append(np.zeros(int(SAMPLE_RATE * seconds)))
            else:
                chunks.append(tone(note_freq(name), seconds, volume))
        return np.concatenate(chunks)

    melody = render_line(score, 0.55)
    if bass:
        accomp = render_line(bass, 0.22)
        reps = int(np.ceil(len(melody) / len(accomp)))
        melody = melody + np.tile(accomp, reps)[: len(melody)]

    target = int(SAMPLE_RATE * TARGET_SECONDS)
    reps = int(np.ceil(target / len(melody)))
    signal = np.tile(melody, reps)[:target]
    fade = int(SAMPLE_RATE * 1.0)
    signal[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(signal)) or 1.0
    return signal / peak * 0.85


def seq(text: str) -> list[tuple[str, float]]:
    """'C4:1 D4:0.5 R:1' → [('C4', 1.0), ('D4', 0.5), ('R', 1.0)]."""
    out = []
    for token in text.split():
        name, beats = token.split(":")
        out.append((name, float(beats)))
    return out


# slug, bpm, mélodie, accompagnement (facultatif). Transcriptions simplifiées (thème principal).
MELODIES: list[tuple[str, float, str, str | None]] = [
    (
        "frere-jacques",
        120,
        "C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1 E4:1 F4:1 G4:2 E4:1 F4:1 G4:2 "
        "G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 "
        "C4:1 G3:1 C4:2 C4:1 G3:1 C4:2",
        "C3:4 C3:4 C3:4 C3:4 C3:4 C3:4 C3:4 C3:4",
    ),
    (
        "au-clair-de-la-lune",
        110,
        "C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4 "
        "C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4 "
        "D4:1 D4:1 D4:1 D4:1 A3:2 A3:2 D4:1 C4:1 B3:1 A3:1 G3:4",
        None,
    ),
    (
        "ah-vous-dirai-je-maman",
        112,
        "C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 "
        "G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2",
        "C3:4 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2 C3:2 G3:2 C3:2 G3:2 C3:2 G3:2 C3:2 G3:2",
    ),
    (
        "ode-a-la-joie",
        120,
        "E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 "
        "E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2",
        "C3:4 G3:4 C3:4 G3:4 C3:4 G3:4 C3:2 G3:2 C3:4",
    ),
    (
        "lettre-a-elise",
        150,
        "E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 "
        "C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 G#4:0.5 B4:0.5 C5:1.5 E4:0.5 "
        "E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 "
        "C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 C5:0.5 B4:0.5 A4:2 R:1",
        None,
    ),
    (
        "petite-musique-de-nuit",
        132,
        "G4:1 R:0.5 D4:0.5 G4:1 R:0.5 D4:0.5 G4:0.5 D4:0.5 G4:0.5 B4:0.5 D5:2 "
        "C5:1 R:0.5 A4:0.5 C5:1 R:0.5 A4:0.5 C5:0.5 A4:0.5 F#4:0.5 A4:0.5 D4:2 R:2",
        "G2:4 G2:4 D3:4 D3:4 R:2",
    ),
    (
        "roi-de-la-montagne",
        132,
        "B3:0.5 C#4:0.5 D4:0.5 E4:0.5 F#4:0.5 D4:0.5 F#4:1 F4:0.5 C#4:0.5 F4:1 "
        "E4:0.5 C4:0.5 E4:1 B3:0.5 C#4:0.5 D4:0.5 E4:0.5 F#4:0.5 D4:0.5 F#4:0.5 B4:0.5 "
        "A4:0.5 F#4:0.5 D4:0.5 F#4:0.5 A4:2",
        "B2:1 B2:1 B2:1 B2:1 B2:1 B2:1 B2:1 B2:1 B2:1 B2:1 B2:1 B2:1",
    ),
    (
        "la-marseillaise",
        104,
        "D4:0.75 D4:0.25 D4:0.75 D4:0.25 G4:1 G4:1 A4:1 A4:1 D5:1.5 B4:0.5 "
        "G4:0.75 G4:0.25 B4:0.75 G4:0.25 E4:1 C5:2 A4:0.75 F#4:0.25 G4:2 R:2",
        "G2:2 G2:2 D3:2 G2:2 G2:2 C3:2 D3:2 G2:2 R:2",
    ),
    (
        "lac-des-cygnes",
        92,
        "F#4:3 B3:0.5 C#4:0.5 D4:0.5 E4:0.5 F#4:1.5 D4:0.5 F#4:1.5 D4:0.5 F#4:1.5 "
        "B3:0.5 D4:0.5 B3:0.5 G3:0.5 D4:0.5 B3:3 R:1",
        "B2:4 B2:4 G2:4 B2:4",
    ),
    (
        "beau-danube-bleu",
        168,
        "D4:1 D4:1 F#4:1 A4:1 R:2 A5:1 R:1 A5:1 R:2 F#5:1 R:1 F#5:1 R:2 "
        "D4:1 D4:1 F#4:1 A4:1 R:2 A5:1 R:1 A5:1 R:2 G5:1 R:1 G5:1 R:2",
        "D3:3 D3:3 D3:3 D3:3 A2:3 A2:3 A2:3 A2:3",
    ),
]


def write_wav(path: Path, signal: np.ndarray) -> None:
    data = (signal * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(data.tobytes())


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for slug, bpm, melody, bass in MELODIES:
            wav = Path(tmp) / f"{slug}.wav"
            write_wav(wav, render(seq(melody), bpm, seq(bass) if bass else None))
            mp3 = OUT_DIR / f"{slug}.mp3"
            subprocess.run(
                [
                    "ffmpeg", "-loglevel", "error", "-y", "-i", str(wav),
                    "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1",
                    "-map_metadata", "-1", "-metadata", "comment=QuizzUP demo - synthese libre de droits",
                    str(mp3),
                ],
                check=True,
            )
            print(f"{mp3.relative_to(OUT_DIR.parents[4])} ({mp3.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
