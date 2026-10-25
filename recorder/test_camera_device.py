import unittest
from camera_device import select_camera
class CameraSelectionTests(unittest.TestCase):
    def test_reordering(self):
        self.assertEqual(select_camera(['icspring camera','icspring camera','c922 Pro Stream Webcam'],'c922 Pro Stream Webcam'),2)
        self.assertEqual(select_camera(['c922 Pro Stream Webcam','icspring camera'],'c922 Pro Stream Webcam'),0)
    def test_missing_or_ambiguous_fails_closed(self):
        for devices in [['icspring camera'],['c922 Pro Stream Webcam']*2]:
            with self.assertRaises(RuntimeError): select_camera(devices,'c922 Pro Stream Webcam')
