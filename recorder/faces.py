"""Local YuNet face highlights. Spatial tracking only; no identity recognition."""
from pathlib import Path
import math
import cv2
import numpy as np

MODEL = Path(__file__).parent / 'models' / 'yunet.onnx'
SAMPLE_FPS = 2
MAX_FACES = 4
ANALYSIS_VERSION = 1


def overlap(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[0]+a[2], b[0]+b[2]), min(a[1]+a[3], b[1]+b[3])
    intersection = max(0, x2-x1) * max(0, y2-y1)
    return intersection / max(1, a[2]*a[3]+b[2]*b[3]-intersection)


def candidate(frame, box, confidence, timestamp):
    x, y, w, h = map(float, box)
    height, width = frame.shape[:2]
    if min(w,h) < 48 or confidence < .90:
        return None
    left, top = max(0,int(x)), max(0,int(y))
    right, bottom = min(width,int(x+w)), min(height,int(y+h))
    if min(right-left,bottom-top) < 48:
        return None
    face = frame[top:bottom,left:right]
    grey = cv2.cvtColor(face,cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(cv2.resize(grey,(128,128)),cv2.CV_64F).var())
    brightness = float(grey.mean())
    if sharpness < 18 or not 25 < brightness < 235:
        return None
    # A little context around the face, bounded by the original frame.
    margin = max(w,h) * .18
    crop = frame[max(0,int(y-margin)):min(height,int(y+h+margin)), max(0,int(x-margin)):min(width,int(x+w+margin))].copy()
    scale = min(1, 320 / max(crop.shape[:2]))
    if scale < 1:
        crop = cv2.resize(crop,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
    quality = min(math.sqrt(w*h),300) * math.log1p(sharpness) * confidence
    return {'crop':crop,'quality':quality,'atSeconds':round(timestamp,2),'confidence':round(float(confidence),4),'box':(x,y,w,h)}


def extract_faces(video_path, base_path):
    """Save up to four sharp crops after local analysis of a completed video."""
    if not MODEL.is_file():
        raise FileNotFoundError('YuNet model is missing')
    # Bound CPU use in the recorder's background worker.
    cv2.setNumThreads(2)
    detector = cv2.FaceDetectorYN.create(str(MODEL),'',(640,360),.90,.3,1000)
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError('Could not open clip for face analysis')
    fps = capture.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(fps) or fps <= 0:
        capture.release()
        raise RuntimeError('Invalid clip frame rate')
    step = max(1,round(fps/SAMPLE_FPS))
    tracks = []
    frame_number = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            timestamp = frame_number / fps
            analyze = frame_number % step == 0
            frame_number += 1
            if not analyze:
                continue
            height,width = frame.shape[:2]
            scale = min(1,640/max(width,height))
            small = cv2.resize(frame,None,fx=scale,fy=scale) if scale < 1 else frame
            detector.setInputSize((small.shape[1],small.shape[0]))
            _, detections = detector.detect(small)
            used = set()
            for detection in [] if detections is None else detections:
                box = detection[:4] / scale
                crop = candidate(frame,box,float(detection[-1]),timestamp)
                if crop is None:
                    continue
                matches = [(overlap(track['box'],box),i) for i,track in enumerate(tracks)
                           if i not in used and timestamp-track['last'] <= 1.5]
                score,index = max(matches,default=(0,-1))
                if score < .15:
                    if len(tracks) >= 256:
                        continue  # bounded memory for very busy clips
                    index = len(tracks)
                    tracks.append({'box':box,'last':timestamp,'observations':0,'best':crop})
                track = tracks[index]
                track.update(box=box,last=timestamp,observations=track['observations']+1)
                if crop['quality'] > track['best']['quality']:
                    track['best'] = crop
                used.add(index)
    finally:
        capture.release()
    chosen = sorted((t['best'] for t in tracks if t['observations'] >= 2),key=lambda c:c['quality'],reverse=True)[:MAX_FACES]
    faces = []
    for index,crop in enumerate(chosen,1):
        face_id = f'face-{index}'
        destination = Path(f'{base_path}.{face_id}.jpg')
        temporary = Path(f'{base_path}.{face_id}.tmp.jpg')
        if not cv2.imwrite(str(temporary),crop['crop'],[cv2.IMWRITE_JPEG_QUALITY,92]):
            raise RuntimeError('Could not save face crop')
        temporary.replace(destination)
        faces.append({'id':face_id,'atSeconds':crop['atSeconds'],'width':crop['crop'].shape[1],
                      'height':crop['crop'].shape[0],'confidence':crop['confidence']})
    return {'analysisVersion':ANALYSIS_VERSION,'faceAnalysis':'complete','faces':faces}
