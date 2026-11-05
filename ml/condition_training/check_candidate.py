"""Compare isolated ONNX candidates with existing weights on held-out photo presence.

This is NOT functional-condition accuracy or a localization benchmark.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ml/tv_training'))
from onnx_detector import OnnxDetector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--weights', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = ROOT / 'ml/condition_training'
    manifest = json.loads((root / 'dataset/manifest.json').read_text())
    cases = []
    # New broken photos were never added to training or validation.
    # Exclude two ambiguous low-resolution examples during visual review, before evaluation.
    for image in sorted((root / 'sources/axon-phone/Image_brokenphones').glob('*.PNG')):
        if image.name in {'IMG_5412.PNG', 'IMG_5427.PNG'}:
            continue
        cases.append(dict(path=str(image), target=0, positive=True, source='axon-independent-broken'))
    for row in manifest['images']:
        if row['split'] == 'test' and row['source'] == 'axon-intact-public-sample':
            cases.append(dict(path=str(root / 'dataset' / row['file']), target=0,
                              positive=False, source='axon-heldout-intact'))
    # Two photographed devices; the Dnipro TV has two views, not two independent devices.
    for image in sorted((root / 'sources/commons-tv').glob('*.jpg')):
        cases.append(dict(path=str(image), target=2, positive=True, source='commons-independent-tv'))
    local_manifest = ROOT / 'reports/keypad-full-manifest.local.json'
    if local_manifest.exists():
        for row in json.loads(local_manifest.read_text()):
            p = Path(row['path'])
            if not p.exists():
                continue
            label = row['expected']
            # Previously reviewed intact stock photos and explicit visible-damage examples.
            if p.name.startswith('ecocycle-') and label in {'Mobile Phone','Laptop','TV'}:
                cases.append(dict(path=str(p),target={'Mobile Phone':0,'Laptop':1,'TV':2}[label],
                                  positive=False,source='local-reviewed-intact-regression'))
            elif '12065828093330899766' in p.name:
                cases.append(dict(path=str(p),target=0,positive=True,source='user-shattered-phone-regression'))
    detector = OnnxDetector(args.weights, threads=2)
    for case in cases:
        with Image.open(case['path']) as image:
            detections = detector.predict(ImageOps.exif_transpose(image).convert('RGB'), .01, 20)
        case['score'] = max((score for cls, score, _ in detections if cls == case['target']), default=0.)
        case['top_predictions'] = [dict(label=detector.names[c],score=s) for c,s,_ in detections[:3]]
    summary = {}
    for threshold in (.25,.5,.7):
        by_source = {}
        for source in sorted({case['source'] for case in cases}):
            rows = [case for case in cases if case['source'] == source]
            by_source[source] = dict(total=len(rows), correct=sum(
                (case['score'] >= threshold) == case['positive'] for case in rows))
        summary[str(threshold)] = by_source
    report = dict(weights=str(args.weights), thresholds=summary, cases=cases,
                  limitations=['Small convenience sample; not overall real-world accuracy.',
                      'Phone cracked sample can contain duplicate device views.',
                      'TV sample is only two devices with three photos.',
                      'No independent intact-TV or laptop-negative benchmark available.',
                      'Visible damage only; no working/nonworking ground truth.'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
