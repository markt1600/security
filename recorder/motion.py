"""Brightness-compensated frame differencing. No audio or external services."""
import cv2
import numpy as np


class MotionDetector:
    def __init__(self, minimum_area=0.0025, threshold=22):
        self.previous = None
        self.minimum_area = minimum_area
        self.threshold = threshold
        self.consecutive = 0

    def update(self, frame):
        small = cv2.resize(frame, (320, 180))
        grey = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0).astype(np.float32)
        # Remove uniform brightness and contrast shifts before comparing frames.
        normalized = (grey - np.median(grey)) / max(float(np.std(grey)), 10.0) * 40.0
        previous, self.previous = self.previous, normalized
        if previous is None:
            return False
        mask = (np.abs(normalized - previous) > self.threshold).astype(np.uint8) * 255
        if np.count_nonzero(mask) / mask.size > 0.65:
            self.consecutive = 0  # sudden scene/exposure transition; let it settle
            return False
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        mask = cv2.dilate(mask, None, iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        moving = any(cv2.contourArea(c) >= mask.size * self.minimum_area for c in contours)
        self.consecutive = self.consecutive + 1 if moving else 0
        return self.consecutive >= 3
