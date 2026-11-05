"""Apply final contact-sheet corrections and audit actual experiment split lists."""
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from prepare_round2 import ROOT, OUT, TV_AMBIGUOUS, TV_LAPTOP_DAMAGED, TV_DAMAGED, read_json


def main():
    manifest=read_json(OUT/'manifest.json')
    tv={str(Path(path).resolve()):i for i,path in enumerate(read_json('reports/round2-tv-index.json'))}
    records=[]
    for row in manifest['records']:
        if row['source']=='hackathon-reviewed':
            index=tv[str(Path(row['path']).resolve())]
            if index in TV_AMBIGUOUS:
                manifest['rejected'].append(dict(file=row['path'],reason='Ambiguous monitor/laptop identity'));continue
            row['classes']=[1] if index in TV_LAPTOP_DAMAGED else [2] if index in TV_DAMAGED else []
        serial=re.search(r'laptop-defects__(\d{6,})',Path(row['path']).name)
        if serial: row['group']='laptop-device-'+serial.group(1)
        records.append(row)
    grouped=defaultdict(list)
    for row in records:grouped[row['group']].append(row)
    for group,rows in grouped.items():
        forced={r['forced'] for r in rows if r['forced']}
        if len(forced)>1:raise SystemExit('Conflicting source-group assignments')
        if forced:
            split=next(iter(forced))
        else:
            bucket=int(hashlib.sha256(group.encode()).hexdigest()[:8],16)%100
            split='train' if bucket<70 else 'val' if bucket<85 else 'test'
        for row in rows:row['split']=split
    for row in records:
        image=Path(row['file']);label=image.parent.parent.parent/'labels'/image.parent.name/(image.stem+'.txt')
        label.write_text(''.join(f'{c} 0.5 0.5 1 1\n' for c in row['classes']))
    train=[r for r in records if r['split']=='train']
    pos=[r['file'] for r in train if r['classes']];neg=[r['file'] for r in train if not r['classes']]
    repeats=math.ceil(len(pos)/len(neg));draws=pos+neg*repeats
    (OUT/'train.txt').write_text('\n'.join(draws)+'\n')
    for split in ('val','test'):
        (OUT/(split+'.txt')).write_text('\n'.join(r['file'] for r in records if r['split']==split)+'\n')
    for key in ('group','sha256'):
        seen=defaultdict(set)
        for row in records:seen[row[key]].add(row['split'])
        if any(len(splits)>1 for splits in seen.values()):raise SystemExit(f'{key} crosses experiment splits')
    summary=dict(splits=dict(Counter(r['split'] for r in records)),sources=dict(Counter(r['source'] for r in records)),
        train_positive_unique=len(pos),train_negative_unique=len(neg),negative_repeat=repeats,
        train_draws=len(draws),fresh_test=len([r for r in records if r['fresh'] and r['split']=='test']),
        fresh_test_counts=dict(Counter('negative' if not r['classes'] else str(r['classes'][0]) for r in records if r['fresh'] and r['split']=='test')))
    manifest.update(records=records,summary=summary,reviewFinalized=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    Path('reports/round2-training-data-summary.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
