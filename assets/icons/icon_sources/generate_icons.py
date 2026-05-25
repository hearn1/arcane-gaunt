"""Generate ArcaneGaunt icon files (PNG + multi-resolution ICO).

Run from the project root:
    python assets/icons/icon_sources/generate_icons.py

Requires Pillow: pip install Pillow
"""
import struct
import zlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ICO_PATH = PROJECT_ROOT / "assets" / "icons" / "arcane.ico"
PNG_PATH = PROJECT_ROOT / "assets" / "icons" / "arcane.png"
ICON_SIZES = [16, 24, 32, 48, 64, 128, 256]

PALETTE = {
    "bg_start": (0x9A, 0x6C, 0xFF),  # purple --accent
    "bg_end": (0x5C, 0xC8, 0xFF),    # blue --accent2
    "text": (0xFF, 0xFF, 0xFF),
    "text_shadow": (0x6A, 0x44, 0xCC),
    "ring": (0xCC, 0xA8, 0xFF),
    "ring_inner": (0x8A, 0xD0, 0xFF),
}


def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def draw_icon(size):
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = cy = size // 2
    r = size // 2 - 2

    # Rounded-rect gradient background
    for y in range(size):
        t = y / size if size > 1 else 0
        color = lerp_color(PALETTE["bg_start"], PALETTE["bg_end"], t)
        for x in range(size):
            # Simple rounded rect test: corners are clipped
            dx = abs(x - cx)
            dy = abs(y - cy)
            cr = r * 0.28  # corner radius
            if dx > r - cr and dy > r - cr:
                # Distance from corner
                corner_x = (r - cr) if x > cx else -(r - cr)
                corner_y = (r - cr) if y > cy else -(r - cr)
                dist = ((x - (cx + corner_x)) ** 2 + (y - (cy + corner_y)) ** 2) ** 0.5
                if dist > cr:
                    continue
            if dx <= r and dy <= r:
                img.putpixel((x, y), color)

    # Outer ring
    ring_r1 = int(r * 0.55)
    ring_r2 = int(r * 0.50)
    draw.ellipse(
        [cx - ring_r1, cy - ring_r1, cx + ring_r1, cy + ring_r1],
        outline=PALETTE["ring"],
        width=max(1, size // 80 + 1),
    )
    draw.ellipse(
        [cx - ring_r2, cy - ring_r2, cx + ring_r2, cy + ring_r2],
        outline=PALETTE["ring_inner"],
        width=max(1, size // 120 + 1),
    )

    # Diamond in center
    d_r = int(r * 0.30)
    diamond = [
        (cx, cy - d_r),
        (cx + d_r, cy),
        (cx, cy + d_r),
        (cx - d_r, cy),
    ]
    draw.polygon(diamond, outline=PALETTE["ring"], width=max(1, size // 100 + 1))

    # "A" letter
    font_size = max(10, size // 2)
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("segoeui.ttf", font_size)
    except (OSError, ImportError):
        font = ImageFont.load_default()

    text = "AG"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = (size - th) // 2

    # Shadow
    shadow_offset = max(1, size // 80)
    draw.text((tx + shadow_offset, ty + shadow_offset), text,
              fill=PALETTE["text_shadow"], font=font)
    draw.text((tx, ty), text, fill=PALETTE["text"], font=font)

    return img


def create_ico(sizes, img_fn):
    """Create .ico from multiple PNG frames."""
    headers = []
    payloads = []
    for s in sizes:
        img = img_fn(s)
        png_data = png_bytes(img)
        payloads.append(png_data)
        headers.append({
            "width": s if s < 256 else 0,
            "height": s if s < 256 else 0,
            "palette": 0,
            "reserved": 0,
            "planes": 1,
            "bpp": 32,
            "size": len(png_data),
            "offset": 0,
        })

    ico_header = struct.pack("<HHH", 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    for h in headers:
        h["offset"] = offset
        offset += h["size"]

    with open(ICO_PATH, "wb") as f:
        f.write(ico_header)
        for h in headers:
            f.write(struct.pack(
                "<BBBBHHII",
                h["width"],
                h["height"],
                h["palette"],
                h["reserved"],
                h["planes"],
                h["bpp"],
                h["size"],
                h["offset"],
            ))
        for p in payloads:
            f.write(p)

    print(f"Wrote {ICO_PATH} ({len(sizes)} sizes, {offset} bytes)")


def png_bytes(img):
    """Serialize PIL Image to PNG bytes manually (no file roundtrip)."""
    from PIL import Image
    raw = img.tobytes()
    height = img.height
    width = img.width

    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat_data = b""
    stride = width * 4
    for y in range(height):
        idat_data += b"\x00"  # filter none
        start = y * stride
        idat_data += raw[start:start + stride]
    compressed = zlib.compress(idat_data)
    iend = b""
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", iend)


def main():
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: Pillow is required. Install: pip install Pillow")
        return 1

    # Generate 512x512 PNG
    img = draw_icon(512)
    img.save(PNG_PATH, "PNG")
    print(f"Wrote {PNG_PATH} (512x512)")

    # Generate multi-resolution ICO
    create_ico(ICON_SIZES, draw_icon)

    return 0


if __name__ == "__main__":
    exit(main())
