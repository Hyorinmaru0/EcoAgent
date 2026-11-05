"""Add manually reviewed DataCluster positives while reserving AXON lookalikes.

The independent phone benchmark must not be added to training. Hash screening
reduces duplicate leakage but cannot prove that different photos show different devices.
"""
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
REVIEWED = {1,2,3,4,5,8,9,21,24,26,27,28,30,31,34,35,37,43,45,46,49,50,53,
    54,56,58,60,61,62,63,64,65,70,72,74,75,77,78,79,80,83,89,90,91,92,94,95,
    102,118,120,122,131,132,134,135,136,137,138,139,140,141,142,148,149,150,151,
    155,163,164,165,166,167,168,169,170,173,178,183,184,185,186,187,188,189,
    190,191,193,194,201,204,205,207,208,210,211,212,213,214,215,217,218,220,
    222,226,228,229,230,231,232,233,234,235,236,237,240,241,242,244,245,246,
    247,248,249,250,251,252,255,256,257,258,259,262,263,264,266,267,268,
    270,271,273,274,275,276,277,280,281,282,283,285,286,287,288,289,290,291,
    294,297,299,300}


def fingerprint(im):
    gray = np.array(im.convert('L'))
    # Remove screenshot letterboxing before comparing with original photos.
    rows = np.flatnonzero(gray.mean(axis=1) > 10)
    cols = np.flatnonzero(gray.mean(axis=0) > 10)
    if len(rows) and len(cols):
        im = im.crop((int(cols[0]), int(rows[0]), int(cols[-1])+1, int(rows[-1])+1))
    small = np.array(im.convert('L').resize((32,32)), dtype=float)
    basis = np.cos(np.pi / 32 * (np.arange(32) + .5)[None,:] * np.arange(8)[:,None])
    low = (basis @ small @ basis.T).flatten()[1:]
    return low > np.median(low)


def main():
    out = ROOT / 'dataset/v2'
    if out.exists():
        raise SystemExit('v2 exists; refusing to overwrite an experiment.')
    reserved = []
    for p in sorted((ROOT / 'sources/axon-phone').rglob('*.PNG')):
        with Image.open(p) as im:
            reserved.append((p.name, fingerprint(im)))
    old = json.loads((ROOT / 'dataset/manifest.json').read_text())
    reserved_hashes = {r['sha256'] for r in old['images'] if r['split'] != 'train'}
    source = ROOT / 'sources/datacluster-cracked'
    added, excluded = [], []
    seen = set()
    for p in sorted(source.rglob('*.jpg')):
        number = int(re.search(r'\((\d+)\)', p.name).group(1))
        if number not in REVIEWED:
            continue
        sha = hashlib.sha256(p.read_bytes()).hexdigest()
        if sha in seen or sha in reserved_hashes:
            excluded.append(dict(file=p.name, reason='exact duplicate'))
            continue
        try:
            with Image.open(p) as raw:
                im = ImageOps.exif_transpose(raw).convert('RGB')
                fingerprints = [fingerprint(im)]
                annotation = next(source.rglob(p.stem + '.xml'))
                xml = ET.parse(annotation).getroot()
                for box in xml.findall('.//bndbox'):
                    coords = [float(box.findtext(k)) for k in ('xmin','ymin','xmax','ymax')]
                    fingerprints.append(fingerprint(im.crop(coords)))
        except (OSError, StopIteration, ValueError) as error:
            excluded.append(dict(file=p.name, reason=str(error)))
            continue
        closest = min((int(np.count_nonzero(a != b)), name)
                      for a in fingerprints for name,b in reserved)
        if closest[0] <= 13:
            excluded.append(dict(file=p.name, reason='resembles reserved AXON photo', match=closest))
            continue
        seen.add(sha)
        dest = out / 'images/train' / ('datacluster__' + p.name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Re-encode reviewed images, preserving originals and resolving EXIF consistently.
        im.thumbnail((1280,1280))
        im.save(dest, quality=92)
        label = out / 'labels/train' / (dest.stem + '.txt')
        label.parent.mkdir(parents=True, exist_ok=True)
        label.write_text('0 0.5 0.5 1 1\n')
        added.append(dict(file=str(dest), source_sha256=sha, nearest_reserved=closest))
    for split in ('train','val','test'):
        paths = [str(ROOT / 'dataset' / row['file']) for row in old['images'] if row['split']==split]
        if split == 'train':
            paths.extend(row['file'] for row in added)
        (out / (split + '.txt')).write_text('\n'.join(paths) + '\n')
    (out / 'data.yaml').write_text(yaml.safe_dump(dict(path=str(out),train='train.txt',
        val='val.txt',test='test.txt',names={0:'damaged_phone',1:'damaged_laptop',2:'damaged_tv'})))
    report = dict(added=added,excluded=excluded,reviewed_ids=sorted(REVIEWED),
        new_source='https://www.kaggle.com/datasets/dataclusterlabs/cracked-screen-dataset',
        license='CC0 as declared by Kaggle publisher',
        limitations=['Perceptual hashes do not guarantee device-level independence.',
                    'AXON now serves as a development benchmark, not a final accuracy estimate.'])
    (out / 'manifest.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(dict(added=len(added),excluded=len(excluded))))


if __name__ == '__main__':
    main()
