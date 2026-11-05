import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml/device_detection"))
from visual_verifier import identity_verification_status


class IdentityVerificationTests(unittest.TestCase):
    def test_corroborated_laptop_is_not_rejected_for_close_monitor_similarity(self):
        self.assertEqual(identity_verification_status("laptop", 0.79, "laptop", 0.28, 0.007), "accepted")

    def test_laptop_rule_does_not_relax_phone_wallet_checks(self):
        self.assertEqual(identity_verification_status("cell phone", 0.94, "cell phone", 0.31, 0.003), "uncertain")
        self.assertEqual(identity_verification_status("cell phone", 0.94, "wallet", 0.31, 0.02), "rejected")

    def test_weak_or_conflicting_laptop_evidence_still_fails(self):
        self.assertEqual(identity_verification_status("laptop", 0.71, "laptop", 0.28, 0.007), "uncertain")
        self.assertEqual(identity_verification_status("laptop", 0.79, "laptop", 0.24, 0.007), "uncertain")
        self.assertEqual(identity_verification_status("laptop", 0.99, "keyboard", 0.35, 0.1), "rejected")

    def test_inconclusive_generic_labels_do_not_veto_a_detected_device(self):
        # A dark, switched-off TV reads as "other object" with a low score.
        self.assertEqual(identity_verification_status("television", 0.74, "other object", 0.2416, 0.0056), "uncertain")
        self.assertEqual(identity_verification_status("television", 0.74, "room", 0.25, 0.01), "uncertain")
        # A confident generic verdict and real competing objects still reject.
        self.assertEqual(identity_verification_status("television", 0.74, "other object", 0.4, 0.05), "rejected")
        self.assertEqual(identity_verification_status("television", 0.74, "computer monitor", 0.3, 0.02), "rejected")


if __name__ == "__main__":
    unittest.main()
