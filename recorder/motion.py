"""Brightness-compensated frame differencing. No audio or external services."""
import cv2
import numpy as np


class MotionDetector:
    def __init__(self, minimum_area=0.0025, threshold=22):
        self.previous = None
        self.previous_grey = None
        self.minimum_area = minimum_area
        self.threshold = threshold
        self.consecutive = 0

    def update(self, frame):
        small = cv2.resize(frame, (320, 180))
        grey = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0).astype(np.float32)
        # Remove uniform brightness and contrast shifts before comparing frames.
        normalized = (grey - np.median(grey)) / max(float(np.std(grey)), 10.0) * 40.0
        previous, self.previous = self.previous, normalized
        previous_grey, self.previous_grey = self.previous_grey, grey
        if previous is None:
            return False
        mask = (np.abs(normalized - previous) > self.threshold).astype(np.uint8) * 255
        if np.count_nonzero(mask) / mask.size > 0.65:
            self.consecutive = 0  # sudden scene/exposure transition; let it settle
            return False
        # A local brightness/contrast fit explains illumination without assuming
        # the entire room brightens uniformly. Require unexplained detail in
        # both directions so newly visible texture in a dark room is not motion.
        def residual(source, target):
            mean_s = cv2.boxFilter(source, -1, (31, 31))
            mean_t = cv2.boxFilter(target, -1, (31, 31))
            variance = cv2.boxFilter(source * source, -1, (31, 31)) - mean_s * mean_s
            covariance = cv2.boxFilter(source * target, -1, (31, 31)) - mean_s * mean_t
            gain = np.clip(covariance / np.maximum(variance, 4.0), 0.0, 8.0)
            return np.abs(target - (mean_t + gain * (source - mean_s)))
        detail = np.minimum(residual(previous_grey, grey), residual(grey, previous_grey))
        mask[detail < 8.0] = 0
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        mask = cv2.dilate(mask, None, iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        moving = any(cv2.contourArea(c) >= mask.size * self.minimum_area for c in contours)
        self.consecutive = self.consecutive + 1 if moving else 0
        return self.consecutive >= 3
