#!/usr/bin/env python3
"""Generate Sonata's original demo catalogue: covers, audio and manifest.

Usage:
    python3 scripts/generate-demo-assets.py

Options:
    --only id[,id]   Generate only the named token ids.
    --skip-covers    Leave the existing covers untouched.
    --skip-audio     Leave the existing audio untouched.
    --force          Regenerate files even when they already exist.

Everything is generated locally and deterministically from fixed seeds; the
script never downloads anything and produces no copyrighted material. Covers
are 1200x1200 WebP, audio is 44.1 kHz stereo AAC (.m4a) encoded with the macOS
`afconvert` tool, and `manifest.json` is written from the real file durations.

Intermediate WAV files are written to a temporary directory and removed.
"""

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# --------------------------------------------------------------------------
# Paths and catalogue metadata
# --------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "apps" / "web" / "public" / "demo"
COVERS_DIR = DEMO_DIR / "covers"
AUDIO_DIR = DEMO_DIR / "audio"
MANIFEST = DEMO_DIR / "manifest.json"

W = 1200
SR = 44100

ARTISTS = {
    "nadia": {
        "artistName": "Nadia Vale",
        "artistHandle": "@nadia",
        "artistAccountId": "nadia-sonata.testnet",
    },
    "kofi": {
        "artistName": "Kofi Mensah",
        "artistHandle": "@kofi",
        "artistAccountId": "kofi-sonata.testnet",
    },
    "lena": {
        "artistName": "Lena Ortiz",
        "artistHandle": "@lena",
        "artistAccountId": "lena-sonata.testnet",
    },
}

TRACKS = [
    {
        "tokenId": "midnight-drive",
        "title": "Midnight Drive",
        "artist": "nadia",
        "genre": "Synthwave",
        "releaseYear": 2026,
        "description": "A wide-open synthwave cruise with an amber horizon and nowhere in particular to be.",
        "cover": "midnight_drive",
        "audio": "synthwave",
        "bpm": 100,
        "bars": 36,
        "key": 45,  # A minor-ish
        "mode": "minor",
    },
    {
        "tokenId": "paper-moons",
        "title": "Paper Moons",
        "artist": "kofi",
        "genre": "Ambient",
        "releaseYear": 2025,
        "description": "Two quiet moons over warm paper, made for slow mornings and half-finished thoughts.",
        "cover": "paper_moons",
        "audio": "ambient_paper",
        "bpm": 62,
        "bars": 20,
        "key": 50,  # D
        "mode": "major",
    },
    {
        "tokenId": "velvet-static",
        "title": "Velvet Static",
        "artist": "lena",
        "genre": "Dream pop",
        "releaseYear": 2025,
        "description": "A dream-pop haze that hums like a radio left on in another room.",
        "cover": "velvet_static",
        "audio": "dream_pop",
        "bpm": 84,
        "bars": 30,
        "key": 48,  # C
        "mode": "major",
    },
    {
        "tokenId": "slow-arc",
        "title": "Slow Arc",
        "artist": "nadia",
        "genre": "Electronic",
        "releaseYear": 2026,
        "description": "One patient arc of tone, bending slowly toward the light.",
        "cover": "slow_arc",
        "audio": "electronic_arc",
        "bpm": 96,
        "bars": 32,
        "key": 43,  # G
        "mode": "minor",
    },
    {
        "tokenId": "harbor-lights",
        "title": "Harbor Lights",
        "artist": "kofi",
        "genre": "Jazz",
        "releaseYear": 2024,
        "description": "Late-night jazz for a harbor town, all brushed drums and small golden lights.",
        "cover": "harbor_lights",
        "audio": "jazz",
        "bpm": 76,
        "bars": 24,
        "key": 46,  # Bb
        "mode": "major",
    },
    {
        "tokenId": "glass-hours",
        "title": "Glass Hours",
        "artist": "lena",
        "genre": "Neo-soul",
        "releaseYear": 2025,
        "description": "Honeyed neo-soul that moves like late sun through a tall window.",
        "cover": "glass_hours",
        "audio": "neo_soul",
        "bpm": 78,
        "bars": 24,
        "key": 51,  # Eb
        "mode": "major",
    },
    {
        "tokenId": "northbound",
        "title": "Northbound",
        "artist": "nadia",
        "genre": "Indie",
        "releaseYear": 2026,
        "description": "Indie guitar and a pale road north, with the windows down.",
        "cover": "northbound",
        "audio": "indie",
        "bpm": 92,
        "bars": 32,
        "key": 52,  # E
        "mode": "major",
    },
    {
        "tokenId": "after-rain",
        "title": "After Rain",
        "artist": "kofi",
        "genre": "Lo-fi",
        "releaseYear": 2025,
        "description": "Lo-fi keys and a city street after the rain, still glowing at the edges.",
        "cover": "after_rain",
        "audio": "lofi",
        "bpm": 74,
        "bars": 24,
        "key": 45,  # A
        "mode": "minor",
    },
    {
        "tokenId": "copper-sky",
        "title": "Copper Sky",
        "artist": "lena",
        "genre": "Folk",
        "releaseYear": 2024,
        "description": "Warm folk picking under a wide copper sky, unhurried and close.",
        "cover": "copper_sky",
        "audio": "folk",
        "bpm": 88,
        "bars": 36,
        "key": 50,  # D
        "mode": "major",
    },
    {
        "tokenId": "low-tide",
        "title": "Low Tide",
        "artist": "nadia",
        "genre": "Ambient",
        "releaseYear": 2026,
        "description": "A tidal pool at dusk, breathing in slow, quiet intervals.",
        "cover": "low_tide",
        "audio": "ambient_tide",
        "bpm": 60,
        "bars": 20,
        "key": 48,  # C
        "mode": "major",
    },
    {
        "tokenId": "signal-fire",
        "title": "Signal Fire",
        "artist": "kofi",
        "genre": "Electronic",
        "releaseYear": 2025,
        "description": "A single ember of electronic pulse, sending one warm signal into the dark.",
        "cover": "signal_fire",
        "audio": "electronic_fire",
        "bpm": 90,
        "bars": 32,
        "key": 41,  # F
        "mode": "minor",
    },
    {
        "tokenId": "quiet-machines",
        "title": "Quiet Machines",
        "artist": "lena",
        "genre": "Industrial",
        "releaseYear": 2026,
        "description": "Industrial rhythm worn soft at the edges, like a workshop after hours.",
        "cover": "quiet_machines",
        "audio": "industrial",
        "bpm": 84,
        "bars": 30,
        "key": 38,  # D
        "mode": "minor",
    },
]


# --------------------------------------------------------------------------
# Small colour / array helpers
# --------------------------------------------------------------------------

def rng_for(name):
    seed = int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:16], 16)
    return np.random.default_rng(seed)


def rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def mix_colour(a, b, t):
    return np.array(a, dtype=np.float32) * (1.0 - t) + np.array(b, dtype=np.float32) * t


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def vgrad(stops, w=W, h=W):
    """Vertical multi-stop gradient."""
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)
    positions = [s[0] for s in stops]
    cols = [rgb(s[1]) for s in stops]
    out = np.empty((h, w, 3), dtype=np.float32)
    for channel in range(3):
        out[:, :, channel] = np.interp(
            ys, positions, [c[channel] for c in cols]
        )[:, None]
    return out


def vgrad_region(top, bottom, y0, y1, w=W, h=W):
    """Vertical gradient for a sub-region, painted across the whole canvas."""
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)
    t = np.clip((ys - y0) / (y1 - y0), 0.0, 1.0)[:, None, None]
    a = rgb(top)[None, None, :]
    b = rgb(bottom)[None, None, :]
    return np.broadcast_to(a * (1.0 - t) + b * t, (h, w, 3)).astype(np.float32).copy()


def circle_mask(cx, cy, r, feather=0.008, w=W, h=W):
    yy = (np.arange(h, dtype=np.float32)[:, None] / h - cy) ** 2
    xx = (np.arange(w, dtype=np.float32)[None, :] / w - cx) ** 2
    d = np.sqrt(xx + yy) / r
    return np.clip((1.0 - d) / feather, 0.0, 1.0).astype(np.float32)


def ellipse_mask(cx, cy, rx, ry, feather=0.02, w=W, h=W):
    yy = (np.arange(h, dtype=np.float32)[:, None] / h - cy) / ry
    xx = (np.arange(w, dtype=np.float32)[None, :] / w - cx) / rx
    d = np.sqrt(xx * xx + yy * yy)
    return np.clip((1.0 - d) / feather, 0.0, 1.0).astype(np.float32)


def radial(cx, cy, rx, ry, power=2.0, w=W, h=W):
    yy = (np.arange(h, dtype=np.float32)[:, None] / h - cy) / ry
    xx = (np.arange(w, dtype=np.float32)[None, :] / w - cx) / rx
    d = np.clip(np.sqrt(xx * xx + yy * yy), 0.0, 1.0)
    return ((1.0 - d) ** power).astype(np.float32)


