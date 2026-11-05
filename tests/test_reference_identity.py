import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml/device_detection"))
from reference_identity import corroborate_reference, corroborate_uncertain_detection, reference_verification_box


class ReferenceIdentityTests(unittest.TestCase):
    def setUp(self):
        self.box = [0.1, 0.1, 0.9, 0.9]
        self.uncertain = {"status": "uncertain", "label": "laptop", "similarity": 0.27, "margin": 0.003}

    def test_medium_laptop_needs_agreeing_spatial_evidence(self):
        candidate = {"className": "laptop", "score": 0.69, "box": self.box}
        damage = {"className": "damaged_laptop", "score": 0.85, "box": self.box}
        self.assertEqual(corroborate_reference(candidate, [], [damage], self.uncertain)["status"], "accepted")
        self.assertEqual(corroborate_reference(candidate, [], [], self.uncertain)["status"], "uncertain")
        self.assertEqual(corroborate_reference(candidate, [], [{**damage, "box": [0, 0, 0.05, 0.05]}], self.uncertain)["status"], "uncertain")

    def test_two_phone_predictions_do_not_bypass_wallet_rejection(self):
        phone = {"className": "cell phone", "score": 0.95, "box": self.box}
        visual = {"status": "rejected", "label": "wallet", "similarity": 0.3, "margin": 0.02}
        self.assertEqual(corroborate_reference(phone, [phone], [], visual)["status"], "rejected")

    def test_below_threshold_reference_is_not_accepted(self):
        candidate = {"className": "laptop", "score": 0.59, "box": self.box}
        visual = {**self.uncertain, "status": "accepted"}
        self.assertEqual(corroborate_reference(candidate, [candidate], [], visual)["status"], "uncertain")

    def test_phone_verification_keeps_whole_shape_from_overlapping_proposals(self):
        reference = {"className": "cell phone", "score": 0.8, "box": [0.2, 0.3, 0.7, 0.8]}
        custom = {"className": "cell phone", "score": 0.9, "box": [0.1, 0.2, 0.75, 0.9]}
        self.assertEqual(reference_verification_box(reference, [custom]), custom["box"])
        separate = {**custom, "box": [0, 0, 0.05, 0.05]}
        self.assertEqual(reference_verification_box(reference, [separate]), reference["box"])

    def test_uncertain_laptop_is_accepted_only_with_an_agreeing_reference_box(self):
        custom = {"className": "laptop", "score": 0.78, "box": self.box, "verification": self.uncertain}
        reference = {"className": "laptop", "score": 0.7, "box": self.box, "verification": {"status": "accepted", "label": "laptop"}}
        self.assertEqual(corroborate_uncertain_detection(custom, [reference], self.uncertain)["status"], "accepted")
        self.assertEqual(corroborate_uncertain_detection(custom, [reference], self.uncertain)["method"], "trained-detector-consensus")
        # The reference must be verified, overlapping, and of the same class.
        for patch in [{**reference, "verification": {"status": "uncertain", "label": "laptop"}},
                      {**reference, "box": [0, 0, 0.05, 0.05]},
                      {**reference, "className": "television"}]:
            self.assertEqual(corroborate_uncertain_detection(custom, [patch], self.uncertain)["status"], "uncertain")
        self.assertEqual(corroborate_uncertain_detection(custom, [], self.uncertain)["status"], "uncertain")

    def test_phones_and_rejected_visual_labels_never_use_the_consensus_path(self):
        phone = {"className": "cell phone", "score": 0.9, "box": self.box}
        visual = {"status": "uncertain", "label": "cell phone", "similarity": 0.27, "margin": 0.003}
        reference = {"className": "cell phone", "score": 0.9, "box": self.box, "verification": {"status": "accepted", "label": "cell phone"}}
        self.assertEqual(corroborate_uncertain_detection(phone, [reference], visual), visual)
        wallet = {"status": "rejected", "label": "wallet", "similarity": 0.3, "margin": 0.02}
        laptop = {"className": "laptop", "score": 0.78, "box": self.box}
        laptop_reference = {"className": "laptop", "score": 0.7, "box": self.box, "verification": {"status": "accepted", "label": "laptop"}}
        self.assertEqual(corroborate_uncertain_detection(laptop, [laptop_reference], wallet), wallet)

    def test_confident_reference_is_accepted_when_the_visual_check_has_no_rival(self):
        candidate = {"className": "television", "score": 0.74, "box": self.box}
        generic = {"status": "uncertain", "label": "other object", "similarity": 0.24, "margin": 0.005}
        accepted = corroborate_reference(candidate, [], [], generic)
        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(accepted["method"], "reference-detector")
        # Too weak a box, or a real competing object, still fails.
        self.assertEqual(corroborate_reference({**candidate, "score": 0.69}, [], [], generic)["status"], "uncertain")
        monitor = {"status": "rejected", "label": "computer monitor", "similarity": 0.3, "margin": 0.02}
        self.assertEqual(corroborate_reference(candidate, [], [], monitor)["status"], "rejected")

    def test_keypad_phone_consensus_preserves_strong_trained_predictions(self):
        visual = {"status": "uncertain", "label": "cell phone", "similarity": 0.29, "margin": 0.006}
        custom = {"className": "cell phone", "score": 0.92, "box": self.box, "verification": visual}
        reference = {"className": "cell phone", "score": 0.96, "box": self.box}
        self.assertEqual(corroborate_reference(reference, [custom], [], visual)["status"], "accepted")
        self.assertEqual(corroborate_reference({**reference, "score": 0.85}, [custom], [], visual)["status"], "uncertain")
        self.assertEqual(corroborate_reference(reference, [{**custom, "score": 0.85}], [], visual)["status"], "uncertain")
        wallet = {**visual, "status": "rejected", "label": "wallet"}
        self.assertEqual(corroborate_reference(reference, [custom], [], wallet)["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
