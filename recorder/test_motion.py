import unittest
import cv2
import numpy as np
from motion import MotionDetector


class MotionTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(4)
        self.scene = rng.integers(40, 150, (180,320,3), dtype=np.uint8)
        self.scene = cv2.GaussianBlur(self.scene, (7,7), 0)
    def test_stationary_and_uniform_light_are_ignored(self):
        detector = MotionDetector()
        for _ in range(6): self.assertFalse(detector.update(self.scene))
        for amount in (15, 25, 40, 30, 10, 0):
            self.assertFalse(detector.update(cv2.add(self.scene, np.full_like(self.scene, amount))))
    def test_moving_object_is_detected(self):
        detector = MotionDetector()
        detector.update(self.scene)
        detected = []
        for x in range(20, 100, 10):
            frame = self.scene.copy()
            cv2.rectangle(frame, (x,40), (x+35,95), (220,220,220), -1)
            detected.append(detector.update(frame))
        self.assertTrue(any(detected))

if __name__ == '__main__': unittest.main()
