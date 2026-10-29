"""Check image-label pairing, image readability, class IDs, and YOLO boxes."""
import math
from pathlib import Path
from PIL import Image


def main():
    root = Path(__file__).resolve().parent / 'dataset'
    seen = set()
    total_boxes = 0
    for split in ('train', 'val'):
        images = {p.stem: p for p in (root / 'images' / split).glob('*.jpg')}
        labels = {p.stem: p for p in (root / 'labels' / split).glob('*.txt')}
        if not images or set(images) != set(labels):
            raise ValueError(f'{split}: empty split or mismatched image and label filenames')
        if seen.intersection(images):
            raise ValueError('An image name appears in both train and val')
        seen.update(images)
        boxes = 0
        for stem, image_path in images.items():
            with Image.open(image_path) as image:
                image.verify()
            lines = labels[stem].read_text(encoding='utf-8-sig').splitlines()
            if not any(line.strip() for line in lines):
                raise ValueError(f'{stem}: expected one damaged_tv annotation')
            for line in lines:
                if not line.strip():
                    continue
                fields = line.split()
                if len(fields) != 5 or fields[0] != '0':
                    raise ValueError(f'{stem}: invalid YOLO row or class ID')
                x, y, w, h = map(float, fields[1:])
                if not all(math.isfinite(v) and 0 <= v <= 1 for v in (x, y, w, h)) or w <= 0 or h <= 0:
                    raise ValueError(f'{stem}: invalid normalized coordinates')
                if min(x-w/2, y-h/2) < -1e-5 or max(x+w/2, y+h/2) > 1.00001:
                    raise ValueError(f'{stem}: bounding box outside image')
                boxes += 1
        total_boxes += boxes
        print(f'{split}: {len(images)} readable images, {len(labels)} labels, {boxes} boxes')
    print(f'PASS: {len(seen)} images and {total_boxes} boxes. Class 0 = damaged_tv.')
    print('These are same-video practice splits, not an independent evaluation.')


if __name__ == '__main__':
    main()
