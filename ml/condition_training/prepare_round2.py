"""Build a fresh, balanced experiment from reviewed old and newly downloaded data.

Whole-photo presence labels are deliberately used consistently; these are not
pixel-accurate crack locations. Original files and labels are never edited.
"""
import hashlib
import json
import math
import re
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'dataset/round2'
COMMONS_INTACT = {3,4,8,10,11,12,13,14,15,16,17,18,19,20,21,22,25,26,27,28,29,
    31,32,33,34,35,36,37,38,39,41,42,45,46,47,48,49,50,51,52,53,54,55,57,58,59,
    60,63,64,65,66,67,70,75,76,79,80,83,86,87,89,90,93,94,96,97,100,105,106,
    108,109,110,111,112,113,114,122,124,126,127,128,130,131,132}
# Human review of the contact sheet, NOT filenames or the inconsistent source labels.
TV_LAPTOP_DAMAGED = {0,2,4,6,10,14,16,18,20,22,24,28,33,35,37}
TV_AMBIGUOUS = {26,30}
TV_DAMAGED = set(range(47)) - TV_LAPTOP_DAMAGED - TV_AMBIGUOUS - {23,29,32}
TV_INTACT = {23,29,32,48,50,52,54,56,58,60,62,64,66,69,76,78,80,82,84,86,88}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def fingerprint(im):
    small = np.asarray(im.convert('L').resize((32,32)), dtype=float)
    basis = np.cos(np.pi / 32 * (np.arange(32)+.5)[None,:] * np.arange(8)[:,None])
    values = (basis @ small @ basis.T).flatten()[1:]
    return values > np.median(values)


def rgb(path):
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert('RGBA')
        canvas = Image.new('RGBA',image.size,'white')
        return Image.alpha_composite(canvas,image).convert('RGB')


