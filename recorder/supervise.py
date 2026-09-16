"""Keep recorder/uploader alive and restart an unresponsive camera process."""
import argparse
from datetime import datetime
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument('--node', default='C:/Program Files/nodejs/node.exe')
parser.add_argument('--directory', default='C:/Users/markh/Documents/Codex/CameraMonitor/recordings')
args = parser.parse_args()
project = Path(__file__).resolve().parent.parent
root = Path(args.directory).resolve()
root.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger('camera-supervisor')
logger.setLevel(logging.INFO)
log = RotatingFileHandler(root.parent / 'supervisor.log', maxBytes=2_000_000, backupCount=3)
log.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
logger.addHandler(log)
stopping = False
def stop(*_):
    global stopping
    stopping = True
signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)

def capture_output(name, process):
    for line in process.stdout:
        logger.info('%s: %s', name, line.rstrip())

commands = {
    'recorder': [sys.executable, '-u', str(project / 'recorder' / 'record.py'), '--directory', str(root)],
    'uploader': [args.node, '--env-file=.env.uploader', str(project / 'scripts' / 'upload.mjs')],
}
children = {}
launched = {}
try:
    while not stopping:
        for name, command in commands.items():
            process = children.get(name)
            if process and process.poll() is None and name == 'recorder':
                heartbeat = root.parent / 'status.json'
                last = max(launched[name], heartbeat.stat().st_mtime if heartbeat.exists() else 0)
                if time.time() - last > 90:
                    logger.error('Recorder heartbeat stale; restarting camera')
                    process.kill(); process.wait(timeout=10)
            if not process or process.poll() is not None:
                if process:
                    logger.warning('%s exited (%s), restarting', name, process.returncode)
                process = subprocess.Popen(command, cwd=project, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding='utf-8', errors='replace', creationflags=subprocess.CREATE_NO_WINDOW,
                    env={**os.environ, 'PYTHONIOENCODING':'utf-8'})
                children[name] = process
                launched[name] = time.time()
                threading.Thread(target=capture_output, args=(name,process), daemon=True).start()
                logger.info('Started %s (PID %s)', name, process.pid)
        time.sleep(5)
finally:
    for process in children.values():
        if process.poll() is None:
            process.terminate()
    for process in children.values():
        try: process.wait(timeout=15)
        except subprocess.TimeoutExpired: process.kill()
