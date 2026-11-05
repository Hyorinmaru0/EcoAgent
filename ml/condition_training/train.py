"""GPU experiment. Writes candidate weights only; never replaces production models."""
from pathlib import Path
import argparse
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=15)
    parser.add_argument('--data', type=Path)
    parser.add_argument('--model', type=Path)
    parser.add_argument('--name', default='visible-damage-v1')
    parser.add_argument('--batch', type=int, default=16)
    parser.add_argument('--workers', type=int, default=0)
    parser.add_argument('--imgsz', type=int, default=416)
    parser.add_argument('--lr0', type=float, default=None)
    args = parser.parse_args()
    import torch
    from ultralytics import YOLO
    root = Path(__file__).resolve().parent
    if not torch.cuda.is_available():
        raise SystemExit('CUDA unavailable; refusing a silent CPU training fallback.')
    torch.set_num_threads(4)
    # Start from general COCO pretraining, not a damage model that saw old test splits.
    data = args.data or root / 'dataset/data.yaml'
    model = YOLO(str(args.model or root.parents[1] / 'yolo11n.pt'))
    settings = dict(optimizer='AdamW', lr0=args.lr0) if args.lr0 else {}
    model.train(data=str(data), epochs=args.epochs, imgsz=args.imgsz,
                batch=args.batch, device=0, workers=args.workers, cache=False, amp=True, seed=42,
                patience=10, project=str(root / 'runs'), name=args.name,
                exist_ok=False, plots=True, save=True, save_period=1, **settings)
    best = YOLO(str(model.trainer.best))
    metrics = best.val(data=str(data), split='test', imgsz=args.imgsz,
                       batch=16, device=0, workers=0, project=str(root / 'runs'), name='test-' + args.name)
    manifest_path = data.parent / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.is_file() else {}
    heldout_tv = any(r.get('split') == 'test' and r.get('fresh') and 2 in r.get('classes', []) for r in manifest.get('records', []))
    report = {'weights': str(model.trainer.best), 'metrics': metrics.results_dict,
              'per_class': {best.names[int(c)]: {'precision':float(metrics.box.p[i]),
                  'recall':float(metrics.box.r[i]), 'map50':float(metrics.box.ap50[i])}
                  for i,c in enumerate(metrics.box.ap_class_index)},
              'held_out_tv_examples_present': heldout_tv, 'independent_physical_devices_verified': False,
              'automatic_deployment':False}
    (root / (args.name + '-result.json')).write_text(json.dumps(report, indent=2))
    best.export(format='onnx', imgsz=args.imgsz, opset=17, simplify=False, dynamic=False)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    from multiprocessing import freeze_support
    freeze_support()
    main()
