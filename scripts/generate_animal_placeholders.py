from PIL import Image, ImageDraw, ImageFont
import os

# Repo root is parent of this script's directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))

animals = [
    'walrus','tiger','sloth','skunk','sheep','seal','seahorse','seagull',
    'scorpion','salamander','rabbit','pufferfish','pig','peacock','parrot','panther'
]

out_paths = [os.path.join(REPO_ROOT, 'ZoomGame', 'assets', 'images', 'animals', f + '.jpg') for f in animals]

colors = [
    (239, 71, 111),(255, 209, 102),(6, 214, 160),(17, 138, 178),
    (7, 59, 76),(255, 110, 64),(168, 85, 247),(255, 179, 71)
]

W, H = 800, 600

font = None
try:
    font = ImageFont.truetype("arial.ttf", 48)
except Exception:
    font = ImageFont.load_default()

for i, path in enumerate(out_paths):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bg = colors[i % len(colors)]
    img = Image.new('RGB', (W, H), color=bg)
    draw = ImageDraw.Draw(img)
    text = animals[i].replace('_',' ').title()
    w, h = draw.textsize(text, font=font)
    draw.text(((W-w)/2, (H-h)/2), text, fill=(255,255,255), font=font)
    img.save(path, format='JPEG', quality=85)
    print('Wrote', path)

print('Done generating', len(out_paths), 'images')
