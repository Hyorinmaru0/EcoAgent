"""Train a practice damaged-TV detector using the existing CPU environment."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--imgsz', type=int, default=416)
    parser.add_argument('--batch', type=int, default=4)
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    if min(args.epochs, args.imgsz, args.batch, args.threads) < 1:
        parser.error('All settings must be positive integers.')

    import torch
    from ultralytics import YOLO

    root = Path(__file__).resolve().parent
    torch.set_num_threads(args.threads)
    print('Practice dataset: frames from one video; validation is not independent.')
    print('Device: CPU. Pretrained weights download on the first run.')
    model = YOLO('yolo26n.pt')
    model.train(
        data=str(root / 'dataset' / 'data.yaml'),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device='cpu',
        workers=0,
        cache=False,
        amp=False,
        seed=42,
        project=str(root / 'runs'),
        name='smoke_test' if args.epochs == 1 else 'damaged_tv',
        exist_ok=False,
        save=True,
        plots=True,
    )
    print('\nTraining finished. Best weights:', model.trainer.best)
    print('Validate on separate TVs and recording sessions before reporting real-world performance.')


if __name__ == '__main__':
    from multiprocessing import freeze_support
    freeze_support()
    main()
