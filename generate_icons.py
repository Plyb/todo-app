"""Generate solid-color PWA icons using only Python stdlib (no pip required)."""

import os
import struct
import zlib

ICONS_DIR = os.path.join(os.path.dirname(__file__), "public", "icons")
# Blue matching theme_color in vite.config.ts (#2563eb)
FILL_COLOR = (37, 99, 235, 255)  # RGBA


def write_png(path: str, width: int, height: int, rgba: tuple) -> None:
    r, g, b, a = rgba

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b""
    row = b"\x00" + bytes([r, g, b, a]) * width
    raw = zlib.compress(row * height, 9)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", raw)
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    sizes = [
        ("icon-192.png", 192, 192),
        ("icon-512.png", 512, 512),
        ("apple-touch-icon.png", 180, 180),
    ]
    for name, w, h in sizes:
        path = os.path.join(ICONS_DIR, name)
        write_png(path, w, h, FILL_COLOR)
        print(f"  wrote {path} ({w}x{h})")


if __name__ == "__main__":
    main()
