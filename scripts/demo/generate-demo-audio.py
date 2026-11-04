#!/usr/bin/env python3
"""
Génère les extraits audio des deux thèmes de démonstration :
- « Mélodies du domaine public » : 10 mélodies jouées note par note ;
- « Sons synthétiques » : 10 sons du quotidien (sirènes, morse, sonnerie…) fabriqués par calcul.

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


def _t(seconds: float) -> np.ndarray:
    return np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE


def _beep(freq: float, seconds: float, square: bool = False) -> np.ndarray:
    t = _t(seconds)
    w = np.sin(2 * np.pi * freq * t)
    if square:
        w = np.sign(w) * 0.6
    edge = np.minimum(1.0, np.minimum(t, seconds - t) / 0.005).clip(0, 1)
    return w * edge


def _silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SAMPLE_RATE * seconds))


def _bell(freq: float, seconds: float) -> np.ndarray:
    t = _t(seconds)
    partials = [(1, 1.0), (2.76, 0.5), (5.4, 0.25), (8.9, 0.12)]
    w = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t * (2 + r)) for r, a in partials)
    return w * np.minimum(1.0, t / 0.003)


def _pattern(*chunks: np.ndarray) -> np.ndarray:
    return np.concatenate(chunks)


def sfx_sirene_pompiers() -> np.ndarray:
    return _pattern(_beep(435, 0.6, square=True), _beep(580, 0.6, square=True))


def sfx_sirene_americaine() -> np.ndarray:
    t = _t(3.0)
    freq = 650 + 650 * (0.5 - 0.5 * np.cos(2 * np.pi * t / 3.0))
    return np.sin(2 * np.pi * np.cumsum(freq) / SAMPLE_RATE)


def sfx_tonalite_occupe() -> np.ndarray:
    return _pattern(_beep(440, 0.5), _silence(0.5))


def sfx_morse_sos() -> np.ndarray:
    dot, dash, gap = _beep(700, 0.1), _beep(700, 0.3), _silence(0.1)
    letter_s = _pattern(dot, gap, dot, gap, dot)
    letter_o = _pattern(dash, gap, dash, gap, dash)
    return _pattern(letter_s, _silence(0.3), letter_o, _silence(0.3), letter_s, _silence(0.9))


def sfx_reveil() -> np.ndarray:
    beeps = [c for _ in range(4) for c in (_beep(2000, 0.08, square=True), _silence(0.07))]
    return _pattern(*beeps, _silence(0.5))


def sfx_carillon() -> np.ndarray:
    return _pattern(_bell(659.3, 0.9), _bell(523.3, 1.6), _silence(1.2))


def sfx_tic_tac() -> np.ndarray:
    def click(freq: float) -> np.ndarray:
        t = _t(0.03)
        return np.sin(2 * np.pi * freq * t) * np.exp(-t * 250)
    return _pattern(click(3200), _silence(0.47), click(2400), _silence(0.47))


def sfx_telephone_ancien() -> np.ndarray:
    t = _t(1.5)
    ring = (np.sin(2 * np.pi * 1000 * t) + 0.6 * np.sin(2 * np.pi * 1400 * t)) * (
        0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 20 * t))
    )
    return _pattern(ring, _silence(2.0))


def sfx_sonar() -> np.ndarray:
    t = _t(3.0)
    ping = np.sin(2 * np.pi * 1500 * t) * np.exp(-t * 2.5) * np.minimum(1.0, t / 0.01)
    echo = np.zeros_like(ping)
    delay = int(SAMPLE_RATE * 0.9)
    echo[delay:] = 0.3 * ping[:-delay]
    return ping + echo


def sfx_battements_coeur() -> np.ndarray:
    def thump(freq: float, amp: float) -> np.ndarray:
        t = _t(0.18)
        return amp * np.sin(2 * np.pi * freq * t) * np.exp(-t * 22)
    return _pattern(thump(60, 1.0), _silence(0.08), thump(50, 0.7), _silence(0.55))


SOUNDS = {
    "sirene-pompiers": sfx_sirene_pompiers,
    "sirene-americaine": sfx_sirene_americaine,
    "tonalite-occupe": sfx_tonalite_occupe,
    "morse-sos": sfx_morse_sos,
    "reveil": sfx_reveil,
    "carillon-porte": sfx_carillon,
    "tic-tac": sfx_tic_tac,
    "telephone-ancien": sfx_telephone_ancien,
    "sonar": sfx_sonar,
    "battements-coeur": sfx_battements_coeur,
}


def loop_to_target(pattern: np.ndarray) -> np.ndarray:
    target = int(SAMPLE_RATE * TARGET_SECONDS)
    signal = np.tile(pattern, int(np.ceil(target / len(pattern))))[:target]
    fade = int(SAMPLE_RATE * 1.0)
    signal[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(signal)) or 1.0
    return signal / peak * 0.8


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
        jobs = [
            (slug, render(seq(melody), bpm, seq(bass) if bass else None))
            for slug, bpm, melody, bass in MELODIES
        ] + [(slug, loop_to_target(build())) for slug, build in SOUNDS.items()]
        for slug, signal in jobs:
            wav = Path(tmp) / f"{slug}.wav"
            write_wav(wav, signal)
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
