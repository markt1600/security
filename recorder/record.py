"""C922 recorder: five-second pre-roll, five-second quiet tail, ready bundles."""
import argparse
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
import uuid

import cv2
import imageio_ffmpeg
from motion import MotionDetector
from faces import extract_faces, ANALYSIS_VERSION

parser = argparse.ArgumentParser()
parser.add_argument('--directory', default='C:/Users/markh/Documents/Codex/CameraMonitor/recordings')
parser.add_argument('--camera', type=int, default=0)
parser.add_argument('--seconds', type=int, default=0, help='Optional bounded test run')
parser.add_argument('--test-event', action='store_true', help='Record one clearly labeled setup verification clip')
parser.add_argument('--minimum-area', type=float, default=0.0025)
args = parser.parse_args()
root = Path(args.directory).resolve()
root.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger('camera')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(root.parent / 'recorder.log', maxBytes=2_000_000, backupCount=3)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(handler)
logger.addHandler(logging.StreamHandler())

# Windows releases the byte-range lock even after a crash or a forced restart.
import msvcrt
lock = open(root / '.recorder.lock', 'a+b')
lock.seek(0)
if not lock.read(1):
    lock.write(b'0'); lock.flush()
lock.seek(0)
try:
    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
except OSError:
    raise SystemExit('The camera recorder is already running.')

FPS, PRE, POST, MAX_CLIP = 10, 5, 5, 120
stop = False
def terminate(*_):
    global stop
    stop = True
signal.signal(signal.SIGINT, terminate)
signal.signal(signal.SIGTERM, terminate)
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
pool = ThreadPoolExecutor(max_workers=1)
jobs = []

def status(state, **extra):
    payload = {'state': state, 'updatedAt': datetime.now(timezone.utc).isoformat(), **extra}
    temp = root.parent / 'status.tmp'
    temp.write_text(json.dumps(payload), encoding='utf-8')
    temp.replace(root.parent / 'status.json')

def finish(base, meta):
    avi = Path(str(base) + '.recording.avi')
    output = Path(str(base) + '.encoding.mp4')
    # Failed encodes retain the AVI and pending metadata for recovery on restart.
    result = subprocess.run([ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(avi), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)],
        capture_output=True, timeout=300, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('FFmpeg encoding failed')
    output.replace(str(base) + '.mp4')
    try:
        meta.update(extract_faces(str(base) + '.mp4',base))
        logger.info('Local face analysis: %s, %s highlight(s)',meta['id'],len(meta['faces']))
    except Exception:
        logger.exception('Face analysis failed; preserving the video')
        meta.update(analysisVersion=ANALYSIS_VERSION,faceAnalysis='failed',faces=[])
    ready = Path(str(base) + '.event.tmp')
    ready.write_text(json.dumps(meta), encoding='utf-8')
    ready.replace(str(base) + '.event.json')
    avi.unlink(missing_ok=True)
    Path(str(base) + '.pending.json').unlink(missing_ok=True)
    logger.info('Saved detection %s (%.1fs)', meta['id'], meta['durationSeconds'])

def queue_finish(base, meta):
    Path(str(base) + '.pending.json').write_text(json.dumps(meta), encoding='utf-8')
    jobs.append(pool.submit(finish, base, meta))

for pending in root.glob('*/*.pending.json'):
    base = Path(str(pending)[:-len('.pending.json')])
    try:
        meta = json.loads(pending.read_text(encoding='utf-8'))
        if Path(str(base) + '.recording.avi').exists():
            jobs.append(pool.submit(finish, base, meta))
    except Exception:
        logger.exception('Could not recover a pending clip')

