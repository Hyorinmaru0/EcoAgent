"""Select a checkpoint using fresh VALIDATION photos only, never the fresh test set."""
import json
import shutil
from pathlib import Path

from evaluate_round2 import ROOT, summarize


def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--run',default='visible-damage-round2')
    parser.add_argument('--output-name',default='round2-candidate')
    args=parser.parse_args()
    import torch
    from ultralytics import YOLO
    from ultralytics.utils.torch_utils import strip_optimizer
    torch.set_num_threads(4)
    base=ROOT/'ml/condition_training'
    manifest=json.loads((base/'dataset/round2/manifest.json').read_text(encoding='utf-8'))
    rows=[r for r in manifest['records'] if r['fresh'] and r['split']=='val']
    paths=[r['file'] for r in rows]
    run=base/'runs'/args.run
    results=[]
    for checkpoint in sorted((run/'weights').glob('epoch*.pt')):
        model=YOLO(str(checkpoint))
        presence_only=set(model.names.values())=={'visible_damage'}
        predictions=list(model.predict(paths,imgsz=640,device=0,batch=16,conf=.01,max_det=20,verbose=False,stream=True))
        cases=[]
        for row,prediction in zip(rows,predictions,strict=True):
            scores=[0.,0.,0.]
            for box in prediction.boxes:
                cls=int(box.cls.item());scores[cls]=max(scores[cls],float(box.conf.item()))
            if presence_only:scores=[scores[0]]*3
            cases.append(dict(classes=row['classes'],scores=scores,presence_only=presence_only))
        summary=summarize(cases)
        eligible=(summary['negative_correct']/max(1,summary['negative_total'])>=.90
            and summary['positive_detected']/max(1,summary['positive_total'])>=.60
            and all(value['detected']/max(1,value['total'])>=.50 for value in summary['per_class'].values()))
        # Prefer a low false-alarm checkpoint, then compare balanced presence scores.
        rank=(eligible,summary['balanced_presence_score'],summary['negative_correct'])
        results.append(dict(checkpoint=str(checkpoint),summary=summary,rank=rank))
        print(checkpoint.name,json.dumps(summary),flush=True)
        del model
        torch.cuda.empty_cache()
    selected=max(results,key=lambda r:tuple(r['rank']))
    out=base/'weights'/args.output_name;out.mkdir(parents=True,exist_ok=True)
    shutil.copy2(selected['checkpoint'],out/'best.pt')
    strip_optimizer(str(out/'best.pt'))
    YOLO(str(out/'best.pt')).export(format='onnx',imgsz=640,opset=17,simplify=False,dynamic=False)
    result=dict(selection_split='fresh-validation-only',threshold=.5,selected=selected,
                candidates=results,test_used_for_selection=False,automatic_deployment=False)
    (base/(args.output_name+'-selection.json')).write_text(json.dumps(result,indent=2))
    print('SELECTED',selected['checkpoint'],flush=True)


if __name__=='__main__':
    from multiprocessing import freeze_support
    freeze_support();main()
