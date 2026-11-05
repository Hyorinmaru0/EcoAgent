"""Lightweight YOLO detector backed by ONNX Runtime.

This module implements the small amount of preprocessing and postprocessing
needed for Ultralytics detect exports. It deliberately depends only on
``onnxruntime``, ``numpy``, and ``Pillow`` so the runtime does not need the
much larger PyTorch and Ultralytics packages.

The expected model output is the standard Ultralytics layout
``(1, 4 + classes, anchors)`` with already-sigmoided class scores and no
baked-in NMS (``end2end=False``). Export with ``export_onnx.py``.
"""
import ast

import numpy as np

DEFAULT_IOU_THRESHOLD = 0.7
PAD_COLOR = (114, 114, 114)


def parse_class_names(metadata):
    raw = metadata.get("names")
    if not raw:
        return {}
    try:
        parsed = ast.literal_eval(raw)
    except (ValueError, SyntaxError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {int(key): str(value) for key, value in parsed.items()}


def letterbox(image, size):
    """Resize and pad an RGB image to a square, matching Ultralytics."""
    from PIL import Image

    width, height = image.size
    ratio = min(size / width, size / height)
    new_width = max(1, int(round(width * ratio)))
    new_height = max(1, int(round(height * ratio)))
    resized = image.resize((new_width, new_height), Image.BILINEAR)
    canvas = Image.new("RGB", (size, size), PAD_COLOR)
    dw = (size - new_width) / 2
    dh = (size - new_height) / 2
    left = int(round(dw - 0.1))
    top = int(round(dh - 0.1))
    canvas.paste(resized, (left, top))
    return canvas, ratio, left, top


def _nms(boxes, scores, iou_threshold):
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        index = order[0]
        keep.append(int(index))
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(boxes[index, 0], boxes[rest, 0])
        yy1 = np.maximum(boxes[index, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[index, 2], boxes[rest, 2])
        yy2 = np.minimum(boxes[index, 3], boxes[rest, 3])
        intersection = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        area_index = (boxes[index, 2] - boxes[index, 0]) * (boxes[index, 3] - boxes[index, 1])
        area_rest = (boxes[rest, 2] - boxes[rest, 0]) * (boxes[rest, 3] - boxes[rest, 1])
        union = area_index + area_rest - intersection
        iou = np.divide(intersection, union, out=np.zeros_like(intersection), where=union > 0)
        order = rest[iou <= iou_threshold]
    return keep


def postprocess(output, image_size, ratio, left, top, class_count, conf, max_det, iou):
    """Convert raw ONNX output into normalized ``[x1, y1, x2, y2]`` boxes."""
    predictions = output[0]
    if predictions.ndim != 2:
        raise RuntimeError("The ONNX model returned an unexpected output shape.")
    if predictions.shape[0] == 4 + class_count:
        predictions = predictions.T
    elif predictions.shape[1] != 4 + class_count:
        raise RuntimeError("The ONNX model does not match the expected class count.")

    boxes = predictions[:, :4]
    scores = predictions[:, 4:4 + class_count]
    class_ids = scores.argmax(axis=1)
    confidences = scores[np.arange(scores.shape[0]), class_ids]
    mask = confidences > conf
    boxes = boxes[mask]
    confidences = confidences[mask]
    class_ids = class_ids[mask]
    if not boxes.size:
        return []

    cx, cy, width, height = boxes.T
    xyxy = np.stack(
        (cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2), axis=1
    )
    xyxy[:, [0, 2]] = (xyxy[:, [0, 2]] - left) / ratio
    xyxy[:, [1, 3]] = (xyxy[:, [1, 3]] - top) / ratio
    xyxy[:, [0, 2]] = np.clip(xyxy[:, [0, 2]], 0, image_size[0])
    xyxy[:, [1, 3]] = np.clip(xyxy[:, [1, 3]], 0, image_size[1])

    detections = []
    for class_id in np.unique(class_ids):
        indices = np.flatnonzero(class_ids == class_id)
        for kept in _nms(xyxy[indices], confidences[indices], iou):
            index = indices[kept]
            x1, y1, x2, y2 = xyxy[index]
            detections.append(
                (
                    int(class_id),
                    float(confidences[index]),
                    [
                        round(float(x1) / image_size[0], 6),
                        round(float(y1) / image_size[1], 6),
                        round(float(x2) / image_size[0], 6),
                        round(float(y2) / image_size[1], 6),
                    ],
                )
            )
    detections.sort(key=lambda item: item[1], reverse=True)
    return detections[:max_det]


class OnnxDetector:
    def __init__(self, path, iou=DEFAULT_IOU_THRESHOLD, threads=None):
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = threads or 0
        self.session = ort.InferenceSession(
            str(path), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name
        shape = self.session.get_inputs()[0].shape
        self.input_size = int(shape[2]) if isinstance(shape[2], int) else 640
        self.iou = iou
        self.names = parse_class_names(self.session.get_modelmeta().custom_metadata_map)

    def predict(self, image, conf, max_det):
        letterboxed, ratio, left, top = letterbox(image, self.input_size)
        array = np.asarray(letterboxed, dtype=np.float32) / 255.0
        array = np.transpose(array, (2, 0, 1))[None, ...]
        output = self.session.run(None, {self.input_name: array})[0]
        return postprocess(
            output,
            image.size,
            ratio,
            left,
            top,
            len(self.names),
            conf,
            max_det,
            self.iou,
        )
