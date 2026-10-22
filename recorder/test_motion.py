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



"""Run with python -m unittest discover -s recorder -p test_motion.py."""
import unittest
import cv2
import numpy as np
from motion import MotionDetector


class LightingTests(unittest.TestCase):
    def run_scene(self, moving=False, lighting='none'):
        rng = np.random.default_rng(2)
        base = cv2.GaussianBlur(rng.uniform(30,150,(180,320)).astype(np.float32),(5,5),0)
        for x in range(20,300,40):
            cv2.rectangle(base,(x,30),(x+20,150),120,2)
        y,x = np.mgrid[:180,:320]
        glow = np.exp(-((x-230)**2+(y-80)**2)/6000)
        detector = MotionDetector()
        hits = 0
        for i in range(25):
            frame = base.copy()
            if lighting == 'uniform': frame += i*2
            if lighting == 'local': frame += i*3*glow
            if moving: cv2.rectangle(frame,(10+i*4,60),(40+i*4,110),220,-1)
            frame = cv2.cvtColor(np.clip(frame,0,255).astype(np.uint8),cv2.COLOR_GRAY2BGR)
            hits += detector.update(frame)
        return hits

    def test_uniform_light_is_not_motion(self):
        self.assertEqual(self.run_scene(lighting='uniform'),0)

    def test_monitor_glow_is_not_motion(self):
        self.assertEqual(self.run_scene(lighting='local'),0)

    def test_actual_motion_is_preserved(self):
        self.assertGreater(self.run_scene(moving=True),0)

    def test_motion_during_light_change_is_preserved(self):
        self.assertGreater(self.run_scene(moving=True,lighting='local'),0)
