#!/usr/bin/env python3
"""
scripts/branding/build_brand_assets.py
Deterministic brand-asset generation pipeline for Cropmatics.
Derived exclusively from canonical source: cropmaticlogo.png
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SOURCE_LOGO_PATH = REPO_ROOT / "cropmaticlogo.png"

MOBILE_BRANDING_DIR = REPO_ROOT / "apps" / "mobile" / "assets" / "branding"
WEB_BRANDING_DIR = REPO_ROOT / "apps" / "web" / "public" / "branding"

COLOR_FOREST_DEEP = (3, 45, 35)       # #032D23
COLOR_FOREST = (7, 61, 45)            # #073D2D
COLOR_PRIMARY = (8, 127, 91)          # #087F5B
COLOR_MINT = (221, 245, 235)          # #DDF5EB
COLOR_SURFACE_LIGHT = (247, 250, 248) # #F7FAF8
COLOR_WHITE = (255, 255, 255)


def extract_mark_transparent(src_img: Image.Image) -> Image.Image:
    """Extracts the iconic Cropmatics graphical mark with transparent background."""
    arr = np.array(src_img.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape

    corner_mask = np.zeros((h, w), dtype=bool)
    corner_mask[:100, :100] = True
    corner_mask[:100, -100:] = True
    corner_mask[-100:, :100] = True
    corner_mask[-100:, -100:] = True
    bg_sample = arr[corner_mask]
    mean_bg = np.median(bg_sample, axis=0)

    diff = np.sqrt(np.sum((arr - mean_bg) ** 2, axis=-1))
    alpha = np.clip((diff - 28.0) / 20.0, 0.0, 1.0)

    cy, cx = 555.5, 618.5
    y_coords, x_coords = np.ogrid[:h, :w]
    dist_from_mark_center = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2)
    alpha[dist_from_mark_center > 520] = 0.0
    alpha[:165, :] = 0.0

    out_arr = np.zeros((h, w, 4), dtype=np.uint8)
    out_arr[:, :, :3] = np.array(src_img.convert("RGB"))
    out_arr[:, :, 3] = (alpha * 255).astype(np.uint8)

    isolated = Image.fromarray(out_arr, mode="RGBA")
    bbox = isolated.getbbox()
    return isolated.crop(bbox)
def create_centered_canvas(
    img: Image.Image,
    canvas_size: tuple[int, int],
    target_content_size: int,
    bg_color: tuple[int, int, int, int] | tuple[int, int, int] | None = None,
) -> Image.Image:
    """Places an image centered inside a target canvas with padding."""
    if bg_color is None:
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    elif len(bg_color) == 3:
        canvas = Image.new("RGBA", canvas_size, (*bg_color, 255))
    else:
        canvas = Image.new("RGBA", canvas_size, bg_color)

    w, h = img.size
    scale = min(target_content_size / w, target_content_size / h)
    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    offset_x = (canvas_size[0] - new_w) // 2
    offset_y = (canvas_size[1] - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)
    return canvas


def create_horizontal_brand(mark: Image.Image, height: int = 120, on_dark: bool = False) -> Image.Image:
    """Creates a horizontal lockup: [Mark] Cropmatics."""
    mark_h = int(height * 0.82)
    mark_w = int(mark.width * (mark_h / mark.height))
    resized_mark = mark.resize((mark_w, mark_h), Image.Resampling.LANCZOS)

    canvas_w = int(mark_w + height * 3.8)
    canvas_h = height
    brand_img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    mark_y = (canvas_h - mark_h) // 2
    brand_img.paste(resized_mark, (10, mark_y), resized_mark)

    draw = ImageDraw.Draw(brand_img)
    text_x = mark_w + 24

    try:
        font_main = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", int(height * 0.38), index=0)
        font_sub = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", int(height * 0.22), index=0)
    except Exception:
        try:
            font_main = ImageFont.truetype("Arial", int(height * 0.38))
            font_sub = ImageFont.truetype("Arial", int(height * 0.22))
        except Exception:
            font_main = ImageFont.load_default()
            font_sub = ImageFont.load_default()

    main_color = COLOR_WHITE if on_dark else COLOR_FOREST_DEEP
    sub_color = COLOR_MINT if on_dark else COLOR_PRIMARY

    draw.text((text_x, int(canvas_h * 0.20)), "Cropmatics", fill=main_color, font=font_main)
    draw.text((text_x, int(canvas_h * 0.58)), "RWANDA", fill=sub_color, font=font_sub)

    bbox = brand_img.getbbox()
    if bbox:
        brand_img = brand_img.crop((0, 0, min(canvas_w, bbox[2] + 16), canvas_h))

    return brand_img


def create_monochrome_icon(mark: Image.Image, size: tuple[int, int] = (1024, 1024)) -> Image.Image:
    """Creates a clean single-color Android monochrome / themed icon."""
    scaled = create_centered_canvas(mark, size, target_content_size=620)
    arr = np.array(scaled)
    white_arr = np.zeros_like(arr)
    white_arr[:, :, :3] = 255
    white_arr[:, :, 3] = arr[:, :, 3]
    return Image.fromarray(white_arr, mode="RGBA")


def build_all():
    print(f"[branding] Reading canonical source from: {SOURCE_LOGO_PATH}")
    src_img = Image.open(SOURCE_LOGO_PATH)
    print(f"[branding] Source size: {src_img.size}")

    MOBILE_BRANDING_DIR.mkdir(parents=True, exist_ok=True)
    WEB_BRANDING_DIR.mkdir(parents=True, exist_ok=True)

    print("[branding] Extracting graphical mark without background...")
    mark_transparent = extract_mark_transparent(src_img)
    print(f"[branding] Extracted mark size: {mark_transparent.size}")

    mark_transparent.save(MOBILE_BRANDING_DIR / "cropmatics-logo-mark.png", optimize=True)
    mark_transparent.save(WEB_BRANDING_DIR / "cropmatics-mark.png", optimize=True)

    src_img.save(MOBILE_BRANDING_DIR / "cropmatics-logo-source.png", optimize=True)
    src_img.save(MOBILE_BRANDING_DIR / "cropmatics-logo-full.png", optimize=True)

    print("[branding] Generating app-icon-1024.png...")
    app_icon = create_centered_canvas(
        mark_transparent,
        (1024, 1024),
        target_content_size=700,
        bg_color=COLOR_FOREST_DEEP,
    )
    app_icon.save(MOBILE_BRANDING_DIR / "app-icon-1024.png", optimize=True)

    print("[branding] Generating adaptive-icon-foreground.png and background...")
    adaptive_fg = create_centered_canvas(
        mark_transparent,
        (1024, 1024),
        target_content_size=540,
        bg_color=None,
    )
    adaptive_fg.save(MOBILE_BRANDING_DIR / "adaptive-icon-foreground.png", optimize=True)

    adaptive_bg = Image.new("RGBA", (1024, 1024), (*COLOR_FOREST_DEEP, 255))
    adaptive_bg.save(MOBILE_BRANDING_DIR / "adaptive-icon-background.png", optimize=True)

    print("[branding] Generating android-monochrome-icon.png...")
    monochrome = create_monochrome_icon(mark_transparent, (1024, 1024))
    monochrome.save(MOBILE_BRANDING_DIR / "android-monochrome-icon.png", optimize=True)

    print("[branding] Generating splash-logo.png...")
    splash_logo = create_centered_canvas(
        mark_transparent,
        (512, 512),
        target_content_size=420,
        bg_color=None,
    )
    splash_logo.save(MOBILE_BRANDING_DIR / "splash-logo.png", optimize=True)

    print("[branding] Generating notification-icon.png...")
    notif_icon = create_monochrome_icon(mark_transparent, (96, 96))
    notif_icon.save(MOBILE_BRANDING_DIR / "notification-icon.png", optimize=True)

    print("[branding] Generating header and horizontal brand logos...")
    header_logo = create_horizontal_brand(mark_transparent, height=100, on_dark=False)
    header_logo.save(MOBILE_BRANDING_DIR / "cropmatics-logo-header.png", optimize=True)

    web_logo_horizontal = create_horizontal_brand(mark_transparent, height=120, on_dark=False)
    web_logo_horizontal.save(WEB_BRANDING_DIR / "cropmatics-logo-horizontal.png", optimize=True)
    web_logo_horizontal.save(WEB_BRANDING_DIR / "cropmatics-logo.png", optimize=True)

    print("[branding] Generating web icons and favicons...")
    fav32 = create_centered_canvas(mark_transparent, (32, 32), target_content_size=28, bg_color=None)
    fav32.save(WEB_BRANDING_DIR / "favicon-32.png", optimize=True)

    fav64 = create_centered_canvas(mark_transparent, (64, 64), target_content_size=56, bg_color=None)
    fav64.save(WEB_BRANDING_DIR / "favicon-64.png", optimize=True)

    icon192 = create_centered_canvas(mark_transparent, (192, 192), target_content_size=150, bg_color=COLOR_FOREST_DEEP)
    icon192.save(WEB_BRANDING_DIR / "icon-192.png", optimize=True)

    icon512 = create_centered_canvas(mark_transparent, (512, 512), target_content_size=400, bg_color=COLOR_FOREST_DEEP)
    icon512.save(WEB_BRANDING_DIR / "icon-512.png", optimize=True)

    apple_touch = create_centered_canvas(mark_transparent, (180, 180), target_content_size=140, bg_color=COLOR_FOREST_DEEP)
    apple_touch.save(WEB_BRANDING_DIR / "apple-touch-icon.png", optimize=True)

    print("[branding] All branding assets generated successfully!")


if __name__ == "__main__":
    build_all()

