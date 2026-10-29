"""Test trained weights on a separate photo or folder of photos."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--weights', required=True, help='Path to the trained best.pt file')
    parser.add_argument('--source', required=True, help='Path to a photo, video, or image folder')
    parser.add_argument('--conf', type=float, default=0.25)
    args = parser.parse_args()
    weights = Path(args.weights).expanduser().resolve()
    source = Path(args.source).expanduser().resolve()
    if not weights.is_file():
        parser.error(f'Weights file not found: {weights}')
    if not source.exists():
        parser.error(f'Source not found: {source}')
    if not 0 < args.conf <= 1:
        parser.error('--conf must be between 0 and 1.')

    from ultralytics import YOLO
    results = YOLO(str(weights)).predict(
        source=str(source), device='cpu', conf=args.conf, save=True,
        project=str(Path(__file__).resolve().parent / 'predictions'),
        name='test', exist_ok=False, stream=True,
    )
    for result in results:
        print(f'{Path(result.path).name}: {len(result.boxes)} detection(s)')
        print('Saved to:', result.save_dir)


if __name__ == '__main__':
    main()