def blur(mask, radius):
    if radius <= 0:
        return mask
    img = Image.fromarray((np.clip(mask, 0.0, 1.0) * 255.0).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(img, dtype=np.float32) / 255.0


def blend(base, colour, mask):
    m = mask[:, :, None]
    if isinstance(colour, str):
        colour = rgb(colour)
    return base * (1.0 - m) + np.asarray(colour, dtype=np.float32) * m


def screen(base, colour, mask):
    m = mask[:, :, None]
    if isinstance(colour, str):
        colour = rgb(colour)
    light = np.asarray(colour, dtype=np.float32)[None, None, :] * m
    return 1.0 - (1.0 - base) * (1.0 - light)


def multiply(base, colour, mask):
    m = mask[:, :, None]
    if isinstance(colour, str):
        colour = rgb(colour)
    factor = 1.0 - m + np.asarray(colour, dtype=np.float32)[None, None, :] * m
    return base * factor


def upnoise(rng, size, out_size=W):
    small = rng.random((size, size)).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8))
    img = img.resize((out_size, out_size), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def mask_from_draw(fn, supersample=2, blur_radius=0.0, w=W, h=W):
    size = (w * supersample, h * supersample)
    img = Image.new("L", size, 0)
    draw = ImageDraw.Draw(img)
    fn(draw, supersample)
    if supersample != 1:
        img = img.resize((w, h), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    if blur_radius:
        arr = blur(arr, blur_radius)
    return arr


def ridge_mask(rng, base_y, amplitude, points=7, blur_radius=1.4, w=W, h=W):
    vals = rng.normal(0.0, 1.0, points).astype(np.float32)
    kernel = np.ones(3, dtype=np.float32) / 3.0
    vals = np.convolve(np.pad(vals, 1, mode="edge"), kernel, mode="valid")
    xs = np.linspace(0.0, 1.0, points)
    out_x = np.linspace(0.0, 1.0, w)
    line = np.interp(out_x, xs, vals)
    line = line - line.mean()
    line = np.convolve(np.pad(line, 9, mode="edge"), np.ones(19, np.float32) / 19.0, mode="valid")
    line = base_y + amplitude * line
    yy = np.arange(h, dtype=np.float32)[:, None] / h
    mask = (yy >= line[None, :]).astype(np.float32)
    if blur_radius:
        mask = blur(mask, blur_radius)
    return mask


def grain(arr, rng, sigma=0.016, chroma=0.25):
    h, w = arr.shape[:2]
    fine = rng.standard_normal((h, w)).astype(np.float32)
    coarse_small = rng.standard_normal((h // 3 + 1, w // 3 + 1)).astype(np.float32)
    coarse = np.asarray(
        Image.fromarray(((coarse_small - coarse_small.min()) /
                         (coarse_small.max() - coarse_small.min() + 1e-6) * 255.0).astype(np.uint8))
        .resize((w, h), Image.BICUBIC),
        dtype=np.float32,
    ) / 255.0
    coarse = (coarse - coarse.mean()) / (coarse.std() + 1e-6)
    lum = sigma * (0.55 * fine + 0.45 * coarse)
    arr = arr + lum[:, :, None]
    if chroma:
        arr = arr + sigma * chroma * rng.standard_normal((h, w, 3)).astype(np.float32)
    return arr


def vignette(arr, strength=0.30, power=2.1):
    h, w = arr.shape[:2]
    yy = np.linspace(-1.0, 1.0, h, dtype=np.float32)[:, None]
    xx = np.linspace(-1.0, 1.0, w, dtype=np.float32)[None, :]
    d = np.clip(np.sqrt(xx * xx + yy * yy) / 1.4142, 0.0, 1.0)
    falloff = 1.0 - strength * (d ** power)
    return arr * falloff[:, :, None]


def finish(arr, rng, vignette_strength=0.30, grain_sigma=0.016, desaturate=0.05):
    arr = np.clip(arr, 0.0, 1.0)
    arr = grain(arr, rng, sigma=grain_sigma)
    arr = vignette(arr, vignette_strength)
    lum = (arr * np.array([0.299, 0.587, 0.114], dtype=np.float32)).sum(axis=2, keepdims=True)
    arr = arr * (1.0 - desaturate) + lum * desaturate
    # Gentle warm lift in the shadows.
    arr = arr * 0.985 + np.array([0.014, 0.011, 0.007], dtype=np.float32)
    return np.clip(arr, 0.0, 1.0)


def add_rim(img):
    """Subtle 1px warm inner rim, as the design spec asks for covers."""
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rounded_rectangle(
        (3, 3, W - 4, W - 4),
        radius=4,
        outline=(255, 244, 220, 18),
        width=1,
    )
    draw.rounded_rectangle(
        (0, 0, W - 1, W - 1),
        radius=2,
        outline=(0, 0, 0, 28),
        width=1,
    )


# --------------------------------------------------------------------------
# Cover renderers - one per track, same editorial language.
# --------------------------------------------------------------------------

def cover_midnight_drive(rng):
    arr = vgrad([
        (0.00, "#040B14"),
        (0.22, "#0A1A2A"),
        (0.42, "#243247"),
        (0.54, "#6A4149"),
        (0.605, "#C46A48"),
        (0.650, "#E39A58"),
        (0.664, "#08121E"),
        (0.80, "#071019"),
        (1.00, "#03070C"),
    ])
    arr = screen(arr, "#E9A15C", radial(0.5, 0.585, 0.62, 0.42, 2.2) * 0.50)

    # Stars, kept sparse and dim.
    star = mask_from_draw(lambda d, s: [
        d.ellipse(
            ((x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s), fill=255
        ) for x, y, r in [
            (rng.uniform(0.05, 0.95), rng.uniform(0.02, 0.34), rng.uniform(0.7, 1.7))
            for _ in range(34)
        ]
    ], supersample=2, blur_radius=0.7)
    arr = screen(arr, "#D9C6A8", star * 0.30)

    cy, cr = 0.575, 0.205
    sun = circle_mask(0.5, cy, cr, feather=0.006)
    sun_colour = vgrad_region("#F7DFAE", "#C34E3E", cy - cr, cy + cr)
    arr = blend(arr, sun_colour, sun)

    # Horizontal slats cut through the lower half of the sun.
    slat = np.zeros((W, W), dtype=np.float32)
    for i in range(7):
        y0 = cy + 0.012 + i * 0.026
        thickness = 0.005 + i * 0.0011
        slat += mask_from_draw(
            lambda d, s, y0=y0, t=thickness: d.rectangle(
                (0, int((y0 - t / 2) * W * s), W * s, int((y0 + t / 2) * W * s)), fill=255
            ),
            supersample=1,
            blur_radius=0.6,
        )
    arr = blend(arr, "#08121E", np.clip(slat, 0.0, 1.0) * sun * 0.94)

    # Distant low ridge.
    ridge = ridge_mask(rng, 0.664, 0.016, points=6, blur_radius=1.2)
    arr = blend(arr, "#071019", ridge * 0.92)

    # Warm reflection on the water.
    reflection = np.zeros((W, W), dtype=np.float32)
    for i in range(13):
        x = 0.5 + rng.normal(0.0, 0.085)
        half = rng.uniform(0.004, 0.022)
        y0 = 0.667 + rng.uniform(0.0, 0.05)
        y1 = 0.70 + rng.uniform(0.02, 0.20)
        reflection += mask_from_draw(
            lambda d, s, x=x, half=half, y0=y0, y1=y1: d.rectangle(
                ((x - half) * W * s, y0 * W * s, (x + half) * W * s, y1 * W * s), fill=255
            ),
            supersample=1,
            blur_radius=5.0,
        ) * np.linspace(1.0, 0.0, W, dtype=np.float32)[:, None]
    arr = screen(arr, "#E8A15E", np.clip(reflection, 0.0, 1.0) * 0.34)

    # Thin warm horizon line.
    horizon = mask_from_draw(
        lambda d, s: d.rectangle((0, 0.6625 * W * s, W * s, 0.6655 * W * s), fill=255),
        supersample=1,
        blur_radius=1.0,
    )
    arr = screen(arr, "#F3C583", horizon * 0.28)

    return finish(arr, rng, vignette_strength=0.36, grain_sigma=0.014)


def cover_paper_moons(rng):
    arr = vgrad([
        (0.00, "#F1E9D9"),
        (0.45, "#E8DDC9"),
        (0.78, "#DCCFB8"),
        (1.00, "#CDBD9F"),
    ])
    mottle = upnoise(rng, 7) * 0.045 + upnoise(rng, 23) * 0.025
    arr = arr * (0.965 + mottle)[:, :, None]

    # Soft shadow beneath the large moon.
    shadow = circle_mask(0.435, 0.445, 0.283, feather=0.09)
    arr = multiply(arr, "#9A8F78", shadow * 0.28)

    big = circle_mask(0.405, 0.405, 0.275, feather=0.0035)
    big_colour = vgrad_region("#FCF8EE", "#E3D7C1", 0.13, 0.68)
    arr = blend(arr, big_colour, big)

    # Faint mare suggestion, very soft.
    crater = circle_mask(0.345, 0.350, 0.060, feather=0.55)
    arr = multiply(arr, "#DCCFB8", blur(crater, 16.0) * 0.22)
    crater2 = circle_mask(0.452, 0.470, 0.035, feather=0.6)
    arr = multiply(arr, "#DCCFB8", blur(crater2, 12.0) * 0.16)

    small = circle_mask(0.655, 0.585, 0.165, feather=0.006)
    arr = blend(arr, "#B4C0C2", small * 0.55)
    overlap_rim = np.clip(circle_mask(0.655, 0.585, 0.165, feather=0.006) -
                          circle_mask(0.655, 0.585, 0.156, feather=0.006), 0.0, 1.0)
    arr = screen(arr, "#F4EFE2", overlap_rim * 0.22)

    horizon = mask_from_draw(
        lambda d, s: d.rectangle((0, 0.782 * W * s, W * s, 0.784 * W * s), fill=255),
        supersample=1,
        blur_radius=2.2,
    )
    arr = blend(arr, "#8B8572", horizon * 0.12)

    # Paper fibres and a few dust specks.
    arr = arr * (0.985 + upnoise(rng, 90) * 0.03)[:, :, None]
    return finish(arr, rng, vignette_strength=0.22, grain_sigma=0.022, desaturate=0.04)


def cover_velvet_static(rng):
    arr = vgrad([
        (0.00, "#1D0F16"),
        (0.28, "#3A1D2B"),
        (0.55, "#5A3143"),
        (0.78, "#6E3F50"),
        (1.00, "#23121B"),
    ])
    arr = screen(arr, "#C77E8A", radial(0.66, 0.34, 0.48, 0.58, 2.2) * 0.36)

    # Velvet folds: alternating soft light and shadow bands.
    for i in range(9):
        x = 0.06 + i * 0.11
        width = 0.020 + 0.010 * (i % 3)
        fold = blur(mask_from_draw(
            lambda d, s, x=x, width=width: d.rectangle(
                ((x - width) * W * s, 0, (x + width) * W * s, W * s), fill=255
            ),
            supersample=1,
        ), 16.0 + 6.0 * (i % 2))
        if i % 2 == 0:
            arr = screen(arr, "#D89BA6", fold * 0.18)
        else:
            arr = multiply(arr, "#2A1520", fold * 0.30)

    # A heavy drape falling from the upper left, cutting the frame diagonally.
    drape = mask_from_draw(
        lambda d, s: d.polygon(
            [(-0.10 * W * s, -0.10 * W * s), (0.34 * W * s, -0.10 * W * s),
             (0.56 * W * s, 1.10 * W * s), (-0.10 * W * s, 1.10 * W * s)],
            fill=255,
        ),
        supersample=1,
        blur_radius=34.0,
    )
    arr = multiply(arr, "#170C12", drape * 0.62)

    # The light leak: a thin warm seam through the fabric.
    seam = blur(mask_from_draw(
        lambda d, s: d.rectangle(
            (0.635 * W * s, -0.05 * W * s, 0.652 * W * s, 1.05 * W * s), fill=255
        ),
        supersample=2,
    ), 22.0)
    arr = screen(arr, "#F5D9C4", seam * 0.45)
    core = blur(mask_from_draw(
        lambda d, s: d.rectangle(
            (0.640 * W * s, 0.04 * W * s, 0.647 * W * s, 0.96 * W * s), fill=255
        ),
        supersample=2,
    ), 9.0)
    arr = screen(arr, "#FFF4E8", core * 0.55)

    # A diffuse bloom where the light hits the velvet.
    bloom = radial(0.665, 0.40, 0.26, 0.34, 2.4)
    arr = screen(arr, "#E8B9B3", bloom * 0.26)

    # Static, heavier than the other covers.
    static = rng.random((W, W)).astype(np.float32)
    arr = arr + (static - static.mean())[:, :, None] * 0.034
    return finish(arr, rng, vignette_strength=0.42, grain_sigma=0.024, desaturate=0.03)


def cover_slow_arc(rng):
    arr = vgrad([
        (0.00, "#0B0D10"),
        (0.48, "#15181C"),
        (0.80, "#1E2126"),
        (1.00, "#25282D"),
    ])
    arr = screen(arr, "#D9A45B", radial(0.86, 0.08, 0.80, 0.70, 2.2) * 0.10)
    arr = screen(arr, "#E8D3AE", radial(0.50, 0.50, 0.55, 0.42, 2.6) * 0.035)

    # A single slow arc, drawn as a warm gradient line.
    def bezier(p0, p1, p2, n=220):
        ts = np.linspace(0.0, 1.0, n)[:, None]
        p0, p1, p2 = map(lambda p: np.array(p, dtype=np.float32), (p0, p1, p2))
        pts = (1 - ts) ** 2 * p0 + 2 * (1 - ts) * ts * p1 + ts ** 2 * p2
        return [(float(x), float(y)) for x, y in pts]

    points = bezier((0.06, 0.90), (0.56, 1.02), (0.94, 0.14))
    arc_img = Image.new("RGBA", (W * 2, W * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(arc_img)
    for i in range(len(points) - 1):
        t = i / max(1, len(points) - 2)
        colour = tuple(int(v * 255) for v in mix_colour(rgb("#C68A46"), rgb("#F1D6A4"), t))
        draw.line(
            [points[i][0] * W * 2, points[i][1] * W * 2,
             points[i + 1][0] * W * 2, points[i + 1][1] * W * 2],
            fill=colour + (255,),
            width=9,
        )
    arc_img = arc_img.resize((W, W), Image.LANCZOS)
    arc = np.asarray(arc_img, dtype=np.float32) / 255.0
    arc_mask = arc[:, :, 3]
    arc_rgb = arc[:, :, :3]

    glow = blur(arc_mask, 22.0)
    arr = screen(arr, "#D9A45B", glow * 0.30)
    arr = blend(arr, arc_rgb, arc_mask)

    # The little moon the arc reaches for.
    dest = circle_mask(0.94, 0.14, 0.026, feather=0.35)
    arr = screen(arr, "#F4DFB6", dest * 0.75)
    arr = blend(arr, "#F6E5C4", circle_mask(0.94, 0.14, 0.012, feather=0.5))

    hairline = mask_from_draw(
        lambda d, s: d.rectangle((0, 0.745 * W * s, W * s, 0.7462 * W * s), fill=255),
        supersample=1,
        blur_radius=1.4,
    )
    arr = screen(arr, "#D9C7A6", hairline * 0.10)

    return finish(arr, rng, vignette_strength=0.40, grain_sigma=0.013, desaturate=0.04)


def cover_harbor_lights(rng):
    arr = vgrad([
        (0.00, "#030D12"),
        (0.30, "#082027"),
        (0.50, "#0D3037"),
        (0.555, "#16474B"),
        (0.565, "#0A2228"),
        (0.78, "#071A20"),
        (1.00, "#031014"),
    ])
    arr = screen(arr, "#3E7C7C", radial(0.5, 0.55, 0.85, 0.16, 2.0) * 0.25)

    moon = circle_mask(0.735, 0.215, 0.043, feather=0.10)
    arr = screen(arr, "#E8DFC2", moon * 0.55)
    arr = blend(arr, "#EFE6CB", circle_mask(0.735, 0.215, 0.026, feather=0.25) * 0.8)
    arr = screen(arr, "#E8DFC2", radial(0.735, 0.215, 0.20, 0.20, 2.4) * 0.14)

    # A row of small harbor lights, each with a soft reflection.
    dots = mask_from_draw(lambda d, s: [
        d.ellipse(
            ((x - r) * W * s, (y - r) * W * s, (x + r) * W * s, (y + r) * W * s), fill=255
        ) for x, y, r in [
            (rng.uniform(0.04, 0.96), 0.548 + rng.normal(0.0, 0.006),
             rng.uniform(0.0015, 0.0048))
            for _ in range(34)
        ]
    ], supersample=2, blur_radius=0.6)
    arr = screen(arr, "#F2BC70", dots * 0.95)

    refl = np.zeros((W, W), dtype=np.float32)
    for _ in range(26):
        x = rng.uniform(0.04, 0.96)
        width = rng.uniform(0.002, 0.009)
        length = rng.uniform(0.02, 0.17)
        refl += mask_from_draw(
            lambda d, s, x=x, width=width, length=length: d.rectangle(
                ((x - width) * W * s, 0.556 * W * s,
                 (x + width) * W * s, (0.556 + length) * W * s), fill=255
            ),
            supersample=1,
            blur_radius=3.5,
        ) * np.linspace(1.0, 0.0, W, dtype=np.float32)[:, None]
    arr = screen(arr, "#E0A45F", np.clip(refl, 0.0, 1.0) * 0.26)

    # Distant breakwater.
    breakwater = mask_from_draw(
        lambda d, s: d.rectangle((0, 0.552 * W * s, 0.72 * W * s, 0.559 * W * s), fill=255),
        supersample=1,
        blur_radius=1.4,
    )
    arr = blend(arr, "#04171C", breakwater * 0.85)

    return finish(arr, rng, vignette_strength=0.42, grain_sigma=0.015, desaturate=0.03)


def cover_glass_hours(rng):
    arr = vgrad([
        (0.00, "#F6DFB4"),
        (0.30, "#EFC98E"),
        (0.62, "#DE9E60"),
        (0.85, "#C0724A"),
        (1.00, "#9A5138"),
    ])
    arr = screen(arr, "#FFF0CE", radial(0.72, 0.20, 0.70, 0.62, 2.0) * 0.42)
    arr = screen(arr, "#FFF7E2", radial(0.30, 0.72, 0.50, 0.50, 2.4) * 0.18)

    panes = [
        (((0.20, 0.24), (0.53, 0.19), (0.56, 0.60), (0.23, 0.65)), "#FBEAC8", 0.34),
        (((0.40, 0.32), (0.73, 0.26), (0.75, 0.71), (0.42, 0.78)), "#F7D79E", 0.30),
        (((0.29, 0.50), (0.62, 0.44), (0.64, 0.84), (0.31, 0.90)), "#FFE9BE", 0.28),
    ]
    shadows = np.zeros((W, W), dtype=np.float32)
    for pts, colour, alpha in panes:
        mask = mask_from_draw(
            lambda d, s, pts=pts: d.polygon([(x * W * s, y * W * s) for x, y in pts], fill=255),
            supersample=2,
            blur_radius=0.8,
        )
        shadows += mask
        arr = blend(arr, colour, mask * alpha)
    arr = multiply(arr, "#8A4C34", blur(np.clip(shadows, 0.0, 1.0), 18.0) * 0.16)

    # Bright glass edges and a single refraction stripe.
    for pts, colour, alpha in panes:
        edge = mask_from_draw(
            lambda d, s, pts=pts: d.line(
                [(x * W * s, y * W * s) for x, y in pts] + [(pts[0][0] * W * s, pts[0][1] * W * s)],
                fill=255,
                width=3,
                joint="curve",
            ),
            supersample=2,
            blur_radius=0.5,
        )
        arr = screen(arr, "#FFF6DF", edge * 0.60)

    stripe = mask_from_draw(
        lambda d, s: d.polygon(
            [(0.60 * W * s, 0.0), (0.68 * W * s, 0.0),
             (0.50 * W * s, W * s), (0.42 * W * s, W * s)], fill=255
        ),
        supersample=1,
        blur_radius=24.0,
    )
    arr = screen(arr, "#FFF3D2", stripe * 0.22)

    # A soft caustic pooling at the lower left.
    caustic = radial(0.22, 0.86, 0.30, 0.18, 2.0)
    arr = screen(arr, "#FFE7BC", caustic * 0.20)
    arr = multiply(arr, "#8A4C34", radial(0.92, 0.92, 0.45, 0.40, 1.8) * 0.14)

    return finish(arr, rng, vignette_strength=0.31, grain_sigma=0.014, desaturate=0.06)


def cover_northbound(rng):
    arr = vgrad([
        (0.00, "#E9E2D0"),
        (0.32, "#DED9C4"),
        (0.52, "#D0CFB6"),
        (0.60, "#BFC3A6"),
        (0.66, "#AAB397"),
        (0.70, "#7D8C73"),
        (1.00, "#2A3B31"),
    ])
    arr = screen(arr, "#F4D79C", radial(0.665, 0.475, 0.38, 0.36, 2.0) * 0.42)
    sun = circle_mask(0.665, 0.475, 0.090, feather=0.16)
    sun_colour = vgrad_region("#FBEDC9", "#F2CF8E", 0.385, 0.565)
    arr = blend(arr, sun_colour, sun * 0.90)

    layers = [
        (0.535, 0.030, "#AAB59B", 0.85),
        (0.615, 0.045, "#7A8C73", 0.92),
        (0.690, 0.060, "#4A5E4C", 0.96),
        (0.775, 0.075, "#2D4036", 0.98),
    ]
    for base, amplitude, colour, opacity in layers:
        ridge = ridge_mask(rng, base, amplitude, points=6, blur_radius=1.1)
        haze = blur(ridge, 8.0) - ridge
        arr = screen(arr, "#E6E3CE", np.clip(haze, 0.0, 1.0) * 0.18)
        arr = blend(arr, colour, ridge * opacity)

    # Foreground shade first, so the road stays continuous over it.
    fore = np.clip((np.arange(W, dtype=np.float32)[:, None] / W - 0.82) / 0.18, 0.0, 1.0)
    arr = blend(arr, "#1E2E27", fore * 0.48)

    # A pale road unwinding north.
    road_pts = [(0.47, 1.03), (0.455, 0.90), (0.50, 0.805), (0.535, 0.735), (0.55, 0.685)]
    road = np.zeros((W, W), dtype=np.float32)
    for i in range(len(road_pts) - 1):
        width = 48 - i * 8
        road += mask_from_draw(
            lambda d, s, a=road_pts[i], b=road_pts[i + 1], width=width: d.line(
                [(a[0] * W * s, a[1] * W * s), (b[0] * W * s, b[1] * W * s)],
                fill=255,
                width=width * s,
            ),
            supersample=1,
            blur_radius=2.5,
        )
    road = np.clip(road, 0.0, 1.0)
    arr = blend(arr, "#E4D9BE", road * 0.48)
    arr = screen(arr, "#F2E7CB", blur(road, 12.0) * 0.14)

    return finish(arr, rng, vignette_strength=0.24, grain_sigma=0.017, desaturate=0.06)


def cover_after_rain(rng):
    arr = vgrad([
        (0.00, "#0A131B"),
        (0.30, "#142530"),
        (0.52, "#2A414C"),
        (0.66, "#46606A"),
        (0.70, "#233843"),
        (0.74, "#0E1B23"),
        (1.00, "#070E14"),
    ])
    arr = screen(arr, "#C9A46A", radial(0.28, 0.58, 0.52, 0.18, 2.0) * 0.18)

    # Back skyline.
    back = mask_from_draw(lambda d, s: [
        d.rectangle((x * W * s, (0.74 - h) * W * s, (x + w) * W * s, 0.745 * W * s), fill=255)
        for x, w, h in [
            (0.02, 0.10, 0.20), (0.15, 0.08, 0.26), (0.27, 0.12, 0.17), (0.43, 0.09, 0.24),
            (0.56, 0.13, 0.19), (0.72, 0.08, 0.28), (0.82, 0.15, 0.22),
        ]
    ], supersample=2, blur_radius=1.0)
    arr = blend(arr, "#13242E", back * 0.85)

    # Front skyline, darker and closer.
    front = mask_from_draw(lambda d, s: [
        d.rectangle((x * W * s, (0.775 - h) * W * s, (x + w) * W * s, 0.79 * W * s), fill=255)
        for x, w, h in [
            (0.00, 0.14, 0.24), (0.13, 0.09, 0.31), (0.24, 0.15, 0.20), (0.42, 0.11, 0.34),
            (0.55, 0.16, 0.23), (0.73, 0.10, 0.30), (0.85, 0.15, 0.25),
        ]
    ], supersample=2, blur_radius=0.8)
    arr = blend(arr, "#0A151D", front * 0.94)

    # Warm windows, kept sparse enough to read as a skyline.
    windows = mask_from_draw(lambda d, s: [
        d.rectangle((x * W * s, y * W * s, (x + 0.007) * W * s, (y + 0.012) * W * s), fill=255)
        for x, y in [
            (rng.uniform(0.02, 0.95), rng.uniform(0.53, 0.76)) for _ in range(88)
        ]
    ], supersample=2, blur_radius=0.4)
    arr = screen(arr, "#E9B36C", windows * 0.50)

    # One shopfront glowing at street level.
    shop = mask_from_draw(
        lambda d, s: d.rectangle(
            (0.055 * W * s, 0.705 * W * s, 0.115 * W * s, 0.742 * W * s), fill=255
        ),
        supersample=2,
        blur_radius=2.0,
    )
    arr = screen(arr, "#E8A75E", shop * 0.42)
    arr = screen(arr, "#E8A75E", blur(shop, 22.0) * 0.22)

    # Wet street reflection.
    street = np.clip((np.arange(W, dtype=np.float32)[:, None] / W - 0.79) / 0.21, 0.0, 1.0)
    arr = blend(arr, "#060E14", street * 0.45)
    reflection = blur(street * (arr[:, :, 1] * 0.35), 9.0)
    arr = screen(arr, "#C99A5E", reflection * 0.25)

    # Rain streaks, barely there.
    rain = mask_from_draw(lambda d, s: [
        d.line(
            [(rng.uniform(-0.05, 1.05) * W * s, rng.uniform(-0.05, 0.9) * W * s),
             ((x + 0.014) * W * s, (y + 0.09) * W * s)],
            fill=255,
            width=int(rng.uniform(0.5, 1.2) * s + 1),
        )
        for x, y in [(rng.uniform(0, 1), rng.uniform(0, 0.85)) for _ in range(52)]
    ], supersample=1, blur_radius=1.1)
    arr = screen(arr, "#AFC5CC", rain * 0.045)

    # Street lamp glow.
    arr = screen(arr, "#EAB268", radial(0.18, 0.755, 0.18, 0.12, 2.0) * 0.22)

    return finish(arr, rng, vignette_strength=0.36, grain_sigma=0.018, desaturate=0.04)


def cover_copper_sky(rng):
    arr = vgrad([
        (0.00, "#331C1C"),
        (0.18, "#5E3028"),
        (0.36, "#8F4431"),
        (0.52, "#C26A40"),
        (0.61, "#DE8B54"),
        (0.655, "#F0BF82"),
        (0.675, "#6B3D2B"),
        (0.80, "#46281E"),
        (1.00, "#251511"),
    ])
    arr = screen(arr, "#F0C98A", radial(0.46, 0.60, 0.50, 0.38, 2.0) * 0.42)
    sun = circle_mask(0.46, 0.595, 0.175, feather=0.012)
    sun_colour = vgrad_region("#FBE6BE", "#E2955C", 0.42, 0.77)
    arr = blend(arr, sun_colour, sun * 0.95)

    # Haze across the horizon.
    haze = mask_from_draw(
        lambda d, s: d.rectangle((0, 0.63 * W * s, W * s, 0.70 * W * s), fill=255),
        supersample=1,
        blur_radius=28.0,
    )
    arr = screen(arr, "#F4D49A", haze * 0.16)

    # Tree line and field bands.
    trees = ridge_mask(rng, 0.672, 0.026, points=9, blur_radius=1.0)
    arr = blend(arr, "#2E1B15", trees * 0.94)

    for i, (y, opacity, radius) in enumerate([(0.725, 0.14, 22), (0.790, 0.18, 28),
                                              (0.862, 0.24, 36)]):
        band = mask_from_draw(
            lambda d, s, y=y: d.rectangle(
                (0, y * W * s, W * s, (y + 0.075) * W * s), fill=255
            ),
            supersample=1,
            blur_radius=radius,
        )
        arr = blend(arr, "#6B3C2A", band * opacity)

    # A broad dark foreground, and grasses catching the last light.
    fore = np.clip((np.arange(W, dtype=np.float32)[:, None] / W - 0.86) / 0.16, 0.0, 1.0)
    arr = blend(arr, "#2A1813", fore * 0.62)
    grass = mask_from_draw(lambda d, s: [
        d.line(
            [(x * W * s, 1.02 * W * s), ((x + dx) * W * s, (0.86 - h) * W * s)],
            fill=255, width=max(1, int(1.6 * s)),
        )
        for x, dx, h in [(rng.uniform(0.0, 1.0), rng.uniform(-0.008, 0.008),
                          rng.uniform(0.05, 0.12)) for _ in range(80)]
    ], supersample=1, blur_radius=0.5)
    arr = blend(arr, "#1D110E", grass * 0.40)

    return finish(arr, rng, vignette_strength=0.34, grain_sigma=0.018, desaturate=0.04)


def cover_low_tide(rng):
    arr = vgrad([
        (0.00, "#F3EDDF"),
        (0.30, "#E9E2D1"),
        (0.44, "#D6D6C4"),
        (0.56, "#B9C9C5"),
        (0.63, "#CFCFBE"),
        (0.82, "#C6C4AF"),
        (1.00, "#B5B39C"),
    ])
    mottle = upnoise(rng, 9) * 0.05 + upnoise(rng, 31) * 0.025
    arr = arr * (0.96 + mottle)[:, :, None]

    # The sea, pale and still, with a soft wavy shoreline.
    def sea_shape(d, s):
        top = []
        bottom = []
        for i in range(81):
            x = i / 80.0
            top.append((x * W * s, (0.302 + 0.004 * math.sin(x * 7.0)) * W * s))
            bottom.append((x * W * s, (0.548 + 0.004 * math.sin(x * 5.0 + 1.2)) * W * s))
        d.polygon(top + bottom[::-1], fill=255)

    sea = mask_from_draw(sea_shape, supersample=1, blur_radius=9.0)
    arr = blend(arr, "#A8BFBF", sea * 0.55)

    # Foam lines.
    for i in range(3):
        y = 0.515 + i * 0.012
        foam = mask_from_draw(
            lambda d, s, y=y: d.rectangle((0, y * W * s, W * s, (y + 0.0028) * W * s), fill=255),
            supersample=1,
            blur_radius=1.6,
        )
        arr = screen(arr, "#F7F3E6", foam * (0.26 - i * 0.06))

    # The tidal pool.
    pool = ellipse_mask(0.50, 0.675, 0.305, 0.125, feather=0.05)
    wet = blur(pool, 16.0)
    arr = multiply(arr, "#A9A78F", wet * 0.28)
    water = vgrad_region("#DCE6E2", "#A8C2C4", 0.56, 0.80)
    arr = blend(arr, water, pool * 0.78)

    # Ripples.
    for i, (rx, ry, alpha, ox) in enumerate([(0.18, 0.055, 0.14, 0.0), (0.11, 0.032, 0.10, 0.015)]):
        ring = np.clip(
            ellipse_mask(0.47 + ox, 0.665, rx, ry, feather=0.035) -
            ellipse_mask(0.47 + ox, 0.665, rx * 0.90, ry * 0.76, feather=0.035),
            0.0, 1.0,
        )
        arr = screen(arr, "#F4F6EC", ring * alpha)

    # Foam along the pool's rim.
    rim = np.clip(pool - ellipse_mask(0.50, 0.675, 0.293, 0.115, feather=0.04), 0.0, 1.0)
    arr = screen(arr, "#F6F2E2", rim * 0.28)

    # A little reflected sky highlight.
    arr = screen(arr, "#F4F4E6", ellipse_mask(0.56, 0.645, 0.10, 0.030, feather=0.4) * 0.22)

    # Scattered pebbles and shell flecks.
    specks = mask_from_draw(lambda d, s: [
        d.ellipse(
            ((x - r) * W * s, (y - r) * W * s, (x + r) * W * s, (y + r) * W * s), fill=255
        )
        for x, y, r in [
            (rng.uniform(0.05, 0.95), rng.uniform(0.80, 0.97), rng.uniform(0.001, 0.004))
            for _ in range(70)
        ]
    ], supersample=2, blur_radius=0.4)
    arr = blend(arr, "#8C866E", specks * 0.30)

    return finish(arr, rng, vignette_strength=0.20, grain_sigma=0.019, desaturate=0.03)


def cover_signal_fire(rng):
    arr = vgrad([
        (0.00, "#080706"),
        (0.26, "#0F0C0A"),
        (0.50, "#1A1310"),
        (0.70, "#2B1B13"),
        (0.80, "#241610"),
        (0.86, "#14100D"),
        (1.00, "#0A0807"),
    ])
    arr = screen(arr, "#C06A34", radial(0.50, 0.755, 0.62, 0.46, 1.9) * 0.46)
    arr = screen(arr, "#F2B36A", radial(0.50, 0.755, 0.30, 0.24, 2.2) * 0.46)

    # Low ridge, so the fire has somewhere to sit.
    ridge = ridge_mask(rng, 0.792, 0.026, points=6, blur_radius=1.4)
    arr = blend(arr, "#050505", ridge * 0.80)
    arr = screen(arr, "#C06A34", (blur(ridge, 14.0) - ridge) * 0.10)

    # Smoke: soft drifting ellipses rising from the fire.
    smoke = np.zeros((W, W), dtype=np.float32)
    x = 0.50
    for i in range(9):
        y = 0.70 - i * 0.066
        x += rng.normal(0.014, 0.020)
        rx = 0.040 + i * 0.020
        ry = 0.050 + i * 0.016
        smoke += ellipse_mask(x, y, rx, ry, feather=0.55) * (0.17 - i * 0.012)
    smoke = blur(np.clip(smoke, 0.0, 1.0), 28.0)
    arr = screen(arr, "#8A7564", smoke * 0.75)

    # The ember itself.
    ember = np.zeros((W, W), dtype=np.float32)
    for i in range(9):
        ex = 0.5 + rng.normal(0.0, 0.014)
        ey = 0.765 + rng.normal(0.0, 0.012)
        er = rng.uniform(0.008, 0.020)
        ember += circle_mask(ex, ey, er, feather=0.5)
    ember = np.clip(ember, 0.0, 1.0)
    arr = screen(arr, "#E07A3C", blur(ember, 12.0) * 0.95)
    arr = blend(arr, "#F2B36A", ember * 0.90)
    arr = screen(arr, "#FFF2D4", circle_mask(0.5, 0.772, 0.016, feather=0.6) * 0.85)

    # Sparks above the flame.
    sparks = mask_from_draw(lambda d, s: [
        d.ellipse(
            ((x - r) * W * s, (y - r) * W * s, (x + r) * W * s, (y + r) * W * s), fill=255
        )
        for x, y, r in [
            (0.5 + rng.normal(0.0, 0.060), rng.uniform(0.30, 0.74), rng.uniform(0.0008, 0.0020))
            for _ in range(44)
        ]
    ], supersample=2, blur_radius=0.5)
    arr = screen(arr, "#F0A05A", sparks * 0.60)

    # Ground shadow and a faint pool of light.
    arr = multiply(arr, "#080605", radial(0.5, 0.96, 0.74, 0.24, 1.5) * 0.34)
    arr = screen(arr, "#B45C32", ellipse_mask(0.5, 0.90, 0.26, 0.055, feather=0.6) * 0.18)

    return finish(arr, rng, vignette_strength=0.46, grain_sigma=0.020, desaturate=0.02)


def rotate_mask(mask, degrees):
    img = Image.fromarray((np.clip(mask, 0.0, 1.0) * 255).astype(np.uint8))
    img = img.rotate(degrees, resample=Image.BICUBIC, expand=False)
    return np.asarray(img, dtype=np.float32) / 255.0


def cover_quiet_machines(rng):
    arr = vgrad([
        (0.00, "#3A3C36"),
        (0.28, "#32342F"),
        (0.62, "#292B27"),
        (0.86, "#20221F"),
        (1.00, "#191B18"),
    ])
    arr = screen(arr, "#D6D0BC", radial(0.16, 0.06, 0.72, 0.58, 2.0) * 0.18)
    arr = multiply(arr, "#141613", radial(0.92, 0.92, 0.58, 0.48, 1.8) * 0.34)

    # A cast concrete wall, full bleed, tilted just enough to feel placed.
    angle = -6.5
    panel_rect = (-0.06, -0.03, 1.06, 1.03)
    panel = rotate_mask(mask_from_draw(
        lambda d, s: d.rounded_rectangle(
            [v * W * s for v in panel_rect], radius=90 * s, fill=255
        ),
        supersample=2,
        blur_radius=0.7,
    ), angle)
    shadow = np.roll(panel, 16, axis=0)
    arr = multiply(arr, "#0B0C0B", blur(shadow, 30.0) * 0.22)
    arr = blend(arr, "#44463F", panel * 0.92)

    # Brushed surface: a broad light wash and a darker lower edge.
    arr = screen(arr, "#C9C4B2", radial(0.26, 0.20, 0.7, 0.55, 1.9) * 0.13)
    arr = multiply(arr, "#171815", panel * (np.clip(
        (np.arange(W, dtype=np.float32)[:, None] / W - 0.60) / 0.45, 0.0, 1.0
    ) * 0.28))

    # Concrete mottling and fine dust.
    arr = arr * (0.975 + upnoise(rng, 11) * 0.05)[:, :, None]
    arr = arr * (0.99 + upnoise(rng, 70) * 0.02)[:, :, None]

    # Air slots, varied like a real casting.
    slot_specs = []
    for row, y0 in enumerate([0.205, 0.320, 0.435, 0.550, 0.665]):
        for col, (x0, width) in enumerate([(0.150, 0.175), (0.375, 0.235), (0.665, 0.145)]):
            if (row + col) % 4 == 3:
                width *= 0.62
            slot_specs.append((x0, y0, width, 0.030))
    slots = np.zeros((W, W), dtype=np.float32)
    edges = np.zeros((W, W), dtype=np.float32)
    for x0, y0, width, height in slot_specs:
        slots += mask_from_draw(
            lambda d, s, x0=x0, y0=y0, width=width, height=height: d.rounded_rectangle(
                (x0 * W * s, y0 * W * s,
                 (x0 + width) * W * s, (y0 + height) * W * s),
                radius=10 * s, fill=255,
            ),
            supersample=2,
            blur_radius=0.6,
        )
        edges += mask_from_draw(
            lambda d, s, x0=x0, y0=y0, width=width, height=height: d.rounded_rectangle(
                (x0 * W * s, y0 * W * s,
                 (x0 + width) * W * s, (y0 + height) * W * s),
                radius=10 * s, outline=255, width=2 * s,
            ),
            supersample=2,
            blur_radius=0.8,
        )
    slots = rotate_mask(np.clip(slots, 0.0, 1.0), angle)
    edges = rotate_mask(np.clip(edges, 0.0, 1.0), angle)
    arr = blend(arr, "#101210", slots * 0.90)
    arr = screen(arr, "#8C8D81", edges * 0.16)

    # One slot still warm.
    lit_x, lit_y, lit_w = 0.665, 0.550, 0.145
    lit = rotate_mask(mask_from_draw(
        lambda d, s: d.rounded_rectangle(
            (lit_x * W * s, lit_y * W * s,
             (lit_x + lit_w) * W * s, (lit_y + 0.030) * W * s),
            radius=10 * s, fill=255,
        ),
        supersample=2,
        blur_radius=0.5,
    ), angle)
    arr = screen(arr, "#D0A566", lit * 0.90)
    arr = screen(arr, "#C9A46A", blur(lit, 20.0) * 0.34)

    # Four quiet fixings.
    fixings = mask_from_draw(lambda d, s: [
        d.ellipse(
            ((x - 0.007) * W * s, (y - 0.007) * W * s,
             (x + 0.007) * W * s, (y + 0.007) * W * s), fill=255
        ) for x, y in [(0.075, 0.075), (0.925, 0.075), (0.075, 0.925), (0.925, 0.925)]
    ], supersample=2, blur_radius=0.6)
    fixings = rotate_mask(fixings, angle)
    arr = screen(arr, "#8A8B80", fixings * 0.20)

    # A hairline seam and faint wear.
    seam = rotate_mask(mask_from_draw(
        lambda d, s: d.line(
            [(0.0, 0.055 * W * s), (W * s, 0.055 * W * s)],
            fill=255, width=2 * s,
        ),
        supersample=1,
        blur_radius=1.0,
    ), angle)
    arr = screen(arr, "#B7B3A2", seam * 0.07)
    scratch = mask_from_draw(
        lambda d, s: d.line(
            [(0.02 * W * s, 0.92 * W * s), (0.72 * W * s, 0.02 * W * s)],
            fill=255, width=2 * s,
        ),
        supersample=1,
        blur_radius=1.2,
    )
    arr = screen(arr, "#BDB9A8", scratch * 0.05)

    return finish(arr, rng, vignette_strength=0.38, grain_sigma=0.020, desaturate=0.05)


COVER_RENDERERS = {
    "midnight_drive": cover_midnight_drive,
    "paper_moons": cover_paper_moons,
    "velvet_static": cover_velvet_static,
    "slow_arc": cover_slow_arc,
    "harbor_lights": cover_harbor_lights,
    "glass_hours": cover_glass_hours,
    "northbound": cover_northbound,
    "after_rain": cover_after_rain,
    "copper_sky": cover_copper_sky,
    "low_tide": cover_low_tide,
    "signal_fire": cover_signal_fire,
    "quiet_machines": cover_quiet_machines,
}


def save_cover(token_id, renderer_name, force=False):
    out = COVERS_DIR / (token_id + ".webp")
    if out.exists() and not force:
        return out, out.stat().st_size
    rng = rng_for("cover:" + token_id)
    arr = COVER_RENDERERS[renderer_name](rng)
    image = Image.fromarray((np.clip(arr, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))
    add_rim(image)

    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    quality = 94
    while quality >= 88:
        image.save(out, "WEBP", quality=quality, method=6, exact=True)
        size = out.stat().st_size
        if size < 300000:
            return out, size
        quality -= 2
    # Last resort: soften the grain slightly and try again at 88.
    softened = image.filter(ImageFilter.GaussianBlur(0.35))
    softened.save(out, "WEBP", quality=88, method=6, exact=True)
    return out, out.stat().st_size


# --------------------------------------------------------------------------
# Audio synthesis
# --------------------------------------------------------------------------

def midi_freq(note):
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
}


def scale_note(root, scale, degree, octave=0):
    steps = SCALES[scale]
    return root + 12 * octave + steps[degree % len(steps)] + 12 * (degree // len(steps))


def chord_notes(root, scale, degrees, octave=0, seventh=True):
    notes = [scale_note(root, scale, d, octave) for d in degrees]
    if seventh:
        notes = notes + [scale_note(root, scale, degrees[0] + 6, octave)]
    return sorted(set(notes))


def env_adsr(n, attack, decay, sustain, release, sr=SR):
    if n <= 2:
        return np.ones(max(1, n), dtype=np.float32)
    a = max(1, int(attack * sr))
    d = max(1, int(decay * sr))
    r = max(0, int(release * sr))
    total = a + d + r
    if total > n:
        factor = n / float(total)
        a = max(1, int(a * factor))
        d = max(1, int(d * factor))
        r = max(0, int(r * factor))
    while a + d + r > n:
        if r > 0:
            r -= 1
        elif d > 0:
            d -= 1
        else:
            a -= 1
    s = max(0, n - a - d - r)
    e = np.ones(n, dtype=np.float32)
    e[:a] = np.linspace(0.0, 1.0, a) ** 0.7
    e[a:a + d] = np.linspace(1.0, sustain, d)
    e[a + d:a + d + s] = sustain
    if r > 0:
        e[a + d + s:] = np.linspace(sustain, 0.0, r)
    return e


def exp_env(n, tau, sr=SR, attack=0.005):
    t = np.arange(n, dtype=np.float32) / sr
    e = np.exp(-t / tau)
    a = min(n, max(1, int(attack * sr)))
    e[:a] *= np.linspace(0.0, 1.0, a)
    return e.astype(np.float32)


def fft_filter(x, low=None, high=None, order=2, sr=SR):
    """Gentle FFT-domain low/high-pass with smooth Butterworth-like edges."""
    x = np.asarray(x, dtype=np.float32)
    if x.size == 0:
        return x
    n = x.size
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    mask = np.ones_like(freqs, dtype=np.float32)
    if low:
        mask *= 1.0 / np.sqrt(1.0 + (freqs / low) ** (2 * order))
    if high:
        mask *= 1.0 / np.sqrt(1.0 + (high / np.maximum(freqs, 1e-6)) ** (2 * order))
    return np.fft.irfft(spec * mask, n).astype(np.float32)


def pan_gains(pan):
    pan = float(np.clip(pan, -1.0, 1.0))
    angle = (pan + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def add_signal(left, right, sig, start, pan=0.0, gain=1.0):
    n = len(sig)
    start = int(start)
    if start >= len(left) or n <= 0:
        return
    end = min(len(left), start + n)
    gl, gr = pan_gains(pan)
    left[start:end] += sig[:end - start] * gain * gl
    right[start:end] += sig[:end - start] * gain * gr


def pad_chord(freqs, duration, rng, detune=0.0035, attack=1.1, release=2.4,
              brightness=0.5, sr=SR):
    n = int((duration + release) * sr)
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros(n, dtype=np.float32)
    harmonics = (1.0, 0.42, 0.22, 0.10)
    for f in freqs:
        base_phase = rng.random() * 2.0 * math.pi
        for h, amp in enumerate(harmonics, start=1):
            if f * h > 9000:
                continue
            for sign in (-1.0, 1.0):
                d = 1.0 + sign * detune * (1.0 + 0.15 * h)
                phase = base_phase + rng.random() * 0.4
                out += (amp * brightness) * np.sin(
                    2.0 * math.pi * f * h * d * t + phase
                ).astype(np.float32)
    env = env_adsr(n, attack, 0.4, 0.82, release, sr)
    return out * env


def bass_note(freq, duration, rng, bright=0.3, sr=SR):
    n = int(duration * sr)
    t = np.arange(n, dtype=np.float32) / sr
    sig = np.sin(2.0 * math.pi * freq * t)
    sig += bright * 0.5 * np.sin(2.0 * math.pi * freq * 2.0 * t + 0.2)
    sig += bright * 0.18 * np.sin(2.0 * math.pi * freq * 3.0 * t + 0.7)
    env = env_adsr(n, 0.012, 0.18, 0.72, 0.22, sr)
    sig = np.tanh(sig * 1.1) * env
    return sig.astype(np.float32)


def ep_note(freq, duration, rng, sr=SR):
    n = int(duration * sr)
    t = np.arange(n, dtype=np.float32) / sr
    index = 2.2 * np.exp(-t / 0.35)
    mod = np.sin(2.0 * math.pi * freq * 2.0 * t + rng.random())
    body = np.sin(2.0 * math.pi * freq * t + index * mod)
    tine = 0.22 * np.sin(2.0 * math.pi * freq * 2.01 * t) * np.exp(-t / 0.55)
    env = exp_env(n, 1.6, sr, attack=0.008)
    return ((body + tine) * env).astype(np.float32)


def pluck_note(freq, duration, rng, sr=SR, damp=1.0):
    n = int(duration * sr)
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros(n, dtype=np.float32)
    for h in range(1, 7):
        decay = (1.4 + h * 0.75) * damp
        amp = 1.0 / (h ** 1.25)
        out += amp * np.sin(
            2.0 * math.pi * freq * h * (1.0 + 0.0007 * h) * t + rng.random()
        ) * np.exp(-t / decay)
    # A tiny pick transient.
    pick = rng.standard_normal(n).astype(np.float32) * np.exp(-t / 0.004) * 0.05
    env = exp_env(n, 2.8, sr, attack=0.002)
    return (out * 0.9 + pick) * env


def bell_note(freq, duration, rng, sr=SR):
    n = int(duration * sr)
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros(n, dtype=np.float32)
    for ratio, amp, decay in [(1.0, 1.0, 2.2), (2.76, 0.45, 1.1),
                              (5.40, 0.22, 0.7), (8.93, 0.10, 0.4)]:
        out += amp * np.sin(2.0 * math.pi * freq * ratio * t + rng.random()) * np.exp(-t / decay)
    env = exp_env(n, 3.0, sr, attack=0.004)
    return (out * env).astype(np.float32)


def lead_note(freq, duration, rng, sr=SR, brightness=0.35):
    n = int(duration * sr)
    t = np.arange(n, dtype=np.float32) / sr
    vibrato = 0.0035 * np.sin(2.0 * math.pi * 4.6 * t)
    sig = np.zeros(n, dtype=np.float32)
    for h in range(1, 5):
        sig += (brightness ** (h - 1)) / h * np.sin(
            2.0 * math.pi * freq * h * t * (1.0 + vibrato) + rng.random()
        )
    env = env_adsr(n, 0.16, 0.3, 0.78, 0.7, sr)
    return (sig * env).astype(np.float32)


def kick_hit(rng, sr=SR, level=1.0):
    n = int(0.55 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    f = 44.0 + 96.0 * np.exp(-t / 0.028)
    phase = 2.0 * math.pi * np.cumsum(f) / sr
    body = np.sin(phase) * np.exp(-t / 0.22)
    click = rng.standard_normal(n).astype(np.float32) * np.exp(-t / 0.003) * 0.10
    return np.tanh((body + click) * 1.2) * level


def snare_hit(rng, sr=SR, soft=0.5):
    n = int(0.32 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    noise = fft_filter(noise, high=900.0, low=6500.0, order=2)
    body = 0.25 * np.sin(2.0 * math.pi * 185.0 * t) * np.exp(-t / 0.07)
    env = np.exp(-t / (0.09 + soft * 0.08))
    return (noise * env * 0.7 + body).astype(np.float32)


def brush_hit(rng, sr=SR):
    n = int(0.42 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    noise = fft_filter(noise, high=1800.0, low=9000.0, order=2)
    env = np.exp(-t / 0.18) * (1.0 - np.exp(-t / 0.012))
    return (noise * env * 0.34).astype(np.float32)


def hat_hit(rng, sr=SR, open_hat=False):
    n = int((0.22 if open_hat else 0.09) * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    noise = fft_filter(noise, high=6500.0, order=2)
    env = np.exp(-t / (0.09 if open_hat else 0.028))
    return (noise * env * 0.20).astype(np.float32)


def rim_hit(rng, sr=SR):
    n = int(0.14 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    ping = 0.35 * np.sin(2.0 * math.pi * 820.0 * t) * np.exp(-t / 0.035)
    click = rng.standard_normal(n).astype(np.float32) * np.exp(-t / 0.004) * 0.2
    return (ping + click).astype(np.float32)


def ride_hit(rng, sr=SR):
    n = int(0.6 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    noise = fft_filter(noise, high=4200.0, low=12000.0, order=2)
    bell = 0.35 * np.sin(2.0 * math.pi * 3150.0 * t) * np.exp(-t / 0.18)
    env = np.exp(-t / 0.30) * (1.0 - np.exp(-t / 0.006))
    return (noise * env * 0.22 + bell).astype(np.float32)


def tick_hit(rng, sr=SR, metallic=True):
    n = int(0.10 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    noise = fft_filter(noise, high=1200.0, low=5200.0, order=2)
    env = np.exp(-t / 0.018)
    sig = noise * env * 0.5
    if metallic:
        sig += 0.2 * np.sin(2.0 * math.pi * rng.uniform(900.0, 1800.0) * t) * np.exp(-t / 0.05)
    return sig.astype(np.float32)


def mechanical_hit(rng, sr=SR):
    n = int(0.45 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    noise = fft_filter(noise, high=400.0, low=3800.0, order=2)
    clank = 0.25 * np.sin(2.0 * math.pi * rng.uniform(130.0, 210.0) * t) * np.exp(-t / 0.12)
    env = np.exp(-t / 0.13) * (1.0 - np.exp(-t / 0.004))
    return (noise * env * 0.5 + clank).astype(np.float32)


def pink_noise(rng, n, sr=SR, low=80.0, high=12000.0):
    white = rng.standard_normal(n).astype(np.float32)
    spec = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    shape = 1.0 / np.sqrt(np.maximum(freqs, 20.0))
    shape *= 1.0 / np.sqrt(1.0 + (freqs / high) ** 4)
    shape *= 1.0 / np.sqrt(1.0 + (low / np.maximum(freqs, 1e-6)) ** 4)
    return np.fft.irfft(spec * shape, n).astype(np.float32)


def vinyl_texture(rng, n, sr=SR):
    base = pink_noise(rng, n, sr, low=300.0, high=9000.0) * 0.012
    # Sparse crackle.
    count = max(1, int(n / sr * 18))
    pos = rng.integers(0, max(1, n - 200), count)
    crackle = np.zeros(n, dtype=np.float32)
    for p in pos:
        length = int(rng.uniform(0.001, 0.004) * sr)
        crackle[p:p + length] += (
            rng.standard_normal(length).astype(np.float32)
            * np.linspace(1.0, 0.0, length) ** 2
            * rng.uniform(0.02, 0.10)
        )
    return base + crackle


def rain_texture(rng, n, sr=SR):
    rain = pink_noise(rng, n, sr, low=400.0, high=10000.0) * 0.018
    drops = np.zeros(n, dtype=np.float32)
    count = max(1, int(n / sr * 9))
    for p in rng.integers(0, max(1, n - 300), count):
        length = int(rng.uniform(0.004, 0.012) * sr)
        drops[p:p + length] += (
            rng.standard_normal(length).astype(np.float32)
            * np.exp(-np.linspace(0, 1, length) * 8.0)
            * rng.uniform(0.008, 0.03)
        )
    return rain + drops


def water_texture(rng, n, sr=SR):
    wash = pink_noise(rng, n, sr, low=120.0, high=1800.0) * 0.03
    swell = np.sin(2.0 * math.pi * 0.09 * np.arange(n) / sr).astype(np.float32) * 0.5 + 0.5
    return wash * (0.55 + 0.45 * swell)


def fire_texture(rng, n, sr=SR):
    embers = pink_noise(rng, n, sr, low=80.0, high=1400.0) * 0.020
    crackle = np.zeros(n, dtype=np.float32)
    count = max(1, int(n / sr * 4))
    for p in rng.integers(0, max(1, n - 400), count):
        length = int(rng.uniform(0.002, 0.006) * sr)
        crackle[p:p + length] += (
            rng.standard_normal(length).astype(np.float32)
            * np.linspace(1.0, 0.0, length) ** 2
            * rng.uniform(0.01, 0.05)
        )
    return embers + crackle


def make_impulse(rng, seconds=2.4, sr=SR):
    n = int(seconds * sr)
    t = np.arange(n, dtype=np.float32) / sr
    noise = rng.standard_normal((n // 2, 2)).astype(np.float32)
    env = np.exp(-t / (seconds * 0.36))[:, None]
    impulse = np.zeros((n, 2), dtype=np.float32)
    impulse[: n // 2] = noise * env[: n // 2]
    impulse = np.stack([
        fft_filter(impulse[:, 0], high=6500.0, order=2),
        fft_filter(impulse[:, 1], high=5200.0, order=2),
    ])
    impulse[: int(0.012 * sr)] *= 0.2
    impulse /= np.max(np.abs(impulse)) + 1e-9
    return impulse


def fft_convolve(x, h):
    n = 1 << int(math.ceil(math.log2(len(x) + len(h) - 1)))
    X = np.fft.rfft(x, n)
    H = np.fft.rfft(h, n)
    return np.fft.irfft(X * H, n)[: len(x)].astype(np.float32)


def make_track(cfg):
    bpm = cfg["bpm"]
    bars = cfg["bars"]
    key = cfg["key"]
    mode = cfg["mode"]
    style = cfg["audio"]
    rng = rng_for("audio:" + cfg["tokenId"])

    beat = 60.0 / bpm
    bar = 4.0 * beat
    total_seconds = bars * bar + 4.0
    n = int(total_seconds * SR)
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)
    send = np.zeros(n, dtype=np.float32)  # mono reverb send

    def place(sig, start_sec, pan=0.0, gain=1.0, reverb=0.0):
        add_signal(left, right, sig, start_sec * SR, pan, gain)
        if reverb:
            start = int(start_sec * SR)
            end = min(len(send), start + len(sig))
            if start < len(send) and end > start:
                send[start:end] += sig[:end - start] * gain * reverb

    progression_map = {
        "minor": [(0, 2, 4), (5, 0, 2), (2, 4, 6), (6, 1, 3)],
        "major": [(0, 2, 4), (4, 6, 0), (5, 0, 2), (3, 5, 0)],
        "dorian": [(0, 2, 4), (3, 5, 0), (6, 1, 3), (4, 6, 0)],
    }
    progression = progression_map[mode]
    chord_len = 2.0 * bar

    # ---------- harmony ----------
    pad_level = {
        "synthwave": 0.115, "ambient_paper": 0.160, "dream_pop": 0.130,
        "electronic_arc": 0.100, "jazz": 0.070, "neo_soul": 0.090,
        "indie": 0.085, "lofi": 0.100, "folk": 0.055,
        "ambient_tide": 0.145, "electronic_fire": 0.115, "industrial": 0.105,
    }[style]
    pad_cutoff = 6200.0 if style in ("ambient_paper", "ambient_tide", "dream_pop") else 4800.0
    chord_index = 0
    while chord_index * chord_len < bars * bar - 0.01:
        degree_set = progression[chord_index % len(progression)]
        notes = chord_notes(key + 12, mode, list(degree_set), octave=0, seventh=(style not in ("folk", "industrial")))
        freqs = [midi_freq(nt) for nt in notes]
        start = chord_index * chord_len
        attack = 1.8 if "ambient" in style else 0.9
        release = 3.0 if "ambient" in style else 1.8
        detune = 0.004 if style in ("dream_pop", "synthwave", "ambient_paper", "ambient_tide") else 0.0025
        brightness = 0.55 if style in ("ambient_paper", "ambient_tide", "dream_pop") else 0.42
        # Render two uncorrelated takes for a wide, breathing pad.
        pad_l = fft_filter(pad_chord(
            freqs, chord_len * 1.02, rng, detune=detune,
            attack=attack, release=release, brightness=brightness,
        ), low=pad_cutoff, order=1)
        pad_r = fft_filter(pad_chord(
            freqs, chord_len * 1.02, rng, detune=detune,
            attack=attack, release=release, brightness=brightness,
        ), low=pad_cutoff, order=1)
        start_sample = int(start * SR)
        end_sample = min(n, start_sample + len(pad_l))
        if start_sample < n:
            left[start_sample:end_sample] += pad_l[:end_sample - start_sample] * pad_level
            right[start_sample:end_sample] += pad_r[:end_sample - start_sample] * pad_level
            send[start_sample:end_sample] += (
                (pad_l[:end_sample - start_sample] + pad_r[:end_sample - start_sample])
                * 0.5 * pad_level * 0.55
            )
        chord_index += 1

    # ---------- style-specific parts ----------
    if style == "synthwave":
        kick = kick_hit(rng, level=0.55)
        snare = snare_hit(rng, soft=0.7)
        hat = hat_hit(rng)
        for b in range(bars):
            t0 = b * bar
            place(kick, t0, gain=0.52)
            place(kick, t0 + 2 * beat, gain=0.44)
            if b >= 2:
                place(snare, t0 + beat, gain=0.42, reverb=0.2)
                place(snare, t0 + 3 * beat, gain=0.42, reverb=0.2)
            for h in range(8):
                place(hat, t0 + h * beat / 2.0, pan=0.15, gain=0.26 + 0.05 * (h % 2))
            root = scale_note(key, mode, progression[b // 2 % len(progression)][0], octave=-1)
            for q in range(8):
                if b >= 4 or q % 2 == 0:
                    place(bass_note(midi_freq(root + (12 if q % 4 == 2 else 0)), beat * 0.46, rng, bright=0.5),
                          t0 + q * beat / 2.0, gain=0.31)
            if b >= 4:
                chord = progression[b // 2 % len(progression)]
                for step in range(8):
                    d = chord[step % len(chord)]
                    nt = scale_note(key + 12, mode, d, octave=1)
                    place(lead_note(midi_freq(nt), beat * 0.22, rng, brightness=0.5),
                          t0 + step * beat / 2.0, pan=(-0.35 if step % 2 else 0.35),
                          gain=0.16, reverb=0.4)

    elif style == "ambient_paper":
        # Slow bell melody and a soft sub drone.
        root = key - 12
        for b in range(0, bars, 4):
            place(bass_note(midi_freq(root), bar * 3.8, rng, bright=0.12), b * bar, gain=0.24)
        melody = [0, 2, 4, 6, 4, 2, 0, 4, 2, 6, 4, 0]
        for i, degree in enumerate(melody):
            t0 = 2.2 + i * (total_seconds - 8.0) / len(melody)
            nt = scale_note(key + 24, mode, degree, octave=0)
            place(bell_note(midi_freq(nt), 4.5, rng), t0,
                  pan=0.3 * math.sin(i * 1.7), gain=0.16, reverb=0.7)
        air = pink_noise(rng, n, SR, low=200.0, high=5000.0) * 0.010
        place(air, 0.0, gain=1.0, reverb=0.1)

    elif style == "dream_pop":
        kick = kick_hit(rng, level=0.45)
        snare = brush_hit(rng)
        hat = hat_hit(rng)
        for b in range(bars):
            t0 = b * bar
            place(kick, t0, gain=0.24)
            place(kick, t0 + 2.5 * beat, gain=0.16)
            place(snare, t0 + beat, gain=0.24, reverb=0.35)
            place(snare, t0 + 3 * beat, gain=0.22, reverb=0.35)
            for h in range(6):
                place(hat, t0 + h * (2.0 / 3.0) * beat, pan=-0.2, gain=0.10)
            if b >= 4:
                root = scale_note(key, mode, progression[b // 2 % len(progression)][0], octave=-1)
                place(bass_note(midi_freq(root), bar * 0.9, rng, bright=0.25), t0, gain=0.26)
        melody = [4, 6, 9, 7, 6, 4, 2, 4, 7, 9, 11, 9]
        for i, degree in enumerate(melody):
            t0 = bar * 8 + i * bar * 0.75
            if t0 > bars * bar - 2:
                break
            nt = scale_note(key + 12, mode, degree)
            place(lead_note(midi_freq(nt), 2.6, rng, brightness=0.3), t0,
                  pan=0.25 * math.sin(i * 1.3), gain=0.10, reverb=0.6)

    elif style == "electronic_arc":
        kick = kick_hit(rng, level=0.5)
        hat = hat_hit(rng)
        for b in range(bars):
            t0 = b * bar
            if b >= 2:
                place(kick, t0, gain=0.40)
                place(kick, t0 + 2 * beat, gain=0.32)
            for h in range(8):
                if b >= 4:
                    place(hat, t0 + (h + 0.5) * beat / 2.0, pan=0.2 if h % 2 else -0.2,
                          gain=0.09)
            root = scale_note(key, mode, progression[b // 2 % len(progression)][0], octave=-1)
            if b >= 2:
                place(bass_note(midi_freq(root), beat * 0.8, rng, bright=0.4),
                      t0 + 0.5 * beat, gain=0.30)
                place(bass_note(midi_freq(root), beat * 0.4, rng, bright=0.4),
                      t0 + 2.5 * beat, gain=0.22)
            if b >= 8:
                chord = progression[b // 2 % len(progression)]
                for step in range(4):
                    nt = scale_note(key + 24, mode, chord[step % len(chord)])
                    place(bell_note(midi_freq(nt), 1.4, rng), t0 + step * beat,
                          pan=0.3 * math.sin(step * 2.0 + b), gain=0.08, reverb=0.6)

    elif style == "jazz":
        ride = ride_hit(rng)
        brush = brush_hit(rng)
        bass_notes = chord_notes(key + 12, mode, [0, 2, 4], seventh=False)
        for b in range(bars):
            t0 = b * bar
            for q in range(4):
                place(bass_note(midi_freq(scale_note(key, mode, [0, 4, 2, 4][q], octave=-1)),
                                beat * 0.85, rng, bright=0.35),
                      t0 + q * beat, gain=0.21)
            if b >= 2:
                for q in range(4):
                    place(ride, t0 + q * beat, pan=0.25, gain=0.09)
                    place(ride, t0 + (q + 0.66) * beat, pan=0.25, gain=0.05)
                place(brush, t0 + beat, gain=0.16, reverb=0.3)
                place(brush, t0 + 3 * beat, gain=0.15, reverb=0.3)
            chord = progression[b // 2 % len(progression)]
            notes = chord_notes(key + 12, mode, list(chord), seventh=True)
            for j, nt in enumerate(notes):
                if b >= 1:
                    place(ep_note(midi_freq(nt), 1.9, rng), t0 + 0.5 * beat + j * 0.04,
                          pan=-0.25 + 0.16 * j, gain=0.13, reverb=0.35)
        # Sparse melody in the last third.
        scale = [scale_note(key + 24, mode, d) for d in (2, 4, 6, 7, 9)]
        for i in range(18):
            t0 = bars * bar * 0.45 + i * bar * 0.5
            if t0 > bars * bar - 2:
                break
            nt = rng.choice(scale)
            place(lead_note(midi_freq(nt), 1.3, rng, brightness=0.28), t0,
                  pan=0.2 * math.sin(i), gain=0.075, reverb=0.5)

    elif style == "neo_soul":
        kick = kick_hit(rng, level=0.45)
        rim = rim_hit(rng)
        hat = hat_hit(rng)
        for b in range(bars):
            t0 = b * bar
            place(kick, t0 + 0.0, gain=0.32)
            place(kick, t0 + 2.5 * beat, gain=0.20)
            if b >= 2:
                place(rim, t0 + beat, gain=0.22, reverb=0.2)
                place(rim, t0 + 3.2 * beat, gain=0.18, reverb=0.2)
            for h in range(6):
                place(hat, t0 + h * (2.0 / 3.0) * beat, gain=0.06)
            chord = progression[b // 2 % len(progression)]
            notes = chord_notes(key + 12, mode, list(chord), seventh=True)
            for j, nt in enumerate(notes):
                if b >= 1:
                    place(ep_note(midi_freq(nt), 2.3, rng), t0 + j * 0.07,
                          pan=-0.3 + 0.2 * j, gain=0.09, reverb=0.4)
            root = scale_note(key, mode, chord[0], octave=-1)
            if b >= 2:
                place(bass_note(midi_freq(root), beat * 0.55, rng, bright=0.3),
                      t0 + 0.5 * beat, gain=0.31)
                place(bass_note(midi_freq(root), beat * 0.55, rng, bright=0.3),
                      t0 + 2.5 * beat, gain=0.26)
        # Warm falsetto-ish lead.
        melody = [7, 9, 11, 9, 7, 6, 4, 6, 9, 11, 12, 11]
        for i, degree in enumerate(melody):
            t0 = bar * 6 + i * bar
            if t0 > bars * bar - 2:
                break
            nt = scale_note(key + 12, mode, degree)
            place(lead_note(midi_freq(nt), 2.4, rng, brightness=0.24), t0,
                  pan=0.2 * math.sin(i * 0.9), gain=0.10, reverb=0.55)

    elif style == "indie":
        kick = kick_hit(rng, level=0.5)
        snare = snare_hit(rng, soft=0.5)
        hat = hat_hit(rng)
        for b in range(bars):
            t0 = b * bar
            place(kick, t0, gain=0.36)
            place(kick, t0 + 2 * beat, gain=0.30)
            if b >= 2:
                place(snare, t0 + beat, gain=0.28, reverb=0.25)
                place(snare, t0 + 3 * beat, gain=0.28, reverb=0.25)
                for h in range(8):
                    place(hat, t0 + h * beat / 2.0, pan=0.15, gain=0.075)
            root = scale_note(key, mode, progression[b // 2 % len(progression)][0], octave=-1)
            for q in range(4):
                place(bass_note(midi_freq(root + (7 if q == 3 else 0)), beat * 0.7, rng, bright=0.3),
                      t0 + q * beat, gain=0.24)
            if b >= 4:
                chord = progression[b // 2 % len(progression)]
                for step, degree in enumerate(list(chord) + [chord[1]]):
                    nt = scale_note(key + 12, mode, degree, octave=1)
                    place(pluck_note(midi_freq(nt), 1.8, rng, damp=1.0),
                          t0 + step * beat, pan=-0.35 + 0.2 * step, gain=0.11, reverb=0.4)

    elif style == "lofi":
        kick = kick_hit(rng, level=0.4)
        snare = snare_hit(rng, soft=0.9)
        hat = hat_hit(rng)
        for b in range(bars):
            t0 = b * bar
            place(kick, t0 + 0.0, gain=0.26)
            place(kick, t0 + 2.5 * beat, gain=0.18)
            if b >= 2:
                place(snare, t0 + beat, gain=0.15, reverb=0.3)
                place(snare, t0 + 3 * beat, gain=0.14, reverb=0.3)
                for h in range(4):
                    place(hat, t0 + h * beat + 0.5 * beat, gain=0.05, pan=-0.2)
            chord = progression[b // 2 % len(progression)]
            notes = chord_notes(key + 12, mode, list(chord), seventh=True)
            for j, nt in enumerate(notes):
                place(ep_note(midi_freq(nt), 2.6, rng), t0 + 0.08 * j,
                      pan=-0.3 + 0.2 * j, gain=0.085, reverb=0.5)
            root = scale_note(key, mode, chord[0], octave=-1)
            place(bass_note(midi_freq(root), bar * 0.8, rng, bright=0.2), t0, gain=0.22)
        # Dusty texture.
        place(vinyl_texture(rng, n), 0.0, gain=0.7)
        place(rain_texture(rng, n), 0.0, gain=0.5)
        melody = [4, 6, 7, 6, 4, 2, 4, 0]
        for i, degree in enumerate(melody):
            t0 = bar * 6 + i * bar * 1.5
            if t0 > bars * bar - 2:
                break
            nt = scale_note(key + 12, mode, degree)
            place(lead_note(midi_freq(nt), 2.0, rng, brightness=0.2), t0,
                  pan=0.15 * math.sin(i), gain=0.07, reverb=0.6)

    elif style == "folk":
        for b in range(bars):
            t0 = b * bar
            chord = progression[b // 2 % len(progression)]
            notes = chord_notes(key + 12, mode, list(chord), seventh=False)
            pattern = [0, 1, 2, 1, 0, 1, 2, 3]
            for step, idx in enumerate(pattern):
                nt = notes[idx % len(notes)]
                place(pluck_note(midi_freq(nt), 2.2, rng, damp=0.9),
                      t0 + step * beat / 2.0,
                      pan=-0.45 + 0.25 * (idx % len(notes)),
                      gain=0.10, reverb=0.5)
            if b >= 4:
                root = scale_note(key, mode, chord[0], octave=-1)
                place(bass_note(midi_freq(root), bar * 0.85, rng, bright=0.18),
                      t0, gain=0.18)
                place(pluck_note(midi_freq(scale_note(key + 24, mode, chord[1])), 1.6, rng),
                      t0 + 1.5 * beat, pan=0.25, gain=0.055, reverb=0.55)
                place(pluck_note(midi_freq(scale_note(key + 24, mode, chord[2])), 1.6, rng),
                      t0 + 3.5 * beat, pan=-0.2, gain=0.05, reverb=0.55)

    elif style == "ambient_tide":
        root = key - 12
        place(bass_note(midi_freq(root), bars * bar * 0.98, rng, bright=0.08), 0.0, gain=0.18)
        for i in range(9):
            t0 = 4.0 + i * (total_seconds - 12.0) / 9.0
            degree = [0, 2, 4, 7, 4, 2, 0, 4, 2][i]
            nt = scale_note(key + 24, mode, degree)
            place(bell_note(midi_freq(nt), 5.0, rng), t0,
                  pan=0.35 * math.sin(i * 1.4), gain=0.14, reverb=0.75)
        place(water_texture(rng, n), 0.0, gain=0.9)
        place(pink_noise(rng, n, SR, low=100.0, high=2500.0) * 0.010, 0.0, gain=1.0)

    elif style == "electronic_fire":
        kick = kick_hit(rng, level=0.5)
        hat = hat_hit(rng)
        tick = tick_hit(rng)
        for b in range(bars):
            t0 = b * bar
            if b >= 2:
                place(kick, t0, gain=0.28)
                place(kick, t0 + 2 * beat, gain=0.18)
            root = scale_note(key, mode, progression[b // 2 % len(progression)][0], octave=-1)
            for q in range(8):
                if b >= 1:
                    place(bass_note(midi_freq(root), beat * 0.34, rng, bright=0.5),
                          t0 + q * beat / 2.0, gain=0.15 if q % 2 else 0.21)
            if b >= 4:
                for h in range(4):
                    place(tick, t0 + (h + 0.5) * beat, pan=0.3, gain=0.10, reverb=0.3)
                note = scale_note(key + 24, mode, progression[b // 2 % len(progression)][1])
                place(bell_note(midi_freq(note), 2.0, rng), t0 + 0.5 * beat,
                      pan=-0.2, gain=0.10, reverb=0.7)
        place(fire_texture(rng, n), 0.0, gain=0.5)

    elif style == "industrial":
        kick = kick_hit(rng, level=0.4)
        mech = mechanical_hit(rng)
        tick = tick_hit(rng, metallic=True)
        root = key
        place(bass_note(midi_freq(root), bars * bar * 0.98, rng, bright=0.2), 0.0, gain=0.035)
        for b in range(bars):
            t0 = b * bar
            place(kick, t0, gain=0.20)
            place(kick, t0 + 2.5 * beat, gain=0.12)
            if b >= 2:
                place(mech, t0 + beat, pan=-0.15, gain=0.14, reverb=0.25)
                place(mech, t0 + 3 * beat, pan=0.15, gain=0.12, reverb=0.25)
                for h in range(8):
                    place(tick, t0 + h * beat / 2.0 + 0.25 * beat,
                          pan=0.3 * math.sin(h), gain=0.08)
            if b >= 4:
                chord = progression[b // 2 % len(progression)]
                note = scale_note(key + 12, mode, chord[1])
                place(lead_note(midi_freq(note), 2.2, rng, brightness=0.18),
                      t0 + 2 * beat, pan=0.1, gain=0.12, reverb=0.4)
        place(vinyl_texture(rng, n), 0.0, gain=0.4)

    # ---------- reverberation ----------
    impulse = make_impulse(rng, seconds=2.6)
    rev_l = fft_convolve(send, impulse[:, 0])
    rev_r = fft_convolve(send, impulse[:, 1])
    left += rev_l * 0.32
    right += rev_r * 0.32
    # A short Haas delay widens the reverb without smearing the beat.
    delay = int(0.017 * SR)
    left[delay:] += rev_r[: len(left) - delay] * 0.08
    right[delay:] += rev_l[: len(right) - delay] * 0.08

    # ---------- master ----------
    left = fft_filter(left, low=15000.0, high=32.0, order=2)
    right = fft_filter(right, low=15000.0, high=32.0, order=2)
    peak = max(np.max(np.abs(left)), np.max(np.abs(right))) + 1e-9
    left *= 0.92 / peak
    right *= 0.92 / peak
    # Gentle analog-ish saturation.
    left = np.tanh(left * 1.05) / math.tanh(1.05)
    right = np.tanh(right * 1.05) / math.tanh(1.05)
    peak = max(np.max(np.abs(left)), np.max(np.abs(right))) + 1e-9
    left *= 0.89 / peak
    right *= 0.89 / peak

    fade_in = int((2.4 if "ambient" in style else 1.2) * SR)
    fade_out = int(3.6 * SR)
    ramp = np.ones(n, dtype=np.float32)
    ramp[:fade_in] = np.linspace(0.0, 1.0, fade_in) ** 1.4
    ramp[-fade_out:] = np.linspace(1.0, 0.0, fade_out) ** 1.3
    left *= ramp
    right *= ramp

    return np.stack([left, right], axis=1)


def write_wav(path, stereo):
    data = np.clip(stereo, -1.0, 1.0)
    pcm = (data * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as fh:
        fh.setnchannels(2)
        fh.setsampwidth(2)
        fh.setframerate(SR)
        fh.writeframes(pcm.tobytes())


def afinfo_duration(path):
    try:
        out = subprocess.run(
            ["afinfo", str(path)], capture_output=True, text=True, check=True
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    for line in out.splitlines():
        if "estimated duration" in line:
            try:
                return float(line.split(":")[1].strip().split(" ")[0])
            except (IndexError, ValueError):
                pass
    return None


def encode_audio(wav_path, out_path):
    cmd = [
        "afconvert", "-f", "m4af", "-d", "aac", "-b", "128000",
        "-q", "127", str(wav_path), str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    if out_path.stat().st_size > 3 * 1024 * 1024:
        # Fall back to a lower total bitrate but keep it comfortable.
        out_path.unlink()
        subprocess.run(
            ["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000",
             "-q", "127", str(wav_path), str(out_path)],
            check=True,
            capture_output=True,
        )
    return out_path.stat().st_size


def save_audio(cfg, force=False):
    out = AUDIO_DIR / (cfg["tokenId"] + ".m4a")
    if out.exists() and not force:
        return out
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    tmpdir = Path(tempfile.mkdtemp(prefix="sonata-demo-"))
    try:
        wav_path = tmpdir / (cfg["tokenId"] + ".wav")
        stereo = make_track(cfg)
        write_wav(wav_path, stereo)
        encode_audio(wav_path, out)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    return out


# --------------------------------------------------------------------------
# Manifest
# --------------------------------------------------------------------------

def build_manifest():
    entries = []
    for cfg in TRACKS:
        audio_path = AUDIO_DIR / (cfg["tokenId"] + ".m4a")
        if not audio_path.exists():
            raise SystemExit("Missing audio for %s; run the generator." % cfg["tokenId"])
        duration = afinfo_duration(audio_path)
        if duration is None:
            with wave.open(str(audio_path), "rb") as fh:  # unlikely fallback
                duration = fh.getnframes() / float(fh.getframerate())
        artist = ARTISTS[cfg["artist"]]
        entries.append({
            "tokenId": cfg["tokenId"],
            "title": cfg["title"],
            "artistName": artist["artistName"],
            "artistHandle": artist["artistHandle"],
            "artistAccountId": artist["artistAccountId"],
            "genre": cfg["genre"],
            "releaseYear": cfg["releaseYear"],
            "durationSec": int(round(duration)),
            "coverUrl": "/demo/covers/%s.webp" % cfg["tokenId"],
            "audioUrl": "/demo/audio/%s.m4a" % cfg["tokenId"],
            "description": cfg["description"],
        })
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    return entries


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", default="", help="comma-separated token ids")
    parser.add_argument("--skip-covers", action="store_true")
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    wanted = [t.strip() for t in args.only.split(",") if t.strip()]
    selected = [t for t in TRACKS if not wanted or t["tokenId"] in wanted]
    if wanted and len(selected) != len(wanted):
        raise SystemExit("Unknown token id in --only: %s" % ", ".join(wanted))

    if not args.skip_covers:
        print("Covers")
        total = 0
        for cfg in selected:
            path, size = save_cover(cfg["tokenId"], cfg["cover"], force=args.force)
            total += size
            print("  %-16s %6.1f KB" % (path.name, size / 1024.0))
        print("  covers total: %.1f MB" % (total / (1024.0 * 1024.0)))

    if not args.skip_audio:
        print("Audio")
        for cfg in selected:
            out = save_audio(cfg, force=args.force)
            duration = afinfo_duration(out)
            print("  %-16s %6.1f s  %5.1f MB" % (
                out.name, duration or 0.0, out.stat().st_size / (1024.0 * 1024.0)
            ))

    if not args.skip_audio and all(
        (AUDIO_DIR / (cfg["tokenId"] + ".m4a")).exists() for cfg in TRACKS
    ):
        entries = build_manifest()
        print("Manifest: %d entries -> %s" % (len(entries), MANIFEST))

    total_bytes = sum(
        p.stat().st_size for p in DEMO_DIR.rglob("*") if p.is_file()
    ) if DEMO_DIR.exists() else 0
    print("Demo assets total: %.1f MB" % (total_bytes / (1024.0 * 1024.0)))


if __name__ == "__main__":
    main()
