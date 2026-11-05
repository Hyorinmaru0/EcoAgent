"""Verify crop geometry and that unsupported/unverified objects are never zoomed."""
import sys
import unittest
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml/tv_training"))
from infer import predict_damage_on_devices


class FakeDamageModel:
    names = {0: "damaged_phone"}

    def predict(self, image, conf, max_det):
        self.size = image.size
        return [(0, 0.9, [0, 0, 1, 1])]


class DamageCropTests(unittest.TestCase):
    def setUp(self):
        self.image = Image.new("RGB", (1000, 1000))
        self.device = {"className": "cell phone", "score": 0.9, "box": [0.2, 0.2, 0.8, 0.8], "verification": {"status": "accepted", "label": "cell phone"}}

    def test_crop_boxes_are_mapped_back_to_original_photo(self):
        model = FakeDamageModel()
        detections = predict_damage_on_devices(model, self.image, [self.device])
        self.assertEqual(detections[0]["box"], [0.152, 0.152, 0.848, 0.848])
        self.assertEqual(model.size, (696, 696))

    def test_unverified_wallet_and_weak_identities_are_skipped(self):
        for patch in [{"verification": {"status": "rejected", "label": "wallet"}}, {"verification": {}}, {"score": 0.6}]:
            self.assertEqual(predict_damage_on_devices(FakeDamageModel(), self.image, [{**self.device, **patch}]), [])

    def test_presence_scores_remain_bound_to_the_verified_device(self):
        model = FakeDamageModel()
        result = predict_damage_on_devices(model, self.image, [self.device], match_device_kind=True)
        self.assertEqual(result[0]['deviceBox'], self.device['box'])
        self.assertEqual(model.size, (600, 600), 'Presence crops must not include a neighboring item via padding')
        reference = {**self.device, 'score': 0.65, 'origin': 'reference-detector'}
        self.assertTrue(predict_damage_on_devices(model, self.image, [reference], match_device_kind=True))
        wallet = {**self.device, 'className': 'wallet', 'verification': {'status': 'accepted', 'label': 'wallet'}}
        self.assertEqual(predict_damage_on_devices(model, self.image, [wallet], match_device_kind=True), [])
        laptop = {**self.device, 'className': 'laptop', 'verification': {'status': 'accepted', 'label': 'laptop'}}
        self.assertEqual(predict_damage_on_devices(FakeDamageModel(), self.image, [laptop], match_device_kind=True), [])

    def test_binary_damage_keeps_the_identity_from_the_verified_detector(self):
        model = FakeDamageModel()
        model.names = {0: 'visible_damage'}
        result = predict_damage_on_devices(model, self.image, [self.device], match_device_kind=True)
        self.assertEqual(result[0]['className'], 'visible_damage')
        self.assertEqual(result[0]['deviceClassName'], 'cell phone')
        self.assertEqual(result[0]['deviceBox'], self.device['box'])


if __name__ == "__main__":
    unittest.main()
