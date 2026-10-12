from pathlib import Path

from PIL import Image, ImageDraw

repo_root = Path(".").resolve()
app_icon = Image.open(repo_root / "apps/mobile/assets/branding/app-icon-1024.png").convert("RGBA")
res_dir = repo_root / "apps/mobile/android/app/src/main/res"

densities = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

for folder, size in densities.items():
    target_dir = res_dir / folder
    if target_dir.exists():
        icon_square = app_icon.resize((size, size), Image.Resampling.LANCZOS)
        icon_square.save(target_dir / "ic_launcher.png")

        mask = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size, size), fill=255)

        icon_round = icon_square.copy()
        icon_round.putalpha(mask)
        icon_round.save(target_dir / "ic_launcher_round.png")
        print(f"Updated {folder} ({size}x{size})")

print("Android launcher mipmaps updated!")
