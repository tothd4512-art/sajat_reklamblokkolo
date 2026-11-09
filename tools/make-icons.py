#!/usr/bin/env python3
"""ReklámStop ikongenerátor (nincs külső függőség).

Egyszerű, jelekből (távolságfüggvényekből) rajzolt ikon: lekerekített négyzet,
sötét átmenetes háttér, zöld "tiltás" jel (kör + átlós vonal).
Supersamplinggel éles széleket ad, PNG-t zlib-ből ír.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'extension', 'icons')
SIZES = [16, 32, 48, 128]
SS = 4  # supersampling

ACCENT = (0x6E, 0xE7, 0xA8)
ACCENT_LIGHT = (0x9B, 0xF7, 0xC9)
BG_TOP = (0x14, 0x33, 0x27)
BG_BOTTOM = (0x0A, 0x12, 0x1F)


def lerp(a, b, t):
    return a + (b - a) * t


def sd_round_rect(px, py, half, radius):
    """Lekerekített négyzet távolsága (0 = a szélen)."""
    qx = abs(px) - half + radius
    qy = abs(py) - half + radius
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - radius


def sd_segment(px, py, ax, ay, bx, by):
    """Pont és szakasz távolsága."""
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = (wx * vx + wy * vy) / (vx * vx + vy * vy)
    t = max(0.0, min(1.0, t))
    return math.hypot(wx - vx * t, wy - vy * t)


def sample(x, y):
    """Egy mintavétel az egységnégyzetben (0..1). Visszaad: (r,g,b,a)."""
    cx, cy = x - 0.5, y - 0.5

    # háttér: lekerekített négyzet
    d = sd_round_rect(cx, cy, 0.5, 0.235)
    if d > 0.0:
        return (0, 0, 0, 0)

    # átmenet + enyhe fény
    t = (x + y) / 2
    r = lerp(BG_TOP[0], BG_BOTTOM[0], t)
    g = lerp(BG_TOP[1], BG_BOTTOM[1], t)
    b = lerp(BG_TOP[2], BG_BOTTOM[2], t)
    glow = max(0.0, 1.0 - math.hypot(cx + 0.18, cy + 0.2) * 2.1)
    r += 34 * glow
    g += 62 * glow
    b += 40 * glow

    # tiltás jel: körvonal
    dist_center = math.hypot(cx, cy)
    ring_r, ring_w = 0.305, 0.055
    ring = abs(dist_center - ring_r) - ring_w
    # átlós vonal
    line = sd_segment(cx, cy, -0.215, 0.215, 0.215, -0.215) - 0.055
    mark = min(ring, line)
    if mark <= 0.0:
        # jel színe: enyhén világosodó átmenet
        k = 0.5 - cy * 0.5
        r, g, b = (
            lerp(ACCENT[0], ACCENT_LIGHT[0], k),
            lerp(ACCENT[1], ACCENT_LIGHT[1], k),
            lerp(ACCENT[2], ACCENT_LIGHT[2], k),
        )

    # élsimítás a lekerekített négyzet szélén (1 mintapont ~ 1/SS pixel)
    a = 1.0 if d < -0.06 else max(0.0, min(1.0, -d / 0.06))
    return (r, g, b, a * 255.0)


def render(size):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc_r = acc_g = acc_b = acc_a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    y = (py + (sy + 0.5) / SS) / size
                    r, g, b, a = sample(x, y)
                    w = a / 255.0
                    acc_r += r * w
                    acc_g += g * w
                    acc_b += b * w
                    acc_a += a
            n = SS * SS
            a = acc_a / n
            if a > 0.5:
                r = acc_r / (acc_a / 255.0)
                g = acc_g / (acc_a / 255.0)
                b = acc_b / (acc_a / 255.0)
            else:
                r = g = b = 0
            row += bytes(
                (
                    max(0, min(255, int(r + 0.5))),
                    max(0, min(255, int(g + 0.5))),
                    max(0, min(255, int(b + 0.5))),
                    max(0, min(255, int(a + 0.5))),
                )
            )
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as fh:
        fh.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        rows = render(size)
        path = os.path.join(OUT_DIR, f'icon-{size}.png')
        write_png(path, size, rows)
        print(f'  {path}  ({os.path.getsize(path)} bytes)')


if __name__ == '__main__':
    main()
