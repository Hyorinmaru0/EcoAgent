"""Create an isolated, source-grouped visible-damage experiment; never edit originals."""
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ml/condition_training/dataset'


def main():
    if OUT.exists():
        raise SystemExit('Dataset already exists; preserve it and use a new experiment directory.')
    records = []
    source = ROOT / 'ml/damage_detection/dataset_whole'
    for image in sorted((source / 'images').glob('*/*')):
        label = source / 'labels' / image.parent.name / (image.stem + '.txt')
        rows = label.read_text().strip().splitlines()
        # Unannotated laptop photos are not proven healthy: omit rather than invent labels.
        if not rows:
            continue
        classes = sorted({int(row.split()[0]) for row in rows})
        group = image.name.split('.rf.')[0]
        # All frames of the one TV recording stay in training, never independent evaluation.
        if image.name.startswith('tv') or classes == [2]:
            group, split = 'tv-single-recording', 'train'
        else:
            bucket = int(hashlib.sha256(group.encode()).hexdigest()[:8], 16) % 100
            split = 'train' if bucket < 80 else 'val' if bucket < 90 else 'test'
        records.append((image, group, split, classes, 'existing-reviewed-damage'))
    phones = ROOT / 'ml/condition_training/sources/axon-phone/Image_phones'
    # These photos mean no visible damage, never evidence that electronics work.
    for image in sorted(phones.glob('*.png')):
        bucket = int(hashlib.sha256(image.name.encode()).hexdigest()[:8], 16) % 100
        split = 'train' if bucket < 75 else 'val' if bucket < 88 else 'test'
        records.append((image, 'axon-intact-' + image.stem, split, [], 'axon-intact-public-sample'))
    manifest, counts = [], Counter()
    for image, group, split, classes, source_name in records:
        name = image.name if source_name.startswith('existing') else 'axon-intact__' + image.name
        dest = OUT / 'images' / split / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, dest)
        labels = OUT / 'labels' / split / (dest.stem + '.txt')
        labels.parent.mkdir(parents=True, exist_ok=True)
        labels.write_text(''.join(f'{c} 0.5 0.5 1 1\n' for c in classes))
        counts[split] += 1
        manifest.append(dict(file=str(dest.relative_to(OUT)), group=group, split=split,
                             classes=classes, source=source_name,
                             sha256=hashlib.sha256(image.read_bytes()).hexdigest()))
    for key in ('group', 'sha256'):
        splits = {}
        for row in manifest:
            splits.setdefault(row[key], set()).add(row['split'])
        if any(len(value) > 1 for value in splits.values()):
            raise SystemExit(f'Cross-split {key} leakage detected; do not train.')
    (OUT / 'data.yaml').write_text(yaml.safe_dump(dict(path=str(OUT), train='images/train',
        val='images/val', test='images/test', names={0:'damaged_phone',1:'damaged_laptop',2:'damaged_tv'})))
    report = dict(counts=dict(counts), images=manifest, limitations=[
        'Whole-image presence labels, not pixel-accurate damage localization.',
        'No independent damaged-TV evaluation: all frames belong to one recording.',
        'Training must start from general pretraining, not the old damage checkpoint that saw previous splits.',
        'Working and electrically broken cannot be established from a photograph.',
        'Augmented originals grouped by filename before .rf.; unrelated near-duplicates may remain.'])
    (OUT / 'manifest.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(dict(counts=dict(counts), total=len(manifest)), indent=2))


if __name__ == '__main__':
    main()
