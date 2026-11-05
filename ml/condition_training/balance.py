"""Repeat training-only intact examples to correct positive/negative imbalance."""
import json
from pathlib import Path

import yaml


def main():
    root = Path(__file__).resolve().parent
    source, out = root / 'dataset/v2', root / 'dataset/v3'
    if out.exists():
        raise SystemExit('v3 already exists; refusing to overwrite an experiment.')
    lines = (source / 'train.txt').read_text().splitlines()
    phones = [s for s in lines if 'axon-intact__' in s]
    laptops = [s for s in lines if 'reviewed-intact__' in s]
    balanced = lines + phones * 19 + laptops * 9
    out.mkdir()
    (out / 'train.txt').write_text('\n'.join(balanced) + '\n')
    (out / 'data.yaml').write_text(yaml.safe_dump(dict(path=str(out),train='train.txt',
        val=str(source / 'val.txt'),test=str(source / 'test.txt'),
        names={0:'damaged_phone',1:'damaged_laptop',2:'damaged_tv'})))
    (out / 'manifest.json').write_text(json.dumps(dict(unique_training_images=len(lines),
        training_draws=len(balanced),intact_phone_unique=len(phones),intact_phone_repeat=20,
        intact_laptop_unique=len(laptops),intact_laptop_repeat=10,
        reason='Balance training without adding held-out examples or inventing new images.'),indent=2))
    print(f'{len(lines)} unique images; {len(balanced)} training draws.')


if __name__ == '__main__':
    main()