def main():
    if OUT.exists():
        raise SystemExit('Round 2 already exists; refusing to overwrite it.')
    records, rejected = [], []
    old = read_json(ROOT/'dataset/manifest.json')
    archive = zipfile.ZipFile(Path.home()/'Downloads/laptop-defects.zip')
    original_labels = {Path(name).name:archive.read(name).decode() for name in archive.namelist() if '/labels/' in name and name.endswith('.txt')}
    serious = {0,1,3,4,5,6,8,9,10}
    for row in old['images']:
        path = ROOT/'dataset'/row['file']
        classes = row['classes']
        if classes == [1]:
            label_name = path.stem.removeprefix('laptop-defects__')+'.txt'
            original = original_labels.get(label_name)
            if original is None:
                raise SystemExit(f'Missing original laptop annotation: {label_name}')
            if not serious.intersection(int(line.split()[0]) for line in original.splitlines() if line.strip()):
                rejected.append(dict(file=str(path),reason='Only wear/stain/sticker labels; excluded from physical-damage training'))
                continue
        name = path.name.split('.rf.')[0]
        if classes == [1]:
            serial = re.search(r'laptop-defects__(\d{6,})', name)
            if serial: name = 'laptop-device-'+serial.group(1)
        records.append(dict(path=str(path),group=row['group'] if classes==[2] else name,
            classes=classes,source='original',fresh=False,
            forced='train' if classes==[2] else row['split'] if row['source'].startswith('axon') else None))
    # Previously reviewed DataCluster positives and intact laptop negatives.
    extended = read_json(ROOT/'dataset/v2/manifest.json')
    for row in extended['added']:
        records.append(dict(path=row['file'],group='datacluster-'+Path(row['file']).stem,
                            classes=[0],source='datacluster-reviewed',fresh=False,forced='train'))
    for path in read_json(ROOT/'dataset/v2/reviewed-laptop-negatives.json')['files']:
        serial = re.search(r'laptop-defects__(\d{6,})', Path(path).name)
        group = 'laptop-device-'+serial.group(1) if serial else 'reviewed-laptop-'+Path(path).name.split('.rf.')[0]
        records.append(dict(path=path,group=group,
                            classes=[],source='reviewed-intact-laptop',fresh=False,forced='train'))
    downloaded = read_json(ROOT/'sources/round2/manifest.json')['manifest']
    meta = {str(Path(x['file']).resolve()):x for x in downloaded}
    commons = read_json('reports/round2-commons-index.json')
    for index in sorted(COMMONS_INTACT | {120}):
        path = Path(commons[index]).resolve()
        title = meta[str(path)]['title'].lower()
        models = re.findall(r'galaxy[ _-]+[a-z0-9+]+|iphone(?:[ _-]*\d+[a-z]*)?|nokia[ _-]+[a-z0-9]+',title)
        group = 'commons-model-'+models[0] if models else 'commons-'+path.stem
        records.append(dict(path=str(path),group=group,classes=[0] if index==120 else [],
                            source='commons-reviewed',fresh=True,forced=None))
    for path in sorted((ROOT/'sources/round2/mhci/phone_originals').glob('*')):
        records.append(dict(path=str(path),group='mhci-'+path.stem,classes=[0],
                            source='mhci-damage-study',fresh=True,forced=None))
    tv = read_json('reports/round2-tv-index.json')
    for index,path in enumerate(tv):
        if index in TV_AMBIGUOUS:
            rejected.append(dict(file=path,reason='Ambiguous monitor/laptop identity in review'));continue
        classes = [1] if index in TV_LAPTOP_DAMAGED else [2] if index in TV_DAMAGED else []
        records.append(dict(path=path,group='hackathon-'+Path(path).stem,classes=classes,
            source='hackathon-reviewed',fresh=True,forced=None))
    # Reserve the earlier external diagnostics; don't train on their lookalikes.
    references = [c['path'] for c in read_json('reports/condition-baseline-independent.json')['cases']]
    protected = [fingerprint(rgb(path)) for path in references if Path(path).exists()]
    valid, hashes = [], {}
    for row in records:
        try:
            image = rgb(row['path'])
            row['phash'] = fingerprint(image)
            row['sha256'] = hashlib.sha256(Path(row['path']).read_bytes()).hexdigest()
            if row['fresh'] and any(np.count_nonzero(row['phash'] != value) <= 6 for value in protected):
                rejected.append(dict(file=row['path'],reason='Lookalike of reserved development diagnostic'));continue
            valid.append(row)
        except OSError as error:
            rejected.append(dict(file=row['path'],reason=str(error)))
    # Union exact duplicates, augmented originals, laptop serials, and near-duplicate new photos.
    parent=list(range(len(valid)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(a,b): parent[find(a)]=find(b)
    groups={}
    for i,row in enumerate(valid):
        for key,lookup in ((row['group'],groups),(row['sha256'],hashes)):
            if key in lookup: union(i,lookup[key])
            else: lookup[key]=i
    fresh=[i for i,row in enumerate(valid) if row['fresh']]
    for offset,i in enumerate(fresh):
        for j in fresh[:offset]:
            if np.count_nonzero(valid[i]['phash']!=valid[j]['phash']) <= 9: union(i,j)
    members={}
    for i,row in enumerate(valid): members.setdefault(find(i),[]).append(row)
    for rows in members.values():
        forced={r['forced'] for r in rows if r['forced']}
        if len(forced)>1:
            raise SystemExit('Forced split conflict: keep protected source groups separate.')
        seed=min(r['group'] for r in rows)
        bucket=int(hashlib.sha256(seed.encode()).hexdigest()[:8],16)%100
        split=next(iter(forced)) if forced else 'train' if bucket<70 else 'val' if bucket<85 else 'test'
        for row in rows: row['split']=split;row['group']=seed
    for index,row in enumerate(valid):
        row.pop('phash')
        target=OUT/'images'/row['split']/(f'{index:05d}__'+Path(row['path']).stem+'.jpg')
        target.parent.mkdir(parents=True,exist_ok=True)
        image=rgb(row['path']);image.thumbnail((1280,1280));image.save(target,quality=94)
        label=OUT/'labels'/row['split']/(target.stem+'.txt');label.parent.mkdir(parents=True,exist_ok=True)
        label.write_text(''.join(f'{c} 0.5 0.5 1 1\n' for c in row['classes']))
        row['file']=str(target)
    train=[row for row in valid if row['split']=='train']
    positives=[row['file'] for row in train if row['classes']]
    negatives=[row['file'] for row in train if not row['classes']]
    repeats=max(1,math.ceil(len(positives)/max(1,len(negatives))))
    draws=positives+negatives*repeats
    (OUT/'train.txt').write_text('\n'.join(draws)+'\n')
    for split in ('val','test'):
        (OUT/(split+'.txt')).write_text('\n'.join(row['file'] for row in valid if row['split']==split)+'\n')
    (OUT/'data.yaml').write_text(yaml.safe_dump(dict(path=str(OUT),train='train.txt',val='val.txt',test='test.txt',
        names={0:'damaged_phone',1:'damaged_laptop',2:'damaged_tv'})))
    summary=dict(splits=dict(Counter(r['split'] for r in valid)),sources=dict(Counter(r['source'] for r in valid)),
        train_positive_unique=len(positives),train_negative_unique=len(negatives),negative_repeat=repeats,
        train_draws=len(draws),fresh_test=len([r for r in valid if r['fresh'] and r['split']=='test']))
    (OUT/'manifest.json').write_text(json.dumps(dict(summary=summary,records=valid,rejected=rejected),indent=2))
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
