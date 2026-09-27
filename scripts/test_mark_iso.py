from PIL import Image
import numpy as np

src = Image.open('cropmaticlogo.png').convert('RGB')
arr = np.array(src, dtype=np.float32)

corner_mask = np.zeros((src.height, src.width), dtype=bool)
corner_mask[:100, :100] = True
corner_mask[:100, -100:] = True
corner_mask[-100:, :100] = True
corner_mask[-100:, -100:] = True

bg_sample = arr[corner_mask]
mean_bg = np.median(bg_sample, axis=0)
print("Median background RGB:", mean_bg)

diff = np.sqrt(np.sum((arr - mean_bg)**2, axis=-1))

alpha = np.clip((diff - 28.0) / 18.0, 0.0, 1.0)

cy, cx = 555.5, 618.5
y_coords, x_coords = np.ogrid[:src.height, :src.width]
dist_from_mark_center = np.sqrt((x_coords - cx)**2 + (y_coords - cy)**2)
alpha[dist_from_mark_center > 520] = 0.0

out_arr = np.zeros((src.height, src.width, 4), dtype=np.uint8)
out_arr[:, :, :3] = np.array(src)
out_arr[:, :, 3] = (alpha * 255).astype(np.uint8)

isolated = Image.fromarray(out_arr, mode='RGBA')
bbox = isolated.getbbox()
print("Isolated mark bbox:", bbox)
mark_cropped = isolated.crop(bbox)
print("Mark cropped size:", mark_cropped.size)
mark_cropped.save('/tmp/clean_mark.png')
print("Saved /tmp/clean_mark.png")
