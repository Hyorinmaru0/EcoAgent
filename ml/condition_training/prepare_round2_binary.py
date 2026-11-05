"""Same reviewed split, single damage-presence class; identity stays in its own model."""
import json
import math
import os
import shutil
from pathlib import Path

import yaml

ROOT=Path(__file__).resolve().parent


def main():
    original=json.loads((ROOT/'dataset/round2/manifest.json').read_text(encoding='utf-8'))
    out=ROOT/'dataset/round2-binary'
    if out.exists():raise SystemExit('Binary experiment already exists; refusing to overwrite it.')
    records=[]
    for row in original['records']:
        image=Path(row['file']);target=out/'images'/row['split']/image.name
        target.parent.mkdir(parents=True,exist_ok=True)
        try:os.link(image,target)
        except OSError:shutil.copy2(image,target)
        label=out/'labels'/row['split']/(target.stem+'.txt');label.parent.mkdir(parents=True,exist_ok=True)
        label.write_text('0 0.5 0.5 1 1\n' if row['classes'] else '')
        records.append({**row,'file':str(target)})
    train=[r for r in records if r['split']=='train']
    positive=[r['file'] for r in train if r['classes']];negative=[r['file'] for r in train if not r['classes']]
    draws=positive+negative*math.ceil(len(positive)/len(negative))
    (out/'train.txt').write_text('\n'.join(draws)+'\n')
    for split in ('val','test'):(out/(split+'.txt')).write_text('\n'.join(r['file'] for r in records if r['split']==split)+'\n')
    (out/'data.yaml').write_text(yaml.safe_dump(dict(path=str(out),train='train.txt',val='val.txt',test='test.txt',names={0:'visible_damage'})))
    (out/'manifest.json').write_text(json.dumps(dict(records=records,
        summary=original['summary'],label_mode='binary-damage-presence',
        note='records.classes retains the device category for stratified evaluation only; YOLO labels are binary.'),indent=2))
    print('Prepared binary labels for',len(records),'unique photos; existing labels and images preserved.')


if __name__=='__main__':main()