started = time.monotonic()
writer = None
cap = None
logger.info('Recorder starting: %s; %sfps; pre=%ss, post=%ss', root, FPS, PRE, POST)
try:
    while not stop and (not args.seconds or time.monotonic() - started < args.seconds):
        if cap is None:
            status('connecting')
            cap = cv2.VideoCapture(args.camera, cv2.CAP_DSHOW)
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap.set(cv2.CAP_PROP_FPS, 30)
            if not cap.isOpened():
                cap.release(); cap = None
                status('camera_unavailable'); logger.warning('Camera unavailable; retrying in 5 seconds')
                time.sleep(5); continue
            ring = deque()
            detector = MotionDetector(minimum_area=args.minimum_area)
            warmup = time.monotonic() + PRE
            next_frame = time.monotonic()
            heartbeat = 0
        now = time.monotonic()
        if now < next_frame:
            time.sleep(min(next_frame - now, .1)); continue
        next_frame = max(next_frame + 1 / FPS, now)
        ok, frame = cap.read()
        if not ok:
            if writer:
                writer.release(); writer = None
                meta['durationSeconds'] = frame_count / FPS
                meta['interrupted'] = True
                queue_finish(base, meta)
            cap.release(); cap = None
            status('camera_unavailable'); time.sleep(2); continue
        now = time.monotonic()
        frame = cv2.resize(frame, (1280, 720))
        moving = detector.update(frame)
        if args.test_event and warmup <= now < warmup + 0.5:
            moving = True
        ring.append((now, frame.copy()))
        while ring and now - ring[0][0] > PRE + 1 / FPS:
            ring.popleft()
        if moving and now >= warmup:
            last_motion = now
            if writer is None:
                if shutil.disk_usage(root).free < 2 * 1024**3:
                    status('disk_low'); logger.error('Less than 2GiB free; recording paused'); time.sleep(10); continue
                when = datetime.now(timezone.utc)
                folder = root / when.astimezone().strftime('%Y-%m-%d')
                folder.mkdir(exist_ok=True)
                event_id = when.strftime('%Y%m%dT%H%M%SZ_') + uuid.uuid4().hex[:8]
                base = folder / event_id
                if not cv2.imwrite(str(base) + '.jpg', frame):
                    raise RuntimeError('Could not save detection photo')
                writer = cv2.VideoWriter(str(base) + '.recording.avi', cv2.VideoWriter_fourcc(*'MJPG'), FPS, (1280,720))
                if not writer.isOpened():
                    raise RuntimeError('Could not open recording file')
                frame_count = 0
                # Resample against real capture timestamps. A slow camera read
                # duplicates frames rather than shortening the five-second lead-in.
                clip_origin = now - PRE
                buffered = list(ring)
                position = 0
                for sample in range(PRE * FPS + 1):
                    at = clip_origin + sample / FPS
                    while position + 1 < len(buffered) and buffered[position + 1][0] <= at:
                        position += 1
                    writer.write(buffered[position][1]); frame_count += 1
                meta = {'id':event_id, 'detectedAt':when.isoformat(), 'camera':'C922 · Setup test' if args.test_event else 'C922 · Home', 'durationSeconds':0}
                clip_started = now
                logger.info('Movement detected: %s', event_id)
                continue  # the current frame was already included in the pre-roll
        if writer:
            expected_frames = int((now - clip_origin) * FPS) + 1
            while frame_count < expected_frames:
                writer.write(frame); frame_count += 1
            if now - last_motion >= POST or now - clip_started >= MAX_CLIP - PRE:
                writer.release(); writer = None
                meta['durationSeconds'] = frame_count / FPS
                queue_finish(base, meta)
        if now >= heartbeat:
            status('recording' if writer else ('warming_up' if now < warmup else 'watching'), pendingEncodes=sum(not j.done() for j in jobs))
            heartbeat = now + 10
            remaining = []
            for job in jobs:
                if job.done():
                    try: job.result()
                    except Exception: logger.exception('Clip encoding failed; retained pending clip for restart recovery')
                else: remaining.append(job)
            jobs = remaining
except Exception:
    logger.exception('Recorder failed')
    status('error')
    raise
finally:
    if writer:
        writer.release()
        meta['durationSeconds'] = frame_count / FPS
        meta['interrupted'] = True
        queue_finish(base, meta)
    if cap: cap.release()
    pool.shutdown(wait=True)
    status('stopped')
    lock.close()
