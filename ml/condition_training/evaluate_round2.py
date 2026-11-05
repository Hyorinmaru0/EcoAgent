"""Photo-presence evaluation, distinct from localization mAP and electrical function."""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ml/tv_training'))
from onnx_detector import OnnxDetector


def summarize(cases,threshold=.5):
    positives=[r for r in cases if r['classes']]
    negatives=[r for r in cases if not r['classes']]
    per_class={}
    for c,name in enumerate(('damaged_phone','damaged_laptop','damaged_tv')):
        rows=[r for r in positives if c in r['classes']]
        per_class[name]=dict(total=len(rows),detected=sum(r['scores'][c]>=threshold for r in rows))
    negative_correct=sum(max(r['scores'])<threshold for r in negatives)
    recall=sum(r['scores'][r['classes'][0]]>=threshold for r in positives)/max(1,len(positives))
    specificity=negative_correct/max(1,len(negatives))
    exact=sum(((max(r['scores'])>=threshold)==bool(r['classes'])) if r.get('presence_only')
              else {c for c,s in enumerate(r['scores']) if s>=threshold}==set(r['classes']) for r in cases)
    return dict(total=len(cases),threshold=threshold,positive_total=len(positives),
        positive_detected=sum(r['scores'][r['classes'][0]]>=threshold for r in positives),
        negative_total=len(negatives),negative_correct=negative_correct,
        exact_photo_matches=exact,per_class=per_class,
        balanced_presence_score=(recall+specificity)/2)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--weights',type=Path,required=True)
    parser.add_argument('--split',choices=['val','test'],default='test')
    parser.add_argument('--fresh-only',action='store_true')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    manifest=json.loads((ROOT/'ml/condition_training/dataset/round2/manifest.json').read_text(encoding='utf-8'))
    rows=[r for r in manifest['records'] if r['split']==args.split and (r['fresh'] or not args.fresh_only)]
    detector=OnnxDetector(args.weights,threads=2)
    presence_only=set(detector.names.values())=={'visible_damage'}
    cases=[]
    for row in rows:
        with Image.open(row['file']) as raw:
            predictions=detector.predict(ImageOps.exif_transpose(raw).convert('RGB'),.01,20)
        scores=([max((score for _,score,_ in predictions),default=0.)]*3 if presence_only else
                [max((score for cls,score,_ in predictions if cls==c),default=0.) for c in range(3)])
        cases.append({k:row[k] for k in ('file','path','classes','source','group')}|dict(scores=scores,presence_only=presence_only))
    result=dict(weights=str(args.weights),split=args.split,fresh_only=args.fresh_only,
        summary=summarize(cases),cases=cases,classifies_device_type=not presence_only,
        limitations=['Whole-photo damage presence; not precise defect localization.',
            'No verified electrical working/nonworking labels.',
            'Small convenience sample; not general real-world accuracy.',
            'Perceptual/source grouping cannot prove independence of every physical device.'])
    args.output.write_text(json.dumps(result,indent=2))
    print(json.dumps(result['summary'],indent=2))


if __name__=='__main__':main()
